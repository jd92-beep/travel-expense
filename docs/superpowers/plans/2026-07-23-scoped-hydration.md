# Scoped Hydration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move account-scoped localStorage/IndexedDB arbitration into one persistence module that returns one canonical `AppState` without changing serialized data.

**Architecture:** A focused module owns snapshot reads, freshness, per-Receipt merge, normalization, public-demo filtering, and dual-adapter writes. `useAppState` retains cancellation and React state lifecycle but consumes only `hydrateScope` and `persistScope`.

**Tech Stack:** React 19, TypeScript 5.8, browser localStorage/IndexedDB, Node 22 built-in assertions, Playwright

## Global Constraints

- Start only after the Offline Change Journal commit is green on `origin/main`.
- Work in `/Users/tommy/Documents/Codex/travel-expense` on `main`.
- Preserve `boss-japan-tracker`, `boss-japan-tracker:state:supabase:<user_id>`, `app-state:supabase:<user_id>`, and every serialized `AppState` field.
- Preserve local-only credentials and strip legacy provider secrets and sharing invite tokens from both adapters.
- Call `restoreJournal` during normalization; terminal Change Journal evidence must survive hydration.
- One adapter write success is degraded success; two failures keep state in memory and return safe error evidence.
- Do not add a dependency or a generic repository layer.
- Bump Compact from `0.16.13` to `0.16.14`.
- Keep Boss's unrelated `CLAUDE.md` change unstaged.

---

### Task 1: Centralize scoped snapshot hydration and persistence

**Files:**
- Create: `app-compact/src/lib/scopedPersistence.ts`
- Create: `app-compact/scripts/scoped-persistence.test.ts`
- Modify: `app-compact/package.json`
- Modify: `app-compact/package-lock.json`
- Modify: `app-compact/src/lib/constants.ts`
- Modify: `app-compact/src/lib/storage.ts`
- Modify: `app-compact/src/storage/indexedDb.ts`
- Modify: `app-compact/src/lib/useAppState.ts`
- Modify: `app-compact/src/tabs/Settings.tsx`
- Modify: `app-compact/tests/session-persistence-smoke.spec.cjs`
- Modify: `app-compact/tests/security-smoke.spec.cjs`
- Modify: `HANDOVER.md`

**Interfaces:**
- Consumes: `normalizeState(input): AppState`, `restoreJournal(queue): JournalResult`, `loadIndexedState(scope)`, `saveIndexedState(state, scope)`, and current scoped storage keys.
- Produces: `hydrateScope(scope, userEmail): Promise<AppState>`, `persistScope(scope, userEmail, state): Promise<PersistResult>`.

- [ ] **Step 1: Record symbol impact**

Run:

```bash
node .gitnexus/run.cjs status
node .gitnexus/run.cjs impact useAppState --direction upstream
node .gitnexus/run.cjs impact loadState --direction upstream
node .gitnexus/run.cjs impact saveState --direction upstream
```

Expected: hydration, Settings backup, and session persistence flows are listed. Stop and notify Boss before code edits if risk is HIGH or CRITICAL.

- [ ] **Step 2: Add the failing in-memory adapter tests**

Add:

```json
"test:scoped-persistence": "node --experimental-strip-types scripts/scoped-persistence.test.ts"
```

Create `app-compact/scripts/scoped-persistence.test.ts`:

