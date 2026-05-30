# Travel-Expense React App — QA Bug Report

> **Tester:** Kimi Code CLI (Sub-agent)
> **Scope:** Deep functional testing of auth, navigation, data entry, settings, weather, Notion sync, and memory leaks.
> **Date:** 2026-05-09

---

## 1. Auth & Unlock

### 🔴 CRITICAL — Boot-sync race condition on unlock
**File:** `src/App.tsx` (lines 38–55, 81–95)
**Description:** When the user successfully unlocks, `AuthGate` calls `onBrokerSession` (updates React state) **before** `onUnlocked`. The `useEffect` that triggers boot sync depends on `state.credentialSession`. Because state updates before `onUnlocked` runs, the effect fires while `bootSyncInitiated.current` is still `false`. It schedules a sync timer. Then `onUnlocked` also sets the ref and schedules **a second** timer. Both `pull()` or `sync()` can run concurrently, causing duplicate network requests and potential data corruption during merge.

**Repro:** Unlock with a valid broker session and observe console logs — `[App] Boot pull` and `[SyncEngine] push() started` appear twice.

**Fix:** Move `bootSyncInitiated.current = true` into the effect itself **before** checking dependencies, or dedupe with a ref guard inside the timer callback:
```tsx
const timer = window.setTimeout(() => {
  if (bootSyncInitiated.current) return; // added guard
  bootSyncInitiated.current = true;
  // ... pull / sync
}, 800);
```

---

### 🟠 HIGH — Refresh mid-unlock loses device trust
**File:** `src/security/AuthGate.tsx` (lines 25–48)
**Description:** `setDeviceTrust()` is only called **after** `unlockWithPassword` and `unlockCredentialBroker` complete. If the user refreshes the page during the async `unlockWithPassword` call (e.g., on a slow device), the password was already validated but trust was never persisted. The user must re-enter the password on next load.

**Fix:** Set device trust immediately after successful `unlockWithPassword`, before awaiting the broker:
```tsx
await unlockWithPassword(password);
setDeviceTrust(); // move here
// then broker unlock...
```

---

### 🟡 MEDIUM — localStorage cleared during active session
**File:** `src/security/deviceTrust.ts`
**Description:** If another tab or browser extension clears `localStorage` while the app is open, `hasDeviceTrust()` returns `false` on next render, but the app is already showing unlocked content. There is no listener for `storage` events to re-lock the app. The user can continue interacting with sensitive data even though trust was revoked.

**Fix:** Add a `window.addEventListener('storage', ...)` listener in `AuthGate` or `App` that re-checks `hasDeviceTrust()` and forces a lock if the key is removed.

---

### 🟡 MEDIUM — No retry / feedback for broker unlock failure
**File:** `src/security/AuthGate.tsx` (lines 31–38)
**Description:** If `unlockCredentialBroker` throws, the catch block silently logs to console and continues. The UI shows "解鎖" succeeded, but broker-backed features will mysteriously fail later. The user has no indication that the broker session is missing.

**Fix:** Surface a soft warning toast or status pill: "本地解鎖成功，但 broker session 未能建立；部份功能受限。"

---

## 2. Navigation

### 🟠 HIGH — Invalid / unknown tab IDs render blank screen
**File:** `src/App.tsx` (lines 100–125)
**Description:** The active tab is stored in React state (`useState<TabId>`). If `tab` is ever set to an invalid value (e.g., via a future bug, corrupted localStorage, or manual `window.postMessage`), the `Switch` renders nothing — a blank white content area with no error boundary catch.

**Fix:** Add a fallback:
```tsx
const validTabs: TabId[] = TAB_MANIFEST.map(t => t.id);
const safeTab = validTabs.includes(tab) ? tab : 'dashboard';
```

---

