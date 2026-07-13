-- Travel Expense live RLS isolation smoke.
--
-- Run from Supabase SQL editor / service role context. The script inserts
-- temporary auth users and app rows, simulates authenticated JWT subjects with
-- `request.jwt.claim.sub`, asserts negative access cases, then rolls back.
--
-- Expected final result:
--   rls_isolation_smoke_passed

begin;

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('90000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'rls-a-2@example.invalid', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()),
  ('90000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', 'rls-b-2@example.invalid', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()),
  ('90000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'rls-c-2@example.invalid', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, display_name)
values
  ('90000000-0000-4000-8000-0000000000a1', 'RLS A'),
  ('90000000-0000-4000-8000-0000000000b2', 'RLS B'),
  ('90000000-0000-4000-8000-0000000000c3', 'RLS C')
on conflict (id) do nothing;

insert into public.trips (
  id, owner_id, name, destination_summary, start_date, end_date, home_currency, trip_currency,
  timezones, budget_amount, budget_currency, active, legacy_source_id, itinerary, app_metadata,
  version, archived, notion_page_id, notion_database_id
) values (
  '91000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-0000000000a1',
  'RLS Trip A', 'Private itinerary', '2026-05-01', '2026-05-02', 'HKD', 'JPY',
  array['Asia/Tokyo']::text[], 100, 'HKD', true, 'rls_trip_a_2', '[]'::jsonb, '{}'::jsonb,
  1, false, 'trip-page-should-be-scrubbed', 'notion-db-should-be-scrubbed'
);

insert into public.trip_members (trip_id, user_id, role, status)
values ('91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-0000000000b2', 'editor', 'active');

insert into public.receipts (
  id, trip_id, owner_id, store, record_date, category, payment_method, amount, currency,
  home_currency, source_id, status, visibility, split_mode, notion_page_id, notion_database_id
) values (
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-0000000000a1',
  'A private receipt', '2026-05-01', 'food', 'cash', 123, 'JPY',
  'HKD', 'private-source', 'confirmed', 'private', 'private', 'page-should-be-scrubbed', 'receipt-db-should-be-scrubbed'
), (
  '92000000-0000-4000-8000-000000000002',
  '91000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-0000000000a1',
  'A trip-visible receipt', '2026-05-02', 'transport', 'card', 456, 'JPY',
  'HKD', 'shared-source', 'confirmed', 'trip', 'shared', null, null
);

insert into public.receipt_items (id, receipt_id, owner_id, name, amount, currency)
values
  ('93000000-0000-4000-8000-0000000000a1', '92000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-0000000000a1', 'A private item', 123, 'JPY'),
  ('93000000-0000-4000-8000-0000000000b2', '92000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-0000000000a1', 'A shared item', 456, 'JPY');

insert into public.receipt_photos (id, receipt_id, owner_id, storage_path)
values
  ('94000000-0000-4000-8000-0000000000a1', '92000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-0000000000a1', 'private/a/path.jpg'),
  ('94000000-0000-4000-8000-0000000000b2', '92000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-0000000000a1', 'shared/a/path.jpg');

insert into public.receipt_sync_jobs (id, receipt_id, trip_id, owner_id, provider, operation, payload, last_error)
values ('95000000-0000-4000-8000-0000000000a1', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-0000000000a1', 'notion', 'delete', '{"private":"payload"}'::jsonb, 'private sync error');

set local role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-0000000000b2', true);

do $$
declare
  n int;
  changed int;
  blocked boolean;
begin
  select count(*) into n from public.trips
  where id = '91000000-0000-4000-8000-000000000001'
    and (notion_page_id is not null or notion_database_id is not null);
  if n <> 0 then
    raise exception 'trip Notion identifiers leaked to shared member';
  end if;

  select count(*) into n from public.receipts
  where id = '92000000-0000-4000-8000-000000000001';
  if n <> 0 then
    raise exception 'shared editor read another owner private receipt';
  end if;

  select count(*) into n from public.receipts
  where id = '92000000-0000-4000-8000-000000000002'
    and notion_page_id is null
    and notion_database_id is null;
  if n <> 1 then
    raise exception 'shared editor could not read trip-visible receipt';
  end if;

  select count(*) into n from public.receipt_items
  where id = '93000000-0000-4000-8000-0000000000b2';
  if n <> 1 then
    raise exception 'shared editor could not read trip-visible receipt item';
  end if;

  select count(*) into n from public.receipt_photos
  where id = '94000000-0000-4000-8000-0000000000b2';
  if n <> 1 then
    raise exception 'shared editor could not read trip-visible receipt photo';
  end if;

  if has_table_privilege('authenticated', 'public.receipts', 'UPDATE') then
    raise exception 'authenticated retained direct receipt UPDATE privilege';
  end if;

  blocked := false;
  begin
    update public.receipts
    set store = 'B overwrite attempt'
    where id = '92000000-0000-4000-8000-000000000001';
    get diagnostics changed = row_count;
    blocked := changed = 0;
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception 'shared editor updated another owner receipt';
  end if;

  select count(*) into n from public.receipt_items
  where id = '93000000-0000-4000-8000-0000000000a1';
  if n <> 0 then
    raise exception 'shared editor read another owner receipt item';
  end if;

  select count(*) into n from public.receipt_photos
  where id = '94000000-0000-4000-8000-0000000000a1';
  if n <> 0 then
    raise exception 'shared editor read another owner receipt photo';
  end if;

  select count(*) into n from public.receipt_sync_jobs
  where id = '95000000-0000-4000-8000-0000000000a1';
  if n <> 0 then
    raise exception 'shared editor read another owner sync job';
  end if;

  blocked := false;
  begin
    update public.trips
    set owner_id = '90000000-0000-4000-8000-0000000000b2'
    where id = '91000000-0000-4000-8000-000000000001';
  exception when others then
    blocked := true;
  end;
  if not blocked then
    raise exception 'shared editor changed trip owner_id';
  end if;

  blocked := false;
  begin
    insert into public.receipt_items (id, receipt_id, owner_id, name, amount, currency)
    values ('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-0000000000b2', 'bad attach', 1, 'JPY');
  exception when others then
    blocked := true;
  end;
  if not blocked then
    raise exception 'shared editor attached item to another owner receipt';
  end if;

  blocked := false;
  begin
    insert into public.receipt_photos (id, receipt_id, owner_id, storage_path)
    values ('94000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-0000000000b2', 'bad/path.jpg');
  exception when others then
    blocked := true;
  end;
  if not blocked then
    raise exception 'shared editor attached photo to another owner receipt';
  end if;

  blocked := false;
  begin
    insert into public.receipt_sync_jobs (id, receipt_id, trip_id, owner_id, provider, operation)
    values ('95000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-0000000000b2', 'notion', 'upsert');
  exception when others then
    blocked := true;
  end;
  if not blocked then
    raise exception 'shared editor queued sync job for another owner receipt';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-0000000000c3', true);

do $$
declare
  n int;
begin
  select count(*) into n from public.trips where id = '91000000-0000-4000-8000-000000000001';
  if n <> 0 then
    raise exception 'non-member read another user trip';
  end if;
  select count(*) into n from public.receipts where id = '92000000-0000-4000-8000-000000000001';
  if n <> 0 then
    raise exception 'non-member read another user receipt';
  end if;
end $$;

rollback;

select 'rls_isolation_smoke_passed' as result;
