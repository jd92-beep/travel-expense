import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const brokerUrl = (process.env.BROKER_URL || 'https://travel-expense-credential-broker.ftjdfr.workers.dev').replace(/\/+$/, '');
const origin = process.env.BROKER_ORIGIN || 'https://travel-expense-compact.vercel.app';

function redact(text) {
  return String(text || '')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[redacted-key]')
    .replace(/ntn_[A-Za-z0-9]{12,}/g, '[redacted-token]')
    .replace(/secret_[A-Za-z0-9]{12,}/g, '[redacted-token]')
    .replace(/AIza[0-9A-Za-z_-]{12,}/g, '[redacted-key]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .slice(-1200);
}

async function run(label, command, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: process.cwd(),
      timeout: options.timeout || 30_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return {
      label,
      status: 'passed',
      stdout: options.keepOutput ? redact(stdout) : undefined,
      stderr: options.keepOutput ? redact(stderr) : undefined,
    };
  } catch (error) {
    return {
      label,
      status: 'failed',
      code: error?.code ?? null,
      message: redact(error?.message || error),
      stdout: options.keepOutput ? redact(error?.stdout) : undefined,
      stderr: options.keepOutput ? redact(error?.stderr) : undefined,
    };
  }
}

async function liveJson(pathname, init = {}) {
  const response = await fetch(`${brokerUrl}${pathname}`, {
    method: init.method || 'GET',
    headers: {
      Origin: origin,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { parseError: true, text: redact(text) };
  }
  return { path: pathname, status: response.status, data };
}

const source = await fs.readFile('src/index.js', 'utf8');
const sourceHasMimoRoute = source.includes("url.pathname === '/mimo/json'");
const checks = [];

checks.push({
  name: 'source mimo route',
  status: sourceHasMimoRoute ? 'passed' : 'failed',
});

checks.push(await run('node syntax check', 'npm', ['run', 'check']));
checks.push(await run('worker self-test', 'npm', ['run', 'self-test']));
checks.push(await run('wrangler deploy dry-run', 'npx', ['wrangler', 'deploy', '--dry-run', '--outdir', '/tmp/travel-expense-credential-broker-dry-run']));
checks.push(await run('wrangler whoami', 'npx', ['wrangler', 'whoami'], { keepOutput: true }));

const health = await liveJson('/health');
checks.push({
  name: 'live health',
  status: health.status === 200 && health.data?.service === 'travel-expense-credential-broker' ? 'passed' : 'failed',
  httpStatus: health.status,
  version: health.data?.version,
});

const liveMimo = await liveJson('/mimo/json', {
  method: 'POST',
  body: { prompt: 'redacted smoke ping', kind: 'smoke' },
});
checks.push({
  name: 'live mimo route unauthenticated guard',
  status: liveMimo.status === 401 ? 'passed' : 'failed',
  httpStatus: liveMimo.status,
  expected: '401 Session missing when route is deployed',
  observed: liveMimo.data?.error || liveMimo.data?.message || 'unknown',
});

const failed = checks.filter((check) => check.status !== 'passed');
const authFailed = checks.find((check) => check.label === 'wrangler whoami' && check.status !== 'passed');
const routeDrift = sourceHasMimoRoute && liveMimo.status === 404;

console.log(JSON.stringify({
  brokerUrl,
  origin,
  status: failed.length ? 'blocked' : 'passed',
  summary: failed.length
    ? routeDrift
      ? 'source includes /mimo/json but live worker does not; deploy is blocked until Wrangler auth/account configuration is fixed'
      : 'credential broker deploy preflight found issues'
    : 'credential broker source, dry-run, auth, and live route checks passed',
  noSecretsPrinted: true,
  blockers: {
    wranglerAccount: authFailed ? 'wrangler whoami failed; set CLOUDFLARE_ACCOUNT_ID or use a token that can list the target account' : undefined,
    liveMimoRoute: routeDrift ? 'live /mimo/json returns 404 while source contains the route' : undefined,
  },
  checks,
}, null, 2));

if (failed.length) process.exit(2);
