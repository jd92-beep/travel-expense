# AGENTS.md

## Reply Style

- Call the user `Boss`.
- Default reply language: Cantonese written in Traditional Chinese.
- Keep replies concise and direct.
- Use many varied emojis naturally in replies.
- Use English only for code, commands, file paths, API names, exact model names, and technical identifiers.
- At the start of a task, use the Codex app `using-superpowers` / `Using Superpowers` skill when available, then continue with the relevant project skill or workflow.

## Project Scope

- This file applies only to `/Users/tommy/Documents/Codex/travel-expense`.
- Local project directory: `/Users/tommy/Documents/Codex/travel-expense`.
- GitHub repo: `https://github.com/jd92-beep/travel-expense`
- GitHub connection: git remote `origin` uses `https://github.com/jd92-beep/travel-expense.git` for both fetch and push.
- Live app: `https://jd92-beep.github.io/travel-expense/`
- Public React Vercel app: `https://travel-expense-react.vercel.app`
- Public React Netlify app: `https://travel-expense-react.netlify.app` exists, but currently returns `503 usage_exceeded`; treat this as a Netlify account/usage gate until rechecked.
- GitNexus index is refreshed during handover work; run `npx gitnexus status` for the live indexed commit and counts before relying on them.
- Latest pushed runtime commit is `4b17dbf` (`Clarify Supabase-only Notion settings`) as of 2026-05-26 HKT. GitHub Pages and Vercel React returned `200`; Netlify still returned `503 usage_exceeded` on the latest checks.
- The repo is public. Never commit real API keys, OAuth tokens, Notion tokens, injected `_site/` output, or local secrets.

## Read First

- Read `README.md` for current product and deploy overview.
- Read `HANDOVER.md` for current technical handover, recent commits, known risks, Supabase/Notion contracts, and where to pick up.
- Read `CHANGELOG.md` before summarizing recent user-visible or production-readiness changes.
- Read `graphify-out/GRAPH_REPORT.md` only when the task is broad architecture, cross-file concept mapping, or handover-level reasoning. Treat embedded old source paths as historical if they point outside this folder. `graphify-out/` is local-only and ignored by git.
- For broader app/agent architecture lookups, read `/Users/tommy/Documents/Graphify and Gitnexus/README.md` and `/Users/tommy/Documents/Graphify and Gitnexus/GRAPH_REGISTRY.json` before using external snapshots. Skip this for ordinary UI fixes, CI/deploy failures, exact file edits, tests, or live runtime checks.
- For legacy single-file tab work, read `docs/README.md` and the relevant `docs/<tab>.md`.
- For GitNexus work, run `npx gitnexus status` first. If stale or missing, run `npx gitnexus analyze`.

## App Shape

- `index.html` is the legacy production app at GitHub Pages root. It is a large no-build HTML/CSS/JS PWA using Tailwind CDN, Chart.js CDN, vanilla JS, and `localStorage`.
- `legacy-notion.js` is the extracted legacy Notion sync module for `index.html`; keep its global function contract compatible with the legacy page unless the user explicitly asks for a breaking refactor.
- `app-react/` is the main public React 19 + Vite + TypeScript app, deployed under `/react/` on GitHub Pages and as the primary public Vercel app.
- `app/` and `app3/` are older React attempts. Keep them for history, but do not use them as the source for new React work.
- `email-to-notion.gs` is the Google Apps Script backend for Gmail label `travel-expense` -> AI parse -> Notion.
- `workers/credential-broker/` is the Cloudflare Worker for app unlock, short sessions, encrypted provider credentials, and AI provider calls.
- `supabase/migrations/` contains the public multi-user schema and RLS hardening.
- `.github/workflows/deploy.yml` builds `app-react/`, then publishes legacy `index.html` at root plus the fresh React build at `/react/`.
- `README.md` is the simple user guide. Keep it understandable for non-technical users.
- `HANDOVER.md` is the technical continuation guide for the next agent. Keep it current after meaningful work.

## Core Runtime Contracts

