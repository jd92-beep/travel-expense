import assert from 'node:assert/strict';
import worker from '../src/index.js';

const ORIGIN = 'http://localhost:8902';
const UNLOCK_PASSWORD = 'test-unlock';
const ADMIN_PASSWORD = 'test-admin';

class MemoryKv {
  constructor() {
    this.values = new Map();
  }

  async get(key, type) {
    const value = this.values.get(key);
    if (value == null) return null;
    if (type === 'json') return JSON.parse(value);
    return value;
  }

  async put(key, value) {
    this.values.set(key, String(value));
  }

  async delete(key) {
    this.values.delete(key);
  }
}

function bytesToB64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function passwordSpec(password, saltText) {
  const salt = new TextEncoder().encode(saltText);
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt,
    iterations: 10000,
  }, material, 256);
  return `pbkdf2:10000:${bytesToB64(salt)}:${bytesToB64(new Uint8Array(bits))}`;
}

function makeEnv() {
  const appSessionSecret = ['APP', 'SESSION', 'SECRET'].join('_');
  const credentialKek = ['CREDENTIALS', 'KEK'].join('_');
  return {
    ALLOWED_ORIGINS: ORIGIN,
    [appSessionSecret]: 'test-session-secret-with-enough-entropy',
    [credentialKek]: 'test-credential-kek-with-enough-entropy',
    CREDENTIALS_VAULT: new MemoryKv(),
    KIMI_API_BASE: 'https://kimi.test/v1',
    GOOGLE_MODEL: 'gemma-3-27b-it',
    UNLOCK_MAX_FAILURES: '2',
    ADMIN_MAX_FAILURES: '2',
  };
}

function bearer(value) {
  return ['Bearer', value].join(' ');
}

