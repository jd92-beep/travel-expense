import assert from 'node:assert/strict';
import test from 'node:test';

import { revokeAdminSession, rotateOpaqueSession } from '../../server/admin/session.js';

process.env.ADMIN_KANBAN_HASH = `scrypt:v1:131072:8:1:${Buffer.alloc(16).toString('base64url')}:${Buffer.alloc(32).toString('base64url')}`;

function responseRecorder() {
  const headers = new Map();
  return {
    headers,
    setHeader(name, value) {
      headers.set(name, value);
    },
  };
}

test('failed durable logout revoke retains browser cookies', async () => {
  const res = responseRecorder();
  await assert.rejects(
    () => revokeAdminSession(
      { headers: { cookie: '__Host-admin_session=session-token' } },
      res,
      'logout',
      async () => { throw new Error('store unavailable'); },
    ),
    /store unavailable/,
  );
  assert.equal(res.headers.has('Set-Cookie'), false);
});

test('privilege elevation rotates the session with one atomic auth-state call', async () => {
  const res = responseRecorder();
  const calls = [];
  const rotated = await rotateOpaqueSession(
    res,
    { actor: 'boss', tokenHash: 'a'.repeat(64) },
    async (route, body, context) => {
      calls.push({ route, body, context });
      return {
        actor: 'boss',
        sessionId: '97000000-0000-4000-8000-000000000001',
      };
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].route, '/internal/session/rotate');
  assert.equal(calls[0].body.tokenHash, 'a'.repeat(64));
  assert.match(calls[0].body.nextTokenHash, /^[0-9a-f]{64}$/);
  assert.equal(calls[0].context.sessionHash, 'a'.repeat(64));
  assert.equal(rotated.tokenHash, calls[0].body.nextTokenHash);
  assert.equal(res.headers.get('Set-Cookie').length, 2);
});

test('failed atomic rotation leaves the browser cookie untouched', async () => {
  const res = responseRecorder();
  await assert.rejects(
    () => rotateOpaqueSession(
      res,
      { actor: 'boss', tokenHash: 'a'.repeat(64) },
      async () => { throw new Error('rotation failed'); },
    ),
    /rotation failed/,
  );
  assert.equal(res.headers.has('Set-Cookie'), false);
});
