export const SESSION_COOKIE = '__Host-admin_session';
export const CSRF_COOKIE = '__Host-admin_csrf';

export function parseCookies(req) {
  const result = {};
  const header = String(req.headers.cookie || '');
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = '';
    }
  }
  return result;
}

function cookie(name, value, { httpOnly = false, maxAge = 7200 } = {}) {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'Secure',
    'SameSite=Strict',
  ];
  if (httpOnly) attributes.push('HttpOnly');
  return attributes.join('; ');
}

export function sessionCookies(sessionToken, csrfToken) {
  return [
    cookie(SESSION_COOKIE, sessionToken, { httpOnly: true }),
    cookie(CSRF_COOKIE, csrfToken),
  ];
}

export function clearSessionCookies() {
  return [
    cookie(SESSION_COOKIE, '', { httpOnly: true, maxAge: 0 }),
    cookie(CSRF_COOKIE, '', { maxAge: 0 }),
  ];
}
