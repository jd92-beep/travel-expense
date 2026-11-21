import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AwsClient } from 'aws4fetch';
import pg from 'pg';
import { createGateway } from '../gateway.mjs';
import { createIdentityBridge } from '../identity.mjs';

const port = Number(process.env.PORT ?? 4242);
const origin = process.env.RENDER_EXTERNAL_URL ?? `http://127.0.0.1:${port}`;
const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const postgrestPort = 49356;
const postgrestOrigin = `http://127.0.0.1:${postgrestPort}`;
const html = await readFile(new URL('./index.html', import.meta.url));
const css = await readFile(new URL('./preview.css', import.meta.url));
const js = await readFile(new URL('../dist/browser.js', import.meta.url));

const { PREVIEW_NEON_AUTH_URL: neonAuthUrl, PREVIEW_SUPABASE_URL: supabaseUrl,
  PREVIEW_SUPABASE_PUBLISHABLE_KEY: publishableKey, PREVIEW_DB_URL: databaseUrl, PREVIEW_LEDGER_ID: allowedLedger,
  PREVIEW_S3_URL: storageEndpoint, PREVIEW_S3_BUCKET: storageBucket, PREVIEW_S3_REGION: region,
  PREVIEW_S3_KEY_ID: accessKeyId, PREVIEW_S3_SECRET: secretAccessKey } = process.env;

let backend;
let sidecar;
let pool;
const previewConfigured = [neonAuthUrl, supabaseUrl, publishableKey, databaseUrl, allowedLedger,
  storageEndpoint, storageBucket, region, accessKeyId, secretAccessKey].every(Boolean);

if (previewConfigured) {
  try {
    if (!uuid.test(allowedLedger)) throw new Error('Invalid preview account');
    const connection = new URL(databaseUrl);
    if (connection.protocol !== 'postgresql:' || connection.username !== 'travel_preview_runtime' ||
        !/^ep-[a-z\d-]+\.(?:c-\d+\.)?[a-z\d-]+\.(?:aws|azure)\.neon\.(?:tech|build)$/.test(connection.hostname) ||
        connection.searchParams.get('sslmode') !== 'verify-full') throw new Error('Invalid preview database');
    const storage = new URL(storageEndpoint);
    if (storage.protocol !== 'https:' || !storage.hostname.endsWith('.neon.tech') || storage.username || storage.password ||
        storage.port || storage.pathname !== '/' || storage.search || storage.hash || storageBucket !== 'receipt-photos-rehearsal') {
      throw new Error('Invalid preview storage');
    }
    pool = new pg.Pool({ connectionString: connection.href, max: 2, query_timeout: 8000, connectionTimeoutMillis: 8000 });
    pool.on('error', () => console.warn('Preview database pool lost a connection'));

    async function linker(sql, params) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query('set local role travel_account_linker');
        const { rows } = await client.query(sql, params);
        await client.query('commit');
        return rows[0]?.ledger_id ?? null;
      } catch (error) {
        await client.query('rollback').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }

    const identity = createIdentityBridge({
      neonAuthUrl, supabaseUrl, publishableKey,
      async resolve(sub) {
        const ledgerId = await linker('select migration_auth.resolve_neon_account($1) as ledger_id', [sub]);
        return ledgerId === allowedLedger ? ledgerId : null;
      },
      async link(ledgerId, sub, verifiedEmail) {
        if (ledgerId !== allowedLedger) return null;
        return linker('select migration_auth.link_neon_account($1,$2,$3) as ledger_id', [ledgerId, sub, verifiedEmail]);
      },
    });
    const s3 = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region, retries: 0 });
    const photos = {
      async get(path) {
        const url = new URL(`/${storageBucket}/${path}`, storage);
        const response = await s3.fetch(url, { redirect: 'error', signal: AbortSignal.timeout(12000) });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('Photo unavailable');
        return { mime: response.headers.get('content-type'), body: response.body };
      },
    };
    const postgrestSecret = randomBytes(32).toString('hex');
    const gateway = createGateway({ identities: identity, photos, postgrestOrigin, postgrestSecret, origins: [origin] });
    sidecar = spawn(process.env.PREVIEW_POSTGREST_BINARY || './.runtime/postgrest', [], {
      stdio: 'ignore',
      env: { PATH: process.env.PATH, DYLD_LIBRARY_PATH: process.env.DYLD_LIBRARY_PATH,
        PGRST_SERVER_HOST: '127.0.0.1', PGRST_SERVER_PORT: String(postgrestPort), PGRST_DB_URI: connection.href,
        PGRST_DB_SCHEMAS: 'public', PGRST_DB_POOL: '3', PGRST_DB_CHANNEL_ENABLED: 'false',
        PGRST_JWT_SECRET: postgrestSecret, PGRST_JWT_AUD: 'travel-expense-db', PGRST_JWT_ROLE_CLAIM_KEY: '.db_role',
      },
    });
    sidecar.on('error', () => { backend = undefined; console.error('Preview database proxy could not start'); });
    sidecar.on('exit', () => { backend = undefined; console.error('Preview database proxy stopped'); });
    backend = gateway;
  } catch {
    console.error('Preview backend configuration was rejected');
  }
}

