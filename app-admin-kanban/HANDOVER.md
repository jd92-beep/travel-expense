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

## 🛠️ Files Changed & Pushed
The following files have been modified and pushed to `main` branch (commit `c0f795d`):
* `app-admin-kanban/src/App.tsx`: Rewrote UI to a dashboard split-pane layout with Universal Health & UserDetailsPanel.
* `app-admin-kanban/src/lib/types.ts`: Extended `AdminUserCard` interface to include `imageCount`.
* `app-admin-kanban/src/styles.css`: Appended styles for the new dashboard components (universal-health, user-details-panel, connection-status, lists).
* `supabase/functions/admin-kanban/index.ts`: Updated the Edge function snapshot query to count images by grouping `receipt_photos` by `owner_id`.

## 📍 Current Runtime Status
1. **Frontend Local Build**: Successfully ran `npm run typecheck` and `npm run build` with zero errors.
2. **Supabase Edge Function Deployment**: **Pending manually deploy by the Boss**. Because the agent context lacks auth tokens (`SUPABASE_ACCESS_TOKEN`), you must run the following CLI command manually:
   ```bash
   npx supabase functions deploy admin-kanban --no-verify-jwt --project-ref fbnnjoahvtdrnigevrtw
   ```
3. **Environment**: Local secrets remain in `.env.admin-kanban.local` and are gitignored.

## 🚀 Codex: Next Steps
When Codex takes over, please look into:
1. **Edge Function Integration**: Ensure the backend Edge function deploys successfully. Test if the live endpoint correctly parses and serves the newly added `imageCount` (receipt_photos count) to the frontend.
2. **Verify Universal Health Statuses**: Implement live health check fetches for the Universal Health grid (e.g., fetching LLM broker health, backend status, DB latency). Currently, some indicators may be mocked or static.
3. **Refine User details**: Verify the user statistics match the database exactly. Test with different users to ensure active trips list, sync jobs list, and expense list align properly in the UI.
4. **Mobile Layout Tweaks**: Verify the dashboard splits gracefully on mobile sized viewports (compact/narrow screens) to avoid list crowding.
