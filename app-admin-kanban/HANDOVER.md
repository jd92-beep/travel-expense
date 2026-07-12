# Travel Expense Admin Console Handover

Last updated: 2026-07-12 HKT

## Current Status

- Production URL: `https://travel-expense-admin-kanban.vercel.app`
- Production release: `0.8.3`, intentionally read-only.
- Verified local release candidate: `1.0.0-rc.1` on `codex/admin-console-1.0`.
- Supported scope: Compact Web, Android and their shared Supabase/Notion/Broker contracts.
- R0/R1/R2 code and release gates are complete locally. Production cutover is not approved or run.
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

The RC implements:

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

The legacy browser bearer and direct Edge authorization paths are removed from the RC. Production
still runs the old read-only build until the approved maintenance cutover.

## API And Operations

Read APIs cover overview/search, accounts/installations, trips/itinerary/versions, receipts/photos,
incidents, sync jobs, integrity, Notion reconciliation, providers, runtime, audit and operations.
Responses use typed envelopes, request IDs, source freshness and safe DTO allowlists.

Admin 1.0 operations:

- R1: redacted support bundle, provider probe and eligible sync retry/cancel.
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
  outside that range. Local Compact/React/Android/SQL tests are green. Live Boss data has not been
  rewritten because that requires explicit approval, backup and a fresh preview.

## Release Evidence

Verified on 2026-07-12:

- Admin: typecheck, build and security scan passed; unit `8/8`; contract `12/12`; full smoke
  `14 passed + 1 intentional visual-capture skip`; dedicated mobile `3/3`; axe serious/critical `0`
  across all 16 routes at desktop/mobile; `npm audit` reports `0` vulnerabilities.
- Edge: 21 files passed format/lint/check; Deno tests `50 passed, 0 failed`.
- Disposable Supabase: all ten auth/read/R2/receipt/itinerary/membership/security/worker SQL suites
  passed from a clean local rebuild.
- Compact `0.13.6`: isolated 21-stage production gate passed in 236 seconds.
- React `0.2.3`: typecheck/build/security/policy/contract gates passed; browser suite
  `30 passed, 5 intentional skips`.
- Android `0.18.2`: contract suites and isolated browser suites (`28 passed, 2 intentional skips`)
  passed; JDK wrapper selected JBR 21; debug build and `android:qa` passed with
  `appLinksVerified=true`. Artifact:
  `/tmp/travel-expense-android-qa-2026-07-12T02-10-31-087Z`.
- Broker: check, self-test and audit passed.

## CI And Runbooks

`.github/workflows/admin-console.yml` is synthetic CI only. It uses pinned actions and checks Admin,
Edge, Broker, shared contracts and a disposable Supabase. It does not receive production secrets or
deploy production. CODEOWNERS covers Admin, Edge, Broker and migrations.

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
8. Add protected production-environment approval/deploy outside the current CI-only workflow.

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