```ts
import assert from 'node:assert/strict';
import {
  createScopedPersistence,
  type SnapshotAdapter,
} from '../src/lib/scopedPersistence.ts';
import { DEFAULT_STATE } from '../src/lib/constants.ts';

function memoryAdapter(initial: unknown = null, failure: 'read' | 'write' | null = null) {
  let value = initial;
  const adapter: SnapshotAdapter = {
    async load() {
      if (failure === 'read') throw new Error('read failed');
      return value;
    },
    async save(_scope, next) {
      if (failure === 'write') throw new Error('write failed');
      value = structuredClone(next);
    },
  };
  return { adapter, read: () => value };
}

const indexedOnly = memoryAdapter({
  ...DEFAULT_STATE,
  settingsUpdatedAt: 20,
  trips: [{ ...DEFAULT_STATE.trips[0], id: 'cloud-trip' }],
  activeTripId: 'cloud-trip',
});
let persistence = createScopedPersistence(memoryAdapter().adapter, indexedOnly.adapter);
let state = await persistence.hydrateScope('supabase:user-1', 'member@example.com');
assert.equal(state.activeTripId, 'cloud-trip');
assert.equal(state.trips.some((trip) => trip.id === DEFAULT_STATE.activeTripId), false);

const localNewer = memoryAdapter({
  ...DEFAULT_STATE,
  settingsUpdatedAt: 30,
  receipts: [{ id: 'r1', store: 'local', total: 2, date: '2026-01-01', category: 'other', payment: 'cash', updatedAt: 30 }],
});
const indexedOlder = memoryAdapter({
  ...DEFAULT_STATE,
  settingsUpdatedAt: 10,
  receipts: [{ id: 'r1', store: 'indexed', total: 1, date: '2026-01-01', category: 'other', payment: 'cash', updatedAt: 10 }],
});
persistence = createScopedPersistence(localNewer.adapter, indexedOlder.adapter);
state = await persistence.hydrateScope('local', 'vc06456@gmail.com');
assert.equal(state.receipts[0].store, 'local');

const indexedGlobalNewer = memoryAdapter({
  ...DEFAULT_STATE,
  settingsUpdatedAt: 40,
  receipts: [
    { id: 'r1', store: 'indexed-old-receipt', total: 1, date: '2026-01-01', category: 'other', payment: 'cash', updatedAt: 10 },
    { id: 'r2', store: 'indexed-new', total: 3, date: '2026-01-02', category: 'other', payment: 'cash', updatedAt: 40 },
  ],
});
persistence = createScopedPersistence(localNewer.adapter, indexedGlobalNewer.adapter);
state = await persistence.hydrateScope('local', 'vc06456@gmail.com');
assert.equal(state.receipts.find((receipt) => receipt.id === 'r1')?.store, 'local');
assert.equal(state.receipts.find((receipt) => receipt.id === 'r2')?.store, 'indexed-new');

const poisoned = memoryAdapter({ ...DEFAULT_STATE, kimiKey: 'must-not-survive' });
persistence = createScopedPersistence(poisoned.adapter, memoryAdapter(null, 'read').adapter);
state = await persistence.hydrateScope('local', 'vc06456@gmail.com');
assert.equal('kimiKey' in state, false);

const terminalSnapshot = {
  ...DEFAULT_STATE,
  syncQueue: [{
    id: 'sync-conflict',
    type: 'receipt',
    entityId: 'conflict',
    op: 'update',
    status: 'error',
    attempts: 3,
    error: '40001 version conflict',
    createdAt: 1,
    updatedAt: 2,
  }],
};
persistence = createScopedPersistence(
  memoryAdapter(terminalSnapshot).adapter,
  memoryAdapter(terminalSnapshot).adapter,
);
state = await persistence.hydrateScope('local', 'vc06456@gmail.com');
assert.equal(state.syncQueue[0].status, 'error');
assert.equal(state.syncQueue[0].attempts, 3);
assert.equal(state.syncQueue[0].error, '40001 version conflict');

const malformedPrimary = memoryAdapter('not-an-app-state');
persistence = createScopedPersistence(malformedPrimary.adapter, indexedOnly.adapter);
state = await persistence.hydrateScope('supabase:user-1', 'member@example.com');
assert.equal(state.activeTripId, 'cloud-trip');

const healthy = memoryAdapter();
persistence = createScopedPersistence(memoryAdapter(null, 'write').adapter, healthy.adapter);
const degraded = await persistence.persistScope('local', 'vc06456@gmail.com', DEFAULT_STATE);
assert.deepEqual(degraded, {
  localStorage: 'failed',
  indexedDb: 'succeeded',
  status: 'degraded',
  error: 'localStorage write failed',
});
assert.ok(healthy.read());

const failed = await createScopedPersistence(
  memoryAdapter(null, 'write').adapter,
  memoryAdapter(null, 'write').adapter,
).persistScope('local', 'vc06456@gmail.com', DEFAULT_STATE);
assert.deepEqual(failed, {
  localStorage: 'failed',
  indexedDb: 'failed',
  status: 'failed',
  error: 'localStorage write failed; IndexedDB write failed',
});

console.log('scoped persistence tests passed');
```

- [ ] **Step 3: Run the test and confirm the missing-module failure**

Run:

```bash
cd app-compact
npm run test:scoped-persistence
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/lib/scopedPersistence.ts`.

- [ ] **Step 4: Expose narrow raw snapshot adapter operations**

In `storage.ts`, add localStorage-only operations and keep credentials local:

```ts
export function loadStoredSnapshot(scope?: string): unknown | null {
  const raw = localStorage.getItem(scopedStateKey(scope));
  return raw ? safeJsonParse(raw) : null;
}

export function saveStoredSnapshot(state: AppState, scope?: string): void {
  saveCredentials(state);
  const safeState = stripSensitiveState(state);
  if (!safeLocalStorageSet(scopedStateKey(scope), JSON.stringify(safeState))) {
    throw new Error('localStorage write failed');
  }
}
```

