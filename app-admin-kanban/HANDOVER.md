# Travel Expense Admin Console Handover

Last updated: 2026-07-13 HKT

## Current Status

- Production URL: `https://travel-expense-admin-kanban.vercel.app`
- Production release: `0.8.3`, intentionally read-only.
- Verified local cutover candidate: `1.0.0` on `codex/admin-console-1.0`.
- Expected database contract: `20260712123000` (`admin-passkeys-v2`).
- Compatibility baseline: Compact Web `0.16.2`, Android `0.19.2`, React `0.2.4`.
- Supported scope: Compact Web, Android and their shared Supabase/Notion/Broker contracts.
- R0/R1/R2 code and release gates are complete locally. Boss has approved cutover preparation;
  production deploy and migrations are not complete, and live remains `0.8.3` read-only until
  verified promotion.
- The existing `ADMIN_KANBAN_HASH` and current passphrase remain unchanged; passkey is additive.
- R3 account consolidation/deletion, Notion write repair, device commands, runtime writes, arbitrary
  SQL/table editing and generic credential controls are server-disabled.

Never put the passphrase, session token, Supabase keys, Broker keys or credential values in source,
documentation, screenshots, support bundles or chat output.

## Architecture

The browser connects only to same-origin `/api/admin/*` routes. `App.tsx` provides the router and
query client; `src/app/AdminShell.tsx` owns navigation and session chrome. Feature code is grouped
under `src/features/`, primitives under `src/components/primitives/`, and public contracts under
`src/lib/contracts/`.

Primary routes:

```text
/login
/overview
/search
/data/accounts
/data/accounts/:accountId
/data/trips
/data/trips/:tripId
/data/trips/:tripId/itinerary
/data/receipts
/data/receipts/:receiptId
/reliability/incidents
/reliability/sync
/reliability/integrity
/reliability/reconciliation
/system/providers
/system/releases
/system/infrastructure
/audit
/audit/:eventId
```

The five workspaces are Overview, Data, Reliability, AI & System, and Audit. Lists use opaque cursor
pagination and query-string filters. TanStack Query cancels stale requests, pauses hidden-tab polling,
shows background refresh separately and never retries mutations.

## Authentication Boundary

The cutover candidate implements:

1. Async Node `crypto.scrypt` passphrase verification using the versioned
   `scrypt:v1:131072:8:1:...` format and constant-time comparison.
2. SimpleWebAuthn passkey authentication with exact origin/RP ID and required user verification.
3. Opaque 256-bit `__Host-admin_session` tokens; only SHA-256 hashes are stored server-side.
4. Ten-minute idle and two-hour absolute expiry, maximum two sessions and server-side revocation.
5. `__Host-admin_csrf`, `X-Admin-CSRF`, exact Origin, same-origin Fetch Metadata and JSON-only
   mutation checks.
6. Durable pre-scrypt login and re-auth throttling with fail-closed store behavior.
7. A fixed BFF route map and 30-second HMAC-signed BFF-to-Edge requests with nonce replay defense.
8. Server-computed previews, short single-use step-up grants, version/hash drift checks and
   idempotency keys for mutations.
9. Normal passkey rotation can remove a selected non-final credential only after a fresh
   passphrase-plus-passkey step-up. The server rechecks the complete credential-set hash under a
   lock, appends Audit v2 and revokes every Admin session. The final passkey remains break-glass only.

The legacy browser bearer and direct Edge authorization paths are removed from the cutover candidate. Production
still runs the old read-only build until the approved maintenance cutover.

## API And Operations

Read APIs cover overview/search, accounts/installations, trips/itinerary/versions, receipts/photos,
incidents, sync jobs, integrity, Notion reconciliation, providers, runtime, audit and operations.
Responses use typed envelopes, request IDs, source freshness and safe DTO allowlists.

Admin 1.0 operations:

- R1: redacted support bundle, provider probe, integrity scan and eligible sync retry/cancel.
- R2: receipt amend/trash/restore, trip metadata amend, itinerary amend/restore and membership
  add/invite/role/remove.
- Intentionally unavailable: current-admin deletion, owner removal, hard delete, force overwrite,
  generic patching and session revoke without an official cross-device revocation contract.

R2 requires desktop, fresh complete data, server preview, passphrase plus passkey step-up, expected
version, a single-use grant and verified server result. Network ambiguity is shown as Outcome Unknown
and recovered through the operation ID; the UI never declares success from request submission alone.

## Shared Contracts

- Receipts use record kind, visibility, split/payer arrays, version, sync revision and durable
  tombstones. Private receipts never enter Notion. Old client versions cannot resurrect deleted rows.
- Membership uses owner/admin/editor/viewer and pending/active/removed. Owner removal or downgrade is
  rejected; removed members reactivate instead of duplicating; active trip is per user.
