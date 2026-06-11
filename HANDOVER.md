# Agent Handover

## Last Worked On
- **Date**: 2026-06-11
- **Focus**: Compact Google OAuth setup and chilled login renovation
- **Agent**: Codex 🚀

## What Was Done

### Session 5 (Codex — commits `139e396` + docs follow-up)
1. **Compact Google OAuth Config Completed**: Created the GCP OAuth web client for the Travel Expense app and enabled Supabase Auth Google provider for project `fbnnjoahvtdrnigevrtw`. The callback URI is `https://fbnnjoahvtdrnigevrtw.supabase.co/auth/v1/callback`; no OAuth client secret was committed or printed.
2. **Compact Google Login Wired**: Added `signInWithGoogle` using `supabase.auth.signInWithOAuth` in `app-compact/src/lib/supabase.ts`, with a clean app-root redirect for `/travel-expense/compact/`.
3. **Compact Login Page Renovation**: Rebuilt `app-compact/src/security/SupabaseGate.tsx` into a calmer travel-cloud login panel using the existing `travel-ai-atlas.webp` asset, a glassy panel, compact tabs, and a Google sign-in button. Removed the previous banana image from the compact login surface.
4. **Security Smoke Coverage**: Added a Google OAuth redirect smoke to `app-compact/tests/security-smoke.spec.cjs` and updated Supabase login smoke expectations for the new copy.
5. **Scoped Storage Race Fix**: Hardened `app-compact/src/lib/useAppState.ts` so localStorage saves wait for the current scoped IndexedDB hydration to finish, preventing a stale empty snapshot from overwriting the signed-in user's fallback state.
6. **Browser/Computer Session Repair**: For this Codex session, Chrome automation was switched to the active Chrome profile surface (`ftjdfr@gmail.com`) and Computer Use was verified through `com.google.Chrome`.
7. **Compact Vercel Env Repair**: The compact Vercel project had `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` present but effectively empty, so production skipped `SupabaseGate`. Those production env vars were reset as non-sensitive public `VITE_` values copied from the working React project env; pulled lengths now match the real URL/key without printing values.
8. **Compact Production Deploy**: Manual prebuilt deploy `dpl_2GdpvV42ohnbokPym4U4rq7MCnTF` is READY and aliased to `https://travel-expense-compact.vercel.app/`.

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
- `app-compact` production build passes (`npm run build`) ✅
- Compact Supabase security smoke passes with fake public env and Google OAuth redirect coverage (`SUPABASE_REDIRECT_SMOKE=1 npm run smoke:security`) ✅
- Compact mobile layout smoke passes (`npm run smoke:mobile-layout`) ✅
- Unit tests (`node scripts/test-local-parser.mjs`) pass successfully (62/62) ✅
- Git push authentication problem resolved (run with `env -u GITHUB_TOKEN` to bypass invalid token injection) ✅
- GCP OAuth client and Supabase Google provider are configured for the compact/public Supabase auth flow ✅
- Latest compact login changes are pushed to `origin main` at `139e396` ✅
- Vercel React app deployed and live at `https://travel-expense-react.vercel.app`
- Compact app is live at `https://travel-expense-compact.vercel.app/` on deployment `dpl_2GdpvV42ohnbokPym4U4rq7MCnTF` ✅
- Production live login proof: fresh 390px browser shows `旅程雲端登入`, `使用 Google 帳號登入`, no banana artwork, no horizontal overflow, and the intercepted OAuth request sends `provider=google` with redirect `https://travel-expense-compact.vercel.app/` ✅

## Next Steps
- Verify weather tab loads faster in production with the parallel fetch + cache changes.
- Consider adding `REGION_COORDS` entries for Jeju (currently covered by `GEO_DICTIONARY` but not the weather region matcher).
- The `app-react` version of weather does not have the grouping/cache changes — port if needed.
- Run `npm run smoke:settings` to verify the remaining Settings smoke tests still pass.