### 🟠 HIGH — Browser back/forward does not navigate tabs
**File:** `src/App.tsx`, `src/lib/tabs.ts`
**Description:** Tab changes are not synced to `window.location.hash` or History API. The browser back button does nothing (or leaves the PWA entirely). Users cannot share/bookmark a direct link to the Settings tab.

**Fix:** Sync `tab` to `location.hash` and listen to `hashchange`:
```tsx
useEffect(() => {
  const onHash = () => setTab((location.hash.slice(1) as TabId) || 'dashboard');
  window.addEventListener('hashchange', onHash);
  return () => window.removeEventListener('hashchange', onHash);
}, []);
```

---

### 🟡 MEDIUM — `lastTab` hydration can override programmatic tab changes
**File:** `src/App.tsx` (lines 32–36)
**Description:** The effect that restores `lastTab` runs whenever `state.lastTab` changes. If a parent or future feature updates `lastTab` programmatically while the user is on another tab, it forcibly switches them.

**Fix:** Use a `didHydrate` ref to ensure restoration only happens once on mount:
```tsx
const didHydrate = useRef(false);
useEffect(() => {
  if (!didHydrate.current && state.lastTab) {
    didHydrate.current = true;
    setTab(state.lastTab);
  }
}, [state.lastTab]);
```

---

## 3. Data Entry

### 🟠 HIGH — ReceiptEditor accepts negative and extremely large amounts
**File:** `src/components/ReceiptEditor.tsx` (lines 78–88)
**Description:** On save, `total: Number(draft.total) || 0` coerces negative strings (`-500`) to `-500`. There is no min/max validation. Extremely large values (e.g., `1e308`) can cause `Infinity`, breaking downstream calculations (budget percentage, settlement math).

**Fix:** Add validation before `onSave`:
```tsx
const total = Number(draft.total) || 0;
if (total < 0) { alert('金額不可為負數'); return; }
if (!Number.isFinite(total) || total > 1_000_000_000) { alert('金額超出範圍'); return; }
```

---

### 🟠 HIGH — Batch email image upload is all-or-nothing
**File:** `src/tabs/Scan.tsx` (lines 123–139)
**Description:** `handleEmailImages` loops with `await scanReceiptImage(file, ...)` inside a single `try/catch`. If the 3rd of 5 images fails OCR, the entire batch is lost — images 1 and 2 are never added to state.

**Fix:** Wrap the **individual** `scanReceiptImage` call in try/catch inside the loop, accumulating successes and failures separately.

---

### 🟠 HIGH — SpeechRecognition leak + state update on unmounted component
**File:** `src/tabs/Scan.tsx` (lines 94–107)
**Description:** `startSpeech()` creates a `SpeechRecognition` instance but never stores it in a ref or cleans it up. If the user switches tabs while recognition is active, `rec.onresult` / `rec.onerror` may call `setVoiceText` / `setStatus` on an unmounted `Scan` component. This causes React warnings and potential memory leaks.

**Fix:** Store the recognition instance in a ref and abort it in `useEffect` cleanup:
```tsx
const speechRef = useRef<SpeechRecognition | null>(null);
// ...
speechRef.current = rec;
rec.start();
// cleanup:
useEffect(() => () => speechRef.current?.abort(), []);
```

---

### 🟡 MEDIUM — No offline guard for manual Notion pull in Scan tab
**File:** `src/tabs/Scan.tsx` (lines 153–166)
**Description:** `handlePullPending` calls `pullAll(state)` without checking `navigator.onLine`. On flaky connections the fetch hangs until timeout, leaving the UI in "notion" busy state for a long time.

**Fix:** Add early return:
```tsx
if (!navigator.onLine) { setStatus('離線模式，無法拉取 Notion'); return; }
```

---

### 🟡 MEDIUM — Photo file name XSS / injection vector
**File:** `src/tabs/Scan.tsx` (lines 65–68), `src/components/ReceiptEditor.tsx`
**Description:** When OCR fails, the draft store is set to `file.name.replace(/\.[^.]+$/, '')`. File names can contain HTML/JS control characters (e.g., `<img src=x onerror=alert(1)>`). Although React escapes JSX by default, if this string is ever interpolated into `dangerouslySetInnerHTML` or a third-party library, it becomes an XSS vector.

