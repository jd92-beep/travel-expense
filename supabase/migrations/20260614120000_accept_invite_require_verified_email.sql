-- Harden trip-invite acceptance: require a verified email.
--
-- accept_trip_invite() matches the pending invite's email to the caller's JWT email, but did not
-- check email_verified. An attacker could sign up with someone else's address (unverified) and
-- accept an invite meant for that person. We now reject when email_verified is explicitly false.
-- The claim is coalesced to true so JWTs that omit it (magic link / OAuth, which imply a verified
-- email) keep working — only KNOWN-unverified accounts are blocked.
--
-- Applied to live (fbnnjoahvtdrnigevrtw) via the Management API (idempotent CREATE OR REPLACE);
-- this file keeps fresh deploys consistent. Full function body matches the live definition with
-- the guard added after the authenticated-email check.

create or replace function public.accept_trip_invite(p_token text)
 returns table(trip_id uuid, role text, status text)
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
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
  if coalesce((auth.jwt() ->> 'email_verified')::boolean, true) = false then
    raise exception 'Email must be verified to accept an invite';
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
    return;
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
$function$;
