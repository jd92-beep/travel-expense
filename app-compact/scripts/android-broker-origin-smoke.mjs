const DEFAULT_BROKER_URL = 'https://travel-expense-credential-broker.ftjdfr.workers.dev';
const DEFAULT_ORIGINS = ['http://localhost', 'https://localhost', 'capacitor://localhost'];
const brokerUrl = (process.env.COMPACT_BROKER_URL || DEFAULT_BROKER_URL).replace(/\/+$/, '');
const origins = (process.env.ANDROID_BROKER_ORIGINS || DEFAULT_ORIGINS.join(','))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const strict = process.env.ANDROID_BROKER_ORIGIN_STRICT === '1';

const sensitivePatterns = [
  /sk-[A-Za-z0-9_-]{12,}/,
  /ntn_[A-Za-z0-9]{12,}/,
  /secret_[A-Za-z0-9]{12,}/,
  /AIza[0-9A-Za-z_-]{12,}/,
  /Bearer\s+[A-Za-z0-9._-]+/i,
];

function assertNoSensitiveText(label, text) {
  for (const pattern of sensitivePatterns) {
    if (pattern.test(text)) throw new Error(`${label} response contained sensitive-looking text`);
  }
}

async function checkOrigin(origin) {
  const response = await fetch(`${brokerUrl}/credentials/status`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'GET',
    },
  });
  const body = await response.text();
  assertNoSensitiveText(`OPTIONS ${origin}`, body);
  const allowOrigin = response.headers.get('access-control-allow-origin') || '';
  const allowMethods = response.headers.get('access-control-allow-methods') || '';
  return {
    origin,
    status: response.status,
    allowOrigin,
    allowMethods,
    allowed: response.status === 204 && (allowOrigin === origin || allowOrigin === '*'),
  };
}

const health = await fetch(`${brokerUrl}/health`);
const healthText = await health.text();
assertNoSensitiveText('/health', healthText);

const checks = [];
for (const origin of origins) {
  try {
    checks.push(await checkOrigin(origin));
  } catch (error) {
    checks.push({
      origin,
      status: 0,
      allowOrigin: '',
      allowMethods: '',
      allowed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const allowedOrigins = checks.filter((check) => check.allowed).map((check) => check.origin);
if (strict && allowedOrigins.length === 0) {
  throw new Error(`No Android WebView origin passed broker CORS preflight: ${JSON.stringify(checks)}`);
}

console.log(JSON.stringify({
  brokerUrl,
  mode: strict ? 'strict' : 'report-only',
  summary: allowedOrigins.length
    ? 'at least one candidate Android WebView origin is accepted by the broker'
    : 'no candidate Android WebView origin is accepted yet; use emulator logs before adding a new origin',
  healthStatus: health.status,
  allowedOrigins,
  checks,
}, null, 2));
