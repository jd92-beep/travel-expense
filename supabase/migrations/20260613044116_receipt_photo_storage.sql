-- Supabase Storage for receipt photos.
-- Creates the receipt-photos bucket and storage RLS policies.

-- 1. Create storage bucket (idempotent)
insert into storage.buckets (id, name, public)
values ('receipt-photos', 'receipt-photos', true)
on conflict (id) do nothing;

update storage.buckets
set public = true
where id = 'receipt-photos';

drop policy if exists "receipt_photos_upload_own" on storage.objects;
drop policy if exists "receipt_photos_read_own" on storage.objects;
drop policy if exists "receipt_photos_public_read" on storage.objects;
drop policy if exists "receipt_photos_delete_own" on storage.objects;

-- 2. Storage RLS: authenticated users upload to own path
create policy "receipt_photos_upload_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'receipt-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Storage RLS: authenticated users read own photos
create policy "receipt_photos_read_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'receipt-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Storage RLS: public read (for shared trip members viewing photos)
create policy "receipt_photos_public_read"
on storage.objects for select
using (bucket_id = 'receipt-photos');

-- 5. Storage RLS: owner can delete own photos
create policy "receipt_photos_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'receipt-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);;
