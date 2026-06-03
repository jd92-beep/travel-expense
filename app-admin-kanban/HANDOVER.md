# Admin Kanban / User Dashboard Handover

This file details the handover status of the `app-admin-kanban` directory after its transition from a Kanban layout to a User-Centric Dashboard.

Last updated: 2026-06-03

## 🎯 Project Overview
The admin panel was originally styled as a Kanban board, which was deemed non-user-friendly. It has been redesigned into a split-pane **User-centric Dashboard** showing:
1. **Universal Health Checks** (LLM routing, Frontend, Backend, Database connection status).
2. **User Details Panel** triggered by clicking a user from the left-side list, exposing:
   - **Connection Status**: Supabase and Notion connection indicators.
   - **Statistics & Records**: Count of trips, receipts, and receipt photos/images.
   - **Detailed Lists**: Active trip profiles, recent sync jobs, recent expense records.
   - **Guarded Admin Delete**: preview counts, exact confirm phrase, and admin re-auth before destructive user deletion.

## 🛠️ Files Changed & Pushed
The following files were modified by the Antigravity dashboard pass and then continued by Codex:
* `app-admin-kanban/src/App.tsx`: Rewrote UI to a dashboard split-pane layout with Universal Health & UserDetailsPanel.
* `app-admin-kanban/src/lib/types.ts`: Extended `AdminUserCard` interface to include `imageCount`.
* `app-admin-kanban/src/styles.css`: Appended styles for the new dashboard components (universal-health, user-details-panel, connection-status, lists).
* `supabase/functions/admin-kanban/index.ts`: Updated the Edge function snapshot query to count images by grouping `receipt_photos` by `owner_id`.
* `app-admin-kanban/playwright.config.cjs`: Added a standalone Playwright web server so `npm run smoke` starts Vite automatically.

## 📍 Current Runtime Status
1. **Frontend Local Build**: `npm run typecheck`, `npm run build`, and `npm run smoke` pass from `app-admin-kanban/`.
2. **Supabase Edge Function Deployment**: Deployed through the Supabase connector as `admin-kanban` version 4 with `verify_jwt=false`; custom auth is still enforced by calling the Vercel admin session verifier.
3. **Live Edge Snapshot**: Authenticated snapshot returned `HTTP 200`, `source=live-edge`, `authUsers=3`, `profiles=3`, `trips=1`, `receipts=0`, and per-user `imageCount` fields.
4. **Environment**: Local secrets remain in `.env.admin-kanban.local` and are gitignored. Do not print the admin passphrase or Supabase tokens in chat.

## 🚀 Codex: Next Steps & Data Ownership Fixes

When Codex takes over, please look into the following critical tasks to fix the **empty receipts / duplicate accounts** issue that Boss reported:

### Why are there two identical VC accounts, and why are my receipts missing in Kanban?
1. **The Duplicate Accounts Issue**: Supabase treats `vc06456@hotmail.com`, `vc06456@gmail.com`, and `ftjdfr@gmail.com` as completely separate users with different unique UUIDs. There are duplicate Boss accounts in the system because Boss has logged in using both the `gmail.com` and `hotmail.com` variants.
2. **Missing Data in the Kanban Board**: The Kanban board **is correctly connected** to the live Supabase database. The reason no receipts or trips appear under `vc06456` accounts is that all of the Nagoya trip data was originally uploaded and saved under the **`ftjdfr@gmail.com` user UUID** (`bf464ddb-9c80-4ae1-970c-1774d689d5fd`). The `vc06456` accounts currently own exactly 0 trips and 0 receipts in Supabase.
3. **Data sets connected?**: Yes. The dataset connections to the Kanban board are 100% correct, which is precisely why it accurately shows 0 receipts for the `vc06456` accounts!

### Immediate Fix Required by Codex
To fix the data isolation and show the real data under Boss's primary Hotmail account:
1. Antigravity has created a SQL migration script located at `supabase/migrations/20260603000000_reassign_boss_data.sql`.
2. This script moves all `trips`, `receipts`, and `receipt_photos` ownership from `ftjdfr@gmail.com` to `vc06456@hotmail.com` (`e8580628-5af6-4a74-ac95-0b20a9dae98b`).
3. **Codex MUST instruct the Boss to run this SQL script directly in the live Supabase SQL Editor** (since we agents do not have the DB password). 
4. Once the SQL is run on the production Supabase database, the data will instantly appear in the Kanban board under `vc06456@hotmail.com`.
5. Alternatively, since **Notion is the source of truth**, Codex can advise Boss to trigger the Notion Pull/Sync while logged in as `vc06456@hotmail.com` to re-hydrate the receipts into Supabase under the Hotmail account UUID.

### Other Next Steps
1. **Production Vercel Check**: After pushing, confirm `https://travel-expense-admin-kanban.vercel.app` serves the dashboard bundle.
2. **Verify Universal Health Statuses**: The LLM broker health is live; future work can add explicit frontend latency and DB latency measures.
3. **Refine User details**: Add sync-job rows to the user detail lists if Boss wants job-level Notion diagnostics shown beside trips and receipts.
