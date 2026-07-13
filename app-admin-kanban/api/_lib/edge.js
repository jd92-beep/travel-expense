import crypto from 'node:crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_RE = /^(?:[0-9a-f]{64}|unauthenticated)$/;

function rfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function canonicalQuery(searchParams) {
  const entries = [];
  const seen = new Set();
  for (const [key, value] of searchParams.entries()) {
    if (seen.has(key)) throw new Error('Duplicate query parameters are not allowed');
    seen.add(key);
    entries.push([key, value]);
  }
  entries.sort(([leftKey, leftValue], [rightKey, rightValue]) =>
    leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
  return entries.map(([key, value]) => `${rfc3986(key)}=${rfc3986(value)}`).join('&');
}

export function normalizeSignedRoute(route) {
  const value = String(route || '');
  let decoded;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new Error('Invalid signed Edge route encoding');
  }
  if (!decoded.startsWith('/') || decoded.includes('\0') || decoded.includes('//')) {
    throw new Error('Invalid signed Edge route');
  }
  if (decoded.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new Error('Invalid signed Edge route segments');
  }
  return decoded;
}

export function canonicalBffPayload(input) {
  return [
    'admin-v1',
    input.keyId,
    input.method.toUpperCase(),
    input.route,
    input.query,
    input.bodyHash,
    input.requestId,
    input.sessionHash,
    input.actor,
    String(input.issuedAt),
    String(input.expiresAt),
    input.nonce,
  ].join('\n');
}

function signingConfig() {
  const keyId = String(process.env.ADMIN_BFF_KEY_ID || '').trim();
  const secret = String(process.env.ADMIN_BFF_SIGNING_KEY || '');
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(keyId) || secret.length < 32) {
    throw new Error('Admin BFF signing key is not configured');
  }
  return { keyId, secret };
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sessionHash(token) {
  return token ? sha256(String(token)) : 'unauthenticated';
}

export function signedEdgeHeaders({
  actor,
  bodyBytes,
  keyId,
  method,
  nonce,
  nowSeconds,
  query,
  requestId,
  route,
  secret,
  sessionHash: boundSessionHash,
}) {
  if (!UUID_RE.test(requestId) || !HASH_RE.test(boundSessionHash)) {
    throw new Error('Invalid signed Edge request context');
  }
  const issuedAt = nowSeconds;
  const expiresAt = issuedAt + 30;
  const payload = canonicalBffPayload({
    actor,
    bodyHash: sha256(bodyBytes),
    expiresAt,
    issuedAt,
    keyId,
    method,
    nonce,
    query,
    requestId,
    route,
    sessionHash: boundSessionHash,
  });
  return {
    'X-Admin-Key-Id': keyId,
    'X-Admin-Request-Id': requestId,
    'X-Admin-Session-Hash': boundSessionHash,
    'X-Admin-Actor': actor,
    'X-Admin-Issued-At': String(issuedAt),
    'X-Admin-Expires-At': String(expiresAt),
    'X-Admin-Nonce': nonce,
    'X-Admin-Signature': crypto.createHmac('sha256', secret).update(payload).digest('base64url'),
  };
}

export async function callSignedEdge({
  actor = process.env.ADMIN_KANBAN_SUBJECT || 'boss',
  baseUrl,
  body,
  method = 'POST',
  query,
  requestId: boundRequestId,
  route,
  sessionHash: boundSessionHash = 'unauthenticated',
  timeoutMs,
}) {
  const normalizedRoute = normalizeSignedRoute(route);
  const target = new URL(`${String(baseUrl || '').replace(/\/+$/, '')}${normalizedRoute}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
    }
  }
  const canonical = canonicalQuery(target.searchParams);
  const bodyBytes = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
  const upperMethod = method.toUpperCase();
  const maxAttempts = upperMethod === 'GET' ? 3 : 1;
  const { keyId, secret } = signingConfig();
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const requestId = boundRequestId || crypto.randomUUID();
    const nonce = crypto.randomBytes(16).toString('base64url');
    const headers = signedEdgeHeaders({
      actor,
      bodyBytes,
      keyId,
      method: upperMethod,
      nonce,
      nowSeconds: Math.floor(Date.now() / 1000),
      query: canonical,
      requestId,
      route: normalizedRoute,
      secret,
      sessionHash: boundSessionHash,
    });
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? (upperMethod === 'GET' ? 10_000 : 30_000));
    try {
      const response = await fetch(target, {
        method: upperMethod,
        headers,
        body: body === undefined ? undefined : bodyBytes,
        redirect: 'manual',
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        throw new Error('Signed Edge request redirect rejected');
      }
      if (upperMethod === 'GET' && response.status >= 500 && attempt + 1 < maxAttempts) {
        await response.arrayBuffer();
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (upperMethod !== 'GET' || attempt + 1 >= maxAttempts) throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('Signed Edge request failed');
}

function requiredInternalEdgeUrl(name, functionName) {
  const raw = String(process.env[name] || '').trim().replace(/\/+$/, '');
  if (!raw) throw new Error(`${name} is not configured`);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} is invalid`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || url.pathname !== `/functions/v1/${functionName}`) {
    throw new Error(`${name} is invalid`);
  }
  return raw;
}

export function adminEdgeUrl() {
  return requiredInternalEdgeUrl('ADMIN_EDGE_ADMIN_URL', 'admin-kanban');
}

export function adminAuthStateUrl() {
  return requiredInternalEdgeUrl('ADMIN_EDGE_AUTH_STATE_URL', 'admin-auth-state');
}