**Fix:** Sanitize the filename:
```tsx
store: file.name.replace(/\.[^.]+$/, '').replace(/[<>&"']/g, '') || '掃描收據',
```

---

### 🟡 MEDIUM — FileReader in ReceiptEditor not aborted on unmount
**File:** `src/components/ReceiptEditor.tsx` (lines 55–70)
**Description:** `attachPhoto` creates a `FileReader` and awaits its promise. If the editor modal is closed (component unmounts) during the read, the promise resolver still fires and calls `setDraft` on an unmounted component.

**Fix:** Use an `AbortController`-like pattern or track mount status:
```tsx
let alive = true;
reader.onload = () => { if (alive) setDraft(...); };
return () => { alive = false; };
```

---

### 🟢 LOW — Currency converter allows non-numeric input without feedback
**File:** `src/tabs/Scan.tsx` (lines 38, 42–45)
**Description:** `amount` is a string. Inputting "abc" results in `Number(amount) || 0` → `0` with no user feedback. The user may think the conversion is broken rather than their input is invalid.

**Fix:** Visual shake or inline error when `!Number.isFinite(Number(amount))`.

---

## 4. Settings

### 🔴 CRITICAL — Import itinerary crashes on empty array
**File:** `src/tabs/Settings.tsx` (lines 299–325)
**Description:** `validateItinerary` accepts an empty array `[]` as valid. Then `importItinerary` accesses `result.itinerary[0].date` and `result.itinerary[result.itinerary.length - 1].date`, causing `Cannot read properties of undefined (reading 'date')` — a hard crash.

**Fix:** Reject empty arrays in `validateItinerary`:
```tsx
if (!input.length) return { ok: false, error: 'Itinerary 不可為空' };
```

---

### 🟠 HIGH — Exchange rate and budget inputs accept negative / zero / Infinity
**File:** `src/tabs/Settings.tsx` (lines 396, 417, 420)
**Description:** The rate input uses `Number(e.target.value) || 20.36`. This allows `-5`, `0`, `Infinity`, and `NaN` to be stored in state. While some consumers use `Math.max(0.1, ...)`, others do not, causing division-by-zero in budget calculations (`budget / rate`).

**Fix:** Clamp on input and validate:
```tsx
const val = Number(e.target.value);
const safe = Number.isFinite(val) && val > 0 ? val : 20.36;
updateState({ rate: safe });
```

---

### 🟠 HIGH — Import backup JSON performs no deep validation
**File:** `src/tabs/Settings.tsx` (lines 342–354)
**Description:** `importBackup` spreads `safePayload.receipts` directly into state without validating each receipt shape. A malicious or corrupted JSON with `receipts: [{ id: 123, total: 'hacked' }]` can crash downstream components that expect `total` to be a number (e.g., `reduce` sums, CSV export, settlement math).

**Fix:** Validate each imported receipt:
```tsx
const receipts = (safePayload.receipts || []).filter(r =>
  r && typeof r.id === 'string' && typeof r.store === 'string' && Number.isFinite(r.total)
);
```

---

### 🟡 MEDIUM — Clear local data does not clear all storage keys
**File:** `src/tabs/Settings.tsx` (line 656), `src/lib/useAppState.ts` (lines 97–100)
**Description:** `resetLocal` clears IndexedDB and resets state to `DEFAULT_STATE`, but it does **not** clear `localStorage` keys for device trust, credential session, or currency cache. After a "clear", the next unlock may still see an old broker session or stale weather cache.

**Fix:** Also clear relevant `localStorage` keys:
```tsx
localStorage.removeItem(TRUST_KEY);
localStorage.removeItem(BROKER_SESSION_KEY);
localStorage.removeItem(CURRENCY_CACHE_KEY);
```

