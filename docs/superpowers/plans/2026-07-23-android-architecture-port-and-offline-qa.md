# Android Architecture Port And Offline QA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the four verified architecture milestones to the isolated Android worktree and prove deterministic offline recovery, duplicate suppression, mirror failure isolation, and Kimi K3 routing on native Android.

**Architecture:** Port only after all four main milestones are green. Copy pure modules and tests exactly from `origin/main`, then adapt Android callers around native reachability and Capacitor without merging branches; every milestone gets its own Android patch/versionCode/commit.

**Tech Stack:** React 19, TypeScript 5.8, Capacitor 8, Android Gradle, adb, Android WebView CDP, Node 22, Playwright

## Global Constraints

- Main source: `/Users/tommy/Documents/Codex/travel-expense` on `origin/main`.
- Android target: `/Users/tommy/Documents/Codex/travel-expense-android-shell` on `codex/admin-console-1.0-android`.
- Do not merge, rebase, or cherry-pick `main` into the Android branch.
- Preserve Android native reachability, Capacitor imports, Kimi K3 selector exposure, package ID, signing setup, and deep links.
- Preserve storage keys, `AppState`, queue identity, 500-item bound, terminal sync evidence, and ledger-first semantics.
- Do not create a release APK/AAB; debug APK and emulator/device QA only.
- Do not bypass login or place credentials in files, commands, logs, screenshots, or commits.
- Each port commit bumps `package.json`, lockfile root metadata, `APP_VERSION`, `versionName`, and monotonic `versionCode`.
- Keep all unrelated work in both worktrees unstaged.

## Execution Order

```text
Main 0.16.13 Change Journal green
  -> Main 0.16.14 Scoped Hydration green
  -> Main 0.16.15 Shared-trip Notion Outbox green
  -> Main 0.16.16 Provider Catalog green
  -> Android 0.20.1 / 2001 Change Journal
  -> Android 0.20.2 / 2002 Scoped Hydration
  -> Android 0.20.3 / 2003 Shared-trip Notion Outbox
  -> Android 0.20.4 / 2004 Provider Catalog and native extreme QA
```

---

### Task 1: Port Offline Change Journal as Android 0.20.1

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
- Modify: `app-compact/tests/offline-sync-smoke.spec.cjs`
- Create: `app-compact/tests/sync-regression-smoke.spec.cjs`
- Modify: `app-compact/android/app/build.gradle`
- Modify: `HANDOVER.md`

**Interfaces:**
- Consumes: the verified main `enqueueChange`, `settleChange`, and `restoreJournal` implementation.
- Produces: the same interface on Android while preserving native reachability checks in `useSyncEngine`.

- [ ] **Step 1: Confirm both immutable starting points**

Run:

```bash
git -C /Users/tommy/Documents/Codex/travel-expense fetch origin
git -C /Users/tommy/Documents/Codex/travel-expense log origin/main -4 --oneline
git -C /Users/tommy/Documents/Codex/travel-expense-android-shell status --short --branch
git -C /Users/tommy/Documents/Codex/travel-expense-android-shell log -1 --oneline
```

Expected: `origin/main` contains all four named architecture commits; Android is clean at `1c03a9b` or a documented successor on `codex/admin-console-1.0-android`.

- [ ] **Step 2: Refresh Android GitNexus and record impacts**

Run from the Android worktree:

```bash
node .gitnexus/run.cjs status
node .gitnexus/run.cjs analyze
node .gitnexus/run.cjs impact enqueueSyncItem --direction upstream
node .gitnexus/run.cjs impact retryFailedItems --direction upstream
node .gitnexus/run.cjs impact normalizeState --direction upstream
```

Expected: the Android branch is indexed and native sync callers appear. Stop and notify Boss before edits if risk is HIGH or CRITICAL.

- [ ] **Step 3: Copy only the verified pure module and test**

Inspect the exact main files:

