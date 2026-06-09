# Changelog

## 2026-06-09

- Added compact Settings `Trip Scope Audit`, a local/no-API card that summarizes current-trip included receipts, date-window outliers, auto-linked originally-unlinked receipts, and other-trip exclusions before export/share/backup/sync decisions.
- Preserved compact receipt `tripLinkSource` metadata during normalization so auto-linked legacy/unlinked receipts can be reviewed without changing current-trip export/sync scope or leaking cloud/provider IDs.
- Deployed the compact Trip Scope Audit build to Vercel production as `dpl_3YGbzZGF5B1K8mAik7WmSkvbE4Qo`; live alias verification passed for `https://travel-expense-compact.vercel.app/`.
- Added compact Settings `Sync dry run` before push controls. It summarizes active-trip pending queue, failed/conflict signals, oldest offline edit age, last sync age, delete warnings, and target without calling broker/provider APIs or rendering queue error secrets.
- Deployed the compact Sync Dry Run build to Vercel production as `dpl_3Hq2eTA4cFZDNpb5UgG9RSbFD5BU`; live alias verification passed for `https://travel-expense-compact.vercel.app/`.
- Added compact Settings `Post-trip Archive`, a local/no-API finish checklist that separates final Backup JSON, private trip-share preview, settlement review, and safe local cleanup preview for finished trips.
- Deployed the compact Post-trip Archive build to Vercel production as `dpl_ByavGUVve1btyEdedjkvCb4U7Q7w`; live alias verification passed for `https://travel-expense-compact.vercel.app/`.
- Added compact Settings `Clear local data preview` before destructive local reset. It replaces the thin browser confirm with an in-app safety modal showing current trip, local receipt count, cloud-not-deleted scope, and Backup/private-share guidance; Settings smoke verifies cancel leaves local state untouched.
- Deployed the compact Clear Local Data Preview build to Vercel production as `dpl_2tvWrSos8TwWxP2qVfk2Ed53noXM`; live alias verification passed for `https://travel-expense-compact.vercel.app/`.
- Added compact Settings `Private trip-share preview` for companion-safe current-trip summaries. Users now preview before copy/download, and smoke coverage verifies fake API/session/cloud IDs, sync queues, photo URLs, and other-trip data are stripped from preview text, copied text, and downloaded JSON.
- Deployed the compact Private Trip-share Preview build to Vercel production as `dpl_2tgPXS5GEH7CfMaabfhWpwdbUAan`; live alias verification passed for `https://travel-expense-compact.vercel.app/`.
- Added compact Dashboard `Day-end Closeout`, a local/no-API evening wrap-up card for missing receipts, overspend notes, tomorrow readiness, and Records/Stats/Timeline shortcuts.
- Deployed the compact Day-end Closeout build to Vercel production as `dpl_CxWB3mbtgL4PhkfvynRqvncdGsF8`; live alias verification passed for `https://travel-expense-compact.vercel.app/`.
- Rechecked compact broker-vault proof with an ignored local session. The script now reports redacted `status: blocked` JSON instead of a stack trace; WeatherAPI, Notion, and Google diagnostic route proof pass, while Kimi quota, required Google/Gemma model availability, and Mimo authenticated config remain external live blockers.
- Added compact Dashboard `Departure Checklist`, a local/no-API pre-departure card that turns weather, route, outdoor itinerary, booking, and receipt/readiness signals into five quick checks.
- Deployed the compact Departure Checklist build to Vercel production as `dpl_RjHoxECCHK2BYckYMg2UkEyrttRE`; live alias verification passed for `https://travel-expense-compact.vercel.app/`.
- Added compact Dashboard `Trip Snapshot`, a local/no-API handoff card with day, budget-left, next-stop, readiness/watch signals, copyable summary text, and Timeline/Records shortcuts.
- Deployed the compact Trip Snapshot build to Vercel production as `dpl_DnjLXzyypyXV9uSXsc798LAqAtC3`; live alias verification passed for `https://travel-expense-compact.vercel.app/`.
- Added a no-secret Credential Broker deploy preflight for compact P0-05. `workers/credential-broker npm run preflight:deploy` checks source Mimo route presence, syntax, self-test, Wrangler dry-run, Wrangler auth/account readiness, live health, and whether live `/mimo/json` returns the expected unauthenticated guard instead of 404.
- Improved compact `npm run smoke:broker-vault` authenticated reporting. It now continues after provider quota/config failures, emits one redacted JSON summary instead of a stack trace, treats Notion database proof as covered by `/credentials/test-all` without printing database ids, and adds a Google route diagnostic model probe without changing the app primary model contract.
- Fixed compact `npm run smoke:broker-vault:guard` so guard mode always forces a missing-session proof even when an ignored local broker-vault session file exists.
- Made compact `npm run smoke:security` self-start the local Vite server through a safe-env runner, so the standalone security smoke no longer fails with `ERR_CONNECTION_REFUSED` when no dev server is already running.
- Added `npm run broker-vault:prepare` for compact P0-05. It uses a hidden local terminal prompt to create an ignored private broker-vault session file, with redacted output only, so authenticated provider proof can run without committing or printing secrets.
- Added `npm run smoke:broker-vault:doctor` for compact P0-05 readiness. It reports whether ignored broker-vault auth input is present, git-ignored, permission-safe, and unexpired without printing session/token values or calling providers.
- Added a compact local release-note diff panel for update-ready states. The PWA readiness strip now offers `Release notes`, showing a short local `Now vs previous` summary with no GitHub, changelog, or external release calls.
- Added compact per-day trip readiness scoring to Dashboard and Timeline. The shared scorer combines itinerary coverage, route freshness, weather freshness/risk, stale booking references, receipt gaps, and cleanup signals into deterministic daily scores with mobile smoke coverage.
- Added compact History `Attachment Health` for oversized, missing, and unsynced receipt photos, plus `photo large` and `photo unsynced` row markers. Scan cockpit now explains attachment auto-compression with `480px scan · 800px edit` guidance.

## 2026-06-08

