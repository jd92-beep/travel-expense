# Milestone 1 Report: Offline Change Journal

## Status

**DONE**

## Git

- Base commit: `5861c3bac9b7e8705f10f88125789cdf33bac2bf`
- Head commit: `c0e39a1`
- Milestone commits: `07d5188 refactor: centralize compact change journal`; `c0e39a1 test: cover compact photo upload retry`
- Push/deploy: not performed

## Changed Files

- `app-compact/package.json`
- `app-compact/package-lock.json`
- `app-compact/src/lib/constants.ts`
- `app-compact/src/lib/changeJournal.ts`
- `app-compact/src/lib/useAppState.ts`
- `app-compact/src/lib/useSyncEngine.ts`
- `app-compact/src/lib/storage.ts`
- `app-compact/src/tabs/Settings.tsx`
- `app-compact/scripts/change-journal.test.ts`
- `app-compact/tests/offline-sync-smoke.spec.cjs`
- `app-compact/tests/sync-regression-smoke.spec.cjs`
- `HANDOVER.md`

This report remains uncommitted under `.superpowers/sdd/`. Existing dirty `AGENTS.md` and `CLAUDE.md` were not modified, staged, or reverted.

## Design And Scope

- Added pure `enqueueChange`, `settleChange`, and `restoreJournal` APIs. Queue identity is `type:entityId`, the journal is bounded at 500 entries, terminal evidence is preserved, and only `manual-retry` resets terminal state.
- `storage.normalizeState()` replaces only queue restore/status derivation with `restoreJournal`; storage keys, other normalization, and `AppState` remain unchanged.
- Photo retry settles the completed item before enqueueing its same-identity retry, so a success settlement cannot delete the retry.
- Version is `0.16.13` in the Compact package, lockfile root package, and `APP_VERSION`.
- The required Storage interruption regression is in `sync-regression-smoke.spec.cjs`, not `offline-sync-smoke.spec.cjs`: the offline fixture intentionally disables Supabase and aborts all remote traffic, so it cannot exercise `uploadReceiptPhoto`. The new test reuses the authenticated fake-Supabase route fixture, aborts the first real `storage/v1/object` request with `internetdisconnected`, serves the upserted trip/receipt back through pull, asserts one `receipt:upload-cut` journal identity, dispatches `online`, and observes the second upload.

## GitNexus

- Pre-edit impact: `normalizeState` was HIGH (2 direct callers and reaches `useAppState`/`App`); Boss explicitly authorized the limited `restoreJournal` replacement only.
- Final `node .gitnexus/run.cjs detect-changes -r travel-expense`: exit `0`, `Changes: 4 files, 9 symbols`, `Affected processes: 0`, `Risk level: low`. Its instruction-file findings are pre-existing dirty `AGENTS.md`/`CLAUDE.md`, outside staged scope.

## Test Commands And Results

| Command | Original result summary |
| --- | --- |
| `npm run test:change-journal` | Exit `0`: `change journal tests passed`. |
| `npm run typecheck` | Exit `0`: `tsc --noEmit` completed. |
| `npm run build` | Exit `0`: Vite transformed `2377` modules and printed `built in 2.11s`. |
| `npm run security:scan` | Exit `0`: `Secret scan passed`. |
| `npm run smoke:offline` | Exit `0`: `4 passed (11.3s)`. |
| `VITE_SUPABASE_URL=https://test-travel-expense.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa node scripts/run-with-dev-server.mjs -- npm exec -- playwright test tests/sync-regression-smoke.spec.cjs --workers=1 --browser=chromium --reporter=line -g "photo upload abort keeps one journal entry and retries after online"` | Exit `0`: focused authenticated Storage abort/identity/online-retry regression `1 passed (3.2s)`. |
| `PATH="$PWD/node_modules/.bin:$PATH" node scripts/run-with-dev-server.mjs -- playwright test tests/settings-smoke.spec.cjs --workers=1 --browser=chromium --reporter=line` | Exit `0`: required complete Settings command finished `10 passed (35.1s)`, `1 skipped`; PATH selects the project's local Playwright binary. |
| `npm run smoke:sync-regression` | Exit `0`: complete authenticated suite `8 passed (26.6s)`, including the new photo-abort regression. |
| `git diff --check` | Exit `0`, no output. |
| `node .gitnexus/run.cjs detect-changes -r travel-expense` | Exit `0`: final risk `low`, no affected process. |

## Not Run

- No required check remains unrun. No deployment, live-data, database/RLS, credential, or push command was run by scope.

## Self Review

