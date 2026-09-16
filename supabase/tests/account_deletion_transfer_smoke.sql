-- Account deletion ownership-transfer smoke.
-- Runs inside a transaction and rolls back — never leaves fixture rows.
-- Verifies: shared-trip owner can delete; successor becomes owner; private
-- receipts are deleted (not transferred); trip-visible receipts transfer.

begin;

insert into auth.users (
  id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('9a500000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'delete-owner@example.invalid', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()),
  ('9a500000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'delete-successor@example.invalid', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, display_name) values
  ('9a500000-0000-4000-8000-000000000001', 'Delete Owner'),
  ('9a500000-0000-4000-8000-000000000002', 'Delete Successor')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.trips (
  id, owner_id, name, destination_summary, start_date, end_date, home_currency,
  trip_currency, timezones, budget_currency, active, legacy_source_id, itinerary,
  app_metadata, version, archived
) values (
  '9a600000-0000-4000-8000-000000000001',
  '9a500000-0000-4000-8000-000000000001',
  'Delete Transfer Trip', 'Osaka', '2026-09-01', '2026-09-03', 'HKD', 'JPY',
  array['Asia/Tokyo']::text[], 'HKD', true, 'delete_transfer_trip', '[]'::jsonb,
  '{}'::jsonb, 1, false
);

-- Owner membership is created by the trip insert trigger; only add the successor.
insert into public.trip_members (trip_id, user_id, role, status) values
  ('9a600000-0000-4000-8000-000000000001', '9a500000-0000-4000-8000-000000000002', 'admin', 'active');

insert into public.receipts (
  id, trip_id, owner_id, store, record_date, category, payment_method, amount, currency,
  home_currency, visibility, source_id, status, record_kind, split_mode,
  notion_sync_status, notion_sync_attempts, version, sync_revision, created_at, updated_at
) values
  (
    '9a700000-0000-4000-8000-000000000001',
    '9a600000-0000-4000-8000-000000000001',
    '9a500000-0000-4000-8000-000000000001',
    'Shared meal', '2026-09-01', 'food', 'cash', 100, 'JPY',
    'HKD', 'trip', 'receipt_delete_shared_1', 'confirmed', 'expense', 'shared',
    'disabled', 0, 1, 1, now(), now()
  ),
  (
    '9a700000-0000-4000-8000-000000000002',
    '9a600000-0000-4000-8000-000000000001',
    '9a500000-0000-4000-8000-000000000001',
    'Private snack', '2026-09-01', 'food', 'cash', 50, 'JPY',
    'HKD', 'private', 'receipt_delete_private_1', 'confirmed', 'expense', 'private',
    'disabled', 0, 1, 1, now(), now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '9a500000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', '9a500000-0000-4000-8000-000000000001',
  'role', 'authenticated',
  'email', 'delete-owner@example.invalid',
  'email_verified', true
)::text, true);

do $$
declare
  v_owner uuid := '9a500000-0000-4000-8000-000000000001';
  v_successor uuid := '9a500000-0000-4000-8000-000000000002';
  v_trip uuid := '9a600000-0000-4000-8000-000000000001';
  v_trip_owner uuid;
  v_successor_role text;
  v_old_role text;
  v_shared_owner uuid;
  v_private_count bigint;
  v_user_exists boolean;
begin
  perform public.delete_own_user_account();
end;
$$;

-- Drop back to the migration superuser so post-delete assertions are not RLS-filtered
-- by the deleted owner's session.
set local role postgres;
select set_config('request.jwt.claims', '', true);

do $$
declare
  v_owner uuid := '9a500000-0000-4000-8000-000000000001';
  v_successor uuid := '9a500000-0000-4000-8000-000000000002';
  v_trip uuid := '9a600000-0000-4000-8000-000000000001';
  v_trip_owner uuid;
  v_successor_role text;
  v_old_role text;
  v_shared_owner uuid;
  v_private_count bigint;
  v_user_exists boolean;
begin
  select owner_id into v_trip_owner from public.trips where id = v_trip;
  if v_trip_owner is distinct from v_successor then
    raise exception 'expected successor to own trip after delete, got %', v_trip_owner;
  end if;

  select role into v_successor_role
  from public.trip_members
  where trip_id = v_trip and user_id = v_successor;
  if v_successor_role is distinct from 'owner' then
    raise exception 'expected successor member role owner, got %', v_successor_role;
  end if;

  select role into v_old_role
  from public.trip_members
  where trip_id = v_trip and user_id = v_owner;
  if v_old_role is not null and v_old_role = 'owner' then
    raise exception 'deleted user still holds owner membership';
  end if;

  select owner_id into v_shared_owner
  from public.receipts where id = '9a700000-0000-4000-8000-000000000001';
  if v_shared_owner is distinct from v_successor then
    raise exception 'expected trip-visible receipt to transfer, owner=%', v_shared_owner;
  end if;

  select count(*) into v_private_count
  from public.receipts where id = '9a700000-0000-4000-8000-000000000002';
  if v_private_count <> 0 then
    raise exception 'expected private receipt to be deleted, found %', v_private_count;
  end if;

  select exists(select 1 from auth.users where id = v_owner) into v_user_exists;
  if v_user_exists then
    raise exception 'expected deleting auth user row to be removed';
  end if;
end;
$$;

rollback;
