# AGENTS.md

## Reply Style

- Default reply language: Cantonese written in Traditional Chinese.
- Keep replies concise and direct.
- Use English only for code, commands, file paths, API names, exact model names, and technical identifiers.

## Project Scope

- This file applies to `/Users/tommy/Documents/New project/travel-expense`.
- GitHub repo: `https://github.com/jd92-beep/travel-expense`
- Live app: `https://jd92-beep.github.io/travel-expense/`
- Current indexed commit: `a8fd0c7` (`main`, `origin/main`) as of 2026-05-05 HKT.
- The repo is public. Never commit real API keys, OAuth tokens, Notion tokens, injected `_site/` output, or local secrets.

## Read First

- Read `README.md` for current product and deploy overview.
- Read `HANDOVER.md` for session history, known risks, credentials locations, and deploy notes. Treat old paths in it as potentially stale; the active local checkout is this folder.
- Read `graphify-out/GRAPH_REPORT.md` for the local knowledge graph. `graphify-out/` is local-only and ignored by git.
- For legacy single-file tab work, read `docs/README.md` and the relevant `docs/<tab>.md`.
- For GitNexus work, run `npx gitnexus status` first. If stale or missing, run `npx gitnexus analyze`.

## App Shape

- `index.html` is the legacy production app at GitHub Pages root. It is a large no-build HTML/CSS/JS PWA using Tailwind CDN, Chart.js CDN, vanilla JS, and `localStorage`.
- `app-react/` is the fresh React 18 + Vite + TypeScript renovation, deployed under `/react/`.
- `app/` and `app3/` are older React attempts. Keep them for history, but do not use them as the source for new React work.
- `email-to-notion.gs` is the Google Apps Script backend for Gmail label `travel-expense` -> AI parse -> Notion.
- `.github/workflows/deploy.yml` builds `app-react/`, then publishes legacy `index.html` at root plus the fresh React build at `/react/`.

## Core Runtime Contracts

- Shared storage key is `boss-japan-tracker`. Do not rename it without migration.
- Receipt identity and dedup rely on `SourceID`, especially for email imports and Notion resurrection prevention.
- Notion sync uses `notion-proxy.ftjdfr.workers.dev` by default because Notion REST is CORS-blocked.
- Kimi uses Deno proxy `https://rare-duck-29.jd92-beep.deno.net`; do not inject Kimi keys into GitHub Pages because deployed HTML is public.
- App settings can sync through Notion meta row `SourceID=__meta_settings__`; credentials must stay local or in vault.
- If changing root `index.html` in a way that must beat stale PWA cache, bump `APP_BUILD`.

## Commands

```bash
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

# Old React attempts are kept as history only unless the user explicitly asks.
```

## GitNexus Rules

- This checkout is indexed by GitNexus at `/Users/tommy/Documents/New project/travel-expense`.
- There is another sibling checkout with the same repo name, so when using GitNexus MCP tools, pass `repo: "/Users/tommy/Documents/New project/travel-expense"`.
- Before editing a function, class, method, or shared module, run GitNexus impact analysis on the target symbol and report the blast radius if risk is HIGH or CRITICAL.
- Before committing, run GitNexus change detection and verify only expected symbols and execution flows are affected.
- Prefer GitNexus query/context tools for unfamiliar execution flows; use `rg` for exact text/file search.

## Editing Rules

- Preserve the public-repo security model. Do not commit `secrets.local.js`, real credentials, `.env`, generated Pages artifacts, `node_modules/`, `dist/`, `.gitnexus/`, or `graphify-out/`.
- Keep `graphify-out/` on disk but local-only unless the user explicitly asks to publish it.
- Avoid broad rewrites of `index.html`; it has many cross-tab dependencies.
- Keep legacy, `app/`, and `app3/` behavior aligned only when the user asks for parity. Do not silently port features between them.
- For UI changes, verify mobile-sized layout and make sure controls do not overlap.
- For receipt, Notion, email, model-routing, or storage changes, test the relevant flow end to end where practical.

## Deploy Notes

- Normal deploy is pushing `main`; GitHub Pages builds from `.github/workflows/deploy.yml`.
- Workflow injects only `MINIMAX_KEY` and `ZAI_KEY` placeholders into legacy HTML if repository secrets exist.
- Apps Script deploy is separate and uses `clasp --user ftjdfr push --force`; never paste live credentials into tracked files.

## Useful References

- Local graph report: `graphify-out/GRAPH_REPORT.md`
- Graph artifacts: `graphify-out/graph.json`, `graphify-out/graph.html`
- Legacy tab docs: `docs/dashboard.md`, `docs/scan.md`, `docs/history.md`, `docs/timeline.md`, `docs/weather.md`, `docs/stats.md`, `docs/settings.md`
- GitNexus resources: `gitnexus://repo/travel-expense/context`, `gitnexus://repo/travel-expense/processes`, `gitnexus://repo/travel-expense/clusters`

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **travel-expense** (3824 symbols, 6583 relationships, 297 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

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