- Confirmed the new browser case performs a real authenticated Supabase Storage upload request, not a synthetic invalid request.
- Confirmed the fixture's pull response preserves the server trip/receipt, so the assertion observes journal behavior instead of a deliberately empty authoritative pull purging local data.
- Confirmed it asserts first aborted upload, exactly one same identity before reconnect, and automatic second upload after `online`.
- Rechecked final staged diff, `git diff --check`, journal bounds, terminal/manual retry semantics, version alignment, and all required final gates.
- Only `HANDOVER.md` and `app-compact/tests/sync-regression-smoke.spec.cjs` were staged for the completion commit; existing dirty `AGENTS.md`, `CLAUDE.md`, and `.superpowers/` were left untouched.

## Review Remediation — 2026-07-23

### Status And Head

- Status: **DONE** — both Important findings and both related Minor findings are fixed and verified locally.
- Working head before remediation: `c0e39a1` on `main`; remediation code/test commit: `4e043b7 fix: preserve compact change journal retries`. No push or deploy was run.

### Fix Details

- `settleChange(queue, itemId, outcome)` keeps its three-argument contract. Completion/error outcomes can now carry `expectedUpdatedAt`; stale outcomes are no-ops when a same-identity enqueue has a newer queue revision.
- Queue `updatedAt` is now monotonic only on enqueue. `syncing`, retry, terminal-error, and manual-retry transitions no longer overwrite the content revision.
- A failed photo upload returns a retryable journal outcome for the existing receipt item. It no longer settles the ledger work as succeeded then recreates a new `attempts=0` change.
- Photo failures now reach durable `status=error, attempts=3`; manual retry is the only path that resets both journal attempts and an unsynced photo's local attempt counter.

### Changed Files

- `app-compact/src/lib/changeJournal.ts`
- `app-compact/src/lib/useSyncEngine.ts`
- `app-compact/scripts/change-journal.test.ts`
- `app-compact/tests/sync-regression-smoke.spec.cjs`
- `.superpowers/sdd/milestone-1-report.md`

### Regression Coverage

- Pure sequence: start A, enqueue newer A while syncing, settle the old success with its expected revision, and assert exactly one newer queued A remains.
- Pure sequence: three photo retryable failures produce terminal `attempts=3`; manual retry resets attempts and error.
- Pure sequence: duplicate enqueue after a terminal conflict preserves the terminal attempts and error.
- Browser flow: three real authenticated Storage aborts produce one terminal photo journal item; `手動重試` performs the fourth successful upload and clears the photo attempt counter.

### GitNexus

- Initial index was stale at `5861c3b`; `node .gitnexus/run.cjs analyze --index-only --workers 1 --worker-timeout 60` refreshed it to `c0e39a1` without touching `AGENTS.md` or `CLAUDE.md`.
- `settleChange` impact: LOW, 2 direct callers (`settleQueueItem`, `retryFailedItems`), no indexed execution flow.
- `enqueueChange` impact: CRITICAL, 9 direct callers and 4 affected processes. `processItem` impact: HIGH, 1 direct caller (`push`) and the `App` flow. The remediation is limited to their existing journal/sync contract and is covered by full Compact sync tests.
- Final `detect-changes`: HIGH, 14 symbols and 7 affected execution flows. It lists Boss-dirty `AGENTS.md` and `CLAUDE.md`; neither was modified, staged, or included in the task commit.

### Verification

| Command | Exit | Output |
| --- | --- | --- |
| `npm run test:change-journal` before fix | 1 | Expected red: old success removed the newer item (`0 !== 1`). |
| `npm run test:change-journal` | 0 | `change journal tests passed`. |
| Focused photo sync regression | 0 | `1 passed (19.1s)`: three aborts terminalize, manual retry uploads successfully. |
| `npm run typecheck` | 0 | `tsc --noEmit` completed. |
| `npm run build` | 0 | Vite transformed 2377 modules; built in 15.86s. |
| `npm run security:scan` | 0 | `Secret scan passed`. |
| `npm run smoke:sync-regression` | 0 | `8 passed (48.1s)`. |
| `npm run smoke:offline` | 0 | `4 passed (19.2s)`. |
| `git diff --check` | 0 | No output. |
| `node .gitnexus/run.cjs detect-changes -r /Users/tommy/Documents/Codex/travel-expense` | 0 | High impact as recorded above; expected task symbols only plus pre-existing dirty instruction files. |
| `git commit -m "fix: preserve compact change journal retries"` | 0 | Created `4e043b7` with the four code/test files and this report. |

### Self Review

- Read the brief, implementation report, and review report before changing code; reproduced the completion race before production edits.
- Confirmed status transitions preserve the content revision and that stale request outcomes cannot mutate or remove a newer queue item.
- Confirmed ledger-first receipt persistence remains in place while photo failure keeps the same journal identity and its retry history.
- Confirmed only the five files listed above belong to this remediation; Boss dirty `AGENTS.md`, `CLAUDE.md`, and the other untracked `.superpowers` reports remain outside staging.
