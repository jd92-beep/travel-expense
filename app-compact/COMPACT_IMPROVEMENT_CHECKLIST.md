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
| P0-05 | LIVE | Verify deployed Credential Broker live paths for Notion, Kimi, Google/Gemma, Mimo, and WeatherAPI without exposing secrets. | Compact code is broker-safe, but live vault permissions and account state still need proof. | Broker-only live smoke with redacted logs. |

## P1 - Compact Mobile Core Experience

| ID | Status | Task | Why It Matters | Verification |
|---|---|---|---|---|
| P1-01 | DONE | Upgrade Scan into a one-hand receipt cockpit with clearer confidence and partial-batch recovery states. | Scan is the main entry flow; users need fast correction when OCR is partial or uncertain. | 2026-06-08: added cockpit status, draft recovery, batch quality summary, complete-only batch selection; `npm run typecheck`, `npm run smoke:scan`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, `npm run security:scan`, `npm run build`, and mobile screenshot sweep `/tmp/compact-scan-cockpit-p1-01.png` passed. |
| P1-02 | DONE | Add compact receipt health markers in History: pending, duplicate, photo missing, sync conflict, cloud-only/local-only. | Records should tell users what needs attention without opening each receipt. | 2026-06-08: added row-level health markers from existing receipt/sync fields; `npm run typecheck`, `npm run smoke:history`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, `npm run security:scan`, `npm run build`, and mobile screenshot sweep `/tmp/compact-history-health-markers-p1-02.png` passed. |
| P1-03 | DONE | Add Timeline live-travel mode: now card, next stop, completed/current/upcoming states, and route action grouping. | The timeline should guide the user during the trip, not only display a static plan. | 2026-06-08: added compact live-now/next-stop command card, `完成`/`Now`/`即將` spot states, and grouped route actions; `npm run typecheck`, `npm run smoke:timeline`, `npm run smoke:mobile-layout`, `npm run smoke:final-nav`, `npm run security:scan`, `npm run build`, and mobile screenshot sweep `/tmp/compact-timeline-live-mode-p1-03.png` passed. |
| P1-04 | TODO | Make Weather more trip-city aware with visible freshness, fallback reason, and destination/provider labels. | Users need to trust whether weather is live, cached, placeholder, city-based, or coordinate-based. | `npm run smoke:weather`, network-fallback smoke. |

## P2 - AI And Insight Layer

| ID | Status | Task | Why It Matters | Verification |
|---|---|---|---|---|
| P2-01 | TODO | Add a compact AI trip coach panel for daily burn, overspend forecast, next-day warning, and weather-linked reminders. | This creates practical "少少 AI magic" without hiding controls. | `npm run smoke:dashboard`, `npm run smoke:weather`. |
| P2-02 | TODO | Add Stats budget story cards: used percent, remaining per day, fairness by person, and category anomaly. | Stats should answer "am I okay?" quickly on a phone. | `npm run smoke:stats`, visual geometry proof. |
| P2-03 | TODO | Add better offline/PWA states: update available, offline queue, cache freshness, install prompt, and reduced-motion audit. | Compact should feel reliable while travelling. | `npm run smoke:final-nav`, `npm run smoke:mobile-layout`. |

## P3 - Design System And Visual QA

| ID | Status | Task | Why It Matters | Verification |
|---|---|---|---|---|
| P3-01 | TODO | Convert repeated compact CSS overrides into small design tokens and documented tab patterns. | The current generated-preview polish works, but long override layers are hard to maintain. | `npm run build`, visual contact sheet. |
| P3-02 | TODO | Automate a seven-tab mobile contact sheet after major UI edits. | Prevents card overlap, dock obstruction, and timeline rail regressions. | Playwright screenshot artifact plus `npm run smoke:mobile-layout`. |
| P3-03 | TODO | Refresh compact docs so titles and paths say Compact instead of copied React wording. | Future agents should not confuse compact with main React. | Docs review plus `git diff --check`. |

## Working Rule

Work one task at a time. After each task, run the task-specific smoke first,
then run broader compact checks when the change touches shared state, sync,
settings, navigation, or mobile layout.