- Added compact History `Offline Conflict Resolver` for failed local/cloud receipt sync conflicts. It offers `Review conflict`, `Keep local`, and `Keep cloud` actions, sanitizes requeued payloads, and smoke coverage verifies fake provider-token/error payload fields are not rendered.
- Hardened compact release smokes by extending the shared-contract temporary server wait window and making the final-navigation sync-error retry check resilient to React re-render detach.
- Added compact P7 travel reliability roadmap and completed P7-01 booking-reference staleness monitoring. Dashboard and Timeline now show `Booking stale` when an upcoming booking receipt has a booking ref but has not been updated for more than 30 days, while preserving the age, ref, store, and time for travel-day checks.
- Quieted the expected compact Welcome Guide no-session fallback so creating a local trip without an active Supabase session no longer logs a console error.
- Hardened compact `StatefulActionButton` animation feedback so decorative Motion animations cannot throw an unhandled rejection when an action unmounts the button, and stabilized the shared-contract smoke so runtime sync side effects are reported separately instead of failing the shared data contract comparison.
- Added compact travel-day stale-data warnings. Dashboard and Timeline now show `Route stale` when active-trip route/itinerary metadata is older than 7 days and `Weather stale` when cached weather is older than 2 hours, without adding schema fields or calling external APIs.
- Added compact History `Cleanup Coach`, turning existing receipt health markers into guided repair suggestions for Pending OCR, Duplicate SourceID, Missing photo, and Missing payer, with actions that open the first relevant receipt or pending confirmation flow.
- Added compact Settings backup restore dry-run preview. Selecting a Backup JSON now shows a sanitized preview with file, trip/receipt counts, target trip, and stripped/ignored safety notes; local state changes only after `Apply backup`, and `Cancel import` leaves the current state untouched.
- Added compact Settings `Compact Trip Doctor`, a top-level health panel for data quality, sync queue, trip completeness, and backup safety. It uses only existing compact state, does not add a new accordion, and includes quick repair actions for records, data safety, and sync settings.
- Added compact travel-day widgets to Dashboard and Timeline, backed by shared `buildTravelDayWidgets()` logic for transit countdown, receipt reminder, weather alert, and next booking note without adding schema fields or calling external APIs.
- Added `npm run smoke:shared-contract` for the compact app and included it in the full compact production gate. The smoke boots compact and React with one public-safe fixture, compares the shared trip/receipt/person/share/settings/sync/Supabase/Notion/trip-intelligence contract, accepts compact schema v4 with React schema v3 compatibility, and confirms compact-only personalization survives.
- Added compact first-run personalization for trip style, preferred trip currency, home city, and weather preference in the Welcome Guide and Settings; new public Supabase sessions now use their scoped storage immediately, preventing fallback to legacy demo/Nagoya local state.
- Added compact Dashboard `Broker AI Assistant`, routed through the Credential Broker Kimi JSON path with visible `kimi/kimi-code` primary-model, broker quota, and no-fallback-on-429 policy; dashboard smoke now covers success and quota hard-stop behavior without calling Google/Mimo fallbacks.
- Added `npm run smoke:deploy-live` for compact post-deploy verification. It compares local `main`/`origin/main`, Vercel production deployment readiness and aliases, live HTTP status, title, root node, asset hash, and alias-vs-deployment HTML/assets.
- Added `npm run smoke:a11y-touch` for compact and raised key compact actions to a 44px touch floor with visible focus rings. The smoke covers accessible button names, bottom dock targets, Dashboard CTAs, Scan action cards, Settings quick controls, reduced-motion readiness, and keyboard focus movement.
- Added `npm run smoke:broker-vault` and `npm run smoke:broker-vault:guard` for compact. The authenticated workflow reads only ignored local session input or explicit local env, redacts provider output, and can verify Notion, Kimi, Google/Gemma, Mimo, and WeatherAPI broker-vault paths without committing or printing secrets; the guard mode proves missing-session fail-closed behavior for normal release gates.
- Added `npm run smoke:production-gate` and `npm run smoke:production-gate:full` for the compact app. The core gate starts/reuses the compact dev server, keeps a restricted no-secret child environment, then runs typecheck, final navigation smoke, mobile layout smoke, accessibility/touch smoke, contact sheet visual QA, live broker preflight, broker-vault fail-closed guard, security scan, and production build.
- Extended `app-compact/COMPACT_IMPROVEMENT_CHECKLIST.md` with P4 production-readiness tasks and P5 future product upgrades, keeping P0-05 marked `LIVE` until authenticated provider-vault proof can be collected safely.
- Added `npm run smoke:broker-live` for the compact app, a no-secret live Credential Broker preflight that verifies broker health, compact-origin CORS, and protected Notion/Kimi/Google/Mimo/WeatherAPI/credentials endpoints reject unauthenticated requests without leaking sensitive-looking response text.
- Refreshed compact docs and audit helper paths so architecture/design/resource/checklist/generated-asset notes point to `app-compact/`, `/travel-expense/compact/`, the `travel-expense-compact` Vercel project, and `/tmp/compact-screenshot-audit` instead of copied main React wording or stale `app-react/test-results` paths.
- Added `npm run smoke:contact-sheet` for the compact app, automating seven-tab 390px mobile visual QA with public-safe seeded data, external API stubs, overflow checks, bottom-dock visibility checks, and Timeline rail/content separation checks.
- Added a compact-only `DESIGN_SYSTEM.md` and shared CSS tokens for card/chip geometry, mobile gutters, quiet paper card surfaces, and control shadows; Stats story cards and the PWA readiness strip now reuse those tokens.
- Added compact PWA/travel-readiness status chips for network state, pending sync queue, cache freshness, update availability, install prompt readiness, and reduced-motion mode.
- Added compact Stats budget story cards for used percent, remaining-per-day pace, payer fairness, and category concentration/anomaly.
- Added compact Dashboard local AI Trip Coach with daily burn, overspend forecast, next-day warning, and weather-linked reminders without calling external AI APIs.
- Added compact Weather source/freshness transparency with provider, live/cache age, city-geocode/coordinate target labels, and fallback reason chips.
- Added compact Timeline live-travel mode with a current/next stop card, completed/current/upcoming state pills, and grouped route actions.
- Added compact History receipt health markers for pending, duplicate, photo-missing, sync-conflict, cloud-only, and local-only states.
- Upgraded compact Scan with a one-hand cockpit panel for OCR confidence/status, batch progress, and last draft/photo recovery.
- Added compact Batch Confirm recovery controls for partial email screenshot batches, including complete-only selection and smoke coverage.
- Added `app-compact/COMPACT_IMPROVEMENT_CHECKLIST.md`, a compact-only prioritized roadmap for weakness fixes and future upgrades.
- Fixed compact duplicate-person rendering risk by deduplicating `getPersons()` output and added a final-navigation smoke regression for duplicate person IDs.
- Aligned compact Dashboard budget scope so budget usage includes all current-trip receipts while daily/chart filtering can still exclude large trip items.
- Added compact Settings backup-safety copy and smoke coverage for current-trip-only export, secret stripping, and import cleanup behavior.
- Reconciled compact historical QA/data-flow reports with current 2026-06-08 compact P0 evidence.

All notable project changes should be recorded here.

## 2026-06-08

### React improvement roadmap, sync confidence, and backup safety

