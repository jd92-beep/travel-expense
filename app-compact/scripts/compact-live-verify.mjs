import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const liveUrls = String(process.env.COMPACT_LIVE_URLS || process.env.COMPACT_LIVE_URL || [
  'https://travel-expense-compact.vercel.app/',
  'https://travel-expense-compact.netlify.app/',
].join(','))
  .split(',')
  .map((url) => normalizeUrl(url))
  .filter(Boolean);
const expectedTitle = process.env.COMPACT_LIVE_TITLE || '旅費 Compact';
const allowDirty = process.argv.includes('--allow-dirty') || process.env.COMPACT_DEPLOY_VERIFY_ALLOW_DIRTY === '1';

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function normalizeUrl(value) {
  if (!value) return '';
  const text = String(value).trim();
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

async function run(command, args, options = {}) {
  const result = await execFileAsync(command, args, {
    cwd: options.cwd || process.cwd(),
    maxBuffer: options.maxBuffer || 1024 * 1024 * 8,
  });
  return result.stdout.trim();
}

async function gitText(args) {
  return run('git', args, { cwd: process.cwd() });
}

async function fetchHtml(url) {
  const response = await fetch(url, { redirect: 'follow' });
  const text = await response.text();
  const title = (text.match(/<title>(.*?)<\/title>/i) || [])[1] || '';
  const assets = [...new Set(Array.from(text.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g), (match) => match[1]))].sort();
  return {
    url: response.url,
    status: response.status,
    title,
    hasRoot: /id=["']root["']/.test(text),
    assets,
    assetHash: sha256(assets.join('\n')),
    htmlHash: sha256(text),
    hasMainScript: assets.some((asset) => /\/assets\/index-[^/]+\.js(?:\?|$)/.test(asset)),
    hasCredentialBroker: assets.some((asset) => /\/assets\/credentialBroker-[^/]+\.js(?:\?|$)/.test(asset)),
    hasStylesheet: assets.some((asset) => /\/assets\/index-[^/]+\.css(?:\?|$)/.test(asset)),
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const head = await gitText(['rev-parse', 'HEAD']);
const headShort = await gitText(['rev-parse', '--short', 'HEAD']);
const branch = await gitText(['rev-parse', '--abbrev-ref', 'HEAD']);
const originMain = (await gitText(['ls-remote', 'origin', 'refs/heads/main'])).split(/\s+/)[0] || '';
const originMainShort = originMain.slice(0, 7);
const dirty = await gitText(['status', '--porcelain', '--', '.', ':(exclude)supabase/.temp']);

assert(branch === 'main', `expected branch main, got ${branch}`);
assert(head === originMain, `local HEAD ${headShort} does not match origin/main ${originMainShort}`);
if (!allowDirty) assert(!dirty, `tracked worktree has uncommitted deploy-relevant changes:\n${dirty}`);

assert(liveUrls.length > 0, 'expected at least one live URL to verify');
const livePages = [];
for (const url of liveUrls) {
  const page = await fetchHtml(url);
  assert(page.status === 200, `${page.url} returned HTTP ${page.status}`);
  assert(page.title === expectedTitle, `${page.url} title ${JSON.stringify(page.title)} did not match ${JSON.stringify(expectedTitle)}`);
  assert(page.hasRoot, `${page.url} is missing #root`);
  assert(page.hasMainScript, `${page.url} did not reference the main index script`);
  assert(page.hasCredentialBroker, `${page.url} did not reference credentialBroker asset`);
  assert(page.hasStylesheet, `${page.url} did not reference the main stylesheet`);
  livePages.push(page);
}

const proof = {
  status: 'passed',
  branch,
  commit: {
    head: headShort,
    originMain: originMainShort,
    matchesOriginMain: head === originMain,
    deployRelevantWorktreeClean: !dirty,
  },
  live: livePages.map((page) => ({
    url: page.url,
    status: page.status,
    title: page.title,
    hasRoot: page.hasRoot,
    hasMainScript: page.hasMainScript,
    hasCredentialBroker: page.hasCredentialBroker,
    hasStylesheet: page.hasStylesheet,
    assetCount: page.assets.length,
    assetHash: page.assetHash.slice(0, 16),
    htmlHash: page.htmlHash.slice(0, 16),
    mainAssets: page.assets.filter((asset) => /\/(index|credentialBroker|Dashboard|Scan|Timeline|History|Weather|Stats|Settings)-/.test(asset)).slice(0, 12),
  })),
};

console.log(JSON.stringify(proof, null, 2));
