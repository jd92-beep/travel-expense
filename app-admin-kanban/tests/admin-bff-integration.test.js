import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import test from 'node:test';

import adminGateway from '../api/admin.js';

const ADMIN_ORIGIN = 'https://travel-expense-admin-kanban.vercel.app';
const INTERNAL_PATH_PARAM = '__admin_path';
const ADMIN_EDGE_URL = 'https://admin-edge.test/functions/v1/admin-kanban';
const AUTH_STATE_URL = 'https://auth-state.test/functions/v1/admin-auth-state';
const SIGNING_KEY = '0123456789abcdef0123456789abcdef';
const SESSION_TOKEN = 'opaque-session-token';
const CSRF_TOKEN = 'csrf-token';
const SESSION_HASH = createHash('sha256').update(SESSION_TOKEN).digest('hex');
const CSRF_HASH = createHash('sha256').update(CSRF_TOKEN).digest('hex');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHOTO_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const PHOTO_ID = '60000000-0000-4000-8000-000000000001';

const R2_PREVIEW = {
  action: 'receipt_trash',
  idempotencyKey: '10000000-0000-4000-8000-000000000001',
  targetId: '20000000-0000-4000-8000-000000000001',
  payload: { expectedVersion: 1 },
};
const GRANT_ID = '30000000-0000-4000-8000-000000000001';
const OPERATION_ID = '40000000-0000-4000-8000-000000000001';

class ResponseDouble {
  constructor() {
    this.headers = new Map();
    this.statusCode = 200;
    this.body = Buffer.alloc(0);
  }

  setHeader(name, value) {
    this.headers.set(String(name).toLowerCase(), value);
  }

  getHeader(name) {
    return this.headers.get(String(name).toLowerCase());
  }

  end(value = '') {
    this.body = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  }

  json() {
    return JSON.parse(this.body.toString('utf8'));
  }
}

function browserRequest({ method = 'GET', url, headers = {}, body } = {}) {
  return Object.assign(Readable.from(body === undefined ? [] : [Buffer.from(body)]), {
    headers: Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])),
    method,
    socket: { remoteAddress: '127.0.0.1' },
    url,
  });
}

function rewriteAdminRequest(url) {
  const requestUrl = new URL(url, ADMIN_ORIGIN);
  const prefix = '/api/admin/';
  if (!requestUrl.pathname.startsWith(prefix)) return url;
  const path = requestUrl.pathname.slice(prefix.length);
  requestUrl.searchParams.append(INTERNAL_PATH_PARAM, path);
  return `${requestUrl.pathname}${requestUrl.search}`;
}

async function invokeRaw(options) {
  const res = new ResponseDouble();
  await adminGateway(browserRequest(options), res);
  return res;
}

function invoke(options) {
  return invokeRaw({ ...options, url: rewriteAdminRequest(options.url) });
}