- Itinerary dates are local calendar dates. Inclusive ranges contain exactly one day per date; a spot
  belongs to one in-range day; partial updates preserve omitted days; every mutation creates a new
  version and snapshot.
- Nagoya acceptance is exactly six days, `2026-04-20` through `2026-04-25`, with no scenery spot
  outside that range. Compact/React browser and static contract tests are green. PR #36 final-SHA run
  `29202450339` rebuilt a disposable Supabase from zero and passed all 15 SQL smokes, including
  itinerary/R2 round trips. Live Boss data has not been rewritten because that requires explicit
  approval, backup and a fresh preview.

## Release Evidence

Verified on 2026-07-13:

- Admin `1.0.0` cutover metadata is aligned in `package.json`, both package-lock root entries and
  `/api/health`; this pass's typecheck, build and security scan passed, with unit `19/19` and
  contract `21/21`. Prior full smoke evidence remains
  `42 passed + 1 intentional visual-capture skip`; the suite covers login/WebAuthn, all 18 routes
  at seven release viewports, every visible R1/R2 action family and axe serious/critical checks;
  `npm audit` reports `0` vulnerabilities.
- Boss explicitly approved cutover preparation, but production deploy and migrations are not
  complete. The existing `ADMIN_KANBAN_HASH` and current passphrase remain unchanged; passkey is
  additive, and no live enrollment occurred in this pass.
- Edge: 28 files passed format/lint; all three entrypoints passed `deno check`; Deno tests
  `69 passed, 0 failed`.
- Compact `0.16.2`: 9/9 selected post-rebase gates passed, including itinerary merge, receipt
  tombstone, privacy, offline, mobile layout and final navigation.
- React `0.2.4`: typecheck/build/security passed; the deterministic clear-device repeat was `12/12`,
  and the full security smoke was `3 passed, 1 intentional skip`.
- Android `0.19.2` / versionCode `1920` is the current Oscar worktree baseline. It was not rebuilt
  or republished in this final web-console pass.
- BFF: the contract suite executes the real catch-all handler, session verification, CSRF and
  signed Edge transport; invalid provenance, redirects, malformed envelopes and escaped routes fail closed.
- Broker: check and self-test passed. Static migration policy and shared-ledger scans passed.
- PR #36 final-SHA run `29202450339` passed all seven required jobs at code commit `8aa2f8a`:
  Admin/BFF, clean database, Compact, React, cross-client, Edge and Broker. The protected
  production-promotion job correctly skipped.
- The clean-database job applied every migration through `20260712123000` and passed all 15 tracked
  SQL fixtures. Local Docker remained unavailable; no live database was used as a substitute.
- Owned Compact/React Vite test servers now launch directly from the local CLI, receive bounded
  TERM/KILL cleanup and are awaited; CI no longer hangs after already-passed browser output.

## CI And Runbooks

`.github/workflows/admin-console.yml` uses pinned actions and checks Admin, Edge, Compact, React,
Broker, shared contracts and a disposable Supabase. Pull requests and ordinary pushes receive no
production secrets. A manual `main`-only job can promote only after all seven gates and the protected
`admin-production` environment approval. CODEOWNERS covers Admin, Edge, Broker and migrations.

Runbook index: `docs/runbooks/README.md`

- `docs/runbooks/maintenance-and-rollback.md`
- `docs/runbooks/credential-incident.md`
- `docs/runbooks/passkey-recovery.md`
- `docs/runbooks/account-deletion.md`
- `docs/runbooks/notion-repair-saga.md`

## Production Blockers

1. Boss must approve the maintenance window and production cutover.
2. Configure production scrypt hash, WebAuthn exact origin/RP ID, BFF signing keys and bootstrap
   secret without printing or committing values; enroll the first Boss passkey and revoke bootstrap.
3. Apply reviewed forward-only migrations through the maintenance runbook. Do not run `db push` or
   `migration repair`; transfer helper ownership through the platform-owner operation.
4. Verify production BFF/Edge provenance, nonce store, session/rate stores and fail-closed behavior.
5. Deploy Compact/Android compatibility and confirm heartbeats before making receipt photos private.
6. Verify receipt-sync worker deployment and bindings separately.
7. Preview and back up live Nagoya data before any repair; do not mutate live rows automatically.
8. Configure and approve the protected `admin-production` GitHub environment before the first
   manual production workflow run.

## Cutover And Rollback

Follow `docs/runbooks/maintenance-and-rollback.md`. The fixed order is deny-all, privilege check,
new-only BFF/Edge, secret rotation, session revocation, frontend promotion, read-only smoke, R1
allowlist, then each verified R2 action separately.

Rollback is forward-only:

- Frontend returns to a new-auth-compatible read-only maintenance build.
- Edge keeps `ADMIN_WRITE_MODE=deny_all`; old auth never returns.
- Database keeps browser grants revoked and receives a forward fix.
- Secrets are replaced with another new key; compromised values are never restored.
- External operations resume or compensate and remain non-successful until server verification.
