// Pure, dependency-free sync-retry helpers (no React/app imports) so they run under
// `node --experimental-strip-types` in scripts/sync-backoff.test.ts.

export const MAX_RETRY_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 30_000; // 1st retry ~30s, then ×4
const BACKOFF_CAP_MS = 900_000; // 15 min ceiling

// Exponential backoff window after `attempts` failed tries: 30s → 2m → 8m … capped at 15m.
export function syncBackoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * Math.pow(4, Math.max(0, attempts - 1)), BACKOFF_CAP_MS);
}

type QueueItemReadiness = { status: string; attempts: number; nextRetryAt?: number };
type ReconnectQueueItem = QueueItemReadiness & { error?: string; updatedAt?: number };

// Is this queue item eligible to attempt right now? Parked items (auth/exhausted → 'error'/'failed')
// and not-yet-elapsed backoff windows are skipped; a stuck 'syncing' (push died mid-flight) stays
// retriable so it isn't stranded.
export function queueItemReady(
  item: QueueItemReadiness,
  now: number,
  maxAttempts: number = MAX_RETRY_ATTEMPTS,
): boolean {
  if (item.status === 'failed' || item.status === 'error' || item.status === 'synced') return false;
  if (item.attempts >= maxAttempts) return false;
  if (item.nextRetryAt && item.nextRetryAt > now) return false;
  return true;
}

export function releaseReconnectBackoff<T extends ReconnectQueueItem>(
  queue: T[] = [],
  now: number = Date.now(),
  maxAttempts: number = MAX_RETRY_ATTEMPTS,
): T[] {
  let changed = false;
  const next = queue.map((item) => {
    // Only future backoff windows block an otherwise queued retry. Items without nextRetryAt, or with an
    // elapsed nextRetryAt, are already eligible through queueItemReady; active syncing/parked items stay put.
    if (
      item.status === 'queued' &&
      item.nextRetryAt &&
      item.nextRetryAt > now &&
      item.attempts < maxAttempts
    ) {
      changed = true;
      return { ...item, status: 'queued', nextRetryAt: undefined, error: undefined, updatedAt: now };
    }
    return item;
  });
  return changed ? next as T[] : queue;
}
