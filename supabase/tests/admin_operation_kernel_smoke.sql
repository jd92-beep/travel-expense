-- Verify the private Admin 1.0 operation state machine and audit chain.
-- Synthetic data only; the transaction always rolls back.

begin;

do $$
begin
  if (select public from storage.buckets where id = 'receipt-photos') then
    raise exception 'receipt photo bucket is still public';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'receipt_photos_public_read'
  ) then
    raise exception 'public receipt photo policy still exists';
  end if;
  if has_table_privilege('anon', 'private.admin_operations', 'select')
    or has_table_privilege('authenticated', 'private.admin_operations', 'select')
    or has_table_privilege('service_role', 'private.admin_operations', 'select') then
    raise exception 'admin operations table is exposed';
  end if;
  if has_function_privilege(
    'anon',
    'public.admin_operation_get(uuid)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.admin_operation_get(uuid)',
    'execute'
  ) then
    raise exception 'browser role can execute admin operation RPC';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.admin_operation_get(uuid)',
    'execute'
  ) then
    raise exception 'service_role cannot execute admin operation RPC';
  end if;
  if has_function_privilege(
    'anon',
    'public.admin_audit_record_security_event(text,text,text,text,text,text,uuid)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'public.admin_audit_record_security_event(text,text,text,text,text,text,uuid)',
    'execute'
  ) then
    raise exception 'security audit RPC privilege is wrong';
  end if;
  if has_function_privilege(
    'anon', 'public.admin_read_runtime_contract()', 'execute'
  ) or not has_function_privilege(
    'service_role', 'public.admin_read_runtime_contract()', 'execute'
  ) then
    raise exception 'runtime contract RPC privilege is wrong';
  end if;
  if has_table_privilege('service_role', 'private.admin_audit_chain_heads', 'select')
    or has_table_privilege('service_role', 'private.admin_security_event_buckets', 'select') then
    raise exception 'admin audit helper tables are exposed';
  end if;
  if pg_get_functiondef(
    'public.admin_auth_create_session(text,text,text,text,text)'::regprocedure
  ) not like '%pg_advisory_xact_lock(pg_catalog.hashtext(''private.admin_sessions''))%'
    or pg_get_functiondef(
      'public.admin_auth_rotate_session(text,text,text,text,text,text)'::regprocedure
    ) not like '%pg_advisory_xact_lock(pg_catalog.hashtext(''private.admin_sessions''))%'
    or pg_get_functiondef(
      'public.admin_auth_revoke_session(text,text)'::regprocedure
    ) not like '%pg_advisory_xact_lock(pg_catalog.hashtext(''private.admin_sessions''))%'
    or pg_get_functiondef(
      'public.admin_auth_revoke_all_sessions(text)'::regprocedure
    ) not like '%pg_advisory_xact_lock(pg_catalog.hashtext(''private.admin_sessions''))%' then
    raise exception 'admin session mutations do not share the transaction lock';
  end if;
  if pg_get_functiondef(
    'private.append_admin_audit_v2(text,text,text,text,text,text,text,jsonb,jsonb,jsonb,text,uuid,uuid,uuid)'::regprocedure
  ) like '%array_agg%'
    or pg_get_functiondef(
      'private.append_admin_audit_v2(text,text,text,text,text,text,text,jsonb,jsonb,jsonb,text,uuid,uuid,uuid)'::regprocedure
    ) not like '%admin_audit_chain_heads%' then
    raise exception 'admin audit chain head is not constant-time';
  end if;
end
$$;

