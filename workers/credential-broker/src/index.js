const SERVICE = 'travel-expense-credential-broker';
const VERSION = '2026.05.08';
const SESSION_HEADER = 'X-Travel-Session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const TRUSTED_DEVICE_COOKIE = 'te_trusted_device';
const TRUSTED_DEVICE_TTL_MS = 1000 * 60 * 60 * 24 * 90;
const MAX_JSON_BYTES = 900000;
const PROVIDERS = ['notion', 'kimi', 'google'];
const NOTION_VERSION = '2022-06-28';
const KIMI_DEFAULT_BASE = 'https://api.kimi.com/coding/v1';
const GOOGLE_DEFAULT_MODEL = 'gemini-2.5-flash';
const RATE_WINDOW_MS = 1000 * 60 * 15;

class HttpError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function originInfo(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = allowedOrigins(env);
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  const matched = !!origin && (allowed.includes(origin) || isLocal);
  return { origin, allowed, matched };
}

function corsHeaders(request, env) {
  const { origin, matched } = originInfo(request, env);
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': `Content-Type, ${SESSION_HEADER}`,
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (matched) headers['Access-Control-Allow-Origin'] = origin;
  if (matched) headers['Access-Control-Allow-Credentials'] = 'true';
  return headers;
}

function isAllowedOrigin(request, env, { allowMissing = false } = {}) {
  const { origin, matched } = originInfo(request, env);
  if (!origin) return allowMissing;
  return matched;
}

function enforceAllowedOrigin(request, env, options) {
  if (!isAllowedOrigin(request, env, options)) throw new HttpError('Origin not allowed', 403);
}

function redact(value) {
  return String(value || 'Unknown error')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[redacted-key]')
    .replace(/ntn_[A-Za-z0-9]{12,}/g, '[redacted-token]')
    .replace(/secret_[A-Za-z0-9]{12,}/g, '[redacted-token]')
    .replace(/AIza[0-9A-Za-z_-]{12,}/g, '[redacted-key]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]');
}

function parseCookieValue(request, name) {
  const source = request.headers.get('Cookie') || '';
  if (!source) return '';
  const parts = source.split(';').map((item) => item.trim());
  for (const part of parts) {
    const [key, ...rest] = part.split('=');
    if (key === name) return decodeURIComponent(rest.join('=') || '');
  }
  return '';
}

