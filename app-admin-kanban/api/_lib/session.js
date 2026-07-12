import { authStateCall } from './auth-state.js';
import { clearSessionCookies, CSRF_COOKIE, parseCookies, SESSION_COOKIE, sessionCookies } from './cookies.js';
import { passphraseFingerprint, randomToken, sha256Hex, timingSafeStringEqual } from './crypto.js';
import { HttpError, requireSameOriginMutation } from './http.js';

export async function createOpaqueSession(res, actor = process.env.ADMIN_KANBAN_SUBJECT || 'boss') {
  const sessionToken = randomToken(32);
  const csrfToken = randomToken(32);
  const tokenHash = sha256Hex(sessionToken);
  const csrfHash = sha256Hex(csrfToken);
  const data = await authStateCall('/internal/session/create', {
    tokenHash,
    csrfHash,
    authMethod: 'passphrase+passkey',
    passphraseFingerprint: passphraseFingerprint(),
  }, { actor });
  res.setHeader('Set-Cookie', sessionCookies(sessionToken, csrfToken));
  return { ...data, tokenHash };
}

export async function requireAdminSession(req, { mutation = false } = {}) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE] || '';
  if (!token) throw new HttpError('UNAUTHORIZED', 'Admin session required', 401);
  const tokenHash = sha256Hex(token);
  const data = await authStateCall('/internal/session/verify', {
    tokenHash,
    passphraseFingerprint: passphraseFingerprint(),
  }, { sessionHash: tokenHash });
  if (!data?.sessionId) throw new HttpError('UNAUTHORIZED', 'Admin session expired', 401);

  if (mutation) {
    requireSameOriginMutation(req);
    const csrfCookie = cookies[CSRF_COOKIE] || '';
    const csrfHeader = String(req.headers['x-admin-csrf'] || '');
    if (!csrfCookie || !csrfHeader || !timingSafeStringEqual(csrfCookie, csrfHeader)
      || !timingSafeStringEqual(sha256Hex(csrfHeader), String(data.csrfHash || ''))) {
      throw new HttpError('CSRF_REJECTED', 'CSRF validation failed', 403);
    }
  }

  return { ...data, tokenHash };
}

export async function revokeAdminSession(req, res, reason = 'logout') {
  const token = parseCookies(req)[SESSION_COOKIE] || '';
  if (token) {
    const tokenHash = sha256Hex(token);
    await authStateCall('/internal/session/revoke', { tokenHash, reason }, { sessionHash: tokenHash }).catch(() => null);
  }
  res.setHeader('Set-Cookie', clearSessionCookies());
}

export async function rotateOpaqueSession(res, currentSession) {
  const nextSession = await createOpaqueSession(res, currentSession.actor);
  await authStateCall('/internal/session/revoke', {
    tokenHash: currentSession.tokenHash,
    reason: 'privilege_elevation',
  }, { sessionHash: currentSession.tokenHash });
  return nextSession;
}
