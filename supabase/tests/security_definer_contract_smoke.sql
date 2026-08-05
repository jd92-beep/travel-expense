-- Verify the reconciled SECURITY DEFINER and receipt-private-field contract.
-- This test is destructive only inside its transaction and always rolls back.

begin;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and pg_catalog.has_function_privilege('anon', p.oid, 'execute')
  ) then
    raise exception 'anon can execute a public/private function';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef
      and n.nspname in ('public', 'private')
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, '{}'::text[])) setting
        where setting = 'search_path=""'
           or setting = 'search_path=pg_catalog, extensions'
      )
  ) then
    raise exception 'SECURITY DEFINER function has an unsafe search_path';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and pg_catalog.has_function_privilege('authenticated', p.oid, 'execute')
      and not (
        (n.nspname = 'private' and p.proname in (
          'can_access_trip',
          'can_admin_trip',
          'can_edit_trip',
          'trip_member_role_rank'
        ))
        or
        (n.nspname = 'public' and p.proname in (
          'accept_trip_invite',
          'claim_receipt_sync_jobs',
          'create_trip_invite',
          'delete_own_user_account',
          'delete_receipt_v2',
          'delete_shared_trip_receipt',
          'enqueue_notion_receipt_sync',
          'finish_receipt_sync_job',
          'leave_trip',
          'remove_trip_member',
          'restore_receipt_v2',
          'revoke_trip_invite',
          'trip_member_display_names',
          'update_trip_itinerary',
          'update_trip_member_role',
          'upsert_shared_trip_receipt'
        ))
      )
  ) then
    raise exception 'authenticated can execute a non-allowlisted SECURITY DEFINER function';
  end if;

  if not pg_catalog.has_function_privilege(
    'supabase_auth_admin',
    'private.handle_new_user_profile()',
    'execute'
  ) then
    raise exception 'supabase_auth_admin cannot execute private.handle_new_user_profile()';
  end if;

  if not pg_catalog.has_function_privilege(
    'supabase_auth_admin',
    'public.notify_admin_on_auth_user_created()',
    'execute'
  ) then
    raise exception 'supabase_auth_admin cannot execute public.notify_admin_on_auth_user_created()';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.enqueue_notion_receipt_sync(uuid, text, jsonb)',
    'execute'
  ) then
    raise exception 'service_role cannot execute public.enqueue_notion_receipt_sync()';
  end if;
end
$$;

insert into auth.users (
  id, aud, role, email, email_confirmed_at, raw_app_meta_data,
  raw_user_meta_data, created_at, updated_at
)
values (
  '96000000-0000-4000-8000-0000000000a1',
  'authenticated',
  'authenticated',
  'definer-contract@example.invalid',
  now(),
  '{"provider":"email"}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.profiles (id, display_name)
values ('96000000-0000-4000-8000-0000000000a1', 'Definer Contract')
on conflict (id) do nothing;

insert into public.trips (
  id, owner_id, name, destination_summary, start_date, end_date,
  home_currency, trip_currency, timezones, active, legacy_source_id,
  itinerary, app_metadata, version, archived
)
values (
  '96100000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-0000000000a1',
  'Definer Contract Trip',
  'Synthetic only',
  '2026-07-10',
  '2026-07-11',
  'HKD',
  'JPY',
  array['Asia/Tokyo']::text[],
  true,
  'definer_contract_trip',
  '[]'::jsonb,
  '{}'::jsonb,
  1,
  false
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-0000000000a1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  begin
    insert into public.receipts (
      id, trip_id, owner_id, store, record_date, category, payment_method,
      amount, currency, home_currency, source_id, status, visibility, split_mode
    ) values (
      '96200000-0000-4000-8000-000000000001',
      '96100000-0000-4000-8000-000000000001',
      '96000000-0000-4000-8000-0000000000a1',
      'Forbidden Browser Write', '2026-07-10', 'food', 'cash', 10,
      'JPY', 'HKD', 'definer-browser-write', 'confirmed', 'private', 'private'
    );
    raise exception 'authenticated direct receipt DML unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

select public.upsert_shared_trip_receipt(
  '96100000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'store', 'Authenticated RPC Write',
    'record_date', '2026-07-10',
    'category', 'food',
    'payment_method', 'cash',
    'amount', 10,
    'currency', 'JPY',
    'home_currency', 'HKD',
    'visibility', 'private',
    'split_mode', 'private',
    'notion_page_id', 'must-be-ignored',
    'notion_database_id', 'must-be-ignored'
  ),
  '96200000-0000-4000-8000-000000000001',
  'definer-browser-write',
  'definer-contract-create'
);

reset role;

do $$
begin
  if exists (
    select 1
    from public.receipts
    where id = '96200000-0000-4000-8000-000000000001'
      and (notion_page_id is not null or notion_database_id is not null
        or visibility <> 'private' or split_mode <> 'private')
  ) then
    raise exception 'authenticated receipt RPC violated private receipt invariants';
  end if;
end
$$;

set local role service_role;
select set_config('request.jwt.claim.sub', '96000000-0000-4000-8000-0000000000a1', true);
select set_config('request.jwt.claim.role', 'service_role', true);

insert into public.receipts (
  id, trip_id, owner_id, store, record_date, category, payment_method,
  amount, currency, home_currency, source_id, status, visibility,
  split_mode, notion_page_id, notion_database_id
)
values (
  '96200000-0000-4000-8000-000000000002',
  '96100000-0000-4000-8000-000000000001',
  '96000000-0000-4000-8000-0000000000a1',
  'Verified Service Write',
  '2026-07-11',
  'transport',
  'card',
  20,
  'JPY',
  'HKD',
  'definer-service-write',
  'confirmed',
  'private',
  'private',
  'service-page-id',
  'service-database-id'
);

reset role;

do $$
begin
  if not exists (
    select 1
    from public.receipts
    where id = '96200000-0000-4000-8000-000000000002'
      and notion_page_id = 'service-page-id'
      and notion_database_id = 'service-database-id'
  ) then
    raise exception 'service_role receipt write did not retain verified Notion identifiers';
  end if;
end
$$;

insert into private.notion_import_batches (
  id, source_database_id, target_owner_id, status
)
values (
  '96300000-0000-4000-8000-000000000001',
  'synthetic-source',
  '96000000-0000-4000-8000-0000000000a1',
  'draft'
);

delete from auth.users
where id = '96000000-0000-4000-8000-0000000000a1';

do $$
begin
  if exists (
    select 1
    from private.notion_import_batches
    where id = '96300000-0000-4000-8000-000000000001'
  ) then
    raise exception 'notion import batch blocked or survived account cascade';
  end if;
end
$$;

rollback;

select 'security_definer_contract_smoke_passed' as result;
