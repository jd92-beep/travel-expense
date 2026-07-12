-- Verify every Admin 1.0 R2 database mutation with synthetic data only.
-- The transaction always rolls back.

begin;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.admin_operation_preview_r2_create(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,jsonb,text,uuid)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.admin_operation_commit_r2(uuid,uuid,text,text,uuid)',
    'execute'
  ) then
    raise exception 'browser role can execute an R2 operation RPC';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.admin_operation_preview_r2_create(uuid,uuid,text,text,text,text,text,text,text,jsonb,text,jsonb,text,uuid)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'public.admin_operation_commit_r2(uuid,uuid,text,text,uuid)',
    'execute'
  ) then
    raise exception 'service role cannot execute an R2 operation RPC';
  end if;
end
$$;

insert into auth.users (
  id, aud, role, email, email_confirmed_at, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values
  (
    '98000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'r2-owner@example.invalid', now(),
    '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '98000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'r2-member@example.invalid', now(),
    '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.profiles (id, display_name) values
  ('98000000-0000-4000-8000-000000000001', 'R2 Owner'),
  ('98000000-0000-4000-8000-000000000002', 'R2 Member')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.trips (
  id, owner_id, name, destination_summary, start_date, end_date,
  home_currency, trip_currency, timezones, active, legacy_source_id,
  itinerary, app_metadata, version, archived
) values (
  '98100000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000001',
  'Nagoya', 'Nagoya, Japan', '2026-04-20', '2026-04-25',
  'HKD', 'JPY', array['Asia/Tokyo']::text[], false, 'r2-nagoya-fixture',
  '[
    {"date":"2026-04-20","title":"Day 1","spots":[{"id":"nagoya-castle","name":"Nagoya Castle","order":0}]},
    {"date":"2026-04-21","title":"Day 2","spots":[{"id":"osu","name":"Osu Shopping District","order":0}]},
    {"date":"2026-04-22","title":"Day 3","spots":[{"id":"ghibli-park","name":"Ghibli Park","order":0}]},
    {"date":"2026-04-23","title":"Day 4","spots":[{"id":"atsuta","name":"Atsuta Jingu","order":0}]},
    {"date":"2026-04-24","title":"Day 5","spots":[{"id":"toyota-museum","name":"Toyota Commemorative Museum","order":0}]},
    {"date":"2026-04-25","title":"Day 6","spots":[{"id":"sakae","name":"Sakae","order":0}]}
  ]'::jsonb,
  '{}'::jsonb, 1, false
);

insert into public.receipts (
  id, trip_id, owner_id, store, record_date, category, payment_method,
  amount, currency, home_currency, source_id, status, visibility, split_mode,
  person_id, beneficiary_id
) values
  (
    '98200000-0000-4000-8000-000000000001',
    '98100000-0000-4000-8000-000000000001',
    '98000000-0000-4000-8000-000000000001',
    'R2 Receipt', '2026-04-20', 'food', 'cash',
    100, 'JPY', 'HKD', 'r2-receipt-fixture', 'confirmed', 'trip', 'shared',
    'p_a', 'p_a'
  ),
  (
    '98200000-0000-4000-8000-000000000002',
    '98100000-0000-4000-8000-000000000001',
    '98000000-0000-4000-8000-000000000001',
    'Cross-person Receipt', '2026-04-20', 'food', 'cash',
    100, 'JPY', 'HKD', 'r2-cross-private-fixture', 'confirmed', 'trip', 'shared',
    'p_a', 'p_b'
  );

create temporary table r2_test_marker (value integer);
create temporary table r2_invite_result (payload jsonb not null);
grant select, insert on r2_invite_result to service_role;

create or replace function pg_temp.preview_r2(
  p_id uuid,
  p_idempotency_key uuid,
  p_action text,
  p_target_type text,
  p_target_ref text,
  p_target_hash text,
  p_target_version text,
  p_payload jsonb,
  p_preview_hash text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform public.admin_operation_preview_r2_create(
    p_id,
    p_idempotency_key,
    repeat('a', 64),
    'boss',
    p_action,
    p_target_type,
    p_target_ref,
    p_target_hash,
    p_target_version,
    p_payload,
    repeat('e', 64),
    jsonb_build_object('title', p_action, 'affectedCount', 1),
    p_preview_hash,
    p_id
  );
end;
$$;

create or replace function pg_temp.commit_r2(
  p_operation_id uuid,
  p_grant_id uuid,
  p_action text,
  p_target_hash text,
  p_preview_hash text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.admin_auth_create_step_up(
    p_grant_id,
    repeat('b', 64),
    p_action,
    p_target_hash,
    p_preview_hash
  );
  v_result := public.admin_operation_commit_r2(
    p_operation_id,
    p_grant_id,
    repeat('b', 64),
    'boss',
    p_operation_id
  );
  return v_result;
end;
$$;

set local role service_role;

-- Preview is tied to the pre-reauth session. The commit grant is tied to the
-- rotated post-reauth session, while actor, action, target, and preview remain bound.
select public.admin_auth_create_session(
  repeat('a', 64), repeat('1', 64), 'boss', 'passphrase+passkey', repeat('f', 64)
);
select public.admin_auth_create_session(
  repeat('b', 64), repeat('2', 64), 'boss', 'passphrase+passkey', repeat('f', 64)
);

-- Private visibility cannot hide a receipt that affects another beneficiary.
do $$
begin
  begin
    perform pg_temp.preview_r2(
      '98500000-0000-4000-8000-000000000017',
      '98600000-0000-4000-8000-000000000017',
      'receipt_amend', 'receipt',
      '98200000-0000-4000-8000-000000000002', repeat('1', 64),
      (select version::text from public.receipts where id = '98200000-0000-4000-8000-000000000002'),
      jsonb_build_object(
        'expectedVersion', (select version from public.receipts where id = '98200000-0000-4000-8000-000000000002'),
        'patch', '{"visibility":"private"}'::jsonb
      ),
      repeat('1', 64)
    );
    raise exception 'cross-person receipt was allowed to become private';
  exception when check_violation then null;
  end;
end
$$;

-- Receipt amend.
select pg_temp.preview_r2(
  '98500000-0000-4000-8000-000000000001',
  '98600000-0000-4000-8000-000000000001',
  'receipt_amend', 'receipt',
  '98200000-0000-4000-8000-000000000001', repeat('1', 64),
  (select version::text from public.receipts where id = '98200000-0000-4000-8000-000000000001'),
  jsonb_build_object(
    'expectedVersion', (select version from public.receipts where id = '98200000-0000-4000-8000-000000000001'),
    'patch', jsonb_build_object(
      'store', 'R2 Amended Receipt',
      'amount', 250,
      'currency', 'JPY',
      'visibility', 'private'
    )
  ),
  repeat('2', 64)
);
select pg_temp.commit_r2(
  '98500000-0000-4000-8000-000000000001',
  '98700000-0000-4000-8000-000000000001',
  'receipt_amend', repeat('1', 64), repeat('2', 64)
);

-- Durable Trash tombstone and restore.
select pg_temp.preview_r2(
  '98500000-0000-4000-8000-000000000002',
  '98600000-0000-4000-8000-000000000002',
  'receipt_trash', 'receipt',
  '98200000-0000-4000-8000-000000000001', repeat('1', 64),
  (select version::text from public.receipts where id = '98200000-0000-4000-8000-000000000001'),
  jsonb_build_object(
    'expectedVersion', (select version from public.receipts where id = '98200000-0000-4000-8000-000000000001')
  ),
  repeat('3', 64)
);
select pg_temp.commit_r2(
  '98500000-0000-4000-8000-000000000002',
  '98700000-0000-4000-8000-000000000002',
  'receipt_trash', repeat('1', 64), repeat('3', 64)
);

select pg_temp.preview_r2(
  '98500000-0000-4000-8000-000000000003',
  '98600000-0000-4000-8000-000000000003',
  'receipt_restore', 'receipt',
  '98200000-0000-4000-8000-000000000001', repeat('1', 64),
  (select version::text from public.receipts where id = '98200000-0000-4000-8000-000000000001'),
  jsonb_build_object(
    'expectedVersion', (select version from public.receipts where id = '98200000-0000-4000-8000-000000000001')
  ),
  repeat('4', 64)
);
select pg_temp.commit_r2(
  '98500000-0000-4000-8000-000000000003',
  '98700000-0000-4000-8000-000000000003',
  'receipt_restore', repeat('1', 64), repeat('4', 64)
);

-- Trip metadata amend.
select pg_temp.preview_r2(
  '98500000-0000-4000-8000-000000000004',
  '98600000-0000-4000-8000-000000000004',
  'trip_amend', 'trip',
  '98100000-0000-4000-8000-000000000001', repeat('5', 64),
  (select version::text from public.trips where id = '98100000-0000-4000-8000-000000000001'),
  jsonb_build_object(
    'expectedVersion', (select version from public.trips where id = '98100000-0000-4000-8000-000000000001'),
    'patch', '{"name":"Nagoya 2026","destinationSummary":"Nagoya and Aichi","budgetAmount":120000,"budgetCurrency":"JPY"}'::jsonb
  ),
  repeat('6', 64)
);
select pg_temp.commit_r2(
  '98500000-0000-4000-8000-000000000004',
  '98700000-0000-4000-8000-000000000004',
  'trip_amend', repeat('5', 64), repeat('6', 64)
);

-- Exact six-day Nagoya itinerary amend and historical restore.
select pg_temp.preview_r2(
  '98500000-0000-4000-8000-000000000005',
  '98600000-0000-4000-8000-000000000005',
  'itinerary_amend', 'trip',
  '98100000-0000-4000-8000-000000000001', repeat('5', 64),
  (select itinerary_version::text from public.trips where id = '98100000-0000-4000-8000-000000000001'),
  jsonb_build_object(
    'expectedVersion', (select itinerary_version from public.trips where id = '98100000-0000-4000-8000-000000000001'),
    'startDate', '2026-04-20',
    'endDate', '2026-04-25',
    'removedDates', '[]'::jsonb,
    'itinerary', '[
      {"date":"2026-04-20","title":"Arrival","spots":[]},
      {"date":"2026-04-21","title":"Central Nagoya","spots":[{"id":"nagoya-castle-v2","name":"Nagoya Castle","order":0}]},
      {"date":"2026-04-22","title":"Ghibli","spots":[{"id":"ghibli-v2","name":"Ghibli Park","order":0}]},
      {"date":"2026-04-23","title":"Atsuta","spots":[{"id":"atsuta-v2","name":"Atsuta Jingu","order":0}]},
      {"date":"2026-04-24","title":"Museums","spots":[{"id":"toyota-v2","name":"Toyota Commemorative Museum","order":0}]},
      {"date":"2026-04-25","title":"Departure","spots":[]}
    ]'::jsonb
  ),
  repeat('7', 64)
);
select pg_temp.commit_r2(
  '98500000-0000-4000-8000-000000000005',
  '98700000-0000-4000-8000-000000000005',
  'itinerary_amend', repeat('5', 64), repeat('7', 64)
);

-- A title-only date cannot disappear without an exact removal manifest.
do $$
begin
  begin
    perform pg_temp.preview_r2(
      '98500000-0000-4000-8000-000000000015',
      '98600000-0000-4000-8000-000000000015',
      'itinerary_amend', 'trip',
      '98100000-0000-4000-8000-000000000001', repeat('5', 64),
      (select itinerary_version::text from public.trips where id = '98100000-0000-4000-8000-000000000001'),
      jsonb_build_object(
        'expectedVersion', (select itinerary_version from public.trips where id = '98100000-0000-4000-8000-000000000001'),
        'startDate', '2026-04-20',
        'endDate', '2026-04-24',
        'itinerary', '[
          {"date":"2026-04-20","title":"Arrival","spots":[]},
          {"date":"2026-04-21","title":"Central Nagoya","spots":[{"id":"nagoya-castle-v2","name":"Nagoya Castle","order":0}]},
          {"date":"2026-04-22","title":"Ghibli","spots":[{"id":"ghibli-v2","name":"Ghibli Park","order":0}]},
          {"date":"2026-04-23","title":"Atsuta","spots":[{"id":"atsuta-v2","name":"Atsuta Jingu","order":0}]},
          {"date":"2026-04-24","title":"Museums","spots":[{"id":"toyota-v2","name":"Toyota Commemorative Museum","order":0}]}
        ]'::jsonb
      ),
      repeat('3', 64)
    );
    raise exception 'title-only itinerary date disappeared without explicit removal';
  exception when invalid_parameter_value then null;
  end;
end
$$;

select pg_temp.preview_r2(
  '98500000-0000-4000-8000-000000000016',
  '98600000-0000-4000-8000-000000000016',
  'itinerary_amend', 'trip',
  '98100000-0000-4000-8000-000000000001', repeat('5', 64),
  (select itinerary_version::text from public.trips where id = '98100000-0000-4000-8000-000000000001'),
  jsonb_build_object(
    'expectedVersion', (select itinerary_version from public.trips where id = '98100000-0000-4000-8000-000000000001'),
    'startDate', '2026-04-20',
    'endDate', '2026-04-24',
    'removedDates', '["2026-04-25"]'::jsonb,
    'itinerary', '[
      {"date":"2026-04-20","title":"Arrival","spots":[]},
      {"date":"2026-04-21","title":"Central Nagoya","spots":[{"id":"nagoya-castle-v2","name":"Nagoya Castle","order":0}]},
      {"date":"2026-04-22","title":"Ghibli","spots":[{"id":"ghibli-v2","name":"Ghibli Park","order":0}]},
      {"date":"2026-04-23","title":"Atsuta","spots":[{"id":"atsuta-v2","name":"Atsuta Jingu","order":0}]},
      {"date":"2026-04-24","title":"Museums","spots":[{"id":"toyota-v2","name":"Toyota Commemorative Museum","order":0}]}
    ]'::jsonb
  ),
  repeat('4', 64)
);
select pg_temp.commit_r2(
  '98500000-0000-4000-8000-000000000016',
  '98700000-0000-4000-8000-000000000016',
  'itinerary_amend', repeat('5', 64), repeat('4', 64)
);

