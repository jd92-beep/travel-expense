begin;

insert into auth.users (
  id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '98000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'itinerary-owner@example.invalid',
  now(),
  '{"provider":"email"}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.profiles (id, display_name)
values ('98000000-0000-4000-8000-000000000001', 'Itinerary Owner')
on conflict (id) do nothing;

insert into public.trips (
  id, owner_id, name, destination_summary, start_date, end_date, home_currency, trip_currency,
  timezones, budget_currency, active, legacy_source_id, itinerary, app_metadata, version,
  itinerary_version, archived
) values (
  '98100000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000001',
  'Nagoya 2026',
  'Nagoya',
  '2026-04-20',
  '2026-04-25',
  'HKD',
  'JPY',
  array['Asia/Tokyo']::text[],
  'HKD',
  true,
  'itinerary_contract_trip',
  '[
    {"date":"2026-04-20","day":1,"region":"Day 1","spots":[{"id":"spot-1","name":"Nagoya Station","time":"09:00"}]},
    {"date":"2026-04-21","day":2,"region":"Day 2","spots":[{"id":"spot-2","name":"Shirakawa-go","time":"10:00"}]},
    {"date":"2026-04-22","day":3,"region":"Day 3","spots":[]},
    {"date":"2026-04-23","day":4,"region":"Day 4","spots":[]},
    {"date":"2026-04-24","day":5,"region":"Day 5","spots":[]},
    {"date":"2026-04-25","day":6,"region":"Day 6","spots":[{"id":"spot-6","name":"Centrair","time":"15:00"}]}
  ]'::jsonb,
  '{}'::jsonb,
  1,
  1,
  false
);

update private.client_contract_config
set strict_itinerary_writes = true,
    updated_at = now()
where singleton = true;

set local role authenticated;
select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  v_result jsonb;
  v_blocked boolean;
  v_payload jsonb := '[
    {"date":"2026-04-20","day":1,"region":"Day 1","spots":[{"id":"spot-1","name":"Nagoya Station","time":"09:00"}]},
    {"date":"2026-04-21","day":2,"region":"Updated Day 2","spots":[{"id":"spot-2","name":"Shirakawa-go","time":"10:00"}]},
    {"date":"2026-04-22","day":3,"region":"Day 3","spots":[]},
    {"date":"2026-04-23","day":4,"region":"Day 4","spots":[]},
    {"date":"2026-04-24","day":5,"region":"Day 5","spots":[]},
    {"date":"2026-04-25","day":6,"region":"Day 6","spots":[{"id":"spot-6","name":"Centrair","time":"15:00"}]}
  ]'::jsonb;
