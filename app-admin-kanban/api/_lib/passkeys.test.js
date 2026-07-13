import assert from 'node:assert/strict';
import test from 'node:test';

import {
  passkeyEnrollmentContext,
  passkeyRemovalContext,
  passkeyRemovalPreview,
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

test('passkey removal selector and set context are opaque and bind the exact target set', () => {
  const credentials = [
    { credentialId: 'credential-secret-value-one', label: 'Boss Mac' },
    { credentialId: 'credential-secret-value-two', label: 'Boss backup' },
  ];
  const preview = passkeyRemovalPreview(credentials, 'credential-secret-value-two');
  const context = passkeyRemovalContext(preview.selector, preview.setHash);

  assert.equal(preview.count, 2);
  assert.equal(preview.remainingCount, 1);
  assert.match(preview.selector, /^[0-9a-f]{64}$/);
  assert.match(preview.setHash, /^[0-9a-f]{64}$/);
  assert.match(context.targetHash, /^[0-9a-f]{64}$/);
  assert.match(context.previewHash, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify({ preview, context }).includes('credential-secret-value-two'), false);
  assert.equal(JSON.stringify({ preview, context }).includes('credential-secret-value-one'), false);
});

test('passkey removal preview rejects final and stale targets without exposing credential ids', () => {
  assert.throws(
    () => passkeyRemovalPreview([{ credentialId: 'credential-secret-value-one' }], 'credential-secret-value-one'),
    /final passkey/i,
  );
  assert.throws(
    () => passkeyRemovalPreview([{ credentialId: 'credential-secret-value-one' }], 'missing-credential'),
    /target/i,
  );
  const current = passkeyRemovalPreview([
    { credentialId: 'credential-secret-value-one' },
    { credentialId: 'credential-secret-value-two' },
  ], 'credential-secret-value-two');
  const changed = passkeyRemovalPreview([
    { credentialId: 'credential-secret-value-one' },
    { credentialId: 'credential-secret-value-two' },
    { credentialId: 'credential-secret-value-three' },
  ], current.selector);
  assert.notEqual(current.setHash, changed.setHash);
});
