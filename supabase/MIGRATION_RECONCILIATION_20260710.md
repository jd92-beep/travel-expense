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
| Private receipt-photo storage migration | Moved to `migrations-staged/`; it remains compatibility-gated until both Compact and Android signed-photo clients are live. |

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
```

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
