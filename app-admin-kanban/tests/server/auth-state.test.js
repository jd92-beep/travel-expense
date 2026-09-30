import assert from 'node:assert/strict';
import test from 'node:test';

import { authStateCall } from '../../server/admin/auth-state.js';
import { HttpError } from '../../server/admin/http.js';

const TEST_SIGNING_KEY = '0123456789abcdef0123456789abcdef';

test('authStateCall transport failures fail closed and log the redacted cause', async () => {
  const previousFetch = globalThis.fetch;
  const previousKeyId = process.env.ADMIN_BFF_KEY_ID;
  const previousSigningKey = process.env.ADMIN_BFF_SIGNING_KEY;
  const previousAuthUrl = process.env.ADMIN_EDGE_AUTH_STATE_URL;
  const previousConsoleError = console.error;
  const logged = [];
  process.env.ADMIN_BFF_KEY_ID = 'test-key';
  process.env.ADMIN_BFF_SIGNING_KEY = TEST_SIGNING_KEY;
  process.env.ADMIN_EDGE_AUTH_STATE_URL = 'https://edge.example/functions/v1/admin-auth-state';
  console.error = (line) => logged.push(String(line));
  globalThis.fetch = async () => {
    throw new TypeError('network failed for sk-secret-token-value');
  };

  try {
    await assert.rejects(
      () => authStateCall('/internal/session/verify', {}, { sessionHash: 'a'.repeat(64) }),
      (error) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.code, 'UPSTREAM_UNAVAILABLE');
        assert.equal(error.status, 503);
        assert.equal(error.message, 'Admin session store unavailable');
        return true;
      },
    );
    assert.equal(logged.length, 1);
    const entry = JSON.parse(logged[0]);
    assert.equal(entry.event, 'admin_auth_state_transport_failed');
    assert.equal(entry.route, '/internal/session/verify');
    assert.match(entry.message, /\[redacted\]/);
    assert.doesNotMatch(entry.message, /secret-token-value/);
  } finally {
    globalThis.fetch = previousFetch;
    console.error = previousConsoleError;
    if (previousKeyId === undefined) delete process.env.ADMIN_BFF_KEY_ID;
    else process.env.ADMIN_BFF_KEY_ID = previousKeyId;
    if (previousSigningKey === undefined) delete process.env.ADMIN_BFF_SIGNING_KEY;
    else process.env.ADMIN_BFF_SIGNING_KEY = previousSigningKey;
    if (previousAuthUrl === undefined) delete process.env.ADMIN_EDGE_AUTH_STATE_URL;
    else process.env.ADMIN_EDGE_AUTH_STATE_URL = previousAuthUrl;
  }
});
