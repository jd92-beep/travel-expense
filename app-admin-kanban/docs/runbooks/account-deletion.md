# Scheduled Account Deletion

Implemented as Admin 1.1 `admin_purge_user` (R3), **server-disabled by default**.

## Enablement (production)

Both must be true or Edge returns 503:

1. `ADMIN_WRITE_MODE=allowlisted`
2. `ADMIN_ALLOW_R3_USER_PURGE=true`

Default remains off. Never enable without a reviewed ops plan.

## Scope

- **Solo / unshared owners only.** Shared owned trips with other active members fail closed.
- Protected owner email `vc06456@gmail.com` is rejected in the RPC.
- Admin actor cannot purge their own account.

## Flow

1. **Preview** — `private.admin_purge_user_manifest(uuid)` builds trips/receipts/items/photos,
   `storage_paths`, and Notion page IDs. UI shows counts; commit sends the manifest SHA-256.
2. **Commit** — Edge calls `public.admin_purge_user(target, manifest_hash)`:
   - deletes `storage.objects` for each `receipt-photos` path
   - deletes private receipts
   - transfers any unexpected shared-trip leftovers via the existing GUC path
   - deletes `auth.users` last (cascade cleans remaining rows)
3. **Notion** — not auto-deleted. Manifest lists page IDs; operator must archive in Notion
   or run a broker job. Result reports `notionPagesRequireManualCleanup`.

## Preview

1. Block the current Admin account and every protected owner target.
2. Build a server-side manifest for profiles, trips, receipts, items, photos, memberships, invites,
   comments, integrations, jobs, storage objects and Auth identity.
3. Require shared-trip ownership transfer before scheduling deletion.
4. Confirm PITR/backup availability and a recent restore rehearsal.

## Quarantine

Quarantine is not implemented in this cut. Purge is immediate after preview + step-up.

## Purge

1. Recompute and compare the manifest immediately before purge; stale manifests fail closed
   (`PREVIEW_STALE`).
2. Delete storage objects, then Auth user, in one security-definer RPC.
3. Report complete only after the RPC returns; verify storage orphan count if needed.

The isolated test fixture must cover at least 1,001 photos. Emergency immediate purge exists only as
a platform-owner procedure and is not exposed in the console.
