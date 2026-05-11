import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirs = new Set(['.git', '.gitnexus', 'node_modules', 'graphify-out', '.wrangler']);
const ignoredFiles = new Set(['package-lock.json']);
const textExts = new Set([
  '.css', '.html', '.js', '.json', '.jsonc', '.md', '.mjs', '.ts', '.tsx', '.txt', '.toml', '.yml', '.yaml',
]);

const patterns = [
  { name: 'Kimi/Moonshot key', re: /\bsk-kimi-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'Generic long sk key', re: /\bsk-[A-Za-z0-9_-]{40,}\b/g },
  { name: 'Notion token', re: /\bntn_[A-Za-z0-9]{20,}\b/g },
  { name: 'Legacy Notion secret token', re: /\bsecret_[A-Za-z0-9]{20,}\b/g },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{20,}\b/g },
  { name: 'Hardcoded bearer token', re: /Bearer\s+(?!\[redacted\]|<|TOKEN|PLACEHOLDER|\$\{)[A-Za-z0-9._-]{16,}/gi },
  { name: 'Likely plaintext unlock PIN', re: /\b(?:pin|passcode|password|unlock)\w*\b.{0,80}(['"`])\d{4}\1/gi },
  { name: 'Inline session secret assignment', re: /\b(APP_SESSION_SECRET|CREDENTIALS_KEK|ADMIN_ROTATION_HASH)\s*[:=]\s*(['"`])(?!(?:<|replace-|placeholder|pbkdf2:|\$\{))/gi },
];

function ext(name) {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i);
}

function isGitIgnored(rel) {
  try {
    execFileSync('git', ['check-ignore', '--quiet', '--', rel], { cwd: repoRoot, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) continue;
    const path = join(dir, entry);
    const rel = relative(repoRoot, path);
    if (isGitIgnored(rel)) continue;
    if (ignoredFiles.has(entry)) continue;
    const stat = statSync(path);
    if (stat.isDirectory()) {
      yield* walk(path);
      continue;
    }
    if (stat.size > 2_000_000) continue;
    if (!textExts.has(ext(entry))) continue;
    yield rel;
  }
}

const findings = [];
for (const rel of walk(repoRoot)) {
  const content = readFileSync(join(repoRoot, rel), 'utf8');
  const lines = content.split(/\r?\n/);
  for (const { name, re } of patterns) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(content))) {
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      findings.push({ name, file: rel, line, text: lines[line - 1]?.slice(0, 180).replace(match[0], '[redacted]') || '' });
    }
  }
}

if (findings.length) {
  console.error('Secret scan failed:');
  for (const item of findings) {
    console.error(`- ${item.name}: ${item.file}:${item.line} ${item.text}`);
  }
  process.exit(1);
}

console.log('Secret scan passed');
