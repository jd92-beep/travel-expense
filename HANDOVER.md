# Agent Handover

## Last Worked On
- **Date**: 2026-06-11
- **Focus**: Google OAuth Login Support in Supabase Gate
- **Agent**: Antigravity 🚀

## What Was Done

### Session 4 (Antigravity — commit `8dc19ef`)
1. **Google OAuth Support**: Added `signInWithGoogle` using `supabase.auth.signInWithOAuth` in `useSupabaseAuth` hook in `app-react/src/lib/supabase.ts`.
2. **SupabaseGate UI Upgrade**: Added Google Sign-In button with beautiful styling and multi-color Google SVG icon, separated by a clean divider. Maintained compact mobile layout in `app-react/src/security/SupabaseGate.tsx`.
3. **Worker safeNotionPath**: Committed the addition of `/search` endpoint to `safeNotionPath` in `workers/credential-broker/src/index.js`.

### Session 3 (Codex — commit `e070570`)
1. **City Grouping with Haversine**: New `groupedCoordsForDay()` groups itinerary spots within 30km into a single city-level weather card, reducing duplicate API calls. Uses `haversineKm()` and builds city anchors from both `REGION_COORDS` and `GEO_DICTIONARY`.
2. **Parallel Weather Fetch**: Weather API calls now run in parallel via `Promise.all` instead of sequentially. Both inter-day and intra-day fetches run concurrently.
3. **Module-Level Cache (1hr TTL)**: Added `_weatherRowsCache` with getter/setter. Cached weather data shows immediately on tab switch; background refresh updates if stale. Replaced per-render fetch with cache-first strategy.
4. **City Label Always Shown**: Weather card `<h3>` header now always displays the city label, not just when there are multiple locations per day.
5. **Removed Post-Trip Archive Test**: Deleted the 141-line `settings-smoke.spec.cjs` test for the post-trip archive feature that was already removed from the UI.

### Session 2 (Antigravity — commit `65c3444`)
1. **Model Routing Fix**: Refactored `modelAttemptsForKind()` so user's Settings selection is the true primary for all AI functions (scan, voice, email, trip). Previously scan/voice hardcoded Gemma and email hardcoded Kimi as primary. The contract default model is now first fallback instead.
2. **Settings UI Text Update**: Updated the AI model section description in Settings.tsx to reflect the new routing behavior.

### Session 1 (Antigravity + Codex)
See previous HANDOVER entries in git history for details on:
- Fuzzy JSON bracket-repair
- Hybrid hydration architecture with GEO_DICTIONARY
- Duration/TimeEnd parsing, advice capture
- Geo expansion (9→32 Jeju locations)
- LLM timeout/truncation increases
- Google single-stage shortcut, mergeTripDrafts
- 48 unit tests

## Current State
- `app-compact` passes TypeScript compilation (`npm run typecheck`) ✅
- Unit tests (`node scripts/test-local-parser.mjs`) pass successfully (62/62) ✅
- Git push authentication problem resolved (run with `env -u GITHUB_TOKEN` to bypass invalid token injection) ✅
- Latest commits pushed to `origin main`
- Vercel React app deployed and live at `https://travel-expense-react.vercel.app`

## Next Steps & Pending Configuration Tasks (Action Required)
- [ ] **GCP Console Configuration**: Go to [GCP Credentials](https://console.cloud.google.com/apis/credentials?project=gen-lang-client-0341814613) and create an OAuth Web Client ID for Web Application. Add `https://fbnnjoahvtdrnigevrtw.supabase.co/auth/v1/callback` to the Authorized redirect URIs.
- [ ] **Supabase Console Configuration**: Go to [Supabase Auth Providers](https://supabase.com/dashboard/project/fbnnjoahvtdrnigevrtw/auth/providers) and enable Google Provider using the Client ID & Secret from GCP.
- Verify weather tab loads faster in production with the parallel fetch + cache changes.
- Consider adding `REGION_COORDS` entries for Jeju (currently covered by `GEO_DICTIONARY` but not the weather region matcher).
- The `app-react` version of weather does not have the grouping/cache changes — port if needed.
- Run `npm run smoke:settings` to verify the remaining Settings smoke tests still pass.
