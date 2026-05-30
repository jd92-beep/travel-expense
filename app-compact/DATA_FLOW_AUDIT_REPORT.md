# Travel-Expense React App — Data Flow & State Management Audit Report

> **Audit Date**: 2026-05-09
> **Scope**: `src/lib/types.ts`, `useAppState.ts`, `syncMerge.ts`, `domain/trip/normalize.ts`, `storage.ts`, `domain.ts`, `tabs/Dashboard.tsx`, `tabs/History.tsx`, `tabs/Stats.tsx`, `useSyncEngine.ts`, `notion.ts`, `constants.ts`, `storage/indexedDb.ts`, `currency.ts`

---

## 1. Data Loss on Refresh (HIGH)

### 1a. `localStorage` quota exhaustion silently aborts ALL persistence
**File**: `src/lib/storage.ts`
**Line**: 95–100

```ts
export function saveState(state: AppState): void {
  saveCredentials(state);
  const safeState = stripSensitiveState(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState));   // ← throws QuotaExceededError
  void saveIndexedState(safeState);                                 // ← NEVER reached if ↑ throws
}
```

If `localStorage` is full (common on iOS Safari after ~5 MB), `setItem` throws. Because the call is **not wrapped in `try/catch`**, the exception bubbles up into the `useEffect` in `useAppState.ts`, `saveIndexedState` is skipped, and the app continues running in-memory only. On next refresh the edit is gone.

**Fix**:
```ts
export function saveState(state: AppState): void {
  saveCredentials(state);
  const safeState = stripSensitiveState(state);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState));
  } catch {
    // intentional fall-through to IndexedDB
  }
  void saveIndexedState(safeState);
}
```

---

### 1b. IndexedDB merge logic overwrites newer IndexedDB data with older `localStorage` data
**File**: `src/lib/useAppState.ts`
**Line**: 35–46

```ts
loadIndexedState().then((indexed) => {
  if (!alive || !indexed) return;
  setState((prev) => migrateAppState({ ...indexed, ...prev }));   // ← prev (localStorage) WINS
});
```

`{ ...indexed, ...prev }` means **localStorage always overwrites IndexedDB**. If a previous session successfully wrote a large receipt to IndexedDB but `localStorage` failed (quota), the user refreshes and the newer IndexedDB data is clobbered by the stale `localStorage` snapshot.

**Fix** (timestamp-aware merge):
```ts
setState((prev) => {
  const indexedNewer = indexed.lastSyncedAt && prev.lastSyncedAt
    ? indexed.lastSyncedAt > prev.lastSyncedAt
    : false;
  const winner = indexedNewer ? { ...prev, ...indexed } : { ...indexed, ...prev };
  return migrateAppState(winner);
});
```

---

## 2. Stale Data After Pull (MEDIUM)

### 2a. `mergePulledTrips` can wipe local itinerary when remote JSON is corrupted/truncated
**File**: `src/lib/syncMerge.ts`
**Line**: 48–68

```ts
if (!localTrip || remoteUpdated > localUpdated || (remoteUpdated === localUpdated && remoteHasMissingLink)) {
  byId.set(remoteTrip.id, { ...localTrip, ...remoteTrip });   // ← remoteTrip.itinerary === [] overwrites local
}
```

`tripFromPage` (`notion.ts:244–263`) returns `itinerary: []` when `tripJson` JSON parse fails. If that fallback trip is pulled, the spread `{ ...localTrip, ...remoteTrip }` **replaces the local itinerary with an empty array**.

**Fix**: Deep-merge itinerary instead of blind spread:
```ts
byId.set(remoteTrip.id, {
  ...localTrip,
  ...remoteTrip,
  itinerary: remoteTrip.itinerary?.length ? remoteTrip.itinerary : localTrip?.itinerary,
});
```

---

### 2b. `applyReceiptSyncResult` leaves receipt stuck in `'syncing'` status after mid-flight local edit
**File**: `src/lib/useSyncEngine.ts`
**Line**: 85–102

```ts
if (queueUpdatedAt && currentUpdatedAt > queueUpdatedAt) {
  return {
    ...candidate,
    notionPageId: receipt.notionPageId || candidate.notionPageId,
    sourceId: receipt.sourceId || candidate.sourceId,
    // ← MISSING: syncStatus is NOT reset
  };
}
```

