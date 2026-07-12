import assert from 'node:assert/strict';
import test from 'node:test';

import {
  passkeyEnrollmentContext,
  sanitizePasskeyCredentials,
} from './passkeys.js';

test('backup passkey context is fixed and hash-bound', () => {
  const context = passkeyEnrollmentContext();
  assert.equal(context.action, 'passkey_enroll');
  assert.match(context.targetHash, /^[0-9a-f]{64}$/);
  assert.match(context.previewHash, /^[0-9a-f]{64}$/);
});

test('browser passkey list never exposes credential or public keys', () => {
  const rows = sanitizePasskeyCredentials([{
    credentialId: 'credential-secret-value',
    publicKey: 'public-key-secret-value',
    counter: 42,
    transports: ['internal'],
    deviceType: 'multiDevice',
    backedUp: true,
    label: 'Boss Mac',
    createdAt: '2026-07-12T00:00:00Z',
    lastUsedAt: null,
  }]);
  assert.deepEqual(rows, [{
    id: rows[0].id,
    label: 'Boss Mac',
    deviceType: 'multiDevice',
    backedUp: true,
    createdAt: '2026-07-12T00:00:00Z',
    lastUsedAt: null,
  }]);
  assert.match(rows[0].id, /^[0-9a-f]{12}$/);
  assert.equal(JSON.stringify(rows).includes('credential-secret-value'), false);
  assert.equal(JSON.stringify(rows).includes('public-key-secret-value'), false);
});