select pg_temp.preview_r2(
  '98500000-0000-4000-8000-000000000006',
  '98600000-0000-4000-8000-000000000006',
  'itinerary_restore', 'trip',
  '98100000-0000-4000-8000-000000000001', repeat('5', 64),
  (select itinerary_version::text from public.trips where id = '98100000-0000-4000-8000-000000000001'),
  jsonb_build_object(
    'expectedVersion', (select itinerary_version from public.trips where id = '98100000-0000-4000-8000-000000000001'),
    'restoreVersion', 1
  ),
  repeat('8', 64)
);
select pg_temp.commit_r2(
  '98500000-0000-4000-8000-000000000006',
  '98700000-0000-4000-8000-000000000006',
  'itinerary_restore', repeat('5', 64), repeat('8', 64)
);

-- Add/reactivate, change, and remove a non-owner member.
select pg_temp.preview_r2(
  '98500000-0000-4000-8000-000000000007',
  '98600000-0000-4000-8000-000000000007',
  'member_add', 'trip',
  '98100000-0000-4000-8000-000000000001', repeat('5', 64),
  'absent:' || (select updated_at::text from public.trips where id = '98100000-0000-4000-8000-000000000001'),
  '{"userId":"98000000-0000-4000-8000-000000000002","role":"editor"}'::jsonb,
  repeat('9', 64)
);
select pg_temp.commit_r2(
  '98500000-0000-4000-8000-000000000007',
  '98700000-0000-4000-8000-000000000007',
  'member_add', repeat('5', 64), repeat('9', 64)
);