If the user edits a receipt while it is being pushed, the timestamp comparison detects the conflict and preserves local changes. However it **never resets `syncStatus`** — the receipt remains `'syncing'` forever in the UI even though the queue item has been removed.

**Fix**:
```ts
return {
  ...candidate,
  notionPageId: receipt.notionPageId || candidate.notionPageId,
  sourceId: receipt.sourceId || candidate.sourceId,
  syncStatus: 'queued',   // or 'local' if autoSync is off
};
```

---

## 3. Duplicate Receipts (MEDIUM)

### 3a. Notion pages with empty `sourceId` create orphaned duplicate identities
**File**: `src/lib/notion.ts`
**Line**: 196

```ts
id: sourceId || `notion_${page.id}`,
```

If a receipt is created in Notion with an empty `sourceId`, it gets a synthetic ID `notion_${page.id}`. The same receipt, if previously created locally and pushed, lives locally with ID `receipt_xxx`. Because the IDs differ, `mergePulledReceipts` treats them as **two different receipts**. The user sees a duplicate.

**Fix**: Always index/pull by `notionPageId` as a secondary key in `mergePulledReceipts`:
```ts
const byPageId = new Map(state.receipts.filter(r => r.notionPageId).map(r => [r.notionPageId, r]));
// If remote.notionPageId matches a local receipt, merge by pageId instead of creating a new entry.
```

---

## 4. Receipt ID Collisions (LOW)

### 4a. Sync-queue IDs rely on `Math.random()` with millisecond precision only
**File**: `src/lib/useAppState.ts`
**Line**: 13

```ts
id: `sync_${now}_${Math.random().toString(16).slice(2)}`,
```

Two queue items created in the same millisecond have a theoretical collision risk. In practice low, but for a financial app use `crypto.randomUUID()` or a counter.

**Fix**:
```ts
id: `sync_${now}_${Math.random().toString(36).slice(2)}_${++queueCounter}`,
```

---

## 5. Category / Payment Mapping (HIGH)

### 5a. Exact-string match with no normalization causes silent fallback
**File**: `src/lib/notion.ts`
**Line**: 203–204

```ts
category: (CATEGORIES.find((c) => c.name === catName)?.id || 'other') as CategoryId,
payment: (PAYMENTS.find((p) => p.name === payName)?.id || 'cash') as PaymentId,
```

If Notion contains `"機票 "` (trailing space), `"机票"` (simplified), or an old English label, the match fails and every receipt silently becomes **`other` / `cash`**.

**Fix** (create a normalized lookup map):
```ts
const CATEGORY_BY_NAME = Object.fromEntries(CATEGORIES.map(c => [c.name.trim(), c.id]));
// also add aliases if needed
category: (CATEGORY_BY_NAME[catName.trim()] || 'other') as CategoryId,
```

---

## 6. Currency Conversion (HIGH)

### 6a. `stampReceiptForTrip` ignores `rateTable` and always falls back to JPY-centric `state.rate`
**File**: `src/domain/trip/normalize.ts`
**Line**: 80–99

```ts
const rate = Math.max(0.1, Number(receipt.exchangeRate || state.rate) || 20.36);
```

When `receipt.exchangeRate` is undefined (e.g., pulled from Notion — see §6b), the code falls back to `state.rate` (default 20.36 JPY/HKD). It **never consults `state.rateTable`**, so a KRW, TWD, or EUR receipt gets converted with the JPY rate.

**Fix**:
```ts
const currency = receipt.currency || receipt.originalCurrency || day?.currency || state.tripCurrency || 'JPY';
const rate = Math.max(0.1,
  Number(receipt.exchangeRate)
  || state.rateTable?.[currency]?.perHkd
  || Number(state.rate)
  || 20.36
);
```

---

### 6b. `exchangeRate` is never read from Notion
**File**: `src/lib/notion.ts`
**Line**: 184–225 (`receiptFromPage`)

There is no mapping for an `exchangeRate` property in the Notion schema (`N`). Every receipt pulled from Notion loses its original exchange rate and is re-stamped with `state.rate`.

**Fix**: Add `exchangeRate` to the Notion schema and map it in `receiptFromPage`:
```ts
exchangeRate: Number(readProp(props, 'exchangeRate')?.number) || undefined,
```

