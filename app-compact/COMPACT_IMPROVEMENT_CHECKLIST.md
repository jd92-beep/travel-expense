# Compact Improvement Checklist

Last updated: 2026-06-08 HKT

Scope: `app-compact/` only. Do not port changes into `app-react/`, legacy
`index.html`, `app/`, or `app3/` unless Boss explicitly asks for parity work.

Security rule: do not commit API keys, provider tokens, Notion tokens, broker
sessions, Supabase service-role secrets, `.env` files, or generated local secret
files. All AI, Notion, and WeatherAPI provider credentials must stay in the
Credential Broker or ignored local files.

## Status Labels

| Label | Meaning |
|---|---|
| `TODO` | Not started. |
| `DOING` | In progress in the current implementation pass. |
| `DONE` | Implemented and verified by the listed compact smoke checks. |
| `LIVE` | Needs a real deployed broker/account/API state to verify fully. |

## P0 - Correctness And Safety

| ID | Status | Task | Why It Matters | Verification |
|---|---|---|---|---|
| P0-01 | DONE | Deduplicate compact `getPersons()` output while preserving order and fallback users. | Current smoke logs can show duplicate React keys such as `p_trip_2`, which can duplicate or omit person UI rows. | 2026-06-08: `npm run typecheck`, `npm run smoke:final-nav` (7 passed, includes duplicate-person console regression), `npm run smoke:settings`, `npm run smoke:stats`. |
| P0-02 | DONE | Reconcile compact Dashboard budget scope with the latest verified React contract. | Budget usage should be explainable: total budget usage should not silently exclude flight/lodging when the chart filter changes. | 2026-06-08: `npm run typecheck`, `npm run smoke:dashboard`, `npm run smoke:stats`, `npm run smoke:mobile-layout`. |
| P0-03 | DONE | Add the clearer compact Settings backup-safety panel. | Users must see that CSV/Backup JSON are current-trip only and never include API keys/tokens/broker sessions. | 2026-06-08: `npm run typecheck`, `npm run smoke:settings`, `npm run security:scan`, `npm run smoke:mobile-layout`. |
| P0-04 | DONE | Reconcile old `QA_BUG_REPORT.md` and `DATA_FLOW_AUDIT_REPORT.md` into current compact reality. | These reports are useful but stale; unresolved issues should become concrete tasks, fixed items should be marked closed. | 2026-06-08: historical reports now have compact reconciliation notes; `git diff --check` and `npm run smoke:final-nav` passed. |
| P0-05 | LIVE | Verify deployed Credential Broker live paths for Notion, Kimi, Google/Gemma, Mimo, and WeatherAPI without exposing secrets. | Compact code is broker-safe, but live vault permissions and account state still need proof. | 2026-06-08: added and ran `npm run smoke:broker-live`, a no-secret live preflight that checks broker `/health`, compact-origin CORS, and no-session auth guards for Notion, Kimi, Google, Mimo, WeatherAPI, and credentials endpoints. It passed with `/health` 200, CORS 204, protected paths 401 `Session missing`, and no sensitive-looking response text. `npm run smoke:broker-vault:guard` also passed the fail-closed missing-session guard. Provider vault calls were intentionally not executed; full provider proof still needs an authenticated local session/admin/Supabase context via `npm run smoke:broker-vault`. |

## P1 - Compact Mobile Core Experience

