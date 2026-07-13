import assert from 'node:assert/strict';
import test from 'node:test';

import { retryPromotedReadiness } from '../../scripts/retry-promoted-readiness.mjs';

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
