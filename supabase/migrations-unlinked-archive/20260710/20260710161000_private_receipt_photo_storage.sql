-- Compatibility-gated migration: deploy signed-URL capable Compact and Android
-- clients before applying this transaction to production.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

update storage.buckets
set public = false,
    file_size_limit = 6000000,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[]
where id = 'receipt-photos';

drop policy if exists "receipt_photos_public_read" on storage.objects;
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
  )
);

commit;
