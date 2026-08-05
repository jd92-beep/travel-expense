-- Verify the R1 integrity producer, durable scan states, and target-ID audit filter.
-- Synthetic data only; the transaction always rolls back.

begin;

insert into auth.users (
  id, aud, role, email, email_confirmed_at, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values
  (
    '98000000-0000-4000-8000-0000000000a1',
    'authenticated', 'authenticated', 'integrity-owner@example.invalid', now(),
    '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '98000000-0000-4000-8000-0000000000b1',
    'authenticated', 'authenticated', 'integrity-other@example.invalid', now(),
    '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.profiles (id, display_name) values
  ('98000000-0000-4000-8000-0000000000a1', 'Integrity Owner'),
  ('98000000-0000-4000-8000-0000000000b1', 'Integrity Other')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.trips (
  id, owner_id, name, start_date, end_date, home_currency, trip_currency,
  timezones, active, legacy_source_id, itinerary, app_metadata, version, archived
) values (
  '98100000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-0000000000a1',
  'Integrity Nagoya Fixture', '2026-04-20', '2026-04-25', 'HKD', 'JPY',
  array['Asia/Tokyo']::text[], false, 'integrity_nagoya_fixture',
  '[
    {"date":"2026-04-20","day":1,"region":"Nagoya","spots":[]},
    {"date":"2026-04-26","day":7,"region":"Outside","spots":[{"id":"outside","name":"Outside"}]}
  ]'::jsonb,
  '{}'::jsonb, 1, false
);

insert into public.receipts (
  id, trip_id, owner_id, store, record_date, category, payment_method,
  amount, currency, home_currency, source_id, status, visibility, split_mode
) values
  (
    '98200000-0000-4000-8000-000000000001',
    '98100000-0000-4000-8000-000000000001',
    '98000000-0000-4000-8000-0000000000a1',
    'Outside Date', '2026-04-19', 'food', 'cash', 100, 'JPY', 'HKD',
    'integrity-outside-date', 'confirmed', 'trip', 'shared'
  ),
  (
    '98200000-0000-4000-8000-000000000002',
    '98100000-0000-4000-8000-000000000001',
    '98000000-0000-4000-8000-0000000000a1',
    'Broken Tombstone', '2026-04-20', 'food', 'cash', 50, 'JPY', 'HKD',
    'integrity-tombstone', 'deleted', 'trip', 'shared'
  );

insert into public.receipt_items (
  id, receipt_id, owner_id, name, amount, currency
) values (
  '98300000-0000-4000-8000-000000000001',
  '98200000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-0000000000b1',
  'Mismatched owner', 100, 'JPY'
);

insert into public.receipt_photos (
  id, receipt_id, owner_id, storage_bucket, storage_path, mime_type
) values (
  '98400000-0000-4000-8000-000000000001',
  '98200000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-0000000000b1',
  'receipt-photos', 'integrity/owner-mismatch.jpg', 'image/jpeg'
);

insert into public.receipt_sync_jobs (
  id, receipt_id, trip_id, owner_id, provider, operation, status, attempts,
  next_attempt_at, last_error, payload, created_at, updated_at
) values (
  '98500000-0000-4000-8000-000000000001',
  '98200000-0000-4000-8000-000000000001',
  '98100000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-0000000000a1',
  'notion', 'upsert', 'failed', 3,
  clock_timestamp() - interval '2 days', 'synthetic stuck job', '{}'::jsonb,
  clock_timestamp() - interval '3 days', clock_timestamp() - interval '2 days'
);

insert into public.trip_backend_links (
  trip_id, notion_database_ref, notion_owner_user_id, credential_ref,
  sync_mode, status, created_by, last_error
) values (
  '98100000-0000-4000-8000-000000000001',
  'integrity-database-ref', '98000000-0000-4000-8000-0000000000a1',
  'integrity-credential-ref', 'dual_write', 'error',
  '98000000-0000-4000-8000-0000000000a1', 'synthetic binding error'
);

set local role service_role;

select public.admin_auth_create_session(
  repeat('a', 64), repeat('b', 64), 'boss', 'passphrase+passkey', repeat('c', 64)
);

select public.admin_operation_preview_integrity_create(
  '98600000-0000-4000-8000-000000000001',
  '98700000-0000-4000-8000-000000000001',
  repeat('a', 64), 'boss', repeat('d', 64), null, repeat('e', 64),
  '{"title":"Run data integrity scan","checkVersion":"admin-integrity-v1"}'::jsonb,
  repeat('f', 64),
  '98800000-0000-4000-8000-000000000001'
);

select public.admin_operation_commit_integrity_scan(
  '98600000-0000-4000-8000-000000000001',
  repeat('a', 64), 'boss',
  '98800000-0000-4000-8000-000000000002'
);

reset role;

do $$
declare
  v_run_id uuid;
  v_summary jsonb;
begin
  if (
    select status from private.admin_operations
    where id = '98600000-0000-4000-8000-000000000001'
  ) <> 'completed' then
    raise exception 'integrity operation did not complete: %', (
      select row_to_json(operation) from private.admin_operations operation
      where id = '98600000-0000-4000-8000-000000000001'
    );
  end if;

  select id, summary into v_run_id, v_summary
  from public.data_quality_runs
  order by started_at desc, id desc
  limit 1;
  if v_summary ->> 'checkVersion' <> 'admin-integrity-v1'
    or coalesce((v_summary ->> 'recordsChecked')::integer, 0) < 8
    or coalesce((v_summary ->> 'findings')::integer, 0) < 8 then
    raise exception 'integrity summary is incomplete: %', v_summary;
  end if;

  if not exists (
    select 1 from public.data_quality_findings
    where run_id = v_run_id and finding_type = 'missing_itinerary_day'
  ) or not exists (
    select 1 from public.data_quality_findings
    where run_id = v_run_id and finding_type = 'out_of_range_itinerary_day'
  ) or not exists (
    select 1 from public.data_quality_findings
    where run_id = v_run_id and finding_type = 'receipt_date_outside_trip'
  ) or not exists (
    select 1 from public.data_quality_findings
    where run_id = v_run_id and finding_type = 'tombstone_version_regression'
  ) or not exists (
    select 1 from public.data_quality_findings
    where run_id = v_run_id and finding_type = 'receipt_item_owner_mismatch'
  ) or not exists (
    select 1 from public.data_quality_findings
    where run_id = v_run_id and finding_type = 'receipt_photo_owner_mismatch'
  ) or not exists (
    select 1 from public.data_quality_findings
    where run_id = v_run_id and finding_type = 'invalid_backend_binding'
  ) or not exists (
    select 1 from public.data_quality_findings
    where run_id = v_run_id and finding_type = 'stuck_sync_job'
  ) then
    raise exception 'required integrity finding is missing';
  end if;

  if (
    select count(*) from private.admin_audit_events_v2
    where operation_id = '98600000-0000-4000-8000-000000000001'
  ) <> 2 then
    raise exception 'integrity operation audit trail is incomplete';
  end if;
end
$$;

grant admin_auth_owner to postgres;
set local role admin_auth_owner;
select private.append_admin_audit_v2(
  repeat('1', 64), repeat('a', 64), 'R0', 'target_filter_fixture', 'trip',
  encode(extensions.digest('98100000-0000-4000-8000-000000000001', 'sha256'), 'hex'),
  null, null, null, '{"ok":true}'::jsonb, null,
  '98800000-0000-4000-8000-000000000003', null, null
);
reset role;
revoke admin_auth_owner from postgres;

set local role service_role;
do $$
declare
  v_matching jsonb;
  v_other jsonb;
begin
  v_matching := public.admin_read_audit(
    50, null, null, 'target_filter_fixture', 'trip',
    '98100000-0000-4000-8000-000000000001', null, null, null, null, null
  );
  v_other := public.admin_read_audit(
    50, null, null, 'target_filter_fixture', 'trip',
    '98100000-0000-4000-8000-000000000099', null, null, null, null, null
  );
  if jsonb_array_length(v_matching -> 'items') <> 1
    or jsonb_array_length(v_other -> 'items') <> 0 then
    raise exception 'audit target filter is not exact: matching %, other %', v_matching, v_other;
  end if;
end
$$;
reset role;

rollback;

select 'admin_integrity_scan_smoke_passed' as result;
