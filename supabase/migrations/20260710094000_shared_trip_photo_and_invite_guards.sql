-- Shared-trip fixes (applied live via Management API; this file keeps fresh deploys consistent).
--
-- 1. receipt_photos was owner-only on SELECT, so shared-trip members could not read the storage
--    metadata for receipts added by other members and their photos failed to display. Allow any
--    member of the receipt's trip to read the photo metadata row.
-- 2. create_trip_invite did not reject inviting someone who is already an active member, producing
--    confusing duplicate invites. Reject when the email already belongs to an active member
--    (matched against auth.users since profiles has no email column; the RPC is SECURITY DEFINER).

drop policy if exists receipt_photos_select_trip_members on public.receipt_photos;
create policy receipt_photos_select_trip_members
  on public.receipt_photos for select to authenticated
  using (exists (
    select 1 from public.receipts r
    where r.id = receipt_photos.receipt_id
      and private.can_access_trip(r.trip_id)
  ));

create or replace function public.create_trip_invite(p_trip_id uuid, p_email text, p_role text default 'editor'::text, p_expires_days integer default 14)
 returns table(invite_id uuid, token text, email_normalized text, role text, expires_at timestamp with time zone)
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_role text := coalesce(nullif(btrim(p_role), ''), 'editor');
  v_token text := encode(gen_random_bytes(32), 'hex');
  v_hash text := encode(digest(v_token, 'sha256'), 'hex');
  v_expires timestamptz := now() + make_interval(days => greatest(1, least(coalesce(p_expires_days, 14), 30)));
  v_existing uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if not private.can_admin_trip(p_trip_id) then
    raise exception 'Trip admin role required';
  end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid invite email';
  end if;
  if v_email = lower(btrim(coalesce(auth.jwt() ->> 'email', ''))) then
    raise exception 'Cannot invite your own email';
  end if;
  if v_role not in ('editor', 'viewer') then
    raise exception 'Invalid invite role';
  end if;
  if exists (
    select 1 from public.trip_members tm
    join auth.users u on u.id = tm.user_id
    where tm.trip_id = p_trip_id and tm.status = 'active' and lower(u.email) = v_email
  ) then
    raise exception 'User is already a trip member';
  end if;

  update public.trip_invites ti
  set token_hash = v_hash,
      role = v_role,
      status = 'pending',
      invited_by = (select auth.uid()),
      accepted_by = null,
      expires_at = v_expires,
      updated_at = now()
  where ti.trip_id = p_trip_id
    and ti.email_normalized = v_email
    and ti.status = 'pending'
  returning ti.id into v_existing;

  if v_existing is null then
    insert into public.trip_invites (trip_id, email_normalized, role, token_hash, invited_by, expires_at)
    values (p_trip_id, v_email, v_role, v_hash, (select auth.uid()), v_expires)
    returning id into v_existing;
  end if;

  invite_id := v_existing;
  token := v_token;
  email_normalized := v_email;
  role := v_role;
  expires_at := v_expires;
  return next;
end;
$function$;

-- 3. Co-member display names: profiles RLS is own-row-only (and profiles holds the private
--    app_settings blob, so it must NOT be broadened). This security-definer RPC returns only the
--    display name (with an email-prefix fallback, never the full email) for active members of trips
--    the caller can access, so shared-trip UIs can show who's who.
create or replace function public.trip_member_display_names(p_trip_ids uuid[])
 returns table(user_id uuid, display_name text)
 language sql
 security definer
 set search_path to 'public', 'extensions'
as $function$
  select distinct tm.user_id,
         coalesce(nullif(btrim(p.display_name), ''), split_part(u.email, '@', 1), 'Trip member') as display_name
  from public.trip_members tm
  left join public.profiles p on p.id = tm.user_id
  left join auth.users u on u.id = tm.user_id
  where tm.status = 'active'
    and tm.trip_id = any(p_trip_ids)
    and private.can_access_trip(tm.trip_id);
$function$;
revoke all on function public.trip_member_display_names(uuid[]) from public;
grant execute on function public.trip_member_display_names(uuid[]) to authenticated;

-- 4. Shared-trip Notion outbox: the trip owner/admin (who holds the Notion token in their
--    credential-broker session) drains receipt_sync_jobs client-side. The base policies only
--    allowed the job's own creator to see/update it; allow the trip owner/admin to read + claim +
--    settle jobs for trips they administer so the mirror actually runs.
drop policy if exists receipt_sync_jobs_select_trip_admin on public.receipt_sync_jobs;
create policy receipt_sync_jobs_select_trip_admin
  on public.receipt_sync_jobs for select to authenticated
  using (private.can_admin_trip(trip_id));

drop policy if exists receipt_sync_jobs_update_trip_admin on public.receipt_sync_jobs;
create policy receipt_sync_jobs_update_trip_admin
  on public.receipt_sync_jobs for update to authenticated
  using (private.can_admin_trip(trip_id))
  with check (private.can_admin_trip(trip_id));
