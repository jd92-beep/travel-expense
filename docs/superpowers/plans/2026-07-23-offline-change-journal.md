# Offline Change Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Compact one authoritative, behavior-preserving Change Journal for offline enqueue, deduplication, retry, terminal evidence, tombstones, and cold-open restoration.

**Architecture:** Add one pure TypeScript module between callers and `SyncQueueItem[]`. React hooks keep lifecycle and network orchestration; the journal alone creates and transitions queue entries and derives queue status.

**Tech Stack:** React 19, TypeScript 5.8, Node 22 built-in assertions, Vite, Playwright

## Global Constraints

- Work in `/Users/tommy/Documents/Codex/travel-expense` on `main`.
- Run `node .gitnexus/run.cjs status`; refresh with `node .gitnexus/run.cjs analyze` only when stale.
- Before editing each named function, run GitNexus upstream impact and warn Boss before a HIGH or CRITICAL result.
- Preserve `boss-japan-tracker`, account-scoped keys, `AppState`, queue identity `type + entityId`, and the 500-item bound.
- Retryable failures may recover automatically; exhausted attempts, `40001`, and version conflicts remain terminal evidence.
- Manual retry is the only transition that resets terminal attempts.
- Do not change Supabase schema/RLS, Broker routes, credentials, live data, or UI workflows.
- Bump Compact from `0.16.12` to `0.16.13` in `package.json`, lockfile root metadata, and `APP_VERSION`.
- Keep Boss's unrelated `CLAUDE.md` change unstaged.

---

### Task 1: Add and adopt the authoritative Change Journal

**Files:**
- Create: `app-compact/src/lib/changeJournal.ts`
- Create: `app-compact/scripts/change-journal.test.ts`
- Modify: `app-compact/package.json`
- Modify: `app-compact/package-lock.json`
- Modify: `app-compact/src/lib/constants.ts`
- Modify: `app-compact/src/lib/useAppState.ts`
- Modify: `app-compact/src/lib/useSyncEngine.ts`
- Modify: `app-compact/src/lib/storage.ts`
- Modify: `app-compact/src/tabs/Settings.tsx`
- Modify: `HANDOVER.md`

**Interfaces:**
- Consumes: `SyncQueueItem`, `SyncStatus`, `MAX_SYNC_RETRY_ATTEMPTS`.
- Produces: `enqueueChange(queue, change): SyncQueueItem[]`, `settleChange(queue, itemId, outcome): JournalResult`, and `restoreJournal(queue): JournalResult`.

- [ ] **Step 1: Record symbol impact before code edits**

Run:

```bash
node .gitnexus/run.cjs status
node .gitnexus/run.cjs impact enqueueSyncItem --direction upstream
node .gitnexus/run.cjs impact retryFailedItems --direction upstream
node .gitnexus/run.cjs impact normalizeState --direction upstream
```

Expected: current index status is reported; impact output names the affected queue and sync flows. Stop and notify Boss before editing if any result is HIGH or CRITICAL.

- [ ] **Step 2: Add the failing sequence tests and package command**

Add this script to `app-compact/package.json`:

```json
"test:change-journal": "node --experimental-strip-types scripts/change-journal.test.ts"
```

Create `app-compact/scripts/change-journal.test.ts` with sequence-level assertions:

```ts
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
```

- [ ] **Step 3: Run the focused test and confirm the red state**

Run:

```bash
cd app-compact
npm run test:change-journal
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/lib/changeJournal.ts`.

- [ ] **Step 4: Implement the pure journal module**

Create `app-compact/src/lib/changeJournal.ts` with these public types and transitions:

```ts
import { MAX_SYNC_RETRY_ATTEMPTS } from './constants';
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
```

During implementation, preserve a terminal entry when a duplicate local change arrives. A duplicate may merge payload metadata, but it must not reset terminal attempts or error evidence; only `manual-retry` does that.

- [ ] **Step 5: Run the unit sequence and correct only journal behavior**

Run:

```bash
npm run test:change-journal
```

Expected: `change journal tests passed`.

- [ ] **Step 6: Replace every direct constructor and transition**

In `useAppState.ts` and `Settings.tsx`, replace `queueItem(...)` plus `enqueueSyncItem(...)` with:

```ts
enqueueChange(prev.syncQueue, {
  type: 'receipt',
  entityId: stamped.id,
  op: idx < 0 ? 'create' : 'update',
  payload: {
    notionPageId: stamped.notionPageId,
    supabaseId: stamped.supabaseId,
    tripId: stamped.tripId,
    sourceId: stamped.sourceId || stamped.id,
    version: stamped.version,
    syncRevision: stamped.syncRevision,
    updatedAt: stamped.updatedAt,
  },
})
```

Use the same `ChangeDraft` object shape for settings, trips, tombstones, and photo retries. Delete the private queue constructors after `rg` shows no caller.

In `useSyncEngine.ts`, replace direct status mutation/removal:

