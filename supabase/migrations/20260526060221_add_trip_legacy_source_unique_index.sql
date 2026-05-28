-- Prevent duplicate public trips for the same signed-in user and local source id.
-- Kept guarded because older local/live setups may apply this before the base
-- Supabase schema migration exists in the checkout.
-- Rollback: drop index if exists public.trips_owner_legacy_source_unique_idx;
do $$
begin
  if to_regclass('public.trips') is not null then
    create unique index if not exists trips_owner_legacy_source_unique_idx
      on public.trips (owner_id, legacy_source_id)
      where legacy_source_id is not null and btrim(legacy_source_id) <> '';
  end if;
end $$;
