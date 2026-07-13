import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  adminAuthStateUrl,
  adminEdgeUrl,
  callSignedEdge,
  canonicalBffPayload,
  canonicalQuery,
  normalizeSignedRoute,
  signedEdgeHeaders,
} from '../../server/admin/edge.js';

const TEST_SIGNING_KEY = '0123456789abcdef0123456789abcdef';

test('canonical query uses RFC3986 order and rejects duplicate keys', () => {
  assert.equal(canonicalQuery(new URLSearchParams('z=two+words&a=%2F')), 'a=%2F&z=two%20words');
  assert.throws(() => canonicalQuery(new URLSearchParams('a=1&a=2')), /Duplicate/);
});

test('signed routes reject dot segments and repeated slashes', () => {
  assert.equal(normalizeSignedRoute('/api/runtime'), '/api/runtime');
  assert.throws(() => normalizeSignedRoute('/api/../runtime'), /segments/);
  assert.throws(() => normalizeSignedRoute('/api//runtime'), /route/);
});

test('internal Edge URLs are explicit HTTPS environment bindings', () => {
  const previousAdmin = process.env.ADMIN_EDGE_ADMIN_URL;
  const previousAuth = process.env.ADMIN_EDGE_AUTH_STATE_URL;
  try {
    delete process.env.ADMIN_EDGE_ADMIN_URL;
    delete process.env.ADMIN_EDGE_AUTH_STATE_URL;
    assert.throws(() => adminEdgeUrl(), /not configured/i);
    assert.throws(() => adminAuthStateUrl(), /not configured/i);
    process.env.ADMIN_EDGE_ADMIN_URL = 'http://edge.example/functions/v1/admin-kanban';
    assert.throws(() => adminEdgeUrl(), /invalid/i);
    process.env.ADMIN_EDGE_ADMIN_URL = 'https://edge.example/functions/v1/admin-kanban';
    process.env.ADMIN_EDGE_AUTH_STATE_URL = 'https://edge.example/functions/v1/admin-auth-state';
    assert.equal(adminEdgeUrl(), process.env.ADMIN_EDGE_ADMIN_URL);
    assert.equal(adminAuthStateUrl(), process.env.ADMIN_EDGE_AUTH_STATE_URL);
  } finally {
    if (previousAdmin === undefined) delete process.env.ADMIN_EDGE_ADMIN_URL;
    else process.env.ADMIN_EDGE_ADMIN_URL = previousAdmin;
    if (previousAuth === undefined) delete process.env.ADMIN_EDGE_AUTH_STATE_URL;
    else process.env.ADMIN_EDGE_AUTH_STATE_URL = previousAuth;
  }
});

test('Node signer matches the admin-v1 canonical protocol', () => {
  const bodyBytes = Buffer.from('{"hello":"world"}');
  const input = {
    actor: 'boss',
    bodyHash: createHash('sha256').update(bodyBytes).digest('hex'),
    expiresAt: 2_000_000_030,
    issuedAt: 2_000_000_000,
    keyId: 'test-key',
    method: 'POST',
    nonce: 'abcdefghijklmnopqrstuv',
    query: 'a=1&z=2',
    requestId: '018f06fd-8bc9-7e9c-8443-7c20f0c7d479',
    route: '/api/runtime',
    sessionHash: 'unauthenticated',
  };
  const headers = signedEdgeHeaders({
    ...input,
    bodyBytes,
    nowSeconds: input.issuedAt,
    secret: TEST_SIGNING_KEY,
  });
  assert.equal(
    canonicalBffPayload(input),
    [
      'admin-v1',
      'test-key',
      'POST',
      '/api/runtime',
      'a=1&z=2',
      input.bodyHash,
      input.requestId,
      'unauthenticated',
      'boss',
      '2000000000',
      '2000000030',
      'abcdefghijklmnopqrstuv',
    ].join('\n'),
  );
  assert.match(headers['X-Admin-Signature'], /^[A-Za-z0-9_-]{43}$/);
});

test('signed Edge calls can bind the BFF request id without changing the default path', async () => {
  const previousFetch = globalThis.fetch;
  const previousKeyId = process.env.ADMIN_BFF_KEY_ID;
  const previousSigningKey = process.env.ADMIN_BFF_SIGNING_KEY;
  const captured = [];
  process.env.ADMIN_BFF_KEY_ID = 'test-key';
  process.env.ADMIN_BFF_SIGNING_KEY = TEST_SIGNING_KEY;
  globalThis.fetch = async (_url, init) => {
    captured.push(init.headers);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const requestId = '018f06fd-8bc9-7e9c-8443-7c20f0c7d479';
    await callSignedEdge({
      actor: 'boss',
      baseUrl: 'https://edge.example/functions/v1/admin-kanban',
      method: 'GET',
      requestId,
      route: '/api/overview',
      sessionHash: 'a'.repeat(64),
    });
    await callSignedEdge({
      actor: 'boss',
      baseUrl: 'https://edge.example/functions/v1/admin-kanban',
      method: 'GET',
      route: '/api/overview',
      sessionHash: 'a'.repeat(64),
    });

    assert.equal(captured[0]['X-Admin-Request-Id'], requestId);
    assert.match(captured[1]['X-Admin-Request-Id'], /^[0-9a-f-]{36}$/i);
    assert.notEqual(captured[1]['X-Admin-Request-Id'], requestId);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKeyId === undefined) delete process.env.ADMIN_BFF_KEY_ID;
    else process.env.ADMIN_BFF_KEY_ID = previousKeyId;
    if (previousSigningKey === undefined) delete process.env.ADMIN_BFF_SIGNING_KEY;
    else process.env.ADMIN_BFF_SIGNING_KEY = previousSigningKey;
  }
});