```bash
git -C /Users/tommy/Documents/Codex/travel-expense show origin/main:app-compact/src/lib/changeJournal.ts
git -C /Users/tommy/Documents/Codex/travel-expense show origin/main:app-compact/scripts/change-journal.test.ts
```

Create the same two files in the Android worktree with `apply_patch`. Add:

```json
"test:change-journal": "node --experimental-strip-types scripts/change-journal.test.ts",
"smoke:sync-regression": "VITE_SUPABASE_URL=https://test-travel-expense.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa node scripts/run-with-dev-server.mjs -- playwright test tests/sync-regression-smoke.spec.cjs --workers=1 --browser=chromium --reporter=line"
```

The Android branch does not currently contain the sync-regression spec. Inspect and create the verified main file with `apply_patch`:

```bash
git -C /Users/tommy/Documents/Codex/travel-expense show origin/main:app-compact/tests/sync-regression-smoke.spec.cjs
```

Run:

```bash
cd app-compact
npm run test:change-journal
```

Expected: `change journal tests passed`.

- [ ] **Step 4: Integrate callers without overwriting native reachability**

Use:

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

Use `settleChange` for `syncing`, success, retryable error, terminal error, and manual retry. Use `restoreJournal` in `normalizeState`.

Before editing each Android integration file, compare it with main:

```bash
git diff --no-index /Users/tommy/Documents/Codex/travel-expense/app-compact/src/lib/useSyncEngine.ts app-compact/src/lib/useSyncEngine.ts
git diff --no-index /Users/tommy/Documents/Codex/travel-expense/app-compact/src/lib/useAppState.ts app-compact/src/lib/useAppState.ts
```

Keep Android's `useNativeNetworkStatus`/Capacitor path and patch queue calls only.

- [ ] **Step 5: Bump, verify, commit, and push**

Set:

```text
package/lock/APP_VERSION    0.20.1
versionName                0.20.1
versionCode                2001
```

Run:

```bash
npm run test:change-journal
npm run typecheck
npm run build
npm run security:scan
npm run smoke:offline
npm run smoke:sync-regression
npm run smoke:settings
npm run android:debug
cd ..
node .gitnexus/run.cjs detect-changes
git diff --check
git add app-compact/package.json app-compact/package-lock.json app-compact/src/lib/constants.ts app-compact/src/lib/changeJournal.ts app-compact/src/lib/useAppState.ts app-compact/src/lib/useSyncEngine.ts app-compact/src/lib/storage.ts app-compact/src/tabs/Settings.tsx app-compact/scripts/change-journal.test.ts app-compact/tests/offline-sync-smoke.spec.cjs app-compact/tests/sync-regression-smoke.spec.cjs app-compact/android/app/build.gradle HANDOVER.md
git diff --cached --check
git status --short
git commit -m "refactor(android): centralize change journal v0.20.1"
git push origin codex/admin-console-1.0-android
```

Expected: focused tests, build, smokes, and debug APK pass; staged diff contains only Android milestone files; push succeeds.

---

### Task 2: Port Scoped Hydration as Android 0.20.2

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
- Modify: `app-compact/android/app/build.gradle`
- Modify: `HANDOVER.md`

**Interfaces:**
- Consumes: verified main `hydrateScope` and `persistScope`.
- Produces: one Android canonical `AppState` per Account Scope with unchanged localStorage/IndexedDB keys.

- [ ] **Step 1: Record impacts**

```bash
node .gitnexus/run.cjs impact useAppState --direction upstream
node .gitnexus/run.cjs impact loadState --direction upstream
node .gitnexus/run.cjs impact saveState --direction upstream
```

Expected: Android session and persistence flows are listed. Stop before edits for HIGH or CRITICAL risk.

- [ ] **Step 2: Copy the verified pure module/test and run red-green**

Inspect:

```bash
git -C /Users/tommy/Documents/Codex/travel-expense show origin/main:app-compact/src/lib/scopedPersistence.ts
git -C /Users/tommy/Documents/Codex/travel-expense show origin/main:app-compact/scripts/scoped-persistence.test.ts
```