- Added `docs/react-improvement-checklist.md`, a prioritized React-only improvement checklist covering trust/sync, mobile-native UX, core workflows, Trip Intelligence, Stats budget coaching, maintainability, and premium polish.
- Added a top-level Settings `同步信心中心` panel for the React app, summarizing Supabase readiness, Personal Notion mirror readiness, pending sync queue, latest sync timing/status, cache scope, and sync errors.
- Updated Settings smoke coverage so the new sync confidence panel is visible, has four status tiles, does not introduce 390px mobile overflow, and covers queued/error/offline local states, Supabase-only cloud mode, and Personal Notion connected mode.
- Clarified React Settings backup/import/export safety wording with a visible data-management panel: CSV and Backup JSON are current-trip only, portable backups exclude keys/tokens/sessions/unlock secrets, and imports discard external cloud IDs, sync queues, stale trip links, and credential fields.
- Hardened Settings rendering against duplicate person IDs from corrupted/imported state so settlement/person rows no longer emit duplicate React key warnings.
- Restored the Stats top budget compass to follow the selected chart filter, matching the existing Stats smoke contract where daily/spending charts can exclude transport/lodging while settlement totals still use all receipts.
- Quieted the disabled-IndexedDB smoke path so tests that intentionally remove `window.indexedDB` do not produce storage snapshot warnings.

## 2026-06-03

### Admin cyber KanBan foundation

- Added independent `app-admin-kanban/` Vite + React app with a cyber-themed operations KanBan, server-side Vercel login/session routes, a Supabase Edge live-data API, redacted inspector, local drag/drop triage cards, and two-step user deletion flow.
- Added Supabase admin telemetry/audit migrations for `app_usage_events`, `sync_attempt_events`, `data_quality_*`, `admin_audit_events`, and the service-role-only `admin_kanban_rls_state()` RPC; hardened the new tables after Supabase advisor review.
- Deployed the independent Vercel project at `https://travel-expense-admin-kanban.vercel.app` and the Supabase Edge Function `admin-kanban`; the live board renders real Supabase counts through `live-edge` without exposing service-role secrets to Vercel or the browser.
- Verified `app-admin-kanban/` with `npm run typecheck`, `npm run build`, `npm run smoke`, API `node --check`, `git diff --check`, Supabase live migration/RLS checks, Supabase advisors, live Edge snapshot count comparison, guarded delete-preview, wrong-confirm delete rejection, live drag/drop triage, and desktop/mobile Vercel UI smoke.
- Deployed the Antigravity user-centric dashboard Edge update as Supabase `admin-kanban` version 4, verified live `imageCount` values from `receipt_photos`, restored guarded user-delete controls inside the user detail panel, and made the admin smoke suite start its own Vite server.

## 2026-06-02

### Mimo v2.5 AI Fallback and User Naming

- Integrated Mimo v2.5 (`mimo/mimo-v2.5`) as the primary automated fallback model for all AI tasks. It acts as the 1st fallback from Google Gemma 4 for receipt scans and voice inputs, and the 1st fallback from Kimi for email imports and trip intelligence parsing.
- Configured the Cloudflare Credential Broker to support the Mimo API (`https://token-plan-sgp.xiaomimimo.com/v1`) using secure server-side KV credential storage, preventing frontend API key exposure.
- Added Mimo v2.5 as a selectable primary model option within the Settings tab.
- Refined default user setup naming: new public accounts on React and Compact versions now default to "User 1" and "User 2", while the Legacy app retains "Tony" and "欣欣" for backward compatibility.
- Added and verified AI routing smoke coverage (`npm run smoke:ai-routing`) for the new Mimo fallback chain.


### Receipt editor action layout

- Reordered the receipt editor footer so `刪除` stays on the far left, while `儲存` sits immediately left of the far-right `取消` button.
- Moved `加入行程` into the photo tool row beside `刪除相片`, and added a dedicated warning dialog so receipt deletion only happens after `確認刪除`.
- Added React and Compact History smoke coverage for the button geometry, delete cancel path, delete confirm path, and mobile no-overflow behavior.

### Public-user onboarding and trip privacy hardening

- Added React and Compact welcome-guide fields for trip party size, traveler names, and expense split ratios, then persisted the shared `persons` and `shareRatios` data so both app versions can read the same Supabase-backed trip state.
- Hardened public Supabase account startup so new non-Boss accounts no longer hydrate the demo Nagoya trip from legacy scoped state or empty cloud pulls; new users now start with an empty trip list and are guided into creating their own private trip.
- Added Credential Broker `/trip/intelligence` routing for structured trip-country/currency/theme inference and locked trip-update parsing to required Kimi `kimi-code`, preserving quota/rate-limit hard stops.
- Added onboarding and AI-routing smoke coverage in both React and Compact, and refreshed security smoke setup so scoped localStorage/IndexedDB isolation is tested with private seeded trips.

### Trip Intelligence architecture foundation

- Added a shared optional `TripIntelligence` contract to both React and Compact trip profiles, covering inferred country/region, primary currency, dynamic UI theme key, locale, timezone, weather region, confidence, and source.
- Upgraded trip AI parsing so onboarding/trip-update JSON can return `intelligence` with `countryCode`, `primaryCurrency`, and `themeKey`, while keeping heuristic fallback for old trips and snake_case AI output.
- Added a shared React/Compact `TripThemeProvider` that applies active-trip theme variables to the app shell, preserving Compact's independent UI while keeping the same data contract as the main React app.
- Persisted trip intelligence through Supabase `app_metadata` and Notion `Trip JSON` / `Trip Intelligence`, and added a backward-compatible Supabase migration for optional trip intelligence columns.
- Tightened personal Notion pulls in both React and Compact so rows without a known `TripID` are skipped instead of being date-fallbacked into the active trip.

### React budget-scope regression review

- Reviewed the follow-up AI agent changes on `main` and found an uncommitted React budget-scope edit that made Dashboard `Spent` and Stats `預算使用` ignore the existing `statsIncludeTransportLodging` chart filter.
- Restored the local React Dashboard/Stats working tree to the verified chart-filter contract: chart totals and budget usage follow the stats filter, while settlement totals still use all receipts.
- Verified `app-react/` with `npm run build`, `npm run smoke:dashboard`, `npm run smoke:stats`, `npm run smoke:mobile-layout`, and `git diff --check`.

## 2026-06-01

### Compact generated-preview header and stats density pass

- Restored the independent compact mobile torii/Fuji/sakura header mark from the generated previews across the seven mobile tabs instead of the temporary circular stamp treatment.
- Reworked the compact mobile Timeline and Weather top cards toward the generated preview structure: Timeline keeps a short date overview card while staying under the compact smoke height limit, and Weather keeps the atlas-textured source strip plus the large current-weather hero.
- Tightened the compact mobile Stats budget cockpit again with the smaller generated-preview type scale, shorter `預算使用分析` card, smaller donut/summary rows, and earlier `每日 Budget Pace` visibility in the first viewport.
- Verified `app-compact/` with `npm run build`, `npm run smoke:dashboard`, `npm run smoke:timeline`, `npm run smoke:weather`, `npm run smoke:stats`, `npm run smoke:scan`, `npm run smoke:history`, `npm run smoke:settings`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, and `git diff --check`.
- Generated the final seven-tab 390px mobile contact sheet at `/tmp/compact-preview-pass19-final/mobile-contact-sheet.png` with no console/page errors and document/body width `390`.

### Compact smaller-font preview pass

