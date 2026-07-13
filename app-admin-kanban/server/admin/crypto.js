import crypto from 'node:crypto';
import net from 'node:net';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);
const SCRYPT_N = 131072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 256 * 1024 * 1024;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const MAX_PASSPHRASE_BYTES = 1024;

function decodeBase64url(value, expectedBytes) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('ADMIN_KANBAN_HASH format invalid');
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length !== expectedBytes || bytes.toString('base64url') !== value) {
    throw new Error('ADMIN_KANBAN_HASH format invalid');
  }
  return bytes;
}

export function parseScryptHash(spec) {
  const parts = String(spec || '').split(':');
  if (parts.length !== 7 || parts[0] !== 'scrypt' || parts[1] !== 'v1') {
    throw new Error('ADMIN_KANBAN_HASH format invalid');
  }
  const n = Number(parts[2]);
  const r = Number(parts[3]);
  const p = Number(parts[4]);
  if (n !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P) {
    throw new Error('ADMIN_KANBAN_HASH parameters invalid');
  }
  return {
    n,
    r,
    p,
    salt: decodeBase64url(parts[5], SALT_BYTES),
    expected: decodeBase64url(parts[6], HASH_BYTES),
  };
}

export async function hashAdminPassphrase(passphrase, salt = crypto.randomBytes(SALT_BYTES)) {
  if (typeof passphrase !== 'string' || Buffer.byteLength(passphrase, 'utf8') > MAX_PASSPHRASE_BYTES) {
    throw new Error('Admin passphrase input invalid');
  }
  if (!Buffer.isBuffer(salt) || salt.length !== SALT_BYTES) throw new Error('Admin passphrase salt invalid');
  const derived = await scryptAsync(passphrase, salt, HASH_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return `scrypt:v1:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString('base64url')}:${Buffer.from(derived).toString('base64url')}`;
}

export async function verifyAdminPassphrase(passphrase) {
  if (typeof passphrase !== 'string' || Buffer.byteLength(passphrase, 'utf8') > MAX_PASSPHRASE_BYTES) {
    return false;
  }
  const spec = process.env.ADMIN_KANBAN_HASH;
  if (!spec) throw new Error('ADMIN_KANBAN_HASH missing');
  const parsed = parseScryptHash(spec);
  const actual = Buffer.from(await scryptAsync(passphrase, parsed.salt, HASH_BYTES, {
    N: parsed.n,
    r: parsed.r,
    p: parsed.p,
    maxmem: SCRYPT_MAXMEM,
  }));
  return actual.length === parsed.expected.length && crypto.timingSafeEqual(actual, parsed.expected);
}

export function passphraseFingerprint() {
  const spec = process.env.ADMIN_KANBAN_HASH;
  if (!spec) throw new Error('ADMIN_KANBAN_HASH missing');
  parseScryptHash(spec);
  return sha256Hex(spec);
}

export function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function timingSafeStringEqual(left, right) {
  const leftBytes = Buffer.from(String(left || ''));
  const rightBytes = Buffer.from(String(right || ''));
  return leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes);
}

function expandIpv6(value) {
  let address = value.toLowerCase().split('%')[0];
  if (address.startsWith('[') && address.endsWith(']')) address = address.slice(1, -1);
  if (net.isIP(address) !== 6) return null;
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  const groups = halves.length === 2
    ? [...left, ...Array(Math.max(missing, 0)).fill('0'), ...right]
    : left;
  if (groups.length !== 8) return null;
  return groups.map((group) => Number.parseInt(group || '0', 16).toString(16).padStart(4, '0'));
}

export function sourceNetwork(rawIp) {
  const value = String(rawIp || '').trim();
  if (net.isIP(value) === 4) {
    const groups = value.split('.');
    return `${groups[0]}.${groups[1]}.${groups[2]}.0/24`;
  }
  const groups = expandIpv6(value);
  if (groups) return `${groups.slice(0, 4).join(':')}::/64`;
  return 'unknown';
}

export function loginBucketKey(req, kind = 'login') {
  const pepper = process.env.ADMIN_LOGIN_RATE_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error('ADMIN_LOGIN_RATE_PEPPER missing');
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const rawIp = forwarded || req.socket?.remoteAddress || '';
  return crypto.createHmac('sha256', pepper).update(`${kind}:${sourceNetwork(rawIp)}`).digest('hex');
}
