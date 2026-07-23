import assert from 'node:assert/strict';
import {
  drainSharedTripOutbox,
  type MirrorJob,
  type SharedTripOutboxAdapters,
} from '../src/lib/sharedTripNotionOutbox.ts';
import { DEFAULT_STATE } from '../src/lib/constants.ts';

const outboxState = {
  ...DEFAULT_STATE,
  trips: DEFAULT_STATE.trips.map((trip, index) => index === 0
    ? { ...trip, id: 'local-trip', supabaseId: 'trip-uuid' }
    : trip),
  activeTripId: 'local-trip',
};

const updateJob: MirrorJob = {
  id: 'job-update',
  tripId: 'trip-uuid',
  receiptId: 'receipt-uuid',
  operation: 'update',
  payload: {},
};

const deleteJob: MirrorJob = {
  id: 'job-delete',
  tripId: 'trip-uuid',
  receiptId: 'receipt-delete',
  operation: 'delete',
  payload: { sourceId: 'mail-delete' },
};

function fakeAdapters(jobs: MirrorJob[], failNotionId = '') {
  const calls: string[] = [];
  const adapters: SharedTripOutboxAdapters = {
    supabase: {
      async listBackends() { return new Map([['trip-uuid', 'notion-db']]); },
      async claim() { return jobs.splice(0, 20); },
      async loadReceipt(job) {
        return {
          id: job.receiptId,
          tripId: 'local-trip',
          store: 'Cafe',
          date: '2026-01-01',
          total: 100,
          category: 'food',
          payment: 'cash',
        };
      },
      async loadPhoto() { return null; },
      markPhotoMirrored() {},
      async finish(jobId, status, error) {
        calls.push(`finish:${jobId}:${status}:${error || ''}`);
      },
    },
    notion: {
      async upsert(_state, receipt) {
        calls.push(`upsert:${receipt.id}`);
        if (receipt.id === failNotionId) throw new Error('Notion unavailable');
      },
      async archive(_state, receipt) { calls.push(`archive:${receipt.id}`); },
    },
  };
  return { adapters, calls };
}

const empty = fakeAdapters([]);
assert.deepEqual(await drainSharedTripOutbox({
  state: outboxState,
  tripIds: ['trip-uuid'],
  workerId: 'worker-1',
}, empty.adapters), { processed: 0, failed: 0 });

const success = fakeAdapters([updateJob, deleteJob]);
assert.deepEqual(await drainSharedTripOutbox({
  state: outboxState,
  tripIds: ['trip-uuid'],
  workerId: 'worker-1',
}, success.adapters), { processed: 2, failed: 0 });
assert.deepEqual(success.calls, [
  'upsert:receipt-uuid',
  'finish:job-update:succeeded:',
  'archive:receipt-delete',
  'finish:job-delete:succeeded:',
]);

const continueAfterFailure = fakeAdapters([
  { ...updateJob, id: 'job-fail', receiptId: 'receipt-fail' },
  { ...updateJob, id: 'job-pass', receiptId: 'receipt-pass' },
], 'receipt-fail');
assert.deepEqual(await drainSharedTripOutbox({
  state: outboxState,
  tripIds: ['trip-uuid'],
  workerId: 'worker-1',
}, continueAfterFailure.adapters), { processed: 1, failed: 1 });
assert.ok(continueAfterFailure.calls.includes('upsert:receipt-pass'));
assert.ok(continueAfterFailure.calls.some((call) =>
  call.startsWith('finish:job-fail:failed:Notion unavailable')));

const duplicateClaim = fakeAdapters([
  { ...updateJob, id: 'job-duplicate' },
  { ...updateJob, id: 'job-duplicate' },
]);
assert.deepEqual(await drainSharedTripOutbox({
  state: outboxState,
  tripIds: ['trip-uuid'],
  workerId: 'worker-1',
}, duplicateClaim.adapters), { processed: 1, failed: 0 });
assert.equal(duplicateClaim.calls.filter((call) =>
  call === 'upsert:receipt-uuid').length, 1);

const photoCalls: string[] = [];
const photoAdapters = fakeAdapters([{ ...updateJob }]);
photoAdapters.adapters.supabase.loadPhoto = async () => 'data:image/jpeg;base64,AA==';
photoAdapters.adapters.notion.upsert = async (_state, receipt) => {
  photoCalls.push(receipt.photoThumb || '');
};
await drainSharedTripOutbox({
  state: outboxState,
  tripIds: ['trip-uuid'],
  workerId: 'worker-1',
}, photoAdapters.adapters);
assert.deepEqual(photoCalls, ['data:image/jpeg;base64,AA==']);

const finishFailure = fakeAdapters([{ ...updateJob }]);
finishFailure.adapters.supabase.finish = async () => {
  throw new Error('completion unavailable');
};
assert.deepEqual(await drainSharedTripOutbox({
  state: outboxState,
  tripIds: ['trip-uuid'],
  workerId: 'worker-1',
}, finishFailure.adapters), { processed: 0, failed: 1 });

console.log('shared trip Notion outbox tests passed');
