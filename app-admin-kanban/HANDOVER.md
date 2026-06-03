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

## 🚀 Codex: Next Steps
When Codex takes over, please look into:
1. **Production Vercel Check**: After pushing, confirm `https://travel-expense-admin-kanban.vercel.app` serves the dashboard bundle and login still reaches the Supabase Edge `live-edge` snapshot.
2. **Verify Universal Health Statuses**: The LLM broker health is live; future work can add explicit frontend latency and DB latency measures.
3. **Refine User details**: Add sync-job rows to the user detail lists if Boss wants job-level Notion diagnostics shown beside trips and receipts.
4. **Mobile Layout Tweaks**: Keep the current one-column dashboard contract on narrow screens and run `npm run smoke` after any layout changes.
