-- Fixed admin read RPCs: privilege boundary, bounded DTOs, and pagination.

begin;

do $$
declare
  v_role pg_catalog.pg_roles%rowtype;
  v_function oid;
  v_view text;
begin
  select * into v_role
  from pg_catalog.pg_roles
  where rolname = 'admin_read_owner';

  if v_role.rolname is null
    or v_role.rolcanlogin
    or v_role.rolsuper
    or not v_role.rolinherit
    or v_role.rolcreatedb
    or v_role.rolcreaterole
    or v_role.rolreplication
    or v_role.rolbypassrls then
    raise exception 'admin_read_owner role attributes are unsafe';
  end if;

  if pg_catalog.has_schema_privilege('admin_read_owner', 'private', 'CREATE')
    or pg_catalog.has_schema_privilege('admin_read_owner', 'public', 'CREATE') then
    raise exception 'admin_read_owner retains schema CREATE';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_auth_members membership
    join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
    join pg_catalog.pg_roles member_role on member_role.oid = membership.member
    where granted_role.rolname = 'pg_read_all_data'
      and member_role.rolname = 'admin_read_owner'
  ) or exists (
    select 1
    from pg_catalog.pg_auth_members membership
    join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
    join pg_catalog.pg_roles member_role on member_role.oid = membership.member
    where member_role.rolname = 'admin_read_owner'
      and granted_role.rolname <> 'pg_read_all_data'
  ) then
    raise exception 'admin_read_owner membership allowlist is invalid';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_auth_members membership
    join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
    join pg_catalog.pg_roles member_role on member_role.oid = membership.member
    where granted_role.rolname in ('admin_read_owner', 'admin_auth_owner')
      and member_role.rolname = 'postgres'
      and (membership.inherit_option or membership.set_option)
  ) then
    raise exception 'postgres retains an admin owner role';
  end if;

  for v_function in
    select p.oid
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
    where n.nspname = 'public'
      and p.proname like 'admin_read_%'
      and owner_role.rolname = 'admin_read_owner'
  loop
    if pg_catalog.has_function_privilege('anon', v_function, 'execute')
      or pg_catalog.has_function_privilege('authenticated', v_function, 'execute')
      or not pg_catalog.has_function_privilege('service_role', v_function, 'execute') then
      raise exception 'admin read RPC execute allowlist is invalid';
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
    where n.nspname = 'public'
      and p.proname like 'admin_read_%'
      and owner_role.rolname <> 'admin_read_owner'
  ) then
    raise exception 'an admin read RPC has the wrong owner';
  end if;

  foreach v_view in array array[
    'admin_account_read',
    'admin_trip_read',
    'admin_receipt_read'
  ]
  loop
    if pg_catalog.has_table_privilege('anon', format('private.%I', v_view), 'select')
      or pg_catalog.has_table_privilege('authenticated', format('private.%I', v_view), 'select') then
      raise exception 'browser role can read private.%', v_view;
    end if;
  end loop;

  if pg_catalog.has_function_privilege(
      'anon', 'private.admin_auth_user_rows()', 'execute'
    )
    or pg_catalog.has_function_privilege(
      'authenticated', 'private.admin_auth_user_rows()', 'execute'
    )
    or pg_catalog.has_function_privilege(
      'service_role', 'private.admin_auth_user_rows()', 'execute'
    )
    or not pg_catalog.has_function_privilege(
      'admin_read_owner', 'private.admin_auth_user_rows()', 'execute'
    ) then
    raise exception 'bounded auth-user helper execute allowlist is invalid';
  end if;
end
$$;

