import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_SESSION_FILE = path.resolve(process.cwd(), '.broker-vault-session.local.json');
const sessionFile = process.env.COMPACT_BROKER_VAULT_SESSION_FILE || DEFAULT_SESSION_FILE;
const hasEnvSession = !!process.env.COMPACT_BROKER_VAULT_SESSION;
const hasEnvSupabaseToken = !!process.env.COMPACT_BROKER_VAULT_SUPABASE_TOKEN;
const envExpiresAt = Number(process.env.COMPACT_BROKER_VAULT_SESSION_EXPIRES_AT || 0);

function boolStatus(value) {
  return value ? 'present' : 'missing';
}

function permissionLabel(mode) {
  return `0${(mode & 0o777).toString(8).padStart(3, '0')}`;
}

function expirySummary(value) {
  if (!Number.isFinite(value) || value <= 0) return { state: 'missing' };
  if (value <= Date.now()) return { state: 'expired' };
  const minutes = Math.max(1, Math.round((value - Date.now()) / 60_000));
  return { state: 'valid', minutesRemaining: minutes };
}

function redactedError(error) {
  return String(error?.message || error || 'Unknown error')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[redacted-key]')
    .replace(/ntn_[A-Za-z0-9]{12,}/g, '[redacted-token]')
    .replace(/secret_[A-Za-z0-9]{12,}/g, '[redacted-token]')
    .replace(/AIza[0-9A-Za-z_-]{12,}/g, '[redacted-key]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g, '[redacted-session]');
}

async function readSessionFile(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return { ok: true, data: JSON.parse(text) };
  } catch (error) {
    if (error?.code === 'ENOENT') return { ok: false, missing: true };
    return { ok: false, error: redactedError(error) };
  }
}

async function fileStat(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function isIgnoredByGit(filePath) {
  try {
    await execFileAsync('git', ['check-ignore', '-q', '--', filePath], { cwd: process.cwd() });
    return true;
  } catch {
    return false;
  }
}

const stat = await fileStat(sessionFile);
const fileInput = await readSessionFile(sessionFile);
const fileData = fileInput.ok ? fileInput.data || {} : {};
const fileSessionPresent = !!(fileData.credentialSession || fileData.session);
const fileSupabaseTokenPresent = !!(fileData.supabaseAccessToken || fileData.supabaseToken);
const fileExpiresAt = Number(fileData.credentialSessionExpiresAt || fileData.expiresAt || 0);
const ignoredByGit = await isIgnoredByGit(sessionFile);
const permission = stat ? permissionLabel(stat.mode) : 'missing';
const permissionSafe = stat ? (stat.mode & 0o077) === 0 : true;
const effectiveMode = hasEnvSession || fileSessionPresent
  ? 'broker-session'
  : hasEnvSupabaseToken || fileSupabaseTokenPresent
    ? 'supabase-token'
    : 'missing';
const effectiveSource = hasEnvSession || hasEnvSupabaseToken ? 'environment' : fileSessionPresent || fileSupabaseTokenPresent ? 'session-file' : 'none';
const effectiveExpiry = hasEnvSession ? expirySummary(envExpiresAt) : expirySummary(fileExpiresAt);

const checks = [
  { name: 'session file present', status: stat ? 'present' : 'missing' },
  { name: 'session file ignored by git', status: ignoredByGit ? 'passed' : 'attention' },
  { name: 'session file permissions', status: permissionSafe ? 'passed' : 'attention', mode: permission },
  { name: 'environment broker session', status: boolStatus(hasEnvSession) },
  { name: 'environment supabase token', status: boolStatus(hasEnvSupabaseToken) },
  { name: 'file broker session', status: boolStatus(fileSessionPresent) },
  { name: 'file supabase token', status: boolStatus(fileSupabaseTokenPresent) },
  { name: 'effective auth mode', status: effectiveMode },
];

if (!fileInput.ok && !fileInput.missing) {
  checks.push({ name: 'session file parse', status: 'attention', error: fileInput.error });
}

if (effectiveMode === 'broker-session') {
  checks.push({ name: 'broker session expiry', status: effectiveExpiry.state, minutesRemaining: effectiveExpiry.minutesRemaining });
}

const attention = checks.some((check) => check.status === 'attention' || check.status === 'expired');
const ready = effectiveMode !== 'missing' && !attention;
const result = {
  status: ready ? 'ready' : attention ? 'attention' : 'blocked',
  summary: ready
    ? 'broker-vault auth input is present; run npm run smoke:broker-vault for authenticated redacted provider proof'
    : attention
      ? 'broker-vault auth input needs cleanup before authenticated proof'
      : 'missing local broker vault session; authenticated provider calls should not run yet',
  noSecretsPrinted: true,
  sessionFile: {
    basename: path.basename(sessionFile),
    present: !!stat,
    ignoredByGit,
    permission,
    permissionSafe,
  },
  auth: {
    mode: effectiveMode,
    source: effectiveSource,
    expiry: effectiveExpiry,
  },
  checks,
  next: ready
    ? ['Run npm run smoke:broker-vault from app-compact/.']
    : [
        'Create ignored app-compact/.broker-vault-session.local.json or set COMPACT_BROKER_VAULT_SESSION / COMPACT_BROKER_VAULT_SUPABASE_TOKEN locally.',
        'Keep file permissions private, ideally chmod 600 app-compact/.broker-vault-session.local.json.',
        'Rerun npm run smoke:broker-vault:doctor before authenticated provider proof.',
      ],
};

console.log(JSON.stringify(result, null, 2));
