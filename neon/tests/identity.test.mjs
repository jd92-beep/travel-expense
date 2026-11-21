import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createIdentityBridge } from '../identity.mjs';

const neonAuthUrl = 'https://ep-fixture.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth';
const supabaseUrl = 'https://travel-fixture.supabase.co';
const issuer = new URL(neonAuthUrl).origin;
const neonId = '22300000-0000-4000-8000-000000000001';
const originalId = '12300000-0000-4000-8000-000000000001';
const pair = await generateKeyPair('EdDSA', { extractable: true });
const jwk = { ...await exportJWK(pair.publicKey), kid: 'fixture', alg: 'EdDSA' };

function token(overrides = {}, authority = issuer, signingKey = pair.privateKey, age = '15m') {
  return new SignJWT({ emailVerified: true, email: 'linked@example.invalid', role: 'authenticated', ...overrides })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'fixture' }).setIssuedAt().setExpirationTime(age)
    .setIssuer(authority).setAudience(issuer).setSubject(neonId).sign(signingKey);
}

function fixture() {
  const bindings = new Map();
  let oldAccountReads = 0;
  const bridge = createIdentityBridge({
    neonAuthUrl,
    supabaseUrl,
    publishableKey: 'synthetic-publishable-key',
    async link(ledgerId, newId, email) {
      assert.equal(email, 'linked@example.invalid');
      bindings.set(newId, ledgerId);
      return ledgerId;
    },
    resolve: newId => bindings.get(newId),
    fetcher: async (url, init) => {
      assert.equal(init.redirect, 'error');
      if (String(url) === neonAuthUrl + '/.well-known/jwks.json') return Response.json({ keys: [jwk] });
      assert.equal(String(url), supabaseUrl + '/auth/v1/user');
      oldAccountReads++;
      if (init.headers.authorization !== 'Bearer synthetic') return new Response(null, { status: 401 });
      return Response.json({ id: originalId, email: 'Linked@example.invalid', email_confirmed_at: '2026-01-01T00:00:00Z' });
    },
  });
  return { bridge, reads: () => oldAccountReads };
}

test('links only after both verified accounts agree, then preserves the ledger ID', async () => {
  const { bridge, reads } = fixture();
  const valid = await token();
  assert.equal(await bridge.resolve(valid), null);
  assert.equal(await bridge.link({ neonToken: valid, legacyToken: 'expired' }), null);
  assert.equal(await bridge.link({ neonToken: await token({ email: 'other@example.invalid' }), legacyToken: 'synthetic' }), null);
  assert.equal(await bridge.link({ neonToken: await token({ emailVerified: false }), legacyToken: 'synthetic' }), null);
  assert.equal(reads(), 2);
  assert.equal(await bridge.link({ neonToken: valid, legacyToken: 'synthetic' }), originalId);
  assert.equal(await bridge.resolve(valid), originalId);
});

test('does not look up the previous account for an invalid Neon assertion', async () => {
  const { bridge, reads } = fixture();
  const forgery = await generateKeyPair('EdDSA');
  const invalid = [
    await token({}, 'https://other.example.invalid'),
    await token({}, issuer, forgery.privateKey),
    await token({}, issuer, pair.privateKey, '-1m'),
    await token({ banned: true }),
  ];
  for (const neonToken of invalid) {
    assert.equal(await bridge.link({ neonToken, legacyToken: 'synthetic' }), null);
  }
  assert.equal(reads(), 0);
});
