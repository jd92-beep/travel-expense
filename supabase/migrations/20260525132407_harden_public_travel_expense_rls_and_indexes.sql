create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create index if not exists receipt_items_owner_id_idx on public.receipt_items(owner_id);
create index if not exists receipt_photos_owner_id_idx on public.receipt_photos(owner_id);

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "trips_insert_own" on public.trips;
drop policy if exists "trip_members_select_visible" on public.trip_members;
drop policy if exists "receipts_insert_trip_editors" on public.receipts;
drop policy if exists "receipt_items_insert_trip_editors" on public.receipt_items;
drop policy if exists "receipt_photos_insert_trip_editors" on public.receipt_photos;
drop policy if exists "integrations_select_own" on public.integrations;
drop policy if exists "integrations_insert_own" on public.integrations;
drop policy if exists "integrations_update_own" on public.integrations;
drop policy if exists "integrations_delete_own" on public.integrations;

create policy "profiles_select_own" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id = (select auth.uid()));

create policy "trips_insert_own" on public.trips for insert to authenticated with check (owner_id = (select auth.uid()));

create policy "trip_members_select_visible" on public.trip_members for select to authenticated using (user_id = (select auth.uid()) or private.can_admin_trip(trip_id));

create policy "receipts_insert_trip_editors" on public.receipts for insert to authenticated with check (owner_id = (select auth.uid()) and private.can_edit_trip(trip_id));

create policy "receipt_items_insert_trip_editors" on public.receipt_items for insert to authenticated with check (
  owner_id = (select auth.uid()) and exists (select 1 from public.receipts r where r.id = receipt_id and private.can_edit_trip(r.trip_id))
);

create policy "receipt_photos_insert_trip_editors" on public.receipt_photos for insert to authenticated with check (
  owner_id = (select auth.uid()) and exists (select 1 from public.receipts r where r.id = receipt_id and private.can_edit_trip(r.trip_id))
);

create policy "integrations_select_own" on public.integrations for select to authenticated using (user_id = (select auth.uid()));
create policy "integrations_insert_own" on public.integrations for insert to authenticated with check (user_id = (select auth.uid()));
create policy "integrations_update_own" on public.integrations for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "integrations_delete_own" on public.integrations for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "receipt_photos_storage_select_own_prefix" on storage.objects;
drop policy if exists "receipt_photos_storage_insert_own_prefix" on storage.objects;
drop policy if exists "receipt_photos_storage_update_own_prefix" on storage.objects;
drop policy if exists "receipt_photos_storage_delete_own_prefix" on storage.objects;

create policy "receipt_photos_storage_select_own_prefix" on storage.objects for select to authenticated using (
  bucket_id = 'receipt-photos' and split_part(name, '/', 1) = (select auth.uid())::text
);
create policy "receipt_photos_storage_insert_own_prefix" on storage.objects for insert to authenticated with check (
  bucket_id = 'receipt-photos' and split_part(name, '/', 1) = (select auth.uid())::text
);
create policy "receipt_photos_storage_update_own_prefix" on storage.objects for update to authenticated using (
  bucket_id = 'receipt-photos' and split_part(name, '/', 1) = (select auth.uid())::text
) with check (
  bucket_id = 'receipt-photos' and split_part(name, '/', 1) = (select auth.uid())::text
);
create policy "receipt_photos_storage_delete_own_prefix" on storage.objects for delete to authenticated using (
  bucket_id = 'receipt-photos' and split_part(name, '/', 1) = (select auth.uid())::text
);;