select pg_temp.preview_r2(
  '98500000-0000-4000-8000-000000000008',
  '98600000-0000-4000-8000-000000000008',
  'member_role', 'membership',
  (select id::text from public.trip_members where trip_id = '98100000-0000-4000-8000-000000000001' and user_id = '98000000-0000-4000-8000-000000000002'),
  repeat('c', 64),
  (select updated_at::text from public.trip_members where trip_id = '98100000-0000-4000-8000-000000000001' and user_id = '98000000-0000-4000-8000-000000000002'),
  '{"role":"viewer"}'::jsonb,
  repeat('d', 64)
);
select pg_temp.commit_r2(
  '98500000-0000-4000-8000-000000000008',
  '98700000-0000-4000-8000-000000000008',
  'member_role', repeat('c', 64), repeat('d', 64)
);

select pg_temp.preview_r2(
  '98500000-0000-4000-8000-000000000009',
  '98600000-0000-4000-8000-000000000009',
  'member_remove', 'membership',
  (select id::text from public.trip_members where trip_id = '98100000-0000-4000-8000-000000000001' and user_id = '98000000-0000-4000-8000-000000000002'),
  repeat('c', 64),
  (select updated_at::text from public.trip_members where trip_id = '98100000-0000-4000-8000-000000000001' and user_id = '98000000-0000-4000-8000-000000000002'),
  '{}'::jsonb,
  repeat('f', 64)
);
select pg_temp.commit_r2(
  '98500000-0000-4000-8000-000000000009',
  '98700000-0000-4000-8000-000000000009',
  'member_remove', repeat('c', 64), repeat('f', 64)
);

