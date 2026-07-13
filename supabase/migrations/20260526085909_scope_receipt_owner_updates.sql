-- Tighten receipt mutation policies for collaborative trips.
-- Editors may still read shared trip receipts, but each signed-in user may only
-- update, delete, or queue Notion sync jobs for rows they own.

drop policy if exists receipts_update_trip_editors on public.receipts;
create policy receipts_update_trip_editors
  on public.receipts for update
  to authenticated
  using (owner_id = (select auth.uid()) and private.can_edit_trip(trip_id))
  with check (owner_id = (select auth.uid()) and private.can_edit_trip(trip_id));

drop policy if exists receipts_delete_trip_editors on public.receipts;
create policy receipts_delete_trip_editors
  on public.receipts for delete
  to authenticated
  using (owner_id = (select auth.uid()) and private.can_edit_trip(trip_id));

drop policy if exists receipt_items_update_trip_editors on public.receipt_items;
create policy receipt_items_update_trip_editors
  on public.receipt_items for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.receipts r
      where r.id = receipt_items.receipt_id
        and private.can_edit_trip(r.trip_id)
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.receipts r
      where r.id = receipt_items.receipt_id
        and private.can_edit_trip(r.trip_id)
    )
  );

drop policy if exists receipt_items_delete_trip_editors on public.receipt_items;
create policy receipt_items_delete_trip_editors
  on public.receipt_items for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.receipts r
      where r.id = receipt_items.receipt_id
        and private.can_edit_trip(r.trip_id)
    )
  );

drop policy if exists receipt_photos_update_trip_editors on public.receipt_photos;
create policy receipt_photos_update_trip_editors
  on public.receipt_photos for update
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.receipts r
      where r.id = receipt_photos.receipt_id
        and private.can_edit_trip(r.trip_id)
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.receipts r
      where r.id = receipt_photos.receipt_id
        and private.can_edit_trip(r.trip_id)
    )
  );

drop policy if exists receipt_photos_delete_trip_editors on public.receipt_photos;
create policy receipt_photos_delete_trip_editors
  on public.receipt_photos for delete
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.receipts r
      where r.id = receipt_photos.receipt_id
        and private.can_edit_trip(r.trip_id)
    )
  );

drop policy if exists receipt_sync_jobs_update_trip_editors on public.receipt_sync_jobs;
create policy receipt_sync_jobs_update_trip_editors
  on public.receipt_sync_jobs for update
  to authenticated
  using (owner_id = (select auth.uid()) and private.can_edit_trip(trip_id))
  with check (owner_id = (select auth.uid()) and private.can_edit_trip(trip_id));

drop policy if exists receipt_sync_jobs_delete_trip_editors on public.receipt_sync_jobs;
create policy receipt_sync_jobs_delete_trip_editors
  on public.receipt_sync_jobs for delete
  to authenticated
  using (owner_id = (select auth.uid()) and private.can_edit_trip(trip_id));;