| ID | Status | Task | Why It Matters | Verification |
|---|---|---|---|---|
| P1-01 | DONE | Upgrade Scan into a one-hand receipt cockpit with clearer confidence and partial-batch recovery states. | Scan is the main entry flow; users need fast correction when OCR is partial or uncertain. | 2026-06-08: added cockpit status, draft recovery, batch quality summary, complete-only batch selection; `npm run typecheck`, `npm run smoke:scan`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, `npm run security:scan`, `npm run build`, and mobile screenshot sweep `/tmp/compact-scan-cockpit-p1-01.png` passed. |
| P1-02 | DONE | Add compact receipt health markers in History: pending, duplicate, photo missing, sync conflict, cloud-only/local-only. | Records should tell users what needs attention without opening each receipt. | 2026-06-08: added row-level health markers from existing receipt/sync fields; `npm run typecheck`, `npm run smoke:history`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, `npm run security:scan`, `npm run build`, and mobile screenshot sweep `/tmp/compact-history-health-markers-p1-02.png` passed. |
| P1-03 | DONE | Add Timeline live-travel mode: now card, next stop, completed/current/upcoming states, and route action grouping. | The timeline should guide the user during the trip, not only display a static plan. | 2026-06-08: added compact live-now/next-stop command card, `完成`/`Now`/`即將` spot states, and grouped route actions; `npm run typecheck`, `npm run smoke:timeline`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, `npm run security:scan`, `npm run build`, and mobile screenshot sweep `/tmp/compact-timeline-live-mode-p1-03.png` passed. |
| P1-04 | DONE | Make Weather more trip-city aware with visible freshness, fallback reason, and destination/provider labels. | Users need to trust whether weather is live, cached, placeholder, city-based, or coordinate-based. | 2026-06-08: added provider, live/cache freshness, spot-coordinate/trip-city/city-geocode target labels, and fallback reason chips; `npm run typecheck`, `npm run smoke:weather` (9 passed, including JMA fallback and city geocode), `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, `npm run security:scan`, `npm run build`, and mobile screenshot sweep `/tmp/compact-weather-source-p1-04.png` passed. |

## P2 - AI And Insight Layer

| ID | Status | Task | Why It Matters | Verification |
|---|---|---|---|---|
| P2-01 | DONE | Add a compact AI trip coach panel for daily burn, overspend forecast, next-day warning, and weather-linked reminders. | This creates practical "少少 AI magic" without hiding controls. | 2026-06-08: added local-only Dashboard coach panel; `npm run typecheck`, `npm run smoke:dashboard`, `npm run smoke:weather`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, `npm run security:scan`, `npm run build`, and mobile screenshot proof `/tmp/compact-dashboard-ai-coach-p2-01.png` passed. |
| P2-02 | DONE | Add Stats budget story cards: used percent, remaining per day, fairness by person, and category anomaly. | Stats should answer "am I okay?" quickly on a phone. | 2026-06-08: added 2x2 compact Stats story cards; `npm run typecheck`, `npm run smoke:stats`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, `npm run security:scan`, `npm run build`, and mobile screenshot proof `/tmp/compact-stats-budget-story-p2-02.png` passed. |
| P2-03 | DONE | Add better offline/PWA states: update available, offline queue, cache freshness, install prompt, and reduced-motion audit. | Compact should feel reliable while travelling. | 2026-06-08: added Shell-level compact travel readiness strip; `npm run typecheck`, `npm run smoke:final-nav`, `npm run smoke:mobile-layout`, `npm run smoke:security`, `npm run security:scan`, `npm run build`, and mobile screenshot proof `/tmp/compact-pwa-readiness-p2-03.png` passed. |

## P3 - Design System And Visual QA

| ID | Status | Task | Why It Matters | Verification |
|---|---|---|---|---|
| P3-01 | DONE | Convert repeated compact CSS overrides into small design tokens and documented tab patterns. | The current generated-preview polish works, but long override layers are hard to maintain. | 2026-06-08: added shared compact radius/gap/gutter/card/chip/text tokens, reused them in Stats story cards and the travel-readiness strip, and documented tab patterns in `DESIGN_SYSTEM.md`; `npm run build`, `npm run typecheck`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, `git diff --check`, and visual contact sheet `/tmp/compact-design-system-p3-01/mobile-contact-sheet.png` passed. |
| P3-02 | DONE | Automate a seven-tab mobile contact sheet after major UI edits. | Prevents card overlap, dock obstruction, and timeline rail regressions. | 2026-06-08: added `npm run smoke:contact-sheet`, which starts/reuses the compact dev server, stubs external APIs, seeds public-safe test data, captures all seven 390px tabs, checks horizontal overflow, verifies bottom dock visibility, and guards Timeline rail/content separation; `npm run smoke:contact-sheet`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, `npm run typecheck`, `npm run build`, and `git diff --check` passed. Latest artifact: `/tmp/compact-contact-sheet-2026-06-08T07-22-39-380Z/mobile-contact-sheet.png`. |
| P3-03 | DONE | Refresh compact docs so titles and paths say Compact instead of copied React wording. | Future agents should not confuse compact with main React. | 2026-06-08: refreshed compact architecture/design/resource/checklist/generated-asset docs so titles, build roots, deploy paths, Graphify notes, and visual references say Compact/current compact paths instead of copied React wording; moved old screenshot audit outputs to `/tmp/compact-screenshot-audit` and updated their dev URL to port `8903`; `git diff --check`, `node --check app-compact/screenshot-audit.js`, `node --check app-compact/screenshot-audit.cjs`, `npm run smoke:contact-sheet`, `npm run smoke:mobile-layout`, `npm run typecheck`, and `npm run build` passed. Latest contact sheet: `/tmp/compact-contact-sheet-2026-06-08T07-30-31-704Z/mobile-contact-sheet.png`. |

## P4 - Production Readiness And Release Discipline

| ID | Status | Task | Why It Matters | Verification |
|---|---|---|---|---|
| P4-01 | DONE | Add a compact production gate that runs the core no-secret release checks in one command. | Compact has many useful smokes; a single safe gate prevents agents from forgetting mobile, broker, security, or build checks before deployment. | 2026-06-08: added `npm run smoke:production-gate` and `npm run smoke:production-gate:full`. The core gate starts/reuses the compact dev server, uses a restricted safe env, then runs `typecheck`, `smoke:final-nav`, `smoke:mobile-layout`, `smoke:a11y-touch`, `smoke:contact-sheet`, `smoke:broker-live`, `smoke:broker-vault:guard`, `security:scan`, and `build`. Latest run passed in 75.6s with contact sheet `/tmp/compact-contact-sheet-2026-06-08T08-08-11-458Z/mobile-contact-sheet.png`. |
| P4-02 | DONE | Add an optional authenticated broker-vault verification workflow that only runs from ignored local/session input and redacts all provider output. | This is the missing proof behind P0-05; it must verify Notion, Kimi, Google/Gemma, Mimo, and WeatherAPI without committing or printing keys/tokens/sessions. | 2026-06-08: added `npm run smoke:broker-vault` for authenticated local proof and `npm run smoke:broker-vault:guard` for no-secret CI/release guard. The guard passed standalone and inside `npm run smoke:production-gate` with `/credentials/status` 401 `Session missing`, proving fail-closed behavior and no provider calls. Authenticated provider proof is intentionally not executed without an ignored local session file or explicit local env, so P0-05 remains `LIVE`. |
| P4-03 | DONE | Add compact accessibility and touch-target smoke coverage. | The compact UI is dense; controls must remain tappable, labelled, and usable with reduced motion and keyboard focus. | 2026-06-08: added `npm run smoke:a11y-touch`, compact `--compact-touch-min`, `compact-touch-action`, and focus-visible rings for key compact controls. The smoke passed standalone and inside `npm run smoke:production-gate`, checking accessible button names, bottom dock targets, Dashboard actions, Scan cards/utilities, Settings quick controls, reduced-motion readiness, and keyboard focus movement. |
| P4-04 | DONE | Add production deploy verification that compares pushed commit, Vercel deployment, live asset hash, and compact title. | Boss asks for auto push/deploy; the handover should prove the live compact site is really the latest commit, not only that build passed locally. | 2026-06-08: added `npm run smoke:deploy-live`. It verifies current branch is `main`, local HEAD matches `origin/main`, deploy-relevant worktree is clean, `vercel inspect --json` reports a READY production deployment, live alias is attached, live URL returns HTTP 200 with title `旅費 Compact` and `#root`, and live alias HTML/assets match the inspected deployment URL. Initial dry run passed with `--allow-dirty`; final proof should run normally after commit/push/deploy. |