-- An email without an account creates a pending invite and returns its raw
-- token only in this commit response, never in operation/audit persistence.
select pg_temp.preview_r2(
  '98500000-0000-4000-8000-000000000013',
  '98600000-0000-4000-8000-000000000013',
  'member_add', 'trip',
  '98100000-0000-4000-8000-000000000001', repeat('5', 64),
  'invite-absent:' || (select updated_at::text from public.trips where id = '98100000-0000-4000-8000-000000000001'),
  '{"email":"future-member@example.invalid","role":"admin","userId":null}'::jsonb,
  repeat('b', 64)
);
insert into r2_invite_result (payload)
select pg_temp.commit_r2(
  '98500000-0000-4000-8000-000000000013',
  '98700000-0000-4000-8000-000000000013',
  'member_add', repeat('5', 64), repeat('b', 64)
);

-- Owner membership remains protected even if a caller bypasses Edge preview validation.
select pg_temp.preview_r2(
  '98500000-0000-4000-8000-000000000010',
  '98600000-0000-4000-8000-000000000010',
  'member_remove', 'membership',
  (select id::text from public.trip_members where trip_id = '98100000-0000-4000-8000-000000000001' and role = 'owner'),
  repeat('0', 64),
  (select updated_at::text from public.trip_members where trip_id = '98100000-0000-4000-8000-000000000001' and role = 'owner'),
  '{}'::jsonb,
  repeat('1', 64)
);
do $$
begin
  begin
    perform pg_temp.commit_r2(
      '98500000-0000-4000-8000-000000000010',
      '98700000-0000-4000-8000-000000000010',
      'member_remove', repeat('0', 64), repeat('1', 64)
    );
    raise exception 'owner membership removal unexpectedly committed';
  exception when check_violation then null;
  end;
