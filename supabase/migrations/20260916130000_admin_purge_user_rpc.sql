-- Admin 1.1 user purge (solo/unshared only). Server-disabled until
-- ADMIN_ALLOW_R3_USER_PURGE enables the Edge operation.
-- Service-role only. Blocks shared trips and protected emails.

begin;

create or replace function private.admin_purge_user_manifest(p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_manifest jsonb;
  v_shared_owned integer;
begin
  if p_target is null or not exists (select 1 from auth.users u where u.id = p_target) then
    raise exception 'Target user not found' using errcode = 'P0002';
  end if;

  select count(*) into v_shared_owned
  from public.trips t
  where t.owner_id = p_target
    and exists (
      select 1 from public.trip_members tm
      where tm.trip_id = t.id
        and tm.user_id <> p_target
        and tm.status = 'active'
    );

  if v_shared_owned > 0 then
    raise exception 'Target still owns shared trips with active members' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'userId', p_target,
    'email', (select email from auth.users where id = p_target),
    'trips', (select count(*) from public.trips where owner_id = p_target),
    'receipts', (select count(*) from public.receipts where owner_id = p_target),
    'receiptItems', (select count(*) from public.receipt_items where owner_id = p_target),
    'receiptPhotos', (select count(*) from public.receipt_photos where owner_id = p_target),
    'storagePaths', (
      select coalesce(jsonb_agg(rp.storage_path order by rp.storage_path), '[]'::jsonb)
      from public.receipt_photos rp
      where rp.owner_id = p_target and rp.storage_path is not null
    ),
    'notionPageIds', (
      select coalesce(jsonb_agg(distinct x.page_id), '[]'::jsonb)
      from (
        select r.notion_page_id as page_id
        from public.receipts r
        where r.owner_id = p_target and r.notion_page_id is not null
        union
        select t.notion_page_id
        from public.trips t
        where t.owner_id = p_target and t.notion_page_id is not null
      ) x
      where x.page_id is not null
    ),
    'sharedOwnedTrips', v_shared_owned
  ) into v_manifest;

  return v_manifest;
end;
$$;

revoke all on function private.admin_purge_user_manifest(uuid) from public, anon, authenticated;
grant execute on function private.admin_purge_user_manifest(uuid) to service_role;

create or replace function public.admin_purge_user(
  p_target uuid,
  p_expected_manifest_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_manifest jsonb;
  v_hash text;
  v_paths text[] := '{}';
  v_deleted_objects integer := 0;
  v_path text;
  v_email text;
  t_record record;
  successor_id uuid;
begin
  if p_target is null then
    raise exception 'Target user is required' using errcode = '22023';
  end if;
  if coalesce(p_expected_manifest_hash, '') = '' then
    raise exception 'Expected manifest hash is required' using errcode = '22023';
  end if;

  select email into v_email from auth.users where id = p_target;
  if v_email is null then
    raise exception 'Target user not found' using errcode = 'P0002';
  end if;
  if lower(v_email) = 'vc06456@gmail.com' then
    raise exception 'Protected owner cannot be purged' using errcode = '42501';
  end if;

  v_manifest := private.admin_purge_user_manifest(p_target);
  select encode(extensions.digest(v_manifest::text, 'sha256'), 'hex') into v_hash;
  if v_hash is distinct from lower(btrim(p_expected_manifest_hash)) then
    raise exception 'PREVIEW_STALE: manifest changed' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(path), '{}')
  into v_paths
  from jsonb_array_elements_text(coalesce(v_manifest->'storagePaths', '[]'::jsonb)) as path;

  foreach v_path in array v_paths loop
    delete from storage.objects
    where bucket_id = 'receipt-photos' and name = v_path;
    if found then
      v_deleted_objects := v_deleted_objects + 1;
    end if;
  end loop;

  perform set_config('app.allow_owner_transfer', 'on', true);

  for t_record in
    select id from public.trips where owner_id = p_target
  loop
    select user_id into successor_id
    from public.trip_members
    where trip_id = t_record.id
      and user_id != p_target
      and status = 'active'
    order by
      case role when 'admin' then 1 when 'editor' then 2 when 'viewer' then 3 else 4 end asc,
      created_at asc
    limit 1;

    if successor_id is not null then
      delete from public.receipts
      where trip_id = t_record.id and owner_id = p_target and visibility = 'private';

      update public.trip_members
      set role = 'admin', updated_at = now()
      where trip_id = t_record.id and user_id = p_target and role = 'owner';

      update public.trips
      set owner_id = successor_id, updated_at = now()
      where id = t_record.id;

      update public.trip_members
      set role = 'owner', status = 'active', updated_at = now()
      where trip_id = t_record.id and user_id = successor_id;

      update public.receipts
      set owner_id = successor_id, updated_at = now()
      where trip_id = t_record.id
        and owner_id = p_target
        and coalesce(visibility, 'trip') <> 'private';

      update public.receipt_items ri
      set owner_id = successor_id, updated_at = now()
      from public.receipts r
      where r.id = ri.receipt_id and r.trip_id = t_record.id and ri.owner_id = p_target;

      update public.receipt_photos rp
      set owner_id = successor_id, updated_at = now()
      from public.receipts r
      where r.id = rp.receipt_id and r.trip_id = t_record.id and rp.owner_id = p_target;
    end if;
  end loop;

  delete from private.notion_import_batches where target_owner_id = p_target;
  delete from auth.users where id = p_target;

  return jsonb_build_object(
    'userId', p_target,
    'deletedStorageObjects', v_deleted_objects,
    'manifest', v_manifest,
    'notionPagesRequireManualCleanup', coalesce(jsonb_array_length(v_manifest->'notionPageIds'), 0),
    'status', 'purged'
  );