```ts
setState((prev) => ({
  ...prev,
  syncQueue: settleChange(prev.syncQueue, item.id, { kind: 'syncing' }).queue,
}));

setState((prev) => ({
  ...prev,
  syncQueue: settleChange(prev.syncQueue, item.id, { kind: 'succeeded' }).queue,
}));

setState((prev) => ({
  ...prev,
  syncQueue: settleChange(prev.syncQueue, item.id, {
    kind: retryable ? 'retryable-error' : 'terminal-error',
    error: safeMessage,
  }).queue,
}));
```

Replace `retryFailedItems` with the explicit manual transition:

```ts
const retryFailedItems = useCallback(() => {
  setState((prev) => ({
    ...prev,
    syncQueue: prev.syncQueue.reduce(
      (queue, item) =>
        item.status === 'error' || item.status === 'failed'
          ? settleChange(queue, item.id, { kind: 'manual-retry' }).queue
          : queue,
      prev.syncQueue,
    ),
    globalSyncStatus: 'queued',
    syncError: '',
  }));
}, [setState]);
```

In `storage.ts`, replace the queue restoration block with:

```ts
const journal = restoreJournal(state.syncQueue);
state.syncQueue = journal.queue;
state.globalSyncStatus = journal.status;
state.syncError = journal.error;
```

Remove `isRetryablePersistedSyncFailure` only after `rg` confirms it has no caller.

- [ ] **Step 7: Add browser regression assertions for duplicate and cold-open behavior**

Extend `app-compact/tests/offline-sync-smoke.spec.cjs` with one test that:

```js
test('duplicate offline save remains one queued change after reconnect', async ({ page, context }) => {
  await context.setOffline(true);
  await saveReceipt(page, { id: 'offline-duplicate', total: 100 });
  await saveReceipt(page, { id: 'offline-duplicate', total: 120 });
  const queue = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('boss-japan-tracker')).syncQueue);
  expect(queue.filter((item) =>
    item.type === 'receipt' && item.entityId === 'offline-duplicate')).toHaveLength(1);
  await context.setOffline(false);
});
```

In the same smoke, abort one mocked photo upload after the request starts:

```js
let uploadAttempts = 0;
await page.route('**/storage/v1/object/**', async (route) => {
  uploadAttempts += 1;
  if (uploadAttempts === 1) {
    await route.abort('internetdisconnected');
    return;
  }
  await route.fulfill({ status: 200, body: '{}' });
});
await saveReceipt(page, {
  id: 'upload-cut',
  total: 200,
  photoThumb: 'data:image/jpeg;base64,AA==',
});
expect(await queuedIdentityCount(page, 'receipt', 'upload-cut')).toBe(1);
await page.evaluate(() => window.dispatchEvent(new Event('online')));
await expect.poll(() => uploadAttempts).toBe(2);
expect(await queuedIdentityCount(page, 'receipt', 'upload-cut')).toBeLessThanOrEqual(1);
```

Extend `app-compact/tests/sync-regression-smoke.spec.cjs` with one cold-open assertion:

```js
expect(restored.syncQueue.find((item) => item.entityId === 'conflict').status).toBe('error');
expect(restored.syncQueue.find((item) => item.entityId === 'conflict').attempts).toBe(3);
```

Reuse the existing helpers and fixture setup already defined in each file; do not create a second browser harness.

- [ ] **Step 8: Bump version and run focused plus full Compact gates**

Set:

```text
app-compact/package.json                         0.16.13
app-compact/package-lock.json root/package       0.16.13
app-compact/src/lib/constants.ts APP_VERSION     0.16.13
```

Run:

```bash
cd app-compact
npm run test:change-journal
npm run typecheck
npm run build
npm run security:scan
npm run smoke:offline
npm run smoke:sync-regression
npm run smoke:settings
cd ..
node .gitnexus/run.cjs detect-changes
git diff --check
```

Expected: journal script prints its pass line; typecheck/build/security scan exit `0`; both sync smokes and settings smoke pass; GitNexus lists only expected queue/sync flows; diff check has no output.

- [ ] **Step 9: Update handover evidence and commit only milestone files**

Add a new top entry to `HANDOVER.md` that records exact command outputs and changes Open Item 18 from design-only to `Milestone 1 complete; Milestones 2-4 and Android port remain`.

Run:

```bash
git add app-compact/package.json app-compact/package-lock.json app-compact/src/lib/constants.ts app-compact/src/lib/changeJournal.ts app-compact/src/lib/useAppState.ts app-compact/src/lib/useSyncEngine.ts app-compact/src/lib/storage.ts app-compact/src/tabs/Settings.tsx app-compact/scripts/change-journal.test.ts app-compact/tests/offline-sync-smoke.spec.cjs app-compact/tests/sync-regression-smoke.spec.cjs HANDOVER.md
git diff --cached --check
git status --short
git commit -m "refactor: centralize compact change journal"
git push origin main
```

Expected: `CLAUDE.md` remains unstaged; commit and push succeed; `git log origin/main -1 --oneline` names `refactor: centralize compact change journal`.
