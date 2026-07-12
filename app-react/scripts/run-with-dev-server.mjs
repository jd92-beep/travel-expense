import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const separatorIndex = process.argv.indexOf('--');
if (separatorIndex === -1 || separatorIndex === process.argv.length - 1) {
  console.error('Usage: node scripts/run-with-dev-server.mjs -- <command> [args...]');
  process.exit(1);
}

const command = process.argv.slice(separatorIndex + 1);
const defaultBaseUrl = 'http://127.0.0.1:8902/travel-expense/react/';
const baseUrl = process.env.REACT_SMOKE_BASE_URL || defaultBaseUrl;
const allowedEnvNames = new Set([
  'CI',
  'FORCE_COLOR',
  'HOME',
  'LANG',
  'LC_ALL',
  'NODE_OPTIONS',
  'PATH',
  'PLAYWRIGHT_BROWSERS_PATH',
  'PWD',
  'REACT_SMOKE_BASE_URL',
  'SHELL',
  'SUPABASE_REDIRECT_SMOKE',
  'TMPDIR',
  'USER',
  'VITE_BASE_PATH',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_URL',
  'npm_config_cache',
  'npm_config_color',
  'npm_config_loglevel',
  'npm_config_user_agent',
]);

function safeEnvironment() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (allowedEnvNames.has(key) || key.startsWith('npm_')) env[key] = value;
  }
  env.REACT_SMOKE_SAFE_MODE = '1';
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

  console.warn(`[react-smoke] ${label} ignored SIGTERM; sending SIGKILL`);
  const forcedClose = waitForClose(child, 1_000);
  child.kill('SIGKILL');
  if (!await forcedClose) throw new Error(`[react-smoke] ${label} did not close after SIGKILL`);
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
    console.log(`[react-smoke] using existing dev server at ${baseUrl}`);
    return null;
  }
  if (baseUrl !== defaultBaseUrl) {
    throw new Error(`REACT_SMOKE_BASE_URL is not reachable: ${baseUrl}`);
  }

  const viteCli = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
  const server = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', '8902', '--strictPort'], {
    cwd: process.cwd(),
    env: { ...safeEnvironment(), FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', (chunk) => { output += String(chunk); });
  server.stderr.on('data', (chunk) => { output += String(chunk); });

  try {
    for (let attempt = 0; attempt < 160; attempt += 1) {
      if (server.exitCode !== null) {
        throw new Error(`React dev server exited early with code ${server.exitCode}\n${output.slice(-2000)}`);
      }
      if (await probe(baseUrl)) {
        console.log(`[react-smoke] started dev server at ${baseUrl}`);
        return server;
      }
      await delay(250);
    }
    throw new Error(`Timed out waiting for React dev server at ${baseUrl}\n${output.slice(-2000)}`);
  } catch (error) {
    await stopServer(server, 'owned dev server');
    throw error;
  }
}

function runCommand() {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: process.cwd(),
      env: safeEnvironment(),
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
    console.log('[react-smoke] stopped owned dev server');
  }
}