Create them exactly with `apply_patch`, add:

```json
"test:scoped-persistence": "node --experimental-strip-types scripts/scoped-persistence.test.ts"
```

Run:

```bash
npm run test:scoped-persistence
```

Expected: `scoped persistence tests passed`.

- [ ] **Step 3: Patch Android storage and lifecycle**

Expose the same local-only operations:

```ts
export function loadStoredSnapshot(scope?: string): unknown | null
export function saveStoredSnapshot(state: AppState, scope?: string): void
```

Replace `useAppState` arbitration with:

```ts
void hydrateScope(storageScope, userEmail).then((hydrated) => {
  if (!alive) return;
  setState(hydrated);
  setHydratedScope(storageScope);
  setIndexedReadyScope(storageScope);
});
```

Persist with:

```ts
void persistScope(storageScope, userEmail, state).then((result) => {
  if (result.status !== 'succeeded') {
    console.warn('[useAppState] Persist degraded:', result.error);
  }
});
```

Preserve Android's native device cleanup and secure-session behavior unchanged.

- [ ] **Step 4: Bump, verify, commit, and push**

Set `0.20.2`, `versionName "0.20.2"`, and `versionCode 2002`.

```bash
npm run test:change-journal
npm run test:scoped-persistence
npm run typecheck
npm run build
npm run security:scan
npm run smoke:session
npm run smoke:security
npm run smoke:offline
npm run smoke:sync-regression
npm run android:debug
cd ..
node .gitnexus/run.cjs detect-changes
git diff --check
git add app-compact/package.json app-compact/package-lock.json app-compact/src/lib/constants.ts app-compact/src/lib/scopedPersistence.ts app-compact/src/lib/storage.ts app-compact/src/storage/indexedDb.ts app-compact/src/lib/useAppState.ts app-compact/src/tabs/Settings.tsx app-compact/scripts/scoped-persistence.test.ts app-compact/tests/session-persistence-smoke.spec.cjs app-compact/tests/security-smoke.spec.cjs app-compact/android/app/build.gradle HANDOVER.md
git diff --cached --check
git commit -m "refactor(android): centralize scoped hydration v0.20.2"
git push origin codex/admin-console-1.0-android
```

Expected: no Account Scope leakage or secret persistence; debug APK and all gates pass.

---

### Task 3: Port Shared-trip Notion Outbox as Android 0.20.3

**Files:**
- Create: `app-compact/src/lib/sharedTripNotionOutbox.ts`
- Create: `app-compact/scripts/shared-trip-notion-outbox.test.ts`
- Modify: `app-compact/package.json`
- Modify: `app-compact/package-lock.json`
- Modify: `app-compact/src/lib/constants.ts`
- Modify: `app-compact/src/lib/supabase.ts`
- Modify: `app-compact/src/lib/useSyncEngine.ts`
- Modify: `app-compact/tests/supabase-notion-mirror-smoke.spec.cjs`
- Modify: `app-compact/android/app/build.gradle`
- Modify: `HANDOVER.md`

**Interfaces:**
- Consumes: verified main `drainSharedTripOutbox(context, adapters)`.
- Produces: Android shared-trip mirror orchestration with the same 5 x 20 drain ceiling.

- [ ] **Step 1: Record impacts and copy pure flow**

```bash
node .gitnexus/run.cjs impact drainSharedTripNotionOutbox --direction upstream
git -C /Users/tommy/Documents/Codex/travel-expense show origin/main:app-compact/src/lib/sharedTripNotionOutbox.ts
git -C /Users/tommy/Documents/Codex/travel-expense show origin/main:app-compact/scripts/shared-trip-notion-outbox.test.ts
```

Expected: one Android sync caller; stop for HIGH or CRITICAL risk. Create both files exactly with `apply_patch`.

- [ ] **Step 2: Add the test command and verify the pure flow**

```json
"test:shared-trip-outbox": "node --experimental-strip-types scripts/shared-trip-notion-outbox.test.ts"
```