## P5 - Future Product Upgrades

| ID | Status | Task | Why It Matters | Verification |
|---|---|---|---|---|
| P5-01 | DONE | Add a broker-backed AI assistant panel with strict quota/primary-model visibility. | The local coach is useful, but a real assistant could answer trip spending questions if it stays transparent and broker-metered. | 2026-06-08: added Dashboard `Broker AI Assistant` using the Credential Broker Kimi JSON route, visible `Primary · kimi/kimi-code`, `Quota · broker metered`, and `No fallback on 429` labels, plus quota hard-stop UI. `npm run smoke:dashboard` now stubs success and 429 broker responses, asserts request kind/model, verifies no Google/Mimo fallback calls, and passed 5 tests. Broader verification also passed: `npm run typecheck`, `npm run build`, `npm run smoke:mobile-layout`, `npm run smoke:a11y-touch`, `npm run smoke:production-gate`, and `git diff --check`. |
| P5-02 | TODO | Add first-run compact personalization for trip style, currency, home city, and weather preference. | Compact should feel like a travel companion from the first minute instead of waiting for enough receipts and itinerary data. | Welcome/settings smoke should seed a new user, save preferences, reload, and confirm no legacy demo data leaks in. |
| P5-03 | TODO | Add cross-version compatibility smokes between compact and React shared storage contracts. | Compact is independent visually but must not fork trip, receipt, person, split, Supabase, Notion, or trip-intelligence data contracts. | A shared fixture should load in compact and React, then compare normalized trips, people, receipts, settings, and sync metadata. |
| P5-04 | TODO | Add richer travel-day widgets: transit countdown, receipt reminder, weather alert, and next booking note. | This turns Dashboard and Timeline into a real day-of-travel control surface. | Dashboard/Timeline smoke should verify time-aware widgets with fixed clocks and no external API dependency. |

## Working Rule

Work one task at a time. After each task, run the task-specific smoke first,
then run broader compact checks when the change touches shared state, sync,
settings, navigation, or mobile layout.