function request(path, { method = 'GET', session, body, origin = ORIGIN } = {}) {
  const headers = new Headers();
  if (origin) headers.set('Origin', origin);
  headers.set('User-Agent', 'travel-expense-self-test');
  if (session) headers.set('X-Travel-Session', session);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  return new Request(`https://broker.test${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function jsonFetch(env, path, options) {
  const req = request(path, options);
  if (options?.cookie) req.headers.set('Cookie', options.cookie);
  const response = await worker.fetch(req, env, {});
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  return { response, data };
}

function installProviderFetchStub() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    const auth = init.headers?.Authorization || init.headers?.authorization || '';

    if (href.includes('api.notion.com/v1/databases/test-db')) {
      assert.equal(auth, bearer('notion-secret-for-test'));
      return Response.json({ id: 'test-db', object: 'database' });
    }

    if (href.includes('api.notion.com/v1/pages')) {
      assert.equal(auth, bearer('notion-secret-for-test'));
      return Response.json({ id: 'page-1', object: 'page' });
    }

    if (href.includes('kimi.test/v1/chat/completions')) {
      assert.equal(auth, bearer('kimi-secret-for-test'));
      return Response.json({ choices: [{ message: { content: '{"ok":true,"provider":"kimi"}' } }] });
    }

    if (href.includes('generativelanguage.googleapis.com/v1beta/models?')) {
      assert.match(href, /key=google-secret-for-test/);
      return Response.json({ models: [{ name: 'models/gemma-3-27b-it' }] });
    }

    if (href.includes('generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent')) {
      assert.match(href, /key=google-secret-for-test/);
      return Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true,"provider":"google"}' }] } }] });
    }

    return Response.json({ error: { message: 'Unexpected provider call' } }, { status: 500 });
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

async function run() {
  const env = makeEnv();
  env.APP_UNLOCK_HASH = await passwordSpec(UNLOCK_PASSWORD, 'unlock-salt');
  env.ADMIN_ROTATION_HASH = await passwordSpec(ADMIN_PASSWORD, 'admin-salt');
  const restoreFetch = installProviderFetchStub();

  try {
    const health = await jsonFetch(env, '/health');
    assert.equal(health.response.status, 200);
    assert.equal(health.data.ok, true);

    const blocked = await jsonFetch(env, '/session/unlock', {
      method: 'POST',
      origin: 'https://example.invalid',
      body: { password: UNLOCK_PASSWORD },
    });
    assert.equal(blocked.response.status, 403);
    assert.equal(blocked.data.ok, false);

    const blockedMissingOrigin = await jsonFetch(env, '/session/unlock', {
      method: 'POST',
      origin: '',
      body: { password: UNLOCK_PASSWORD },
    });
    assert.equal(blockedMissingOrigin.response.status, 403);
    assert.equal(blockedMissingOrigin.data.ok, false);

    const blockedOptions = await worker.fetch(request('/session/unlock', {
      method: 'OPTIONS',
      origin: 'https://example.invalid',
    }), env, {});
    assert.equal(blockedOptions.status, 403);
    assert.equal(blockedOptions.headers.get('Access-Control-Allow-Origin'), null);

    const denied = await jsonFetch(env, '/session/unlock', {
      method: 'POST',
      body: { password: 'wrong' },
    });
    assert.equal(denied.response.status, 401);

    const deniedAgain = await jsonFetch(env, '/session/unlock', {
      method: 'POST',
      body: { password: 'wrong-again' },
    });
    assert.equal(deniedAgain.response.status, 401);

    const rateLimited = await jsonFetch(env, '/session/unlock', {
      method: 'POST',
      body: { password: 'wrong-third-time' },
    });
    assert.equal(rateLimited.response.status, 429);

    const unlocked = await jsonFetch(env, '/session/unlock', {
      method: 'POST',
      origin: 'http://127.0.0.1:8902',
      body: { password: UNLOCK_PASSWORD },
    });
    assert.equal(unlocked.response.status, 200);
    assert.equal(typeof unlocked.data.session, 'string');
    const session = unlocked.data.session;
    const trustedCookie = (unlocked.response.headers.get('Set-Cookie') || '').split(';')[0];
    assert.match(trustedCookie, /te_trusted_device=/);

    const restored = await jsonFetch(env, '/session/restore', {
      method: 'POST',
      origin: 'http://127.0.0.1:8902',
      cookie: trustedCookie,
    });
    assert.equal(restored.response.status, 200);
    assert.equal(typeof restored.data.session, 'string');

    const initialStatus = await jsonFetch(env, '/credentials/status', { session });
    assert.equal(initialStatus.response.status, 200);
    assert.deepEqual(initialStatus.data.providers.map((item) => item.status), ['missing', 'missing', 'missing']);

    const missingSession = await jsonFetch(env, '/credentials/status');
    assert.equal(missingSession.response.status, 401);
    assert.equal(missingSession.data.error, 'Session missing');

    const malformedSession = await jsonFetch(env, '/credentials/status', { session: 'bad.session.token' });
    assert.equal(malformedSession.response.status, 401);
    assert.equal(malformedSession.data.error, 'Session invalid');

    const notionRotate = await jsonFetch(env, '/credentials/rotate', {
      method: 'POST',
      session,
      body: {
        provider: 'notion',
        secret: 'notion-secret-for-test',
        adminPassphrase: ADMIN_PASSWORD,
        extra: { databaseId: 'test-db' },
      },
    });
    assert.equal(notionRotate.response.status, 200);
    assert.equal(notionRotate.data.status.status, 'connected');

    const notion = await jsonFetch(env, '/notion/request', {
      method: 'POST',
      session,
      body: { path: '/pages', method: 'POST', body: { parent: {}, properties: {} } },
    });
    assert.equal(notion.response.status, 200);
    assert.equal(notion.data.data.id, 'page-1');

    const kimiRotate = await jsonFetch(env, '/credentials/rotate', {
      method: 'POST',
      session,
      body: { provider: 'kimi', secret: 'kimi-secret-for-test', adminPassphrase: ADMIN_PASSWORD },
    });
    assert.equal(kimiRotate.response.status, 200);

    const kimi = await jsonFetch(env, '/kimi/json', {
      method: 'POST',
      session,
      body: { prompt: 'Return JSON', kind: 'test' },
    });
    assert.equal(kimi.response.status, 200);
    assert.equal(kimi.data.data.provider, 'kimi');

    const googleRotate = await jsonFetch(env, '/credentials/rotate', {
      method: 'POST',
      session,
      body: { provider: 'google', secret: 'google-secret-for-test', adminPassphrase: ADMIN_PASSWORD },
    });
    assert.equal(googleRotate.response.status, 200);

    const statusAfterRotate = await jsonFetch(env, '/credentials/status', { session });
    assert.equal(typeof statusAfterRotate.data.providers.find((item) => item.provider === 'google')?.lastTestedAt, 'number');

    const google = await jsonFetch(env, '/google/json', {
      method: 'POST',
      session,
      body: { prompt: 'Return JSON', kind: 'test', model: 'gemma-3-27b-it' },
    });
    assert.equal(google.response.status, 200);
    assert.equal(google.data.data.provider, 'google');

    const tooLarge = await worker.fetch(new Request('https://broker.test/session/unlock', {
      method: 'POST',
      headers: {
        Origin: 'http://127.0.0.1:8903',
        'Content-Type': 'application/json',
        'Content-Length': '900001',
      },
      body: '{}',
    }), env, {});
    assert.equal(tooLarge.status, 413);
  } finally {
    restoreFetch();
  }
}

run()
  .then(() => {
    console.log('credential broker self-test passed');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