---

### 🟡 MEDIUM — `window.confirm` is synchronous and blocking; no async cleanup
**File:** `src/tabs/Settings.tsx` (line 656)
**Description:** The clear-data button uses `window.confirm('確定清除 React 本地紀錄？') && onReset()`. While functional, `window.confirm` blocks the main thread. More importantly, if `onReset()` throws (e.g., IndexedDB locked), the error is unhandled.

**Fix:** Wrap in try/catch and use a non-blocking modal for better UX.

---

## 5. Weather

### 🟠 HIGH — Non-IANA timezone strings passed to Open-Meteo
**File:** `src/lib/weather.ts` (lines 199–203), `src/tabs/Weather.tsx`
**Description:** `normalizedTimezone` only maps `JST → Asia/Tokyo` and `HKT → Asia/Hong_Kong`. If a trip uses `KST`, `CST`, `PST`, or any other non-IANA abbreviation, it is passed verbatim to Open-Meteo's `timezone` query param. Open-Meteo returns an error or falls back to `auto`, which may use the wrong timezone for the requested location.

**Fix:** Maintain a larger timezone map or validate with `Intl.DateTimeFormat` before sending:
```tsx
try {
  new Intl.DateTimeFormat('en', { timeZone: zone }).format(new Date());
} catch { zone = 'auto'; }
```

---

### 🟡 MEDIUM — `weatherCacheKey` generates useless key for NaN coordinates
**File:** `src/lib/weather.ts` (lines 84–86)
**Description:** When no coordinates are found, `coordsForDay` returns `{ lat: NaN, lon: NaN }`. `weatherCacheKey` calls `coord.lat.toFixed(3)` which produces the string `"NaN"`. The cache key becomes `wx_react_v2_NaN_NaN`. All location-less days share this same key, so a cached failure for Tokyo overwrites the cache for Osaka.

**Fix:** Skip caching when `!Number.isFinite(coord.lat)`:
```tsx
if (!Number.isFinite(coord.lat)) return null; // skip cache
```

---

### 🟡 MEDIUM — Weather API failure for one coord swallows all other days
**File:** `src/tabs/Weather.tsx` (lines 61–84)
**Description:** The outer `load()` function has a `try/catch` around the entire loop. If the first day throws (e.g., network error), no other days are fetched, and the UI shows a single generic error toast.

**Fix:** Remove the outer try/catch or make it non-fatal. Errors for individual days should be captured per-day (the inner `try/catch` already does this). The outer catch is redundant and harmful.

---

### 🟢 LOW — `liveSlotHour` silently returns null for invalid timezones
**File:** `src/tabs/Weather.tsx` (lines 179–197)
**Description:** If `normalizedTimezone` returns an invalid IANA string, `liveSlotHour` catches the `Intl.DateTimeFormat` error and returns `null`. This is graceful, but the "LIVE" badge is never shown, and there is no user-facing indication that the timezone is wrong.

**Fix:** Log a console warning or show a muted hint in the UI.

---

## 6. Notion Sync

### 🔴 CRITICAL — Sync queue items dropped forever after 3 failed attempts
**File:** `src/lib/useSyncEngine.ts` (lines 26–33, 192–207)
**Description:** `dedupeQueue` filters out items where `attempts >= MAX_RETRY_ATTEMPTS` (3). `push()` calls `dedupeQueue` at the end and writes the result back to state. Items that fail 3 times are **silently removed** from the queue. If the failure was due to a temporary broker session expiry, those receipts are never synced to Notion, and the user is never warned that data was lost.

**Fix:** Do **not** drop max-retry items from the queue. Instead, mark them `status: 'error'` and surface a persistent banner: "X 筆紀錄未能同步，請檢查連線後手動重試。"

---