end
$$;

-- A stale version fails after step-up and makes no receipt change.
select pg_temp.preview_r2(
  '98500000-0000-4000-8000-000000000011',
  '98600000-0000-4000-8000-000000000011',
  'receipt_amend', 'receipt',
  '98200000-0000-4000-8000-000000000001', repeat('1', 64),
  (select version::text from public.receipts where id = '98200000-0000-4000-8000-000000000001'),
  jsonb_build_object(
    'expectedVersion', (select version from public.receipts where id = '98200000-0000-4000-8000-000000000001'),
    'patch', '{"store":"Must Not Commit"}'::jsonb
  ),
  repeat('a', 64)
);
reset role;
update public.receipts
set version = version + 1, updated_at = clock_timestamp()
where id = '98200000-0000-4000-8000-000000000001';
set local role service_role;
do $$
begin
  begin
    perform pg_temp.commit_r2(
      '98500000-0000-4000-8000-000000000011',
      '98700000-0000-4000-8000-000000000011',
      'receipt_amend', repeat('1', 64), repeat('a', 64)
    );
    raise exception 'stale R2 preview unexpectedly committed';
  exception when serialization_failure then null;
  end;
end
$$;

-- A consumed grant cannot authorize a second operation, while duplicate commit
-- of the original completed operation remains idempotent.
select public.admin_operation_commit_r2(
  '98500000-0000-4000-8000-000000000008',
  '98700000-0000-4000-8000-000000000008',
  repeat('b', 64), 'boss',
  '98800000-0000-4000-8000-000000000001'
);
select pg_temp.preview_r2(
  '98500000-0000-4000-8000-000000000012',
  '98600000-0000-4000-8000-000000000012',
  'member_role', 'membership',
  (select id::text from public.trip_members where trip_id = '98100000-0000-4000-8000-000000000001' and user_id = '98000000-0000-4000-8000-000000000002'),
  repeat('c', 64),
  (select updated_at::text from public.trip_members where trip_id = '98100000-0000-4000-8000-000000000001' and user_id = '98000000-0000-4000-8000-000000000002'),
  '{"role":"editor"}'::jsonb,
  repeat('d', 64)
);
do $$
begin
  begin
    perform public.admin_operation_commit_r2(
      '98500000-0000-4000-8000-000000000012',
      '98700000-0000-4000-8000-000000000008',
      repeat('b', 64), 'boss',
      '98800000-0000-4000-8000-000000000002'
    );
    raise exception 'consumed step-up grant unexpectedly committed twice';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;

do $$
declare
  v_trip public.trips%rowtype;
  v_receipt public.receipts%rowtype;
  v_invite_result jsonb;
  v_invite_token text;
  v_invite_hash text;
