# Shared-trip Notion Outbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move shared-trip Notion Mirror Job orchestration out of the Supabase adapter while preserving ledger-first behavior, bounded drain limits, and recoverable failure evidence.

**Architecture:** Add one shared-trip-specific orchestration module with narrow Supabase and Notion ports. `supabase.ts` keeps transport and row mapping; `useSyncEngine` starts the drain; the new module owns claim/process/finish sequencing and summary counts.

**Tech Stack:** TypeScript 5.8, Supabase JS 2, Notion Broker callbacks, Node 22 built-in assertions, Playwright

## Global Constraints

- Start only after Offline Change Journal and Scoped Hydration are green on `origin/main`.
- Supabase remains the primary ledger; Notion remains a mirror.
- A Notion or Mirror Job completion failure must never erase or roll back a successful ledger write.
- Keep five claim rounds, 20 jobs per claim, and the 100-job per-drain ceiling.
- Keep photo mirroring best-effort, signed URL TTL unchanged, and the 6,000,000-byte limit.
- Do not change tables, RPC signatures, RLS, receipt-photo privacy mode, live data, or the server worker.
- The production positive shared-Receipt-to-Notion proof remains Open Item 5 and is not closed by local tests.
- Bump Compact from `0.16.14` to `0.16.15`.
- Keep Boss's unrelated `CLAUDE.md` change unstaged.

---

### Task 1: Extract and prove the shared-trip Mirror Job flow

**Files:**
- Create: `app-compact/src/lib/sharedTripNotionOutbox.ts`
- Create: `app-compact/scripts/shared-trip-notion-outbox.test.ts`
- Modify: `app-compact/package.json`
- Modify: `app-compact/package-lock.json`
- Modify: `app-compact/src/lib/constants.ts`
- Modify: `app-compact/src/lib/supabase.ts`
- Modify: `app-compact/src/lib/useSyncEngine.ts`
- Modify: `app-compact/tests/supabase-notion-mirror-smoke.spec.cjs`
- Modify: `HANDOVER.md`

**Interfaces:**
- Consumes: current `claim_receipt_sync_jobs` and `finish_receipt_sync_job` contracts, Supabase Receipt/photo lookup, and existing `pushReceipt`/`archiveReceipt` callbacks.
- Produces: `drainSharedTripOutbox(context, adapters): Promise<OutboxSummary>`.

- [ ] **Step 1: Record impact before extraction**

Run:

```bash
node .gitnexus/run.cjs status
node .gitnexus/run.cjs impact drainSharedTripNotionOutbox --direction upstream
node .gitnexus/run.cjs impact useSyncEngine --direction upstream
```

Expected: one production caller in `useSyncEngine` plus shared-ledger sync flows. Stop and notify Boss before editing if risk is HIGH or CRITICAL.

- [ ] **Step 2: Add a failing port-level test**

Add:

```json
"test:shared-trip-outbox": "node --experimental-strip-types scripts/shared-trip-notion-outbox.test.ts"
```

Create `app-compact/scripts/shared-trip-notion-outbox.test.ts`:

```ts
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

console.log('shared trip Notion outbox tests passed');
```

- [ ] **Step 3: Run the test and confirm the red state**

Run:

