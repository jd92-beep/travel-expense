# Travel Expense Admin Console Handover

Last updated: 2026-07-14 HKT

## Current Status

- Production URL: `https://travel-expense-admin-kanban.vercel.app`
- Verified production: Admin `1.0.1`, with bounded default-workspace prefetch, idle-polling removal,
  Volcano provider coverage, strict live Broker health and explicit awaiting-heartbeat client status.
  Workflow `29337850114` attempt 2 passed at exact SHA
  `697a9c9522b14a1a67e77ab4088136e48de369b2`: Vercel
  `dpl_6R3tZEYhwmiJ5CyeykdnqKhYshSv`; Edge
  `fbnnjoahvtdrnigevrtw_c64e6bb8-1c80-4d69-a590-a69203830aa9_92`; schema `20260712123000`.
- Completed passkey bootstrap closure: first passkey enrollment BFF begin/finish returned `200`; Edge
  credential register, revoke-all, session create and session verify all returned `200`. The current
  passphrase remains unchanged and necessary. `ADMIN_PASSKEY_BOOTSTRAP_SECRET` is removed from Vercel
  Production, temporary Keychain items are removed, and workflow `29303308607` deployed
  `dpl_59zhH1QnLEXtPnfNq8yHkscPczJe` for bootstrap closure.
- Previous Admin `1.0.0` production release: PR #49 merged at exact Git SHA
  `0a71608e2b0c888eb7e7e4efb194a21a59ad935b` with localized Chrome passkey-focus guidance. Final
  workflow `29303864302` succeeded at that SHA: Vercel `dpl_A7o26cPYDieYCa1RaNcVvGpJ4XWh`; Edge
  `fbnnjoahvtdrnigevrtw_c64e6bb8-1c80-4d69-a590-a69203830aa9_90`; schema `20260712123000`.
- Current live proof: `/api/health` returns `200`, Admin `1.0.1`, exact SHA/deployment and
  `acceptingReadTraffic=true`. Broker `/health` returns exact service
  `travel-expense-credential-broker`, version `2026.06.12`; deployed Edge source contains Volcano,
  strict Broker health and `awaiting_heartbeat`. Edge versions are `admin-auth-state` `38`,
  `admin-kanban` `92`, and `receipt-sync-worker` `38`; direct unsigned runtime access returns
  `401 ADMIN_SIGNATURE_MISSING`.
- Production database contract: `20260712123000` (`admin-passkeys-v2`).
- Compatibility baseline: Compact Web `0.16.3`, Android `0.19.2`, React `0.2.4`.
- Supported scope: Compact Web, Android and their shared Supabase/Notion/Broker contracts.
- All CI groups, protected promotion and current runtime/auth-route checks passed.
- Receipt photos remain in public compatibility mode until client heartbeats prove signed-URL
  compatibility; do not apply the staged private migration before that proof.
- The current passphrase remains unchanged and necessary; passkey is additive. Passkey enrollment and
  bootstrap removal are complete. Boss is performing the final post-bootstrap fresh login check now;
  do not mark that check complete until its result is recorded.
- Writes remain `deny_all`.
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

The legacy browser bearer and direct Edge authorization paths are removed. In live production,
unauthenticated `/api/admin/session` and rewritten nested itinerary reads return typed
`401 UNAUTHORIZED`; direct `/api/admin?__admin_path=session` returns typed `404 NOT_FOUND`.

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
- Nagoya acceptance is exactly six days, `2026-04-20` through `2026-04-25`, with all `21/21`
  scenery spots in range. Compact/React browser and static contract tests are green.

## Release Evidence

Verified for current production promotion:

- Admin `1.0.1` production verification: typecheck/build/security passed; unit `32/32`, contract
  `24/24`, full smoke `47 passed + 1 intentional skip`; Edge format/lint/check passed with `72/72`
  tests; `npm audit` found 0 vulnerabilities; GitNexus detect_changes reported LOW risk and 0
  affected processes. Workflow `29336763253` rejected a health/package version mismatch; PR #51
  added a package-bound regression. Workflow `29337850114` attempt 1 rejected stale Edge provenance;
  attempt 2 passed after reviewed Edge `v92` deployment. The current passphrase and credential values
  remain unchanged, writes remain `deny_all`, and no migration or live data mutation occurred.

- Admin `1.0.0` cutover metadata is aligned in `package.json`, both package-lock root entries and
  `/api/health`; this pass's typecheck, build and security scan passed, with unit `19/19` and
  contract `21/21`. Prior full smoke evidence remains
  `42 passed + 1 intentional visual-capture skip`; the suite covers login/WebAuthn, all 18 routes
  at seven release viewports, every visible R1/R2 action family and axe serious/critical checks;
  `npm audit` reports `0` vulnerabilities.
- First passkey enrollment BFF begin/finish returned `200`; Edge credential register, revoke-all,
  session create and session verify returned `200`. `ADMIN_PASSKEY_BOOTSTRAP_SECRET` was removed from
  Vercel Production; temporary Keychain items were removed; workflow `29303308607` deployed
  `dpl_59zhH1QnLEXtPnfNq8yHkscPczJe` for bootstrap closure.
