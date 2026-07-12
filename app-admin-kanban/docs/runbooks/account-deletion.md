# Scheduled Account Deletion

This procedure belongs to Admin 1.1 and is server-disabled in Admin 1.0.

## Preview

1. Block the current Admin account and every protected owner target.
2. Build a server-side manifest for profiles, trips, receipts, items, photos, memberships, invites,
   comments, integrations, jobs, storage objects and Auth identity.
3. Require shared-trip ownership transfer before scheduling deletion.
4. Confirm PITR/backup availability and a recent restore rehearsal.

## Quarantine

1. Suspend the account and revoke sessions.
2. Create a seven-day recoverable quarantine operation with an immutable target manifest.
3. Permit cancellation during quarantine and record it in append-only audit.

## Purge

1. Recompute and compare the manifest immediately before purge; stale manifests fail closed.
2. Remove canonical database data in one transaction and persist the storage cleanup manifest.
3. Delete private storage objects through retryable operation steps.
4. Delete the Auth user last.
5. Report complete only after database, storage and Auth verification all succeed.

The isolated test fixture must cover at least 1,001 photos. Emergency immediate purge exists only as
a platform-owner procedure and is not exposed in the console.
