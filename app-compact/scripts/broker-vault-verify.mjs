import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_BROKER_URL = 'https://travel-expense-credential-broker.ftjdfr.workers.dev';
const DEFAULT_ORIGIN = 'https://travel-expense-compact.netlify.app';
const DEFAULT_SESSION_FILE = path.resolve(process.cwd(), '.broker-vault-session.local.json');
const SESSION_HEADER = 'X-Travel-Session';
const SUPABASE_AUTH_HEADER = 'X-Supabase-Auth';

const expectMissingSession = process.argv.includes('--expect-missing-session')
  || process.env.COMPACT_BROKER_VAULT_EXPECT_MISSING === '1';
const brokerUrl = (process.env.COMPACT_BROKER_URL || DEFAULT_BROKER_URL).replace(/\/+$/, '');
const origin = process.env.COMPACT_BROKER_ORIGIN || DEFAULT_ORIGIN;
const sessionFile = process.env.COMPACT_BROKER_VAULT_SESSION_FILE || DEFAULT_SESSION_FILE;
const googleDiagnosticModel = process.env.COMPACT_BROKER_GOOGLE_DIAGNOSTIC_MODEL || 'gemini-2.5-flash';

const sensitivePatterns = [
  /sk-[A-Za-z0-9_-]{12,}/,
  /ntn_[A-Za-z0-9]{12,}/,
  /secret_[A-Za-z0-9]{12,}/,
  /AIza[0-9A-Za-z_-]{12,}/,
  /Bearer\s+[A-Za-z0-9._-]+/i,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
];

const accountLimitPatterns = [
  /usage limit/i,
  /quota/i,
  /billing cycle/i,
  /rate limit/i,
  /too many requests/i,
  /insufficient.*credit/i,
  /payment required/i,
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
  if (expectMissingSession) {
    return {
      mode: 'missing',
      session: '',
      supabaseToken: '',
      expiresAt: 0,
      source: 'forced-missing-session',
    };
  }
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

function responseMessage(result) {
  return redactedError(result?.data?.error || result?.data?.message || '');
}

function responseOutcome(result) {
  const message = responseMessage(result);
  if (result.status === 429 || accountLimitPatterns.some((pattern) => pattern.test(message))) {
    return 'account-limited';
  }
  if (result.status === 401 || result.status === 403) return 'auth-blocked';
  if (result.status >= 500) return 'provider-error';
  return 'unexpected-status';
}

function summarizeFailedCall(pathname, result) {
  return {
    path: pathname,
    status: result.status,
    ok: result.data?.ok === true,
    outcome: responseOutcome(result),
    message: responseMessage(result) || undefined,
  };
}

async function collectCall(checks, failures, label, pathname, expectedStatuses, run, summarizeSuccess) {
  try {
    const result = await run();
    if (expectedStatuses.includes(result.status)) {
      checks.push(summarizeSuccess(result));
      return;
    }
    const failure = summarizeFailedCall(pathname, result);
    checks.push(failure);
    failures.push({ label, ...failure });
  } catch (error) {
    const failure = {
      label,
      path: pathname,
      outcome: 'request-error',
      message: redactedError(error),
    };
    checks.push(failure);
    failures.push(failure);
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

async function main() {
  const auth = await loadAuthInput();
  const checks = [];
  const failures = [];

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
    return;
  }

  if (auth.mode === 'broker-session' && auth.expiresAt && auth.expiresAt <= Date.now()) {
    throw new Error('Local broker vault session is expired; refresh it before running authenticated provider proof.');
  }

  await collectCall(
    checks,
    failures,
    'credentials status',
    '/credentials/status',
    [200],
    () => requestJson('/credentials/status', undefined, auth),
    (result) => ({
      path: '/credentials/status',
      status: result.status,
      broker: result.data?.broker || 'unknown',
      providers: summarizeProviders(result.data),
    }),
  );

  await collectCall(
    checks,
    failures,
    'credentials test-all',
    '/credentials/test-all',
    [200],
    () => requestJson('/credentials/test-all', { method: 'POST', body: {} }, auth),
    (result) => ({
      path: '/credentials/test-all',
      status: result.status,
      providers: summarizeProviders(result.data),
    }),
  );

  await collectCall(
    checks,
    failures,
    'weather forecast',
    '/weather/forecast',
    [200],
    () => requestJson('/weather/forecast', {
      method: 'POST',
      body: { lat: 33.50972, lon: 126.52194, days: 1 },
    }, auth),
    (result) => ({
      path: '/weather/forecast',
      status: result.status,
      source: result.data?.data?.source || result.data?.data?.provider || 'unknown',
      hasHourly: Array.isArray(result.data?.data?.hourly?.time),
      hasFeelsLike: Array.isArray(result.data?.data?.hourly?.apparent_temperature),
    }),
  );

  for (const providerPath of ['/kimi/json', '/google/json', '/mimo/json']) {
    await collectCall(
      checks,
      failures,
      providerPath,
      providerPath,
      [200],
      () => requestJson(providerPath, {
        method: 'POST',
        body: {
          prompt: 'Return only JSON: {"ok":true,"provider":"smoke"}',
          kind: 'test',
        },
      }, auth),
      (result) => summarizeAi(providerPath, result),
    );
  }

  await collectCall(
    checks,
    failures,
    'google diagnostic model',
    '/google/json',
    [200],
    () => requestJson('/google/json', {
      method: 'POST',
      body: {
        prompt: 'Return only JSON: {"ok":true,"provider":"google-diagnostic"}',
        kind: 'test',
        model: googleDiagnosticModel,
      },
    }, auth),
    (result) => ({
      ...summarizeAi('/google/json', result),
      diagnosticModel: googleDiagnosticModel,
    }),
  );

  checks.push({
    path: '/notion/request',
    status: 'skipped-by-design',
    reason: 'Global Notion database id is intentionally not exposed by /credentials/status; /credentials/test-all covers token and database permission without printing ids.',
  });

  const accountLimited = failures.length > 0 && failures.every((failure) => failure.outcome === 'account-limited');
  console.log(JSON.stringify({
    brokerUrl,
    origin,
    mode: auth.mode,
    source: auth.source,
    status: failures.length ? 'blocked' : 'passed',
    summary: failures.length
      ? accountLimited
        ? 'authenticated broker-vault proof reached provider paths, but provider account quota/rate limits blocked completion; no fallback calls were made'
        : 'authenticated broker-vault proof found provider/account/path failures; no secrets were printed and no fallback calls were made'
      : 'authenticated broker-vault provider proof passed with redacted output; no provider response bodies or tokens were printed',
    checks,
    failures,
  }, null, 2));

  if (failures.length) process.exit(2);
}

main().catch((error) => {
  console.error(JSON.stringify({
    brokerUrl,
    origin,
    status: 'failed',
    noSecretsPrinted: true,
    error: redactedError(error),
  }, null, 2));
  process.exit(1);
});