begin
  select * into v_receipt from public.receipts
  where id = '98200000-0000-4000-8000-000000000001';
  if v_receipt.store <> 'R2 Amended Receipt'
    or v_receipt.amount <> 250
    or v_receipt.visibility <> 'private'
    or v_receipt.deleted_at is not null
    or v_receipt.status <> 'confirmed'
    or v_receipt.version <> 5 then
    raise exception 'receipt R2 mutation result is wrong: %', to_jsonb(v_receipt);
  end if;
  if v_receipt.notion_sync_status <> 'disabled' then
    raise exception 'private receipt was left eligible for Notion sync';
  end if;
  if exists (
    select 1 from public.receipt_sync_jobs
    where receipt_id = v_receipt.id and status in ('pending', 'processing', 'failed')
  ) then
    raise exception 'private receipt has an active Notion job';
  end if;

  select * into v_trip from public.trips
  where id = '98100000-0000-4000-8000-000000000001';
  if v_trip.name <> 'Nagoya 2026'
    or v_trip.destination_summary <> 'Nagoya and Aichi'
    or v_trip.start_date <> '2026-04-20'::date
    or v_trip.end_date <> '2026-04-25'::date
    or jsonb_array_length(v_trip.itinerary) <> 6
    or v_trip.itinerary_version <> 3 then
    raise exception 'trip or itinerary R2 result is wrong: %', to_jsonb(v_trip);
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_trip.itinerary) entry(day)
    where (day ->> 'date')::date not between v_trip.start_date and v_trip.end_date
  ) or exists (
    select 1
    from jsonb_array_elements(v_trip.itinerary) entry(day)
    cross join lateral jsonb_array_elements(day -> 'spots') spot
    where (day ->> 'date')::date not between v_trip.start_date and v_trip.end_date
  ) then
    raise exception 'Nagoya contains an out-of-range day or scenery spot';
  end if;
  if (
    select count(distinct day ->> 'date')
    from jsonb_array_elements(v_trip.itinerary) entry(day)
  ) <> 6 then
    raise exception 'Nagoya does not contain exactly six unique itinerary days';
  end if;

  if (
    select role from public.trip_members
    where trip_id = v_trip.id and user_id = '98000000-0000-4000-8000-000000000001'
  ) <> 'owner' then
    raise exception 'owner membership was changed';
  end if;
  if (
    select status from public.trip_members
    where trip_id = v_trip.id and user_id = '98000000-0000-4000-8000-000000000002'
  ) <> 'removed' then
    raise exception 'member removal did not become authoritative';
  end if;
  select payload into v_invite_result from r2_invite_result limit 1;
  v_invite_token := v_invite_result ->> 'inviteToken';
  select token_hash into v_invite_hash
  from public.trip_invites
  where trip_id = v_trip.id and email_normalized = 'future-member@example.invalid';
  if v_invite_token !~ '^[0-9a-f]{64}$'
    or encode(extensions.digest(v_invite_token, 'sha256'), 'hex') <> v_invite_hash
    or v_invite_result -> 'operation' ->> 'status' <> 'completed' then
    raise exception 'ephemeral invitation response is invalid';
  end if;
  if not exists (
    select 1 from public.trip_invites
    where trip_id = v_trip.id
      and email_normalized = 'future-member@example.invalid'
      and role = 'admin' and status = 'pending'
  ) then
    raise exception 'unregistered email did not create a pending invitation';
  end if;
  if exists (
    select 1 from private.admin_operations
    where id = '98500000-0000-4000-8000-000000000013'
      and (coalesce(result::text, '') like '%' || v_invite_token || '%'
        or coalesce(preview::text, '') like '%' || v_invite_token || '%')
  ) or exists (
    select 1 from private.admin_audit_events_v2
    where coalesce(result::text, '') like '%' || v_invite_token || '%'
      or coalesce(after_state::text, '') like '%' || v_invite_token || '%'
  ) then
    raise exception 'raw invitation token was persisted in operation or audit data';
  end if;
  if (select count(*) from private.admin_operations where status = 'completed' and risk = 'R2') <> 10 then
    raise exception 'R2 completed operation count is wrong';
  end if;
  if exists (
    select operation_id
    from private.admin_audit_events_v2
    where operation_id in (
      select id from private.admin_operations where status = 'completed' and risk = 'R2'
    )
    group by operation_id
    having count(*) <> 2
  ) then
    raise exception 'R2 audit preview/commit evidence is incomplete';
  end if;
  if (select count(*) from private.admin_step_up_grants where consumed_at is not null) <> 10 then
    raise exception 'R2 step-up consumption count is wrong';
  end if;
end
$$;

rollback;

select 'admin_r2_operation_kernel_smoke_passed' as result;
