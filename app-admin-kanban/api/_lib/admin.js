import crypto from 'node:crypto';

const SESSION_TTL_MS = 1000 * 60 * 60 * 2;

export function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export function requireMethod(req, res, method) {
  if (req.method !== method) {
    send(res, 405, { ok: false, error: 'Method not allowed' });
    return false;
  }
  return true;
}

export async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return {};
  return JSON.parse(text);
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payload) {
  const secret = process.env.ADMIN_KANBAN_SESSION_SECRET;
  if (!secret) throw new Error('ADMIN_KANBAN_SESSION_SECRET missing');
  const encoded = base64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySession(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new HttpError('Admin session missing', 401);
  const secret = process.env.ADMIN_KANBAN_SESSION_SECRET;
  if (!secret) throw new Error('ADMIN_KANBAN_SESSION_SECRET missing');
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) throw new HttpError('Admin session invalid', 401);
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new HttpError('Admin session invalid', 401);
  }
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (!payload.exp || Number(payload.exp) <= Date.now()) throw new HttpError('Admin session expired', 401);
  return payload;
}

export class HttpError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

function verifyPbkdf2(passphrase, spec) {
  const [kind, iterationsText, saltB64, hashB64] = String(spec || '').split(':');
  if (kind !== 'pbkdf2' || !saltB64 || !hashB64) throw new Error('ADMIN_KANBAN_HASH format invalid');
  const iterations = Number(iterationsText) || 100000;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.pbkdf2Sync(String(passphrase || ''), salt, iterations, expected.length, 'sha256');
  return crypto.timingSafeEqual(actual, expected);
}

export function verifyAdminPassphrase(passphrase) {
  const hash = process.env.ADMIN_KANBAN_HASH;
  if (!hash) throw new Error('ADMIN_KANBAN_HASH missing');
  return verifyPbkdf2(passphrase, hash);
}

export function createAdminSession() {
  const adminSubject = process.env.ADMIN_KANBAN_SUBJECT || 'admin';
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = sign({ sub: adminSubject, iat: Date.now(), exp: expiresAt });
  return { token, adminSubject, expiresAt: new Date(expiresAt).toISOString() };
}

function redact(value) {
  return String(value || '')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted-key]')
    .replace(/ntn_[A-Za-z0-9]+/g, '[redacted-token]')
    .replace(/secret_[A-Za-z0-9]+/g, '[redacted-token]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]');
}

export async function handler(req, res, fn) {
  try {
    await fn();
  } catch (error) {
    const status = Number(error?.status || 500);
    send(res, status, { ok: false, error: redact(error?.message || error) });
  }
}
