-- Fix account deletion for shared-trip owners.
-- Previous delete_own_user_account() always failed: enforce_trip_private_fields
-- blocked owner_id changes, and trip_members_one_owner_idx blocked promoting a
-- successor without demoting the old owner first. Private receipts were also
-- transferred to the successor, leaking another user's private ledger.
--
-- Applies a session-local GUC so only this security-definer RPC can transfer
-- ownership. Ordinary clients cannot set the GUC through PostgREST.

begin;

create or replace function public.enforce_trip_private_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    -- Only the account-deletion RPC may transfer ownership (session-local GUC).
    if coalesce(current_setting('app.allow_owner_transfer', true), '') <> 'on' then
      raise exception 'trip owner_id cannot be changed';
    end if;
  end if;
  new.notion_page_id := null;
  new.notion_database_id := null;
  return new;
end;
$$;

create or replace function private.guard_trip_member_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id uuid := case when tg_op = 'DELETE' then old.trip_id else new.trip_id end;
  v_owner_id uuid;
  v_allow_transfer boolean := coalesce(current_setting('app.allow_owner_transfer', true), '') = 'on';
begin
  select t.owner_id into v_owner_id
  from public.trips t
  where t.id = v_trip_id;

  if v_owner_id is null and tg_op = 'DELETE' then
    return old;
  end if;
  if v_owner_id is null then
    raise exception 'Trip not found' using errcode = '23503';
  end if;

  -- Account-deletion transfer path: demote old owner, then promote successor.
  if v_allow_transfer then
    if tg_op in ('INSERT', 'UPDATE') and new.role = 'owner' and new.status = 'active' then
      return new;
    end if;
    if tg_op = 'UPDATE' and new.user_id = old.user_id then
      return new;
    end if;
    if tg_op = 'DELETE' then
      return old;
    end if;
  end if;

  if tg_op = 'DELETE' and old.user_id = v_owner_id then
    raise exception 'Cannot delete trip owner membership' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.user_id = v_owner_id and (
    new.trip_id <> old.trip_id
    or new.user_id <> old.user_id
    or new.role <> 'owner'
    or new.status <> 'active'
  ) then
    raise exception 'Cannot change trip owner membership' using errcode = '23514';
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    if new.user_id = v_owner_id and (new.role <> 'owner' or new.status <> 'active') then
      raise exception 'Trip owner membership must remain active owner' using errcode = '23514';
    end if;
    if new.role = 'owner' and (new.user_id <> v_owner_id or new.status <> 'active') then
      raise exception 'Only the trip owner can hold the owner role' using errcode = '23514';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.guard_trip_member_owner() from public, anon, authenticated;

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

  -- Session-local: only this security-definer function may transfer ownership.
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
      -- Private receipts stay with the deleting user and are removed, not transferred.
      delete from public.receipts
      where trip_id = t_record.id
        and owner_id = current_user_id
        and visibility = 'private';

      -- Demote the deleting user's owner membership before promoting the successor
      -- (trip_members_one_owner_idx allows only one owner row per trip).
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

      -- Transfer only trip-visible shared receipts.
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
$$ language plpgsql security definer;

alter function public.delete_own_user_account() owner to postgres;
revoke all on function public.delete_own_user_account() from public, anon;
grant execute on function public.delete_own_user_account() to authenticated;

commit;
