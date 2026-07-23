import assert from 'node:assert/strict';
import {
  enqueueChange,
  restoreJournal,
  settleChange,
} from '../src/lib/changeJournal.ts';
import type { SyncQueueItem } from '../src/lib/types.ts';

const receipt = (entityId: string, payload = {}) => ({
  type: 'receipt' as const,
  entityId,
  op: 'update' as const,
  payload,
});

let queue = enqueueChange([], receipt('r1', {
  supabaseId: 's1',
  notionPageId: 'n1',
  updatedAt: 10,
}));
const syncing = queue[0];
queue = settleChange(queue, syncing.id, { kind: 'syncing' }).queue;
queue = enqueueChange(queue, receipt('r1', { updatedAt: 20 }));
queue = settleChange(queue, syncing.id, {
  kind: 'succeeded',
  expectedUpdatedAt: syncing.updatedAt,
}).queue;
assert.equal(queue.length, 1);
assert.equal(queue[0].payload?.supabaseId, 's1');
assert.equal(queue[0].payload?.notionPageId, 'n1');
assert.equal(queue[0].payload?.updatedAt, 20);
assert.equal(queue[0].status, 'queued');

let retryQueue = enqueueChange([], receipt('retry'));
const retryId = retryQueue[0].id;
retryQueue = settleChange(retryQueue, retryId, {
  kind: 'retryable-error',
  error: 'network unavailable',
}).queue;
assert.equal(retryQueue[0].attempts, 1);
assert.equal(retryQueue[0].status, 'queued');

retryQueue = settleChange(retryQueue, retryId, {
  kind: 'retryable-error',
  error: 'network unavailable',
}).queue;
retryQueue = settleChange(retryQueue, retryId, {
  kind: 'retryable-error',
  error: 'network unavailable',
}).queue;
assert.equal(retryQueue[0].attempts, 3);
assert.equal(retryQueue[0].status, 'error');
assert.equal(restoreJournal(retryQueue).queue[0].status, 'error');

let photoRetryQueue = enqueueChange([], receipt('photo-retry'));
for (let attempt = 1; attempt <= 3; attempt += 1) {
  const photoItem = photoRetryQueue[0];
  photoRetryQueue = settleChange(photoRetryQueue, photoItem.id, {
    kind: 'retryable-error',
    error: 'photo upload failed',
    expectedUpdatedAt: photoItem.updatedAt,
  }).queue;
  assert.equal(photoRetryQueue[0].attempts, attempt);
}
assert.equal(photoRetryQueue[0].status, 'error');
photoRetryQueue = settleChange(photoRetryQueue, photoRetryQueue[0].id, { kind: 'manual-retry' }).queue;
assert.equal(photoRetryQueue[0].attempts, 0);
assert.equal(photoRetryQueue[0].error, undefined);

let conflictQueue = enqueueChange([], receipt('conflict'));
conflictQueue = settleChange(conflictQueue, conflictQueue[0].id, {
  kind: 'terminal-error',
  error: '40001 version conflict',
}).queue;
assert.equal(conflictQueue[0].status, 'error');
assert.equal(restoreJournal(conflictQueue).queue[0].status, 'error');

let terminal = enqueueChange([], receipt('terminal'));
terminal = settleChange(terminal, terminal[0].id, {
  kind: 'terminal-error',
  error: '40001 version conflict',
}).queue;
assert.equal(restoreJournal(terminal).queue[0].status, 'error');
const terminalAttempts = terminal[0].attempts;
const terminalError = terminal[0].error;
terminal = enqueueChange(terminal, receipt('terminal', { updatedAt: 30 }));
assert.equal(terminal[0].attempts, terminalAttempts);
assert.equal(terminal[0].error, terminalError);
terminal = settleChange(terminal, terminal[0].id, { kind: 'manual-retry' }).queue;
assert.equal(terminal[0].attempts, 0);
assert.equal(terminal[0].status, 'queued');
assert.equal(terminal[0].error, undefined);

let deletion = enqueueChange([], {
  type: 'delete-receipt',
  entityId: 'r2',
  op: 'delete',
  payload: { sourceId: 'mail-2', tombstoneKey: 'trip-1:mail-2' },
});
deletion = enqueueChange(deletion, {
  type: 'delete-receipt',
  entityId: 'r2',
  op: 'delete',
  payload: { updatedAt: 30 },
});
assert.equal(deletion[0].payload?.tombstoneKey, 'trip-1:mail-2');

let bounded: SyncQueueItem[] = [];
for (let index = 0; index < 501; index += 1) {
  bounded = enqueueChange(bounded, receipt(`r${index}`));
}
assert.equal(bounded.length, 500);
assert.equal(bounded[0].entityId, 'r1');
assert.equal(restoreJournal(bounded).pendingCount, 500);

console.log('change journal tests passed');