function responseEnvelope(data, requestId, warnings = []) {
  return new Response(JSON.stringify({
    ok: true,
    data,
    error: null,
    meta: { requestId, generatedAt: '2026-07-12T00:00:00.000Z', warnings },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function canonicalQuery(url) {
  return [...url.searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

function assertSignedCall(call, { baseUrl, route, sessionHash = SESSION_HASH }) {
  const url = new URL(call.url);
  const headers = call.headers;
  const expectedRoute = `${new URL(baseUrl).pathname}${route}`;
  const bodyHash = createHash('sha256').update(call.body).digest('hex');
  const query = canonicalQuery(url);

  assert.equal(url.protocol, 'https:');
  assert.equal(`${url.pathname}`, expectedRoute);
  assert.equal(headers['x-admin-key-id'], 'integration-key');
  assert.equal(headers['x-admin-actor'], 'boss');
  assert.equal(headers['x-admin-session-hash'], sessionHash);
  assert.match(headers['x-admin-request-id'], UUID_RE);
  assert.equal(Buffer.from(headers['x-admin-nonce'], 'base64url').length, 16);
  assert.equal(headers.authorization, undefined);
  assert.equal(headers['content-type'], call.body.length ? 'application/json' : undefined);

  const canonical = [
    'admin-v1',
    headers['x-admin-key-id'],
    call.method,
    route,
    query,
    bodyHash,
    headers['x-admin-request-id'],
    headers['x-admin-session-hash'],
    headers['x-admin-actor'],
    headers['x-admin-issued-at'],
    headers['x-admin-expires-at'],
    headers['x-admin-nonce'],
  ].join('\n');
  const signature = createHmac('sha256', SIGNING_KEY).update(canonical).digest('base64url');
  assert.equal(headers['x-admin-signature'], signature);
  assert.equal(Number(headers['x-admin-expires-at']), Number(headers['x-admin-issued-at']) + 30);
}

function sessionHeaders(overrides = {}) {
  return {
    authorization: `${['Be', 'arer'].join('')} browser-token-must-never-reach-edge`,
    cookie: `__Host-admin_session=${SESSION_TOKEN}; __Host-admin_csrf=${CSRF_TOKEN}`,
    ...overrides,
  };
}

function mutationHeaders(overrides = {}) {
  return sessionHeaders({
    'content-type': 'application/json',
    origin: ADMIN_ORIGIN,
    'sec-fetch-site': 'same-origin',
    'x-admin-csrf': CSRF_TOKEN,
    ...overrides,
  });
}

test('Admin BFF black-box integration gate', async (t) => {
  const previousFetch = globalThis.fetch;
  const previousConsoleError = console.error;
  const environment = {
    ADMIN_ALLOWED_ORIGIN: process.env.ADMIN_ALLOWED_ORIGIN,
    ADMIN_BFF_KEY_ID: process.env.ADMIN_BFF_KEY_ID,
    ADMIN_BFF_SIGNING_KEY: process.env.ADMIN_BFF_SIGNING_KEY,
    ADMIN_EDGE_ADMIN_URL: process.env.ADMIN_EDGE_ADMIN_URL,
    ADMIN_EDGE_AUTH_STATE_URL: process.env.ADMIN_EDGE_AUTH_STATE_URL,
    ADMIN_KANBAN_HASH: process.env.ADMIN_KANBAN_HASH,
    ADMIN_KANBAN_SUBJECT: process.env.ADMIN_KANBAN_SUBJECT,
  };
  const calls = [];
  let adminReply = 'success';
  let photoBodyReads = 0;

  process.env.ADMIN_ALLOWED_ORIGIN = ADMIN_ORIGIN;
  process.env.ADMIN_BFF_KEY_ID = 'integration-key';
  process.env.ADMIN_BFF_SIGNING_KEY = SIGNING_KEY;
  process.env.ADMIN_EDGE_ADMIN_URL = ADMIN_EDGE_URL;
  process.env.ADMIN_EDGE_AUTH_STATE_URL = AUTH_STATE_URL;
  process.env.ADMIN_KANBAN_HASH = `scrypt:v1:131072:8:1:${Buffer.alloc(16).toString('base64url')}:${Buffer.alloc(32).toString('base64url')}`;
  process.env.ADMIN_KANBAN_SUBJECT = 'boss';
  console.error = () => {};
  globalThis.fetch = async (rawUrl, init = {}) => {
    const url = new URL(String(rawUrl));
    const call = {
      body: Buffer.from(init.body || ''),
      headers: Object.fromEntries(Object.entries(init.headers || {}).map(([key, value]) => [key.toLowerCase(), String(value)])),
      method: String(init.method || 'GET').toUpperCase(),
      url: url.toString(),
    };
    calls.push(call);

    if (url.href.startsWith(`${AUTH_STATE_URL}/`)) {
      assertSignedCall(call, { baseUrl: AUTH_STATE_URL, route: '/internal/session/verify' });
      assert.deepEqual(JSON.parse(call.body.toString('utf8')), {
        tokenHash: SESSION_HASH,
        passphraseFingerprint: createHash('sha256').update(process.env.ADMIN_KANBAN_HASH).digest('hex'),
      });
      return responseEnvelope(
        { sessionId: 'session-1', csrfHash: CSRF_HASH },
        call.headers['x-admin-request-id'],
      );
    }
    if (!url.href.startsWith(`${ADMIN_EDGE_URL}/`)) throw new Error(`unexpected fetch target: ${url}`);
    if (url.pathname.endsWith(`/api/receipts/${PHOTO_ID}/photo`)
      && (adminReply === 'photo' || adminReply === 'photo-request-id-mismatch')) {
      const response = new Response(PHOTO_BYTES, {
        status: 200,
        headers: {
          'content-length': String(PHOTO_BYTES.length),
          'content-type': 'image/jpeg',
          'x-admin-request-id': adminReply === 'photo'
            ? call.headers['x-admin-request-id']
            : '70000000-0000-4000-8000-000000000001',
        },
      });
      const readBody = response.arrayBuffer.bind(response);
      response.arrayBuffer = async () => {
        photoBodyReads += 1;
        return readBody();
      };
      return response;
    }
    if (adminReply === 'redirect') {
      return new Response(null, { status: 302, headers: { location: 'https://elsewhere.test/' } });
    }
    if (adminReply === 'network') throw new TypeError('network unavailable');
    if (adminReply === 'invalid') {
      return new Response('not-json', { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    if (adminReply === 'error-envelope') {
      return new Response(JSON.stringify({
        ok: false,
        data: null,
        error: { code: 'UPSTREAM_UNAVAILABLE', message: 'edge error', retryable: true },
        meta: {
          requestId: call.headers['x-admin-request-id'],
          generatedAt: '2026-07-12T00:00:00.000Z',
          warnings: [],
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const responseRequestId = adminReply === 'request-id-mismatch'
      ? '50000000-0000-4000-8000-000000000001'
      : call.headers['x-admin-request-id'];
    return responseEnvelope(
      { source: 'edge' },
      responseRequestId,
      adminReply === 'unsafe-warnings' ? [42] : [],
    );
  };

  try {
    await t.test('fixed paths retain their original method contracts', async () => {
      const wrongMethods = [
        ['GET', '/api/admin/auth/begin'],
        ['GET', '/api/admin/auth/finish'],
        ['GET', '/api/admin/passkeys/enroll/begin'],
        ['GET', '/api/admin/passkeys/enroll/finish'],
        ['POST', '/api/admin/passkeys'],
        ['GET', '/api/admin/passkeys/add/begin'],
        ['GET', '/api/admin/passkeys/add/finish'],
        ['GET', '/api/admin/passkeys/remove/preview'],
        ['GET', '/api/admin/passkeys/remove/commit'],
        ['GET', '/api/admin/reauth/begin'],
        ['GET', '/api/admin/reauth/finish'],
        ['POST', '/api/admin/session'],
      ];
      calls.length = 0;
      for (const [method, url] of wrongMethods) {
        const res = await invoke({ method, url });
        assert.equal(res.statusCode, 405, `${method} ${url}`);
        assert.equal(res.json().error.code, 'METHOD_NOT_ALLOWED', `${method} ${url}`);
      }
      for (const method of ['GET', 'DELETE']) {
        const res = await invoke({ method, url: '/api/admin/session' });
        assert.equal(res.statusCode, 401, `${method} /api/admin/session`);
        assert.equal(res.json().error.code, 'UNAUTHORIZED', `${method} /api/admin/session`);
      }
      assert.equal(calls.length, 0);
    });

    await t.test('Vercel-preserved rewritten session requests reach the fixed JSON handler instead of SPA HTML', async () => {
      const res = await invokeRaw({ url: '/api/admin/session?client=probe&__admin_path=session' });
      assert.equal(res.statusCode, 401);
      assert.equal(res.getHeader('content-type'), 'application/json; charset=utf-8');
      assert.equal(res.json().error.code, 'UNAUTHORIZED');
      assert.doesNotMatch(res.body.toString('utf8'), /<!doctype html>/i);
    });

    await t.test('missing opaque session rejects before either Edge service', async () => {
      calls.length = 0;
      const res = await invoke({ url: '/api/admin/overview' });
      assert.equal(res.statusCode, 401);
      assert.equal(res.json().error.code, 'UNAUTHORIZED');
      assert.equal(calls.length, 0);
    });

    await t.test('valid browser requests verify session then use signed allowlisted reads', async () => {
      calls.length = 0;
      const first = await invoke({ headers: sessionHeaders(), url: '/api/admin/search?q=ab' });
      const second = await invoke({ headers: sessionHeaders(), url: '/api/admin/search?q=ab' });
      const edgeCalls = calls.filter((call) => call.url.startsWith(`${ADMIN_EDGE_URL}/`));

      assert.equal(calls.length, 4);
      assert.match(first.getHeader('x-admin-request-id'), UUID_RE);
      assert.match(second.getHeader('x-admin-request-id'), UUID_RE);
      assert.notEqual(first.getHeader('x-admin-request-id'), second.getHeader('x-admin-request-id'));
      assert.equal(edgeCalls.length, 2);
      assertSignedCall(edgeCalls[0], { baseUrl: ADMIN_EDGE_URL, route: '/api/search' });
      assertSignedCall(edgeCalls[1], { baseUrl: ADMIN_EDGE_URL, route: '/api/search' });
      assert.equal(canonicalQuery(new URL(edgeCalls[0].url)), 'q=ab');
      assert.equal(new URL(edgeCalls[0].url).searchParams.has(INTERNAL_PATH_PARAM), false);
      assert.notEqual(edgeCalls[0].headers['x-admin-request-id'], edgeCalls[1].headers['x-admin-request-id']);
      assert.notEqual(edgeCalls[0].headers['x-admin-nonce'], edgeCalls[1].headers['x-admin-nonce']);
    });

    await t.test('malformed internal rewrite routes fail closed before authentication or upstream calls', async () => {
      for (const route of [
        '',
        '%',
        '%ZZ',
        'overview//extra',
        'overview/../runtime',
        'overview\\runtime',
        'overview%0Aruntime',
        'overview%2fruntime',
      ]) {
        calls.length = 0;
        const res = await invokeRaw({
          headers: sessionHeaders(),
          url: `/api/admin?${INTERNAL_PATH_PARAM}=${route}`,
        });
        assert.equal(res.statusCode, 404, route);
        assert.equal(res.json().error.code, 'NOT_FOUND', route);
        assert.equal(calls.length, 0, route);
      }

      for (const url of [
        `/api/admin?${INTERNAL_PATH_PARAM}=session`,
        `/api/admin?${INTERNAL_PATH_PARAM}=overview&${INTERNAL_PATH_PARAM}=runtime`,
        `/api/admin/session?${INTERNAL_PATH_PARAM}=overview`,
        `/api/admin/session?${INTERNAL_PATH_PARAM}=session&${INTERNAL_PATH_PARAM}=session`,
        '/api/admin/session',
        `/api/admin/%73ession?${INTERNAL_PATH_PARAM}=session`,
      ]) {
        calls.length = 0;
        const res = await invokeRaw({ headers: sessionHeaders(), url });
        assert.equal(res.statusCode, 404, url);
        assert.equal(res.json().error.code, 'NOT_FOUND', url);
        assert.equal(calls.length, 0, url);
      }
    });

    await t.test('photo streams bind response provenance before copying bytes', async () => {
      calls.length = 0;
      photoBodyReads = 0;
      adminReply = 'photo';
      const valid = await invoke({
        headers: sessionHeaders(),
        url: `/api/admin/receipts/${PHOTO_ID}/photo`,
      });
      const validEdgeCall = calls.find((call) => call.url.startsWith(`${ADMIN_EDGE_URL}/`));
      assert.equal(valid.statusCode, 200);
      assert.deepEqual(valid.body, PHOTO_BYTES);
      assert.equal(photoBodyReads, 1);
      assertSignedCall(validEdgeCall, {
        baseUrl: ADMIN_EDGE_URL,
        route: `/api/receipts/${PHOTO_ID}/photo`,
      });

      calls.length = 0;
      photoBodyReads = 0;
      adminReply = 'photo-request-id-mismatch';
      const mismatch = await invoke({
        headers: sessionHeaders(),
        url: `/api/admin/receipts/${PHOTO_ID}/photo`,
      });
      assert.equal(mismatch.statusCode, 502);
      assert.equal(mismatch.json().error.code, 'UPSTREAM_UNAVAILABLE');
      assert.equal(photoBodyReads, 0);
      adminReply = 'success';
    });

    await t.test('mutation CSRF, origin, fetch metadata and JSON checks stop before Admin Edge', async () => {
      const cases = [
        ['missing csrf', mutationHeaders({ 'x-admin-csrf': '' }), 403, 'CSRF_REJECTED'],
        ['wrong csrf', mutationHeaders({ 'x-admin-csrf': 'wrong' }), 403, 'CSRF_REJECTED'],
        ['wrong origin', mutationHeaders({ origin: 'https://other.test' }), 403, 'CSRF_REJECTED'],
        ['wrong fetch site', mutationHeaders({ 'sec-fetch-site': 'cross-site' }), 403, 'CSRF_REJECTED'],
        ['wrong content type', mutationHeaders({ 'content-type': 'text/plain' }), 400, 'VALIDATION_FAILED'],
      ];
      for (const [name, headers, status, code] of cases) {
        calls.length = 0;
        const res = await invoke({
          body: JSON.stringify(R2_PREVIEW),
          headers,
          method: 'POST',
          url: '/api/admin/operations/preview',
        });
        assert.equal(res.statusCode, status, name);
        assert.equal(res.json().error.code, code, name);
        assert.equal(calls.filter((call) => call.url.startsWith(`${ADMIN_EDGE_URL}/`)).length, 0, name);
      }
    });

    await t.test('bounded R2 preview and commit bind the approved body, grant and session', async () => {
      calls.length = 0;
      const preview = await invoke({
        body: JSON.stringify(R2_PREVIEW),
        headers: mutationHeaders(),
        method: 'POST',
        url: '/api/admin/operations/preview',
      });
      const commit = await invoke({
        body: JSON.stringify({ grantId: GRANT_ID }),
        headers: mutationHeaders(),
        method: 'POST',
        url: `/api/admin/operations/${OPERATION_ID}/commit`,
      });
      const edgeCalls = calls.filter((call) => call.url.startsWith(`${ADMIN_EDGE_URL}/`));

      assert.equal(preview.statusCode, 200);
      assert.equal(commit.statusCode, 200);
      assert.equal(edgeCalls.length, 2);
      assertSignedCall(edgeCalls[0], { baseUrl: ADMIN_EDGE_URL, route: '/api/operations/preview' });
      assertSignedCall(edgeCalls[1], { baseUrl: ADMIN_EDGE_URL, route: `/api/operations/${OPERATION_ID}/commit` });
      assert.deepEqual(JSON.parse(edgeCalls[0].body.toString('utf8')), R2_PREVIEW);
      assert.deepEqual(JSON.parse(edgeCalls[1].body.toString('utf8')), { grantId: GRANT_ID });

      calls.length = 0;
      const tooLarge = await invoke({
        body: JSON.stringify({ ...R2_PREVIEW, payload: { padding: 'x'.repeat(64 * 1024) } }),
        headers: mutationHeaders(),
        method: 'POST',
        url: '/api/admin/operations/preview',
      });
      assert.equal(tooLarge.statusCode, 413);
      assert.equal(tooLarge.json().error.code, 'VALIDATION_FAILED');
      assert.equal(calls.filter((call) => call.url.startsWith(`${ADMIN_EDGE_URL}/`)).length, 0);
    });

    await t.test('redirects, invalid envelopes and unallowlisted paths fail closed', async () => {
      calls.length = 0;
      adminReply = 'redirect';
      const redirect = await invoke({ headers: sessionHeaders(), url: '/api/admin/overview' });
      assert.equal(redirect.statusCode, 502);
      assert.equal(redirect.json().error.code, 'UPSTREAM_UNAVAILABLE');
      assert.equal(redirect.json().error.retryable, true);

      calls.length = 0;
      adminReply = 'network';
      const network = await invoke({ headers: sessionHeaders(), url: '/api/admin/overview' });
      assert.equal(network.statusCode, 503);
      assert.equal(network.json().error.code, 'UPSTREAM_UNAVAILABLE');
      assert.equal(network.json().error.retryable, true);

      calls.length = 0;
      adminReply = 'invalid';
      const invalid = await invoke({ headers: sessionHeaders(), url: '/api/admin/overview' });
      assert.equal(invalid.statusCode, 502);
      assert.equal(invalid.json().ok, false);
      assert.equal(invalid.json().data, null);
      assert.equal(invalid.json().error.code, 'UPSTREAM_UNAVAILABLE');
      assert.equal(invalid.json().error.retryable, true);

      calls.length = 0;
      adminReply = 'error-envelope';
      const errorEnvelope = await invoke({ headers: sessionHeaders(), url: '/api/admin/overview' });
      assert.equal(errorEnvelope.statusCode, 502);
      assert.equal(errorEnvelope.json().ok, false);
      assert.equal(errorEnvelope.json().data, null);
      assert.equal(errorEnvelope.json().error.code, 'UPSTREAM_UNAVAILABLE');
      assert.equal(errorEnvelope.json().error.retryable, true);

      calls.length = 0;
      adminReply = 'request-id-mismatch';
      const mismatchedRequestId = await invoke({ headers: sessionHeaders(), url: '/api/admin/overview' });
      assert.equal(mismatchedRequestId.statusCode, 502);
      assert.equal(mismatchedRequestId.json().error.code, 'UPSTREAM_UNAVAILABLE');

      calls.length = 0;
      adminReply = 'unsafe-warnings';
      const unsafeWarnings = await invoke({ headers: sessionHeaders(), url: '/api/admin/overview' });
      assert.equal(unsafeWarnings.statusCode, 502);
      assert.equal(unsafeWarnings.json().error.code, 'UPSTREAM_UNAVAILABLE');

      calls.length = 0;
      adminReply = 'success';
      const escaped = await invoke({ headers: sessionHeaders(), url: '/api/admin/https://attacker.test/' });
      assert.equal(escaped.statusCode, 404);
      assert.equal(escaped.json().error.code, 'NOT_FOUND');
      assert.equal(calls.length, 0);
    });
  } finally {
    globalThis.fetch = previousFetch;
    console.error = previousConsoleError;
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