insert into auth.users (
  id, aud, role, email, email_confirmed_at, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
values
  (
    '98000000-0000-4000-8000-0000000000a1',
    'authenticated', 'authenticated', 'read-owner@example.invalid', now(),
    '{"provider":"email"}'::jsonb, '{}'::jsonb,
    '2026-07-10 08:00:00+00', '2026-07-10 10:00:00+00'
  ),
  (
    '98000000-0000-4000-8000-0000000000a2',
    'authenticated', 'authenticated', 'read-member@example.invalid', now(),
    '{"provider":"email"}'::jsonb, '{}'::jsonb,
    '2026-07-10 07:00:00+00', '2026-07-10 09:00:00+00'
  );

insert into public.profiles (id, display_name, updated_at)
values
  ('98000000-0000-4000-8000-0000000000a1', 'Read Owner', '2026-07-10 10:00:00+00'),
  ('98000000-0000-4000-8000-0000000000a2', 'Read Member', '2026-07-10 09:00:00+00')
on conflict (id) do update
set display_name = excluded.display_name,
    updated_at = excluded.updated_at;

insert into public.trips (
  id, owner_id, name, destination_summary, start_date, end_date,
  home_currency, trip_currency, timezones, active, legacy_source_id,
  itinerary, app_metadata, version, archived, created_at, updated_at
)
values
  (
    '98100000-0000-4000-8000-000000000001',
    '98000000-0000-4000-8000-0000000000a1',
    'Nagoya 2026', 'Nagoya', '2026-04-20', '2026-04-25',
    'HKD', 'JPY', array['Asia/Tokyo']::text[], true, 'read_nagoya',
    '[
      {"date":"2026-04-20","title":"Day 1","spots":[]},
      {"date":"2026-04-21","title":"Day 2","spots":[]},
      {"date":"2026-04-22","title":"Day 3","spots":[]},
      {"date":"2026-04-23","title":"Day 4","spots":[]},
      {"date":"2026-04-24","title":"Day 5","spots":[]},
      {"date":"2026-04-25","title":"Day 6","spots":[]}
    ]'::jsonb,
    '{}'::jsonb, 3, false,
    '2026-07-10 08:00:00+00', '2026-07-10 10:00:00+00'
  ),
  (
    '98100000-0000-4000-8000-000000000002',
    '98000000-0000-4000-8000-0000000000a2',
    'Osaka 2026', 'Osaka', '2026-05-01', '2026-05-01',
    'HKD', 'JPY', array['Asia/Tokyo']::text[], true, 'read_osaka',
    '[{"date":"2026-05-01","title":"Day 1","spots":[]}]'::jsonb,
    '{}'::jsonb, 1, false,
    '2026-07-10 07:00:00+00', '2026-07-10 09:00:00+00'
  );

insert into public.trip_members (trip_id, user_id, role, status)
values (
  '98100000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-0000000000a2',
  'editor',
  'active'
)
on conflict (trip_id, user_id) do update
set role = excluded.role,
    status = excluded.status;

insert into public.receipts (
  id, trip_id, owner_id, store, record_date, category, payment_method,
  amount, currency, home_currency, items_text, note, address, booking_ref,
  source_id, status, visibility, split_mode, notion_page_id, notion_database_id,
  created_at, updated_at
)
values
  (
    '98200000-0000-4000-8000-000000000001',
    '98100000-0000-4000-8000-000000000001',
    '98000000-0000-4000-8000-0000000000a1',
    'Nagoya Station', '2026-04-20', 'transport', 'card',
    1200, 'JPY', 'HKD', 'private item text', 'private note',
    'private address', 'private booking', 'read-receipt-trip',
    'confirmed', 'trip', 'shared', 'notion-page', 'notion-database',
    '2026-07-10 08:00:00+00', '2026-07-10 10:00:00+00'
  ),
  (
    '98200000-0000-4000-8000-000000000002',
    '98100000-0000-4000-8000-000000000001',
    '98000000-0000-4000-8000-0000000000a1',
    'Private Store', '2026-04-21', 'food', 'cash',
    500, 'JPY', 'HKD', 'private item text 2', 'private note 2',
    'private address 2', 'private booking 2', 'read-receipt-private',
    'confirmed', 'private', 'private', null, null,
    '2026-07-10 07:00:00+00', '2026-07-10 09:00:00+00'
  );

insert into public.receipt_photos (
  id, receipt_id, owner_id, storage_bucket, storage_path,
  mime_type, file_size, width, height
)
values (
  '98300000-0000-4000-8000-000000000001',
  '98200000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-0000000000a1',
  'receipt-photos', 'synthetic/secret-storage-path.jpg',
  'image/jpeg', 1234, 800, 600
);

insert into public.app_usage_events (
  id, user_id, session_id_hash, app_surface, event_name,
  metadata, app_build, user_agent, created_at
)
values
  (
    '98400000-0000-4000-8000-000000000001',
    '98000000-0000-4000-8000-0000000000a1', repeat('a', 64),
    'compact', 'heartbeat', '{"contractVersion":4,"schemaVersion":3}'::jsonb,
    '0.9.0', 'Synthetic Compact',
    '2026-07-10 10:00:00+00'
  ),
  (
    '98400000-0000-4000-8000-000000000002',
    '98000000-0000-4000-8000-0000000000a1', repeat('b', 64),
    'android', 'heartbeat', '{"contractVersion":4,"schemaVersion":3}'::jsonb,
    '0.9.0', 'Synthetic Android',
    '2026-07-10 10:01:00+00'
  );