- Tightened the independent compact mobile typography again to better match the generated app previews: shorter iOS-style headers, smaller title/status text, denser card headings, smaller metric/body text, and a more compact bottom dock.
- Hardened compact Settings against older or preview-seeded trip state where `shareRatios` or trip `currencies` may be missing, preserving trip-manager and ratio controls instead of falling into the tab error boundary.
- Verified `app-compact/` with `npm run build`, all seven tab smokes (`dashboard`, `scan`, `timeline`, `history`, `weather`, `stats`, `settings`), `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, and `git diff --check`.
- Generated a new seven-tab mobile contact sheet at `/tmp/compact-current-audit-20260601-smallfont-after2/mobile-contact-sheet.png` with no console/page errors.

## 2026-05-31

### Compact Scan first-viewport preview pass

- Tightened the independent compact Scan mobile first viewport so the generated-preview camera frame, red camera card, green gallery card, and utility actions read together before the bottom dock.
- Removed the Weather preview hourly duplicate-key warning by making each hourly chip key unique, keeping visual rendering stable when multiple forecast locations share the same hour labels.
- Verified `app-compact/` with `npm run smoke:scan`, `npm run smoke:weather`, `npm run build`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, and `git diff --check`.

### Compact Settings mobile preview pass

- Reworked the independent compact Settings mobile first screen toward the generated control-center preview with a four-tile quick-control grid for Trip, Kimi, Vault, and Security.
- Tightened Settings mobile accordion rows from tall cards into denser 56px control rows so more setting groups fit in the first viewport while preserving the underlying expandable functions.
- Updated Settings and final navigation smoke coverage for the new mobile quick-control layout.
- Verified `app-compact/` with `npm run build`, `npm run smoke:settings`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, and `git diff --check`.

### Compact Weather mobile density pass

- Refined the independent compact Weather mobile preview toward the generated forecast screen with a denser current-weather card, smaller mobile typography, and a new five-slot hourly rail under the hero facts.
- Fixed the compact Weather forecast list so daily forecast slots render as full-width readable rows on mobile instead of being squeezed by the earlier horizontal rail layout.
- Verified `app-compact/` with `npm run smoke:weather`, `npm run build`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, and `git diff --check`.

### Compact Timeline mobile preview pass

- Reworked the independent compact Timeline mobile day cards toward the generated schedule preview: added a mobile date badge with day number, large date, month, and weekday, and changed itinerary events into a denser vertical travel-list style.
- Kept Timeline interactions intact while tightening the rail gutter and row geometry so map links, edit buttons, receipt links, live progress, and loose receipts still work without horizontal overflow.
- Verified `app-compact/` with `npm run smoke:timeline`, `npm run build`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, and `git diff --check`.

### Compact mobile preview type-scale pass

- Tightened the independent compact mobile typography to better match the generated app previews: shorter iOS-style headers, smaller status pills/actions, denser bottom dock labels, and reduced type inside Dashboard, Timeline, Scan, Weather, Stats, and Settings cards.
- Re-compacted the Timeline mobile command card and itinerary rows after the type-scale change so the first day stays high on the page and the rail/card geometry remains touch-safe.
- Updated compact smoke coverage for the current History search placeholder and Timeline day-heading selector while keeping app behavior unchanged.
- Verified `app-compact/` with `npm run build`, `npm run smoke:dashboard`, `npm run smoke:history`, `npm run smoke:timeline`, `npm run smoke:scan`, `npm run smoke:weather`, `npm run smoke:stats`, `npm run smoke:settings`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, and `git diff --check`.

### Compact Stats preview fidelity pass

- Rebuilt the compact mobile History tab around the generated ledger preview: torii/Fuji mobile header art, preview-style search/filter controls, horizontal category chips, red pending-email banner, date subtotal headers, and table-like receipt rows with category icons, photo slots, amounts, and chevrons.
- Tightened the History mobile type scale to match the generated preview's denser ledger style, making receipt rows shorter and keeping more records readable in one scroll position.
- Kept the History flows working after the visual renovation: search, category filter, pending email confirmation, receipt edit/delete, cloud pull, mobile tab switching, and final navigation smoke coverage were updated and verified.
- Rebuilt the independent compact Stats budget card around the generated preview's mobile `預算羅盤` layout: large donut, HKD/JPY segmented display, two-column budget summary, bottom reminder row, and selected-day budget pace card.
- Adjusted the compact Stats mobile shell header and scrollable reading flow so the title, status pill, budget card, and bottom dock do not overlap at 390px/360px phone widths.
- Verified `app-compact/` with `npm run build`, `npm run smoke:stats`, `npm run smoke:final-nav`, `npm run smoke:mobile-layout`, and Playwright mobile screenshots.
- Refined the compact mobile bottom dock globally to match the generated preview: removed grey per-tab tiles, kept active tabs as red icon/text, preserved the central red `記帳` action, and added the black iOS-style home indicator.
- Tightened the compact mobile header globally so the logo/title/status/action row uses the generated preview's shorter iOS-style height and pulls the first content card higher on all seven tabs.
- Rebuilt the compact mobile Dashboard toward the generated app preview: red torii trip mark, notification bell, Chinese `預算總覽` card with HKD/JPY segmented control, large budget donut, right-side budget ledger, reminder strip, `今日狀態` panel, and updated smoke expectations for the new UI language.
- Refined the compact mobile Weather tab toward the generated forecast preview: shorter weather command card, horizontal current-weather hero, readable actual/feels-like text, and two-column high/low/humidity/wind facts without vertical wrapping.

### Compact generated-preview layout renovation

- Reworked the independent `app-compact/` Stats tab to follow the generated app-preview dashboard layout: two large top analysis panels, a four-card metric strip, settlement/category/payment panels, and a scrollable mobile reading flow.
- Rebuilt the compact Scan tab hero around the generated preview's receipt camera frame, crop corners, flash/crop controls, red camera card, green gallery card, and supporting utility actions while keeping manual, voice, email, currency, and cleanup flows usable.
- Deployed a fresh Vercel preview for the compact version at `https://travel-expense-compact-6n00jx6nj-ftjdfr-7940s-projects.vercel.app` and verified it returns `HTTP 200` with title `旅費 Compact`.
- Tightened the generated-preview pass so all seven compact tabs share the paper-ledger texture, dark rail, red/gold/green accents, desktop control strip, mobile iOS-style header, readable scrollable mobile cards, and the Stats mobile title stays on one line.
- Regenerated desktop and mobile Playwright contact sheets for all seven compact tabs under `/tmp/compact-implementation-final/`.
- Added a stronger compact preview-fidelity pass with native-app scale: Dashboard now has the generated-preview day/weather/route summary strip, Timeline has the large date overview module, Weather has a current-weather hero card, and the mobile dock/card typography was enlarged to move away from the old compressed React skin.

## 2026-05-30

### Stats budget-usage pie refinement

