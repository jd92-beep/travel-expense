# Compact 0.36.3 — DeepSeek defaults and separate AI packing extras

Scope: the active Compact client, shared provider-default metadata, and the Broker trip-output budget/guard. Local work only; no commit, push, workflow dispatch or deployment. Existing unrelated AGENTS.md, HANDOVER.md and review/design work was preserved.

## Resulting behavior

- Photo/receipt, browser-transcribed voice, email and itinerary defaults all resolve to `openrouter/deepseek/deepseek-v4.1-flash-1017`. Legacy `auto` settings use that same single model. Valid manual selections stay selected.
- Qwen3.7 Flash and supported free choices, including Ling 3.2 Flash, remain available in each compatible Settings category. Selections survive reload. Failures and quota/rate limits do not switch to another provider/model.
- All themes use the existing video-derived 52-item template in `pocketPacking.ts` unchanged: six groups of 7, 8, 8, 13, 8 and 8 items. Counts/quantities describe the original family-trip example, not assumptions about the current traveller.
- AI extras appear in the final **AI 推薦額外用品** section. They use the existing checkbox/edit layout, with item name and quantity/carry-location/purpose notes. The AI prompt receives the fixed item names and requests at most ten useful extras without regenerating the base template or inferring children/medical needs from it.
- Fixed-item and same-name recommendation duplicates are filtered after Unicode/case/whitespace normalization. Existing user entries, completion, edits and rejected suggestions are preserved. Legacy generated entries in 行程用品 move to the AI group without resetting completion. Account/trip storage isolation and validated import/export remain intact.
- Settings and Welcome previews distinguish the fixed template from proposed extras. Opening a checklist does not make a new AI call; extras come from the selected itinerary model during itinerary analysis.
- The Broker trip budget is 24,000 output tokens, as used in the prior long-itinerary evaluation. `finish_reason=length` is rejected before JSON repair, preventing truncated model JSON from being accepted as an AI itinerary. Eight-token health checks and the approved Muse 16-token exception are unchanged.

Client app/package: 0.36.3. Local Broker source: 2026.11.15.2, package 0.1.1. These version changes are not deployment receipts.

## Authentication answer

The production visitor page was inspected on 2026-11-15 and presents 旅程雲端登入 with Google and email sign-in. Once signed in to the app, `brokerAiFetch` uses the existing Supabase app session; no second Google or OpenRouter sign-in is required. The Broker validates that user and applies its quota before adding the server-side provider key. Merely opening/installing the app does not authorize AI: an unauthenticated production `/openrouter/json` request returned HTTP 401.

The older, unconfigured-Supabase mode can also use a valid password-unlock Broker session. A local/offline trust flag alone does not authorize AI. No authentication controls or credentials were changed by this task. This check covers the current login surface and anonymous rejection; a real user's Google OAuth session was not opened or modified.

## Verification

- Compact typecheck and production build passed. The build retains existing theme-boot/module and bundle-size warnings.
- Project `security:scan`, provider-catalog contract, Compact/React shared-state contract, Journey tools unit checks, and Broker syntax/self-tests passed.
- 39 distinct relevant browser cases passed across the main run, a corrected search-fixture rerun, and Settings cases. After the final AI-extras revision, all 8 affected import/checklist cases passed again across Pocket Planner, Alpine Postcard and Night Ledger; the 3 Settings itinerary cases also passed again.
- Coverage includes every task's default routing, explicit alternative selection and persistence, image forwarding, quota stops, confirmation/apply, all main tabs, template+AI ordering, duplicate suppression, completion reload, account/trip isolation, manual edits/import and storage errors. Browser fixtures use disposable state and mocked backends.
- A separate real DeepSeek request ran through the current local Broker and actual Compact confirmation/apply path. The corrected synthetic itinerary returned valid JSON, three AI extras with quantity/carry-location notes, and 52 + 3 = 55 displayed items. There was one model call in that successful run and no receipt/production-data write. An earlier synthetic UI fixture lacked the required destination summary; that fixture was corrected without an App-source workaround.
- Successful generation sample: 3.899 seconds, 2,747 input / 762 output tokens, API-reported USD 0.00013058, finish=stop. This one sample is functional evidence, not a latency/quality benchmark or a total for every exploratory call.
- Synthetic mobile/desktop screenshots were inspected at 390×844 and 1280×900. No horizontal overflow or page error was observed in the checked screens. The actual generated extras were also inspected at mobile size.
- `git diff --check` passed. No Android/physical-device, production signed-in inference, live database/migration or release verification is claimed.

Commands used include the app's safe `run-with-dev-server.mjs` harness with `node node_modules/@playwright/test/cli.js`; all owned temporary app/credential contexts are closed after the checks. Proof screenshots/API receipts are kept in this chat's private artifacts, not committed into the public repository.