### 🟠 HIGH — Conflicting edits can overwrite local changes due to timestamp ambiguity
**File:** `src/lib/useSyncEngine.ts` (lines 85–102), `src/lib/syncMerge.ts` (lines 22–45)
**Description:** Both `applyReceiptSyncResult` and `mergePulledReceipts` use `updatedAt` timestamps to resolve conflicts. If a receipt has `updatedAt: undefined` (common for receipts created before this field was added), both local and remote timestamps evaluate to `0`. The logic `currentUpdatedAt > queueUpdatedAt` is `false` (0 > 0), so the local version is overwritten even if it was edited more recently. The `createdAt` fallback is used in `syncMerge.ts`, but not consistently in `applyReceiptSyncResult`.

**Fix:** Use a more robust conflict heuristic:
```tsx
const localUpdated = Number(local.updatedAt || local.createdAt || Date.now());
const remoteUpdated = Number(remote.updatedAt || remote.createdAt || 0);
```
And ensure `applyReceiptSyncResult` also falls back to `createdAt`.

---

### 🟠 HIGH — `syncingRef` / `processingRef` not reset on component unmount
**File:** `src/lib/useSyncEngine.ts` (lines 43–47, 169–214, 262–285)
**Description:** If `App` unmounts while a sync is in flight, `syncingRef.current` and `processingRef.current` remain `true`. If the component remounts (e.g., in a Strict Mode double-mount or a navigation system), the sync engine believes it is still busy and refuses to run again.

**Fix:** Add a `useEffect` cleanup:
```tsx
useEffect(() => {
  return () => {
    processingRef.current = false;
    syncingRef.current = false;
  };
}, []);
```

---

### 🟡 MEDIUM — `yieldToStateFlush` uses `setTimeout(..., 0)` without cleanup
**File:** `src/lib/useSyncEngine.ts` (lines 134–136)
**Description:** `yieldToStateFlush` returns a promise that resolves after a `setTimeout(..., 0)`. If the component unmounts between `await yieldToStateFlush()` and the timer firing, the promise resolves but any subsequent code (e.g., `settlePushStatus`) may run after unmount.

**Fix:** While low impact because the refs guard against state updates, it is cleaner to track mount status:
```tsx
const aliveRef = useRef(true);
useEffect(() => () => { aliveRef.current = false; }, []);
```

---

### 🟡 MEDIUM — Broker session expiry mid-push is not distinguished from permanent failure
**File:** `src/lib/useSyncEngine.ts` (lines 138–167)
**Description:** If the broker session expires while items are being pushed, `processItem` throws a generic "session 未連線" error. The item is marked as failed and retried. After 3 retries it is dropped (see Critical bug above). The engine does not detect "auth expired" as a special case to pause the queue.

**Fix:** Detect auth errors (401 / session expired message) and immediately pause the queue with `status: 'auth-expired'`, prompting the user to re-unlock.

---

## 7. Memory Leaks

### 🟠 HIGH — `NumberTicker` spring listener never unsubscribed
**File:** `src/components/ui/number-ticker.tsx` (lines 66–73)
**Description:** `springValue.on("change", ...)` registers a listener but the return value (unsubscribe function) is never stored or called. Every time the component re-renders with different dependencies, a new listener is added. Over time, the listener count grows, and all listeners mutate the same DOM `textContent`.

**Fix:** Store and call the unsubscribe:
```tsx
useEffect(() => {
  const unsub = springValue.on("change", (latest) => { ... });
  return () => unsub();
}, [springValue, ...]);
```

---

### 🟠 HIGH — `HyperText` `setTimeout` inside IntersectionObserver not cleaned up
**File:** `src/components/ui/hyper-text.tsx` (lines 106–114)
**Description:** When `startOnView` is true and the element enters the viewport, an `IntersectionObserver` schedules `setTimeout(() => setIsAnimating(true), delay)`. If the element leaves the viewport before the delay expires, the timeout is never cleared. On unmount, `setIsAnimating` fires on an unmounted component.

