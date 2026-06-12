const DEFAULT_BROKER_URL = 'https://travel-expense-credential-broker.ftjdfr.workers.dev';
const DEFAULT_ORIGIN = 'https://travel-expense-compact.netlify.app';
const brokerUrl = (process.env.COMPACT_BROKER_URL || DEFAULT_BROKER_URL).replace(/\/+$/, '');
const origin = process.env.COMPACT_BROKER_ORIGIN || DEFAULT_ORIGIN;

const sensitivePatterns = [
  /sk-[A-Za-z0-9_-]{12,}/,
  /ntn_[A-Za-z0-9]{12,}/,
  /secret_[A-Za-z0-9]{12,}/,
  /AIza[0-9A-Za-z_-]{12,}/,
  /Bearer\s+[A-Za-z0-9._-]+/i,
];

function assertNoSensitiveText(label, text) {
  for (const pattern of sensitivePatterns) {
    if (pattern.test(text)) {
      throw new Error(`${label} response contained sensitive-looking text`);
    }
  }
}

async function requestJson(path, init = {}) {
  const response = await fetch(`${brokerUrl}${path}`, {
    method: init.method || 'GET',
    headers: {
      Origin: origin,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await response.text();
  assertNoSensitiveText(path, text);
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${path} returned non-JSON body with status ${response.status}`);
  }
  return { status: response.status, data };
}

function expectStatus(label, result, allowedStatuses) {
  if (!allowedStatuses.includes(result.status)) {
    throw new Error(`${label} expected ${allowedStatuses.join('/')} but got ${result.status}: ${JSON.stringify(result.data)}`);
  }
}

const checks = [];

const health = await requestJson('/health', { headers: {} });
expectStatus('health', health, [200]);
if (health.data?.ok !== true || health.data?.service !== 'travel-expense-credential-broker') {
  throw new Error(`health returned unexpected payload: ${JSON.stringify(health.data)}`);
}
checks.push({ path: '/health', status: health.status, ok: health.data.ok, service: health.data.service, version: health.data.version });

const optionsResponse = await fetch(`${brokerUrl}/credentials/status`, {
  method: 'OPTIONS',
  headers: {
    Origin: origin,
    'Access-Control-Request-Method': 'GET',
  },
});
expectStatus('cors preflight', { status: optionsResponse.status, data: null }, [204]);
checks.push({
  path: 'OPTIONS /credentials/status',
  status: optionsResponse.status,
  corsOrigin: optionsResponse.headers.get('access-control-allow-origin') || '',
});

const protectedChecks = [
  { path: '/notion/request', method: 'POST', body: { path: '/databases/redacted/query', method: 'POST', body: {} } },
  { path: '/kimi/json', method: 'POST', body: { prompt: 'redacted smoke ping', kind: 'smoke' } },
  { path: '/google/json', method: 'POST', body: { prompt: 'redacted smoke ping', kind: 'smoke' } },
  { path: '/mimo/json', method: 'POST', body: { prompt: 'redacted smoke ping', kind: 'smoke' } },
  { path: '/weather/forecast', method: 'POST', body: { lat: 35.1815, lon: 136.9066, days: 1 } },
  { path: '/credentials/status', method: 'GET' },
  { path: '/credentials/test-all', method: 'POST', body: {} },
];

for (const check of protectedChecks) {
  const result = await requestJson(check.path, check);
  expectStatus(check.path, result, [401]);
  const errorText = String(result.data?.error || '');
  if (!/session/i.test(errorText)) {
    throw new Error(`${check.path} expected a redacted session guard error, got: ${JSON.stringify(result.data)}`);
  }
  checks.push({ path: check.path, status: result.status, guard: errorText });
}

console.log(JSON.stringify({
  brokerUrl,
  origin,
  summary: 'live broker health and no-session auth guards passed; provider vault calls were not executed',
  checks,
}, null, 2));
