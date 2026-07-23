// Node's strip-types runner needs the extension while Vite resolves this module normally.
// @ts-expect-error TS5097: tsconfig intentionally keeps source imports extensionless.
import { MAX_SYNC_RETRY_ATTEMPTS } from './constants.ts';
import type { AppState, SyncQueueItem } from './types';

export type ChangeDraft = Pick<SyncQueueItem, 'type' | 'entityId' | 'op' | 'payload'>;

export type JournalOutcome =
  | { kind: 'syncing' }
  | { kind: 'succeeded' }
  | { kind: 'retryable-error'; error: string }
  | { kind: 'terminal-error'; error: string }
  | { kind: 'manual-retry' };

export type JournalResult = {
  queue: SyncQueueItem[];
  pendingCount: number;
  failedCount: number;
  status: AppState['globalSyncStatus'];
  error: string;
};

const terminalError = (error: string) => /40001|version conflict|版本衝突/i.test(error);
const queueKey = (item: Pick<SyncQueueItem, 'type' | 'entityId'>) =>
  `${item.type}:${item.entityId}`;

function summarize(queue: SyncQueueItem[]): JournalResult {
  const failed = queue.filter((item) => item.status === 'error' || item.status === 'failed');
  const pendingCount = queue.filter((item) =>
    item.status === 'queued' || item.status === 'syncing').length;
  return {
    queue,
    pendingCount,
    failedCount: failed.length,
    status: failed.length ? 'error' : pendingCount ? 'queued' : 'idle',
    error: failed[0]?.error || '',
  };
}

export function enqueueChange(
  queue: SyncQueueItem[] | undefined,
  change: ChangeDraft,
): SyncQueueItem[] {
  const now = Date.now();
  const previous = (queue || []).find((item) => queueKey(item) === queueKey(change));
  const terminal = previous?.status === 'error' || previous?.status === 'failed';
  const next: SyncQueueItem = {
    ...previous,
    ...change,
    id: previous?.id || `sync_${now}_${crypto.randomUUID()}`,
    status: terminal ? previous.status : 'queued',
    attempts: terminal ? previous.attempts : 0,
    error: terminal ? previous.error : undefined,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    payload: { ...previous?.payload, ...change.payload },
  };
  return [...(queue || []).filter((item) => queueKey(item) !== queueKey(change)), next]
    .slice(-500);
}

export function settleChange(
  queue: SyncQueueItem[],
  itemId: string,
  outcome: JournalOutcome,
): JournalResult {
  if (outcome.kind === 'succeeded') {
    return summarize(queue.filter((item) => item.id !== itemId));
  }
  const next = queue.map((item): SyncQueueItem => {
    if (item.id !== itemId) return item;
    const now = Date.now();
    if (outcome.kind === 'syncing') {
      return { ...item, status: 'syncing', updatedAt: now, error: undefined };
    }
    if (outcome.kind === 'manual-retry') {
      return { ...item, status: 'queued', attempts: 0, updatedAt: now, error: undefined };
    }
    const attempts = item.attempts + 1;
    const terminal = outcome.kind === 'terminal-error'
      || terminalError(outcome.error)
      || attempts >= MAX_SYNC_RETRY_ATTEMPTS;
    return {
      ...item,
      attempts,
      status: terminal ? 'error' : 'queued',
      updatedAt: now,
      error: outcome.error,
    };
  });
  return summarize(next);
}

export function restoreJournal(queue: SyncQueueItem[] | undefined): JournalResult {
  const restored = (queue || []).map((item): SyncQueueItem => {
    const retryable = (item.status === 'error' || item.status === 'failed')
      && item.attempts < MAX_SYNC_RETRY_ATTEMPTS
      && !terminalError(item.error || '');
    return item.status === 'syncing' || retryable
      ? { ...item, status: 'queued', error: undefined }
      : item;
  });
  return summarize(restored);
}
