import assert from 'node:assert/strict';
import test from 'node:test';

import { authorizeReadiness, validateReadinessData } from '../../api/readiness.js';

const gitSha = 'a'.repeat(40);
const schemaVersion = '20260712123000';

function runtimeData(overrides = {}) {
  return {
    edge: { deploymentId: 'edge-1', sourceSha: gitSha },
    database: { schemaVersion },
    broker: { health: 'healthy' },
    drift: [],
    ...overrides,
  };
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
