import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseProtectedResponse,
  protectedRequestArgs,
} from './vercel-protected-request.mjs';
import { retryPromotedReadiness } from './retry-promoted-readiness.mjs';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appDir, '..');
const projectName = 'travel-expense-admin-kanban';
const productionUrl = 'https://travel-expense-admin-kanban.vercel.app';
const appPath = 'app-admin-kanban';
const adminRuntimeSchemaVersion = '20260712123000';
const stagingDir = mkdtempSync(path.join(tmpdir(), 'travel-expense-admin-release-'));
const vercelArgs = ['--yes', 'vercel@54.17.3'];

function childEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === 'npm_config_allow_scripts') delete env[key];
  }
  return env;
}

function capture(command, args, cwd = repoRoot) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: childEnvironment(),
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
}

function run(command, args, cwd = appDir) {
  execFileSync(command, args, { cwd, stdio: 'inherit', env: childEnvironment() });
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} did not return JSON`);
  }
}

function assertReleaseManifest(manifest, sourceDir) {
  const paths = Array.isArray(manifest?.files)
    ? manifest.files.map((entry) => String(entry?.path || ''))
    : [];
  const required = [
    'package.json',
    'vercel.json',
    'src/main.tsx',
    'api/admin.js',
    'api/health.js',
    'api/readiness.js',
  ];
  if (path.resolve(String(manifest?.basePath || '')) !== sourceDir
    || !Number.isSafeInteger(manifest?.fileCount)
    || manifest.fileCount !== paths.length
    || !Number.isSafeInteger(manifest?.totalSize)
    || required.some((file) => !paths.includes(file))) {
    throw new Error('Vercel dry run did not contain the complete Admin source tree');
  }
  if (paths.some((file) => /(^|\/)(node_modules|dist)(\/|$)/.test(file))
    || manifest.totalSize > 20 * 1024 * 1024) {
    throw new Error('Vercel dry run contained generated or unexpectedly large release input');
  }
  if (String(manifest?.framework?.slug || '') !== 'vite') {
    throw new Error('Vercel dry run did not resolve the Admin Vite project');
  }
}

function deploymentUrlFrom(result) {
  const raw = String(result?.url || result?.deployment?.url || '').trim();
  if (!raw) throw new Error('Vercel did not return a deployment URL');
  const value = raw.startsWith('http') ? raw : `https://${raw}`;
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') throw new Error('Vercel deployment URL is invalid');
  return parsed.origin;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', redirect: 'error', ...options });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    throw new Error(`Release verification failed (${response.status})`);
  }
  return payload;
}

function fetchProtectedJson(baseUrl, pathname, options = {}) {
  const args = protectedRequestArgs({
    baseArgs: vercelArgs,
    body: options.body,
    deploymentUrl: baseUrl,
    headerFile: options.headerFile,
    headers: options.headers,
    method: options.method,
    pathname,
  });
  return parseProtectedResponse(
    capture('npx', args, appDir),
    'Protected release verification',
  );
}