function trustedCookie(value, maxAgeSec) {
  return [
    `${TRUSTED_DEVICE_COOKIE}=${encodeURIComponent(String(value || ''))}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=None',
    `Max-Age=${Math.max(0, Number(maxAgeSec) || 0)}`,
  ].join('; ');
}

function b64ToBytes(value) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function bytesToB64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function b64UrlEncode(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return atob(padded);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function sha256Id(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToB64(new Uint8Array(bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signSession(payload, env) {
  if (!env.APP_SESSION_SECRET) throw new Error('APP_SESSION_SECRET missing');
  const encoded = b64UrlEncode(payload);
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env.APP_SESSION_SECRET), new TextEncoder().encode(encoded));
  return `${encoded}.${b64UrlEncode(bytesToB64(new Uint8Array(sig)))}`;
}

async function verifySession(token, env) {
  if (!token) throw new HttpError('Session missing', 401);
  if (!env.APP_SESSION_SECRET) throw new Error('APP_SESSION_SECRET missing');
  try {
    const [encoded, signature] = String(token).split('.');
    if (!encoded || !signature) throw new HttpError('Session invalid', 401);
    const expected = await crypto.subtle.sign('HMAC', await hmacKey(env.APP_SESSION_SECRET), new TextEncoder().encode(encoded));
    const actual = b64ToBytes(b64UrlDecode(signature));
    if (!constantTimeEqual(new Uint8Array(expected), actual)) throw new HttpError('Session invalid', 401);
    const payload = JSON.parse(b64UrlDecode(encoded));
    if (!payload?.exp || Number(payload.exp) <= Date.now()) throw new HttpError('Session expired', 401);
    return payload;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError('Session invalid', 401);
  }
}

async function signTrustedDevice(env, userAgent) {
  const expiresAt = Date.now() + TRUSTED_DEVICE_TTL_MS;
  const token = await signSession({ sub: 'travel-expense-device', ua: await sha256Id(userAgent || ''), exp: expiresAt, iat: Date.now() }, env);
  return { token, expiresAt };
}

async function verifyTrustedDeviceCookie(request, env) {
  const token = parseCookieValue(request, TRUSTED_DEVICE_COOKIE);
  if (!token) throw new HttpError('Trusted device missing', 401);
  const payload = await verifySession(token, env);
  if (payload?.sub !== 'travel-expense-device') throw new HttpError('Trusted device invalid', 401);
  return payload;
}

async function verifyPassword(password, hashSpec) {
  if (!hashSpec) throw new Error('Password hash missing');
  const [kind, iterationText, saltB64, hashB64] = String(hashSpec).split(':');
  if (kind !== 'pbkdf2' || !saltB64 || !hashB64) throw new Error('Password hash format invalid');
  const iterations = Number(iterationText) || 100000;
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100000) {
    throw new Error('Password hash iteration count unsupported');
  }
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(password || '')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: b64ToBytes(saltB64),
    iterations,
  }, material, b64ToBytes(hashB64).length * 8);
  return constantTimeEqual(new Uint8Array(bits), b64ToBytes(hashB64));
}

async function readTextWithLimit(stream, lengthHeader, maxBytes = MAX_JSON_BYTES) {
  const length = Number(lengthHeader || 0);
  if (length > maxBytes) throw new HttpError('JSON payload too large', 413);
  if (!stream) return '';

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new HttpError('JSON payload too large', 413);
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

async function readJson(request) {
  const text = await readTextWithLimit(request.body, request.headers.get('Content-Length'));
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError('Request body must be valid JSON', 400);
  }
}

async function vaultKey(env) {
  if (!env.CREDENTIALS_KEK) throw new Error('CREDENTIALS_KEK missing');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.CREDENTIALS_KEK));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function encryptVaultValue(env, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await vaultKey(env), plaintext);
  return {
    version: 1,
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(new Uint8Array(ciphertext)),
    updatedAt: Date.now(),
  };
}

async function decryptVaultValue(env, sealed) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(sealed.iv) },
    await vaultKey(env),
    b64ToBytes(sealed.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

function vaultId(provider) {
  if (!PROVIDERS.includes(provider)) throw new Error('Unknown provider');
  return `credential:${provider}`;
}

async function readCredential(env, provider) {
  const raw = await env.CREDENTIALS_VAULT.get(vaultId(provider), 'json');
  if (!raw) return null;
  return decryptVaultValue(env, raw);
}

async function writeCredential(env, provider, secret, extra = {}, status = 'unknown', meta = {}) {
  const sealed = await encryptVaultValue(env, {
    provider,
    secret: String(secret || ''),
    extra,
    status,
    lastTestedAt: meta.lastTestedAt,
    message: meta.message ? redact(meta.message) : undefined,
    updatedAt: Date.now(),
  });
  await env.CREDENTIALS_VAULT.put(vaultId(provider), JSON.stringify(sealed));
}

async function rateLimitKey(request, scope) {
  const origin = request.headers.get('Origin') || 'no-origin';
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown-ip';
  return `rate:${scope}:${await sha256Id(`${origin}|${ip}`)}`;
}

function rateLimitMax(env, scope) {
  const configured = Number(scope === 'admin' ? env.ADMIN_MAX_FAILURES : env.UNLOCK_MAX_FAILURES);
  if (Number.isInteger(configured) && configured > 0) return configured;
  return scope === 'admin' ? 5 : 10;
}

async function enforceRateLimit(request, env, scope) {
  const key = await rateLimitKey(request, scope);
  const record = await env.CREDENTIALS_VAULT.get(key, 'json');
  const now = Date.now();
  if (record?.resetAt && record.resetAt > now && Number(record.count || 0) >= rateLimitMax(env, scope)) {
    throw new HttpError('Too many attempts', 429);
  }
  return key;
}

async function recordFailedAttempt(env, key) {
  if (!key) return;
  const now = Date.now();
  const current = await env.CREDENTIALS_VAULT.get(key, 'json');
  const resetAt = current?.resetAt && current.resetAt > now ? current.resetAt : now + RATE_WINDOW_MS;
  const count = current?.resetAt && current.resetAt > now ? Number(current.count || 0) + 1 : 1;
  await env.CREDENTIALS_VAULT.put(key, JSON.stringify({ count, resetAt, updatedAt: now }));
}

async function clearFailedAttempts(env, key) {
  if (!key) return;
  if (typeof env.CREDENTIALS_VAULT.delete === 'function') {
    await env.CREDENTIALS_VAULT.delete(key);
  } else {
    await env.CREDENTIALS_VAULT.put(key, JSON.stringify({ count: 0, resetAt: 0, updatedAt: Date.now() }));
  }
}

async function providerStatus(env, provider) {
  const raw = await env.CREDENTIALS_VAULT.get(vaultId(provider), 'json');
  if (!raw) return { provider, status: 'missing' };
  const data = await decryptVaultValue(env, raw);
  return {
    provider,
    status: data.status || 'unknown',
    updatedAt: data.updatedAt || raw.updatedAt,
    lastTestedAt: data.lastTestedAt,
  };
}

function safeNotionPath(path) {
  const clean = String(path || '').trim();
  if (!clean.startsWith('/')) throw new Error('Notion path invalid');
  if (!/^\/(databases|pages|blocks)(\/|$)/.test(clean)) throw new Error('Notion path not allowed');
  return clean;
}

async function fetchNotion(env, path, method, body, databaseId) {
  const credential = await readCredential(env, 'notion');
  if (!credential?.secret) throw new Error('Notion credential missing');
  const url = `https://api.notion.com/v1${safeNotionPath(path)}`;
  const response = await fetch(url, {
    method: method || 'GET',
    headers: {
      Authorization: `Bearer ${credential.secret}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: body == null ? undefined : JSON.stringify(rewriteDatabaseBody(body, databaseId || credential.extra?.databaseId)),
  });
  return parseProviderJson(response);
}

function rewriteDatabaseBody(body, databaseId) {
  if (!databaseId || !body || typeof body !== 'object') return body;
  if (body.parent?.database_id) return body;
  if (body.parent && typeof body.parent === 'object') return { ...body, parent: { ...body.parent, database_id: databaseId } };
  return body;
}

async function parseProviderJson(response) {
  const text = await readTextWithLimit(response.body, response.headers.get('Content-Length'));
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(redact(`${response.status} ${response.statusText || 'Invalid provider JSON'}`));
  }
  if (!response.ok) throw new Error(redact(data?.error?.message || data?.message || `${response.status} ${response.statusText}`));
  return data;
}

async function testNotion(env, credential) {
  const db = credential.extra?.databaseId;
  if (!db) return 'connected';
  const response = await fetch(`https://api.notion.com/v1/databases/${db}`, {
    headers: {
      Authorization: `Bearer ${credential.secret}`,
      'Notion-Version': NOTION_VERSION,
    },
  });
  await parseProviderJson(response);
  return 'connected';
}

async function kimiJson(env, prompt, kind, image) {
  const credential = await readCredential(env, 'kimi');
  if (!credential?.secret) throw new Error('Kimi credential missing');
  const base = String(env.KIMI_PROXY_URL || env.KIMI_API_BASE || KIMI_DEFAULT_BASE).replace(/\/+$/, '');
  const messages = [
    { role: 'system', content: 'Return strict JSON only. No markdown.' },
    { role: 'user', content: image ? [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.base64}` } },
    ] : prompt },
  ];
  const data = await parseProviderJson(await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential.secret}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'claude-code/0.1.0',
    },
    body: JSON.stringify({
      model: env.KIMI_MODEL || 'kimi-for-coding',
      messages,
      temperature: kind === 'test' ? 0 : 0.1,
      thinking: { type: 'disabled' },
    }),
  }));
  return extractJson(data?.choices?.[0]?.message?.content || data?.content || '');
}

async function googleJson(env, prompt, _kind, image, requestedModel) {
  const credential = await readCredential(env, 'google');
  if (!credential?.secret) throw new Error('Google credential missing');
  const model = String(requestedModel || env.GOOGLE_MODEL || GOOGLE_DEFAULT_MODEL).replace(/^models\//, '');
  const parts = [{ text: prompt }];
  if (image?.base64) parts.push({ inlineData: { mimeType: image.mime, data: image.base64 } });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(credential.secret)}`;
  const data = await parseProviderJson(await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
    }),
  }));
  return extractJson(data?.candidates?.[0]?.content?.parts?.[0]?.text || '');
}