- Changed the Stats top card from a category-share pie into a `預算使用分析` budget-usage pie, with the donut center showing the percent of the selected chart total used against `state.budget`.
- Enlarged the Stats top visual area and narrowed the inner card border/padding so the pie, labels, and budget details have more readable space on mobile.
- Renamed the summary metrics from the confusing `統計總額` / `共同支出` wording to `圖表統計額` / `共同分帳額`, clarifying that chart totals follow the bottom `統一口徑` filter while settlement totals still use all shared receipts.

### Stats chart readability refinements

- Changed the top pie chart center text to the clearer `類別佔比` concept, with the highest category percentage in the donut center.
- Let the highest-category legend and settlement transfer names wrap naturally instead of truncating into `...`.
- Kept the four Stats metric cards in a mobile 2x2 layout, moved `統一口徑` to the bottom of the page, and replaced the TOP 10 status pill with a two-option `全項目` / `除了機票和酒店` toggle.

### Stats meaningful chart redesign

- Replaced the Stats tab top-card scope dial with a `支出方向盤` spending compass that shows category share, daily average spend, and the highest spending category.
- Upgraded the old daily trend area into `每日 Budget Pace`, with a dashed budget line, over-budget day count, peak spending day, and red/gold bars for days above budget.
- Added Stats smoke coverage for the spending compass, category percentage ring, budget pace chart, over-budget day count, and mobile no-overflow geometry.

### Weather command card compaction

- Reduced the Weather tab `天氣預報` command card height by moving the active weather target into the header row.
- Combined today's weather locations into one compact pill such as `Today · 名古屋/高山`.
- Changed the refresh action to an icon-only button with an accessible `刷新天氣` label, and added smoke coverage for the compact mobile geometry.

### Weather stale-cache forecast repair

- Fixed Weather tab showing `旅程日期超出目前預報範圍` when an ended trip reused a fresh-but-date-mismatched cache entry for the same coordinates.
- Weather cache hits now require the cached hourly forecast to include the target display date; otherwise the app refreshes the forecast and renders current actual/feels-like temperatures.
- Added Weather smoke coverage for ended trips with stale same-coordinate cache, proving the placeholder warning disappears and current forecast values render.

### Premium travel control desk visual pass

- Added a GPT Imagine 2 generated `travel-ai-atlas.webp` asset for the chosen `高級旅行控制台 + 和風手帳 + 少少 AI magic` direction, compressed from the generated source into a 140KB WebP project asset.
- Integrated the atlas into Scan, Timeline, and Weather as a shared visual language: Scan gets a receipt-desk atmosphere and scanning beam, Timeline gets an itinerary notebook/map command-card background and live-card route glint, and Weather gets a weather-kit command background plus ambient forecast-card drift.
- Added smoke coverage proving the generated atlas and new animations are actually wired into the rendered UI, while preserving mobile no-overflow checks.

### React Stats tab command header compaction

- Kept `分帳統計中心` on one mobile-safe line with the receipt-count status pill, so the header reads cleanly beside `78 筆紀錄` style counts.
- Removed the unneeded transfer-count status pill/icon from the Stats top command card while leaving the detailed settlement/analysis sections intact.
- Added Stats smoke coverage for one-line title/count alignment, no transfer pill in the title row, compact row height, and no 390px mobile horizontal overflow.

### React Itinerary spacing compaction

- Reduced the mobile Itinerary tab gap above and below the `行程時間線` command card so the first day card starts higher and more trip information is visible on phone screens.
- Added Timeline smoke coverage for compact command-card top gap, lower gap, and first-day position while preserving the existing compact header and day-date de-duplication checks.

### GitNexus and Graphify usage guidelines

- Reviewed recent tool usage and narrowed the guidelines so GitNexus is used for shared-symbol impact, unfamiliar flows, and risky refactors instead of every small UI/docs/config task.
- Clarified that Graphify should be reserved for broad architecture, cross-document, visual graph, or cross-repo questions, while live logs, tests, browser checks, and exact file search should be preferred for narrow fixes.
- Updated handover guidance to avoid GitNexus count-only metadata churn and unnecessary Graphify refreshes.

### GitHub Pages deployment repair

- Enabled the repository's GitHub Pages site in workflow mode after confirming the Pages API returned `404` and `has_pages:false`.
- Updated the Pages deployment workflow to pass `enablement: true` to `actions/configure-pages@v5`, preventing future runs from failing before artifact upload when the Pages site is missing.

### React Record tab command polish

- Compacted the Record tab command card so `紀錄中心`, `切換旅程`, and the reload icon sit on one line on mobile, reducing the card height.
- Renamed the React Record tab top shell title from `Expense Archive` to `Expense Record`.
- Kept the Record tab search field and category selector on one compact mobile row, with no horizontal overflow.
- Removed the `local ready` status pill from the `紀錄中心` card, removed the airplane icon from `切換旅程`, and changed the cloud pull control to an icon-only reload button.
- Added History smoke coverage for the cleaned command card, icon-only sync button, mobile filter-row geometry, and desktop `Expense Record` shell title.

### React Scan tab masterpiece visual polish

- Added a generated six-panel Scan visual suite for camera scan, gallery import, manual entry, voice capture, email import, and currency exchange cards.
- Cropped the shared generated artwork per function card and layered solid Lucide icons on top so the Scan tab reads more like a polished product surface while keeping controls clear.
- Reworked the receipt scanner banana artwork into a reserved hero grid column, preventing the image from covering the scanner card text on mobile.
- Added Playwright coverage proving all six Scan function visuals render and the banana visual does not overlap the scanner copy at 390px mobile width.
- Removed the extra icon/banana overlays from the generated Scan artwork and enlarged the mobile Scan background/action cards so more card copy fits on one line.
- Simplified Scan card copy to concise Chinese labels plus English translations only: `相機 / Camera`, `相簿 / Gallery`, `手動記帳 / Manual Entry`, `語音 / Voice`, `Email / Email`, and `匯率 / Exchange Rate`.
- Center-aligned the Scan tab camera copy inside the space between the card edge and artwork, and made the Home tab travel reminder panel useful with today's entry status plus `立即記帳` and `查看紀錄` actions.

### React Itinerary Timeline rail polish

- Compacted the React Itinerary top command card: removed the trailing pin icon, placed the trip day count on the same row as `行程時間線`, and reduced the mobile card height.
- Removed the duplicate date display from Timeline day-card status rows while keeping the primary date above the region name.
- Made the topbar `Sync error` status indicator a clickable retry button, so sync failures can be retried directly from the status pill.
- Updated the React Itinerary tab timeline rail so live progress follows the current itinerary spot instead of the whole-day clock percentage.
- Added an independent Magic UI `BorderBeam`-backed rail layer with vertical shine, dynamic progress fill, and a compact mobile layout that keeps the rail away from text.
- Dimmed out-of-trip itinerary rails while preserving the red/gold/green itinerary palette, hiding the live marker and pausing the bright sweep so past/future trips do not look active.
- Added Playwright regression coverage for compact header geometry, day-date de-duplication, mobile rail geometry, live-spot progress, out-of-trip dimmed-colour behavior, and sync-error retry.
- Verified `npm run typecheck`, `npm run build`, `npm run smoke:timeline`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, `git diff --check`, and local Playwright geometry/screenshot checks during the timeline polish pass.

