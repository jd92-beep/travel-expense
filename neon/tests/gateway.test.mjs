import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jwtVerify } from 'jose';
import { createGateway } from '../gateway.mjs';

const origin = 'https://travel-rehearsal.onrender.com';
const postgrestOrigin = 'http://127.0.0.1:49356';
const postgrestSecret = 'synthetic fixture secret for the local JWT';
const ledgerId = '12300000-0000-4000-8000-000000000001';
const ownPhoto = ledgerId + '/fixture.jpg';
const otherPhoto = '12300000-0000-4000-8000-000000000002/fixture.jpg';
const objectRoute = '/storage/v1/object/';
const signRoute = objectRoute + 'sign/receipt-photos';

function setup() {
  let linked = false;
  const sent = [];
  const stored = new Map();
  const requestHandler = createGateway({
    postgrestOrigin, postgrestSecret, origins: [origin],
    identities: {
      account: token => token === 'fixture' ? { ledgerId: linked ? ledgerId : null, email: 'test@example.invalid' } : null,
      link: ({ neonToken, legacyToken }) => {
        if (neonToken !== 'fixture' || legacyToken !== 'previous') return null;
        linked = true;
        return ledgerId;
      },
    },
    photos: {
      get: path => stored.get(path),
      put: (path, body, mime) => stored.set(path, { body, mime }),
    },
    fetcher: async (url, options) => {
      const jwt = options.headers.get('authorization').slice(7);
      const { payload } = await jwtVerify(jwt, new TextEncoder().encode(postgrestSecret), {
        algorithms: ['HS256'], audience: 'travel-expense-db',
      });
      sent.push({ url, payload });
      if (new URL(url).pathname === '/receipt_photos') {
        assert.equal(payload.sub, ledgerId);
        return Response.json([{ storage_path: ownPhoto }]);
      }
      return Response.json([{ id: 'synthetic-trip' }]);
    },
  });
  return {
    sent,
    request(path, { bearer = 'fixture', body, referrer = origin, mime = 'application/json' } = {}) {
      return requestHandler(new Request(origin + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: 'Bearer ' + bearer, origin: referrer, 'x-ledger-id': 'invalid-override', 'content-type': mime },
        body: mime === 'application/json' ? JSON.stringify(body) : body,
      }));
    },
  };
}

test('only a linked Neon account may read its ledger, using a fixed database role', async () => {
  const { sent, request } = setup();
  assert.equal((await request('/rest/v1/trips', { bearer: 'unknown' })).status, 401);
  assert.equal((await request('/rest/v1/trips')).status, 409);
  assert.equal((await request('/identity/v1/link', { body: { legacyToken: 'wrong' } })).status, 403);
  assert.equal((await request('/identity/v1/link', { body: { legacyToken: 'previous' } })).status, 200);
  assert.equal((await (await request('/identity/v1/account')).json()).ledgerId, ledgerId);
  assert.equal((await request('/rest/v1/trips', { referrer: 'https://other.example.invalid' })).status, 403);
  assert.equal((await request('/rest/v1/trips?select=id')).status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.sub, ledgerId);
  assert.equal(sent[0].payload.db_role, 'travel_web_user');
  assert.equal(sent[0].payload.role, 'authenticated');
  assert.equal(sent[0].url, postgrestOrigin + '/trips?select=id');
});

test('photo uploads stay in the owner folder and downloads use path-bound tickets after the ledger check', async () => {
  const { request } = setup();
  const photo = Buffer.from([255, 216, 255, 217]);
  const image = { body: photo, mime: 'image/jpeg' };
  const signing = { body: { paths: [ownPhoto, otherPhoto], expiresIn: 900 } };
  assert.equal((await request(signRoute, signing)).status, 409);
  assert.equal((await request('/identity/v1/link', { body: { legacyToken: 'previous' } })).status, 200);
  assert.equal((await request(objectRoute + 'receipt-photos/' + otherPhoto, image)).status, 403);
  assert.equal((await request(objectRoute + 'receipt-photos/' + ownPhoto, { ...image, mime: 'image/png' })).status, 415);
  assert.equal((await request(objectRoute + 'receipt-photos/' + ownPhoto, image)).status, 200);
  assert.equal((await request(signRoute + '/' + ownPhoto)).status, 403);

  const signed = await (await request(signRoute, signing)).json();
  assert.equal(signed[1].signedURL, null);
  const signedPath = '/storage/v1' + signed[0].signedURL;
  const response = await request(signedPath, { bearer: 'unknown' });
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), photo);
  assert.equal((await request(signedPath.replace(ownPhoto, otherPhoto))).status, 403);
});
