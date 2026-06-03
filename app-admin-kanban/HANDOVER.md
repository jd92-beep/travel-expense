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

## 🚀 Status & Next Steps

### Kanban Polish & Features Complete
Antigravity has just finished building out the requested features:
1. **Unmasked Emails**: The Edge Function and UI now return and display full email addresses instead of masked ones.
2. **Photo Viewer**: A new <img src="https://unpkg.com/lucide-static@0.400.0/icons/image.svg" width="16" /> icon allows admin to view receipt photos directly within the Kanban Board through a modal.
3. **Quick Amend**: A new <img src="https://unpkg.com/lucide-static@0.400.0/icons/pencil.svg" width="16" /> icon next to receipts opens a Quick Amend Modal, interacting with the new `POST /api/amend-receipt` Edge Function endpoint to safely bypass RLS and adjust Store Name, Amount, Currency, and Status.
4. **Boss Authority Hardened**: `isBoss` logic across all frontend applications (`app-react` and `app-compact`) is now strictly locked to **`vc06456@gmail.com`**.

### The Duplicate Accounts Issue & Missing Receipts
1. **The Core Reason**: Boss logged in with `vc06456@hotmail.com`, `vc06456@gmail.com`, and `ftjdfr@gmail.com`. Supabase treats these as completely distinct user profiles with unique UUIDs. All the Nagoya data was created under `ftjdfr@gmail.com` (`bf464ddb-9c80-4ae1-970c-1774d689d5fd`).
2. **The Fix (Ready for User Execution)**: A SQL migration script `supabase/migrations/20260603000000_reassign_boss_data.sql` has been explicitly coded to move all data from `ftjdfr@gmail.com` to the correct admin account **`vc06456@gmail.com`** (`e6bd6e0a-4022-4491-95d3-e4b53ddc88f6`).
3. **Action Required**: Boss must copy the contents of that migration and run it directly in the Supabase SQL Editor to link the data back to the admin profile.

### Deploying the Fixes
To push these changes to production:
1. `npx supabase functions deploy admin-kanban` (must be done locally with Supabase CLI logged in).
2. Push all code to `origin main` to trigger the `travel-expense-admin-kanban` Vercel deployment.
