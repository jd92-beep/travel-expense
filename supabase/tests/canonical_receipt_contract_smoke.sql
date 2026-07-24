begin;

insert into auth.users (
  id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '98200000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'receipt-contract-owner@example.invalid', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.profiles (id, display_name)
values ('98200000-0000-4000-8000-000000000001', 'Receipt Contract Owner')
on conflict (id) do update set display_name = excluded.display_name;

insert into public.trips (
  id, owner_id, name, destination_summary, start_date, end_date, home_currency,
  trip_currency, timezones, budget_currency, active, legacy_source_id, itinerary,
  app_metadata, version, archived
) values (
  '98300000-0000-4000-8000-000000000001',
  '98200000-0000-4000-8000-000000000001',
  'Receipt Contract Trip', 'Tokyo', '2026-07-01', '2026-07-03', 'HKD', 'JPY',
  array['Asia/Tokyo']::text[], 'HKD', true, 'receipt_contract_trip', '[]'::jsonb,
  '{}'::jsonb, 1, false
);

insert into public.trip_backend_links (
  trip_id, notion_database_ref, notion_owner_user_id, credential_ref, sync_mode,
  status, created_by
) values (
  '98300000-0000-4000-8000-000000000001', 'receipt-contract-db',
  '98200000-0000-4000-8000-000000000001', 'receipt-contract-credential',
  'dual_write', 'active', '98200000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '98200000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  v_receipt public.receipts%rowtype;
  v_revision bigint;
  v_blocked boolean;
  v_job public.receipt_sync_jobs%rowtype;
begin
  select * into v_receipt
  from public.upsert_shared_trip_receipt(
    '98300000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'version', 1,
      'store', 'Settle up',
      'record_date', '2026-07-01',
      'category', 'settlement',
      'record_kind', 'settlement',
      'payment_method', 'cash',
      'amount', 500,
      'currency', 'JPY',
      'split_mode', 'shared',
      'split_type', 'exact',
      'splits', jsonb_build_array(jsonb_build_object('personId', 'p_a', 'amount', 500)),
      'payers', jsonb_build_array(jsonb_build_object('personId', 'p_b', 'amount', 500)),
      'person_id', 'p_b',
      'beneficiary_id', 'p_a',
      'source_id', 'settlement-contract-source'
    ),
    '98400000-0000-4000-8000-000000000001',
    'settlement-contract-source',
    'receipt-contract-create'
  );

  if v_receipt.record_kind <> 'settlement'
     or v_receipt.category is not null
     or v_receipt.split_mode <> 'shared'
     or v_receipt.split_type <> 'exact'
     or jsonb_array_length(v_receipt.splits) <> 1
     or jsonb_array_length(v_receipt.payers) <> 1
     or v_receipt.version <> 1
     or v_receipt.sync_revision < 1 then
    raise exception 'settlement or split contract did not round-trip';
  end if;
  v_revision := v_receipt.sync_revision;

  select * into v_job from public.receipt_sync_jobs
  where receipt_id = v_receipt.id and provider = 'notion';
  if v_job.operation <> 'upsert' or v_job.status <> 'pending' then
    raise exception 'trip-visible receipt did not queue Notion upsert';
  end if;

  select * into v_job
  from public.claim_receipt_sync_jobs(
    array['98300000-0000-4000-8000-000000000001']::uuid[],
    'notion',
    '98200000-0000-4000-8000-000000000001',
    1
  );
  if v_job.status <> 'processing'
     or v_job.locked_by <> '98200000-0000-4000-8000-000000000001' then
    raise exception 'Notion outbox claim was not atomically assigned to authenticated worker';
  end if;

  select * into v_job
  from public.finish_receipt_sync_job(v_job.id, 'succeeded', null);
  if v_job.status <> 'succeeded'
     or not exists (
       select 1 from public.receipts
       where id = v_receipt.id and notion_sync_status = 'synced'
     ) then
    raise exception 'Notion outbox completion did not update job and receipt state';
  end if;

  v_blocked := false;
  begin
    perform public.upsert_shared_trip_receipt(
      '98300000-0000-4000-8000-000000000001',
      jsonb_build_object('store', 'Missing version', 'source_id', 'settlement-contract-source'),
      v_receipt.id, 'settlement-contract-source', 'missing-version'
    );
  exception when sqlstate '22023' then v_blocked := true;
  end;
  if not v_blocked then raise exception 'existing receipt accepted missing expected version'; end if;

  select * into v_receipt
  from public.upsert_shared_trip_receipt(
    '98300000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'version', 1,
      'store', 'Private settle up',
      'record_date', '2026-07-01',
      'record_kind', 'settlement',
      'payment_method', 'cash',
      'amount', 500,
      'currency', 'JPY',
      'visibility', 'private',
      'split_mode', 'private',
      'split_type', 'exact',
      'splits', jsonb_build_array(jsonb_build_object('personId', 'p_b', 'amount', 500)),
      'payers', jsonb_build_array(jsonb_build_object('personId', 'p_b', 'amount', 500)),
      'person_id', 'p_b',
      'beneficiary_id', 'p_b',
      'source_id', 'settlement-contract-source'
    ),
    v_receipt.id, 'settlement-contract-source', 'make-private'
  );

  if v_receipt.version <> 2 or v_receipt.sync_revision <= v_revision
     or v_receipt.visibility <> 'private' or v_receipt.notion_sync_status <> 'disabled' then
    raise exception 'private transition did not advance version/revision or disable Notion';
  end if;
  v_revision := v_receipt.sync_revision;

  select * into v_job from public.receipt_sync_jobs
  where receipt_id = v_receipt.id and provider = 'notion';
  if v_job.status <> 'cancelled' then
    raise exception 'private transition did not cancel pending Notion upsert';
  end if;

  v_blocked := false;
  begin
    perform public.enqueue_notion_receipt_sync(v_receipt.id, 'upsert', '{}'::jsonb);
  exception when sqlstate '23514' then v_blocked := true;
  end;
  if not v_blocked then raise exception 'private receipt entered Notion upsert queue'; end if;

  v_blocked := false;
  begin
    perform public.upsert_shared_trip_receipt(
      '98300000-0000-4000-8000-000000000001',
      jsonb_build_object('version', 1, 'store', 'Stale', 'source_id', 'settlement-contract-source'),
      v_receipt.id, 'settlement-contract-source', 'stale-update'
    );
  exception when sqlstate '40001' then v_blocked := true;
  end;
  if not v_blocked then raise exception 'stale expected version was accepted'; end if;

  select * into v_receipt
  from public.delete_receipt_v2(
    '98300000-0000-4000-8000-000000000001', v_receipt.id, 2, 'delete-contract'
  );
  if v_receipt.version <> 3 or v_receipt.deleted_at is null
     or v_receipt.sync_revision <= v_revision then
    raise exception 'delete did not create a higher-version tombstone';
  end if;
  v_revision := v_receipt.sync_revision;

  v_blocked := false;
  begin
    perform public.upsert_shared_trip_receipt(
      '98300000-0000-4000-8000-000000000001',
      jsonb_build_object('version', 3, 'store', 'Resurrection', 'source_id', 'settlement-contract-source'),
      v_receipt.id, 'settlement-contract-source', 'resurrection-attempt'
    );
  exception when sqlstate '40001' then v_blocked := true;
  end;
  if not v_blocked then raise exception 'tombstone was resurrected by ordinary upsert'; end if;

  if not exists (select 1 from public.receipts where id = v_receipt.id and deleted_at is not null) then
    raise exception 'tombstone was not visible to change-feed readers';
  end if;

  select * into v_receipt
  from public.restore_receipt_v2(
    '98300000-0000-4000-8000-000000000001', v_receipt.id, 3, 'restore-contract'
  );
  if v_receipt.version <> 4 or v_receipt.deleted_at is not null
     or v_receipt.sync_revision <= v_revision then
    raise exception 'restore did not create a higher active version';
  end if;

  v_blocked := false;
  begin
    update public.receipts set store = 'Direct mutation' where id = v_receipt.id;
  exception when sqlstate '42501' then v_blocked := true;
  end;
  if not v_blocked then raise exception 'authenticated direct receipt update was allowed'; end if;

  v_blocked := false;
  begin
    update public.receipt_sync_jobs set status = 'succeeded' where receipt_id = v_receipt.id;
  exception when sqlstate '42501' then v_blocked := true;
  end;
  if not v_blocked then raise exception 'authenticated direct sync-job update was allowed'; end if;

  if has_function_privilege('authenticated', 'public.delete_shared_trip_receipt(uuid,uuid,text,text)', 'EXECUTE') then
    raise exception 'legacy unversioned receipt delete remains executable';
  end if;
  if not has_function_privilege('authenticated', 'public.finish_receipt_sync_job(uuid,text,text)', 'EXECUTE') then
    raise exception 'authenticated client cannot finish claimed Notion sync job';
  end if;
