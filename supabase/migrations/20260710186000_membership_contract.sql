-- Membership invariants: the trip owner is immutable and reactivation uses the new invite role.

update public.trip_members tm
set role = 'admin', updated_at = clock_timestamp()
from public.trips t
where t.id = tm.trip_id
  and tm.role = 'owner'
  and tm.user_id <> t.owner_id;

insert into public.trip_members (trip_id, user_id, role, status)
select t.id, t.owner_id, 'owner', 'active'
from public.trips t
on conflict (trip_id, user_id)
do update set role = 'owner', status = 'active', updated_at = clock_timestamp();

create unique index if not exists trip_members_one_owner_idx
  on public.trip_members (trip_id)
  where role = 'owner';

create or replace function private.guard_trip_member_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id uuid := case when tg_op = 'DELETE' then old.trip_id else new.trip_id end;
  v_owner_id uuid;
begin
  select t.owner_id into v_owner_id
  from public.trips t
  where t.id = v_trip_id;

  -- A cascading trip delete removes the parent before the member rows.
  if v_owner_id is null and tg_op = 'DELETE' then
    return old;
  end if;
  if v_owner_id is null then
    raise exception 'Trip not found' using errcode = '23503';
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

drop trigger if exists trip_members_guard_owner on public.trip_members;
create trigger trip_members_guard_owner
before insert or update or delete on public.trip_members
for each row execute function private.guard_trip_member_owner();

create or replace function public.accept_trip_invite(p_token text)
returns table(trip_id uuid, role text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := encode(extensions.digest(btrim(coalesce(p_token, '')), 'sha256'), 'hex');
  v_invite public.trip_invites%rowtype;
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if v_email = '' then
    raise exception 'Authenticated email required' using errcode = '22023';
  end if;
  if coalesce((auth.jwt() ->> 'email_verified')::boolean, true) = false then
    raise exception 'Email must be verified to accept an invite' using errcode = '42501';
  end if;

  select * into v_invite
  from public.trip_invites
  where token_hash = v_hash
  for update;

  if v_invite.id is null then raise exception 'Invite not found' using errcode = 'P0002'; end if;
  if v_invite.status <> 'pending' then raise exception 'Invite is not pending' using errcode = '22023'; end if;
  if v_invite.expires_at <= clock_timestamp() then
    update public.trip_invites
    set status = 'expired', updated_at = clock_timestamp()
    where id = v_invite.id;
    trip_id := v_invite.trip_id;
    role := v_invite.role;
    status := 'expired';
    return next;
    return;
  end if;
  if v_invite.email_normalized <> v_email then
    raise exception 'Invite email does not match signed-in user' using errcode = '42501';
  end if;

  insert into public.trip_members (trip_id, user_id, role, status)
  values (v_invite.trip_id, auth.uid(), v_invite.role, 'active')
  on conflict on constraint trip_members_trip_id_user_id_key
  do update set role = case
                         when trip_members.status = 'removed' then excluded.role
                         when private.trip_member_role_rank(trip_members.role) >= private.trip_member_role_rank(excluded.role)
                           then trip_members.role
                         else excluded.role
                       end,
                status = 'active',
                updated_at = clock_timestamp();

  update public.trip_invites
  set status = 'accepted', accepted_by = auth.uid(), updated_at = clock_timestamp()
  where id = v_invite.id;

  trip_id := v_invite.trip_id;
  select tm.role into role
  from public.trip_members tm
  where tm.trip_id = v_invite.trip_id and tm.user_id = auth.uid();
  status := 'accepted';
  return next;
end;
$$;

revoke all on function public.accept_trip_invite(text)
  from public, anon, authenticated, service_role;
grant execute on function public.accept_trip_invite(text)
  to authenticated, service_role;

revoke insert, update, delete on table public.trip_members from authenticated;
grant select on table public.trip_members to authenticated;
