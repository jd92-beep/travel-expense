begin;

insert into auth.users (
  id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('98500000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'membership-owner@example.invalid', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()),
  ('98500000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'membership-member@example.invalid', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, display_name) values
  ('98500000-0000-4000-8000-000000000001', 'Membership Owner'),
  ('98500000-0000-4000-8000-000000000002', 'Membership Member')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.trips (
  id, owner_id, name, destination_summary, start_date, end_date, home_currency,
  trip_currency, timezones, budget_currency, active, legacy_source_id, itinerary,
  app_metadata, version, archived
) values (
  '98600000-0000-4000-8000-000000000001',
  '98500000-0000-4000-8000-000000000001',
  'Membership Contract Trip', 'Taipei', '2026-08-01', '2026-08-02', 'HKD', 'TWD',
  array['Asia/Taipei']::text[], 'HKD', true, 'membership_contract_trip', '[]'::jsonb,
  '{}'::jsonb, 1, false
);

insert into public.trip_members (trip_id, user_id, role, status)
values (
  '98600000-0000-4000-8000-000000000001',
  '98500000-0000-4000-8000-000000000002',
  'admin',
  'removed'
);

insert into public.trip_invites (
  id, trip_id, email_normalized, role, token_hash, status, invited_by, expires_at
) values (
  '98700000-0000-4000-8000-000000000001',
  '98600000-0000-4000-8000-000000000001',
  'membership-member@example.invalid',
  'viewer',
  encode(extensions.digest('reactivate-viewer', 'sha256'), 'hex'),
  'pending',
  '98500000-0000-4000-8000-000000000001',
  now() + interval '1 day'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '98500000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '98500000-0000-4000-8000-000000000001',
  'role', 'authenticated',
  'email', 'membership-owner@example.invalid',
  'email_verified', true
)::text, true);

do $$
declare
  v_blocked boolean := false;
  v_invite record;
begin
  if has_table_privilege('authenticated', 'public.trip_members', 'INSERT')
     or has_table_privilege('authenticated', 'public.trip_members', 'UPDATE')
     or has_table_privilege('authenticated', 'public.trip_members', 'DELETE') then
    raise exception 'authenticated retains direct trip_members write privilege';
  end if;

  begin
    update public.trip_members
    set role = 'admin'
    where trip_id = '98600000-0000-4000-8000-000000000001'
      and user_id = '98500000-0000-4000-8000-000000000001';
  exception when sqlstate '42501' then v_blocked := true;
  end;
  if not v_blocked then raise exception 'authenticated changed owner membership directly'; end if;

  select * into v_invite
  from public.create_trip_invite(
    '98600000-0000-4000-8000-000000000001',
    'future-member@example.invalid',
    'editor',
    7
  );
  if v_invite.invite_id is null or v_invite.email_normalized <> 'future-member@example.invalid' then
    raise exception 'unknown-email invite was not created';
  end if;
end;
$$;

reset role;
set local role service_role;

do $$
declare
  v_blocked boolean := false;
begin
  begin
    update public.trip_members
    set role = 'admin'
    where trip_id = '98600000-0000-4000-8000-000000000001'
      and user_id = '98500000-0000-4000-8000-000000000001';
  exception when sqlstate '23514' then v_blocked := true;
  end;
  if not v_blocked then raise exception 'service role changed owner membership'; end if;

  v_blocked := false;
  begin
    insert into public.trip_members (trip_id, user_id, role, status)
    values (
      '98600000-0000-4000-8000-000000000001',
      '98500000-0000-4000-8000-000000000002',
      'owner',
      'active'
    )
    on conflict (trip_id, user_id)
    do update set role = excluded.role, status = excluded.status;
  exception when sqlstate '23514' then v_blocked := true;
  end;
  if not v_blocked then raise exception 'non-owner acquired owner role'; end if;

  v_blocked := false;
  begin
    delete from public.trip_members
    where trip_id = '98600000-0000-4000-8000-000000000001'
      and user_id = '98500000-0000-4000-8000-000000000001';
  exception when sqlstate '23514' then v_blocked := true;
  end;
  if not v_blocked then raise exception 'owner membership was deleted'; end if;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '98500000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '98500000-0000-4000-8000-000000000002',
  'role', 'authenticated',
  'email', 'membership-member@example.invalid',
  'email_verified', true
)::text, true);

do $$
declare
  v_result record;
  v_role text;
begin
  select * into v_result from public.accept_trip_invite('reactivate-viewer');
  select role into v_role
  from public.trip_members
  where trip_id = '98600000-0000-4000-8000-000000000001'
    and user_id = '98500000-0000-4000-8000-000000000002';

  if v_result.status <> 'accepted' or v_role <> 'viewer' then
    raise exception 'removed admin reactivation did not use the new viewer invite role';
  end if;
end;
$$;

reset role;
select 'trip_membership_contract_smoke_passed' as result;
rollback;
