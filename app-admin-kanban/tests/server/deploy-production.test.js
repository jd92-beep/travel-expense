import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { verifyAdminSessionRouteCanary } from '../../scripts/admin-session-route-canary.mjs';
import { retryPromotedReadiness } from '../../scripts/retry-promoted-readiness.mjs';

const deploySource = readFileSync(
  fileURLToPath(new URL('../../scripts/deploy-production.mjs', import.meta.url)),
  'utf8',
);

test('production deploy pins the current Vercel CLI and bounds child processes', () => {
  assert.match(deploySource, /vercel@56\.3\.2/);
  assert.match(deploySource, /timeout: CHILD_PROCESS_TIMEOUT_MS/);
});

test('admin session route canary requires the canonical unauthorized JSON response', async () => {
  const response = await verifyAdminSessionRouteCanary(async (pathname, options) => {
    assert.equal(pathname, '/api/admin/session');
    assert.deepEqual(options, { expectedStatus: 401 });
    return { ok: false, data: null, error: { code: 'UNAUTHORIZED' } };
  });
  assert.deepEqual(response, { ok: false, data: null, error: { code: 'UNAUTHORIZED' } });
});

test('admin session route canary fails closed for an unexpected error code', async () => {
  await assert.rejects(
    verifyAdminSessionRouteCanary(async () => ({
      ok: false,
      data: null,
      error: { code: 'NOT_FOUND' },
    })),
    /Admin session route canary did not return the expected unauthorized envelope/,
  );
});

test('admin session route canary rejects a minimal unauthorized error envelope', async () => {
  await assert.rejects(
    verifyAdminSessionRouteCanary(async () => ({ error: { code: 'UNAUTHORIZED' } })),
    /Admin session route canary did not return the expected unauthorized envelope/,
  );
});

test('promoted readiness retries transient failures and returns the verified result', async () => {
  let attempts = 0;
  let elapsed = 0;
  const result = await retryPromotedReadiness(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('alias propagation pending');
    return { ready: true };
  }, {
    maxWaitMs: 6,
    now: () => elapsed,
    retryDelayMs: 2,
    sleep: async (delay) => { elapsed += delay; },
  });

  assert.deepEqual(result, { ready: true });
  assert.equal(attempts, 3);
  assert.equal(elapsed, 4);
});

test('promoted readiness rethrows after its bounded retry window is exhausted', async () => {
  let attempts = 0;
  let elapsed = 0;
  await assert.rejects(
    retryPromotedReadiness(async () => {
      attempts += 1;
      throw new Error('alias propagation pending');
    }, {
      maxWaitMs: 6,
      now: () => elapsed,
      retryDelayMs: 2,
      sleep: async (delay) => { elapsed += delay; },
    }),
    /alias propagation pending/,
  );
  assert.equal(attempts, 4);
  assert.equal(elapsed, 6);
});
