# Travel Expense Admin Console Handover

Last updated: 2026-07-10 HKT

## Current Status

- Production URL: `https://travel-expense-admin-kanban.vercel.app`
- Current transitional frontend: `0.8.1`
- Supported scope: Compact Web, Android and their shared Supabase/Notion/Broker contracts.
- Production mode: **read-only containment**. Edge mutations and provider probes are backend-denied.
- Admin 1.0 is **not production-complete**. The current UI and bearer/session architecture are being
  replaced by the accepted Admin 1.0 plan.

Never put the passphrase, session token, Supabase keys, Broker keys or credential values in this
file, source control, screenshots, support bundles or chat output.

## Security Boundary

Current containment:

1. `ADMIN_WRITE_MODE` defaults and unknown values to `deny_all`.
2. Only the fixed Edge GET `READ_ROUTE_MAP` is reachable.
3. POST/PUT/PATCH/DELETE and external side effects return `503 ADMIN_WRITES_DISABLED` with a request
   ID before legacy route code can execute.
4. `admin_action_requests`, `admin_console_config` and `admin_identity_links` have service-role-only
   policies/grants. Anon and normal authenticated roles cannot CRUD them or execute the admin RLS
   helper.
5. The old `ADMIN_TOKEN` path and generic Broker bypass are removed. Edge-to-Broker requests use a
   rotated scoped key and fixed route allowlist.
6. Receipt photos are served through short-lived signed URLs. The Admin endpoint has no public URL
   fallback.

Known auth gap before Admin 1.0:

- The browser still uses a transitional passphrase-to-bearer session and connects directly to Edge.
- Opaque HttpOnly sessions, passkey second factor, CSRF, durable rate limiting and the signed
  same-origin BFF are Task 3 and remain mandatory before enabling writes.
- New browser startup must delete the old `sessionStorage` bearer when Task 3 lands.

## Live Evidence

Verified on 2026-07-10:

- Unauthenticated Edge mutation: `503 ADMIN_WRITES_DISABLED` with request ID.
- Real anon PostgREST table GET/POST/PATCH/DELETE and admin RPC execute: denied with `401/42501`.
- SQL smoke: `admin_console_privilege_smoke_passed`.
- Adjacent function smoke: `adjacent_security_privilege_smoke_passed`.
- Edge Deno unit tests: `10 passed`, `0 failed`.
- Broker: `npm run check` and `npm run self-test` passed after key rotation.
- Admin: `npm ci --ignore-scripts`, `npm run typecheck`, `npm run build`, audit `0` vulnerabilities.
- Current-tree secret scan and containment verifier passed.

Evidence files outside the public repository:

- `/tmp/admin-console-privileges-pre-20260710.json`
- `/tmp/admin-console-privileges-post-20260710.json`
- `/tmp/admin-console-schema-pre-20260710.json`
- `/tmp/admin-console-schema-post-20260710.json`

## Photo Privacy Gate

Code is ready but the live `receipt-photos` bucket remains public for old-client compatibility.

- Compact `0.13.6`: signed upload and batch-refresh URLs, focused smoke `1/1` passed.
- Android `0.16.4`: matching signed URL implementation; branch commit `d294648`; native QA passed.
- Admin Edge: 60-second signed URL, no fail-open public fallback.
- Migration: `supabase/migrations/20260710161000_private_receipt_photo_storage.sql`.

Do not apply that migration until both client builds are deployed and active compatibility is
confirmed. Applying it early breaks receipt images in old Android installations.

## Deployment Truth

As of 2026-07-10 there is no Admin-specific GitHub production workflow. The currently inspected
production deployment is a Vercel CLI deployment. A normal git push must not be described as an
Admin deployment until the planned protected CI/CD workflow lands.

Current commands:

```bash
cd app-admin-kanban
npm ci --ignore-scripts
npm run typecheck
npm run build

cd ..
npx supabase functions deploy admin-kanban --no-verify-jwt
```

Do not run a manual production Vercel deploy from a dirty worktree. For Admin 1.0 release, add the
protected GitHub workflow, synthetic preview environment, Boss approval gate and provenance record
before replacing this section.

## Open Blockers

1. Reconcile diverged Supabase migration history. Do not run `db push` or `migration repair`.
2. Transfer admin helper ownership to a reviewed non-login role through a platform-owner operation;
   the managed SQL API cannot perform that transfer.
3. Implement passphrase + passkey auth, opaque sessions, CSRF and signed fixed-route BFF.
4. Replace the giant snapshot and legacy tabs with paginated read APIs and five workspaces.
5. Deploy Compact/Android compatibility and then apply the private photo migration.
6. Keep all R2/R3 operations server-disabled until preview, step-up, version, idempotency and audit
   gates are green.

## Rollback

- Frontend: use the last new-auth-compatible read-only maintenance build once Task 3 lands.
- Edge: keep `ADMIN_WRITE_MODE=deny_all`; roll forward to a fixed bundle. Never restore old auth.
- Database: keep browser grants revoked and forward-fix migrations. Never reopen public admin access.
- Secrets: generate another new key. Never restore the rotated value.
- External operations: resume or compensate; do not report success until verified.
