import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(appRoot, '..');
const findings = [];

const rootScan = spawnSync(process.execPath, [join(repoRoot, 'scripts/security-scan.mjs')], {
  cwd: repoRoot,
  encoding: 'utf8',
});
if (rootScan.status !== 0) {
  process.stderr.write(rootScan.stderr || rootScan.stdout || 'Repository secret scan failed\n');
  process.exit(rootScan.status || 1);
}

function* walk(root) {
  for (const entry of readdirSync(root)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.endsWith('.test.js')) continue;
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      yield* walk(path);
    } else if (/\.(?:js|mjs|ts|tsx)$/.test(entry)) {
      yield path;
    }
  }
}

function scan(paths, rules) {
  for (const path of paths) {
    const source = readFileSync(path, 'utf8');
    for (const rule of rules) {
      rule.pattern.lastIndex = 0;
      let match;
      while ((match = rule.pattern.exec(source))) {
        const line = source.slice(0, match.index).split(/\r?\n/).length;
        findings.push(`${rule.label}: ${relative(appRoot, path)}:${line}`);
      }
    }
  }
}

scan([...walk(join(appRoot, 'src'))], [
  { label: 'Browser Supabase key', pattern: /VITE_SUPABASE_(?:ANON|PUBLISHABLE)_KEY/g },
  { label: 'Browser authorization header', pattern: /\bAuthorization\b/g },
  { label: 'Legacy admin token header', pattern: /X-Admin-Token/g },
  { label: 'Direct browser Edge admin call', pattern: /functions\/v1\/admin-(?:kanban|auth-state)/g },
]);

scan([...walk(join(appRoot, 'api'))], [
  { label: 'Legacy signed bearer session', pattern: /ADMIN_KANBAN_SESSION_SECRET/g },
  { label: 'Legacy synchronous PBKDF2', pattern: /\bpbkdf2Sync\b/g },
  { label: 'Legacy external verify URL', pattern: /ADMIN_KANBAN_VERIFY_URL/g },
  { label: 'Legacy external login URL', pattern: /ADMIN_KANBAN_LOGIN_URL/g },
  { label: 'Legacy verify-session route', pattern: /\/api\/verify-session/g },
  { label: 'Legacy root session route', pattern: /(['"`])\/api\/session\1/g },
]);

const adminApiPath = join(appRoot, 'src/lib/adminApi.ts');
const adminApi = readFileSync(adminApiPath, 'utf8');
const legacyStorageKey = 'travel-expense-admin-kanban:session:v1';
const legacyStorageUses = adminApi.split(/\r?\n/).filter((line) => line.includes(legacyStorageKey));
if (legacyStorageUses.length !== 1) {
  findings.push('Legacy bearer storage key must exist once solely for startup cleanup');
}
if (!adminApi.includes('window.sessionStorage.removeItem(LEGACY_SESSION_KEY)')) {
  findings.push('Legacy browser bearer cleanup is missing');
}

for (const path of [
  'api/session.js',
  'api/verify-session.js',
  'api/_lib/admin.js',
]) {
  if (existsSync(join(appRoot, path))) findings.push(`Legacy auth file still exists: ${path}`);
}

for (const path of [
  'api/admin/[...path].js',
  'server/admin/routes.js',
  'server/admin/handlers/auth/begin.js',
  'server/admin/handlers/auth/finish.js',
  'server/admin/handlers/passkeys/enroll/begin.js',
  'server/admin/handlers/passkeys/enroll/finish.js',
  'server/admin/handlers/reauth/begin.js',
  'server/admin/handlers/reauth/finish.js',
  'server/admin/handlers/session.js',
]) {
  if (!existsSync(join(appRoot, path))) findings.push(`Required admin handler is missing: ${path}`);
}

const edgeSource = readFileSync(join(appRoot, 'server/admin/edge.js'), 'utf8');
if (!edgeSource.includes("redirect: 'manual'")) findings.push('Signed Edge requests must reject redirects');
if (!edgeSource.includes("'X-Admin-Signature'")) findings.push('Signed Edge protocol headers are missing');

const vercelConfig = readFileSync(join(appRoot, 'vercel.json'), 'utf8');
for (const required of [
  'Content-Security-Policy',
  'X-Frame-Options',
  'X-Content-Type-Options',
  'Referrer-Policy',
  'Cache-Control',
]) {
  if (!vercelConfig.includes(required)) findings.push(`Required Vercel security header is missing: ${required}`);
}

if (findings.length > 0) {
  console.error('Admin security scan failed:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

process.stdout.write(rootScan.stdout);
console.log('Admin trust-boundary scan passed');
