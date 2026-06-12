# Agent Handover

## Last Worked On
- **Date**: 2026-06-12
- **Focus**: Unblocked Background AI Receipt OCR & Tab Switching Support
- **Agent**: Antigravity 🦾

## What Was Done

### Session 15 (Antigravity — commit `a5a6918`)
1. **Unblocked Background OCR during Tab Switching**: Fully decoupled OCR processing from the `Scan` tab component's mounted lifecycle check (`mountedRef.current`), allowing the async OCR response to safely update state and open the global Receipt Editor even after unmounting.
2. **Global Non-Blocking Status Indicator**:
   - Replaced the full-screen blocking overlay with a modern, elegant, non-intrusive floating badge (`.global-ocr-floating-badge`) at the top right of the viewport.
   - Removed tab switching and hashchange blocks, permitting users to navigate freely during AI recognition.
3. **Globalized Batch State**:
   - Lifted `batch` and `setBatch` state from local `Scan` component to `App.tsx` globally in both `app-compact` and `app-react`. This ensures that batch OCR data survives tab switches and automatically renders the confirmation modal when returning to the Scan tab.
4. **Enhanced AI Prompts for Receipt Translation & Formatting**:
   - Updated the LLM prompts in `app-compact/src/lib/ai.ts` and `app-react/src/lib/ai.ts` to strictly format the `itemsText` field line-by-line (e.g., `- [Original Name] (Cantonese translation) x [Qty]: [Price]`).
   - Reinforced the translation rules to translate foreign products, items, and food names specifically into natural Hong Kong Cantonese terms in Traditional Chinese (e.g., "凍美式咖啡", "芝士", "的士", "士多啤梨", "薯仔", "雪糕").
5. **Smoke Tested & Deployed**:
   - Ran typecheck and production builds successfully for both `app-compact` and `app-react` (100% compile pass).
   - Ran Playwright `smoke:scan` E2E tests for both compact and react apps, verifying that manual, voice, and email OCR flows function perfectly.
   - Committed and pushed changes to `origin main` to trigger production deploys.

### Session 14 (Antigravity — commit `097b532`)
1. **Fixed Tab Switching during Receipt OCR/Recognition**: Resolved the major issue where switching tabs while AI was recognizing a receipt (camera scan, photo upload, voice parse, email parse) caused the async OCR results to be discarded and the expense record editor popup to never show.
2. **Global Busy Lock & Screen Blocking**:
   - Added a `globalOcrBusy` state to `App.tsx` of both `app-compact` and `app-react`.
   - Prevented tab switching in `changeTab` and reverted address-bar URL hash changes using `window.history.replaceState` if `globalOcrBusy` is active.
   - Passed `onBusyChange` prop to the `Scan` component to update the parent `App` component's busy state during AI operations.
3. **Premium Glassmorphism Overlay**:
   - Added a fixed full-screen `.global-ocr-overlay` styled loader with a high `z-index: 99999` and `backdrop-filter` in both `styles.css` files.
   - Renders a translucent dark glassmorphism card with a rotating gold-hued spinner matching the trip theme, blocking all pointer events (and thus tab switching) and displaying dynamic context-aware text (e.g. "AI 正在辨識收據...").
4. **Build & Compiler Validation**:
   - Ran `npm run typecheck` and `npm run build` in both directories, verifying 100% clean compiles.
   - Checked and fixed trailing EOF whitespace issues.
5. **Committed and Pushed**:
   - Successfully committed and pushed the changes to remote `origin main` to trigger automatic Vercel production builds.

### Session 13 (Antigravity — commit `bcc6093`)
1. **Added AI Receipt Translation in Brackets**: Updated the LLM prompts in `app-compact/src/lib/ai.ts` and `app-react/src/lib/ai.ts` for both `scanReceiptImage` (OCR) and `parseTextWithAi` (text/voice/email parsing) to automatically preserve the original foreign language text (e.g. Korean or Japanese) and append its translation in brackets right next to it (e.g. `편의점 (Convenience Store)`).
2. **Fixed Settings AI Confirmation Modal Position**: Moved the `tripDraft` confirmation modal out of the nested `<AccordionCard id="settings-trip-update">` block and placed it at the root level of the `Settings.tsx` component. This prevents the modal from rendering at the bottom of the nested scrollable accordion context, allowing it to correctly overlay the viewport without requiring the user to scroll.
3. **Enhanced Scan Tab UX**:
   - Made the mock receipt photo card (`preview-scan-camera`) clickable (`onClick={triggerCamera}`) so that clicking it directly opens the camera, matching user expectations.
   - Removed the obsolete "flashlight" (閃光) and "cut/crop" (裁切) preview overlay buttons.
4. **Settings Version Bump to v0.1.2**: Bumped version to `0.1.2` in `app-compact/package.json` and updated the `buildLabel` in `app-compact/src/tabs/Settings.tsx` to `v0.1.2`.
5. **Verified and E2E Smoke Tested**: Successfully ran TypeScript typecheck and Vite build in both React and Compact subdirectories. Confirmed that both `smoke:production-gate` and `smoke:scan` in `app-compact` and `smoke:ai-routing` in `app-react` pass 100% without regression.
6. **Deployed and Aliased**: Deployed the prebuilt output of the Compact app to production Vercel (`travel-expense-compact`), aliasing to `https://travel-expense-compact.vercel.app`.

### Session 12 (Antigravity — commit `bf70321`)
1. **Removed Stray Dot on Settings Tab**: Modified `app-compact/src/components/Shell.tsx` to only render the mobile header action button (`compact-mobile-action`) on the `dashboard` and `scan` tabs. This removes the non-functional vertical ellipsis button from other tabs, solving the stray black dot issue on the Settings tab.
2. **Fixed Conflict Resolver for Synced Receipts**: Modified `app-compact/src/tabs/History.tsx` to hide receipts from the Offline Conflict Resolver if they already have `supabaseId` or `notionPageId` and no active retry item is in the sync queue. This prevents synced receipts for the Jeju 2026 trip from lingering in the resolver panel.
3. **Removed Itinerary Weather Pack**: Completely removed the Weather Pack strip from the Itinerary tab (`app-compact/src/tabs/Timeline.tsx`), including variables, imports, and markup. Deleted the now obsolete helper file `app-compact/src/lib/travelDay.ts` where the packing risk logic resided.
4. **Settings Version Bump & Relocation**: Bumped the version from `v0.1.0` to `v0.1.1` in `package.json` and `Settings.tsx`. Moved the version label from inside the "資料管理" (Data Management) card to the very bottom center of the Settings page footer.
5. **Hardened Playwright Tests**: Fixed `tests/final-navigation-smoke.spec.cjs` and `tests/a11y-touch-smoke.spec.cjs` to align with the simplified PWA readiness strip (removed checks for obsolete Cache, Motion, and Update chips).
6. **Verified & Deployed**: Ran `npm run smoke:production-gate` successfully (all typecheck, navigation, mobile-layout, a11y, contact-sheet, and security scans passed). Swapped the Vercel project link to `travel-expense-compact` and deployed the prebuilt output successfully to production. Pushed verified commits to GitHub.

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
