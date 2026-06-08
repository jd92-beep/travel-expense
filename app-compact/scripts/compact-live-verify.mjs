import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const liveUrl = process.env.COMPACT_LIVE_URL || 'https://travel-expense-compact.vercel.app/';
const expectedTitle = process.env.COMPACT_LIVE_TITLE || '旅費 Compact';
const vercelScope = process.env.COMPACT_VERCEL_SCOPE || 'ftjdfr-7940s-projects';
const allowDirty = process.argv.includes('--allow-dirty') || process.env.COMPACT_DEPLOY_VERIFY_ALLOW_DIRTY === '1';

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function normalizeUrl(value) {
  if (!value) return '';
  const text = String(value).trim();
  return /^https?:\/\//i.test(text) ? text : `https://${text}`;
}

function hostOf(value) {
  return new URL(normalizeUrl(value)).host;
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

function extractVercelJson(output) {
  const index = output.indexOf('{');
  if (index < 0) throw new Error('vercel inspect did not return JSON');
  return JSON.parse(output.slice(index));
}

async function inspectVercel() {
  const output = await run('npx', ['vercel', 'inspect', liveUrl, '--scope', vercelScope, '--json'], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 12,
  });
  return extractVercelJson(output);
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
    hasCredentialBroker: text.includes('credentialBroker'),
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

const deployment = await inspectVercel();
const deploymentUrl = normalizeUrl(deployment.url);
const liveHost = hostOf(liveUrl);
const deploymentHost = hostOf(deploymentUrl);
const aliasHosts = (deployment.aliases || []).map((alias) => hostOf(alias));

assert(deployment.readyState === 'READY', `deployment ${deployment.id || deploymentHost} is not READY`);
assert(deployment.target === 'production', `deployment target is ${deployment.target || 'unknown'}, expected production`);
assert(aliasHosts.includes(liveHost), `live host ${liveHost} is not listed in deployment aliases`);

const live = await fetchHtml(liveUrl);
const deployed = await fetchHtml(deploymentUrl);

for (const page of [live, deployed]) {
  assert(page.status === 200, `${page.url} returned HTTP ${page.status}`);
  assert(page.title === expectedTitle, `${page.url} title ${JSON.stringify(page.title)} did not match ${JSON.stringify(expectedTitle)}`);
  assert(page.hasRoot, `${page.url} is missing #root`);
  assert(page.assets.length >= 4, `${page.url} had too few assets: ${page.assets.length}`);
  assert(page.hasCredentialBroker, `${page.url} did not reference credentialBroker asset`);
}

assert(live.assetHash === deployed.assetHash, 'live alias assets do not match inspected deployment assets');
assert(live.htmlHash === deployed.htmlHash, 'live alias HTML does not match inspected deployment HTML');

const proof = {
  status: 'passed',
  branch,
  commit: {
    head: headShort,
    originMain: originMainShort,
    matchesOriginMain: head === originMain,
    deployRelevantWorktreeClean: !dirty,
  },
  vercel: {
    id: deployment.id,
    target: deployment.target,
    readyState: deployment.readyState,
    deploymentUrl,
    aliases: aliasHosts,
    createdAt: deployment.createdAt ? new Date(deployment.createdAt).toISOString() : undefined,
  },
  live: {
    url: live.url,
    status: live.status,
    title: live.title,
    hasRoot: live.hasRoot,
    assetCount: live.assets.length,
    assetHash: live.assetHash.slice(0, 16),
    htmlHash: live.htmlHash.slice(0, 16),
    mainAssets: live.assets.filter((asset) => /\/(index|credentialBroker|Dashboard|Scan|Timeline|History|Weather|Stats|Settings)-/.test(asset)).slice(0, 12),
  },
  deploymentContentMatch: {
    assetHash: deployed.assetHash.slice(0, 16),
    htmlHash: deployed.htmlHash.slice(0, 16),
    aliasMatchesDeployment: live.assetHash === deployed.assetHash && live.htmlHash === deployed.htmlHash,
  },
};

console.log(JSON.stringify(proof, null, 2));