---

## 7. Person Assignment (MEDIUM)

### 7a. Substring match on person name is fragile
**File**: `src/lib/notion.ts`
**Line**: 211

```ts
personId: persons.find((p) => personText.includes(p.name))?.id || persons[0]?.id,
```

If names overlap (e.g., `"Tony"` and `"Tony Jr."`), the shorter name matches first. If a user renames a person locally, all old Notion rows with the previous name fall back to `persons[0]`.

**Fix**: Store `personId` explicitly in Notion (e.g., as a `rich_text` or `select` field) instead of relying on display-name substring matching. Failing that, trim and exact-match after removing emoji:
```ts
const clean = personText.replace(/\p{Emoji}+/gu, '').trim();
personId: persons.find((p) => clean === p.name)?.id || persons[0]?.id;
```

---

## 8. LocalStorage Quota (HIGH)

### 8a. `saveState` has no quota handling
(Same as §1a — `storage.ts:95–100`)

Additionally, the `useEffect` in `useAppState.ts` that calls `saveState` has no error boundary or retry:

**File**: `src/lib/useAppState.ts`
**Line**: 48–50

```ts
useEffect(() => {
  saveState(migrateAppState(state));
}, [state]);
```

If `saveState` throws, React logs an error and the app continues without persistence.

**Fix**:
```ts
useEffect(() => {
  try {
    saveState(migrateAppState(state));
  } catch (e) {
    console.error('Persist failed', e);
  }
}, [state]);
```

---

## 9. IndexedDB Fallback (HIGH)

### 9a. IndexedDB is never the "source of truth" on load
(Same as §1b — `useAppState.ts:35–46`)

### 9b. IndexedDB write is fire-and-forget with no error logging
**File**: `src/lib/storage.ts`
**Line**: 99

```ts
void saveIndexedState(safeState);
```

If IndexedDB write fails (e.g., disk full, corrupted DB), the failure is completely silent.

**Fix**:
```ts
saveIndexedState(safeState).catch(err => console.error('IndexedDB persist failed', err));
```

---

## 10. State Migration (MEDIUM)

### 10a. `loadState` catch branch skips `normalizeState`
**File**: `src/lib/storage.ts`
**Line**: 85–93

```ts
} catch {
  return { ...DEFAULT_STATE, ...loadCredentials() };   // ← NOT normalized
}
```

If `JSON.parse` throws on a corrupt localStorage entry, the app returns raw `DEFAULT_STATE` without running `normalizeState` / `migrateAppState`. Fields like `trips`, `syncQueue`, `itineraryOverrides` may be missing defaults or have the wrong shape.

**Fix**:
```ts
} catch {
  return normalizeState({ ...DEFAULT_STATE, ...loadCredentials() });
}
```

---

### 10b. `migrateAppState` ignores `customItinerary` when `trips` array exists but is empty
**File**: `src/domain/trip/normalize.ts`
**Line**: 102–146

```ts
const trip = Array.isArray(parsed.trips) && parsed.trips.length
  ? { ...parsed.trips[0], ... }
  : tripFromLegacyState(parsed);
```

If `parsed.trips` is `[]`, the ternary falls through to `tripFromLegacyState`, which correctly reads `customItinerary`. However, later in the same function:

```ts
const trips = Array.isArray(parsed.trips) && parsed.trips.length
  ? parsed.trips.map(...)
  : [trip];
```

If `parsed.trips` is non-empty but the objects inside lack `itinerary`, `normalizeItinerary(item.itinerary || [], ...)` produces an empty itinerary and the user's `customItinerary` is permanently lost.

**Fix**: During migration, back-fill missing itineraries from `customItinerary` before normalizing:
```ts
itinerary: normalizeItinerary(
  item.itinerary?.length ? item.itinerary : (parsed.customItinerary || []),
  item.id,
  parsed.tripCurrency || 'JPY'
),
```

---

## 11. Additional Critical Issues

### 11a. `exportCsv` revokes blob URL before download starts
**File**: `src/lib/domain.ts`
**Line**: 324–329

```ts
a.click();
URL.revokeObjectURL(a.href);   // ← too early; download may be cancelled
```

Compare with `downloadJson` on line 55 which correctly uses `setTimeout(..., 1500)`.