- Shared storage key is `boss-japan-tracker`. Do not rename it without migration.
- Supabase user-scoped browser storage uses `boss-japan-tracker:state:supabase:<user_id>` plus matching IndexedDB snapshot key `app-state:supabase:<user_id>`.
- Receipt identity and dedup rely on `SourceID`, especially for email imports and Notion resurrection prevention.
- Trip boundaries matter: views, CSV export, backup export, and restore/import flows must keep receipts scoped to the active trip unless Boss explicitly asks for all-trip behavior.
- Backup JSON export is active-trip only. Restore must strip secrets, cloud IDs, stale trip links, and unknown foreign trip IDs.
- Notion sync uses `notion-proxy.ftjdfr.workers.dev` by default because Notion REST is CORS-blocked.
- Supabase is the public multi-user database. Notion can mirror records, but public users must not all share one Notion account/password/database.
- Personal Notion pull in public mode must require a known active-trip `TripID`; do not reintroduce date-only or active-trip fallback for personal Notion databases.
- Personal Notion broker requests must use the resolved active personal Notion DB. If `state.notionDb` is still the old shared default but the active trip has a personal `notionDb`, `notionFetch()` must send the active trip DB to `/notion/request` or the Worker scope guard will reject it.
- In public Supabase mode, Settings must not present the old shared/default Notion `Database ID` as an editable mirror target before Personal Notion is connected. Supabase-only actions should be labelled as Supabase-only, and Notion-only diagnostics/schema actions should stay disabled until the personal mirror is ready.
- AI provider calls go through the Credential Broker. Do not inject Kimi, Google, ZAI, MiniMax, OpenRouter, Notion, or app unlock secrets into GitHub Pages, Vercel, Netlify, or frontend env.
- Required primary AI routing: email and trip update use Kimi `kimi/kimi-code`; scan and voice use Google Gemma 4 31B `google/gemma-4-31b`.
- AI quota/rate-limit failures from the Credential Broker are hard stops. Do not silently fallback to another provider after `429`, quota, or daily-limit errors, because that can bypass public-user metering and confuse the required primary model contract.
- App settings can sync through Notion meta row `SourceID=__meta_settings__`; credentials must stay local or in vault.
- If changing root `index.html` in a way that must beat stale PWA cache, bump `APP_BUILD`.

## Commands

```bash
# GitHub connection
git remote -v
git fetch origin
git push origin main

# GitNexus
npx gitnexus status
npx gitnexus analyze

# Legacy app local smoke
python3 -m http.server 8899
# then open http://localhost:8899/index.html

# Fresh React app
cd app-react
npm run typecheck
npm run build
npm run security:scan
npm run db:policy:scan
npm run db:rls:smoke
npm run smoke:settings
npm run smoke:security
npm run smoke:ai-routing
SUPABASE_MIRROR_SMOKE=1 npm run smoke:supabase-notion-mirror
npm run smoke:mobile-layout

# Supabase-auth security smoke needs fake public env.
# Terminal A:
VITE_SUPABASE_URL=https://test-travel-expense.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
npm run dev
# Terminal B:
SUPABASE_REDIRECT_SMOKE=1 npm run smoke:security

# Credential Broker
cd ../workers/credential-broker
npm run check
npm run self-test

# Old React attempts are kept as history only unless the user explicitly asks.
```

## GitNexus Rules

- This checkout is indexed by GitNexus at `/Users/tommy/Documents/Codex/travel-expense`.
- There are other checkouts with the same repo name, so when using GitNexus MCP tools, pass `repo: "/Users/tommy/Documents/Codex/travel-expense"`.
- Use GitNexus when it will answer a code-intelligence question better than normal repo tools: shared function/class/module edits, unfamiliar execution flows, call graph impact, risky refactors, symbol renames, or "what breaks if I change X?"
- Do not use GitNexus for every task. Skip it for pure docs, CSS-only spacing, copy changes, single-file config edits, CI/deploy log triage, exact text search, or when tests/browser/runtime evidence is the direct proof.
- Before editing a function, class, method, or shared module with unclear blast radius, run GitNexus impact analysis on the target symbol and report the blast radius if risk is HIGH or CRITICAL.
- Before committing, run GitNexus change detection only when code symbols, shared modules, or execution flows changed. For docs/config/style-only work, prefer `git diff --check`, targeted tests/builds, and live deploy checks.
- Prefer GitNexus query/context tools for unfamiliar execution flows; use `rg` for exact text/file search.