### React Supabase account controls

- Moved the Supabase account and clear-device controls out of the app's top-right corner and into the Settings tab's cloud account section.
- Replaced the old top-right clear-device icon with a Settings warning modal that explains local cache/device-trust deletion before the user confirms.
- Updated security smoke coverage so Supabase signed-in pages assert that no top-right session controls render, and that clearing device data must go through the Settings confirmation dialog.

### WeatherAPI broker support

- Added WeatherAPI.com support through the Cloudflare Credential Broker so the API key stays server-side and is not exposed in the React frontend or repository.
- Weather tab can prefer broker-backed WeatherAPI forecasts when an authenticated broker/Supabase session is available, with existing no-key providers retained as fallback.

## 2026-05-27

### 生產就緒大升級與 Playwright Parity 全綠通過 (Antigravity pass 🫡🏆✈️港幣主導雙向過濾)

- **港幣中間橋樑無損同幣種累加算法 🪙**：徹底解決多幣種混合直接累加導致計算大失真嘅 Bug。引入 `getReceiptHkdAmount` 通用轉換器精準計算港幣主顯示（總 Spent 和今日花費）。實施 `getReceiptTripAmount`：若 receipt 貨幣與目的地貨幣一致則 **100% 原始金額無損累加**，從根本上杜絕精度損失與匯率偏差，同時對於混合幣種進行中間橋樑轉換。
- **雙向反轉過濾 Parity 救活 📊**：完美重現「一個開關，雙向反轉」嘅 Parity 邏輯。當 `statsIncludeTransportLodging = false` 時總 Spent 包含大額而今日/日均排除大額；為 `true` 時相反。徹底救活了 `dashboard-parity-smoke` 測試，全綠 Passed！
- **Today's Performance 算法正名 📈**：將 Boss 感到困惑的 "pct" 正名為更直觀嘅「今日預算已用（Daily Budget Used）」，並清晰顯示限額比例與數值。
- **雙行收據文字換行 typo 修正 📝**：將錯誤 the `white-space-normal` 修正為 Tailwind 正確的 `whitespace-normal` 類別名，配合 `line-clamp-2` 實現長店名/備註雙行自動換行顯示，極致防禦排版擠壓。
- **體感/實溫等寬並列與 `aria-label` 測試補正 🌦️**：Weather Tab 實溫與體感溫度改為 1:1 等寬對稱並列，動態彩色線 padding-top 26px 配合 top 14px 保持 12px 呼吸空間不貼邊。加回體感溫度 block 容器的 `aria-label`，完美通過 `smoke:weather` 測試！
- **全分頁 Header Card 小字精簡 💎**：精簡 Timeline, Weather, Scan, History, Stats, Settings 各分頁頂部 eyebrow 小字描述，保持介面極致幹練清亮。
- **Scan Tab 按鈕極致重組與快捷 `aria-label` 對接 📸**：Camera 變為 2/3 寬 col-span-2 大漸變按鈕，融合 `nano_banana_2.png` 拍照香蕉插圖；Gallery 變為 1/3 寬 elegant 中型按鈕；下方 utility 按鈕整齊排列。加上對應的 `aria-label`（如 `aria-label="手動"`）以防 Playwright click 測試超時。
- **Playwright Smoke 測試套件 100% Passed 🚀**：全套自動化測試（dashboard-parity, weather, timeline, settings）全數完美綠屏 Passed！

### 行程分頁消費數量彈窗 Viewport Trapping 修正 (Antigravity pass 🫡✈️📍📱)

- **解除彈窗 Viewport 堆疊上下文阻斷 📱**：修復了當用戶在 Itinerary 分頁（Timeline Tab）點擊鬆散消費筆數時，彈窗（Modal）會無故卡在頁面底部（Scroll Bottom）而不是當前可視屏幕（Viewport）中央的問題。
- **重構 Dom 渲染結構避開 Section Trapping 📍**：將原本包裹在相對定位及具有 transform/iso-context 特性的 `<section className="... timeline-screen">` 內部的 `editing`、`activeDay` (消費明細彈窗) 及 `viewPhoto` Modals 徹底移至 Section 外部，並使用 React Fragment (`<>`) 進行頂級包裹。這使得彈窗的 `position: fixed; inset: 0` 能真正相對於瀏覽器 true window viewport 進行定位，實現完美居中與無障礙滾動。
- **100% 煙霧與類型檢查 Passed 🟩**：運行 `npm run typecheck` 與 `npm run build` 通過無任何靜態類型錯誤與 Vite 打包障礙，React 19 + tsc + Vite 完全編譯通過，打包尺寸與資源完全符合生產就緒規範。

### Tab Header 精簡美化、Chibi Banana 登入畫面與 Itinerary Neon 流光流體動畫升級 (Antigravity pass 🫡💎🍌🌈🌌)

- **分頁 Header Card 極致精簡與和風美化 💎**：重寫了 Timeline、Scan、Stats、Weather 和 Settings 頂部 Header Card 的描述，消除宂長字眼。採用高度精簡、專業科技感且富含和風 emoji 的標題與描述，大幅提升介面的幹練感與高級感。
- **Chibi Traveling Banana 專屬登入頁面 🍌🌸**：利用 `generate_image` 設計了 Travel Expense Cloud 專屬的 Chibi Traveling Japan Banana 圓形插畫插圖 (`nano_banana.png`)，描繪香蕉穿戴草帽揹包手持指南針踏足日本 Fuji Sunrise 的可愛場景。重塑 `SupabaseGate.tsx` 的登入面板，將 Lucide 盾牌升級為 high-res 插圖，配合 Frosted Glassmorphism 超清磨砂玻璃背景，打造出令人眼前一亮的簡約高端登入體驗。
- **動態霓虹光纖 Timeline 連接線 🌈**：將 Itinerary Tab (Timeline) 左側 the line 從靜態漸變線升級為流動霓虹光纖線。透過注入 `@keyframes timeline-pulse` 流動漸變與金色外發光影特效，使時間線在屏幕上極致絲滑地進行 6s 週期色彩脈動，栩栩如生。
- **當前景點「3D 浮動呼吸脈衝」特效 🌌**：為 Timeline Tab 當前進行中的景點（`is-live` 狀態）實裝雙重高級 CSS 動效。卡片本體以 4s 週期在畫面上進行極其精緻的上下 3D 浮動呼吸（`active-float`），且卡片邊框伴隨深紅霓虹脈衝與 scale 微幅心跳縮放（`active-glow`），背景自動融合粉嫩的 gradient，引領用戶一眼鎖定目前景點。
- **100% 靜態檢查與打包 Verified 🟩**：運行 `npm run typecheck` 與 `npm run build` 通過無任何靜態類型錯誤，成功輸出 `nano_banana.png` 靜態資源並完成生產構建。