insert into auth.users (
  id, aud, role, email, email_confirmed_at, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values (
  '97000000-0000-4000-8000-0000000000a1',
  'authenticated', 'authenticated', 'operation@example.invalid', now(),
  '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.profiles (id, display_name)
values ('97000000-0000-4000-8000-0000000000a1', 'Operation Fixture')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.trips (
  id, owner_id, name, start_date, end_date, home_currency, trip_currency,
  timezones, active, legacy_source_id, itinerary, app_metadata, version, archived
) values (
  '97100000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-0000000000a1',
  'Operation Fixture Trip', '2026-07-10', '2026-07-11', 'HKD', 'JPY',
  array['Asia/Tokyo']::text[], false, 'operation_fixture_trip',
  '[]'::jsonb, '{}'::jsonb, 1, false
);

insert into public.receipts (
  id, trip_id, owner_id, store, record_date, category, payment_method,
  amount, currency, home_currency, source_id, status, visibility, split_mode
) values
  (
    '97200000-0000-4000-8000-000000000001',
    '97100000-0000-4000-8000-000000000001',
    '97000000-0000-4000-8000-0000000000a1',
    'Operation Fixture Receipt', '2026-07-10', 'food', 'cash',
    100, 'JPY', 'HKD', 'operation-fixture-receipt', 'confirmed', 'trip', 'shared'
  ),
  (
    '97200000-0000-4000-8000-000000000002',
    '97100000-0000-4000-8000-000000000001',
    '97000000-0000-4000-8000-0000000000a1',
    'Processing Fixture Receipt', '2026-07-10', 'food', 'cash',
    200, 'JPY', 'HKD', 'processing-fixture-receipt', 'confirmed', 'trip', 'shared'
  );

insert into public.receipt_sync_jobs (
  id, receipt_id, trip_id, owner_id, provider, operation, status, attempts,
  next_attempt_at, last_error, payload, created_at, updated_at
) values
  (
    '97300000-0000-4000-8000-000000000001',
    '97200000-0000-4000-8000-000000000001',
    '97100000-0000-4000-8000-000000000001',
    '97000000-0000-4000-8000-0000000000a1',
    'notion', 'upsert', 'failed', 3, '2026-07-11 00:00:00+00',
    'synthetic failure', '{}'::jsonb,
    '2026-07-11 00:00:00+00', '2026-07-11 00:00:00+00'
  ),
  (
    '97300000-0000-4000-8000-000000000002',
    '97200000-0000-4000-8000-000000000002',
    '97100000-0000-4000-8000-000000000001',
    '97000000-0000-4000-8000-0000000000a1',
    'notion', 'upsert', 'processing', 2, '2026-07-11 00:00:00+00',
    null, '{}'::jsonb,
    '2026-07-11 00:00:00+00', '2026-07-11 00:00:00+00'
  );

set local role service_role;

select public.admin_auth_create_session(
  repeat('a', 64), repeat('b', 64), 'boss', 'passphrase+passkey', repeat('c', 64)
);

do $$
begin
  begin
    perform public.admin_operation_preview_create(
      '97500000-0000-4000-8000-000000000003',
      '97600000-0000-4000-8000-000000000003',
      repeat('a', 64), 'boss', 'cancel_sync_job', 'R1', 'sync_job',
      '97300000-0000-4000-8000-000000000002', repeat('4', 64),
      '2026-07-11 00:00:00+00',
      '{"jobId":"97300000-0000-4000-8000-000000000002"}'::jsonb,
      repeat('5', 64),
      '{"affectedCount":1,"currentStatus":"processing"}'::jsonb,
      repeat('6', 64),
      '97700000-0000-4000-8000-000000000007'
    );
    raise exception 'processing sync job accepted an immediate cancel preview';
  exception when check_violation then null;
  end;
end
$$;

do $$
declare
  v_sample uuid;
  v_aggregate uuid;
begin
  v_sample := public.admin_audit_record_security_event(
    'admin_request_denied', 'unauthenticated', 'unauthenticated', 'POST',
    '/api/actions', 'ADMIN_WRITES_DISABLED',
    '97700000-0000-4000-8000-000000000099'
  );
  v_aggregate := public.admin_audit_record_security_event(
    'admin_request_denied', 'unauthenticated', 'unauthenticated', 'POST',
    '/api/actions', 'ADMIN_WRITES_DISABLED',
    '97700000-0000-4000-8000-000000000098'
  );
  if v_sample is null or v_aggregate is not null
  then
    raise exception 'security-event sampling and aggregation failed';
  end if;
end
$$;
reset role;

do $$
begin
  if (select rejection_count from private.admin_security_event_buckets
      where action = 'admin_request_denied' and method = 'POST'
        and route = '/api/aggregated' and error_code = 'ADMIN_WRITES_DISABLED') <> 2
    or not exists (
      select 1 from private.admin_audit_events_v2
      where action = 'admin_request_denied'
        and result ->> 'route' = '/api/actions'
    ) then
    raise exception 'security-event aggregation lost its bucket or audit sample';
  end if;
end
$$;

set local role service_role;

select public.admin_operation_preview_create(
  '97500000-0000-4000-8000-000000000001',
  '97600000-0000-4000-8000-000000000001',
  repeat('a', 64), 'boss', 'retry_sync_job', 'R1', 'sync_job',
  '97300000-0000-4000-8000-000000000001', repeat('d', 64),
  '2026-07-11 00:00:00+00',
  '{"jobId":"97300000-0000-4000-8000-000000000001"}'::jsonb,
  repeat('e', 64),
  '{"affectedCount":1,"currentStatus":"failed"}'::jsonb,
  repeat('f', 64),
  '97700000-0000-4000-8000-000000000001'
);

-- Identical retries reuse the operation rather than inserting another row.
select public.admin_operation_preview_create(
  '97500000-0000-4000-8000-000000000099',
  '97600000-0000-4000-8000-000000000001',
  repeat('a', 64), 'boss', 'retry_sync_job', 'R1', 'sync_job',
  '97300000-0000-4000-8000-000000000001', repeat('d', 64),
  '2026-07-11 00:00:00+00',
  '{"jobId":"97300000-0000-4000-8000-000000000001"}'::jsonb,
  repeat('e', 64),
  '{"affectedCount":1,"currentStatus":"failed"}'::jsonb,
  repeat('f', 64),
  '97700000-0000-4000-8000-000000000002'
);

select public.admin_operation_commit_sync_job(
  '97500000-0000-4000-8000-000000000001',
  repeat('a', 64), 'boss',
  '97700000-0000-4000-8000-000000000003'
);

-- A duplicate commit is idempotent and returns the terminal operation.
select public.admin_operation_commit_sync_job(
  '97500000-0000-4000-8000-000000000001',
  repeat('a', 64), 'boss',
  '97700000-0000-4000-8000-000000000004'
);

select public.admin_operation_preview_create(
  '97500000-0000-4000-8000-000000000002',
  '97600000-0000-4000-8000-000000000002',
  repeat('a', 64), 'boss', 'cancel_sync_job', 'R1', 'sync_job',
  '97300000-0000-4000-8000-000000000001', repeat('1', 64),
  (select updated_at::text from public.receipt_sync_jobs where id = '97300000-0000-4000-8000-000000000001'),
  '{"jobId":"97300000-0000-4000-8000-000000000001"}'::jsonb,
  repeat('2', 64),
  '{"affectedCount":1,"currentStatus":"pending"}'::jsonb,
  repeat('3', 64),
  '97700000-0000-4000-8000-000000000005'
);

reset role;

-- Change the target version after preview without the transaction-stable timestamp trigger.
alter table public.receipt_sync_jobs
  disable trigger receipt_sync_jobs_set_updated_at;
update public.receipt_sync_jobs
set updated_at = updated_at + interval '1 second'
where id = '97300000-0000-4000-8000-000000000001';
alter table public.receipt_sync_jobs
  enable trigger receipt_sync_jobs_set_updated_at;

set local role service_role;
do $$
begin
  begin
    perform public.admin_operation_commit_sync_job(
      '97500000-0000-4000-8000-000000000002',
      repeat('a', 64), 'boss',
      '97700000-0000-4000-8000-000000000006'
    );
    raise exception 'stale operation preview unexpectedly committed';
  exception when serialization_failure then null;
  end;
end
$$;
reset role;

-- Defence in depth: even if a row changes to processing without changing its
-- version timestamp, the commit RPC must reject cancellation of claimed work.
update public.receipt_sync_jobs
set status = 'pending', locked_at = null, locked_by = null,
    updated_at = '2026-07-12 00:00:00+00'
where id = '97300000-0000-4000-8000-000000000002';

set local role service_role;
select public.admin_operation_preview_create(
  '97500000-0000-4000-8000-000000000004',
  '97600000-0000-4000-8000-000000000004',
  repeat('a', 64), 'boss', 'cancel_sync_job', 'R1', 'sync_job',
  '97300000-0000-4000-8000-000000000002', repeat('7', 64),
  '2026-07-12 00:00:00+00',
  '{"jobId":"97300000-0000-4000-8000-000000000002"}'::jsonb,
  repeat('8', 64),
  '{"affectedCount":1,"currentStatus":"pending"}'::jsonb,
  repeat('9', 64),
  '97700000-0000-4000-8000-000000000008'
);
reset role;

update public.receipt_sync_jobs
set status = 'processing', locked_at = clock_timestamp(),
    locked_by = 'receipt-sync:fixture-worker',
    updated_at = '2026-07-12 00:00:00+00'
where id = '97300000-0000-4000-8000-000000000002';

set local role service_role;
do $$
begin
  begin
    perform public.admin_operation_commit_sync_job(
      '97500000-0000-4000-8000-000000000004',
      repeat('a', 64), 'boss',
      '97700000-0000-4000-8000-000000000009'
    );
    raise exception 'processing sync job bypassed the commit guard';
  exception when check_violation then null;
  end;
end
$$;
reset role;

do $$
declare
  v_first_hash text;
  v_second_previous text;
begin
  if (select status from public.receipt_sync_jobs where id = '97300000-0000-4000-8000-000000000001') <> 'pending' then
    raise exception 'sync retry did not move the job to pending';
  end if;
  if (select attempts from public.receipt_sync_jobs where id = '97300000-0000-4000-8000-000000000001') <> 3 then
    raise exception 'manual retry erased the attempt history';
  end if;
  if (select status from private.admin_operations where id = '97500000-0000-4000-8000-000000000001') <> 'completed' then
    raise exception 'operation did not reach completed';
  end if;
  if (select count(*) from private.admin_operations where idempotency_key = '97600000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'idempotent preview created duplicate operations';
  end if;
  if (select count(*) from private.admin_audit_events_v2 where operation_id = '97500000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'operation audit event count is wrong';
  end if;

  select event_hash into v_first_hash
  from private.admin_audit_events_v2
  where operation_id = '97500000-0000-4000-8000-000000000001'
  order by sequence asc limit 1;
  select previous_event_hash into v_second_previous
  from private.admin_audit_events_v2
  where operation_id = '97500000-0000-4000-8000-000000000001'
  order by sequence desc limit 1;
  if v_first_hash <> v_second_previous then
    raise exception 'audit hash chain is broken';
  end if;

  begin
    update private.admin_audit_events_v2
    set action = 'tampered'
    where operation_id = '97500000-0000-4000-8000-000000000001';
    raise exception 'audit history update unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end
$$;

set local role service_role;
do $$
declare
  v_audit jsonb;
  v_event_id uuid;
  v_event jsonb;
begin
  if public.admin_read_runtime_contract() ->> 'schemaVersion' <> '20260712123000' then
    raise exception 'runtime contract schema version is stale';
  end if;
  v_audit := public.admin_read_audit(
    50, null, null, 'operation_completed', null, null, null, 'R1', 'succeeded', null, null
  );
  if jsonb_array_length(v_audit -> 'items') <> 1
    or (v_audit -> 'items' -> 0 ->> 'event_hash') !~ '^[0-9a-f]{64}$' then
    raise exception 'audit v2 read model did not return the operation chain: %', v_audit;
  end if;
  v_event_id := (v_audit -> 'items' -> 0 ->> 'id')::uuid;
  v_event := public.admin_read_audit_event(v_event_id);
  if v_event ->> 'authentication_method' <> 'passphrase+passkey'
    or v_event ->> 'schema_version' <> '20260712123000' then
    raise exception 'audit v2 detail lost authentication or provenance: %', v_event;
  end if;

  v_audit := public.admin_read_audit(
    50, null, null, 'admin_request_denied', 'admin_route', null, null, null, 'failed', null, null
  );
  if jsonb_array_length(v_audit -> 'items') <> 1
    or v_audit -> 'items' -> 0 ->> 'error_code' <> 'ADMIN_WRITES_DISABLED'
    or v_audit -> 'items' -> 0 ->> 'edge_version' <> 'admin-kanban-v1' then
    raise exception 'security event did not enter the audit v2 chain: %', v_audit;
  end if;

  begin
    perform 1 from private.admin_operations limit 1;
    raise exception 'service_role direct operation-table read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

rollback;

select 'admin_operation_kernel_smoke_passed' as result;