**Fix:** Store the timeout ID and clear it in the cleanup:
```tsx
let timeoutId: ReturnType<typeof setTimeout> | null = null;
// ...
if (entry.isIntersecting) {
  timeoutId = setTimeout(() => setIsAnimating(true), delay);
}
// cleanup:
return () => {
  if (timeoutId) clearTimeout(timeoutId);
  observer.disconnect();
};
```

---

### 🟡 MEDIUM — `SparklesText` interval recreates stars on every prop change
**File:** `src/components/ui/sparkles-text.tsx` (lines 96–129)
**Description:** The `useEffect` dependency array includes `colors.first`, `colors.second`, and `sparklesCount`. Any color change clears the interval and creates a new one, but the old `Sparkle` motion components with `repeat: Infinity` may not be garbage-collected immediately by Framer Motion, causing a temporary memory spike.

**Fix:** This is mostly a Framer Motion concern, but the component should memoize `colors` object to avoid unnecessary effect restarts.

---

### 🟡 MEDIUM — `MagicCard`, `PulsatingButton`, `RetroGrid` have complex observer trees
**File:** `src/components/ui/magic-card.tsx`, `pulsating-button.tsx`, `retro-grid.tsx`
**Description:** These components use `MutationObserver`, `IntersectionObserver`, and many event listeners. While most have cleanup functions, `RetroGrid` in particular creates a WebGL context and canvas. If the canvas is removed from the DOM without calling `loseContext()`, the GPU memory may not be reclaimed immediately.

**Fix:** In `RetroGrid` cleanup, explicitly call:
```tsx
const gl = canvas.getContext('webgl');
gl?.getExtension('WEBGL_lose_context')?.loseContext();
```

---

### 🟢 LOW — `RippleButton` timeout only removes the last ripple
**File:** `src/components/ui/ripple-button.tsx` (lines 49–70)
**Description:** The effect only schedules removal for `buttonRipples[buttonRipples.length - 1]`. If two clicks happen in rapid succession, the first ripple may never be cleaned up from state.

**Fix:** Use a `Map` of timeouts keyed by ripple key, or schedule removal when creating each ripple:
```tsx
const createRipple = (...) => {
  const key = Date.now();
  setButtonRipples(prev => [...prev, { ..., key }]);
  setTimeout(() => {
    setButtonRipples(prev => prev.filter(r => r.key !== key));
  }, parseInt(duration));
};
```

---

## Appendix: Edge-Case Cheat Sheet

| Scenario | Expected | Actual | Severity |
|---|---|---|---|
| localStorage cleared while app is open | App re-locks | App stays unlocked | Medium |
| Refresh during `unlockCredentialBroker` | Trust persisted on next load | Must re-enter password | High |
| Browser Back button pressed | Previous tab shown | Nothing / app exits | High |
| Direct URL to `#settings` tab | Settings opens | No support | High |
| Submit receipt with `-100` | Validation error | Saves negative amount | High |
| Submit receipt with `1e308` | Validation error | Saves `Infinity`, breaks math | High |
| Upload 5 email images, 3rd OCR fails | 2 saved, 3 flagged | All 5 lost | High |
| Import empty `[]` itinerary JSON | Validation error | Hard crash | Critical |
| Import backup with `total: "abc"` | Validation error | Corrupts state, crashes later | High |
| Set rate to `0` | Validation error | Division by zero in budget | High |
| Weather timezone = `KST` | Seoul weather | Open-Meteo may fail / use auto | High |
| Broker session expires during sync | Queue paused | Items retried 3×, then dropped | Critical |
| Local receipt edited while sync in flight | Local wins if newer | May lose if `updatedAt` is 0 | High |
| Component unmounts during speech | Clean abort | State update on unmounted component | High |
| NumberTicker unmounts | Listeners removed | Listener leaks | High |

---

*End of Report*