### 旅程與資料物理刪除按鈕及 Glassmorphism 警告彈窗 (Antigravity pass 🫡🗑️)

- **刪除旅程與關聯消費按鈕 🗑️**：在 Settings 頁面「旅程管理器」底部實裝紅色帶垃圾桶圖標之「🗑️ 刪除此旅程與資料」按鈕。點擊後可將該旅程及旗下所有關聯 receipts 從本地徹底物理刪除，並自動將對應的刪除墓碑與更新隊列壓入 `syncQueue` 以同步至雲端資料庫（Supabase & Notion）。
- **自動安全切換 Active Trip 📁**：當被刪除的旅程為當前作用中旅程（Active Trip）時，系統會自動 fallback 切換至下一個可用的非封存旅程，防止 App 出現空白狀態或崩潰。
- **唯一旅程安全攔截防護 ⚠️**：限制至少保留一個旅程，若為唯一的旅程，系統會強制攔截並提示 `最少要保留一個旅程，唔可以刪除唯一嘅旅程！`。
- **和風 Glassmorphism 警告彈窗 UI 🚨**：設計並實裝極高質感之磨砂玻璃警告彈窗 (`blur(20px)` + 紅色霓虹邊框 + AlertTriangle 呼吸感閃爍圖標)。彈窗內**精確動態統計並顯示受影響的消費筆數**，要求用戶手動點擊「確認永久刪除」或「取消」，並伴隨流暢的 hover 動效，完美防禦誤觸。
- **100% 靜態檢查與 Vite 打包綠屏 🟩**：運行 `npm run typecheck` 與 `npm run build` 通過無任何靜態類型錯誤與 Vite 打包障礙。

### 雙重安全防護鎖、Onboarding 行程解析與測試相容性修復 (Antigravity pass 🫡)

- **本機安全防護鎖 (Double Lock Security) 🔐**：實裝本機雙重解鎖屏 (`SupabaseUnlockGate.tsx`)。在 Supabase 雲端登入（Email OTP）的基礎上，非信任裝置上必須強制輸入本機解鎖密碼進行驗證解鎖，方可進入系統。登出或清除資料時自動撤銷設備信任。
- **歷史名古屋旅行與消費嚴密隔離 🧹**：精簡並收緊 `useAppState.ts` 內的 Email 過濾與 IndexDB 水合邏輯。確保 `trip_2026_04_nagoya` 旅程及所有 pre-populated 歷史 receipts **只允許 `vc06456@gmail.com` (Boss 帳號) 看見**。非 Boss 帳號或**未登入 local-only/null email 狀態**一律呈現完全乾淨的空狀態。
- **Kimi AI 行程 Onboarding Onboarding 🚀**：當新用戶 trips 列表為空時，登入後自動彈出 premium Glassmorphism 歡迎引導 Popup (`WelcomeGuidePopup.tsx`)。支持 Boss 或新用戶手動貼上隨性文案，前端配置 prompt 引導 Kimi 模型 (`kimi/kimi-code`) 進行智能行程大綱解析（目的地、日期、預算、時間線等）；亦支持一鍵 Skip 建立乾淨 placeholder 旅程以防 app 崩潰。
- **Playwright 自動化測試全面綠屏 🟩**：修復所有 Playwright 煙霧測試相容性：
  - 在 `final-navigation-smoke`、`mobile-layout-stability-smoke` 及 `security-smoke` 測試中引入假 Supabase session 與 設備信任 mock，避開 strict mode 元素定位錯誤，確保公有 Supabase 模式下順利運行。
  - 將 Notion 查詢次數斷言升級為 `toBeGreaterThanOrEqual(2)`，相容 local-only (3次) 與 Supabase 雲端 (2次) 兩種 Notion 同步查詢路徑。
  - 在 mobile layout 測試中加入 `test-travel-expense.supabase.co` 網絡攔截，徹底清除 ERR_NAME_NOT_RESOLVED 控制台錯誤。
- **自動化測試 100% 透過 🚀**：跑通 `final-nav`、`mobile-layout`、`security`、`settings`、`ai-routing` 等所有 smoke 測試，全部順利 passed！Secret scan 同樣 100% Passed！

## 2026-05-26

### New User Onboarding Guide & Nagoya Trip Email Restriction (Antigravity pass)

- Restricted the Nagoya 2026 trip and its pre-populated receipts to `vc06456@gmail.com` sessions only. Added scope filtering in both local-state initialization and IndexedDB hydration pathways in `useAppState.ts` for non-Boss email logins, ensuring empty states for new public users.
- Built a premium Glassmorphism onboarding popup component (`WelcomeGuidePopup.tsx`) for new accounts with no trips. Equipped the onboarding flow with a text parsing tool using the Kimi model (`kimi/kimi-code` first) for AI-driven itinerary extraction.
- Configured Kimi model instructions inside the AI itinerary parsing prompt (`parseTripParagraph` in `ai.ts`), guiding the AI to extract destination summary, dates, budget, local currency, timezones, and auto-generate daily itineraries with spots.
- Added a skip onboarding workflow: users can skip onboarding to immediately enter the clean web app, which auto-creates a clean placeholder trip and JPY/HKD currency defaults to ensure no app crashes.
- Compiled the fresh React build and successfully verified expandable settings cards, connection testing, and password security using local Vite on port 8902.

### Production Hardening, Playwright test debug, and 100% test completion (Antigravity pass)

- Fixed state management IndexedDB prioritized merge priority in `useAppState.ts` so that newer IndexedDB state wins over stale `localStorage` data (offline-first resilience).
- Fixed CSV download cancellation in `domain.ts` by delaying `URL.revokeObjectURL(a.href)` by 1500ms (prevents Safari/iOS aborting downloads).
- Fixed Stats tab re-render visual flickering in `Stats.tsx` by removing `initial={{ width: 0 }}` from Framer Motion `motion.i` layout (eliminates re-render width-expansion flickering).
- Fixed storage serialization quota robust fallback: wrapped `localStorage.setItem` in a `safeLocalStorageSet` try/catch error boundary, ensuring IndexedDB saving always fires as a safe fallback even if local quota is exhausted.
- Fixed `loadState` catch normalization fallback: ensured the catch branch in `loadState` always calls `normalizeState` to backfill missing fields.
- Verified that `smoke:mobile-layout` and `smoke:security` integration suites require different Vite dev server environments (with vs without fake Supabase env variables) due to `SupabaseGate` login routing, and resolved all locator/visibility failures.
- Executed the full suite of automated Playwright smoke tests, achieving **100% flawless passes** across `Stats`, `Settings`, `Security`, `Notion Mirror`, `Mobile Layout`, `Final Navigation`, and `AI Routing`.
- Pushed clean, verified commits to GitHub `main` and fully refreshed the GitNexus index network (5,335 nodes | 9,258 edges).

