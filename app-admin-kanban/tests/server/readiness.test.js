import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';

import readiness, { authorizeReadiness, validateReadinessData } from '../../api/readiness.js';

const gitSha = 'a'.repeat(40);
const schemaVersion = '20260712123000';
const canonicalAdminHash = `scrypt:v1:131072:8:1:${Buffer.alloc(16).toString('base64url')}:${Buffer.alloc(32).toString('base64url')}`;

function runtimeData(overrides = {}) {
  return {
    edge: { deploymentId: 'edge-1', sourceSha: gitSha },
    database: { schemaVersion },
    broker: { health: 'healthy' },
    drift: [],
    ...overrides,
  };
}

class ResponseDouble {
  constructor() {
    this.headers = new Map();
    this.statusCode = 200;
    this.body = Buffer.alloc(0);
  }

  setHeader(name, value) {
    this.headers.set(String(name).toLowerCase(), value);
  }

  end(value = '') {
    this.body = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  }

  json() {
    return JSON.parse(this.body.toString('utf8'));
  }
}

async function invokeReadiness(body = { mode: 'candidate' }) {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    headers: {
      authorization: `Bearer ${'r'.repeat(48)}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  const res = new ResponseDouble();
  await readiness(req, res);
  return res;
}

test('readiness token is required and compared exactly', () => {
  const token = 'r'.repeat(48);
  assert.equal(authorizeReadiness({ headers: { authorization: `Bearer ${token}` } }, token), token);
  assert.throws(
    () => authorizeReadiness({ headers: { authorization: 'Bearer wrong' } }, token),
    (error) => error.code === 'UNAUTHORIZED',
  );
});

test('candidate allows expected temporary frontend drift while promoted requires none', () => {
  const candidate = runtimeData({
    drift: [
      'ADMIN_FRONTEND_GIT_SHA_MISMATCH',
      'ADMIN_EDGE_FRONTEND_SOURCE_SHA_MISMATCH',
    ],
  });
  assert.equal(validateReadinessData(candidate, {
    expectedGitSha: gitSha,
    expectedSchemaVersion: schemaVersion,
    mode: 'candidate',
  }).ready, true);
  assert.throws(
    () => validateReadinessData(candidate, {
      expectedGitSha: gitSha,
      expectedSchemaVersion: schemaVersion,
      mode: 'promoted',
    }),
    (error) => error.code === 'UPSTREAM_UNAVAILABLE',
  );
});

test('readiness fails closed on Edge, schema, broker, or unknown drift', () => {
  for (const value of [
    runtimeData({ edge: { deploymentId: 'unknown', sourceSha: gitSha } }),
    runtimeData({ database: { schemaVersion: 'wrong' } }),
    runtimeData({ broker: { health: 'unavailable' } }),
    runtimeData({ drift: ['DATABASE_CONTRACT_UNAVAILABLE'] }),
  ]) {
    assert.throws(
      () => validateReadinessData(value, {
        expectedGitSha: gitSha,
        expectedSchemaVersion: schemaVersion,
        mode: 'promoted',
      }),
      (error) => error.code === 'UPSTREAM_UNAVAILABLE',
    );
  }
  assert.throws(
    () => validateReadinessData(runtimeData({
      edge: { deploymentId: 'edge-1', sourceSha: 'b'.repeat(40) },
      drift: ['ADMIN_FRONTEND_GIT_SHA_MISMATCH'],
    }), {
      expectedGitSha: gitSha,
      expectedSchemaVersion: schemaVersion,
      mode: 'candidate',
    }),
    (error) => error.code === 'UPSTREAM_UNAVAILABLE',
  );
});

test('protected readiness rejects invalid admin hash config before contacting Edge', async () => {
  const environment = Object.fromEntries([
    'ADMIN_BFF_KEY_ID',
    'ADMIN_BFF_SIGNING_KEY',
    'ADMIN_EDGE_ADMIN_URL',
    'ADMIN_EXPECTED_SCHEMA_VERSION',
    'ADMIN_GIT_SHA',
    'ADMIN_KANBAN_HASH',
    'ADMIN_READINESS_TOKEN',
  ].map((name) => [name, process.env[name]]));
  const previousFetch = globalThis.fetch;
  let edgeCalls = 0;

  process.env.ADMIN_BFF_KEY_ID = 'test-key';
  process.env.ADMIN_BFF_SIGNING_KEY = '0123456789abcdef0123456789abcdef';
  process.env.ADMIN_EDGE_ADMIN_URL = 'https://edge.example/functions/v1/admin-kanban';
  process.env.ADMIN_EXPECTED_SCHEMA_VERSION = schemaVersion;
  process.env.ADMIN_GIT_SHA = gitSha;
  process.env.ADMIN_READINESS_TOKEN = 'r'.repeat(48);
  globalThis.fetch = async () => {
    edgeCalls += 1;
    return new Response(JSON.stringify({ ok: true, data: runtimeData() }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    for (const invalidHash of [
      '',
      'pbkdf2:100000:salt:hash',
      `scrypt:v1:1024:8:1:${Buffer.alloc(16).toString('base64url')}:${Buffer.alloc(32).toString('base64url')}`,
      `scrypt:v1:131072:8:1:not-canonical:${Buffer.alloc(32).toString('base64url')}`,
      `scrypt:v1:131072:8:1:${Buffer.alloc(16).toString('base64url')}:not-canonical`,
    ]) {
      process.env.ADMIN_KANBAN_HASH = invalidHash;
      const res = await invokeReadiness();
      const payload = res.json();
      assert.equal(res.statusCode, 503);
      assert.equal(payload.error.code, 'UPSTREAM_UNAVAILABLE');
      assert.equal(payload.error.message, 'Release dependencies are not ready');
      assert.doesNotMatch(payload.error.message, /ADMIN_KANBAN_HASH|scrypt|pbkdf2|format|parameter/i);
      if (invalidHash) assert.equal(JSON.stringify(payload).includes(invalidHash), false);
    }
    assert.equal(edgeCalls, 0);

    process.env.ADMIN_KANBAN_HASH = canonicalAdminHash;
    const res = await invokeReadiness();
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().data.ready, true);
    assert.equal(edgeCalls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [name, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
