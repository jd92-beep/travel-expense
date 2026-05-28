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

  async list({ prefix = '' } = {}) {
    return {
      keys: [...this.values.keys()].filter((name) => name.startsWith(prefix)).map((name) => ({ name })),
    };
  }
}

function bytesToB64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function bytesToB64Url(bytes) {
  return bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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

async function trustedDeviceRegistration() {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  return {
    privateKey: pair.privateKey,
    publicKey: await crypto.subtle.exportKey('jwk', pair.publicKey),
  };
}

async function signDeviceChallenge(privateKey, deviceId, challenge) {
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(`${deviceId}:${challenge}`),
  );
  return bytesToB64Url(new Uint8Array(signature));
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
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'test-supabase-publishable-key',
    UNLOCK_MAX_FAILURES: '2',
    ADMIN_MAX_FAILURES: '2',
  };
}

function bearer(value) {
  return ['Bearer', value].join(' ');
}

function request(path, { method = 'GET', session, supabaseToken, body, origin = ORIGIN } = {}) {
  const headers = new Headers();
  if (origin) headers.set('Origin', origin);
  if (session) headers.set('X-Travel-Session', session);
  if (supabaseToken) headers.set('X-Supabase-Auth', bearer(supabaseToken));
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  return new Request(`https://broker.test${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function jsonFetch(env, path, options) {
  const response = await worker.fetch(request(path, options), env, {});
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  return { response, data };
}

function installProviderFetchStub() {
  const originalFetch = globalThis.fetch;
  const integrations = [];
  const kimiModels = [];
  const googleModels = [];
  let notionCalls = 0;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    const auth = init.headers?.Authorization || init.headers?.authorization || '';
    if (href.includes('api.notion.com/v1/')) notionCalls += 1;

    if (href === 'https://test.supabase.co/auth/v1/user') {
      assert.equal(auth, bearer('supabase-user-token'));
      return Response.json({ id: 'user-12345678', email: 'boss@example.com' });
    }

    if (href.startsWith('https://test.supabase.co/rest/v1/integrations')) {
      assert.equal(auth, bearer('supabase-user-token'));
      if ((init.method || 'GET') === 'GET') return Response.json(integrations.slice(0, 1));
      if (init.method === 'POST') {
        const body = JSON.parse(init.body || '{}');
        integrations.push({ id: 'integration-1', ...body });
        return new Response('', { status: 201 });
      }
      if (init.method === 'PATCH') {
        const body = JSON.parse(init.body || '{}');
        integrations[0] = { ...(integrations[0] || { id: 'integration-1' }), ...body };
        return new Response(null, { status: 204 });
      }
    }

    if (href.includes('api.notion.com/v1/databases/test-db')) {
      assert.equal(auth, bearer('notion-secret-for-test'));
      return Response.json({ id: 'test-db', object: 'database' });
    }

    if (href.includes('api.notion.com/v1/databases/personal-db')) {
      assert.equal(auth, bearer('user-notion-secret-for-test'));
      return Response.json({ id: 'personal-db', object: 'database' });
    }

    if (href.includes('api.notion.com/v1/pages')) {
      const body = JSON.parse(init.body || '{}');
      if (body.parent?.database_id === 'personal-db') {
        assert.equal(auth, bearer('user-notion-secret-for-test'));
        return Response.json({ id: 'personal-page-1', object: 'page' });
      }
      assert.equal(auth, bearer('notion-secret-for-test'));
      return Response.json({ id: 'page-1', object: 'page' });
    }

    if (href.includes('kimi.test/v1/chat/completions')) {
      assert.equal(auth, bearer('kimi-secret-for-test'));
      const body = JSON.parse(init.body || '{}');
      kimiModels.push(body.model);
      return Response.json({ choices: [{ message: { content: '{"ok":true,"provider":"kimi"}' } }] });
    }

    if (href.includes('generativelanguage.googleapis.com/v1beta/models?')) {
      assert.match(href, /key=google-secret-for-test/);
      return Response.json({ models: [{ name: 'models/gemma-4-31b' }] });
    }

    if (href.includes('generativelanguage.googleapis.com/v1beta/models/gemma-4-31b:generateContent')) {
      assert.match(href, /key=google-secret-for-test/);
      googleModels.push('gemma-4-31b');
      return Response.json({ candidates: [{ content: { parts: [{ text: '{"ok":true,"provider":"google"}' }] } }] });
    }

    return Response.json({ error: { message: 'Unexpected provider call' } }, { status: 500 });
  };
  const restore = () => {
    globalThis.fetch = originalFetch;
  };
  restore.notionCalls = () => notionCalls;
  restore.kimiModels = () => kimiModels.slice();
  restore.googleModels = () => googleModels.slice();
  return restore;
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

    const trusted = await trustedDeviceRegistration();
    const trustedOrigin = 'http://127.0.0.1:8902';
    const unlocked = await jsonFetch(env, '/session/unlock', {
      method: 'POST',
      origin: trustedOrigin,
      body: {
        password: UNLOCK_PASSWORD,
        trustDevice: true,
        devicePublicKey: trusted.publicKey,
        deviceName: 'Test phone',
      },
    });
    assert.equal(unlocked.response.status, 200);
    assert.equal(typeof unlocked.data.session, 'string');
    assert.equal(typeof unlocked.data.device.deviceId, 'string');
    assert.equal(unlocked.data.device.deviceName, 'Test phone');
    const session = unlocked.data.session;
    const deviceId = unlocked.data.device.deviceId;

    const challenge = await jsonFetch(env, '/session/challenge', {
      method: 'POST',
      origin: trustedOrigin,
      body: { deviceId },
    });
    assert.equal(challenge.response.status, 200);
    assert.equal(typeof challenge.data.challenge, 'string');

    const wrongOriginChallenge = await jsonFetch(env, '/session/challenge', {
      method: 'POST',
      origin: ORIGIN,
      body: { deviceId },
    });
    assert.equal(wrongOriginChallenge.response.status, 403);

    const refreshed = await jsonFetch(env, '/session/refresh', {
      method: 'POST',
      origin: trustedOrigin,
      body: {
        deviceId,
        challenge: challenge.data.challenge,
        signature: await signDeviceChallenge(trusted.privateKey, deviceId, challenge.data.challenge),
      },
    });
    assert.equal(refreshed.response.status, 200);
    assert.equal(typeof refreshed.data.session, 'string');

    const devices = await jsonFetch(env, '/session/devices', { session, origin: trustedOrigin });
    assert.equal(devices.response.status, 200);
    assert.equal(devices.data.devices.length, 1);
    assert.equal(devices.data.devices[0].deviceId, deviceId);

    const initialStatus = await jsonFetch(env, '/credentials/status', { session });
    assert.equal(initialStatus.response.status, 200);
    assert.deepEqual(initialStatus.data.providers.map((item) => item.status), ['missing', 'missing', 'missing']);

    const adminRotateBlockedOrigin = await jsonFetch(env, '/credentials/admin-rotate', {
      method: 'POST',
      origin: 'https://example.invalid',
      body: {
        provider: 'notion',
        secret: 'notion-secret-for-test',
        adminPassphrase: ADMIN_PASSWORD,
        extra: { databaseId: 'test-db' },
      },
    });
    assert.equal(adminRotateBlockedOrigin.response.status, 403);

    const adminRotateDenied = await jsonFetch(env, '/credentials/admin-rotate', {
      method: 'POST',
      body: {
        provider: 'notion',
        secret: 'notion-secret-for-test',
        adminPassphrase: 'wrong-admin',
        extra: { databaseId: 'test-db' },
      },
    });
    assert.equal(adminRotateDenied.response.status, 403);

    const adminRotate = await jsonFetch(env, '/credentials/admin-rotate', {
      method: 'POST',
      body: {
        provider: 'notion',
        secret: 'notion-secret-for-test',
        adminPassphrase: ADMIN_PASSWORD,
        extra: { databaseId: 'test-db' },
      },
    });
    assert.equal(adminRotate.response.status, 200);
    assert.equal(adminRotate.data.status.status, 'connected');
    assert.equal(adminRotate.data.stored, true);

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

    const personalMissing = await jsonFetch(env, '/integrations/notion/status', {
      supabaseToken: 'supabase-user-token',
    });
    assert.equal(personalMissing.response.status, 200);
    assert.equal(personalMissing.data.status.status, 'missing');

    const personalConnect = await jsonFetch(env, '/integrations/notion/connect', {
      method: 'POST',
      supabaseToken: 'supabase-user-token',
      body: {
        secret: 'user-notion-secret-for-test',
        databaseId: 'personal-db',
      },
    });
    assert.equal(personalConnect.response.status, 200);
    assert.equal(personalConnect.data.status.status, 'connected');

    const personalNotion = await jsonFetch(env, '/notion/request', {
      method: 'POST',
      supabaseToken: 'supabase-user-token',
      body: { path: '/pages', method: 'POST', databaseId: 'personal-db', body: { parent: {}, properties: {} } },
    });
    assert.equal(personalNotion.response.status, 200);
    assert.equal(personalNotion.data.data.id, 'personal-page-1');

    const notionCallsBeforeBlockedPersonal = restoreFetch.notionCalls();
    const blockedPersonalNotion = await jsonFetch(env, '/notion/request', {
      method: 'POST',
      supabaseToken: 'supabase-user-token',
      body: { path: '/pages', method: 'POST', databaseId: 'other-db', body: { parent: {}, properties: {} } },
    });
    assert.equal(blockedPersonalNotion.response.status, 403);
    assert.match(blockedPersonalNotion.data.error, /outside registered database/);
    assert.equal(restoreFetch.notionCalls(), notionCallsBeforeBlockedPersonal);

    const blockedPersonalDatabasePath = await jsonFetch(env, '/notion/request', {
      method: 'POST',
      supabaseToken: 'supabase-user-token',
      body: { path: '/databases/other-db/query', method: 'POST', body: { page_size: 1 } },
    });
    assert.equal(blockedPersonalDatabasePath.response.status, 403);
    assert.equal(restoreFetch.notionCalls(), notionCallsBeforeBlockedPersonal);

    const personalDisconnect = await jsonFetch(env, '/integrations/notion/disconnect', {
      method: 'POST',
      supabaseToken: 'supabase-user-token',
      body: {},
    });
    assert.equal(personalDisconnect.response.status, 200);
    assert.equal(personalDisconnect.data.status.status, 'disconnected');

    const revoke = await jsonFetch(env, '/session/revoke-device', {
      method: 'POST',
      session,
      origin: trustedOrigin,
      body: { deviceId },
    });
    assert.equal(revoke.response.status, 200);

    const revokedChallenge = await jsonFetch(env, '/session/challenge', {
      method: 'POST',
      origin: trustedOrigin,
      body: { deviceId },
    });
    assert.equal(revokedChallenge.response.status, 401);

    const kimiRotate = await jsonFetch(env, '/credentials/rotate', {
      method: 'POST',
      session,
      body: { provider: 'kimi', secret: 'kimi-secret-for-test', adminPassphrase: ADMIN_PASSWORD },
    });
    assert.equal(kimiRotate.response.status, 200);
    assert.equal(restoreFetch.kimiModels().at(-1), 'kimi-code');

    const kimi = await jsonFetch(env, '/kimi/json', {
      method: 'POST',
      session,
      body: { prompt: 'Return JSON', kind: 'test' },
    });
    assert.equal(kimi.response.status, 200);
    assert.equal(kimi.data.data.provider, 'kimi');
    assert.equal(restoreFetch.kimiModels().at(-1), 'kimi-code');

    const kimiWithoutAuth = await jsonFetch(env, '/kimi/json', {
      method: 'POST',
      body: { prompt: 'Return JSON', kind: 'test' },
    });
    assert.equal(kimiWithoutAuth.response.status, 401);

    const supabaseKimi = await jsonFetch(env, '/kimi/json', {
      method: 'POST',
      supabaseToken: 'supabase-user-token',
      body: { prompt: 'Return JSON', kind: 'test', model: 'kimi-code' },
    });
    assert.equal(supabaseKimi.response.status, 200);
    assert.equal(supabaseKimi.data.data.provider, 'kimi');

    env.SUPABASE_AI_DAILY_LIMIT = '1';
    const supabaseKimiLimited = await jsonFetch(env, '/kimi/json', {
      method: 'POST',
      supabaseToken: 'supabase-user-token',
      body: { prompt: 'Return JSON', kind: 'test', model: 'kimi-code' },
    });
    assert.equal(supabaseKimiLimited.response.status, 429);
    env.SUPABASE_AI_DAILY_LIMIT = '50';

    const googleRotate = await jsonFetch(env, '/credentials/rotate', {
      method: 'POST',
      session,
      body: { provider: 'google', secret: 'google-secret-for-test', adminPassphrase: ADMIN_PASSWORD },
    });
    assert.equal(googleRotate.response.status, 200);
    const vaultDump = JSON.stringify([...env.CREDENTIALS_VAULT.values.values()]);
    assert.equal(vaultDump.includes('notion-secret-for-test'), false);
    assert.equal(vaultDump.includes('kimi-secret-for-test'), false);
    assert.equal(vaultDump.includes('google-secret-for-test'), false);

    const statusAfterRotate = await jsonFetch(env, '/credentials/status', { session });
    assert.equal(typeof statusAfterRotate.data.providers.find((item) => item.provider === 'google')?.lastTestedAt, 'number');

    const google = await jsonFetch(env, '/google/json', {
      method: 'POST',
      session,
      body: { prompt: 'Return JSON', kind: 'test' },
    });
    assert.equal(google.response.status, 200);
    assert.equal(google.data.data.provider, 'google');
    assert.equal(restoreFetch.googleModels().at(-1), 'gemma-4-31b');

    const supabaseGoogle = await jsonFetch(env, '/google/json', {
      method: 'POST',
      supabaseToken: 'supabase-user-token',
      body: { prompt: 'Return JSON', kind: 'test', model: 'gemma-4-31b' },
    });
    assert.equal(supabaseGoogle.response.status, 200);
    assert.equal(supabaseGoogle.data.data.provider, 'google');
    assert.equal(restoreFetch.googleModels().at(-1), 'gemma-4-31b');

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