insert into public.receipt_sync_jobs (
  id, receipt_id, trip_id, owner_id, provider, operation,
  status, attempts, last_error, payload, created_at, updated_at
)
values (
  '98500000-0000-4000-8000-000000000001',
  '98200000-0000-4000-8000-000000000001',
  '98100000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-0000000000a1',
  'notion', 'upsert', 'failed', 2, 'synthetic failure',
  '{"secret":"must-not-leak"}'::jsonb,
  '2026-07-10 09:00:00+00', '2026-07-10 10:00:00+00'
)
on conflict (receipt_id, provider) do update
set status = excluded.status,
    attempts = excluded.attempts,
    last_error = excluded.last_error,
    payload = excluded.payload,
    updated_at = excluded.updated_at;

insert into public.data_quality_runs (
  id, source, status, summary, started_at, completed_at
)
values (
  '98600000-0000-4000-8000-000000000001',
  'synthetic-admin-read', 'completed', '{"checked":2}'::jsonb,
  '2026-07-10 09:00:00+00', '2026-07-10 09:01:00+00'
);

insert into public.data_quality_findings (
  id, run_id, severity, finding_type, entity_type, entity_id, detail, created_at
)
values (
  '98600000-0000-4000-8000-000000000002',
  '98600000-0000-4000-8000-000000000001',
  'danger', 'synthetic_issue', 'receipt',
  '98200000-0000-4000-8000-000000000001', '{}',
  '2026-07-10 09:00:00+00'
);

grant admin_auth_owner to postgres;
set local role admin_auth_owner;

insert into private.admin_incidents (
  id, severity, kind, status, title, details, created_at
)
values (
  '98700000-0000-4000-8000-000000000001',
  'P1', 'synthetic', 'open', 'Synthetic incident',
  '{"secret":"must-not-leak","userId":"98000000-0000-4000-8000-0000000000a1"}'::jsonb,
  '2026-07-10 10:00:00+00'
);

reset role;
revoke admin_auth_owner from postgres;

insert into public.admin_audit_events (
  id, admin_subject_hash, action, target_type, target_id_hash,
  request_id, preview_counts, result, created_at
)
values (
  '98800000-0000-4000-8000-000000000001',
  repeat('c', 64), 'read_test', 'receipt', repeat('d', 24),
  'synthetic-request', '{"rows":1}'::jsonb, '{"ok":true}'::jsonb,
  '2026-07-10 10:00:00+00'
);

set local role service_role;

do $$
declare
  v_accounts jsonb;
  v_accounts_next jsonb;
  v_account jsonb;
  v_account_first jsonb;
  v_receipts jsonb;
  v_receipt jsonb;
  v_trip jsonb;
  v_itinerary jsonb;
  v_installations jsonb;
  v_incidents jsonb;
  v_sync jsonb;
  v_integrity jsonb;
  v_reconciliation jsonb;
  v_overview jsonb;
  v_search jsonb;
  v_rejected boolean := false;
