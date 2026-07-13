# Supabase Migration Reconciliation - 2026-07-10

## Decision

`supabase/migrations/` now starts with the 27 SQL migrations fetched from the
linked production migration history, followed by forward-only migrations. No
`supabase migration repair` or `supabase db push` was run.

The previous 28-file local history is preserved byte-for-byte in
`migrations-unlinked-archive/20260710/`. Verify it with:

```bash
cd supabase/migrations-unlinked-archive/20260710
shasum -a 256 -c SHA256SUMS
```

The production schema-only dump used for comparison contained no data rows:

```text
SHA-256: 0d5f5f354b2c9ccebdb924ad24f0a5fe40d95d17f1ef84de5312f65d511504f2
Lines:   4190
Bytes:   153484
```

The dump is intentionally not tracked because it contains a point-in-time
production schema snapshot.

## Disposition

| Previous local file or group | Disposition |
| --- | --- |
| Same-timestamp files at `20260526060221`, `20260526075811`, `20260526080011`, `20260526081438` | Active copies replaced by the exact linked-history SQL; divergent local bytes remain archived. |
| Local bootstrap and renamed migrations through receipt visibility | Replaced by their authoritative linked-history versions and timestamps. |
| `20260612180000` through `20260615140000` live hotfixes | Reintroduced unchanged under `20260710090000` through `20260710095900`, so they follow all linked migrations during a clean rebuild. |
| `20260602053000_add_trip_intelligence_metadata.sql` | Archived; absent from linked history and live canonical schema. |
| `20260603000000_reassign_boss_data.sql` | Archived; data migration is not replayed by a clean schema build. |
| `20260615120000_claim_receipt_sync_jobs.sql` | Archived; absent from linked history and live canonical schema. |
| Emergency containment and adjacent definer hardening | Kept active with their original forward timestamps and checksums. |
| Private receipt-photo storage migration | `20260710161000_private_receipt_photo_storage.sql` stays in `migrations-staged/` until both Compact and Android signed-photo clients are live and heartbeats confirm compatibility. Active `20260712122500_restore_receipt_photo_compatibility.sql` preserves public compatibility meanwhile. Neither migration was applied to production in the 2026-07-13 cutover-preparation pass. |

## Forward Migration Set

The active forward-only layer is:

```text
20260710090000 delete user account RPC
20260710091000 expired invite handling
20260710092000 receipt version and photo uniqueness
20260710093000 verified-email invite acceptance
20260710094000 shared-trip photo and invite guards
20260710095000 admin signup notifications
20260710095900 admin console framework
20260710100000 live drift, visibility, grants, and definer reconciliation
20260710114500 admin console emergency containment
20260710160000 adjacent SECURITY DEFINER hardening
20260712122500 receipt-photo public compatibility restoration
```

## Receipt-Photo Compatibility Gate

`20260712122500_restore_receipt_photo_compatibility.sql` follows the operation/privacy migrations
and precedes `20260712123000`. It keeps only the `receipt-photos` Storage bucket public, restores
the exact public `receipt_photos_public_read` policy, and removes the interim owner-only read
policy. It deliberately does not alter upload/delete policies or `public.receipt_photos` visibility
enforcement. The staged private migration remains a separately verified future contract.

The static gate requires this migration to be after `20260710187000` and immediately before
`20260712123000`; its public bucket and public-read `CREATE` actions must be final, and no later
active migration may mention receipt-photo compatibility state. The SQL fixture verifies final
`pg_policies` metadata and normalized predicates, not policy names alone.

The guard is deliberately conservative after the compatibility migration: any later
`storage.buckets` reference or `create`/`drop`/`alter policy` action on `storage.objects` is a
failure. The fixture requires exact normalized predicates in the correct `qual` or `with_check`
column, rejects logical `OR` and extra predicates, and rejects the staged-only read policy.

## Verification

The reconciled 37-migration history rebuilt from zero on PostgreSQL 17 in a
disposable local Supabase database. The following SQL gates passed against that
clean database:

```text
rls_isolation_smoke_passed
admin_console_privilege_smoke_passed
adjacent_security_privilege_smoke_passed
security_definer_contract_smoke_passed
```

The migration history must still be reviewed and deployed as a normal
forward-only release. This file is evidence, not authorization to repair the
remote migration table or push schema changes directly.

On 2026-07-13, static migration and shared-ledger scans passed for the public
compatibility state. Local Docker was unavailable, so the clean Supabase rebuild and SQL fixture
remain CI work. No production migration ran.
