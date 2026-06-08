import { spawn } from 'node:child_process';

const fullGate = process.argv.includes('--full') || process.env.COMPACT_FULL_GATE === '1';
const defaultBaseUrl = 'http://127.0.0.1:8903/travel-expense/compact/';
const baseUrl = process.env.COMPACT_GATE_BASE_URL || defaultBaseUrl;

const baseSteps = [
  ['typecheck', ['npm', 'run', 'typecheck']],
  ['final navigation smoke', ['npm', 'run', 'smoke:final-nav']],
  ['mobile layout smoke', ['npm', 'run', 'smoke:mobile-layout']],
  ['contact sheet smoke', ['npm', 'run', 'smoke:contact-sheet']],
  ['live broker preflight', ['npm', 'run', 'smoke:broker-live']],
  ['security scan', ['npm', 'run', 'security:scan']],
  ['production build', ['npm', 'run', 'build']],
];

const fullSteps = [
  ['dashboard smoke', ['npm', 'run', 'smoke:dashboard']],
  ['scan smoke', ['npm', 'run', 'smoke:scan']],
  ['timeline smoke', ['npm', 'run', 'smoke:timeline']],
  ['history smoke', ['npm', 'run', 'smoke:history']],
  ['weather smoke', ['npm', 'run', 'smoke:weather']],
  ['stats smoke', ['npm', 'run', 'smoke:stats']],
  ['settings smoke', ['npm', 'run', 'smoke:settings']],
  ['auth broker smoke', ['npm', 'run', 'smoke:auth-broker']],
  ['ai routing smoke', ['npm', 'run', 'smoke:ai-routing']],
  ['trip intelligence smoke', ['npm', 'run', 'smoke:trip-intelligence']],
];

const allowedEnvNames = new Set([
  'CI',
  'COMPACT_BROKER_ORIGIN',
  'COMPACT_BROKER_URL',
  'FORCE_COLOR',
  'HOME',
  'LANG',
  'LC_ALL',
  'NODE_OPTIONS',
  'PATH',
  'PLAYWRIGHT_BROWSERS_PATH',
  'PWD',
  'SHELL',
  'TMPDIR',
  'USER',
  'VITE_BASE_PATH',
  'npm_config_cache',
  'npm_config_color',
  'npm_config_loglevel',
  'npm_config_user_agent',
]);

function buildSafeEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (allowedEnvNames.has(key) || key.startsWith('npm_')) {
      env[key] = value;
    }
  }
  env.COMPACT_GATE_SAFE_MODE = '1';
  return env;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probe(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 900);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureServer() {
  if (await probe(baseUrl)) {
    console.log(`[compact-gate] using existing dev server at ${baseUrl}`);
    return null;
  }
  if (baseUrl !== defaultBaseUrl) {
    throw new Error(`COMPACT_GATE_BASE_URL is not reachable: ${baseUrl}`);
  }

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const server = spawn(npx, ['vite', '--host', '127.0.0.1', '--port', '8903'], {
    cwd: process.cwd(),
    env: { ...buildSafeEnv(), FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  server.stdout.on('data', (chunk) => { output += String(chunk); });
  server.stderr.on('data', (chunk) => { output += String(chunk); });

  for (let i = 0; i < 80; i += 1) {
    if (await probe(baseUrl)) {
      console.log(`[compact-gate] started dev server at ${baseUrl}`);
      return server;
    }
    await delay(250);
  }

  server.kill('SIGTERM');
  throw new Error(`Timed out waiting for compact dev server at ${baseUrl}\n${output.slice(-2000)}`);
}

function runStep(label, command) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    console.log(`\n[compact-gate] ${label}`);
    const child = spawn(command[0], command.slice(1), {
      cwd: process.cwd(),
      env: buildSafeEnv(),
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      if (code === 0) {
        console.log(`[compact-gate] ${label} passed in ${seconds}s`);
        resolve();
        return;
      }
      reject(new Error(`${label} failed with exit code ${code}`));
    });
  });
}

const steps = fullGate ? [...baseSteps, ...fullSteps] : baseSteps;
const startedAt = Date.now();

console.log(JSON.stringify({
  gate: fullGate ? 'compact-production-full' : 'compact-production-core',
  safeMode: true,
  secretPolicy: 'known token/key/session env names are not forwarded to child commands',
  baseUrl,
  steps: steps.map(([label]) => label),
}, null, 2));

const startedServer = await ensureServer();

try {
  for (const [label, command] of steps) {
    await runStep(label, command);
  }
} finally {
  if (startedServer) {
    startedServer.kill('SIGTERM');
    console.log('[compact-gate] stopped owned dev server');
  }
}

console.log(JSON.stringify({
  gate: fullGate ? 'compact-production-full' : 'compact-production-core',
  status: 'passed',
  durationSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
}, null, 2));
