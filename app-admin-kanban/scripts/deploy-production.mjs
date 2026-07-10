import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appDir, '..');
const projectName = 'travel-expense-admin-kanban';
const productionUrl = 'https://travel-expense-admin-kanban.vercel.app';
const localVercelDir = path.join(appDir, '.vercel');
const localEnvFile = path.join(appDir, '.env.local');
const hadVercelDir = existsSync(localVercelDir);
const hadEnvFile = existsSync(localEnvFile);

function capture(command, args, cwd = repoRoot) {
  return execFileSync(command, args, { cwd, encoding: 'utf8' }).trim();
}

function run(command, args, cwd = appDir) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

const status = capture('git', ['status', '--porcelain']);
if (status) {
  throw new Error('Refusing production deploy from a dirty worktree');
}

const gitSha = capture('git', ['rev-parse', 'HEAD']);
const packageJson = JSON.parse(readFileSync(path.join(appDir, 'package.json'), 'utf8'));

try {
  run('npm', ['run', 'typecheck']);
  run('npm', ['run', 'build']);
  run('npm', ['run', 'smoke']);
  run('npm', ['audit', '--audit-level=high']);
  run('npx', [
    'vercel',
    'deploy',
    '--prod',
    '--yes',
    '--project',
    projectName,
    '--env',
    `ADMIN_GIT_SHA=${gitSha}`,
    '--build-env',
    `ADMIN_GIT_SHA=${gitSha}`,
    '--meta',
    `gitSha=${gitSha}`,
  ]);

  const response = await fetch(`${productionUrl}/api/health`, { cache: 'no-store' });
  const health = await response.json();
  if (!response.ok || health.version !== packageJson.version || health.gitSha !== gitSha || health.acceptingReadTraffic !== true) {
    throw new Error(`Production health provenance mismatch (${response.status})`);
  }
  console.log(JSON.stringify({
    status: 'passed',
    project: projectName,
    version: health.version,
    gitSha: health.gitSha,
    acceptingReadTraffic: health.acceptingReadTraffic,
  }));
} finally {
  if (!hadVercelDir) rmSync(localVercelDir, { recursive: true, force: true });
  if (!hadEnvFile) rmSync(localEnvFile, { force: true });
}