end;
$$;

reset role;

insert into public.receipts (
  id, trip_id, owner_id, store, record_date, category, payment_method,
  amount, currency, home_currency, source_id, status, visibility, split_mode,
  record_kind, version, notion_sync_status
) values
  (
    '98400000-0000-4000-8000-000000000002',
    '98300000-0000-4000-8000-000000000001',
    '98200000-0000-4000-8000-000000000001',
    'Browser stale processing', '2026-07-01', 'food', 'cash',
    10, 'JPY', 'HKD', 'browser-stale-processing', 'confirmed', 'trip', 'shared',
    'expense', 1, 'pending'
  ),
  (
    '98400000-0000-4000-8000-000000000003',
    '98300000-0000-4000-8000-000000000001',
    '98200000-0000-4000-8000-000000000001',
    'Browser fresh processing', '2026-07-01', 'food', 'cash',
    10, 'JPY', 'HKD', 'browser-fresh-processing', 'confirmed', 'trip', 'shared',
    'expense', 1, 'pending'
  ),
  (
    '98400000-0000-4000-8000-000000000004',
    '98300000-0000-4000-8000-000000000001',
    '98200000-0000-4000-8000-000000000001',
    'Browser exhausted processing', '2026-07-01', 'food', 'cash',
    10, 'JPY', 'HKD', 'browser-exhausted-processing', 'confirmed', 'trip', 'shared',
    'expense', 1, 'pending'
  ),
  (
    '98400000-0000-4000-8000-000000000005',
    '98300000-0000-4000-8000-000000000001',
    '98200000-0000-4000-8000-000000000001',
    'Browser future pending', '2026-07-01', 'food', 'cash',
    10, 'JPY', 'HKD', 'browser-future-pending', 'confirmed', 'trip', 'shared',
    'expense', 1, 'pending'
  );

