-- Tighten shared-trip privacy for fields and metadata that belong to one user.
-- Shared members can still read shared receipt rows, but private Notion ids,
-- sync-job payloads, item details, and photo storage metadata stay owner-only.
--
-- Rollback, only if collaboration intentionally needs these rows shared:
--   restore the previous trip-wide select policies from 20260526071500.

update public.trips
set notion_page_id = null,
    notion_database_id = null
where notion_page_id is not null
   or notion_database_id is not null;

create or replace function public.enforce_trip_private_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    raise exception 'trip owner_id cannot be changed';
  end if;
  new.notion_page_id := null;
  new.notion_database_id := null;
  return new;
end;
$$;

drop trigger if exists enforce_trip_private_fields_before_write on public.trips;
create trigger enforce_trip_private_fields_before_write
  before insert or update on public.trips
  for each row execute function public.enforce_trip_private_fields();

drop policy if exists receipt_items_select_trip_members on public.receipt_items;
create policy receipt_items_select_own
  on public.receipt_items for select
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists receipt_photos_select_trip_members on public.receipt_photos;
create policy receipt_photos_select_own
  on public.receipt_photos for select
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists receipt_sync_jobs_select_trip_members on public.receipt_sync_jobs;
create policy receipt_sync_jobs_select_own
  on public.receipt_sync_jobs for select
  to authenticated
  using (owner_id = (select auth.uid()));;