## Graphs And Indexes

- Keep GitNexus and Graphify separate in explanations and file paths:
  - GitNexus is the code intelligence / call graph / symbol impact index. It lives in `.gitnexus/` or in the external snapshot `.gitnexus/` folders.
  - Graphify is the cross-document knowledge graph. Its main artifacts are `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`, and `graphify-out/graph.html`.
- Use this repo's local GitNexus first for `travel-expense` code questions where symbol impact, call graphs, or execution flows are actually needed.
- Use this repo's local Graphify output first only for broad `travel-expense` architecture, cross-file relationships, docs/code concept mapping, and "what is connected to what" questions.
- Use external Graphify/GitNexus snapshots when the task is about another app or AI agent stack, or when comparing this app with those stacks. The local registry root is `/Users/tommy/Documents/Graphify and Gitnexus`.
- External snapshot registry files:
  - `/Users/tommy/Documents/Graphify and Gitnexus/README.md`
  - `/Users/tommy/Documents/Graphify and Gitnexus/GRAPH_REGISTRY.json`
- External snapshot folders and GitNexus aliases:
  - OpenClaw Tommy: `/Users/tommy/Documents/Graphify and Gitnexus/openclaw-tommy`, alias `local-openclaw-tommy`
  - OpenClaw Antony AWS VPS: `/Users/tommy/Documents/Graphify and Gitnexus/openclaw-antony`, alias `local-openclaw-antony`
  - Hermes AWS VPS: `/Users/tommy/Documents/Graphify and Gitnexus/hermes-antony`, alias `local-hermes-antony`
  - Codex App on this Mac: `/Users/tommy/Documents/Graphify and Gitnexus/codex-app-mac`, alias `local-codex-app-mac`
- Each external snapshot folder should contain:
  - `graphify-out/GRAPH_REPORT.md` for a quick human-readable graph audit.
  - `graphify-out/graph.json` for GraphRAG or precise graph inspection.
  - `graphify-out/graph.html` for visual browsing, except very large graphs may need `graph.json` and `GRAPH_REPORT.md` instead.
  - `.gitnexus/` for GitNexus code intelligence.
  - `SNAPSHOT_SOURCE.txt` for the original sanitized source location.
- Use Graphify when the question is broad, conceptual, cross-document, cross-repo, or visual. Start with `GRAPH_REPORT.md`; use `graph.html` for navigation; inspect `graph.json` only when precise nodes/links are needed.
- Use GitNexus when the question is code-level, symbol-level, flow-level, or change-impact related. For external snapshots, use their registered aliases, for example `npx gitnexus cypher -r local-codex-app-mac 'MATCH (n) RETURN count(n) AS nodes LIMIT 1'`.
- Do not use Graphify or GitNexus when a direct file search, runtime log, browser smoke test, unit test, or simple config read gives fresher and more exact evidence. Graphs are snapshots; live runtime truth wins for bugs, deploys, credentials, provider failures, and UI verification.
- Do not answer secrets, credentials, tokens, or account-state questions from graphs. Inspect the live configured environment only when the user explicitly asks and it is safe to do so.
- Refresh indexes only when their consumers benefit:
  - For this repo's GitNexus: run `npx gitnexus analyze` after meaningful symbol/module/flow changes or before a task that will rely on a fresh index. Do not refresh just because a small docs/style/config change happened.
  - For this repo's Graphify: use `graphify update .` after meaningful architecture or cross-document changes. Do not run it for ordinary UI tweaks, deploy checks, or narrow bug fixes.
  - For external snapshots: update only the target folder that matches the app/agent being changed, verify `SNAPSHOT_SOURCE.txt`, preserve `.graphifyignore` / `.gitnexusignore`, and refresh `/Users/tommy/Documents/Graphify and Gitnexus/GRAPH_REGISTRY.json` if counts or paths changed.
- Never merge GitNexus databases with Graphify JSON files. If a shared lookup is needed, update the registry/reference docs instead of combining artifact formats.

