import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_BROKER_URL = 'https://travel-expense-credential-broker.ftjdfr.workers.dev';
const DEFAULT_ORIGIN = 'https://travel-expense-compact.vercel.app';
const DEFAULT_SESSION_FILE = path.resolve(process.cwd(), '.broker-vault-session.local.json');
const SESSION_HEADER = 'X-Travel-Session';
const SUPABASE_AUTH_HEADER = 'X-Supabase-Auth';

const expectMissingSession = process.argv.includes('--expect-missing-session')
  || process.env.COMPACT_BROKER_VAULT_EXPECT_MISSING === '1';
const brokerUrl = (process.env.COMPACT_BROKER_URL || DEFAULT_BROKER_URL).replace(/\/+$/, '');
const origin = process.env.COMPACT_BROKER_ORIGIN || DEFAULT_ORIGIN;
const sessionFile = process.env.COMPACT_BROKER_VAULT_SESSION_FILE || DEFAULT_SESSION_FILE;

const sensitivePatterns = [
  /sk-[A-Za-z0-9_-]{12,}/,
  /ntn_[A-Za-z0-9]{12,}/,
  /secret_[A-Za-z0-9]{12,}/,
  /AIza[0-9A-Za-z_-]{12,}/,
  /Bearer\s+[A-Za-z0-9._-]+/i,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
];

function assertNoSensitiveText(label, text) {
  for (const pattern of sensitivePatterns) {
    if (pattern.test(text)) {
      throw new Error(`${label} response contained sensitive-looking text`);
    }
  }
}

function redactedError(error) {
  return String(error?.message || error || 'Unknown error')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[redacted-key]')
    .replace(/ntn_[A-Za-z0-9]{12,}/g, '[redacted-token]')
    .replace(/secret_[A-Za-z0-9]{12,}/g, '[redacted-token]')
    .replace(/AIza[0-9A-Za-z_-]{12,}/g, '[redacted-key]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g, '[redacted-session]');
}

async function readJsonFile(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    assertNoSensitiveText('session file path', filePath);
    return JSON.parse(text);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(`Unable to read local broker vault session file: ${redactedError(error)}`);
  }
}

async function loadAuthInput() {
  const fileInput = await readJsonFile(sessionFile);
  const session = process.env.COMPACT_BROKER_VAULT_SESSION
    || fileInput?.credentialSession
    || fileInput?.session
    || '';
  const supabaseToken = process.env.COMPACT_BROKER_VAULT_SUPABASE_TOKEN
    || fileInput?.supabaseAccessToken
    || fileInput?.supabaseToken
    || '';
  const expiresAt = Number(process.env.COMPACT_BROKER_VAULT_SESSION_EXPIRES_AT
    || fileInput?.credentialSessionExpiresAt
    || fileInput?.expiresAt
    || 0);
  return {
    mode: session ? 'broker-session' : supabaseToken ? 'supabase-token' : 'missing',
    session,
    supabaseToken,
    expiresAt,
    source: fileInput ? path.basename(sessionFile) : 'environment',
  };
}

