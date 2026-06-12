# Agent Handover

## Last Worked On
- **Date**: 2026-06-12
- **Focus**: Scan Tab Camera Photo Size Limit Fix, Vercel Deploy & Verification
- **Agent**: Antigravity 🦾

## What Was Done

### Session 11 (Antigravity — commit `8bdd813`)
1. **Fixed OCR Payload Too Large Error**: Solved the issue where camera scans returned `OCR not completed, json payload too large`. Increased the `MAX_JSON_BYTES` constant from `900000` (900KB) to `4500000` (4.5MB) in `workers/credential-broker/src/index.js` to support larger base64 encoded photo uploads from client-side camera captures.
2. **Fixed Notion File Upload Sync Failure**: Resolved the `有資料同步失敗，請檢查連線或設定` banner and Offline Conflict Resolver trigger when uploading receipts with photos. Added the missing `Authorization` and `Notion-Version` headers to the Notion file upload `fetch` request in `notionUploadFileWorker` inside `workers/credential-broker/src/index.js` to prevent Notion's API from rejecting S3 pre-signed upload requests with 401.
3. **Updated Test Coverage**: Modified `workers/credential-broker/test/self-test.mjs` to test payload rejection at `4500001` bytes instead of the old `900001` limit.
4. **Validated & Deployed Worker**: Verified syntax via `npm run check`, confirmed all mock tests pass with `npm run self-test`, and successfully deployed the worker to production.
5. **Git Push & Preflight checks**: Verified post-deploy health check (`version: 2026.06.12` is live) and successfully pushed the changes to GitHub `main` branch.

### Session 10 (Antigravity — commit `d1d0967`)
1. **Removed 5MB Camera Size Limit**: Removed the obsolete `file.size > 5_000_000` image file limit check from `handleImage` and `handleEmailImages` inside `app-compact/src/tabs/Scan.tsx`.
2. **Client-Side Auto-Compression Preserved**: Verified that `prepareForOCR` and `compressPhoto` safely perform client-side Canvas-based resizing/compression (resizing to 2016px max width and 480px thumbnails) instantly upon capture, so raw large photos (>5MB) are safely downsized before uploading, matching the legacy version's behavior.
3. **Smoke Tested & Deployed**: Verified that `npm run smoke:scan` passes 100%, successfully built, and deployed prebuilt output to `travel-expense-compact` production on Vercel.

### Session 9 (Codex — this commit)
1. **Shared Receipt Mutation RPCs**: Added `supabase/migrations/20260612165000_shared_ledger_receipt_rpc.sql` with `upsert_shared_trip_receipt()` and `delete_shared_trip_receipt()`. The RPCs require authenticated editable trip membership, preserve `source_id`, block editors from updating/deleting another member's receipts, and create durable Notion `receipt_sync_jobs` outbox rows when the trip has an active `trip_backend_links` dual-write backend.
2. **Live Supabase Migration Applied**: Applied the new RPC migration to live Supabase project `fbnnjoahvtdrnigevrtw`; Supabase lists it as live migration `20260612084722_shared_ledger_receipt_rpc`.
3. **React + Compact Shared Ledger Routing**: Updated both `app-react/src/lib/supabase.ts` and `app-compact/src/lib/supabase.ts` so shared-trip receipt saves/deletes call the new RPCs instead of direct browser table writes. Private trips keep the existing direct Supabase path.
4. **Browser Notion Writes Disabled For Shared Trips**: Updated both sync engines so shared-trip receipt upsert/delete no longer calls browser-side `pushReceipt()` / `archiveReceipt()`. Notion for shared trips is now represented by the server-created pending outbox job instead of exposing or duplicating Notion writes in the frontend.
5. **Shared Ledger Contract Smoke**: Added `scripts/verify-shared-ledger-contract.mjs` plus `npm run smoke:shared-ledger` in React and Compact. The smoke verifies the SQL permission/outbox contract, frontend RPC routing, and the shared-trip browser-Notion skip path.
6. **Deploy Proof**: Manually prebuilt/deployed React Vercel production as `dpl_8HJ7a8U1ro5TyVAyx1nZtFfUdQyV` and Compact Vercel production as `dpl_FqMgNX5P9quAtmFW3Xj4ZPNxkADD`; both public aliases returned HTTP 200.