function extractJson(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!match) throw new Error('Provider returned non-JSON response');
    return JSON.parse(match[1]);
  }
}

async function testProvider(env, provider, candidateSecret, extra = {}) {
  const credential = candidateSecret
    ? { secret: candidateSecret, extra }
    : await readCredential(env, provider);
  if (!credential?.secret) return { provider, status: 'missing' };
  try {
    if (provider === 'notion') await testNotion(env, credential);
    if (provider === 'kimi') await kimiJsonWithCredential(env, credential);
    if (provider === 'google') await googleModelsList(credential.secret);
    return { provider, status: 'connected', lastTestedAt: Date.now() };
  } catch (error) {
    return { provider, status: 'invalid', lastTestedAt: Date.now(), message: redact(error?.message || error) };
  }
}

async function kimiJsonWithCredential(env, credential) {
  const base = String(env.KIMI_PROXY_URL || env.KIMI_API_BASE || KIMI_DEFAULT_BASE).replace(/\/+$/, '');
  const data = await parseProviderJson(await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential.secret}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'claude-code/0.1.0',
    },
    body: JSON.stringify({
      model: env.KIMI_MODEL || 'kimi-for-coding',
      messages: [{ role: 'user', content: 'Return {"ok":true} as JSON.' }],
      temperature: 0,
      thinking: { type: 'disabled' },
    }),
  }));
  return extractJson(data?.choices?.[0]?.message?.content || '');
}