Change `saveState` into a compatibility wrapper for the Settings import path:

```ts
export function saveState(state: AppState, scope?: string): void {
  saveStoredSnapshot(state, scope);
  void saveIndexedState(stripSensitiveState(state), scope).catch((error) => {
    console.warn('[storage] IndexedDB snapshot write failed:',
      error instanceof Error ? error.message : String(error));
  });
}
```

In `indexedDb.ts`, remove the private duplicate secret stripper and call the existing `stripSensitiveState` before the adapter boundary. Do not change `DB_NAME`, `STATE_STORE`, or `scopedSnapshotKey`.

- [ ] **Step 5: Implement canonical hydration and dual persistence**

Create `app-compact/src/lib/scopedPersistence.ts`:

```ts
import { DEFAULT_STATE, isBoss } from './constants';
import { migrateAppState } from '../domain/trip/normalize';
import { loadIndexedState, saveIndexedState } from '../storage/indexedDb';
import {
  loadCredentials,
  loadStoredSnapshot,
  normalizeState,
  saveStoredSnapshot,
  stripSensitiveState,
} from './storage';
import type { AppState, Receipt } from './types';

export type SnapshotAdapter = {
  load(scope: string): Promise<unknown | null>;
  save(scope: string, state: AppState): Promise<void>;
};

export type PersistResult = {
  localStorage: 'succeeded' | 'failed';
  indexedDb: 'succeeded' | 'failed';
  status: 'succeeded' | 'degraded' | 'failed';
  error: string;
};

const freshness = (state: Partial<AppState>) => Math.max(
  Number(state.settingsUpdatedAt || 0),
  Number(state.lastSyncedAt || 0),
  ...(state.receipts || []).map((receipt) =>
    Number(receipt.updatedAt || receipt.createdAt || 0)),
);

function mergeReceipts(primary: Receipt[], secondary: Receipt[]): Receipt[] {
  const merged = new Map(primary.map((receipt) => [receipt.id, receipt]));
  for (const receipt of secondary) {
    const current = merged.get(receipt.id);
    if (!current || Number(receipt.updatedAt || receipt.createdAt || 0)
      > Number(current.updatedAt || current.createdAt || 0)) {
      merged.set(receipt.id, receipt);
    }
  }
  return [...merged.values()];
}

function removePublicDemo(state: AppState, scope: string, userEmail: string | null): AppState {
  if (!scope.startsWith('supabase:') || isBoss(userEmail)) return state;
  const trips = state.trips.filter((trip) => trip.id !== DEFAULT_STATE.activeTripId);
  const activeTripId = trips.find((trip) => trip.id === state.activeTripId && !trip.archived)?.id
    || trips.find((trip) => trip.active && !trip.archived)?.id
    || trips.find((trip) => !trip.archived)?.id
    || '';
  const active = trips.find((trip) => trip.id === activeTripId);
  return {
    ...state,
    trips: trips.map((trip) => ({
      ...trip,
      active: trip.id === activeTripId && !trip.archived,
    })),
    receipts: state.receipts.filter((receipt) => receipt.tripId !== DEFAULT_STATE.activeTripId),
    activeTripId,
    tripName: active?.name || (trips.length ? state.tripName : ''),
    tripDateRange: active
      ? { start: active.startDate, end: active.endDate }
      : state.tripDateRange,
    customItinerary: active?.itinerary || (trips.length ? state.customItinerary : null),
  };
}

export function createScopedPersistence(
  local: SnapshotAdapter,
  indexed: SnapshotAdapter,
) {
  return {
    async hydrateScope(scope: string, userEmail: string | null): Promise<AppState> {
      const [localResult, indexedResult] = await Promise.allSettled([
        local.load(scope),
        indexed.load(scope),
      ]);
      const localValue = localResult.status === 'fulfilled' ? localResult.value : null;
      const indexedValue = indexedResult.status === 'fulfilled' ? indexedResult.value : null;
      const localState = localValue ? normalizeState(localValue) : null;
      const indexedState = indexedValue ? normalizeState(indexedValue) : null;
      const newest = localState && indexedState
        ? freshness(indexedState) > freshness(localState) ? indexedState : localState
        : localState || indexedState || normalizeState(DEFAULT_STATE);
      const other = newest === localState ? indexedState : localState;
      const merged = other
        ? { ...other, ...newest, receipts: mergeReceipts(newest.receipts, other.receipts) }
        : newest;
      const credentials = scope === 'local' ? loadCredentials() : {};
      return removePublicDemo(normalizeState(migrateAppState({
        ...merged,
        ...credentials,
      })), scope, userEmail);
    },
    async persistScope(
      scope: string,
      _userEmail: string | null,
      state: AppState,
    ): Promise<PersistResult> {
      const safe = stripSensitiveState(migrateAppState(state));
      const [localResult, indexedResult] = await Promise.allSettled([
        local.save(scope, safe),
        indexed.save(scope, safe),
      ]);
      const localStorage = localResult.status === 'fulfilled' ? 'succeeded' : 'failed';
      const indexedDb = indexedResult.status === 'fulfilled' ? 'succeeded' : 'failed';
      const status = localStorage === 'succeeded' && indexedDb === 'succeeded'
        ? 'succeeded'
        : localStorage === 'succeeded' || indexedDb === 'succeeded'
          ? 'degraded'
          : 'failed';
      const error = [
        localResult.status === 'rejected' ? 'localStorage write failed' : '',
        indexedResult.status === 'rejected' ? 'IndexedDB write failed' : '',
      ].filter(Boolean).join('; ');
      return { localStorage, indexedDb, status, error };
    },
  };
}

const browserPersistence = createScopedPersistence(
  {
    async load(scope) { return loadStoredSnapshot(scope); },
    async save(scope, state) { saveStoredSnapshot(state, scope); },
  },
  {
    load: loadIndexedState,
    async save(scope, state) { await saveIndexedState(state, scope); },
  },
);

export const hydrateScope = browserPersistence.hydrateScope;
export const persistScope = browserPersistence.persistScope;
```