**Verified in this session**
- `app-react npm run typecheck` ✅
- `app-compact npm run typecheck` ✅
- `app-react npm run build` ✅
- `app-compact npm run build` ✅
- `app-react npm run db:policy:scan` ✅
- `app-react npm run smoke:shared-ledger` ✅
- `app-compact npm run smoke:shared-ledger` ✅
- `app-compact npm run smoke:shared-contract` ✅
- `app-react npm run security:scan` ✅
- `app-compact npm run security:scan` ✅
- `curl https://travel-expense-react.vercel.app/` ✅ (`200`)
- `curl https://travel-expense-compact.vercel.app/` ✅ (`200`)
- `git diff --check` ✅

**Important limits / next phase**
- This completes the shared-trip receipt RPC and durable Notion outbox enqueue step, but it does not yet run a deployed Notion worker/Trip Ledger Broker to consume `receipt_sync_jobs` and update Notion pages. Until that worker exists, shared receipts can show as saved in Supabase with Notion pending.
- The RPCs intentionally use the existing owner-only receipt edit model: editors can add and edit their own shared-trip receipts, but they cannot rewrite another member's receipts.
- Continue to keep React and Compact on one shared data/back-end contract whenever adding the worker, retry UI, or conflict/version handling.

### Session 8 (Codex)
1. **Supabase Sharing Foundation**: Added `supabase/migrations/20260612153000_trip_sharing_dual_backend.sql` for `trip_invites`, `trip_backend_links`, and `trip_accounting_people`, with forced RLS, select-only frontend grants for sensitive tables, invite token hashing, and RPCs for create/accept/revoke invites plus member role/remove/leave actions. Applied it to live Supabase project `fbnnjoahvtdrnigevrtw` as migration `20260612082134_trip_sharing_dual_backend`.
2. **React + Compact Shared Types**: Added shared member, invite, backend-health, sharing-state, receipt ownership, version, and ledger sync status fields to both `app-react/src/lib/types.ts` and `app-compact/src/lib/types.ts`.
3. **Shared Supabase Pull/Merge Support**: Updated both Supabase clients so pull reads all RLS-visible trips instead of owner-only trips, attaches member/invite/backend/accounting summaries, preserves shared-trip ownership, and avoids re-upserting the trip owner while saving shared receipts.
4. **Welcome Guide Sharing Step**: Added invite capture to both Welcome Guide implementations, including email, display name, editor/viewer role, and optional accounting-person intent.
5. **Settings Sharing Management**: Added a collapsed `旅程共享` card to React and Compact Settings with role/backend status, invite creation, invite links, pending invite revoke, member role changes, and member removal controls.
6. **Invite Acceptance Routing**: Added `#accept-invite?token=...` handling in React and Compact, including the local Supabase-session fallback used by smoke tests.
7. **Regression Coverage**: Updated migration scanner, Settings smoke tests, React `smoke:welcome-guide` script, and shared-contract smoke data so both app surfaces understand the new sharing metadata.
8. **Deploy Proof**: GitHub Pages workflow passed on `main`. React Vercel production was manually prebuilt/deployed as `dpl_7Fdo255fdUuP7G1jsp9EtjspKGHQ` and Compact Vercel production as `dpl_HaWHyHQATiY5X1vCJ1exXLsq67vP`; both aliases returned HTTP 200 after deploy.

**Verified in this session**
- `app-react npm run typecheck` ✅
- `app-compact npm run typecheck` ✅
- `app-react npm run build` ✅
- `app-compact npm run build` ✅
- `app-react npm run db:policy:scan` ✅
- `app-compact npm run smoke:shared-contract` ✅
- `app-react npm run smoke:welcome-guide` ✅
- `app-compact npm run smoke:welcome-guide` ✅
- `app-react npm run smoke:settings` ✅ (`4 passed, 1 skipped`)
- `app-compact npm run smoke:settings` ✅ (`9 passed, 1 skipped`)

**Important limits / next phase**
- The new Supabase sharing migration was applied live through the Supabase connector and verified in the migration list. No service-role key, DB URL, or raw secret was printed.
- Server-side Supabase + Notion dual-write receipt mutations are still the next phase. The current browser receipt save path is compatible with shared metadata but does not yet route shared-trip receipt saves through a Trip Ledger Broker / Edge Function.
- `trip_accounting_people` is read into app state, but full UI write/merge tooling for trip-scoped accounting people remains to be completed.
- Vercel GitHub-triggered production builds had been failing with 0ms/root-directory style errors for both React and Compact. Manual prebuilt deploy from the correct cwd/root workaround succeeded; the project settings should still be reviewed later so future GitHub-triggered Vercel deploys stop producing failed runs.

