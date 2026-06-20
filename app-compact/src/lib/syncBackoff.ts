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