Run:

```bash
npm run test:shared-trip-outbox
```

Expected: `shared trip Notion outbox tests passed`, including continue-after-failure and completion-failure cases.

- [ ] **Step 3: Port only Supabase/Notion adapter changes**

Export:

```ts
createSharedTripOutboxSupabaseAdapter(
  session: Session,
  state: AppState,
): SharedTripOutboxAdapters['supabase']
```

Call:

```ts
await drainSharedTripOutbox({
  state: stateRef.current,
  tripIds,
  workerId: cloudSession.user.id,
}, {
  supabase: createSharedTripOutboxSupabaseAdapter(cloudSession, stateRef.current),
  notion: {
    async upsert(notionState, receipt) { await pushReceipt(notionState, receipt); },
    archive: archiveReceipt,
  },
});
```

Preserve Android's native reachability guard around the drain. Keep signed-photo TTL, 6 MB cap, and best-effort photo failure exactly unchanged.

- [ ] **Step 4: Bump, verify, commit, and push**

Set `0.20.3`, `versionName "0.20.3"`, and `versionCode 2003`.

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
npm run android:debug
cd ..
node scripts/verify-shared-ledger-contract.mjs
node .gitnexus/run.cjs detect-changes
git diff --check
git add app-compact/package.json app-compact/package-lock.json app-compact/src/lib/constants.ts app-compact/src/lib/sharedTripNotionOutbox.ts app-compact/src/lib/supabase.ts app-compact/src/lib/useSyncEngine.ts app-compact/scripts/shared-trip-notion-outbox.test.ts app-compact/tests/supabase-notion-mirror-smoke.spec.cjs app-compact/android/app/build.gradle HANDOVER.md
git diff --cached --check
git commit -m "refactor(android): isolate shared trip outbox v0.20.3"
git push origin codex/admin-console-1.0-android
```

Expected: ledger and mirror tests pass; any unchanged known fixture failure is recorded verbatim and never bypassed.

---

### Task 4: Port Provider Catalog and add native extreme recovery QA as Android 0.20.4

**Files:**
- Create: `contracts/ai-provider-catalog.json`
- Create: `app-compact/src/lib/providerCatalog.ts`
- Modify: `app-compact/package.json`
- Modify: `app-compact/package-lock.json`
- Modify: `app-compact/src/lib/constants.ts`
- Modify: `app-compact/scripts/android-qa-smoke.mjs`
- Modify: `app-compact/tests/ai-routing-smoke.spec.cjs`
- Modify: `app-compact/android/app/build.gradle`
- Modify: `HANDOVER.md`

**Interfaces:**
- Consumes: root provider catalog and Android surface records.
- Produces: Android `AI_MODELS` including K3 plus a deterministic adb/CDP offline-recovery command.

- [ ] **Step 1: Copy the secret-free catalog and add the Android adapter**

Inspect the verified catalog:

```bash
git -C /Users/tommy/Documents/Codex/travel-expense show origin/main:contracts/ai-provider-catalog.json
```

Create the same root JSON in the Android worktree. Create:

```ts
import catalog from '../../../contracts/ai-provider-catalog.json';

export const ANDROID_AI_MODELS = catalog.providers
  .flatMap((provider) => provider.models)
  .filter((model) => model.surfaces.includes('android'))
  .map((model) => ({ id: model.id, name: model.label }));
