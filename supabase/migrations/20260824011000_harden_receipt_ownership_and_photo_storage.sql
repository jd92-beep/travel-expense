-- Close receipt ownership and Storage privacy gaps without mutating existing rows.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.enqueue_notion_receipt_sync(
  p_receipt_id uuid,
  p_operation text default 'upsert',
  p_payload jsonb default '{}'::jsonb
)
returns public.receipt_sync_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.receipts%rowtype;
  v_job public.receipt_sync_jobs%rowtype;
begin
  select * into v_receipt
  from public.receipts
  where id = p_receipt_id;

  if not found then
    raise exception 'receipt % not found', p_receipt_id using errcode = 'P0002';
  end if;
  if v_receipt.owner_id <> (select auth.uid()) then
    raise exception 'only the receipt owner can enqueue sync for receipt %', p_receipt_id using errcode = '42501';
  end if;
  if not private.can_edit_trip(v_receipt.trip_id) then
    raise exception 'not allowed to enqueue sync for receipt %', p_receipt_id using errcode = '42501';
  end if;
  if p_operation not in ('upsert', 'delete') then
    raise exception 'invalid sync operation %', p_operation using errcode = '22023';
  end if;
  if v_receipt.visibility = 'private' and p_operation = 'upsert' then
    raise exception 'Private receipts cannot be queued for Notion upsert' using errcode = '23514';
  end if;

  insert into public.receipt_sync_jobs as jobs (
    receipt_id, trip_id, owner_id, provider, operation, status, attempts,
    next_attempt_at, locked_at, locked_by, last_error, payload
  ) values (
    v_receipt.id, v_receipt.trip_id, v_receipt.owner_id, 'notion', p_operation,
    'pending', 0, clock_timestamp(), null, null, null, coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (receipt_id, provider)
  do update set
    operation = excluded.operation,
    status = 'pending',
    attempts = 0,
    next_attempt_at = clock_timestamp(),
    locked_at = null,
    locked_by = null,
    last_error = null,
    payload = excluded.payload,
    updated_at = clock_timestamp()
  returning * into v_job;

  update public.receipts
  set notion_sync_status = 'pending',
      notion_sync_error = null,
      notion_sync_attempts = 0,
      notion_last_queued_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = v_receipt.id;

  return v_job;
end;
$$;

revoke all on function public.enqueue_notion_receipt_sync(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.enqueue_notion_receipt_sync(uuid, text, jsonb)
  to authenticated, service_role;

drop policy if exists receipt_items_update_trip_editors on public.receipt_items;
create policy receipt_items_update_trip_editors
  on public.receipt_items for update to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.receipts r
      where r.id = receipt_items.receipt_id
        and r.owner_id = (select auth.uid())
        and private.can_edit_trip(r.trip_id)
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.receipts r
      where r.id = receipt_items.receipt_id
        and r.owner_id = (select auth.uid())
        and private.can_edit_trip(r.trip_id)
    )
  );

drop policy if exists receipt_photos_update_trip_editors on public.receipt_photos;
create policy receipt_photos_update_trip_editors
  on public.receipt_photos for update to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.receipts r
      where r.id = receipt_photos.receipt_id
        and r.owner_id = (select auth.uid())
        and private.can_edit_trip(r.trip_id)
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.receipts r
      where r.id = receipt_photos.receipt_id
        and r.owner_id = (select auth.uid())
        and private.can_edit_trip(r.trip_id)
    )
  );

update storage.buckets
set public = false,
    file_size_limit = 6000000,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'receipt-photos';

drop policy if exists "receipt_photos_public_read" on storage.objects;
drop policy if exists "receipt_photos_read_own" on storage.objects;
drop policy if exists "receipt_photos_read_trip_members" on storage.objects;

create policy "receipt_photos_read_trip_members"
on storage.objects for select to authenticated
using (
  bucket_id = 'receipt-photos'
  and exists (
    select 1
    from public.receipt_photos rp
    join public.receipts r on r.id = rp.receipt_id
    where rp.storage_bucket = 'receipt-photos'
      and rp.storage_path = storage.objects.name
      and private.can_access_trip(r.trip_id)
      and (r.visibility = 'trip' or r.owner_id = (select auth.uid()))
  )
);
