import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authenticationOptions,
  challengeContext,
  registrationOptions,
  verifyBootstrapSecret,
  webAuthnConfig,
} from '../../server/admin/webauthn.js';

test('production WebAuthn origin and RP ID are exact', () => {
  const previous = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = 'production';
    assert.deepEqual(webAuthnConfig(), {
      origin: 'https://travel-expense-admin-kanban.vercel.app',
      rpID: 'travel-expense-admin-kanban.vercel.app',
    });
  } finally {
    if (previous === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previous;
  }
});

test('authentication and registration require user verification', async () => {
  const auth = await authenticationOptions([]);
  assert.equal(auth.userVerification, 'required');
  const registration = await registrationOptions([], 'boss');
  assert.equal(registration.authenticatorSelection.userVerification, 'required');
  assert.equal(registration.authenticatorSelection.residentKey, 'required');
  assert.equal(registration.rp.id, 'travel-expense-admin-kanban.vercel.app');
});

test('bootstrap secret and challenge context are exact', () => {
  const previous = process.env.ADMIN_PASSKEY_BOOTSTRAP_SECRET;
  try {
    process.env.ADMIN_PASSKEY_BOOTSTRAP_SECRET = '0123456789abcdef0123456789abcdef';
    assert.equal(verifyBootstrapSecret('0123456789abcdef0123456789abcdef'), true);
    assert.equal(verifyBootstrapSecret('0123456789abcdef0123456789abcdeF'), false);
    assert.match(challengeContext('authentication', 'flow', 'fingerprint'), /^[0-9a-f]{64}$/);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_PASSKEY_BOOTSTRAP_SECRET;
    else process.env.ADMIN_PASSKEY_BOOTSTRAP_SECRET = previous;
  }
});
