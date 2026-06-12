import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_BROKER_URL = 'https://travel-expense-credential-broker.ftjdfr.workers.dev';
const DEFAULT_ORIGIN = 'https://travel-expense-compact.netlify.app';
const DEFAULT_SESSION_FILE = path.resolve(process.cwd(), '.broker-vault-session.local.json');

const brokerUrl = (process.env.COMPACT_BROKER_URL || DEFAULT_BROKER_URL).replace(/\/+$/, '');
const origin = process.env.COMPACT_BROKER_ORIGIN || DEFAULT_ORIGIN;
const sessionFile = process.env.COMPACT_BROKER_VAULT_SESSION_FILE || DEFAULT_SESSION_FILE;
const dryRun = process.argv.includes('--dry-run');

function redactedError(error) {
  return String(error?.message || error || 'Unknown error')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[redacted-key]')
    .replace(/ntn_[A-Za-z0-9]{12,}/g, '[redacted-token]')
    .replace(/secret_[A-Za-z0-9]{12,}/g, '[redacted-token]')
    .replace(/AIza[0-9A-Za-z_-]{12,}/g, '[redacted-key]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g, '[redacted-session]');
}

function permissionLabel(mode) {
  return `0${(mode & 0o777).toString(8).padStart(3, '0')}`;
}

async function isIgnoredByGit(filePath) {
  try {
    await execFileAsync('git', ['check-ignore', '-q', '--', filePath], { cwd: process.cwd() });
    return true;
  } catch {
    return false;
  }
}

async function filePermission(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return permissionLabel(stat.mode);
  } catch (error) {
    if (error?.code === 'ENOENT') return 'missing';
    throw error;
  }
}

function readHidden(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Interactive TTY required. Run this command in a local terminal so the password is not echoed.');
  }

  return new Promise((resolve, reject) => {
    let value = '';
    const stdin = process.stdin;

    function cleanup() {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
    }

    function onData(chunk) {
      const text = chunk.toString('utf8');
      for (const char of text) {
        const code = char.charCodeAt(0);
        if (code === 3) {
          cleanup();
          process.stdout.write('\n');
          reject(new Error('Cancelled'));
          return;
        }
        if (char === '\r' || char === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (code === 127 || code === 8) {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    }

    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function unlockSession(password) {
  const response = await fetch(`${brokerUrl}/session/unlock`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`/session/unlock returned non-JSON status ${response.status}`);
  }
  if (!response.ok || data?.ok !== true || typeof data.session !== 'string') {
    throw new Error(redactedError(data?.error || data?.message || `/session/unlock failed with status ${response.status}`));
  }
  return {
    credentialSession: data.session,
    credentialSessionExpiresAt: Number(data.expiresAt) || 0,
  };
}

async function writeSessionFile(session) {
  await fs.mkdir(path.dirname(sessionFile), { recursive: true });
  await fs.writeFile(`${sessionFile}.tmp`, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(`${sessionFile}.tmp`, sessionFile);
  await fs.chmod(sessionFile, 0o600);
}

const ignoredByGit = await isIgnoredByGit(sessionFile);
if (!ignoredByGit) {
  throw new Error(`Refusing to write ${path.basename(sessionFile)} because git check-ignore did not confirm it is ignored.`);
}

if (dryRun) {
  console.log(JSON.stringify({
    status: 'ready',
    mode: 'dry-run',
    brokerUrl,
    origin,
    sessionFile: {
      basename: path.basename(sessionFile),
      ignoredByGit,
      permission: await filePermission(sessionFile),
    },
    next: 'Run npm run broker-vault:prepare in a local terminal, then npm run smoke:broker-vault.',
  }, null, 2));
  process.exit(0);
}

try {
  const password = await readHidden('Travel Expense unlock password: ');
  if (!password.trim()) throw new Error('Password is required.');
  const session = await unlockSession(password);
  await writeSessionFile(session);
  const minutesRemaining = session.credentialSessionExpiresAt > Date.now()
    ? Math.max(1, Math.round((session.credentialSessionExpiresAt - Date.now()) / 60_000))
    : 0;
  console.log(JSON.stringify({
    status: 'ready',
    summary: 'broker-vault session file written with redacted output; run authenticated provider proof next',
    noSecretsPrinted: true,
    sessionFile: {
      basename: path.basename(sessionFile),
      ignoredByGit,
      permission: await filePermission(sessionFile),
    },
    auth: {
      mode: 'broker-session',
      source: 'session-file',
      expiry: { state: minutesRemaining > 0 ? 'valid' : 'expired', minutesRemaining },
    },
    next: 'Run npm run smoke:broker-vault from app-compact/.',
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    status: 'failed',
    noSecretsPrinted: true,
    error: redactedError(error),
  }, null, 2));
  process.exit(1);
}