insert into public.receipt_sync_jobs (
  id, receipt_id, trip_id, owner_id, provider, operation, status, attempts,
  next_attempt_at, locked_at, locked_by, payload
) values
  (
    '98500000-0000-4000-8000-000000000002',
    '98400000-0000-4000-8000-000000000002',
    '98300000-0000-4000-8000-000000000001',
    '98200000-0000-4000-8000-000000000001',
    'notion', 'upsert', 'processing', 2,
    clock_timestamp() - interval '1 second', clock_timestamp() - interval '121 seconds',
    'browser-expired-worker', '{"sourceId":"browser-stale-processing"}'::jsonb
  ),
  (
    '98500000-0000-4000-8000-000000000003',
    '98400000-0000-4000-8000-000000000003',
    '98300000-0000-4000-8000-000000000001',
    '98200000-0000-4000-8000-000000000001',
    'notion', 'upsert', 'processing', 2,
    clock_timestamp() - interval '1 second', clock_timestamp() - interval '60 seconds',
    'browser-fresh-worker', '{"sourceId":"browser-fresh-processing"}'::jsonb
  ),
  (
    '98500000-0000-4000-8000-000000000004',
    '98400000-0000-4000-8000-000000000004',
    '98300000-0000-4000-8000-000000000001',
    '98200000-0000-4000-8000-000000000001',
    'notion', 'upsert', 'processing', 5,
    clock_timestamp() - interval '1 second', clock_timestamp() - interval '121 seconds',
    'browser-exhausted-worker', '{"sourceId":"browser-exhausted-processing"}'::jsonb
  ),
  (
    '98500000-0000-4000-8000-000000000005',
    '98400000-0000-4000-8000-000000000005',
    '98300000-0000-4000-8000-000000000001',
    '98200000-0000-4000-8000-000000000001',
    'notion', 'upsert', 'pending', 0,
    clock_timestamp() + interval '1 minute', null, null,
    '{"sourceId":"browser-future-pending"}'::jsonb
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '98200000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  v_claimed uuid[];
begin
  select coalesce(array_agg(job.id order by job.id), array[]::uuid[])
  into v_claimed
  from public.claim_receipt_sync_jobs(
    array['98300000-0000-4000-8000-000000000001']::uuid[],
    'notion',
    '98200000-0000-4000-8000-000000000001',
    10
  ) job;

  if v_claimed <> array['98500000-0000-4000-8000-000000000002'::uuid] then
    raise exception 'browser stale-processing claim is wrong: %', v_claimed;
  end if;
  if not exists (
    select 1 from public.receipt_sync_jobs
    where id = '98500000-0000-4000-8000-000000000002'
      and status = 'processing'
      and locked_by = '98200000-0000-4000-8000-000000000001'
  ) then
    raise exception 'browser expired processing job was not reclaimed';
  end if;
  if exists (
    select 1 from public.receipt_sync_jobs
    where id = '98500000-0000-4000-8000-000000000003'
      and (status <> 'processing' or locked_by <> 'browser-fresh-worker')
  ) then
    raise exception 'browser fresh processing lease was reclaimed';
  end if;
  if exists (
    select 1 from public.receipt_sync_jobs
    where id = '98500000-0000-4000-8000-000000000004'
      and (status <> 'processing' or attempts <> 5 or locked_by <> 'browser-exhausted-worker')
  ) then
    raise exception 'browser exhausted processing job was reclaimed';
  end if;
  if exists (
    select 1 from public.receipt_sync_jobs
    where id = '98500000-0000-4000-8000-000000000005'
      and status <> 'pending'
  ) then
    raise exception 'browser future retry job was reclaimed';
  end if;
end;
$$;

reset role;
select 'canonical_receipt_contract_smoke_passed' as result;
rollback;