**Fix**:
```ts
a.click();
window.setTimeout(() => URL.revokeObjectURL(a.href), 1500);
```

---

### 11b. `upsertReceipt` preserves stale `'synced'` status on edits
**File**: `src/lib/useAppState.ts`
**Line**: 56–75

```ts
syncStatus: receipt.syncStatus || (prev.autoSync && ... ? 'queued' : 'local'),
```

If the caller passes a previously-synced receipt with `syncStatus: 'synced'`, the edited receipt keeps `'synced'` in state even though a new queue item is created. The UI falsely shows it as already synced.

**Fix**: Force the status based on queueing logic, not the incoming receipt:
```ts
syncStatus: prev.autoSync && (hasCredentialBrokerSession(prev) || hasDirectNotionToken()) ? 'queued' : 'local',
```

---

### 11c. `tripJson` chunked write silently truncates large trips
**File**: `src/lib/notion.ts`
**Line**: 100–103

```ts
return chunks.slice(0, 80).map((content) => ({ text: { content } }));
```

Max payload = 80 × 1800 = **144 KB**. A long itinerary with many spots can exceed this. Notion stores truncated JSON, `tripFromPage` parse fails, and the catch path returns `itinerary: []` (see §2a).

**Fix**: Store itinerary in a separate Notion property or compress/minify JSON before chunking. At minimum, log a warning when truncation occurs.

---

### 11d. `Stats.tsx` `Bar` animation re-triggers from zero on every render
**File**: `src/tabs/Stats.tsx`
**Line**: 258–263

```ts
<motion.i
  style={{ width: `${Math.min(100, value / total * 100)}%`, background: color }}
  initial={{ width: 0 }}
  animate={{ width: `${Math.min(100, value / total * 100)}%` }}
  transition={{ duration: 0.38, ease: 'easeOut' }}
/>
```

Because `state` is recreated every render, `Bar` re-renders constantly and the width animates from `0` repeatedly, causing visual flicker and unnecessary CPU usage.

**Fix**: Memoize `scopedState` and derived values in `Stats.tsx`, or add `key={value}` to the motion element so it only animates when the value actually changes.

---

### 11e. `notion.ts` `receiptFromPage` does not read `exchangeRate` (data loss on every pull)
(Same as §6b)

---

### 11f. `useSyncEngine.ts` `pull()` calculates `pendingCount` from stale `stateRef`
**File**: `src/lib/useSyncEngine.ts`
**Line**: 246

```ts
const pending = pendingCount(stateRef.current.syncQueue);
```

`stateRef.current` is updated only on render. `pull()` reads it before `setState` has flushed the merged result, so `pendingCount` may reflect the pre-merge queue state. This can cause the engine to report `'queued'` when it should report `'synced'` after a successful pull.

**Fix**: Compute `pending` inside the functional `setState` updater, or read from the merged result after `yieldToStateFlush`.

---

### 11g. `History.tsx` `receipts` `useMemo` dependency on `trip.id` is unstable
**File**: `src/tabs/History.tsx`
**Line**: 32–40

```ts
}, [state.receipts, query, category, trip.id]);
```

`trip` comes from `activeTrip(state)`, which returns a new object every render. While `trip.id` is a string primitive and stable, `trip` itself is recomputed unnecessarily. More importantly, if `activeTrip` ever returns a trip with a different object reference but same `id`, the filter logic is correct; however `tripReceipts` on `Dashboard.tsx` (line 71) does the same filter inline without `useMemo`, causing repeated object creation.

**Fix** (Dashboard.tsx):
```ts
const tripReceipts = useMemo(
  () => state.receipts.filter((r) => !r.tripId || r.tripId === trip.id),
  [state.receipts, trip.id]
);
```

---

### 11h. `syncMerge.ts` `mergePulledReceipts` does not check `notionPageId` for duplicates
**File**: `src/lib/syncMerge.ts`
**Line**: 22–46

If a local receipt has `id: 'receipt_A'` and `notionPageId: 'page_1'`, and Notion returns a page with `sourceId: ''` and `page.id: 'page_1'`, `receiptFromPage` generates `id: 'notion_page_1'`. `mergePulledReceipts` sees two different IDs and keeps both. The user now has two rows for the same Notion page.

