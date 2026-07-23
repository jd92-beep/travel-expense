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

export type OutboxSummary = { processed: number; failed: number };

const safeError = (error: unknown) =>
  String(error instanceof Error ? error.message : error || 'Notion sync failed').slice(0, 300);

export async function drainSharedTripOutbox(
  context: SharedTripOutboxContext,
  adapters: SharedTripOutboxAdapters,
): Promise<OutboxSummary> {
  if (!context.tripIds.length) return { processed: 0, failed: 0 };
  const backends = await adapters.supabase.listBackends(context.tripIds).catch(() => new Map());
  const claimable = context.tripIds.filter((tripId) => backends.has(tripId));
  if (!claimable.length) return { processed: 0, failed: 0 };

  let processed = 0;
  let failed = 0;
  const seenJobIds = new Set<string>();
  for (let round = 0; round < 5; round += 1) {
    const jobs = await adapters.supabase.claim(claimable, context.workerId, 20).catch(() => []);
    if (!jobs.length) break;
    for (const job of jobs) {
      if (seenJobIds.has(job.id)) continue;
      seenJobIds.add(job.id);
      const trip = (context.state.trips || []).find((candidate) =>
        candidate.supabaseId === job.tripId || candidate.id === job.tripId);
      const notionDb = backends.get(job.tripId);
      if (!trip || !notionDb) continue;
      const notionState: AppState = {
        ...context.state,
        activeTripId: trip.id,
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
        await adapters.supabase.finish(job.id, 'succeeded');
        processed += 1;
      } catch (error) {
        failed += 1;
        await adapters.supabase.finish(job.id, 'failed', safeError(error)).catch(() => undefined);
      }
    }
    if (jobs.length < 20) break;
  }
  return { processed, failed };
}
