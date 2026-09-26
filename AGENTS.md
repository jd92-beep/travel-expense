# AGENTS.md

`travel-expense` is a public, multi-user travel-expense product. `app-compact/`
is the active public client; `app-react/` is the parallel client; `app-admin-kanban/`
is the Admin frontend/BFF; `workers/credential-broker/` owns credentialed provider
calls. User instructions override this file; the global handbook owns generic
workflow and skill routing.

The shared handbook is `/Users/tommy_1/.codex/AGENTS.md`. Start with the named
client or service and expand to sibling clients only when a shared contract or
dependency is affected; keep all applicable cross-client checks below.

## Scope and evidence

- Work only in `/Users/tommy_1/Documents/Projects/travel-expense`. Inspect Git
  status first and preserve unrelated work. Use live Git/runtime/DB evidence over
  dated handover notes.
- Read `HANDOVER.md` before Admin, database, receipt-photo, or release work; read
  the app-local architecture/handover when changing that app. Read graph indexes
  only for broad architecture or symbol-flow questions, never as proof of current
  runtime state.
- This repository is public: never commit credentials, tokens, `.env`, generated
  deploy output, or local graph indexes. Keep secrets in the approved broker or
  vault; browser clients must not hold admin/service credentials. Admin browser
  traffic stays on same-origin `/api/admin/*`.

## Safety and data contracts

- Ask Boss before a live migration (`supabase db push` or migration repair), data
  deletion/rewrites, RLS weakening, credential/vault changes, paid usage beyond
  routine AI calls, Admin writes, R3 controls, or making `receipt-photos` private.
  Keep the legacy-row fallback and do not hide failing checks.
- Keep receipt `SourceID` identity/deduplication, active-trip scoping, and
  active-trip-only backup. Restore must remove secrets, cloud IDs, stale trip
  links, and unknown foreign trip IDs.
- Supabase is the public shared store; Notion is a mirror. Personal Notion pulls
  require the resolved active-trip `TripID` and database. Never restore a shared
  Notion database/password path for public users; credentials stay local or in
  the vault.
- Provider calls go through the Credential Broker. Preserve the selected-model
  contract: `429`, quota, and daily-limit failures are hard stops, not fallback
  opportunities. Health tests use the exact selected provider/model with
  `kind=test`, no fallback, and at most eight output tokens; normal tasks retain
  strict JSON parsing.
- Defaults are `mimo-v2.5` for scan/voice and `mimo-v2.5-pro` for email/trip
  updates. The approved Volcano LLM catalog is `doubao-seed-2.0-lite`,
  `doubao-seed-2.0-pro`, `minimax-m3`, `minimax-m2.7`,
  `doubao-seed-2.0-mini`, and `kimi-k3`; do not place Seedance in an LLM
  selector or probe.
- Persisted sync may requeue only retryable, non-exhausted, non-version-conflict
  work. Keep `40001` conflicts and exhausted failures visible. Successful merges
  preserve `supabaseId`; never auto-reload while a user may be editing.

## Change and verification

- Keep shared storage keys and public contracts compatible unless an approved
  migration changes them. For every app/code update, bump the touched app's
  visible `APP_VERSION` and matching package version in the same commit, as
  specified by `HANDOVER.md`'s Build Versioning Rule. Bump `APP_BUILD` for
  root-PWA cache changes.
- Run the smallest relevant checks first. For a touched web app, run its
  `typecheck`, `build`, `security:scan`, and smoke(s) for the changed flow. Run
  `db:policy:scan` plus a safe RLS smoke for policy/migration work; run broker
  checks for broker changes; use Android debug/QA only for Android work. UI work
  also needs a relevant mobile-sized browser check.
- Do not claim a release from a local build. GitHub Pages deploys from `main`;
  Admin production is a protected, explicitly dispatched workflow. Verify the
  intended source SHA and live target before reporting deployment success.
- Do not push, merge, dispatch a workflow, or deploy without Boss's explicit
  authorization. Stage only task-owned files. For docs/config-only work, use
  `git diff --check`; use GitNexus only when code-flow impact needs it.

## CI map

- `.github/workflows/deploy.yml` builds and deploys public Pages from `main`.
- `admin-console.yml` gates Admin, edge, clients, database, broker, and shared
  contracts; its production job requires the protected environment.
- The Netlify workflows build their named client on `main`; the receipt worker
  drains its bounded outbox on schedule or manual dispatch.