begin
  v_result := public.update_trip_itinerary(
    '98100000-0000-4000-8000-000000000001',
    1,
    '2026-04-20',
    '2026-04-25',
    v_payload,
    'compact'
  );
  if (v_result ->> 'itinerary_version')::bigint <> 2
    or jsonb_array_length(v_result -> 'itinerary') <> 6
    or v_result -> 'itinerary' -> 1 ->> 'region' <> 'Updated Day 2' then
    raise exception 'valid six-day update did not persist as version 2';
  end if;

  v_blocked := false;
  begin
    perform public.update_trip_itinerary(
      '98100000-0000-4000-8000-000000000001', 2,
      '2026-04-20', '2026-04-25',
      '[{"date":"2026-04-20","spots":[]}]'::jsonb,
      'compact'
    );
  exception when sqlstate '22023' then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'partial itinerary payload was accepted'; end if;

  v_blocked := false;
  begin
    perform public.update_trip_itinerary(
      '98100000-0000-4000-8000-000000000001', 2,
      '2026-04-20', '2026-04-25',
      '[
        {"date":"2026-04-20","spots":[]},
        {"date":"2026-04-21","spots":[]},
        {"date":"2026-04-22","spots":[]},
        {"date":"2026-04-23","spots":[]},
        {"date":"2026-04-24","spots":[]},
        {"date":"2026-04-26","spots":[]}
      ]'::jsonb,
      'compact'
    );
  exception when sqlstate '22023' then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'out-of-range itinerary day was accepted'; end if;

  v_blocked := false;
  begin
    perform public.update_trip_itinerary(
      '98100000-0000-4000-8000-000000000001', 2,
      '2026-04-20', '2026-04-25',
      '[
        {"date":"2026-04-20","spots":[{"id":"same-spot","name":"A"}]},
        {"date":"2026-04-21","spots":[{"id":"same-spot","name":"B"}]},
        {"date":"2026-04-22","spots":[]},
        {"date":"2026-04-23","spots":[]},
        {"date":"2026-04-24","spots":[]},
        {"date":"2026-04-25","spots":[]}
      ]'::jsonb,
      'compact'
    );
  exception when sqlstate '22023' then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'duplicate itinerary spot id was accepted'; end if;

  v_blocked := false;
  begin
    perform public.update_trip_itinerary(
      '98100000-0000-4000-8000-000000000001', 1,
      '2026-04-20', '2026-04-25', v_payload, 'android'
    );
  exception when sqlstate '40001' then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'stale Android itinerary version was accepted'; end if;

  v_blocked := false;
  begin
    perform public.update_trip_itinerary(
      '98100000-0000-4000-8000-000000000001', 2,
      '2026-04-20', '2026-04-24',
      '[
        {"date":"2026-04-20","spots":[]},
        {"date":"2026-04-21","spots":[]},
        {"date":"2026-04-22","spots":[]},
        {"date":"2026-04-23","spots":[]},
        {"date":"2026-04-24","spots":[]}
      ]'::jsonb,
      'compact'
    );
  exception when sqlstate '22023' then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'date shrink removed a populated day'; end if;

  perform set_config('app.itinerary_expected_version', '', true);
  v_blocked := false;
  begin
    update public.trips
    set itinerary = jsonb_set(itinerary, '{1,region}', '"Direct overwrite"'::jsonb),
        version = version + 1
    where id = '98100000-0000-4000-8000-000000000001';
  exception when sqlstate '42501' then
    v_blocked := true;
  end;
  if not v_blocked then raise exception 'strict mode allowed a direct itinerary write'; end if;
end;
$$;

reset role;

do $$
declare
  v_result jsonb;
  v_versions jsonb;
begin
  set local role service_role;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  v_result := public.restore_trip_itinerary_version(
    '98100000-0000-4000-8000-000000000001', 1, 2
  );
  if (v_result ->> 'itinerary_version')::bigint <> 3
    or v_result -> 'itinerary' -> 1 ->> 'region' <> 'Day 2' then
    raise exception 'restore did not create a new version from the selected snapshot';
  end if;
  v_versions := public.admin_read_trip_itinerary_versions(
    '98100000-0000-4000-8000-000000000001', 50, null
  );
  if (v_versions ->> 'total')::integer <> 3
    or jsonb_array_length(v_versions -> 'items') <> 3 then
    raise exception 'itinerary history does not contain baseline, update, and restore';
  end if;
  reset role;
end;
$$;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from private.trip_itinerary_versions
  where trip_id = '98100000-0000-4000-8000-000000000001';
  if v_count <> 3 then
    raise exception 'unexpected itinerary snapshot count: %', v_count;
  end if;

  if pg_catalog.has_table_privilege('anon', 'private.trip_itinerary_versions', 'select')
    or pg_catalog.has_table_privilege('authenticated', 'private.trip_itinerary_versions', 'select')
    or pg_catalog.has_table_privilege('service_role', 'private.trip_itinerary_versions', 'select') then
    raise exception 'private itinerary snapshots are directly exposed';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.update_trip_itinerary(uuid,bigint,date,date,jsonb,text)', 'execute')
    or not pg_catalog.has_function_privilege('authenticated', 'public.update_trip_itinerary(uuid,bigint,date,date,jsonb,text)', 'execute') then
    raise exception 'itinerary update RPC privilege contract is invalid';
  end if;
end;
$$;

rollback;

select 'itinerary_contract_smoke_passed' as result;
