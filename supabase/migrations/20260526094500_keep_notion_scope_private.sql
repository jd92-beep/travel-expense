-- Keep personal Notion identifiers out of shared trip/receipt rows.
-- Shared trip members can read those rows, so personal Notion database/page
-- identifiers must live in profiles.app_settings, integrations, or the broker.

update public.profiles p
set app_settings = jsonb_set(
  coalesce(p.app_settings, '{}'::jsonb),
  '{notionDb}',
  to_jsonb(candidate.notion_database_id),
  true
)
from (
  select distinct on (owner_id) owner_id, notion_database_id
  from public.trips
  where notion_database_id is not null
    and btrim(notion_database_id) <> ''
    and notion_database_id <> '3438d94d5f7c81878221fcda6d65d39d'
  order by owner_id, updated_at desc
) candidate
where p.id = candidate.owner_id
  and coalesce(p.app_settings->>'notionDb', '') in ('', '3438d94d5f7c81878221fcda6d65d39d');

update public.trips
set notion_database_id = null
where notion_database_id is not null;

update public.receipts
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
  new.notion_database_id := null;
  return new;
end;
$$;

drop trigger if exists enforce_trip_private_fields_before_write on public.trips;
create trigger enforce_trip_private_fields_before_write
  before insert or update on public.trips
  for each row execute function public.enforce_trip_private_fields();

create or replace function public.enforce_receipt_private_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.notion_page_id := null;
  new.notion_database_id := null;
  return new;
end;
$$;

drop trigger if exists enforce_receipt_private_fields_before_write on public.receipts;
create trigger enforce_receipt_private_fields_before_write
  before insert or update on public.receipts
  for each row execute function public.enforce_receipt_private_fields();

drop policy if exists receipt_items_insert_trip_editors on public.receipt_items;
create policy receipt_items_insert_trip_editors
  on public.receipt_items for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.receipts r
      where r.id = receipt_items.receipt_id
        and r.owner_id = (select auth.uid())
        and private.can_edit_trip(r.trip_id)
    )
  );

drop policy if exists receipt_photos_insert_trip_editors on public.receipt_photos;
create policy receipt_photos_insert_trip_editors
  on public.receipt_photos for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.receipts r
      where r.id = receipt_photos.receipt_id
        and r.owner_id = (select auth.uid())
        and private.can_edit_trip(r.trip_id)
    )
  );

drop policy if exists receipt_sync_jobs_insert_trip_editors on public.receipt_sync_jobs;
create policy receipt_sync_jobs_insert_trip_editors
  on public.receipt_sync_jobs for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and private.can_edit_trip(trip_id)
    and exists (
      select 1
      from public.receipts r
      where r.id = receipt_sync_jobs.receipt_id
        and r.trip_id = receipt_sync_jobs.trip_id
        and r.owner_id = (select auth.uid())
    )
  );