const authRoutes = new Map([['/identity/v1/account', 'GET'], ['/identity/v1/link', 'POST']]);
const photoRoute = /^\/storage\/v1\/object\/sign\/receipt-photos\/[\da-f-]{36}\/[a-z\d_.-]{1,220}$/i;
const extraConnections = backend ? [new URL(neonAuthUrl).origin, new URL(supabaseUrl).origin] : [];
const security = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self' ${extraConnections.join(' ')}; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
};

function file(body, type) {
  return new Response(body, { headers: { 'content-type': type } });
}

async function route(request) {
  const { pathname } = new URL(request.url);
  if (request.method === 'GET') {
    if (pathname === '/') return file(html, 'text/html; charset=utf-8');
    if (pathname === '/preview.css') return file(css, 'text/css; charset=utf-8');
    if (pathname === '/browser.js') return file(js, 'application/javascript; charset=utf-8');
    if (pathname === '/health') return Response.json({ online: true });
    if (pathname === '/ready') {
      const db = backend && await fetch(postgrestOrigin + '/trips?select=id&limit=1', { signal: AbortSignal.timeout(3000) }).catch(() => null);
      if (db?.status !== 401) return Response.json({ ready: false }, { status: 503 });
      return Response.json({ neonAuthUrl, supabaseUrl, publishableKey });
    }
  }
  if (!backend) return Response.json({ message: 'The test is being prepared' }, { status: 503 });
  if (request.method === authRoutes.get(pathname) || (photoRoute.test(pathname) && ['GET', 'POST'].includes(request.method))) {
    return backend(request);
  }
  if (request.method !== 'GET' || pathname !== '/preview/ledger') return new Response(null, { status: 404 });
  const internal = (path, method = 'GET') => backend(new Request(origin + '/rest/v1/' + path, {
    method, headers: { authorization: request.headers.get('authorization') ?? '', prefer: 'count=exact' },
  }));
  const [trips, receipts, photos] = await Promise.all([
    internal('trips?select=name&order=name&limit=100'),
    internal('receipts?select=id&deleted_at=is.null&limit=1', 'HEAD'),
    internal('receipt_photos?select=storage_path&limit=1'),
  ]);
  for (const response of [trips, receipts, photos]) {
    if (!response.ok) return new Response(null, { status: response.status });
  }
  const count = response => Number(response.headers.get('content-range')?.split('/').pop());
  const receiptCount = count(receipts);
  const photoCount = count(photos);
  if (!Number.isSafeInteger(receiptCount) || !Number.isSafeInteger(photoCount)) return new Response(null, { status: 503 });
  const samplePath = (await photos.json())[0]?.storage_path;
  return Response.json({ trips: await trips.json(), receiptCount, photoCount, samplePath });
}

const server = createServer(async (incoming, outgoing) => {
  try {
    if (!incoming.url?.startsWith('/') || incoming.url.startsWith('//')) {
      outgoing.writeHead(400, security).end();
      return;
    }
    const body = /^(GET|HEAD)$/.test(incoming.method) ? undefined : Readable.toWeb(incoming);
    const request = new Request(origin + incoming.url, {
      method: incoming.method, headers: incoming.headers, body, duplex: 'half',
    });
    const response = await route(request);
    outgoing.writeHead(response.status, { ...Object.fromEntries(response.headers), ...security });
    if (response.body) await pipeline(Readable.fromWeb(response.body), outgoing);
    else outgoing.end();
  } catch {
    if (!outgoing.headersSent) outgoing.writeHead(503, security).end();
    else outgoing.destroy();
  }
});
server.listen(port, '0.0.0.0', () => console.log('Travel Expense hosted preview listening'));
process.once('SIGTERM', () => {
  sidecar?.kill();
  pool?.end().catch(() => {});
  server.close();
});