**Fix**: Before adding a new remote receipt, check if any local receipt already has the same `notionPageId`:
```ts
const byPageId = new Map(state.receipts.filter(r => r.notionPageId).map(r => [r.notionPageId, r]));
for (const remoteReceipt of pulledReceipts) {
  if (remoteReceipt.notionPageId && byPageId.has(remoteReceipt.notionPageId)) {
    const local = byPageId.get(remoteReceipt.notionPageId)!;
    // merge into local.id, not remoteReceipt.id
    byId.set(local.id, /* merged */);
    continue;
  }
  // ...existing logic
}
```

---

## Summary Table

| # | Issue | Severity | File:Line |
|---|-------|----------|-----------|
| 1a | localStorage quota aborts IndexedDB write | **HIGH** | `storage.ts:98` |
| 1b | IndexedDB data overwritten by localStorage on load | **HIGH** | `useAppState.ts:39` |
| 2a | Remote fallback `itinerary: []` wipes local itinerary | **MEDIUM** | `syncMerge.ts:60` |
| 2b | Receipt stuck in `'syncing'` after mid-flight edit | **MEDIUM** | `useSyncEngine.ts:92` |
| 3a | Empty `sourceId` creates orphaned duplicate receipts | **MEDIUM** | `notion.ts:196` |
| 4a | Sync-queue ID collision risk | LOW | `useAppState.ts:13` |
| 5a | Category/payment exact-match failure → silent fallback | **HIGH** | `notion.ts:203–204` |
| 6a | `rateTable` ignored; non-JPY receipts use wrong rate | **HIGH** | `normalize.ts:84–85` |
| 6b | `exchangeRate` never read from Notion | **HIGH** | `notion.ts:184–225` |
| 7a | Person assignment by substring; breaks on rename | **MEDIUM** | `notion.ts:211` |
| 8a | No quota handling in `saveState` | **HIGH** | `storage.ts:98` |
| 9a | IndexedDB never wins on load | **HIGH** | `useAppState.ts:39` |
| 9b | IndexedDB write errors silent | MEDIUM | `storage.ts:99` |
| 10a | `loadState` catch skips `normalizeState` | **MEDIUM** | `storage.ts:91` |
| 10b | `customItinerary` lost when `trips` exists but lacks itinerary | **MEDIUM** | `normalize.ts:113–122` |
| 11a | `exportCsv` revokes blob before download | **MEDIUM** | `domain.ts:329` |
| 11b | Edited receipts keep stale `'synced'` status | **MEDIUM** | `useAppState.ts:60` |
| 11c | `tripJson` truncated at 144 KB → itinerary loss | **HIGH** | `notion.ts:100–103` |
| 11d | `Bar` animation re-triggers every render | LOW | `Stats.tsx:258` |
| 11e | `exchangeRate` not persisted in Notion schema | **HIGH** | `notion.ts:44` |
| 11f | `pull()` pending count stale due to `stateRef` | LOW | `useSyncEngine.ts:246` |
| 11g | Dashboard filter not memoized | LOW | `Dashboard.tsx:71` |
| 11h | Duplicate receipts by `notionPageId` not deduped | **MEDIUM** | `syncMerge.ts:22` |

---

## Recommended Priority Fixes

1. **Guard `localStorage.setItem` with `try/catch`** and ensure `saveIndexedState` always runs (`storage.ts`).
2. **Fix IndexedDB merge priority** so newer data wins (`useAppState.ts`).
3. **Protect `itinerary` from empty remote overwrite** in `mergePulledTrips` (`syncMerge.ts`).
4. **Normalize category/payment names** before lookup (`notion.ts`).
5. **Use `rateTable` for multi-currency conversion** and add `exchangeRate` to Notion schema (`normalize.ts`, `notion.ts`).
6. **Store `personId` explicitly** in Notion or use exact-match lookup (`notion.ts`).
7. **Reset `syncStatus` in conflict branch** of `applyReceiptSyncResult` (`useSyncEngine.ts`).
8. **Fix `exportCsv` blob revocation timing** (`domain.ts`).
9. **Add `exchangeRate` to Notion schema** so pulled receipts preserve historical rates (`notion.ts`).
10. **Memoize heavy Dashboard computations** to avoid recreating arrays on every render (`Dashboard.tsx`).