begin
  v_accounts := public.admin_read_accounts(1, null, null, null, null, null);
  if (v_accounts ->> 'total')::integer <> 2
    or jsonb_array_length(v_accounts -> 'items') <> 1 then
    raise exception 'account pagination did not return the expected first page: %', v_accounts;
  end if;

  v_account_first := v_accounts -> 'items' -> 0;
  if v_account_first ? 'email'
    or v_account_first ->> 'masked_email' not like '%***@example.invalid' then
    raise exception 'account list leaked or failed to mask email';
  end if;

  v_accounts_next := public.admin_read_accounts(
    1,
    (v_account_first ->> 'updated_at')::timestamptz,
    (v_account_first ->> 'id')::uuid,
    null,
    null,
    null
  );
  if jsonb_array_length(v_accounts_next -> 'items') <> 1
    or v_accounts_next -> 'items' -> 0 ->> 'id' = v_account_first ->> 'id' then
    raise exception 'account cursor repeated or skipped the next page';
  end if;

  v_account := public.admin_read_account('98000000-0000-4000-8000-0000000000a1');
  if v_account -> 'identity' ->> 'email' <> 'read-owner@example.invalid' then
    raise exception 'addressed account detail omitted the full email';
  end if;

  v_installations := public.admin_read_account_installations(
    '98000000-0000-4000-8000-0000000000a1'
  );
  if jsonb_array_length(v_installations) <> 2
    or not exists (
      select 1 from jsonb_array_elements(v_installations) item
      where item ->> 'app_surface' = 'android'
        and (item ->> 'contract_version')::integer = 4
    ) then
    raise exception 'Android installation heartbeat was not represented';
  end if;

  v_trip := public.admin_read_trip('98100000-0000-4000-8000-000000000001');
  if (v_trip -> 'overview' ->> 'member_count')::integer <> 1
    or jsonb_array_length(v_trip -> 'members') <> 2 then
    raise exception 'trip membership duplicated or omitted the owner';
  end if;

  v_itinerary := public.admin_read_trip_itinerary(
    '98100000-0000-4000-8000-000000000001'
  );
  if v_itinerary ->> 'startDate' <> '2026-04-20'
    or v_itinerary ->> 'endDate' <> '2026-04-25'
    or jsonb_array_length(v_itinerary -> 'itinerary') <> 6 then
    raise exception 'Nagoya itinerary read contract is not exactly six days';
  end if;

  v_receipts := public.admin_read_receipts(
    51, null, null, null,
    '98100000-0000-4000-8000-000000000001',
    null, null, null, 'all'
  );
  if jsonb_array_length(v_receipts -> 'items') <> 2
    or (v_receipts -> 'items' -> 0) ?| array[
      'items_text', 'note', 'address', 'booking_ref', 'source_id',
      'notion_page_id', 'notion_database_id', 'storage_path'
    ] then
    raise exception 'receipt list leaked detail-only data';
  end if;

  v_receipt := public.admin_read_receipt('98200000-0000-4000-8000-000000000001');
  if v_receipt -> 'receipt' ->> 'note' <> 'private note'
    or v_receipt::text like '%secret-storage-path%'
    or v_receipt::text like '%must-not-leak%' then
    raise exception 'receipt detail contract omitted detail or leaked a storage/job payload';
  end if;

  v_incidents := public.admin_read_incidents(51, null, null, null, null);
  if jsonb_array_length(v_incidents -> 'items') <> 1
    or (v_incidents -> 'items' -> 0) ? 'details'
    or v_incidents::text like '%must-not-leak%' then
    raise exception 'incident list leaked raw details';
  end if;

  v_sync := public.admin_read_sync_jobs(51, null, null, 'failed', 'notion', null);
  if jsonb_array_length(v_sync -> 'items') <> 1
    or v_sync::text like '%must-not-leak%' then
    raise exception 'sync job list leaked its payload or omitted the failed job';
  end if;

  v_integrity := public.admin_read_integrity(51, null, null, 'high', null);
  if v_integrity ->> 'state' <> 'issues_found'
    or v_integrity -> 'items' -> 0 ->> 'severity' <> 'high' then
    raise exception 'integrity severity normalization failed';
  end if;

  v_reconciliation := public.admin_read_reconciliation(
    '98100000-0000-4000-8000-000000000001'
  );
  if (v_reconciliation ->> 'tripReceipts')::integer <> 1
    or (v_reconciliation ->> 'privateReceiptsExcluded')::integer <> 1 then
    raise exception 'reconciliation did not exclude private receipts';
  end if;

  v_overview := public.admin_read_overview();
  if (v_overview -> 'counts' ->> 'activeAccounts')::integer <> 2
    or (v_overview -> 'counts' ->> 'failedJobs')::integer <> 1
    or not exists (
      select 1 from jsonb_array_elements(v_overview -> 'clientVersions') item
      where item ->> 'app_surface' = 'android'
        and (item ->> 'contract_version')::integer = 4
        and (item ->> 'installations')::integer = 1
    ) then
    raise exception 'overview counts are incorrect';
  end if;

  v_search := public.admin_read_search('Read Owner');
  if jsonb_array_length(v_search -> 'accounts') <> 1
    or v_search::text like '%read-owner@example.invalid%' then
    raise exception 'global search result is missing or leaked full email';
  end if;

  begin
    perform public.admin_read_search('read-owner@example.invalid');
  exception when others then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'global search accepted a full email query';
  end if;
end
$$;

reset role;

rollback;

select 'admin_read_contract_smoke_passed' as result;
