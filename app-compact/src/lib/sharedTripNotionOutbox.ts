import type { AppState, Receipt } from './types';

export type MirrorJob = {
  id: string;
  tripId: string;
  receiptId: string;
  operation: 'update' | 'delete';
  payload: { sourceId?: string };
};

export type SharedTripOutboxContext = {
  state: AppState;
  tripIds: string[];
  workerId: string;
};

export type SharedTripOutboxAdapters = {
  supabase: {
    listBackends(tripIds: string[]): Promise<Map<string, string>>;
    claim(tripIds: string[], workerId: string, limit: number): Promise<MirrorJob[]>;
    loadReceipt(job: MirrorJob): Promise<Receipt | null>;
    loadPhoto(receiptId: string): Promise<string | null>;
    markPhotoMirrored(receiptId: string): void;
    finish(jobId: string, status: 'succeeded' | 'failed', error?: string): Promise<void>;
  };
  notion: {
    upsert(state: AppState, receipt: Receipt): Promise<void>;
    archive(state: AppState, receipt: Receipt): Promise<void>;
  };
};

export type OutboxSummary = {
  processed: number;
  failed: number;
  transportError?: string;
};

export function redactSensitiveError(error: unknown, fallback = 'Unknown error'): string {
  const message = error instanceof Error ? error.message : String(error || fallback);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/ntn_[A-Za-z0-9._-]+/g, '[redacted-notion-token]')
    .replace(/(\bkey\s*=\s*)[^&\s,;]+/gi, '$1[redacted-key]');
}

const safeError = (error: unknown) =>
  redactSensitiveError(error, 'Notion sync failed').slice(0, 300);

export async function drainSharedTripOutbox(
  context: SharedTripOutboxContext,
  adapters: SharedTripOutboxAdapters,
): Promise<OutboxSummary> {
  if (!context.tripIds.length) return { processed: 0, failed: 0 };
  let backends: Map<string, string>;
  try {
    backends = await adapters.supabase.listBackends(context.tripIds);
  } catch (error) {
    return { processed: 0, failed: 1, transportError: safeError(error) };
  }
  const claimable = context.tripIds.filter((tripId) => backends.has(tripId));
  if (!claimable.length) return { processed: 0, failed: 0 };

  let processed = 0;
  let failed = 0;
  let transportError = '';
  const seenJobIds = new Set<string>();
  for (let round = 0; round < 5; round += 1) {
    let jobs: MirrorJob[];
    try {
      jobs = await adapters.supabase.claim(claimable, context.workerId, 20);
    } catch (error) {
      return {
        processed,
        failed: failed + 1,
        transportError: safeError(error),
      };
    }
    if (!jobs.length) break;
    for (const job of jobs) {
      if (seenJobIds.has(job.id)) continue;
      seenJobIds.add(job.id);
      const trip = (context.state.trips || []).find((candidate) =>
        candidate.supabaseId === job.tripId || candidate.id === job.tripId);
      const notionDb = backends.get(job.tripId);
      if (!trip || !notionDb) {
        failed += 1;
        const reason = !trip ? 'Shared trip unavailable after claim' : 'Notion backend unavailable after claim';
        try {
          await adapters.supabase.finish(job.id, 'failed', reason);
        } catch (error) {
          transportError ||= safeError(error);
        }
        continue;
      }
      const notionState: AppState = {
        ...context.state,
        activeTripId: trip.id,
        notionDb,
        trips: (context.state.trips || []).map((candidate) =>
          candidate.id === trip.id ? { ...candidate, notionDb } : candidate),
      };
      try {
        if (job.operation === 'delete') {
          await adapters.notion.archive(notionState, {
            id: job.receiptId || job.payload.sourceId || '',
            sourceId: job.payload.sourceId || job.receiptId,
            tripId: trip.id,
            store: '',
            date: trip.startDate || context.state.tripDateRange.start,
            total: 0,
            category: 'other',
            payment: 'cash',
          });
        } else {
          const receipt = await adapters.supabase.loadReceipt(job);
          if (receipt) {
            const photoThumb = receipt.photoThumb
              || await adapters.supabase.loadPhoto(job.receiptId).catch(() => null);
            await adapters.notion.upsert(notionState, {
              ...receipt,
              tripId: trip.id,
              photoThumb: photoThumb || receipt.photoThumb,
            });
            if (photoThumb) adapters.supabase.markPhotoMirrored(job.receiptId);
          }
        }
      } catch (error) {
        failed += 1;
        try {
          await adapters.supabase.finish(job.id, 'failed', safeError(error));
        } catch (finishError) {
          transportError ||= safeError(finishError);
        }
        continue;
      }
      try {
        await adapters.supabase.finish(job.id, 'succeeded');
        processed += 1;
      } catch (error) {
        failed += 1;
        transportError ||= safeError(error);
        try {
          await adapters.supabase.finish(job.id, 'failed', safeError(error));
        } catch (finishError) {
          transportError ||= safeError(finishError);
        }
      }
    }
    if (jobs.length < 20) break;
  }
  return transportError ? { processed, failed, transportError } : { processed, failed };
}