async function withReadinessHeaderFile(token, operation) {
  if (/\r|\n/.test(token)) throw new Error('ADMIN_READINESS_TOKEN is invalid');
  const directory = mkdtempSync(path.join(tmpdir(), 'travel-expense-admin-readiness-'));
  const headerFile = path.join(directory, 'headers');
  try {
    chmodSync(directory, 0o700);
    writeFileSync(headerFile, `Authorization: Bearer ${token}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    chmodSync(headerFile, 0o600);
    return await operation(headerFile);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function verifyCandidate(baseUrl, gitSha, version, mode) {
  const requestJson = mode === 'candidate'
    ? (pathname, options) => fetchProtectedJson(baseUrl, pathname, options)
    : (pathname, options) => fetchJson(`${baseUrl}${pathname}`, options);
  const health = await requestJson('/api/health');
  if (health.version !== version || health.gitSha !== gitSha
    || health.acceptingReadTraffic !== true || health.deploymentId === 'unknown') {
    throw new Error('Admin health provenance mismatch');
  }

  const token = String(process.env.ADMIN_READINESS_TOKEN || '');
  if (token.length < 32) throw new Error('ADMIN_READINESS_TOKEN is missing');
  const readinessOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Request-Id': crypto.randomUUID(),
    },
    body: JSON.stringify({ mode }),
  };
  const readiness = mode === 'candidate'
    ? await withReadinessHeaderFile(token, (headerFile) => requestJson('/api/readiness', {
      ...readinessOptions,
      headerFile,
    }))
    : await requestJson('/api/readiness', {
      ...readinessOptions,
      headers: { ...readinessOptions.headers, Authorization: `Bearer ${token}` },
    });
  if (readiness?.data?.ready !== true || readiness?.data?.gitSha !== gitSha) {
    throw new Error('Signed Edge/database readiness canary failed');
  }
  return { health, readiness };
}

try {
  if (capture('git', ['status', '--porcelain'])) {
    throw new Error('Refusing production deploy from a dirty worktree');
  }
  const gitSha = capture('git', ['rev-parse', 'HEAD']);
  const originMainSha = capture('git', ['rev-parse', 'origin/main']);
  if (process.env.GITHUB_ACTIONS !== 'true'
    || process.env.GITHUB_REF !== 'refs/heads/main'
    || process.env.GITHUB_SHA !== gitSha
    || process.env.ADMIN_RELEASE_GATE_SHA !== gitSha
    || originMainSha !== gitSha) {
    throw new Error('Production deploy requires the protected green main workflow SHA');
  }
  if (process.env.ADMIN_PRODUCTION_APPROVED !== 'YES') {
    throw new Error('Production environment approval is missing');
  }

  const packageJson = JSON.parse(readFileSync(path.join(appDir, 'package.json'), 'utf8'));
  const expectedSchemaVersion = adminRuntimeSchemaVersion;
  run('npm', ['run', 'typecheck']);
  run('npm', ['run', 'build']);
  run('npm', ['run', 'security:scan']);
  run('npm', ['run', 'test:unit']);
  run('npm', ['run', 'test:contract']);
  run('npm', ['run', 'smoke']);
  run('npm', ['audit', '--audit-level=high']);

  const archivePath = path.join(stagingDir, 'release.tar');
  run('git', ['archive', '--format=tar', '--output', archivePath, gitSha, appPath], repoRoot);
  run('tar', ['-xf', archivePath, '-C', stagingDir], repoRoot);
  rmSync(archivePath, { force: true });
  const archiveAppDir = path.join(stagingDir, appPath);
  if (!existsSync(path.join(archiveAppDir, 'vercel.json'))) {
    throw new Error('Committed Admin release archive is incomplete');
  }

  const baseArgs = ['--yes', '--project', projectName];
  const manifest = parseJson(capture('npx', [
    ...vercelArgs, 'deploy', '--dry', '--format=json', ...baseArgs,
  ], archiveAppDir), 'Vercel dry run');
  assertReleaseManifest(manifest, archiveAppDir);

  const deployment = parseJson(capture('npx', [
    ...vercelArgs, 'deploy', '--prod', '--skip-domain', '--format=json', ...baseArgs,
    '--env', `ADMIN_GIT_SHA=${gitSha}`,
    '--env', 'ADMIN_ACCEPT_READ_TRAFFIC=true',
    '--env', `ADMIN_EXPECTED_SCHEMA_VERSION=${expectedSchemaVersion}`,
    '--build-env', `ADMIN_GIT_SHA=${gitSha}`,
    '--build-env', 'VITE_ADMIN_ENVIRONMENT=PRODUCTION',
    '--meta', `gitSha=${gitSha}`,
  ], archiveAppDir), 'Vercel deployment');
  const candidateUrl = deploymentUrlFrom(deployment);

  await verifyCandidate(candidateUrl, gitSha, packageJson.version, 'candidate');
  run('npx', [...vercelArgs, 'promote', candidateUrl, '--yes'], archiveAppDir);
  const verified = await retryPromotedReadiness(
    () => verifyCandidate(productionUrl, gitSha, packageJson.version, 'promoted'),
  );

  console.log(JSON.stringify({
    status: 'passed',
    project: projectName,
    version: verified.health.version,
    gitSha: verified.health.gitSha,
    deploymentId: verified.health.deploymentId,
    edgeDeploymentId: verified.readiness.data.edgeDeploymentId,
    schemaVersion: verified.readiness.data.schemaVersion,
  }));
} finally {
  rmSync(stagingDir, { recursive: true, force: true });
}