### Session 7 (Antigravity — commit `5979505`)
1. **Budget Calc & Percent Alignment**: Aligned the budget percentages and totals between `Dashboard.tsx` and `Stats.tsx` to be display-currency-aware and use `trueTotal` (which includes flight and lodging) in accordance with project rules.
2. **Inline Budget Editing on Home**: Implemented the `handleUpdateBudget` helper in `Dashboard.tsx` to correctly map the new budget to the active trip in the `state.trips` array and enqueue a `trip` sync item, ensuring changes persist across re-hydration and sync.
3. **Playwright Tests Hardened**: Updated `tests/stats-smoke.spec.cjs` and `tests/dashboard-parity-smoke.spec.cjs` to relax currency checks using regex and expect `309%` (using the correct true total budget) instead of the old 69% check, fixing test runs on dynamic exchange rates.
4. **Vercel Deploy Pipeline Fixed**: Copied the correct `.vercel/output` config/static folders from `app-compact/.vercel/output` to root, set project config to compact, and deployed prebuilt successfully to production.
5. **Git Push Authenticated**: Bypassed GITHUB_TOKEN shell environment override to successfully push the changes to GitHub `origin main`.

### Session 6 (Antigravity — commit `f243861`)
1. **Compact Settings Cleaned**: Removed Cache, Motion, and Update capsules from the top of the compact Shell layout.
2. **Notion & Email Cards Removed**: Deleted the Notion Sync (`settings-notion`) and Email/Shortcut (`settings-email`) cards from `app-compact/src/tabs/Settings.tsx` to streamline the layout.
3. **Card Reordering**: Reordered the Settings tab cards to:
   1. 旅伴 / 分帳比例
   2. AI 模型選擇
   3. 雲端帳號與密碼設定
   4. 旅程管理器
   5. AI 行程更新
   6. Credentials & Connection
   7. 資料管理
   8. 行程 JSON
   9. 極限壓力與故障測試面板
4. **Wizard & Fields Collapsible**: Wrapped the "建立新旅程" and "當前行程與屬性設定" sections inside the Trip Manager card with collapsible toggles (default collapsed).
5. **Version Label Update**: Set `buildLabel` to show `v0.1.0` in the Data Management card.
6. **Playwright Test Fixes**: Updated `tests/settings-smoke.spec.cjs` to assert 8 AccordionCards (down from 10), removed Notion and Email assertions, skipped the obsolete dry run test, and mocked `kimi/json` to support the new two-stage trip update workflow.

### Session 5 (Codex — commit `139e396` + docs follow-up)
1. **Compact Google OAuth Config Completed**: Created the GCP OAuth web client for the Travel Expense app and enabled Supabase Auth Google provider for project `fbnnjoahvtdrnigevrtw`.
2. **Compact Google Login Wired**: Added `signInWithGoogle` using `supabase.auth.signInWithOAuth` in `app-compact/src/lib/supabase.ts`.
3. **Compact Login Page Renovation**: Rebuilt `app-compact/src/security/SupabaseGate.tsx` into a calmer travel-cloud login panel using the existing `travel-ai-atlas.webp` asset.
4. **Scoped Storage Race Fix**: Hardened `app-compact/src/lib/useAppState.ts` so localStorage saves wait for IndexedDB hydration to finish.

See previous handover entries for details on earlier sessions.

---

## Current State
- `app-compact` passes TypeScript compilation (`npm run typecheck`) ✅
- `app-compact` production build passes (`npm run build`) ✅
- Playwright E2E smoke tests for settings fully pass (`npm run smoke:settings`) ✅
- Playwright E2E smoke tests for mobile layout stability pass (`npm run smoke:mobile-layout`) ✅
- Git push credential conflict resolved (bypassed GITHUB_TOKEN environment variable collision) ✅
- Latest changes successfully committed and pushed to `main` ✅

## Next Steps
- Stably verify how the newly ordered compact settings load in production environment.
- Consider porting the parallel weather fetch + 1hr TTL caching to the React version (`app-react/`) if needed.
- Monitor active trip boundary synchronization after manual trip wizard creation.