end;
$$;

alter function public.admin_purge_user(uuid, text) owner to postgres;
revoke all on function public.admin_purge_user(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_purge_user(uuid, text) to service_role;

commit;

-- Restore search_path on the self-serve delete RPC (CREATE OR REPLACE in
-- 20260916110000 dropped the hardened setting; CI security-definer smoke fails closed).
begin;
create or replace function public.delete_own_user_account()
returns void as $$
declare
  current_user_id uuid;
  t_record record;
  successor_id uuid;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  perform set_config('app.allow_owner_transfer', 'on', true);

  for t_record in
    select id from public.trips where owner_id = current_user_id
  loop
    select user_id into successor_id
    from public.trip_members
    where trip_id = t_record.id
      and user_id != current_user_id
      and status = 'active'
    order by
      case role
        when 'admin' then 1
        when 'editor' then 2
        when 'viewer' then 3
        else 4
      end asc,
      created_at asc
    limit 1;

    if successor_id is not null then
      delete from public.receipts
      where trip_id = t_record.id
        and owner_id = current_user_id
        and visibility = 'private';

      update public.trip_members
      set role = 'admin',
          updated_at = now()
      where trip_id = t_record.id
        and user_id = current_user_id
        and role = 'owner';

      update public.trips
      set owner_id = successor_id,
          updated_at = now()
      where id = t_record.id;

      update public.trip_members
      set role = 'owner',
          status = 'active',
          updated_at = now()
      where trip_id = t_record.id and user_id = successor_id;

      update public.receipts
      set owner_id = successor_id,
          updated_at = now()
      where trip_id = t_record.id
        and owner_id = current_user_id
        and coalesce(visibility, 'trip') <> 'private';

      update public.receipt_items
      set owner_id = successor_id,
          updated_at = now()
      where receipt_id in (
          select id from public.receipts
          where trip_id = t_record.id and owner_id = successor_id
        )
        and owner_id = current_user_id;

      update public.receipt_photos
      set owner_id = successor_id,
          updated_at = now()
      where receipt_id in (
          select id from public.receipts
          where trip_id = t_record.id and owner_id = successor_id
        )
        and owner_id = current_user_id;

      update public.trip_backend_links
      set notion_owner_user_id = successor_id,
          created_by = successor_id,
          updated_at = now()
      where trip_id = t_record.id;

      update public.trip_invites
      set invited_by = successor_id,
          updated_at = now()
      where trip_id = t_record.id and invited_by = current_user_id;
    end if;
  end loop;

  delete from private.notion_import_batches where target_owner_id = current_user_id;
  delete from auth.users where id = current_user_id;
end;
$$ language plpgsql security definer set search_path = '';

alter function public.delete_own_user_account() owner to postgres;
revoke all on function public.delete_own_user_account() from public, anon;
grant execute on function public.delete_own_user_account() to authenticated;

commit;

