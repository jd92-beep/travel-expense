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
  const notionStates: Array<{ rootDb: string; tripDb?: string }> = [];
  let claimCalls = 0;
  const adapters: SharedTripOutboxAdapters = {
    supabase: {
      async listBackends() { return new Map([['trip-uuid', 'notion-db']]); },
      async claim(_tripIds, _workerId, limit) {
        claimCalls += 1;
        return jobs.splice(0, limit);
      },
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
      markPhotoMirrored(receiptId) { calls.push(`photo:${receiptId}`); },
      async finish(jobId, status, error) {
        calls.push(`finish:${jobId}:${status}:${error || ''}`);
      },
    },
    notion: {
      async upsert(state, receipt) {
        notionStates.push({
          rootDb: state.notionDb,
          tripDb: state.trips.find((trip) => trip.id === state.activeTripId)?.notionDb,
        });
        calls.push(`upsert:${receipt.id}`);
        if (receipt.id === failNotionId) throw new Error('Notion unavailable');
      },
      async archive(_state, receipt) { calls.push(`archive:${receipt.id}`); },
    },
  };
  return {
    adapters,
    calls,
    notionStates,
    claimCalls: () => claimCalls,
    remainingJobs: () => jobs.length,
  };
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

const scopedBackend = fakeAdapters([{ ...updateJob, id: 'job-scoped-db' }]);
assert.deepEqual(await drainSharedTripOutbox({
  state: {
    ...outboxState,
    notionDb: 'root-personal-db',
    personalNotionConnected: true,
    trips: outboxState.trips.map((trip) =>
      trip.id === 'local-trip' ? { ...trip, notionDb: 'stale-trip-db' } : trip),
  },
  tripIds: ['trip-uuid'],
  workerId: 'worker-1',
}, scopedBackend.adapters), { processed: 1, failed: 0 });
assert.deepEqual(scopedBackend.notionStates, [{
  rootDb: 'notion-db',
  tripDb: 'notion-db',
}]);

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
assert.equal(duplicateClaim.calls.filter((call) =>
  call === 'finish:job-duplicate:succeeded:').length, 1);

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
assert.equal(photoAdapters.calls.filter((call) => call === 'photo:receipt-uuid').length, 1);

const failedPhotoUpsert = fakeAdapters([
  { ...updateJob, id: 'job-photo-fail', receiptId: 'receipt-photo-fail' },
], 'receipt-photo-fail');
failedPhotoUpsert.adapters.supabase.loadPhoto = async () => 'data:image/jpeg;base64,AA==';
assert.deepEqual(await drainSharedTripOutbox({
  state: outboxState,
  tripIds: ['trip-uuid'],
  workerId: 'worker-1',
}, failedPhotoUpsert.adapters), { processed: 0, failed: 1 });
assert.equal(failedPhotoUpsert.calls.includes('photo:receipt-photo-fail'), false);

const missingReceipt = fakeAdapters([{ ...updateJob, id: 'job-missing-receipt' }]);
missingReceipt.adapters.supabase.loadReceipt = async () => null;
assert.deepEqual(await drainSharedTripOutbox({
  state: outboxState,
  tripIds: ['trip-uuid'],
  workerId: 'worker-1',
}, missingReceipt.adapters), { processed: 1, failed: 0 });
assert.deepEqual(missingReceipt.calls, ['finish:job-missing-receipt:succeeded:']);

const missingTrip = fakeAdapters([{ ...updateJob, id: 'job-missing-trip' }]);
assert.deepEqual(await drainSharedTripOutbox({
  state: { ...outboxState, trips: [] },
  tripIds: ['trip-uuid'],
  workerId: 'worker-1',
}, missingTrip.adapters), { processed: 0, failed: 1 });
assert.match(
  missingTrip.calls.find((call) => call.startsWith('finish:job-missing-trip:failed:')) || '',
  /trip/i,
);

const missingBackend = fakeAdapters([{
  ...updateJob,
  id: 'job-missing-backend',
  tripId: 'missing-backend-trip',
}]);
assert.deepEqual(await drainSharedTripOutbox({
  state: {
    ...outboxState,
    trips: outboxState.trips.map((trip) =>
      trip.id === 'local-trip' ? { ...trip, supabaseId: 'missing-backend-trip' } : trip),
  },
  tripIds: ['trip-uuid'],
  workerId: 'worker-1',
}, missingBackend.adapters), { processed: 0, failed: 1 });
assert.match(
  missingBackend.calls.find((call) => call.startsWith('finish:job-missing-backend:failed:')) || '',
  /backend/i,
);

