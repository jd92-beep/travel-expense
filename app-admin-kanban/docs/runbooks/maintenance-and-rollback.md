# Maintenance And Rollback

## Preconditions

1. Confirm the release commit, Admin version, Vercel project, Edge source SHA and schema fingerprint.
2. Confirm the worktree is clean and every required CI job is green.
3. Confirm `ADMIN_WRITE_MODE=deny_all` before touching production.
4. Confirm Compact and Android compatibility versions are active before enabling strict receipt,
   itinerary or private-photo contracts.
5. Record the maintenance incident/request ID. Do not record secret values.

## Cutover

1. Deploy the deny-all maintenance state.
2. Apply reviewed forward-only privilege/schema migrations. Never run `supabase db push` or
   `supabase migration repair` without separate Boss approval.
3. Deploy the signed BFF and new-only Edge authentication boundary.
4. Rotate machine keys in the documented order and revoke old sessions.
5. Deploy the Admin frontend and verify `/api/health` version, Git SHA and read traffic status.
6. Enroll and verify the Boss passkey, then remove the temporary bootstrap binding.
7. Run login, read-only, route, mobile and accessibility canaries.
8. Enable R1 allowlisted operations.
9. Enable each verified R2 operation separately after preview, step-up, idempotency and audit proof.
10. Keep R3 actions disabled in Admin 1.0.

## Rollback Triggers

- Authentication failure or unexpected `401/403` above 5% for five minutes.
- Any data mutation mismatch, audit gap or operation with an unknown outcome that cannot be queried.
- Frontend/Edge/schema provenance drift.
- Two consecutive latency windows above the release target.

## Forward-Only Rollback

1. Immediately return to `ADMIN_WRITE_MODE=deny_all`.
2. Frontend: promote the latest new-auth-compatible read-only maintenance build.
3. BFF/Edge: promote the last new-auth-compatible bundle. Never restore direct browser Edge auth.
4. Database: keep grants revoked and ship a forward fix. Never reopen public admin access.
5. Secrets: create another new key. Never restore a retired or exposed value.
6. External saga: resume, retry or compensate and keep the operation visible until verified.
7. Record the rollback, request IDs, versions and audit digest in the incident.
