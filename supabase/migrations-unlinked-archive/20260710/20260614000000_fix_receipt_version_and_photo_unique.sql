-- Corrective migration — reconcile schema drift that broke receipt sync.
--
-- The live project (fbnnjoahvtdrnigevrtw) was created before the receipts table
-- gained a `version` column, and `20260526071500`'s `create table if not exists`
-- skipped the pre-existing table, so the column was never added in prod. The
-- compact client sends `version` on every receipt upsert, so PostgREST rejected
-- every write (PGRST204 "column not found") — surfacing as a red "sync failed"
-- banner, a "local only" capsule, and a spurious "offline conflict" card.
--
-- Separately, the client upserts receipt photo metadata with onConflict:'receipt_id'
-- but only a NON-unique index existed on receipt_photos.receipt_id, so the metadata
-- insert failed (42P10). One photo per receipt is the intended model.
--
-- Applied to live via the Management API (idempotent SQL — never `db push`, the
-- migration history is diverged). This file keeps fresh deploys consistent.
--
-- Rollback:
--   alter table public.receipts drop column if exists version;
--   drop index if exists public.receipt_photos_receipt_id_key;

-- 1. Optimistic-locking version column the shared-ledger RPC + client both expect.
alter table public.receipts
  add column if not exists version integer not null default 1;

-- 2. One photo per receipt — required for the client's onConflict:'receipt_id' upsert.
create unique index if not exists receipt_photos_receipt_id_key
  on public.receipt_photos (receipt_id);

-- 3. Drop the now-redundant non-unique index (the unique one also serves lookups).
drop index if exists public.receipt_photos_receipt_id_idx;
