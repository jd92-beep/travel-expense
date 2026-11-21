import { SignJWT, jwtVerify } from 'jose';

const dataPath = /^\/rest\/v1\/(?:rpc\/)?[a-z][a-z\d_]*$/;
const identityPath = '/identity/v1/account';
const linkPath = '/identity/v1/link';
const requestHeaders = ['accept', 'content-type', 'prefer', 'range', 'range-unit'];
const responseHeaders = ['content-type', 'content-range', 'range-unit', 'preference-applied'];
const methods = ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE'];
const storagePath = '/storage/v1/object';
const bucket = 'receipt-photos';
const photoKey = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\/[a-z\d_.-]{1,220}$/i;
const photoLifetime = 900;
const photoSize = 6000000;
const photoMimes = new Set(['image/jpeg', 'image/png', 'image/webp']);

function photoMime(buffer) {
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

async function bytes(request, limit) {
  if (Number(request.headers.get('content-length')) > limit) return null;
  const reader = request.body?.getReader();
  if (!reader) return undefined;
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks);
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

export function createGateway({ identities, postgrestOrigin, postgrestSecret, origins, photos, fetcher = fetch }) {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(postgrestOrigin) ||
      typeof postgrestSecret !== 'string' || new TextEncoder().encode(postgrestSecret).byteLength < 32 ||
      !Array.isArray(origins) || !origins.length) throw new Error('Gateway configuration is incomplete');
  const secret = new TextEncoder().encode(postgrestSecret);
  async function scopedDatabaseToken(account) {
    return new SignJWT({ role: 'authenticated', db_role: 'travel_web_user', email: account.email })
      .setSubject(account.ledgerId).setAudience('travel-expense-db')
      .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('20s').sign(secret);
  }
  const signedPath = storagePath + '/sign/' + bucket;
  const uploadPath = storagePath + '/' + bucket + '/';
  return async function handle(request) {
    const origin = request.headers.get('origin');
    const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin', 'X-Content-Type-Options': 'nosniff' });
    const json = (data, status = 200) => Response.json(data, { status, headers });
    if (origin && !origins.includes(origin)) return json({ message: 'Origin not allowed' }, 403);
    if (origin) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Access-Control-Expose-Headers', responseHeaders.join(', '));
    }
    const url = new URL(request.url);
    const isData = dataPath.test(url.pathname);
    const signing = url.pathname === signedPath || url.pathname.startsWith(signedPath + '/');
    const uploading = url.pathname.startsWith(uploadPath);
    const isPhoto = photos && (signing || uploading);
    if (!isData && !isPhoto && url.pathname !== identityPath && url.pathname !== linkPath) return json({ message: 'Unknown route' }, 404);
    if (request.method === 'OPTIONS') {
      headers.set('Access-Control-Allow-Methods', methods.join(', '));
      headers.set('Access-Control-Allow-Headers', [...requestHeaders, 'authorization', 'apikey', 'x-client-info', 'x-upsert', 'cache-control'].join(', '));
      return new Response(null, { status: 204, headers });
    }

    if (isPhoto && signing && request.method === 'GET') {
      const path = url.pathname.slice(signedPath.length + 1);
      if (!photoKey.test(path)) return json({ message: 'Photo unavailable' }, 404);
      try {
        await jwtVerify(url.searchParams.get('token') || '', secret, {
          algorithms: ['HS256'], audience: 'travel-expense-photo', subject: path,
          requiredClaims: ['iat', 'exp'], maxTokenAge: photoLifetime,
        });
      } catch {
        return json({ message: 'Invalid or expired photo link' }, 403);
      }
      try {
        const photo = await photos.get(path);
        if (!photo || !photoMimes.has(photo.mime)) return json({ message: 'Photo unavailable' }, 404);
        headers.set('Content-Type', photo.mime);
        headers.set('Cache-Control', 'private, no-store');
        return new Response(photo.body, { headers });
      } catch {
        return json({ message: 'Photo storage is temporarily unavailable' }, 503);
      }
    }

    const token = request.headers.get('authorization')?.match(/^Bearer ([\w.-]{1,8192})$/i)?.[1];
    if (!token) return json({ message: 'Sign-in required' }, 401);
    try {
      const account = await identities.account(token);
      if (!account) return json({ message: 'Sign-in expired' }, 401);
      if (url.pathname === linkPath) {
        if (request.method !== 'POST') return json({ message: 'Unsupported method' }, 405);
        const body = await bytes(request, 16384);
        if (body === null) return json({ message: 'Request too large' }, 413);
        let legacyToken;
        try { ({ legacyToken } = JSON.parse(body?.toString() || '{}')); }
        catch { return json({ message: 'Invalid account link request' }, 400); }
        const ledgerId = await identities.link({ neonToken: token, legacyToken });
        return ledgerId ? json({ ledgerId }) : json({ message: 'Verify both accounts' }, 403);
      }
      if (!account.ledgerId) return json({ message: 'Link your original account to continue', code: 'ACCOUNT_LINK_REQUIRED' }, 409);
      if (url.pathname === identityPath) {
        return request.method === 'GET' ? json(account) : json({ message: 'Unsupported method' }, 405);
      }
      if (isPhoto && signing && request.method === 'POST') {
        const input = await bytes(request, 32768);
        if (input === null) return json({ message: 'Request too large' }, 413);
        let body;
        try { body = JSON.parse(input?.toString() || '{}'); }
        catch { return json({ message: 'Invalid signing request' }, 400); }
        const scalar = url.pathname !== signedPath;
        const paths = scalar ? [url.pathname.slice(signedPath.length + 1)] : body?.paths;
        const expiresIn = body?.expiresIn;
        if (!Array.isArray(paths) || paths.length > 100 || !paths.every(path => typeof path === 'string' && photoKey.test(path)) ||
            !Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > photoLifetime) {
          return json({ message: 'Invalid photo path or lifetime' }, 400);
        }
        if (!paths.length) return json([]);
        const query = new URLSearchParams({
          select: 'storage_path', storage_bucket: 'eq.' + bucket, storage_path: 'in.(' + paths.join(',') + ')',
        });
        const visible = await fetcher(postgrestOrigin + '/receipt_photos?' + query, {
          headers: new Headers({ authorization: 'Bearer ' + await scopedDatabaseToken(account) }),
          signal: AbortSignal.timeout(10000), redirect: 'error',
        });
        if (!visible.ok) return json({ message: 'Photo access is temporarily unavailable' }, 503);
        const allowed = new Set((await visible.json()).map(row => row.storage_path));
        const result = await Promise.all(paths.map(async path => {
          if (!allowed.has(path)) return { path, signedURL: null, error: 'Photo unavailable' };
          const ticket = await new SignJWT({}).setSubject(path).setAudience('travel-expense-photo')
            .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(expiresIn + 's').sign(secret);
          return { path, signedURL: '/object/sign/' + bucket + '/' + path + '?token=' + ticket, error: null };
        }));
        return scalar && result[0].error ? json({ message: result[0].error }, 404) : json(scalar ? result[0] : result);
      }
      if (isPhoto && uploading && request.method === 'POST') {
        const path = url.pathname.slice(uploadPath.length);
        if (!photoKey.test(path) || !path.startsWith(account.ledgerId + '/')) {
          return json({ message: 'Upload is outside your account' }, 403);
        }
        const body = await bytes(request, photoSize);
        if (body === null) return json({ message: 'Photo is too large' }, 413);
        const mime = body?.length ? photoMime(body) : null;
        if (!mime || request.headers.get('content-type') !== mime) return json({ message: 'Unsupported photo type' }, 415);
        await photos.put(path, body, mime, request.headers.get('x-upsert') === 'true');
        return json({ Key: bucket + '/' + path });
      }
      if (isPhoto) return json({ message: 'Unsupported photo operation' }, 405);
      if (!methods.includes(request.method)) return json({ message: 'Unsupported method' }, 405);
      if (url.pathname === '/rest/v1/rpc/delete_own_user_account') {
        // The ledger and Neon Auth need a coordinated account deletion.
        return json({ message: 'Account deletion is unavailable in this preview' }, 503);
      }
      const noBody = request.method === 'GET' || request.method === 'HEAD';
      const body = noBody ? undefined : await bytes(request, 2000000);
      if (body === null) return json({ message: 'Request too large' }, 413);
      const upstreamHeaders = new Headers({ authorization: 'Bearer ' + await scopedDatabaseToken(account) });
      for (const header of requestHeaders) {
        if (request.headers.has(header)) upstreamHeaders.set(header, request.headers.get(header));
      }
      const upstream = await fetcher(postgrestOrigin + url.pathname.slice('/rest/v1'.length) + url.search, {
        method: request.method, headers: upstreamHeaders, body, signal: AbortSignal.timeout(20000), redirect: 'error',
      });
      for (const header of responseHeaders) {
        if (upstream.headers.has(header)) headers.set(header, upstream.headers.get(header));
      }
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch (error) {
      if (error?.code === '23505') return json({ message: 'Account is already linked' }, 409);
      return json({ message: 'Cloud data is temporarily unavailable' }, 503);
    }
  };
}
