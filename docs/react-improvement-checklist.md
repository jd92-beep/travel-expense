# React Improvement Checklist

Last updated: 2026-06-08 HKT

Scope: this checklist tracks the main public React app in `app-react/` only. Compact, legacy, admin KanBan, and worker changes are included only when a React task explicitly depends on them.

## Current Evidence

- Latest pushed React-roadmap baseline checked on 2026-06-08 HKT: `68e80f9` (`Cover React sync confidence smoke states`).
- Vercel React production checked Ready: `https://travel-expense-react.vercel.app`.
- Latest GitHub Pages workflow checked successful for `main`.
- `app-react npm run typecheck` passed on 2026-06-08 HKT before this checklist was started.
- Current local caveat: untracked `supabase/.temp/` exists and should be treated as local Supabase tooling output unless intentionally reviewed.

## Priority Policy

- `P0` protects user data, login, sync, secrets, and cross-user/cross-trip isolation.
- `P1` improves public-user confidence, core workflows, mobile usability, and testable reliability.
- `P2` improves premium polish, insight quality, and maintainability without blocking production use.
- `P3` is exploratory or nice-to-have.

Every implementation task must end with a targeted smoke test. Broader tasks should also run `npm run typecheck`, `npm run build`, and `npm run smoke:mobile-layout` before commit.

## Checklist

### P0 - Trust, Data Safety, And Sync

- [x] Add a React Settings `Sync Confidence Center` that summarizes Supabase readiness, Notion mirror readiness, auto-sync, pending queue, last sync, local cache scope, and latest sync error.
  - Proof: `npm run smoke:settings`; visual/mobile geometry probe or `npm run smoke:mobile-layout`.
- [x] Add focused tests for sync queue health states: queued, error, offline, Supabase-only, and Personal Notion connected.
  - Proof: dedicated Playwright or unit coverage plus `npm run smoke:settings`.
- [x] Audit backup/import/export wording and UI so users know backups are active-trip only and never include secrets.
  - Proof: `npm run smoke:settings`.
- [ ] Add user-facing recovery steps for sync errors, including retry, local-safe explanation, and when Notion is optional.
  - Proof: `npm run smoke:settings` and `npm run smoke:final-nav`.

### P1 - Mobile-Native React Experience

- [ ] Create a React mobile UI audit from the seven primary tabs at 390px and 360px.
  - Proof: screenshots/contact sheet plus no horizontal overflow.
- [ ] Bring the best compact-version mobile patterns into React: denser first viewport, clearer bottom dock, shorter command cards, and readable card type scale.
  - Proof: tab-specific smoke tests plus `npm run smoke:mobile-layout`.
- [ ] Improve one-handed ergonomics for Scan, Records, Weather, and Stats primary actions.
  - Proof: tab-specific smoke tests and mobile screenshot review.

### P1 - Core Workflow Quality

- [ ] Upgrade Receipt workflow with a clearer AI parse confirmation surface: confidence, duplicate warning, photo quality hint, and explicit save/cancel hierarchy.
  - Proof: `npm run smoke:scan`, `npm run smoke:history`, `npm run smoke:mobile-layout`.
- [ ] Improve onboarding for public users with clearer trip privacy, traveler split ratios, and country/currency defaults.
  - Proof: `welcome-guide-smoke`, `smoke:trip-intelligence`, `smoke:security`.
- [ ] Add a simple user-facing data health check: trip count, active trip, receipt count, and local/cloud freshness.
  - Proof: `npm run smoke:settings`.

### P2 - Trip Intelligence And Travel Context

- [ ] Use Trip Intelligence more deeply across React: destination theme, currency, timezone, and weather region should visibly affect the app.
  - Proof: `npm run smoke:trip-intelligence`, `npm run smoke:weather`, visual check.
- [ ] Improve weather fallback messaging: WeatherAPI, Open-Meteo, coordinate/geocode fallback, cache age, and out-of-forecast-range behavior.
  - Proof: `npm run smoke:weather`.
- [ ] Add country-specific travel helpers for Korea/Japan/Taiwan, starting with weather, transport category hints, and currency defaults.
  - Proof: targeted tests for each added helper.

### P2 - Stats And Budget Coach

- [ ] Add budget coaching copy: projected overspend, daily remaining budget, and category anomaly messages.
  - Proof: `npm run smoke:stats`.
- [ ] Clarify HKD-first versus destination-currency totals across Dashboard and Stats.
  - Proof: `npm run smoke:dashboard`, `npm run smoke:stats`.
- [ ] Add per-person fairness insight for shared spending and private代付.
  - Proof: `npm run smoke:stats`.

### P2 - Maintainability

- [ ] Split `Settings.tsx` into smaller components without changing behavior.
  - Proof: `npm run smoke:settings`, `npm run typecheck`, `npm run build`.
- [ ] Split `Dashboard.tsx` and `Scan.tsx` around presentational sections and workflow handlers.
  - Proof: affected tab smokes plus `npm run smoke:mobile-layout`.
- [ ] Add focused pure-function tests for budget math, currency conversion, sync merge, and weather slot extraction.
  - Proof: new test command or existing smoke coverage plus `npm run typecheck`.

### P3 - Premium Polish

- [ ] Add tasteful reduced-motion-aware microinteractions to high-value controls only.
  - Proof: tab smoke plus reduced-motion sanity check.
- [ ] Add a React app visual QA contact sheet generator similar to the compact audit workflow.
  - Proof: generated contact sheet path and no console/page errors.
- [ ] Explore PWA install polish: app icon, splash metadata, offline empty states, and update prompts.
  - Proof: build output check and browser smoke.

## Completed Tasks

- [x] 2026-06-08 HKT: Added the React Settings `同步信心中心` top-level panel. It shows Supabase readiness, Personal Notion mirror readiness, pending queue count, last sync timing/status, local/Supabase cache scope, and sync errors. Verified with `npm run typecheck`, `npm run build`, `npm run smoke:settings`, and `npm run smoke:mobile-layout`.
- [x] 2026-06-08 HKT: Added focused Settings smoke coverage for queued queue items, failed/error queue items, offline sync status, Supabase-only scoped cache mode, and Personal Notion connected mode. Verified with normal `npm run smoke:settings` and fake-env `SUPABASE_SETTINGS_SMOKE=1 npm run smoke:settings`.
- [x] 2026-06-08 HKT: Clarified React Settings backup/import/export wording with a visible safety panel: CSV and Backup JSON are current-trip only, portable backups exclude API keys/tokens/sessions/unlock secrets, and imports discard external cloud IDs, sync queues, stale trip links, and credential fields. While verifying the broader Settings blast radius, also fixed duplicate-person-id React key warnings, quieted the disabled-IndexedDB smoke path, and restored Stats budget compass totals to follow the chart filter. Verified with `npm run smoke:settings`, `npm run smoke:stats`, `npm run smoke:history`, `npm run smoke:timeline`, `npm run smoke:final-nav`, `npm run smoke:mobile-layout`, `npm run typecheck`, `npm run build`, and `npm run security:scan`.
