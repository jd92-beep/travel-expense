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
queue = settleChange(queue, queue[0].id, { kind: 'syncing' }).queue;
queue = enqueueChange(queue, receipt('r1', { updatedAt: 20 }));
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
