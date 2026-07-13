import assert from 'node:assert/strict';
import test from 'node:test';

import { publicPreviewError } from '../api/admin/passkeys/remove/preview.js';
import { publicRemovalError } from '../api/admin/passkeys/remove/commit.js';

const routeModules = [
  '../api/admin/auth/begin.js',
  '../api/admin/auth/finish.js',
  '../api/admin/passkeys/enroll/begin.js',
  '../api/admin/passkeys/enroll/finish.js',
  '../api/admin/passkeys/index.js',
  '../api/admin/passkeys/add/begin.js',
  '../api/admin/passkeys/add/finish.js',
  '../api/admin/passkeys/remove/preview.js',
  '../api/admin/passkeys/remove/commit.js',
  '../api/admin/reauth/begin.js',
  '../api/admin/reauth/finish.js',
  '../api/admin/session.js',
  '../api/admin/[...path].js',
];

test('all fixed browser admin routes import as handlers', async () => {
  for (const path of routeModules) {
    const route = await import(path);
    assert.equal(typeof route.default, 'function', `${path} must export a handler`);
  }
});

test('passkey removal maps internal state errors to the accepted public envelope', () => {
  assert.equal(publicPreviewError(new Error('Final passkey is break-glass protected')).code, 'PROTECTED_TARGET');
  assert.equal(publicPreviewError(new Error('Passkey removal target is unavailable')).code, 'NOT_FOUND');
  assert.equal(publicRemovalError('MFA_STEP_UP_REQUIRED').code, 'MFA_REQUIRED');
  assert.equal(publicRemovalError('FINAL_PASSKEY_PROTECTED').code, 'PROTECTED_TARGET');
  assert.equal(publicRemovalError('TARGET_NOT_FOUND').code, 'NOT_FOUND');
  assert.equal(publicRemovalError('PREVIEW_STALE').code, 'PREVIEW_STALE');
  const unknown = publicRemovalError('unexpected_internal_code');
  assert.equal(unknown.code, 'UPSTREAM_UNAVAILABLE');
  assert.equal(unknown.status, 503);
  assert.equal(unknown.retryable, true);
});