## Editing Rules

- Preserve the public-repo security model. Do not commit `secrets.local.js`, real credentials, `.env`, generated Pages artifacts, `node_modules/`, `dist/`, `.gitnexus/`, or `graphify-out/`.
- After completing requested work in this repo, commit and push the verified changes to `origin main` automatically unless Boss explicitly says not to.
- Keep `graphify-out/` on disk but local-only unless the user explicitly asks to publish it.
- Avoid broad rewrites of `index.html`; it has many cross-tab dependencies.
- Keep legacy, `app/`, and `app3/` behavior aligned only when the user asks for parity. Do not silently port features between them.
- For UI changes, verify mobile-sized layout and make sure controls do not overlap.
- For mobile Chrome Records/Itinerary concerns, run `npm run smoke:mobile-layout`; it checks 360px Android-style tab switching, horizontal overflow, and console/page errors.
- For receipt, Notion, email, model-routing, or storage changes, test the relevant flow end to end where practical.
- For Supabase login/session/storage changes, run `SUPABASE_REDIRECT_SMOKE=1 npm run smoke:security`; it covers clean magic-link redirects, device-data purge, and scoped IndexedDB fallback isolation.
- For Supabase RLS or migration changes, run `npm run db:policy:scan` and, when a safe database URL is available in the shell, `SUPABASE_DB_URL=... npm run db:rls:smoke`. Never commit or print the database URL.

## Deploy Notes

- Normal deploy is pushing `main`; GitHub Pages builds from `.github/workflows/deploy.yml`.
- If a pushed `main` commit does not create a GitHub Pages run, manually dispatch `Deploy to GitHub Pages` with `gh workflow run "Deploy to GitHub Pages" --ref main`.
- If a Pages run fails before checkout while downloading an action archive from `codeload.github.com`, treat it as an external GitHub Actions download failure first; retry before changing app code.
- For Vercel, the primary public app is the React project `travel-expense-react`, which is linked to the GitHub repo and should normally update from GitHub pushes instead of manual CLI deploys.
- Treat the legacy/root Vercel project `travel-expense` as a private backup surface only. Do not use it as the main public app unless the user explicitly asks.
- Netlify project `travel-expense-react` is configured from `netlify.toml`, but the public URL currently returns `usage_exceeded`; verify account/quota state before treating Netlify as production-ready.
- If a manual Vercel deploy is unavoidable, be explicit about the target project before running anything:
  - `travel-expense-react` = public React app, rooted by Vercel project settings at `app-react/`
  - `travel-expense` = legacy/root backup project, should stay private
- Do not run `vercel deploy` from `app-react/` when the linked Vercel project already has `rootDirectory=app-react`, because that can accidentally resolve to `app-react/app-react`.
- If Vercel CLI mutates root `.vercel/` or `.gitignore` during local login/linking, clean up those local-only changes unless the user explicitly asked to persist them.
- Workflow injects only `MINIMAX_KEY` and `ZAI_KEY` placeholders into legacy HTML if repository secrets exist.
- Apps Script deploy is separate and uses `clasp --user ftjdfr push --force`; never paste live credentials into tracked files.

## Useful References

- Local graph report: `graphify-out/GRAPH_REPORT.md`
- Graph artifacts: `graphify-out/graph.json`, `graphify-out/graph.html`
- User guide: `README.md`
- Agent handover: `HANDOVER.md`
- Change history: `CHANGELOG.md`
- Legacy tab docs: `docs/dashboard.md`, `docs/scan.md`, `docs/history.md`, `docs/timeline.md`, `docs/weather.md`, `docs/stats.md`, `docs/settings.md`
- GitNexus resources: `gitnexus://repo/travel-expense/context`, `gitnexus://repo/travel-expense/processes`, `gitnexus://repo/travel-expense/clusters`

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **travel-expense** (5821 symbols, 13928 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/travel-expense/context` | Codebase overview, check index freshness |
| `gitnexus://repo/travel-expense/clusters` | All functional areas |
| `gitnexus://repo/travel-expense/processes` | All execution flows |
| `gitnexus://repo/travel-expense/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