If `loadCredentials` is currently private, export it without changing its body. Keep the factory only as the in-memory test seam; production callers import the two bound functions.

- [ ] **Step 6: Make `useAppState` lifecycle-only**

Replace snapshot arbitration inside `useLayoutEffect` with:

```ts
useLayoutEffect(() => {
  let alive = true;
  setIndexedReadyScope('');
  void hydrateScope(storageScope, userEmail)
    .then((hydrated) => {
      if (!alive) return;
      setState(hydrated);
      setHydratedScope(storageScope);
      setIndexedReadyScope(storageScope);
    })
    .catch((error) => {
      if (!alive) return;
      console.warn('[useAppState] Hydration failed:',
        error instanceof Error ? error.message : String(error));
      setHydratedScope(storageScope);
      setIndexedReadyScope(storageScope);
    });
  return () => { alive = false; };
}, [storageScope, userEmail]);
```

Replace persistence with:

```ts
useEffect(() => {
  if (indexedReadyScope !== storageScope) return;
  void persistScope(storageScope, userEmail, state).then((result) => {
    if (result.status !== 'succeeded') {
      console.warn('[useAppState] Persist degraded:', result.error);
    }
  });
}, [indexedReadyScope, state, storageScope, userEmail]);
```

Delete `stateFreshness`, `normalizeScopedState`, and direct IndexedDB imports after `rg` reports no use. Keep the lifecycle cancellation guard so an old Account Scope cannot overwrite a newly selected scope.

- [ ] **Step 7: Prove account switching, secret stripping, and degraded writes**

Run:

```bash
npm run test:scoped-persistence
npm run test:change-journal
npm run smoke:session
npm run smoke:security
npm run smoke:offline
npm run smoke:sync-regression
```

Expected: both Node scripts print pass lines; browser smokes pass without cross-account state leakage, secret persistence, or false cold-open retry banners.

- [ ] **Step 8: Bump version and run the complete Compact gates**

Set all Compact version sources to `0.16.14`, then run:

```bash
npm run typecheck
npm run build
npm run security:scan
npm run smoke:settings
npm run smoke:mobile-layout
cd ..
node .gitnexus/run.cjs detect-changes
git diff --check
```

Expected: all commands exit `0`; GitNexus reports persistence/hydration flows only; diff check has no output.

- [ ] **Step 9: Record evidence, commit, and push**

Update Open Item 18 to `Milestones 1-2 complete; Milestones 3-4 and Android port remain`, then stage only this milestone:

```bash
git add app-compact/package.json app-compact/package-lock.json app-compact/src/lib/constants.ts app-compact/src/lib/scopedPersistence.ts app-compact/src/lib/storage.ts app-compact/src/storage/indexedDb.ts app-compact/src/lib/useAppState.ts app-compact/src/tabs/Settings.tsx app-compact/scripts/scoped-persistence.test.ts app-compact/tests/session-persistence-smoke.spec.cjs app-compact/tests/security-smoke.spec.cjs HANDOVER.md
git diff --cached --check
git status --short
git commit -m "refactor: centralize compact scoped hydration"
git push origin main
```

Expected: `CLAUDE.md` remains unstaged; the pushed commit is the sole new `origin/main` head.