async function requestJson(pathname, init = {}, auth = {}) {
  const headers = {
    Origin: origin,
    ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
  };
  if (auth.session) headers[SESSION_HEADER] = auth.session;
  if (auth.supabaseToken) headers[SUPABASE_AUTH_HEADER] = `Bearer ${auth.supabaseToken}`;

  const response = await fetch(`${brokerUrl}${pathname}`, {
    method: init.method || (init.body === undefined ? 'GET' : 'POST'),
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  assertNoSensitiveText(pathname, text);
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${pathname} returned non-JSON body with status ${response.status}`);
  }
  return { status: response.status, data };
}

function expectStatus(label, result, allowedStatuses) {
  if (!allowedStatuses.includes(result.status)) {
    throw new Error(`${label} expected ${allowedStatuses.join('/')} but got ${result.status}: ${redactedError(JSON.stringify(result.data))}`);
  }
}

function summarizeProviders(data) {
  return (data?.providers || []).map((provider) => ({
    provider: provider.provider,
    status: provider.status || 'unknown',
    updatedAt: typeof provider.updatedAt === 'number' ? provider.updatedAt : undefined,
    lastTestedAt: typeof provider.lastTestedAt === 'number' ? provider.lastTestedAt : undefined,
    message: provider.message ? redactedError(provider.message) : undefined,
  }));
}

function summarizeAi(pathname, result) {
  const payload = result.data?.data;
  return {
    path: pathname,
    status: result.status,
    ok: result.data?.ok === true,
    provider: typeof payload?.provider === 'string' ? payload.provider : undefined,
    hasData: payload !== undefined && payload !== null,
    keys: payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 8) : [],
  };
}

const auth = await loadAuthInput();
const checks = [];

if (auth.mode === 'missing') {
  const guard = await requestJson('/credentials/status');
  expectStatus('missing-session guard', guard, [401]);
  const errorText = String(guard.data?.error || '');
  if (!/session/i.test(errorText)) {
    throw new Error(`missing-session guard returned unexpected error: ${redactedError(JSON.stringify(guard.data))}`);
  }
  const result = {
    brokerUrl,
    origin,
    mode: 'missing-session',
    status: expectMissingSession ? 'passed' : 'blocked',
    summary: expectMissingSession
      ? 'fail-closed guard passed; authenticated provider calls were not executed'
      : 'missing local broker vault session; authenticated provider calls were not executed',
    next: `Create ignored ${path.basename(DEFAULT_SESSION_FILE)} or set COMPACT_BROKER_VAULT_SESSION / COMPACT_BROKER_VAULT_SUPABASE_TOKEN locally, then rerun npm run smoke:broker-vault.`,
    checks: [{ path: '/credentials/status', status: guard.status, guard: errorText }],
  };
  console.log(JSON.stringify(result, null, 2));
  if (!expectMissingSession) process.exit(2);
  process.exit(0);
}

if (auth.mode === 'broker-session' && auth.expiresAt && auth.expiresAt <= Date.now()) {
  throw new Error('Local broker vault session is expired; refresh it before running authenticated provider proof.');
}

const status = await requestJson('/credentials/status', undefined, auth);
expectStatus('credentials status', status, [200]);
checks.push({
  path: '/credentials/status',
  status: status.status,
  broker: status.data?.broker || 'unknown',
  providers: summarizeProviders(status.data),
});

const testAll = await requestJson('/credentials/test-all', { method: 'POST', body: {} }, auth);
expectStatus('credentials test-all', testAll, [200]);
checks.push({
  path: '/credentials/test-all',
  status: testAll.status,
  providers: summarizeProviders(testAll.data),
});

const weather = await requestJson('/weather/forecast', {
  method: 'POST',
  body: { lat: 33.50972, lon: 126.52194, days: 1 },
}, auth);
expectStatus('weather forecast', weather, [200]);
checks.push({
  path: '/weather/forecast',
  status: weather.status,
  source: weather.data?.data?.source || weather.data?.data?.provider || 'unknown',
  hasHourly: Array.isArray(weather.data?.data?.hourly?.time),
  hasFeelsLike: Array.isArray(weather.data?.data?.hourly?.apparent_temperature),
});

for (const providerPath of ['/kimi/json', '/google/json', '/mimo/json']) {
  const result = await requestJson(providerPath, {
    method: 'POST',
    body: {
      prompt: 'Return only JSON: {"ok":true,"provider":"smoke"}',
      kind: 'test',
    },
  }, auth);
  expectStatus(providerPath, result, [200]);
  checks.push(summarizeAi(providerPath, result));
}

const notion = await requestJson('/notion/request', {
  method: 'POST',
  body: { path: '/databases/redacted/query', method: 'POST', body: { page_size: 1 } },
}, auth);
expectStatus('notion request', notion, [200]);
checks.push({
  path: '/notion/request',
  status: notion.status,
  hasData: notion.data?.data !== undefined,
  shape: notion.data?.data && typeof notion.data.data === 'object' ? Object.keys(notion.data.data).slice(0, 8) : [],
});

console.log(JSON.stringify({
  brokerUrl,
  origin,
  mode: auth.mode,
  source: auth.source,
  status: 'passed',
  summary: 'authenticated broker-vault provider proof passed with redacted output; no provider response bodies or tokens were printed',
  checks,
}, null, 2));