```bash
cd app-compact
npm run test:shared-trip-outbox
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `sharedTripNotionOutbox.ts`.

- [ ] **Step 4: Implement the shared-trip-specific orchestration**

Create `app-compact/src/lib/sharedTripNotionOutbox.ts`:

```ts
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
      const trip = context.state.trips.find((candidate) =>
        candidate.supabaseId === job.tripId || candidate.id === job.tripId);
      const notionDb = backends.get(job.tripId);
      if (!trip || !notionDb) continue;
      const notionState: AppState = {
        ...context.state,
        activeTripId: trip.id,
        trips: context.state.trips.map((candidate) =>
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
```

Preserve current behavior for a missing Receipt: mark that Mirror Job succeeded so a deleted row does not loop forever. Keep photo fetch and data-URL conversion inside the Supabase port; return `null` for missing, oversized, or failed photos so the text Receipt still mirrors.

- [ ] **Step 5: Replace the old function with a production adapter**

In `supabase.ts`, export one adapter creator:

```ts
export function createSharedTripOutboxSupabaseAdapter(
  session: Session,
  state: AppState,
): SharedTripOutboxAdapters['supabase'] {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client unavailable');
  return {
    async listBackends(tripIds) {
      const { data, error } = await withTimeout(
        supabase.from('trip_backend_links')
          .select('trip_id,notion_database_ref')
          .in('trip_id', tripIds),
      );
      if (error) throw error;
      return new Map((data || [])
        .filter((row) => row.notion_database_ref)
        .map((row) => [row.trip_id, row.notion_database_ref]));
    },
    async claim(tripIds, workerId, limit) {
      const { data, error } = await withTimeout(supabase.rpc('claim_receipt_sync_jobs', {
        p_trip_ids: tripIds,
        p_provider: 'notion',
        p_worker: workerId,
        p_limit: limit,
      }));
      if (error) throw error;
      return (data || []).map(rowToMirrorJob);
    },
    loadReceipt: (job) => loadMirrorReceipt(supabase, session, state, job),
    loadPhoto: (receiptId) => loadMirrorPhotoDataUrl(supabase, receiptId),
    markPhotoMirrored(receiptId) {
      notionPhotoMirroredReceipts.add(receiptId);
    },
    async finish(jobId, status, error) {
      const result = await withTimeout(supabase.rpc('finish_receipt_sync_job', {
        p_job_id: jobId,
        p_status: status,
        p_error: status === 'failed' ? error || 'Notion sync failed' : null,
      }));
      if (result.error) throw result.error;
    },
  };
}
```

Move the existing row mapping, signed URL, `fetch`, `Blob`, `FileReader`, and 6 MB guard into private `rowToMirrorJob`, `loadMirrorReceipt`, and `loadMirrorPhotoDataUrl` helpers. `loadMirrorPhotoDataUrl` must skip IDs already in `notionPhotoMirroredReceipts`; `markPhotoMirrored` adds the ID only after Notion upsert succeeds. Delete `drainSharedTripNotionOutbox` after `rg` confirms its only caller has moved.

In `useSyncEngine.ts`, call:

```ts
const tripIds = stateRef.current.trips
  .filter((trip) => trip.supabaseId
    && (trip.sharing?.role === 'owner' || trip.sharing?.role === 'admin'))
  .map((trip) => trip.supabaseId as string);

const outbox = await drainSharedTripOutbox({
  state: stateRef.current,
  tripIds,
  workerId: cloudSession.user.id,
}, {
  supabase: createSharedTripOutboxSupabaseAdapter(cloudSession, stateRef.current),
  notion: {
    async upsert(notionState, receipt) { await pushReceipt(notionState, receipt); },
    archive: archiveReceipt,
  },
}).catch(() => null);
```

- [ ] **Step 6: Expand port tests for photo and completion failures**

Add exact assertions to the Node test:

```ts
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
```

Run:

```bash
npm run test:shared-trip-outbox
```

Expected: `shared trip Notion outbox tests passed`.

- [ ] **Step 7: Bump version and run all ledger/mirror gates**

Set Compact version sources to `0.16.15`, then run:

```bash
npm run test:change-journal
npm run test:scoped-persistence
npm run test:shared-trip-outbox
npm run typecheck
npm run build
npm run security:scan
npm run smoke:offline
npm run smoke:sync-regression
npm run smoke:supabase-notion-mirror
npm run smoke:supabase-backfill
cd ..
node scripts/verify-shared-ledger-contract.mjs
node .gitnexus/run.cjs detect-changes
git diff --check
```

Expected: new and prior focused tests pass; Compact gates pass except any already-recorded unchanged baseline fixture failure must be reported verbatim and must not be weakened; shared-ledger contract passes; GitNexus reports only expected mirror/sync flows.

- [ ] **Step 8: Record evidence, commit, and push**

Update Open Item 18 to `Milestones 1-3 complete; Provider Catalog and Android port remain`. Keep Open Item 5 open.

```bash
git add app-compact/package.json app-compact/package-lock.json app-compact/src/lib/constants.ts app-compact/src/lib/sharedTripNotionOutbox.ts app-compact/src/lib/supabase.ts app-compact/src/lib/useSyncEngine.ts app-compact/scripts/shared-trip-notion-outbox.test.ts app-compact/tests/supabase-notion-mirror-smoke.spec.cjs HANDOVER.md
git diff --cached --check
git status --short
git commit -m "refactor: isolate shared trip Notion outbox"
git push origin main
```

Expected: `CLAUDE.md` remains unstaged and `origin/main` advances by exactly this milestone commit.
