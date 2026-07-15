const SERVICE = 'travel-expense-credential-broker';
const VERSION = '2026.07.15.2';
const SESSION_HEADER = 'X-Travel-Session';
const SUPABASE_AUTH_HEADER = 'X-Supabase-Auth';
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const TRUSTED_DEVICE_TTL_MS = 1000 * 60 * 60 * 24 * 90;
const SESSION_CHALLENGE_TTL_MS = 1000 * 60 * 5;
const MAX_JSON_BYTES = 4500000;
const PROVIDERS = ['notion', 'kimi', 'google', 'weatherapi', 'mimo', 'volcano'];
const PROVIDER_MODELS = Object.freeze({
  kimi: ['kimi/kimi-code', 'kimi/kimi-8k', 'kimi/kimi-32k', 'kimi/kimi-k2.6', 'kimi/kimi-for-coding'],
  google: ['google/gemini-2.5-flash', 'google/gemini-3.1-flash', 'google/gemini-3.1-flash-lite', 'google/gemma-4-31b-it', 'google/gemma-4-26b'],
  mimo: ['mimo/mimo-v2.5', 'mimo/mimo-v2.5-pro'],
  volcano: [
    'volcano/doubao-seed-2.0-lite',
    'volcano/doubao-seed-2.0-pro',
    'volcano/minimax-m3',
    'volcano/minimax-m2.7',
    'volcano/doubao-seed-2.0-mini',
  ],
});
const NOTION_VERSION = '2022-06-28';
const KIMI_DEFAULT_BASE = 'https://api.kimi.com/coding/v1';
const MIMO_DEFAULT_BASE = 'https://token-plan-sgp.xiaomimimo.com/v1';
const MIMO_PAYG_BASE = 'https://api.xiaomimimo.com/v1';
const VOLCANO_DEFAULT_BASE = 'https://ark.cn-beijing.volces.com/api/plan/v3';
const GOOGLE_DEFAULT_MODEL = 'gemma-4-31b-it';
const RATE_WINDOW_MS = 1000 * 60 * 15;
const DEFAULT_SUPABASE_AI_DAILY_LIMIT = 50;
const BOSS_EMAIL = 'vc06456@gmail.com';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRIP_THEME_KEYS = ['japan_washi', 'korea_editorial', 'taiwan_nightmarket', 'europe_rail', 'global_journal'];
const TRIP_CONTEXTS = [
  { countryCode: 'JP', countryName: 'Japan', primaryCurrency: 'JPY', themeKey: 'japan_washi', locale: 'ja-JP', timezone: 'Asia/Tokyo', weatherRegion: 'Japan', pattern: /日本|東京|东京|大阪|名古屋|京都|札幌|沖繩|冲绳|japan|tokyo|osaka|nagoya|kyoto|sapporo|okinawa|jpy/i },
  { countryCode: 'KR', countryName: 'Korea', primaryCurrency: 'KRW', themeKey: 'korea_editorial', locale: 'ko-KR', timezone: 'Asia/Seoul', weatherRegion: 'South Korea', pattern: /韓國|韩国|首爾|首尔|釜山|濟州|济州|korea|seoul|busan|jeju|krw/i },
  { countryCode: 'TW', countryName: 'Taiwan', primaryCurrency: 'TWD', themeKey: 'taiwan_nightmarket', locale: 'zh-TW', timezone: 'Asia/Taipei', weatherRegion: 'Taiwan', pattern: /台灣|台湾|台北|台中|台南|高雄|taiwan|taipei|taichung|tainan|kaohsiung|twd/i },
  { countryCode: 'GB', countryName: 'United Kingdom', primaryCurrency: 'GBP', themeKey: 'europe_rail', locale: 'en-GB', timezone: 'Europe/London', weatherRegion: 'United Kingdom', pattern: /英國|英国|倫敦|伦敦|\buk\b|london|gbp/i },
  { countryCode: 'EU', countryName: 'Europe', primaryCurrency: 'EUR', themeKey: 'europe_rail', locale: 'en-GB', timezone: 'Europe/Paris', weatherRegion: 'Europe', pattern: /歐洲|欧洲|歐元|法国|法國|巴黎|德國|德国|意大利|italy|france|paris|germany|europe|eur/i },
  { countryCode: 'HK', countryName: 'Hong Kong', primaryCurrency: 'HKD', themeKey: 'global_journal', locale: 'zh-HK', timezone: 'Asia/Hong_Kong', weatherRegion: 'Hong Kong', pattern: /香港|hong\s*kong|\bhk\b|hkd/i },
  { countryCode: 'CN', countryName: 'China', primaryCurrency: 'CNY', themeKey: 'global_journal', locale: 'zh-CN', timezone: 'Asia/Shanghai', weatherRegion: 'China', pattern: /中國|中国|上海|北京|深圳|廣州|广州|china|shanghai|beijing|shenzhen|guangzhou|cny/i },
  { countryCode: 'SG', countryName: 'Singapore', primaryCurrency: 'SGD', themeKey: 'global_journal', locale: 'en-SG', timezone: 'Asia/Singapore', weatherRegion: 'Singapore', pattern: /新加坡|singapore|sgd/i },
  { countryCode: 'TH', countryName: 'Thailand', primaryCurrency: 'THB', themeKey: 'global_journal', locale: 'th-TH', timezone: 'Asia/Bangkok', weatherRegion: 'Thailand', pattern: /泰國|泰国|曼谷|清邁|清迈|thailand|bangkok|chiang\s*mai|thb/i },
  { countryCode: 'MY', countryName: 'Malaysia', primaryCurrency: 'MYR', themeKey: 'global_journal', locale: 'ms-MY', timezone: 'Asia/Kuala_Lumpur', weatherRegion: 'Malaysia', pattern: /馬來西亞|马来西亚|吉隆坡|malaysia|kuala\s*lumpur|myr/i },
  { countryCode: 'VN', countryName: 'Vietnam', primaryCurrency: 'VND', themeKey: 'global_journal', locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh', weatherRegion: 'Vietnam', pattern: /越南|河內|河内|胡志明|vietnam|hanoi|ho\s*chi\s*minh|vnd/i },
  { countryCode: 'PH', countryName: 'Philippines', primaryCurrency: 'PHP', themeKey: 'global_journal', locale: 'en-PH', timezone: 'Asia/Manila', weatherRegion: 'Philippines', pattern: /菲律賓|菲律宾|馬尼拉|马尼拉|philippines|manila|php/i },
  { countryCode: 'AU', countryName: 'Australia', primaryCurrency: 'AUD', themeKey: 'global_journal', locale: 'en-AU', timezone: 'Australia/Sydney', weatherRegion: 'Australia', pattern: /澳洲|悉尼|雪梨|墨爾本|墨尔本|australia|sydney|melbourne|aud/i },
  { countryCode: 'NZ', countryName: 'New Zealand', primaryCurrency: 'NZD', themeKey: 'global_journal', locale: 'en-NZ', timezone: 'Pacific/Auckland', weatherRegion: 'New Zealand', pattern: /紐西蘭|新西蘭|奧克蘭|奥克兰|new\s*zealand|auckland|nzd/i },
  { countryCode: 'US', countryName: 'United States', primaryCurrency: 'USD', themeKey: 'global_journal', locale: 'en-US', timezone: 'America/New_York', weatherRegion: 'United States', pattern: /美國|美国|紐約|纽约|洛杉磯|洛杉矶|usa|america|new\s*york|los\s*angeles|usd/i },
];

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
    'Access-Control-Allow-Headers': `Content-Type, ${SESSION_HEADER}, ${SUPABASE_AUTH_HEADER}`,
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (matched) headers['Access-Control-Allow-Origin'] = origin;
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
    .replace(/([?&]key=)[^&\s]+/gi, '$1[redacted-key]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]');
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

function bytesToB64Url(bytes) {
  return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return atob(padded);
}

function b64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function randomToken(bytes = 32) {
  const buffer = crypto.getRandomValues(new Uint8Array(bytes));
  return bytesToB64Url(buffer);
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function isEdgeBrokerRequest(request, env) {
  const expected = String(env.EDGE_BROKER_KEY || '');
  const provided = String(request.headers.get('X-Admin-Internal') || '');
  if (expected.length < 32 || !provided) return false;
  const encoder = new TextEncoder();
  const [expectedHash, providedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
  ]);
  return constantTimeEqual(new Uint8Array(expectedHash), new Uint8Array(providedHash));
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

function deviceKey(deviceId) {
  return `trusted-device:${deviceId}`;
}

function challengeKey(deviceId, challenge) {
  return `session-challenge:${deviceId}:${challenge}`;
}

function sanitizeDeviceName(value) {
  return String(value || 'Trusted device').trim().slice(0, 80) || 'Trusted device';
}

async function importDevicePublicKey(publicKey) {
  if (!publicKey || typeof publicKey !== 'object') throw new HttpError('Device public key missing', 400);
  try {
    return await crypto.subtle.importKey(
      'jwk',
      publicKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
  } catch {
    throw new HttpError('Device public key invalid', 400);
  }
}

async function registerTrustedDevice(request, env, body) {
  if (!body.trustDevice) return null;
  await importDevicePublicKey(body.devicePublicKey);
  const origin = request.headers.get('Origin') || '';
  const now = Date.now();
  const deviceId = randomToken(18);
  const record = {
    deviceId,
    publicKey: body.devicePublicKey,
    origin,
    deviceName: sanitizeDeviceName(body.deviceName),
    createdAt: now,
    expiresAt: now + TRUSTED_DEVICE_TTL_MS,
  };
  await env.CREDENTIALS_VAULT.put(deviceKey(deviceId), JSON.stringify(record), {
    expirationTtl: Math.ceil(TRUSTED_DEVICE_TTL_MS / 1000),
  });
  return {
    deviceId,
    deviceName: record.deviceName,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
  };
}

async function readTrustedDevice(request, env, deviceId) {
  const cleanDeviceId = String(deviceId || '').trim();
  if (!cleanDeviceId) throw new HttpError('Device missing', 400);
  const record = await env.CREDENTIALS_VAULT.get(deviceKey(cleanDeviceId), 'json');
  if (!record || record.revokedAt) throw new HttpError('Device not trusted', 401);
  if (Number(record.expiresAt || 0) <= Date.now()) throw new HttpError('Device expired', 401);
  const origin = request.headers.get('Origin') || '';
  if (!origin || record.origin !== origin) throw new HttpError('Device origin mismatch', 403);
  return record;
}

async function createSessionChallenge(request, env, body) {
  const device = await readTrustedDevice(request, env, body.deviceId);
  const now = Date.now();
  const challenge = randomToken(32);
  const record = {
    deviceId: device.deviceId,
    origin: device.origin,
    challenge,
    createdAt: now,
    expiresAt: now + SESSION_CHALLENGE_TTL_MS,
  };
  await env.CREDENTIALS_VAULT.put(challengeKey(device.deviceId, challenge), JSON.stringify(record), {
    expirationTtl: Math.ceil(SESSION_CHALLENGE_TTL_MS / 1000),
  });
  return { challenge, expiresAt: record.expiresAt };
}

async function consumeSessionChallenge(request, env, body) {
  const device = await readTrustedDevice(request, env, body.deviceId);
  const challenge = String(body.challenge || '').trim();
  const signature = String(body.signature || '').trim();
  if (!challenge || !signature) throw new HttpError('Challenge signature missing', 400);
  const key = challengeKey(device.deviceId, challenge);
  const record = await env.CREDENTIALS_VAULT.get(key, 'json');
  if (!record || Number(record.expiresAt || 0) <= Date.now()) throw new HttpError('Challenge expired', 401);
  if (record.origin !== device.origin) throw new HttpError('Challenge origin mismatch', 403);
  const publicKey = await importDevicePublicKey(device.publicKey);
  const message = new TextEncoder().encode(`${device.deviceId}:${challenge}`);
  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    b64UrlToBytes(signature),
    message,
  );
  if (!ok) throw new HttpError('Challenge signature invalid', 401);
  if (typeof env.CREDENTIALS_VAULT.delete === 'function') await env.CREDENTIALS_VAULT.delete(key);
  return device;
}

async function listTrustedDevices(request, env) {
  const session = await verifySession(request.headers.get(SESSION_HEADER), env);
  if (!session) return [];
  if (typeof env.CREDENTIALS_VAULT.list !== 'function') return [];
  const origin = request.headers.get('Origin') || '';
  const listed = await env.CREDENTIALS_VAULT.list({ prefix: 'trusted-device:' });
  const keys = listed?.keys || [];
  const devices = [];
  for (const item of keys.slice(0, 100)) {
    const record = await env.CREDENTIALS_VAULT.get(item.name, 'json');
    if (!record || record.revokedAt || record.origin !== origin || Number(record.expiresAt || 0) <= Date.now()) continue;
    devices.push({
      deviceId: record.deviceId,
      deviceName: record.deviceName,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
    });
  }
  return devices;
}

async function revokeTrustedDevice(request, env, body) {
  await verifySession(request.headers.get(SESSION_HEADER), env);
  const device = await readTrustedDevice(request, env, body.deviceId);
  await env.CREDENTIALS_VAULT.put(deviceKey(device.deviceId), JSON.stringify({ ...device, revokedAt: Date.now() }), {
    expirationTtl: 60 * 60 * 24 * 30,
  });
}

async function verifyPassword(password, hashSpec) {
  if (!hashSpec) throw new Error('Password hash missing');
  const [kind, iterationText, saltB64, hashB64] = String(hashSpec).split(':');
  if (kind !== 'pbkdf2' || !saltB64 || !hashB64) throw new Error('Password hash format invalid');
  const iterations = Number(iterationText) || 100000;
  if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 100000) {
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

async function userVaultId(provider, userId) {
  if (provider !== 'notion') throw new Error('Unknown user provider');
  return `user-credential:${provider}:${await sha256Id(userId)}`;
}

async function readCredential(env, provider) {
  const raw = await env.CREDENTIALS_VAULT.get(vaultId(provider), 'json');
  if (!raw) return null;
  return decryptVaultValue(env, raw);
}

async function readWeatherApiCredential(env) {
  const envSecret = String(env.WEATHERAPI_KEY || '').trim();
  if (envSecret) return { provider: 'weatherapi', secret: envSecret, extra: { source: 'env' }, status: 'connected' };
  return readCredential(env, 'weatherapi');
}

async function readVolcanoCredential(env) {
  const envSecret = String(env.VOLCANO_KEY || '').trim();
  if (envSecret) return { provider: 'volcano', secret: envSecret, extra: { source: 'env' }, status: 'connected' };
  return readCredential(env, 'volcano');
}

async function readUserCredential(env, provider, userId) {
  const raw = await env.CREDENTIALS_VAULT.get(await userVaultId(provider, userId), 'json');
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

async function writeUserCredential(env, provider, userId, secret, extra = {}, status = 'unknown', meta = {}) {
  const sealed = await encryptVaultValue(env, {
    provider,
    userId,
    secret: String(secret || ''),
    extra,
    status,
    lastTestedAt: meta.lastTestedAt,
    message: meta.message ? redact(meta.message) : undefined,
    updatedAt: Date.now(),
  });
  await env.CREDENTIALS_VAULT.put(await userVaultId(provider, userId), JSON.stringify(sealed));
}

async function deleteUserCredential(env, provider, userId) {
  const key = await userVaultId(provider, userId);
  if (typeof env.CREDENTIALS_VAULT.delete === 'function') await env.CREDENTIALS_VAULT.delete(key);
  else await env.CREDENTIALS_VAULT.put(key, JSON.stringify({ deletedAt: Date.now() }));
}

async function verifyAdminPassphrase(request, env, body) {
  const rateKey = await enforceRateLimit(request, env, 'admin');
  if (!await verifyPassword(body.adminPassphrase, env.ADMIN_ROTATION_HASH)) {
    await recordFailedAttempt(env, rateKey);
    throw new HttpError('Admin re-auth failed', 403);
  }
  await clearFailedAttempts(env, rateKey);
}

async function rotateCredential(env, body) {
  if (!PROVIDERS.includes(body.provider)) throw new Error('Unknown provider');
  const status = await testProvider(env, body.provider, body.secret, body.extra || {});
  if (status.status !== 'connected') {
    return { ok: false, status, error: 'Credential test failed' };
  }
  await writeCredential(env, body.provider, body.secret, body.extra || {}, 'connected', status);
  const stored = await readCredential(env, body.provider);
  if (!stored?.secret) {
    return { ok: false, status, error: 'Credential vault write verification failed' };
  }
  return { ok: true, status, stored: true };
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

function nextUtcMidnight(now = Date.now()) {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

function supabaseAiDailyLimit(env) {
  const configured = Number(env.SUPABASE_AI_DAILY_LIMIT);
  if (Number.isInteger(configured) && configured > 0) return configured;
  return DEFAULT_SUPABASE_AI_DAILY_LIMIT;
}

async function consumeSupabaseAiQuota(env, user, provider, request) {
  if (!user?.id) {
    const fallbackId = request?.headers?.get(SESSION_HEADER) || request?.headers?.get('CF-Connecting-IP') || 'anon';
    const quotaKey = `ai-quota-fallback:${provider}:${await sha256Id(fallbackId)}`;
    const now = Date.now();
    const day = new Date(now).toISOString().slice(0, 10);
    const key = `${quotaKey}:${day}`;
    const current = await env.CREDENTIALS_VAULT.get(key, 'json');
    const resetAt = current?.resetAt && current.resetAt > now ? current.resetAt : nextUtcMidnight(now);
    const count = current?.resetAt && current.resetAt > now ? Number(current.count || 0) : 0;
    const limit = supabaseAiDailyLimit(env);
    if (count >= limit) throw new HttpError('AI daily quota exceeded', 429);
    const next = { provider, count: count + 1, limit, resetAt, updatedAt: now };
    await env.CREDENTIALS_VAULT.put(key, JSON.stringify(next), {
      expirationTtl: Math.max(60, Math.ceil((resetAt - now) / 1000) + 3600),
    });
    return next;
  }
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const key = `ai-quota:${day}:${provider}:${await sha256Id(user.id)}`;
  const current = await env.CREDENTIALS_VAULT.get(key, 'json');
  const resetAt = current?.resetAt && current.resetAt > now ? current.resetAt : nextUtcMidnight(now);
  const count = current?.resetAt && current.resetAt > now ? Number(current.count || 0) : 0;
  const limit = supabaseAiDailyLimit(env);
  if (count >= limit) throw new HttpError('Supabase AI daily quota exceeded', 429);
  const next = { provider, count: count + 1, limit, resetAt, updatedAt: now };
  await env.CREDENTIALS_VAULT.put(key, JSON.stringify(next), {
    expirationTtl: Math.max(60, Math.ceil((resetAt - now) / 1000) + 3600),
  });
  return next;
}

async function providerStatus(env, provider) {
  const models = PROVIDER_MODELS[provider] || [];
  if (provider === 'weatherapi' && String(env.WEATHERAPI_KEY || '').trim()) {
    return { provider, status: 'connected', updatedAt: Date.now(), models };
  }
  if (provider === 'volcano' && String(env.VOLCANO_KEY || '').trim()) {
    return { provider, status: 'connected', updatedAt: Date.now(), models };
  }
  const raw = await env.CREDENTIALS_VAULT.get(vaultId(provider), 'json');
  if (!raw) return { provider, status: 'missing', models };
  const data = await decryptVaultValue(env, raw);
  return {
    provider,
    status: data.status || 'unknown',
    updatedAt: data.updatedAt || raw.updatedAt,
    lastTestedAt: data.lastTestedAt,
    models,
  };
}

function safeNotionPath(path) {
  const clean = String(path || '').trim();
  if (!clean.startsWith('/')) throw new Error('Notion path invalid');
  if (!/^\/(databases|pages|blocks|file_uploads|search)(\/|$)/.test(clean)) throw new Error('Notion path not allowed');
  return clean;
}

function supabaseConfig(env) {
  const url = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !key) {
    throw new HttpError('Supabase verification unavailable', 503);
  }
  return { url, key };
}

function supabaseBearerToken(request) {
  const header = request.headers.get(SUPABASE_AUTH_HEADER) || '';
  return header.replace(/^Bearer\s+/i, '').trim();
}

async function verifySupabaseUser(request, env) {
  const token = supabaseBearerToken(request);
  if (!token) throw new HttpError('Supabase session missing', 401);
  const { url, key } = supabaseConfig(env);
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: key,
    },
  });
  let data;
  try {
    data = await parseProviderJson(response);
  } catch {
    throw new HttpError('Supabase session invalid', 401);
  }
  if (!data?.id) throw new HttpError('Supabase session invalid', 401);
  return { id: String(data.id), email: data.email ? String(data.email) : '', accessToken: token };
}

async function optionalSupabaseUser(request, env) {
  if (!supabaseBearerToken(request)) return null;
  return verifySupabaseUser(request, env);
}

function internalNotionUser(body, edgeBrokerRequest) {
  if (!edgeBrokerRequest || body?.internalUserId == null) return null;
  const id = String(body.internalUserId || '').trim();
  if (!UUID_RE.test(id)) throw new HttpError('Internal Notion user invalid', 400);
  return { id, email: '' };
}

function notionCredentialRef(userId) {
  return `kv:user-credential:notion:${userId.slice(0, 8)}`;
}

async function supabaseRest(env, user, path, options = {}) {
  const { url, key } = supabaseConfig(env);
  const response = await fetch(`${url}/rest/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${user.accessToken}`,
      apikey: key,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return parseProviderJson(response);
}

async function upsertIntegrationMetadata(env, user, patch) {
  try {
    const existing = await supabaseRest(
      env,
      user,
      `/integrations?select=id&user_id=eq.${encodeURIComponent(user.id)}&provider=eq.notion&limit=1`,
    );
    const nowPatch = {
      user_id: user.id,
      provider: 'notion',
      updated_at: new Date().toISOString(),
      ...patch,
    };
    if (Array.isArray(existing) && existing[0]?.id) {
      await supabaseRest(env, user, `/integrations?id=eq.${encodeURIComponent(existing[0].id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(nowPatch),
      });
      return;
    }
    await supabaseRest(env, user, '/integrations', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ ...nowPatch, created_at: new Date().toISOString() }),
    });
  } catch (error) {
    console.warn('integration metadata update failed:', redact(error?.message || error));
  }
}

async function notionCredentialFor(env, user) {
  if (user?.id) {
    const credential = await readUserCredential(env, 'notion', user.id);
    if (user?.email === BOSS_EMAIL) {
      if (credential?.secret) return credential;
    } else {
      if (!credential?.secret) throw new HttpError('Personal Notion credential missing', 401);
      return credential;
    }
  }
  const credential = await readCredential(env, 'notion');
  if (!credential?.secret) throw new Error('Notion credential missing');
  return credential;
}

async function notionUploadFileWorker(env, base64, mime, filename, user) {
  const credential = await notionCredentialFor(env, user);

  const pureB64 = base64.includes(',') ? base64.split(',')[1] : base64;
  if (!pureB64) throw new Error('Base64 content missing');

  const safeName = (filename || 'receipt').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
  const finalName = /\.(jpe?g|png|webp)$/i.test(safeName) ? safeName : safeName + '.jpg';

  // Step 1: create file_upload object in Notion
  const response = await fetch('https://api.notion.com/v1/file_uploads', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential.secret}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: JSON.stringify({
      mode: 'single_part',
      filename: finalName,
      content_type: mime || 'image/jpeg'
    })
  });

  const createRes = await parseProviderJson(response);
  const uploadId = createRes?.id;
  const sendUrl = createRes?.upload_url;
  if (!uploadId || !sendUrl) {
    throw new Error('Notion file_uploads API did not return upload_url: ' + JSON.stringify(createRes));
  }

  // Step 2: decode base64 to byte array
  const bin = atob(pureB64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mime || 'image/jpeg' });

  const form = new FormData();
  form.append('file', blob, finalName);

  // Step 3: POST multipart data to S3 upload url
  const sendRes = await fetch(sendUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential.secret}`,
      'Notion-Version': NOTION_VERSION,
    },
    body: form
  });

  if (!sendRes.ok) {
    const t = await sendRes.text();
    throw new Error(`Notion S3 upload ${sendRes.status}: ${t.slice(0, 200)}`);
  }

  return { fileUploadId: uploadId };
}

async function fetchNotion(env, path, method, body, databaseId, user) {
  const credential = await notionCredentialFor(env, user);
  const notionPath = safeNotionPath(path);
  const effectiveDatabaseId = (user?.id && user?.email !== BOSS_EMAIL) ? credential.extra?.databaseId : databaseId || credential.extra?.databaseId;
  assertPersonalNotionScope(notionPath, body, databaseId, credential, user);
  const url = `https://api.notion.com/v1${notionPath}`;
  const response = await fetch(url, {
    method: method || 'GET',
    headers: {
      Authorization: `Bearer ${credential.secret}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: body == null ? undefined : JSON.stringify(rewriteDatabaseBody(body, effectiveDatabaseId)),
  });
  return parseProviderJson(response);
}

async function connectPersonalNotion(request, env) {
  const user = await verifySupabaseUser(request, env);
  const body = await readJson(request);
  const secret = String(body.secret || '').trim();
  const databaseId = String(body.databaseId || '').trim();
  if (!secret) throw new HttpError('Notion token missing', 400);
  if (!databaseId) throw new HttpError('Notion database ID missing', 400);
  const status = await testNotion(env, { secret, extra: { databaseId } });
  if (status !== 'connected') throw new HttpError('Notion credential test failed', 400);
  await writeUserCredential(env, 'notion', user.id, secret, { databaseId }, 'connected', { lastTestedAt: Date.now() });
  await upsertIntegrationMetadata(env, user, {
    status: 'connected',
    encrypted_secret_ref: notionCredentialRef(user.id),
    notion_database_id: databaseId,
    external_account_label: user.email || 'Supabase user',
    last_synced_at: null,
  });
  return { provider: 'notion', status: 'connected', databaseId, updatedAt: Date.now() };
}

async function personalNotionStatus(request, env) {
  const user = await verifySupabaseUser(request, env);
  const credential = await readUserCredential(env, 'notion', user.id);
  if (!credential?.secret) return { provider: 'notion', status: 'missing' };
  return {
    provider: 'notion',
    status: credential.status || 'unknown',
    databaseId: credential.extra?.databaseId || '',
    updatedAt: credential.updatedAt,
    lastTestedAt: credential.lastTestedAt,
  };
}

async function disconnectPersonalNotion(request, env) {
  const user = await verifySupabaseUser(request, env);
  await deleteUserCredential(env, 'notion', user.id);
  await upsertIntegrationMetadata(env, user, {
    status: 'disconnected',
    encrypted_secret_ref: null,
    notion_database_id: null,
  });
  return { provider: 'notion', status: 'disconnected' };
}

function rewriteDatabaseBody(body, databaseId) {
  if (!databaseId || !body || typeof body !== 'object') return body;
  if (body.parent?.database_id) return body;
  if (body.parent && typeof body.parent === 'object') return { ...body, parent: { ...body.parent, database_id: databaseId } };
  return body;
}

function normalizeNotionId(value) {
  return String(value || '').trim().replace(/-/g, '').toLowerCase();
}

function assertSameNotionDatabase(candidate, registered) {
  if (!candidate) return;
  if (normalizeNotionId(candidate) !== normalizeNotionId(registered)) {
    throw new HttpError('Personal Notion request outside registered database', 403);
  }
}

function assertPersonalNotionScope(path, body, databaseId, credential, user) {
  if (!user?.id) return;
  if (user?.email === BOSS_EMAIL) return;
  const registeredDatabaseId = credential.extra?.databaseId;
  if (!registeredDatabaseId) throw new HttpError('Personal Notion database missing', 401);
  assertSameNotionDatabase(databaseId, registeredDatabaseId);
  const pathDatabase = String(path || '').match(/^\/databases\/([^/]+)/)?.[1];
  assertSameNotionDatabase(pathDatabase, registeredDatabaseId);
  if (body && typeof body === 'object') {
    assertSameNotionDatabase(body.parent?.database_id, registeredDatabaseId);
  }
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

async function kimiJson(env, prompt, kind, image, requestedModel) {
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
      model: requestedModel || env.KIMI_MODEL || 'kimi-code',
      messages,
      temperature: kind === 'test' ? 0 : 0.6,
      thinking: { type: 'disabled' },
      max_tokens: kind === 'test' ? 8 : undefined,
    }),
  }));
  return extractJson(data?.choices?.[0]?.message?.content || data?.content || '');
}

async function mimoJson(env, prompt, kind, image, requestedModel) {
  const credential = await readCredential(env, 'mimo');
  if (!credential?.secret) throw new Error('Mimo credential missing');
  const messages = [
    { role: 'system', content: 'Return strict JSON only. No markdown.' },
    { role: 'user', content: image ? [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.base64}` } },
    ] : prompt },
  ];
  const data = await mimoChatCompletion(env, credential, {
    model: requestedModel || env.MIMO_MODEL || 'mimo-v2.5',
    messages,
    temperature: kind === 'test' ? 0 : 0.1,
    stream: false,
    thinking: { type: 'disabled' },
    max_tokens: kind === 'test' ? 8 : kind === 'trip' ? 10000 : 800,
  });
  return extractJson(data?.choices?.[0]?.message?.content || data?.content || '');
}

async function mimoChatCompletion(env, credential, body) {
  const bases = [
    String(env.MIMO_API_BASE || MIMO_DEFAULT_BASE).replace(/\/+$/, ''),
    MIMO_PAYG_BASE,
  ].filter((base, index, list) => base && list.indexOf(base) === index);
  let lastError = null;
  for (const base of bases) {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'api-key': credential.secret,
        Authorization: `Bearer ${credential.secret}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    try {
      return await parseProviderJson(response);
    } catch (error) {
      lastError = error;
      if (Number(error?.status) !== 404) throw error;
    }
  }
  throw lastError || new Error('Mimo provider unavailable');
}

async function googleJson(env, prompt, kind, image, requestedModel) {
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
      generationConfig: {
        temperature: kind === 'test' ? 0 : 0.1,
        responseMimeType: 'application/json',
        maxOutputTokens: kind === 'test' ? 8 : undefined,
      },
    }),
  }));
  return extractJson(data?.candidates?.[0]?.content?.parts?.[0]?.text || '');
}

function weatherApiCodeToWmo(code) {
  const n = Number(code);
  if (n === 1000) return 0;
  if (n === 1003) return 1;
  if (n === 1006) return 2;
  if (n === 1009) return 3;
  if ([1030, 1135, 1147].includes(n)) return 45;
  if ([1066, 1069, 1072, 1114, 1117, 1204, 1207, 1210, 1213, 1216, 1219, 1222, 1225, 1237, 1255, 1258, 1261, 1264].includes(n)) return 71;
  if ([1273, 1276, 1279, 1282].includes(n)) return 95;
  if ([1189, 1192, 1195, 1243, 1246].includes(n)) return 63;
  if ([1198, 1201].includes(n)) return 65;
  if ([1063, 1150, 1153, 1168, 1171, 1180, 1183, 1186, 1240].includes(n)) return 80;
  return 3;
}

function weatherApiToForecastShape(data) {
  const hourly = {
    time: [],
    temperature_2m: [],
    apparent_temperature: [],
    weather_code: [],
    precipitation_probability: [],
    precipitation: [],
    relative_humidity_2m: [],
    wind_speed_10m: [],
    wind_direction_10m: [],
    wind_gusts_10m: [],
    cloud_cover: [],
    uv_index: [],
  };
  for (const day of data?.forecast?.forecastday || []) {
    for (const hour of day?.hour || []) {
      hourly.time.push(String(hour.time || '').replace(' ', 'T').slice(0, 16));
      hourly.temperature_2m.push(Number(hour.temp_c));
      hourly.apparent_temperature.push(Number(hour.feelslike_c));
      hourly.weather_code.push(weatherApiCodeToWmo(hour.condition?.code));
      hourly.precipitation_probability.push(Number(hour.chance_of_rain ?? 0));
      hourly.precipitation.push(Number(hour.precip_mm ?? 0));
      hourly.relative_humidity_2m.push(Number(hour.humidity ?? 0));
      hourly.wind_speed_10m.push(Number(hour.wind_kph ?? 0));
      hourly.wind_direction_10m.push(Number(hour.wind_degree ?? 0));
      hourly.wind_gusts_10m.push(Number(hour.gust_kph ?? 0));
      hourly.cloud_cover.push(Number(hour.cloud ?? 0));
      hourly.uv_index.push(Number(hour.uv ?? 0));
    }
  }
  return {
    source: 'WeatherAPI.com',
    location: data?.location || null,
    current: data?.current || null,
    hourly,
  };
}

async function weatherApiForecast(env, body) {
  const credential = await readWeatherApiCredential(env);
  if (!credential?.secret) throw new Error('WeatherAPI credential missing');
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new HttpError('Weather location missing', 400);
  const days = Math.max(1, Math.min(3, Number(body.days) || 3));
  const url = new URL('https://api.weatherapi.com/v1/forecast.json');
  url.searchParams.set('key', credential.secret);
  url.searchParams.set('q', `${lat},${lon}`);
  url.searchParams.set('days', String(days));
  url.searchParams.set('aqi', 'no');
  url.searchParams.set('alerts', 'no');
  const data = await parseProviderJson(await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  }));
  return weatherApiToForecastShape(data);
}

function extractJson(text) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');
    let start = -1;
    if (firstBrace !== -1 && firstBracket !== -1) start = Math.min(firstBrace, firstBracket);
    else if (firstBrace !== -1) start = firstBrace;
    else if (firstBracket !== -1) start = firstBracket;
    if (start === -1) throw new Error('Provider returned non-JSON response');

    let str = cleaned.slice(start);
    let inString = false;
    let escape = false;
    const stack = [];
    let endIdx = -1;
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (escape) { escape = false; continue; }
      if (char === '\\') { escape = true; continue; }
      if (char === '"') { inString = !inString; continue; }
      if (!inString) {
        if (char === '{') stack.push('}');
        else if (char === '[') stack.push(']');
        else if (char === '}' || char === ']') {
          if (stack.length > 0 && stack[stack.length - 1] === char) {
            stack.pop();
            if (stack.length === 0) { endIdx = i; break; }
          }
        }
      }
    }
    
    if (endIdx !== -1) {
      str = str.slice(0, endIdx + 1);
    } else {
      if (inString) str += '"';
      while (stack.length > 0) str += stack.pop();
    }
    
    try {
      return JSON.parse(str);
    } catch {
      throw new Error('Provider returned non-JSON response');
    }
  }
}

function normalizeZone(value) {
  const zone = String(value || '').trim();
  if (zone === 'JST') return 'Asia/Tokyo';
  if (zone === 'HKT') return 'Asia/Hong_Kong';
  if (zone === 'KST') return 'Asia/Seoul';
  if (zone === 'CST') return 'Asia/Shanghai';
  return zone;
}

function resolveTripContext(destination = '', currency = 'JPY', countryCode = '') {
  const haystack = `${destination} ${currency} ${countryCode}`.toLowerCase();
  const code = String(countryCode || '').trim().toUpperCase();
  const matched = TRIP_CONTEXTS.find((ctx) => ctx.countryCode === code)
    || TRIP_CONTEXTS.find((ctx) => ctx.pattern.test(haystack));
  if (matched) {
    const { pattern, ...context } = matched;
    void pattern;
    return context;
  }
  return {
    countryCode: code || 'GLOBAL',
    countryName: code || 'Global',
    primaryCurrency: String(currency || 'JPY').toUpperCase(),
    themeKey: 'global_journal',
    locale: 'zh-HK',
    timezone: 'Asia/Hong_Kong',
    weatherRegion: destination || 'Global',
  };
}

function normalizeTripIntelligencePayload(input, destinationSummary = '', currency = 'JPY', timezone = '') {
  const raw = input && typeof input === 'object' ? input : {};
  const rawCountryCode = String(raw.countryCode || raw.country_code || '').toUpperCase();
  const rawCurrency = String(raw.primaryCurrency || raw.primary_currency || currency || '').toUpperCase();
  const inferred = resolveTripContext(destinationSummary, rawCurrency, rawCountryCode);
  const primaryCurrency = String(raw.primaryCurrency || raw.primary_currency || inferred.primaryCurrency || currency || 'JPY').toUpperCase();
  const refined = resolveTripContext(destinationSummary, primaryCurrency, rawCountryCode || inferred.countryCode);
  const themeKey = TRIP_THEME_KEYS.includes(raw.themeKey || raw.theme_key) ? raw.themeKey || raw.theme_key : refined.themeKey;
  return {
    countryCode: String(raw.countryCode || raw.country_code || refined.countryCode).toUpperCase(),
    countryName: String(raw.countryName || raw.country_name || refined.countryName || ''),
    primaryCurrency,
    themeKey,
    locale: String(raw.locale || refined.locale || 'zh-HK'),
    timezone: normalizeZone(raw.timezone || timezone || refined.timezone) || refined.timezone,
    weatherRegion: String(raw.weatherRegion || raw.weather_region || refined.weatherRegion || destinationSummary || refined.countryName || ''),
    confidence: ['low', 'medium', 'high'].includes(raw.confidence) ? raw.confidence : 'medium',
    source: 'ai',
    updatedAt: Date.now(),
  };
}

function tripAnalysisPrompt(body) {
  const paragraph = String(body.paragraph || '').slice(0, 14000);
  const currentTrip = body.currentTrip && typeof body.currentTrip === 'object' ? body.currentTrip : {};
  return `Analyze the user's travel plan and return strict JSON only.
Trip intelligence must include countryCode, countryName, primaryCurrency, themeKey, locale, timezone, weatherRegion, confidence.
themeKey must be one of: ${TRIP_THEME_KEYS.join(', ')}.
Use destination/day context to set default currency, itinerary country/city/timezone, and weather location. Do not invent secrets or API keys.

Current trip JSON:
${JSON.stringify({
  id: currentTrip.id,
  name: currentTrip.name,
  startDate: currentTrip.startDate,
  endDate: currentTrip.endDate,
  destinationSummary: currentTrip.destinationSummary,
  itinerary: currentTrip.itinerary,
}).slice(0, 12000)}

Return:
{"trip":{"name":string,"destinationSummary":string,"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","homeCurrency":"HKD","currencies":string[],"intelligence":{"countryCode":string,"countryName":string,"primaryCurrency":string,"themeKey":"japan_washi|korea_editorial|taiwan_nightmarket|europe_rail|global_journal","locale":string,"timezone":string,"weatherRegion":string,"confidence":"low|medium|high"},"itinerary":[{"date":"YYYY-MM-DD","day":number,"region":string,"city":string,"country":string,"timezone":string,"currency":string,"highlight":string,"lodging":{"name":string,"address":string,"mapUrl":string,"checkIn":string,"checkOut":string},"spots":[{"time":"HH:MM","name":string,"type":"flight|transport|food|shopping|lodging|ticket|localtour|medicine|other|sightseeing","address":string,"mapUrl":string,"note":string,"timezone":string,"lat":number,"lon":number}]}]},"summary":string,"warnings":string[],"changes":string[]}

USER PARAGRAPH:
${paragraph}`;
}

function normalizeTripAnalysis(data, body) {
  if (!data || typeof data !== 'object') return data;
  const next = { ...data };
  const trip = next.trip && typeof next.trip === 'object' ? { ...next.trip } : {};
  const currentTrip = body.currentTrip && typeof body.currentTrip === 'object' ? body.currentTrip : {};
  const destination = String(trip.destinationSummary || next.summary || currentTrip.destinationSummary || '');
  const currencies = Array.isArray(trip.currencies) ? trip.currencies.map(String) : [];
  const currency = currencies.find((code) => code !== 'HKD') || trip.currency || 'JPY';
  const firstDay = Array.isArray(trip.itinerary) ? trip.itinerary[0] : null;
  const intelligence = normalizeTripIntelligencePayload(trip.intelligence || next.intelligence, destination, currency, firstDay?.timezone || currentTrip.timezones?.[0]);
  trip.intelligence = intelligence;
  if (!Array.isArray(trip.currencies) || !trip.currencies.length) {
    trip.currencies = Array.from(new Set(['HKD', intelligence.primaryCurrency]));
  }
  next.trip = trip;
  next.intelligence = intelligence;
  return next;
}

async function testProvider(env, provider, candidateSecret, extra = {}) {
  const credential = candidateSecret
    ? { secret: candidateSecret, extra }
    : provider === 'weatherapi' ? await readWeatherApiCredential(env)
    : provider === 'volcano' ? await readVolcanoCredential(env)
    : await readCredential(env, provider);
  if (!credential?.secret) return { provider, status: 'missing' };
  try {
    if (provider === 'notion') await testNotion(env, credential);
    if (provider === 'kimi') await kimiJsonWithCredential(env, credential);
    if (provider === 'mimo') await mimoJsonWithCredential(env, credential);
    if (provider === 'google') await googleModelsList(credential.secret);
    if (provider === 'weatherapi') await testWeatherApi(credential.secret);
    if (provider === 'volcano') await volcanoJsonWithCredential(env, credential);
    return {
      provider,
      status: 'connected',
      lastTestedAt: Date.now(),
      model: PROVIDER_MODELS[provider]?.[0] || null,
    };
  } catch (error) {
    return { provider, status: 'invalid', lastTestedAt: Date.now(), message: redact(error?.message || error) };
  }
}

async function testWeatherApi(secret) {
  const url = new URL('https://api.weatherapi.com/v1/current.json');
  url.searchParams.set('key', secret);
  url.searchParams.set('q', 'Jeju');
  url.searchParams.set('aqi', 'no');
  const data = await parseProviderJson(await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  }));
  if (!data?.current) throw new Error('WeatherAPI current weather unavailable');
  return data.current;
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
      model: env.KIMI_MODEL || 'kimi-code',
      messages: [{ role: 'user', content: 'Return {"ok":true} as JSON.' }],
      temperature: 0,
      thinking: { type: 'disabled' },
      max_tokens: 8,
    }),
  }));
  return extractJson(data?.choices?.[0]?.message?.content || '');
}

async function volcanoJson(env, prompt, kind, image, requestedModel) {
  const credential = await readVolcanoCredential(env);
  if (!credential?.secret) throw new Error('Volcano credential missing');
  const base = String(env.VOLCANO_API_BASE || VOLCANO_DEFAULT_BASE).replace(/\/+$/, '');
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
    },
    body: JSON.stringify({
      model: requestedModel || 'doubao-seed-2.0-lite',
      messages,
      temperature: kind === 'test' ? 0 : 0.6,
      thinking: kind === 'test' ? { type: 'disabled' } : undefined,
      max_tokens: kind === 'test' ? 8 : undefined,
    }),
  }));
  const choice = data?.choices?.[0];
  const content = choice?.message?.content || data?.content || '';
  if (kind === 'test') {
    const reasoning = choice?.message?.reasoning_content || '';
    if (!String(content).trim() && !String(reasoning).trim()) {
      throw new Error('Model test returned an empty response');
    }
    return { ok: true, provider: 'volcano' };
  }
  return extractJson(content);
}

async function volcanoJsonWithCredential(env, credential) {
  const base = String(env.VOLCANO_API_BASE || VOLCANO_DEFAULT_BASE).replace(/\/+$/, '');
  const data = await parseProviderJson(await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credential.secret}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      model: 'doubao-seed-2.0-lite',
      messages: [{ role: 'user', content: 'Return {"ok":true} as JSON.' }],
      temperature: 0,
      max_tokens: 8,
    }),
  }));
  return extractJson(data?.choices?.[0]?.message?.content || '');
}

async function mimoJsonWithCredential(env, credential) {
  const data = await mimoChatCompletion(env, credential, {
    model: env.MIMO_MODEL || 'mimo-v2.5',
    messages: [{ role: 'user', content: 'Return {"ok":true} as JSON.' }],
    temperature: 0,
    stream: false,
    thinking: { type: 'disabled' },
    max_tokens: 8,
  });
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
    const edgeBrokerRequest = await isEdgeBrokerRequest(request, env);
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
      const device = await registerTrustedDevice(request, env, body);
      return json({ ok: true, session, expiresAt, device }, 200, cors);
    }
    if (url.pathname === '/session/challenge') {
      const body = await readJson(request);
      return json({ ok: true, ...(await createSessionChallenge(request, env, body)) }, 200, cors);
    }
    if (url.pathname === '/session/refresh') {
      const body = await readJson(request);
      await consumeSessionChallenge(request, env, body);
      const expiresAt = Date.now() + SESSION_TTL_MS;
      const session = await signSession({ sub: 'travel-expense', exp: expiresAt, iat: Date.now() }, env);
      return json({ ok: true, session, expiresAt }, 200, cors);
    }
    if (url.pathname === '/credentials/admin-rotate') {
      const body = await readJson(request);
      await verifyAdminPassphrase(request, env, body);
      const result = await rotateCredential(env, body);
      return json(result, result.ok ? 200 : 400, cors);
    }
    if (url.pathname === '/integrations/notion/connect') {
      const result = await connectPersonalNotion(request, env);
      return json({ ok: true, status: result }, 200, cors);
    }
    if (url.pathname === '/integrations/notion/status') {
      const result = await personalNotionStatus(request, env);
      return json({ ok: true, status: result }, 200, cors);
    }
    if (url.pathname === '/integrations/notion/disconnect') {
      const result = await disconnectPersonalNotion(request, env);
      return json({ ok: true, status: result }, 200, cors);
    }
    if (url.pathname === '/notion/request') {
      const body = await readJson(request);
      const user = edgeBrokerRequest
        ? internalNotionUser(body, edgeBrokerRequest)
        : await optionalSupabaseUser(request, env);
      if (!user && !edgeBrokerRequest) await verifySession(request.headers.get(SESSION_HEADER), env);
      const data = await fetchNotion(env, body.path, body.method, body.body, body.databaseId, user);
      return json({ ok: true, data }, 200, cors);
    }
    if (url.pathname === '/notion/upload-file') {
      const user = await optionalSupabaseUser(request, env);
      if (!user) await verifySession(request.headers.get(SESSION_HEADER), env);
      const body = await readJson(request);
      const result = await notionUploadFileWorker(env, body.base64, body.mime, body.filename, user);
      return json({ ok: true, ...result }, 200, cors);
    }

    if (url.pathname === '/kimi/json') {
      const user = await optionalSupabaseUser(request, env);
      if (!user) await verifySession(request.headers.get(SESSION_HEADER), env);
      const body = await readJson(request);
      await consumeSupabaseAiQuota(env, user, 'kimi', request);
      return json({ ok: true, data: await kimiJson(env, body.prompt, body.kind, body.image, body.model) }, 200, cors);
    }
    if (url.pathname === '/google/json') {
      const user = await optionalSupabaseUser(request, env);
      if (!user) await verifySession(request.headers.get(SESSION_HEADER), env);
      const body = await readJson(request);
      await consumeSupabaseAiQuota(env, user, 'google', request);
      return json({ ok: true, data: await googleJson(env, body.prompt, body.kind, body.image, body.model) }, 200, cors);
    }
    if (url.pathname === '/mimo/json') {
      const user = await optionalSupabaseUser(request, env);
      if (!user) await verifySession(request.headers.get(SESSION_HEADER), env);
      const body = await readJson(request);
      await consumeSupabaseAiQuota(env, user, 'mimo', request);
      return json({ ok: true, data: await mimoJson(env, body.prompt, body.kind, body.image, body.model) }, 200, cors);
    }
    if (url.pathname === '/volcano/json') {
      const user = await optionalSupabaseUser(request, env);
      if (!user) await verifySession(request.headers.get(SESSION_HEADER), env);
      const body = await readJson(request);
      await consumeSupabaseAiQuota(env, user, 'volcano', request);
      return json({ ok: true, data: await volcanoJson(env, body.prompt, body.kind, body.image, body.model) }, 200, cors);
    }
    if (url.pathname === '/trip/intelligence') {
      const user = await optionalSupabaseUser(request, env);
      if (!user) await verifySession(request.headers.get(SESSION_HEADER), env);
      const body = await readJson(request);
      await consumeSupabaseAiQuota(env, user, 'kimi', request);
      const parsed = await kimiJson(env, tripAnalysisPrompt(body), 'trip', undefined, body.model || 'kimi-code');
      return json({ ok: true, data: normalizeTripAnalysis(parsed, body) }, 200, cors);
    }
    if (url.pathname === '/weather/forecast') {
      const user = await optionalSupabaseUser(request, env);
      if (!user) await verifySession(request.headers.get(SESSION_HEADER), env);
      const body = await readJson(request);
      return json({ ok: true, data: await weatherApiForecast(env, body) }, 200, cors);
    }

    const edgeBrokerRoute = url.pathname === '/credentials/status' || url.pathname === '/credentials/test';
    if (!(edgeBrokerRequest && edgeBrokerRoute)) {
      const user = await optionalSupabaseUser(request, env);
      if (!user) {
        await verifySession(request.headers.get(SESSION_HEADER), env);
      }
    }

    if (url.pathname === '/session/devices') {
      return json({ ok: true, devices: await listTrustedDevices(request, env) }, 200, cors);
    }
    if (url.pathname === '/session/revoke-device') {
      const body = await readJson(request);
      await revokeTrustedDevice(request, env, body);
      return json({ ok: true }, 200, cors);
    }
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
      await verifyAdminPassphrase(request, env, body);
      const result = await rotateCredential(env, body);
      return json(result, result.ok ? 200 : 400, cors);
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
