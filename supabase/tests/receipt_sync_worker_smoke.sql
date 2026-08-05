-- Verify the service-owned Notion outbox claim and completion contract.
-- Synthetic data only; the transaction always rolls back.

begin;

do $$
begin
  if has_function_privilege(
    'anon', 'public.claim_receipt_sync_jobs_worker(text,integer)', 'execute'
  ) or has_function_privilege(
    'authenticated', 'public.claim_receipt_sync_jobs_worker(text,integer)', 'execute'
  ) or not has_function_privilege(
    'service_role', 'public.claim_receipt_sync_jobs_worker(text,integer)', 'execute'
  ) then
    raise exception 'receipt sync worker claim privilege is wrong';
  end if;
  if has_function_privilege(
    'anon', 'public.finish_receipt_sync_job_worker(uuid,text,text,text,text,text)', 'execute'
  ) or not has_function_privilege(
    'service_role', 'public.finish_receipt_sync_job_worker(uuid,text,text,text,text,text)', 'execute'
  ) then
    raise exception 'receipt sync worker finish privilege is wrong';
  end if;
end
$$;

insert into auth.users (
  id, aud, role, email, email_confirmed_at, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
) values (
  '99000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'sync-worker@example.invalid', now(),
  '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.profiles (id, display_name)
values ('99000000-0000-4000-8000-000000000001', 'Sync Worker Fixture')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.trips (
  id, owner_id, name, start_date, end_date, home_currency, trip_currency,
  timezones, active, legacy_source_id, itinerary, app_metadata, version, archived
) values (
  '99100000-0000-4000-8000-000000000001',
  '99000000-0000-4000-8000-000000000001',
  'Sync Worker Trip', '2026-04-20', '2026-04-25', 'HKD', 'JPY',
  array['Asia/Tokyo']::text[], false, 'nagoya-worker-trip', '[]'::jsonb,
  '{"localTripId":"nagoya-worker-trip"}'::jsonb, 1, false
);

insert into public.trip_backend_links (
  trip_id, notion_database_ref, notion_owner_user_id, credential_ref,
  sync_mode, status, created_by
) values (
  '99100000-0000-4000-8000-000000000001',
  '11111111111111111111111111111111',
  '99000000-0000-4000-8000-000000000001',
  'kv:user-credential:notion:99000000',
  'dual_write', 'active', '99000000-0000-4000-8000-000000000001'
);

insert into public.receipts (
  id, trip_id, owner_id, store, record_date, category, payment_method,
  amount, currency, home_currency, source_id, status, visibility, split_mode,
  record_kind, version, notion_sync_status
) values (
  '99200000-0000-4000-8000-000000000001',
  '99100000-0000-4000-8000-000000000001',
  '99000000-0000-4000-8000-000000000001',
  'Sync Worker Receipt', '2026-04-20', 'food', 'cash',
  1200, 'JPY', 'HKD', 'sync-worker-receipt', 'confirmed', 'trip', 'shared',
  'expense', 3, 'pending'
);

insert into public.receipt_sync_jobs (
  id, receipt_id, trip_id, owner_id, provider, operation, status, attempts,
  next_attempt_at, payload
) values (
  '99300000-0000-4000-8000-000000000001',
  '99200000-0000-4000-8000-000000000001',
  '99100000-0000-4000-8000-000000000001',
  '99000000-0000-4000-8000-000000000001',
  'notion', 'upsert', 'pending', 0, clock_timestamp(),
  '{"sourceId":"sync-worker-receipt","version":3}'::jsonb
);

set local role service_role;

do $$
declare
  v_claim jsonb;
  v_finish jsonb;
begin
  v_claim := public.claim_receipt_sync_jobs_worker(
    'receipt-sync:edge-test:12345678', 10
  );
  if jsonb_array_length(v_claim) <> 1
    or v_claim -> 0 ->> 'notionTripId' <> 'nagoya-worker-trip'
    or v_claim -> 0 ->> 'databaseRef' <> '11111111111111111111111111111111'
    or v_claim -> 0 -> 'receipt' ->> 'sourceId' <> 'sync-worker-receipt'
    or v_claim -> 0 -> 'receipt' ->> 'visibility' <> 'trip' then
    raise exception 'worker claim payload is invalid: %', v_claim;
  end if;

  v_finish := public.finish_receipt_sync_job_worker(
    '99300000-0000-4000-8000-000000000001',
    'receipt-sync:edge-test:12345678',
    'failed', null, 'NOTION_RATE_LIMITED', 'Notion is rate limited'
  );
  if v_finish ->> 'status' <> 'failed' or (v_finish ->> 'attempts')::integer <> 1 then
    raise exception 'worker failure was not persisted: %', v_finish;
  end if;
end
$$;

reset role;

grant receipt_sync_owner to postgres;
set local role receipt_sync_owner;
update public.receipt_sync_jobs
set next_attempt_at = clock_timestamp() - interval '1 second'
where id = '99300000-0000-4000-8000-000000000001';
reset role;
revoke receipt_sync_owner from postgres;

set local role service_role;

do $$
declare
  v_claim jsonb;
  v_finish jsonb;
begin
  v_claim := public.claim_receipt_sync_jobs_worker(
    'receipt-sync:edge-test:87654321', 10
  );
  if jsonb_array_length(v_claim) <> 1 then
    raise exception 'failed worker job was not retried: %', v_claim;
  end if;
  v_finish := public.finish_receipt_sync_job_worker(
    '99300000-0000-4000-8000-000000000001',
    'receipt-sync:edge-test:87654321',
    'succeeded', '22222222222222222222222222222222', null, null
  );
  if v_finish ->> 'status' <> 'succeeded' then
    raise exception 'worker success was not persisted: %', v_finish;
  end if;
end
$$;

reset role;

do $$
begin
  if (select status from public.receipt_sync_jobs where id = '99300000-0000-4000-8000-000000000001') <> 'succeeded'
    or (select notion_sync_status from public.receipts where id = '99200000-0000-4000-8000-000000000001') <> 'synced'
    or (select notion_page_id from public.receipts where id = '99200000-0000-4000-8000-000000000001') <> '22222222222222222222222222222222'
    or (select notion_sync_attempts from public.receipts where id = '99200000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'worker terminal state is inconsistent';
  end if;
end
$$;

insert into public.receipts (
  id, trip_id, owner_id, store, record_date, category, payment_method,
  amount, currency, home_currency, source_id, status, visibility, split_mode,
  record_kind, version, notion_sync_status
) values
  (
    '99200000-0000-4000-8000-000000000002',
    '99100000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000001',
    'Worker stale processing', '2026-04-20', 'food', 'cash',
    1200, 'JPY', 'HKD', 'worker-stale-processing', 'confirmed', 'trip', 'shared',
    'expense', 3, 'pending'
  ),
  (
    '99200000-0000-4000-8000-000000000003',
    '99100000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000001',
    'Worker fresh processing', '2026-04-20', 'food', 'cash',
    1200, 'JPY', 'HKD', 'worker-fresh-processing', 'confirmed', 'trip', 'shared',
    'expense', 3, 'pending'
  ),
  (
    '99200000-0000-4000-8000-000000000004',
    '99100000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000001',
    'Worker exhausted processing', '2026-04-20', 'food', 'cash',
    1200, 'JPY', 'HKD', 'worker-exhausted-processing', 'confirmed', 'trip', 'shared',
    'expense', 3, 'pending'
  ),
  (
    '99200000-0000-4000-8000-000000000005',
    '99100000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000001',
    'Worker future pending', '2026-04-20', 'food', 'cash',
    1200, 'JPY', 'HKD', 'worker-future-pending', 'confirmed', 'trip', 'shared',
    'expense', 3, 'pending'
  );

insert into public.receipt_sync_jobs (
  id, receipt_id, trip_id, owner_id, provider, operation, status, attempts,
  next_attempt_at, locked_at, locked_by, payload
) values
  (
    '99300000-0000-4000-8000-000000000002',
    '99200000-0000-4000-8000-000000000002',
    '99100000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000001',
    'notion', 'upsert', 'processing', 2,
    clock_timestamp() - interval '1 second', clock_timestamp() - interval '121 seconds',
    'worker-expired-lease', '{"sourceId":"worker-stale-processing"}'::jsonb
  ),
  (
    '99300000-0000-4000-8000-000000000003',
    '99200000-0000-4000-8000-000000000003',
    '99100000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000001',
    'notion', 'upsert', 'processing', 2,
    clock_timestamp() - interval '1 second', clock_timestamp() - interval '60 seconds',
    'worker-fresh-lease', '{"sourceId":"worker-fresh-processing"}'::jsonb
  ),
  (
    '99300000-0000-4000-8000-000000000004',
    '99200000-0000-4000-8000-000000000004',
    '99100000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000001',
    'notion', 'upsert', 'processing', 5,
    clock_timestamp() - interval '1 second', clock_timestamp() - interval '121 seconds',
    'worker-exhausted-lease', '{"sourceId":"worker-exhausted-processing"}'::jsonb
  ),
  (
    '99300000-0000-4000-8000-000000000005',
    '99200000-0000-4000-8000-000000000005',
    '99100000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000001',
    'notion', 'upsert', 'pending', 0,
    clock_timestamp() + interval '10 minutes', null, null,
    '{"sourceId":"worker-future-pending"}'::jsonb
  );

set local role service_role;

do $$
declare
  v_claim jsonb;
begin
  v_claim := public.claim_receipt_sync_jobs_worker(
    'receipt-sync:edge-stale:12345678', 10
  );

  if jsonb_array_length(v_claim) <> 1
    or v_claim -> 0 ->> 'id' <> '99300000-0000-4000-8000-000000000002'
    or v_claim -> 0 -> 'payload' ->> 'sourceId' <> 'worker-stale-processing'
    or v_claim -> 0 -> 'receipt' ->> 'sourceId' <> 'worker-stale-processing' then
    raise exception 'worker stale-processing claim payload is wrong: %', v_claim;
  end if;
  if not exists (
    select 1 from public.receipt_sync_jobs
    where id = '99300000-0000-4000-8000-000000000002'
      and status = 'processing'
      and attempts = 2
      and next_attempt_at <= clock_timestamp()
      and locked_at > clock_timestamp() - interval '120 seconds'
      and locked_by = 'receipt-sync:edge-stale:12345678'
  ) then
    raise exception 'worker reclaimed processing state is wrong or missing';
  end if;
  if not exists (
    select 1 from public.receipt_sync_jobs
    where id = '99300000-0000-4000-8000-000000000003'
      and status = 'processing'
      and attempts = 2
      and next_attempt_at <= clock_timestamp()
      and locked_at > clock_timestamp() - interval '120 seconds'
      and locked_by = 'worker-fresh-lease'
  ) then
    raise exception 'worker fresh processing lease state is wrong or missing';
  end if;
  if not exists (
    select 1 from public.receipt_sync_jobs
    where id = '99300000-0000-4000-8000-000000000004'
      and status = 'processing'
      and attempts = 5
      and next_attempt_at <= clock_timestamp()
      and locked_at < clock_timestamp() - interval '120 seconds'
      and locked_by = 'worker-exhausted-lease'
  ) then
    raise exception 'worker exhausted processing lease state is wrong or missing';
  end if;
  if not exists (
    select 1 from public.receipt_sync_jobs
    where id = '99300000-0000-4000-8000-000000000005'
      and status = 'pending'
      and attempts = 0
      and next_attempt_at > clock_timestamp()
      and locked_at is null
      and locked_by is null
  ) then
    raise exception 'worker future retry state is wrong or missing';
  end if;
end;
$$;

reset role;

rollback;

select 'receipt_sync_worker_smoke_passed' as result;