const ceilingJobs = Array.from({ length: 101 }, (_, index) => ({
  ...updateJob,
  id: `job-ceiling-${index}`,
  receiptId: `receipt-ceiling-${index}`,
}));
const ceiling = fakeAdapters(ceilingJobs);
assert.deepEqual(await drainSharedTripOutbox({
  state: outboxState,
  tripIds: ['trip-uuid'],
  workerId: 'worker-1',
}, ceiling.adapters), { processed: 100, failed: 0 });
assert.equal(ceiling.claimCalls(), 5);
assert.equal(ceiling.remainingJobs(), 1);

const listFailure = fakeAdapters([]);
listFailure.adapters.supabase.listBackends = async () => {
  throw new Error('backend list unavailable');
};
assert.deepEqual(await drainSharedTripOutbox({
  state: outboxState,
  tripIds: ['trip-uuid'],
  workerId: 'worker-1',
}, listFailure.adapters), {
  processed: 0,
  failed: 1,
  transportError: 'backend list unavailable',
});

const claimFailure = fakeAdapters([{ ...updateJob }]);
claimFailure.adapters.supabase.claim = async () => {
  throw new Error('job claim unavailable');
};
assert.deepEqual(await drainSharedTripOutbox({
  state: outboxState,
  tripIds: ['trip-uuid'],
  workerId: 'worker-1',
}, claimFailure.adapters), {
  processed: 0,
  failed: 1,
  transportError: 'job claim unavailable',
});

const rawBearer = `Bearer ${'a'.repeat(260)}`;
const rawNotionToken = `ntn_${'b'.repeat(40)}`;
const rawKey = `key=${'c'.repeat(40)}`;
const secretFailure = fakeAdapters([
  { ...updateJob, id: 'job-secret-fail', receiptId: 'receipt-secret-fail' },
]);
secretFailure.adapters.notion.upsert = async () => {
  throw new Error(`${rawBearer} ${rawNotionToken} ${rawKey}`);
};
assert.deepEqual(await drainSharedTripOutbox({
  state: outboxState,
  tripIds: ['trip-uuid'],
  workerId: 'worker-1',
}, secretFailure.adapters), { processed: 0, failed: 1 });
const redactedFinish = secretFailure.calls.find((call) =>
  call.startsWith('finish:job-secret-fail:failed:')) || '';
assert.equal(redactedFinish.includes(rawBearer), false);
assert.equal(redactedFinish.includes(rawNotionToken), false);
assert.equal(redactedFinish.includes(rawKey), false);
assert.match(redactedFinish, /Bearer \[redacted\]/);
assert.match(redactedFinish, /\[redacted-notion-token\]/);
assert.match(redactedFinish, /key=\[redacted-key\]/);
assert.ok(redactedFinish.replace('finish:job-secret-fail:failed:', '').length <= 300);

const notionAndFinishFailure = fakeAdapters([
  { ...updateJob, id: 'job-double-fail', receiptId: 'receipt-double-fail' },
], 'receipt-double-fail');
notionAndFinishFailure.adapters.supabase.finish = async (jobId, status, error) => {
  notionAndFinishFailure.calls.push(`finish:${jobId}:${status}:${error || ''}`);
  throw new Error('completion unavailable');
};
assert.deepEqual(await drainSharedTripOutbox({
  state: outboxState,
  tripIds: ['trip-uuid'],
  workerId: 'worker-1',
}, notionAndFinishFailure.adapters), {
  processed: 0,
  failed: 1,
  transportError: 'completion unavailable',
});
assert.equal(notionAndFinishFailure.calls.filter((call) =>
  call.startsWith('finish:job-double-fail:failed:')).length, 1);

const finishFailure = fakeAdapters([{ ...updateJob }]);
finishFailure.adapters.supabase.finish = async () => {
  throw new Error('completion unavailable');
};
assert.deepEqual(await drainSharedTripOutbox({
  state: outboxState,
  tripIds: ['trip-uuid'],
  workerId: 'worker-1',
}, finishFailure.adapters), {
  processed: 0,
  failed: 1,
  transportError: 'completion unavailable',
});

console.log('shared trip Notion outbox tests passed');
