import assert from 'node:assert/strict';
import test from 'node:test';

import adminGateway from '../api/admin/[...path].js';
import { publicPreviewError } from '../server/admin/handlers/passkeys/remove/preview.js';
import { publicRemovalError } from '../server/admin/handlers/passkeys/remove/commit.js';
import { fixedAdminRoute } from '../server/admin/routes.js';

const fixedRoutes = [
  ['POST', '/api/admin/auth/begin'],
  ['POST', '/api/admin/auth/finish'],
  ['POST', '/api/admin/passkeys/enroll/begin'],
  ['POST', '/api/admin/passkeys/enroll/finish'],
  ['GET', '/api/admin/passkeys'],
  ['POST', '/api/admin/passkeys/add/begin'],
  ['POST', '/api/admin/passkeys/add/finish'],
  ['POST', '/api/admin/passkeys/remove/preview'],
  ['POST', '/api/admin/passkeys/remove/commit'],
  ['POST', '/api/admin/reauth/begin'],
  ['POST', '/api/admin/reauth/finish'],
  ['GET', '/api/admin/session'],
  ['DELETE', '/api/admin/session'],
];

test('catch-all preserves every fixed browser admin pathname', () => {
  assert.equal(typeof adminGateway, 'function');
  for (const [, pathname] of fixedRoutes) {
    assert.equal(typeof fixedAdminRoute(pathname), 'function', pathname);
  }
  assert.equal(fixedAdminRoute('/api/admin/overview'), undefined);
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