- PR #49 merged as `0a71608e2b0c888eb7e7e4efb194a21a59ad935b` with localized Chrome focus guidance.
  Final workflow `29303864302` succeeded at that exact SHA and deployed Vercel
  `dpl_A7o26cPYDieYCa1RaNcVvGpJ4XWh`, Edge
  `fbnnjoahvtdrnigevrtw_c64e6bb8-1c80-4d69-a590-a69203830aa9_90`, schema `20260712123000`.
  `/api/health` returned `200` with `acceptingReadTraffic=true`; `/assets/index-BbcEP-GN.js` contains
  the localized focus guidance and bootstrap env is absent. Edge versions are `admin-auth-state` `37`,
  `admin-kanban` `90`, `receipt-sync-worker` `37`; direct negative canaries returned
  `401 ADMIN_SIGNATURE_MISSING` and `401 UNAUTHORIZED`.
- Workflow `29301851315` recorded the intended fail-closed readiness behavior: candidate readiness
  returned `503`, no Edge `/api/runtime` request occurred and candidate deployment
  `dpl_9yRX6HWGUfDHtnAS1vt7so5c4uma` was not promoted.
- After the official Vercel CLI configuration update, workflow `29302288203` completed all seven
  prerequisites and protected promotion at `72ee62507349e245b8613d9531958d428237bc90`. That interim
  promotion used Vercel `dpl_J6huupag1ur7GwmPCVU6k7b7kJsn`, Edge
  `fbnnjoahvtdrnigevrtw_c64e6bb8-1c80-4d69-a590-a69203830aa9_88`, schema `20260712123000`.
  `/api/health` returned `200`, version `1.0.0`, the exact SHA and `acceptingReadTraffic=true`;
  unauthenticated session returned `401` and direct catch-all session query returned `404`.
  The passphrase is unchanged; the later completed passkey bootstrap closure is recorded above.
- Edge: 28 files passed format/lint; all three entrypoints passed `deno check`; Deno tests
  `69 passed, 0 failed`.
- Compact `0.16.3` is the current app version; the prior 9/9 selected post-rebase gates passed,
  including itinerary merge, receipt
  tombstone, privacy, offline, mobile layout and final navigation.
- React `0.2.4`: typecheck/build/security passed; the deterministic clear-device repeat was `12/12`,
  and the full security smoke was `3 passed, 1 intentional skip`.
- Android `0.19.2` / versionCode `1920` is the current Oscar worktree baseline. It was not rebuilt
  or republished in this final web-console pass.
- BFF: the contract suite executes the real catch-all handler, session verification, CSRF and
  signed Edge transport; invalid provenance, redirects, malformed envelopes and escaped routes fail closed.
- Broker: check and self-test passed. Static migration policy and shared-ledger scans passed.
- Protected production workflow `29302288203` is the successful Admin 1.0 production promotion. The
  clean-database group applied every migration through `20260712123000` and passed all 15 tracked SQL
  fixtures.
- Receipt-photo compatibility source gate passed: final active state requires a public
  `receipt-photos` bucket and exact public read policy, while the private staged migration remains
  separately verified. Production stays in this public compatibility mode pending client heartbeats.
- Reviewer follow-up validates the bucket cardinality, complete public-policy metadata and normalized
  predicate, authenticated owner-path storage writes/deletes, and authenticated owner/trip table
  visibility predicates. The source scanner also locks the migration order and rejects later active
  receipt-photo mutations; typecheck/build/security, unit `19/19`, and contract `21/21` passed again.
- Second review broadens the source guard to all later Storage bucket references and Storage policy
  actions. It requires exact normalized policy expressions without `OR`/extra predicates and rejects
  the staged-only storage read policy; the existing RLS behavior fixture remains the end-to-end proof.
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

## Current Post-Bootstrap Open Items

1. **Promote and live-verify Admin 1.0.1** — merge the verified candidate through `main`, run the
   protected workflow, then record live `/api/health`, Volcano, Broker and client heartbeat-state
   evidence.
2. **Final post-bootstrap fresh login check (Boss is doing this now)** — passkey enrollment and
   bootstrap removal are complete. Do not mark this check passed until Boss records the fresh Chrome
   login result.
3. Keep the receipt-photo bucket in public compatibility mode until Compact/Android signed-URL
   heartbeats prove active compatibility.
4. Run a real ordinary authenticated JWT privilege smoke; privileged or service access is not a
   substitute.
5. Complete platform-owner hardening through the required platform-owner operation.

## Cutover And Rollback

Admin `1.0.0` final production promotion is verified at
`0a71608e2b0c888eb7e7e4efb194a21a59ad935b`; keep writes at `deny_all`. Follow
`docs/runbooks/maintenance-and-rollback.md` for future changes and keep the fixed order of privilege
check, new-only BFF/Edge, read-only smoke, R1 allowlist, then each verified R2 action separately.

Rollback is forward-only:

- Frontend returns to a new-auth-compatible read-only maintenance build.
- Edge keeps `ADMIN_WRITE_MODE=deny_all`; old auth never returns.
- Database keeps browser grants revoked and receives a forward fix.
- Secrets are replaced with another new key; compromised values are never restored.
- External operations resume or compensate and remain non-successful until server verification.