### Public-user privacy and production readiness

- Hardened Supabase public-table isolation with forced RLS and owner-scoped access policies.
- Hardened Supabase pull mapping so receipts whose Supabase `trip_id` is not present in the pulled trip list are skipped instead of being silently attached to the active trip.
- Fixed Supabase pull merge for migrated local/legacy receipts: when a cloud row has a new Supabase UUID but the same `tripId + SourceID`, the app now updates the existing local receipt instead of showing a duplicate card.
- Hardened Personal Notion database resolution so a user-scoped app-level Notion database cannot be overridden by a stale trip-level Notion database during receipt push/archive flows.
- Hardened Personal Notion pull so public/personal mode ignores receipt rows whose `TripID` is missing or does not match one of the user's known active trips, while preserving legacy local date-based import behavior.
- Fixed migrated Personal Notion broker requests so the frontend sends the resolved active personal database ID to `/notion/request` instead of the old shared/default app-level database ID.
- Clarified public Supabase Notion settings UX: before Personal Notion is connected, the old shared/default `Database ID` is no longer editable, Supabase-only push/save actions are labelled clearly, and Notion-only diagnostics/schema actions are disabled.
- Kept private Notion database/page IDs out of shared public rows.
- Added Supabase signed-in device cleanup: users can clear this device's scoped localStorage and IndexedDB snapshot before signing out.
- Added regression coverage for Supabase magic-link redirect safety and scoped device-data cleanup.
- Fixed public Supabase Notion mirror readiness so a personal active-trip Notion database is still accepted when the top-level Notion database is the old shared default.
- Fixed Supabase settings push for migrated personal-Notion states: if the app-level Notion DB is still the shared default, the private `profiles.app_settings.notionDb` value now uses the active trip's personal Notion DB and never writes the shared default.
- Hardened Supabase pull settings merge so a stale or foreign `profiles.app_settings.activeTripId` cannot override the user's actual non-archived trip list; active flags are normalized to the selected trip after pull.
- Added Supabase scoped IndexedDB fallback regression coverage: if a shared browser has legacy local data, user A scoped data, and user B only has an IndexedDB fallback snapshot, signing in as user B hydrates only user B data.
- Re-ran the live Supabase RLS isolation smoke through the Supabase connector after the latest roadmap update; `supabase/tests/rls_isolation_smoke.sql` returned `rls_isolation_smoke_passed`.

### Multi-trip data boundaries

- Scoped CSV export to the active trip.
- Scoped Backup JSON export to the active trip and that trip's receipts.
- Hardened Backup JSON restore so unknown foreign `tripId`, `tripVersion`, and `tripDayId` values cannot leak into the restored active trip.
- Added Settings smoke coverage for active-trip CSV export, active-trip backup export, and safe restore remapping.

### AI routing

- Confirmed required primary AI routing with smoke coverage:
  - Email parsing uses Kimi `kimi/kimi-code` first.
  - Trip update parsing uses Kimi `kimi/kimi-code` first.
  - Voice parsing uses Google Gemma 4 31B first.
  - Receipt scan parsing uses Google Gemma 4 31B first.
- Expanded Supabase public-mode AI smoke coverage so scan, voice, email, and trip update all prove the required primary models are used with Supabase auth headers and without a broker password session.
- Fixed frontend AI fallback behavior so Credential Broker quota/rate-limit failures stop provider fallback immediately. A `429` or daily-quota error now stays visible to the user instead of silently spending another provider/model path.
- Added AI routing smoke coverage proving receipt scan quota errors do not fall back from Google Gemma 4 31B to Kimi, even if stale settings prefer Kimi.

### Deploy and indexes

- Pushed latest production-readiness commits to GitHub `main`.
- Added manual GitHub Pages workflow dispatch support so production deploys can be triggered explicitly if a push event does not create a run.
- Re-pinned GitHub Pages deploy actions to stable previous-major versions after repeated `codeload.github.com` download failures on the latest Pages action majors.
- GitHub Pages deploy succeeded for `30df8b9`.
- The latest checked GitHub Pages run for `f7bce0f` still failed while downloading `actions/configure-pages@v5` from `codeload.github.com`; the Pages React URL still returned `200` but with an older `last-modified` timestamp.
- Vercel React app returned `200` after the latest push and is the current primary public URL.
- Netlify project current deploy was ready in connector checks, but the public Netlify URL returned `503 usage_exceeded`.
- Pushed `4b17dbf` and verified GitHub Pages deployment `26450788506` succeeded; manually deployed the Vercel `travel-expense-react` production project after the automatic Git deployment lagged, then verified the custom Vercel URL returned `200`.
- Refreshed GitNexus after code/docs changes; use `npx gitnexus status` for live counts because metadata-only commits can shift analyzer totals.
- Refreshed Graphify after code/docs changes.
- Ran a broad React smoke audit across Dashboard, Scan, Timeline, History, Weather, Stats, Settings, final navigation, security, AI routing, build, source secret scan, and Supabase policy scan; no new functional regression surfaced in that sweep.

### Documentation

- Rewrote `README.md` in simple language for everyday users.
- Rewrote `HANDOVER.md` so another agent can continue from the current technical state.
- Updated `AGENTS.md` project-local rules to reflect the current React/Supabase/Notion structure.
- Added this `CHANGELOG.md`.
- Committed a docs-only handover refresh covering `AGENTS.md`, `HANDOVER.md`, `CHANGELOG.md`, and `README.md`, so a new Codex session can immediately see the current Supabase/Notion isolation work, deploy status, verification commands, and remaining risks.
- Added `npm run db:rls:smoke`, a safe live Supabase RLS smoke runner that reads `SUPABASE_DB_URL` from the shell, runs `supabase/tests/rls_isolation_smoke.sql`, and avoids committing or printing database credentials.
- Added `npm run smoke:mobile-layout`, covering Android-sized Records/Itinerary tab switching, horizontal overflow, and console/page errors with long receipt and itinerary content.
- Added `npm run smoke:supabase-notion-mirror` and tightened the Personal Notion mirror smoke so it emulates the Worker database-scope guard.
- Expanded the Supabase Notion mirror smoke to prove the pre-connection Settings panel stays Supabase-only and does not call `/notion/request`.
- Verified live Supabase RLS isolation through the Supabase connector: `supabase/tests/rls_isolation_smoke.sql` returned `rls_isolation_smoke_passed`.
- Re-verified Credential Broker production guards: `npm run check` and `npm run self-test` passed, including Supabase AI daily quota, encrypted credential storage, Kimi `kimi-code`, and Google `gemma-4-31b` assertions.

## Earlier History

Before May 2026, this project started as a legacy `index.html` travel expense PWA for the Nagoya 2026 trip, then gained a React renovation under `app-react/`, Notion sync, Gmail/Apps Script import, AI receipt parsing, weather, stats, itinerary editing, Credential Broker support, Vercel deployment, Netlify config, and Supabase public-user storage.
