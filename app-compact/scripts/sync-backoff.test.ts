// Run: node --experimental-strip-types scripts/sync-backoff.test.ts
import assert from 'node:assert/strict';
import { MAX_RETRY_ATTEMPTS, queueItemReady, releaseReconnectBackoff, syncBackoffMs } from '../src/lib/syncBackoff.ts';

// --- exponential backoff windows ---
assert.equal(syncBackoffMs(1), 30_000, '1st retry ~30s');
assert.equal(syncBackoffMs(2), 120_000, '2nd retry ~2m');
assert.equal(syncBackoffMs(3), 480_000, '3rd retry ~8m');
assert.equal(syncBackoffMs(10), 900_000, 'capped at 15m');
assert.equal(syncBackoffMs(0), 30_000, 'attempts<=1 floors at base');
assert.ok(syncBackoffMs(2) > syncBackoffMs(1), 'monotonically increasing');

// --- eligibility gate ---
const NOW = 1_000_000;
const ready = (over: Partial<{ status: string; attempts: number; nextRetryAt?: number }>) =>
  queueItemReady({ status: 'queued', attempts: 0, ...over }, NOW);

assert.equal(ready({}), true, 'fresh queued item is ready');
assert.equal(ready({ status: 'syncing' }), true, 'stuck syncing (crashed push) stays retriable');
assert.equal(ready({ status: 'error' }), false, 'parked error skipped until manual retry');
assert.equal(ready({ status: 'failed' }), false, 'failed skipped');
assert.equal(ready({ status: 'synced' }), false, 'synced not re-attempted');
assert.equal(ready({ attempts: MAX_RETRY_ATTEMPTS }), false, 'exhausted attempts skipped');
assert.equal(ready({ nextRetryAt: NOW + 1 }), false, 'inside backoff window → skip');
assert.equal(ready({ nextRetryAt: NOW - 1 }), true, 'elapsed backoff window → ready');
assert.equal(ready({ nextRetryAt: NOW }), true, 'exactly elapsed → ready');

// --- failure→backoff→park progression mirrors push() so transient errors self-heal then park ---
// Simulate: each failed attempt either backs off (attempts<MAX) or parks (attempts>=MAX).
let attempts = 0;
const transitions: string[] = [];
for (let i = 0; i < 4; i++) {
  attempts += 1;
  if (attempts >= MAX_RETRY_ATTEMPTS) {
    transitions.push('error'); // parked for manual retry — never silently dropped
  } else {
    transitions.push(`queued@${syncBackoffMs(attempts)}`);
  }
}
assert.deepEqual(
  transitions,
  ['queued@30000', 'queued@120000', 'error', 'error'],
  'two transient backoffs then park at MAX',
);

// --- native reconnect releases transient outage backoff, but not parked/auth failures ---
const outageQueue = [{
  id: 'upload_midflight',
  status: 'queued',
  attempts: 1,
  nextRetryAt: NOW + 120_000,
  error: 'Failed to fetch',
  updatedAt: NOW - 1,
}];
const released = releaseReconnectBackoff(outageQueue, NOW);
assert.notEqual(released, outageQueue, 'future backoff queue gets a new array on reconnect');
assert.equal(released[0].status, 'queued');
assert.equal(released[0].attempts, 1, 'reconnect does not hide prior failed attempts');
assert.equal(released[0].nextRetryAt, undefined, 'reconnect clears stale outage backoff');
assert.equal(released[0].error, undefined, 'transient outage error is cleared for retry');
assert.equal(released[0].updatedAt, NOW);

const parkedError = [{ id: 'auth_error', status: 'error', attempts: 1, nextRetryAt: NOW + 120_000 }];
assert.equal(releaseReconnectBackoff(parkedError, NOW), parkedError, 'parked errors still require manual retry');
const exhausted = [{ id: 'exhausted', status: 'queued', attempts: MAX_RETRY_ATTEMPTS, nextRetryAt: NOW + 120_000 }];
assert.equal(releaseReconnectBackoff(exhausted, NOW), exhausted, 'exhausted transient retries remain parked');
const activeSync = [{ id: 'active_sync', status: 'syncing', attempts: 1, nextRetryAt: NOW + 120_000 }];
assert.equal(releaseReconnectBackoff(activeSync, NOW), activeSync, 'currently syncing items are not reset during reconnect');

console.log('sync-backoff: all backoff + eligibility assertions passed ✅');
