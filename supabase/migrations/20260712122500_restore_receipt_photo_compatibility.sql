-- Keep legacy receipt-photo URLs compatible until Compact and Android heartbeats
-- prove the signed-URL clients are active. The private migration stays staged.

set local lock_timeout = '5s';
set local statement_timeout = '30s';

update storage.buckets
set public = true
where id = 'receipt-photos';

drop policy if exists "receipt_photos_read_own" on storage.objects;
drop policy if exists "receipt_photos_public_read" on storage.objects;

create policy "receipt_photos_public_read"
on storage.objects for select
using (bucket_id = 'receipt-photos');