async function googleModelsList(key) {
  const data = await parseProviderJson(await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`));
  if (!Array.isArray(data.models)) throw new Error('Google models.list unavailable');
  return data.models;
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    const cors = corsHeaders(request, env);
    return new Response(null, { status: isAllowedOrigin(request, env) ? 204 : 403, headers: cors });
  }
  const cors = corsHeaders(request, env);
  try {
    if (url.pathname === '/health') {
      enforceAllowedOrigin(request, env, { allowMissing: true });
      return json({ ok: true, service: SERVICE, version: VERSION }, 200, cors);
    }
    enforceAllowedOrigin(request, env);
    if (url.pathname === '/session/unlock') {
      const rateKey = await enforceRateLimit(request, env, 'unlock');
      const body = await readJson(request);
      const ok = await verifyPassword(body.password, env.APP_UNLOCK_HASH);
      if (!ok) {
        await recordFailedAttempt(env, rateKey);
        return json({ ok: false, error: 'Unlock failed' }, 401, cors);
      }
      await clearFailedAttempts(env, rateKey);
      const expiresAt = Date.now() + SESSION_TTL_MS;
      const session = await signSession({ sub: 'travel-expense', exp: expiresAt, iat: Date.now() }, env);
      const trusted = await signTrustedDevice(env, request.headers.get('User-Agent') || '');
      return json({ ok: true, session, expiresAt, trustedDeviceExpiresAt: trusted.expiresAt }, 200, {
        ...cors,
        'Set-Cookie': trustedCookie(trusted.token, TRUSTED_DEVICE_TTL_MS / 1000),
      });
    }

    if (url.pathname === '/session/restore') {
      await verifyTrustedDeviceCookie(request, env);
      const expiresAt = Date.now() + SESSION_TTL_MS;
      const session = await signSession({ sub: 'travel-expense', exp: expiresAt, iat: Date.now() }, env);
      return json({ ok: true, session, expiresAt }, 200, cors);
    }

    if (url.pathname === '/session/logout') {
      return json({ ok: true }, 200, {
        ...cors,
        'Set-Cookie': trustedCookie('', 0),
      });
    }

    await verifySession(request.headers.get(SESSION_HEADER), env);

    if (url.pathname === '/credentials/status') {
      return json({ ok: true, broker: 'online', providers: await Promise.all(PROVIDERS.map((provider) => providerStatus(env, provider))) }, 200, cors);
    }
    if (url.pathname === '/credentials/test') {
      const body = await readJson(request);
      return json({ ok: true, status: await testProvider(env, body.provider) }, 200, cors);
    }
    if (url.pathname === '/credentials/test-all') {
      return json({ ok: true, providers: await Promise.all(PROVIDERS.map((provider) => testProvider(env, provider))) }, 200, cors);
    }
    if (url.pathname === '/credentials/rotate') {
      const body = await readJson(request);
      const rateKey = await enforceRateLimit(request, env, 'admin');
      if (!await verifyPassword(body.adminPassphrase, env.ADMIN_ROTATION_HASH)) {
        await recordFailedAttempt(env, rateKey);
        return json({ ok: false, error: 'Admin re-auth failed' }, 403, cors);
      }
      await clearFailedAttempts(env, rateKey);
      if (!PROVIDERS.includes(body.provider)) throw new Error('Unknown provider');
      const status = await testProvider(env, body.provider, body.secret, body.extra || {});
      if (status.status !== 'connected') return json({ ok: false, status, error: 'Credential test failed' }, 400, cors);
      await writeCredential(env, body.provider, body.secret, body.extra || {}, 'connected', status);
      return json({ ok: true, status }, 200, cors);
    }
    if (url.pathname === '/notion/request') {
      const body = await readJson(request);
      const data = await fetchNotion(env, body.path, body.method, body.body, body.databaseId);
      return json({ ok: true, data }, 200, cors);
    }
    if (url.pathname === '/kimi/json') {
      const body = await readJson(request);
      return json({ ok: true, data: await kimiJson(env, body.prompt, body.kind, body.image) }, 200, cors);
    }
    if (url.pathname === '/google/json') {
      const body = await readJson(request);
      return json({ ok: true, data: await googleJson(env, body.prompt, body.kind, body.image, body.model) }, 200, cors);
    }
    return json({ ok: false, error: 'Not found' }, 404, cors);
  } catch (error) {
    const status = Number(error?.status || 500);
    return json({ ok: false, error: redact(error?.message || error) }, status, cors);
  }
}

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
