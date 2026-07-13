import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const separatorIndex = process.argv.indexOf('--');
if (separatorIndex === -1 || separatorIndex === process.argv.length - 1) {
  console.error('Usage: node scripts/run-with-dev-server.mjs -- <command> [args...]');
  process.exit(1);
}

const command = process.argv.slice(separatorIndex + 1);
const appPath = '/travel-expense/compact/';
const defaultBaseUrl = `http://127.0.0.1:8903${appPath}`;
const explicitBaseUrl = process.env.COMPACT_SMOKE_BASE_URL || '';
let baseUrl = explicitBaseUrl || defaultBaseUrl;
let testOrigin = new URL(baseUrl).origin;

const allowedEnvNames = new Set([
  'CI',
  'COMPACT_SMOKE_BASE_URL',
  'COMPACT_TEST_ORIGIN',
  'FORCE_COLOR',
  'HOME',
  'LANG',
  'LC_ALL',
  'NODE_OPTIONS',
  'PATH',
  'PLAYWRIGHT_BROWSERS_PATH',
  'PWD',
  'SHELL',
  'SUPABASE_REDIRECT_SMOKE',
  'TMPDIR',
  'USER',
  'VITE_BASE_PATH',
  'VITE_COMPACT_PUBLIC_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_URL',
  'npm_config_cache',
  'npm_config_color',
  'npm_config_loglevel',
  'npm_config_user_agent',
]);

function buildSafeEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (allowedEnvNames.has(key) || key.startsWith('npm_')) env[key] = value;
  }
  env.COMPACT_SMOKE_SAFE_MODE = '1';
  env.COMPACT_TEST_ORIGIN = testOrigin;
  return env;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForClose(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (closed) => {
      clearTimeout(timeout);
      child.off('close', onClose);
      resolve(closed);
    };
    const onClose = () => finish(true);
    const timeout = setTimeout(() => finish(false), timeoutMs);
    child.once('close', onClose);
  });
}

async function stopServer(child, label) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const gracefulClose = waitForClose(child, 5_000);
  child.kill('SIGTERM');
  if (await gracefulClose) return;

  console.warn(`[compact-smoke] ${label} ignored SIGTERM; sending SIGKILL`);
  const forcedClose = waitForClose(child, 1_000);
  child.kill('SIGKILL');
  if (!await forcedClose) throw new Error(`[compact-smoke] ${label} did not close after SIGKILL`);
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
  if (explicitBaseUrl && await probe(baseUrl)) {
    console.log(`[compact-smoke] using existing dev server at ${baseUrl}`);
    return null;
  }
  if (explicitBaseUrl && !['127.0.0.1', 'localhost'].includes(new URL(baseUrl).hostname)) {
    throw new Error(`COMPACT_SMOKE_BASE_URL is not reachable: ${baseUrl}`);
  }

  if (!explicitBaseUrl) {
    const candidatePorts = [8903, ...Array.from({ length: 10 }, (_, index) => 8915 + index)];
    let selected = null;
    for (const port of candidatePorts) {
      const candidate = `http://127.0.0.1:${port}${appPath}`;
      if (!await probe(candidate)) {
        selected = candidate;
        break;
      }
    }
    if (!selected) throw new Error('No isolated Compact smoke port is available');
    baseUrl = selected;
    testOrigin = new URL(baseUrl).origin;
  }

  const port = new URL(baseUrl).port;
  const viteCli = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
  const server = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', port, '--strictPort'], {
    cwd: process.cwd(),
    env: { ...buildSafeEnv(), FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  server.stdout.on('data', (chunk) => { output += String(chunk); });
  server.stderr.on('data', (chunk) => { output += String(chunk); });

  try {
    for (let i = 0; i < 160; i += 1) {
      if (server.exitCode !== null) {
        throw new Error(`Compact dev server exited early with code ${server.exitCode}\n${output.slice(-2000)}`);
      }
      if (await probe(baseUrl)) {
        console.log(`[compact-smoke] started dev server at ${baseUrl}`);
        return server;
      }
      await delay(250);
    }
    throw new Error(`Timed out waiting for compact dev server at ${baseUrl}\n${output.slice(-2000)}`);
  } catch (error) {
    await stopServer(server, 'owned dev server');
    throw error;
  }
}

function runCommand() {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: process.cwd(),
      env: buildSafeEnv(),
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command.join(' ')} failed with exit code ${code}`));
    });
  });
}

const startedServer = await ensureServer();

try {
  await runCommand();
} finally {
  if (startedServer) {
    await stopServer(startedServer, 'owned dev server');
    console.log('[compact-smoke] stopped owned dev server');
  }
}
