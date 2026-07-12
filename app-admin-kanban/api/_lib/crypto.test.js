import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hashAdminPassphrase,
  loginBucketKey,
  parseScryptHash,
  sourceNetwork,
  verifyAdminPassphrase,
} from './crypto.js';

test('scrypt v1 hash verifies exact passphrase without trim or normalization', async () => {
  const previous = process.env.ADMIN_KANBAN_HASH;
  try {
    process.env.ADMIN_KANBAN_HASH = await hashAdminPassphrase(' exact passphrase ', Buffer.alloc(16, 7));
    assert.equal(await verifyAdminPassphrase(' exact passphrase '), true);
    assert.equal(await verifyAdminPassphrase('exact passphrase'), false);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_KANBAN_HASH;
    else process.env.ADMIN_KANBAN_HASH = previous;
  }
});

test('malformed and weakened scrypt hashes fail closed', () => {
  assert.throws(() => parseScryptHash('pbkdf2:100000:salt:hash'), /format/);
  assert.throws(
    () => parseScryptHash(`scrypt:v1:1024:8:1:${Buffer.alloc(16).toString('base64url')}:${Buffer.alloc(32).toString('base64url')}`),
    /parameters/,
  );
});

test('source rate buckets store network prefixes, never raw addresses', () => {
  assert.equal(sourceNetwork('203.0.113.42'), '203.0.113.0/24');
  assert.equal(sourceNetwork('2001:db8:abcd:1234:5678::1'), '2001:0db8:abcd:1234::/64');
  const previous = process.env.ADMIN_LOGIN_RATE_PEPPER;
  try {
    process.env.ADMIN_LOGIN_RATE_PEPPER = '0123456789abcdef0123456789abcdef';
    const key = loginBucketKey({
      headers: { 'x-forwarded-for': '203.0.113.42, 10.0.0.1' },
      socket: {},
    });
    assert.match(key, /^[0-9a-f]{64}$/);
    assert.equal(key.includes('203.0.113'), false);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_LOGIN_RATE_PEPPER;
    else process.env.ADMIN_LOGIN_RATE_PEPPER = previous;
  }
});
