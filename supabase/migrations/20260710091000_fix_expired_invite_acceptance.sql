-- Fix: expired trip invites were still being accepted.
--
-- In accept_trip_invite() the expired branch called `return next` but not
-- `return`, so plpgsql kept executing — it inserted the caller into
-- trip_members and flipped the invite status from 'expired' back to
-- 'accepted'. The expiry check was therefore a no-op: any expired (but still
-- 'pending') invite granted access. This redefines the function so the expired
-- branch exits immediately after emitting its 'expired' result row.

create or replace function public.accept_trip_invite(p_token text)
returns table (
  trip_id uuid,
  role text,
  status text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text := encode(digest(btrim(coalesce(p_token, '')), 'sha256'), 'hex');
  v_invite public.trip_invites%rowtype;
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if v_email = '' then
    raise exception 'Authenticated email required';
  end if;

  select *
  into v_invite
  from public.trip_invites
  where token_hash = v_hash
  for update;

  if v_invite.id is null then
    raise exception 'Invite not found';
  end if;
  if v_invite.status <> 'pending' then
    raise exception 'Invite is not pending';
  end if;
  if v_invite.expires_at <= now() then
    update public.trip_invites
    set status = 'expired', updated_at = now()
    where id = v_invite.id;
    trip_id := v_invite.trip_id;
    role := v_invite.role;
    status := 'expired';
    return next;
    return; -- BUGFIX: stop here so an expired invite is never accepted.
  end if;
  if v_invite.email_normalized <> v_email then
    raise exception 'Invite email does not match signed-in user';
  end if;

  insert into public.trip_members (trip_id, user_id, role, status)
  values (v_invite.trip_id, (select auth.uid()), v_invite.role, 'active')
  on conflict (trip_id, user_id)
  do update set role = case
                         when private.trip_member_role_rank(trip_members.role) >= private.trip_member_role_rank(excluded.role)
                           then trip_members.role
                         else excluded.role
                       end,
                status = 'active',
                updated_at = now();

  update public.trip_invites
  set status = 'accepted', accepted_by = (select auth.uid()), updated_at = now()
  where id = v_invite.id;

  trip_id := v_invite.trip_id;
  select tm.role
  into role
  from public.trip_members tm
  where tm.trip_id = v_invite.trip_id
    and tm.user_id = (select auth.uid());
  status := 'accepted';
  return next;
end;
$$;

revoke execute on function public.accept_trip_invite(text) from public, anon;
grant execute on function public.accept_trip_invite(text) to authenticated;