```

In constants:

```ts
import { ANDROID_AI_MODELS } from './providerCatalog';
export const AI_MODELS = ANDROID_AI_MODELS;
```

Assert in `ai-routing-smoke.spec.cjs`:

```js
expect(modelIds).toContain('volcano/kimi-k3');
expect(modelIds.filter((id) => id === 'volcano/kimi-k3')).toHaveLength(1);
```

- [ ] **Step 2: Add a deterministic native offline recovery script**

Add:

```json
"android:qa:offline": "node scripts/run-with-android-jdk.mjs --npm-script android:qa:offline:raw",
"android:qa:offline:raw": "node scripts/android-qa-smoke.mjs --offline-recovery"
```

Add `const offlineRecovery = process.argv.includes('--offline-recovery')` to the existing `android-qa-smoke.mjs`, then reuse its adb device discovery, WebView CDP, install, restart, and logcat helpers. The scenario must perform these exact actions:

```js
await cdpEvaluate(`
  localStorage.setItem('boss-japan-tracker', JSON.stringify({
    ...JSON.parse(localStorage.getItem('boss-japan-tracker')),
    autoSync: true,
    syncQueue: []
  }))
`);
adb(serial, ['shell', 'svc', 'wifi', 'disable']);
adb(serial, ['shell', 'svc', 'data', 'disable']);
await cdpEvaluate(`window.dispatchEvent(new Event('offline'))`);
```

Inject one interrupted in-flight entry and one terminal conflict, force-stop/restart, then assert:

```js
await cdpEvaluate(`
  (() => {
    const state = JSON.parse(localStorage.getItem('boss-japan-tracker'));
    state.syncQueue = [
      {
        id: 'sync-upload-cut',
        type: 'receipt',
        entityId: 'upload-cut',
        op: 'update',
        status: 'syncing',
        attempts: 1,
        createdAt: 1,
        updatedAt: 2
      },
      {
        id: 'sync-conflict',
        type: 'receipt',
        entityId: 'conflict',
        op: 'update',
        status: 'error',
        attempts: 3,
        error: '40001 version conflict',
        createdAt: 1,
        updatedAt: 2
      }
    ];
    localStorage.setItem('boss-japan-tracker', JSON.stringify(state));
    return true;
  })()
`);
adb(serial, ['shell', 'am', 'force-stop', packageName]);
adb(serial, ['shell', 'am', 'start', '-W', '-n', `${packageName}/.MainActivity`]);
const restartedPage = await waitForWebViewPage(serial);
const restored = await cdpEvaluate(restartedPage.webSocketDebuggerUrl, `
  JSON.parse(localStorage.getItem('boss-japan-tracker')).syncQueue
`);
assert.equal(restored.find((item) => item.entityId === 'upload-cut').status, 'queued');
assert.equal(restored.find((item) => item.entityId === 'conflict').status, 'error');
assert.equal(restored.find((item) => item.entityId === 'conflict').attempts, 3);
```

Reconnect and dispatch native/browser reachability:

```js
adb(serial, ['shell', 'svc', 'wifi', 'enable']);
adb(serial, ['shell', 'svc', 'data', 'enable']);
await waitForNetwork(serial, 30_000);
await cdpEvaluate(`window.dispatchEvent(new Event('online'))`);
```

Assert the app process remains alive, the queue contains no duplicate identity, terminal evidence remains, and logcat has none of:

```js
const fatalPatterns = [
  /FATAL EXCEPTION/i,
  /ANR in com\.ftjdfr\.travelexpensecompact/i,
  /Uncaught (?:TypeError|ReferenceError)/i,
];
```

Wrap network toggles in `try/finally` so Wi-Fi and mobile data are always re-enabled even after a failed assertion.

- [ ] **Step 3: Extend existing Android QA without requiring credentials**

Run the offline scenario inside `android-qa-smoke.mjs` after install/start and before final logcat collection:

```js
if (offlineRecovery) {
  await runOfflineRecoveryScenario({ serial, packageName, cdpEvaluate });
}
```

The Node Change Journal and Playwright offline smokes prove duplicate enqueue and interrupted upload behavior. This native gate proves Android lifecycle and cold-open recovery. Neither claims a production backend write.

After `dumpsys package`, assert the installed build:

```js
const packageInfo = adb(serial, ['shell', 'dumpsys', 'package', packageName]);
assert.match(packageInfo, /versionCode=2004\b/);
assert.match(packageInfo, /versionName=0\.20\.4\b/);
```

- [ ] **Step 4: Run the authenticated backend recovery gate when a real session exists**

With Boss's already-authenticated emulator/device session, do not inject credentials. Start a real Receipt photo upload, disable connectivity during the request, then reconnect:

```bash
adb -s "$ANDROID_SERIAL" shell svc wifi disable
adb -s "$ANDROID_SERIAL" shell svc data disable
adb -s "$ANDROID_SERIAL" shell svc wifi enable
adb -s "$ANDROID_SERIAL" shell svc data enable
```

Acceptance evidence:

```text
1. The Receipt remains visible locally with exactly one type+entityId queue entry.
2. Reconnect triggers automatic retry without pressing manual retry.
3. Supabase contains exactly one Receipt row for the SourceID.
4. A failed Notion mirror does not remove the Supabase row.
5. Re-running sync does not create a duplicate Receipt or duplicate queue entry.
6. An exhausted/version-conflict entry remains visible until manual retry.
7. Logcat contains no fatal exception, ANR, uncaught JS error, token, or credential.
```

If no authenticated session is available, record this gate as pending and keep Open Items 5 and 17 open. Never bypass authentication to turn it green.

- [ ] **Step 5: Bump and run the complete Android matrix**

Set `0.20.4`, `versionName "0.20.4"`, and `versionCode 2004`.

```bash
npm run test:change-journal
npm run test:scoped-persistence
npm run test:shared-trip-outbox
npm run test:split-engine
npm run test:notion-split-meta
npm run typecheck
npm run build
npm run security:scan
npm run smoke:offline
npm run smoke:sync-regression
npm run smoke:session
npm run smoke:security
npm run smoke:supabase-notion-mirror
npm run smoke:settings
npm run smoke:ai-routing
npm run smoke:android-broker-origin
npm run smoke:mobile-layout
npm run android:debug
npm run android:qa:offline
npm run android:qa
cd ..
node .gitnexus/run.cjs detect-changes
git diff --check
```

Expected: all deterministic tests pass; APK reports `versionName 0.20.4` and `versionCode 2004`; K3 is present once; network is restored after QA.

- [ ] **Step 6: Commit and push Android 0.20.4**

```bash
git add contracts/ai-provider-catalog.json app-compact/package.json app-compact/package-lock.json app-compact/src/lib/constants.ts app-compact/src/lib/providerCatalog.ts app-compact/scripts/android-qa-smoke.mjs app-compact/tests/ai-routing-smoke.spec.cjs app-compact/android/app/build.gradle HANDOVER.md
git diff --cached --check
git status --short
git commit -m "test(android): harden offline recovery v0.20.4"
git push origin codex/admin-console-1.0-android
git log origin/codex/admin-console-1.0-android -4 --oneline
```

Expected: four ordered Android architecture commits are visible on the remote branch.

---

### Task 5: Reconcile the main handover after Android proof

**Files:**
- Modify in main worktree: `HANDOVER.md`

**Interfaces:**
- Consumes: exact Android branch commit IDs and gate outputs.
- Produces: one live continuation record on `main`.

- [ ] **Step 1: Update current facts without copying Android code to main**

In `/Users/tommy/Documents/Codex/travel-expense/HANDOVER.md`:

```text
- Set Android app version to 0.20.4 and versionCode 2004.
- Record Android branch HEAD and latest app-code commit separately.
- Mark Open Item 18 complete only when all deterministic main and Android gates pass.
- Keep authenticated backend/mirror/K3 click items open unless their real-session evidence exists.
```

- [ ] **Step 2: Verify, commit, and push the docs-only reconciliation**

```bash
cd /Users/tommy/Documents/Codex/travel-expense
git fetch origin
git diff --check
node scripts/security-scan.mjs
git add HANDOVER.md
git diff --cached --check
git status --short
git commit -m "docs: record Android architecture port"
git push origin main
```

Expected: only `HANDOVER.md` is committed; Boss's unrelated `CLAUDE.md` remains unstaged; `origin/main` records exact evidence without claiming unavailable authenticated proof.
