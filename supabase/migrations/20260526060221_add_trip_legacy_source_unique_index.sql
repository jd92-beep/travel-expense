-- Prevent duplicate public trips for the same signed-in user and local source id.
-- Rollback: drop index if exists public.trips_owner_legacy_source_unique_idx;
create unique index if not exists trips_owner_legacy_source_unique_idx
  on public.trips (owner_id, legacy_source_id)
  where legacy_source_id is not null and btrim(legacy_source_id) <> '';;
