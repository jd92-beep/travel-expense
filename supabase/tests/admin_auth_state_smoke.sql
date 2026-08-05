-- Durable admin authentication state and privilege contract.

begin;

do $$
declare
  v_role pg_catalog.pg_roles%rowtype;
  v_table text;
  v_function oid;
begin
  select * into v_role
  from pg_catalog.pg_roles
  where rolname = 'admin_auth_owner';

  if v_role.rolname is null
    or v_role.rolcanlogin
    or v_role.rolsuper
    or v_role.rolinherit
    or v_role.rolcreatedb
    or v_role.rolcreaterole
    or v_role.rolreplication
    or v_role.rolbypassrls then
    raise exception 'admin_auth_owner role attributes are unsafe';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_auth_members membership
    join pg_catalog.pg_roles granted_role on granted_role.oid = membership.roleid
    join pg_catalog.pg_roles member_role on member_role.oid = membership.member
    where granted_role.rolname = 'admin_auth_owner'
      and member_role.rolname = 'postgres'
      and (membership.inherit_option or membership.set_option)
  ) then
    raise exception 'postgres can inherit or SET ROLE admin_auth_owner';
  end if;
  if not pg_catalog.has_schema_privilege('admin_auth_owner', 'private', 'USAGE')
    or pg_catalog.has_schema_privilege('admin_auth_owner', 'private', 'CREATE')
    or pg_catalog.has_schema_privilege('admin_auth_owner', 'public', 'CREATE') then
    raise exception 'admin_auth_owner schema privileges are unsafe';
  end if;
  if pg_catalog.pg_get_functiondef(
    'public.admin_auth_register_credential(text,text,bigint,text[],text,boolean,text)'::regprocedure
  ) not like '%pg_advisory_xact_lock%'
    or pg_catalog.pg_get_functiondef(
      'public.admin_auth_register_credential(text,text,bigint,text[],text,boolean,text)'::regprocedure
    ) not like '%v_count <> 0%' then
    raise exception 'bootstrap passkey registration is not one-time and concurrency-safe';
  end if;
  if pg_catalog.pg_get_functiondef(
    'public.admin_auth_register_backup_credential(text,text,bigint,text[],text,boolean,text,text,text,uuid)'::regprocedure
  ) not like '%append_admin_audit_v2%' then
    raise exception 'backup passkey registration is not atomically audited';
  end if;
  if pg_catalog.pg_get_functiondef(
    'public.admin_auth_remove_backup_credential(text,text,uuid,text,text,uuid)'::regprocedure
  ) not like '%pg_advisory_xact_lock%'
    or pg_catalog.pg_get_functiondef(
      'public.admin_auth_remove_backup_credential(text,text,uuid,text,text,uuid)'::regprocedure
    ) not like '%append_admin_audit_v2%'
    or pg_catalog.pg_get_functiondef(
      'public.admin_auth_remove_backup_credential(text,text,uuid,text,text,uuid)'::regprocedure
    ) not like '%admin_auth_revoke_all_sessions%' then
    raise exception 'passkey removal is not locked, audited, and session-revoking';
  end if;

  foreach v_table in array array[
    'admin_sessions',
    'admin_login_buckets',
    'admin_webauthn_credentials',
    'admin_webauthn_challenges',
    'admin_request_nonces',
    'admin_step_up_grants',
    'admin_incidents'
  ]
  loop
    if pg_catalog.has_table_privilege('anon', format('private.%I', v_table), 'select')
      or pg_catalog.has_table_privilege('authenticated', format('private.%I', v_table), 'select')
      or pg_catalog.has_table_privilege('service_role', format('private.%I', v_table), 'select') then
      raise exception 'direct table access remains on private.%', v_table;
    end if;
  end loop;

  for v_function in
    select p.oid
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'admin_auth_%' or p.proname = 'admin_consume_request_nonce')
  loop
    if pg_catalog.has_function_privilege('anon', v_function, 'execute')
      or pg_catalog.has_function_privilege('authenticated', v_function, 'execute')
      or not pg_catalog.has_function_privilege('service_role', v_function, 'execute') then
      raise exception 'admin auth RPC execute allowlist is invalid';
    end if;
  end loop;
end
$$;

set local role service_role;

do $$
declare
  v_result jsonb;
  v_blocked jsonb;
  v_first jsonb;
  v_second jsonb;
  v_third jsonb;
  v_rotated jsonb;
  v_overflow_blocked boolean := false;
  v_selector text;
  v_set_hash text;
  v_target_hash text;
  v_preview_hash text;
  v_removal jsonb;
begin
  v_result := public.admin_auth_rate_precheck(repeat('a', 64), 'login');
  if coalesce((v_result ->> 'allowed')::boolean, false) is not true then
    raise exception 'fresh login bucket was blocked';
  end if;

  perform public.admin_auth_rate_record(repeat('a', 64), 'login', false)
  from generate_series(1, 5);
  v_blocked := public.admin_auth_rate_precheck(repeat('a', 64), 'login');
  if coalesce((v_blocked ->> 'allowed')::boolean, true) is not false
    or coalesce((v_blocked ->> 'retryAfterSeconds')::integer, 0) < 1 then
    raise exception 'progressive login delay was not enforced';
  end if;
  perform public.admin_auth_rate_record(repeat('a', 64), 'login', true);

  perform public.admin_auth_create_challenge(
    '97000000-0000-4000-8000-000000000001',
    'authentication',
    repeat('challenge', 4),
    repeat('b', 64),
    '{"credentialIds":["synthetic"]}'::jsonb
  );
  if public.admin_auth_consume_challenge(
    '97000000-0000-4000-8000-000000000001',
    'authentication',
    repeat('b', 64)
  ) is null then
    raise exception 'fresh WebAuthn challenge could not be consumed';
  end if;
  if public.admin_auth_consume_challenge(
    '97000000-0000-4000-8000-000000000001',
    'authentication',
    repeat('b', 64)
  ) is not null then
    raise exception 'WebAuthn challenge replay succeeded';
  end if;

  perform public.admin_auth_register_credential('credential-0000000000001', repeat('c', 64), 0, array['internal'], 'singleDevice', false, 'One');
  v_result := public.admin_auth_register_backup_credential(
    'credential-0000000000002', repeat('d', 64), 0, array['internal'],
    'multiDevice', true, 'Two', 'boss', repeat('1', 64),
    '97000000-0000-4000-8000-000000000102'
  );
  if coalesce((v_result ->> 'count')::integer, 0) <> 2 then
    raise exception 'second Boss passkey was not registered atomically';
  end if;
  perform public.admin_auth_register_backup_credential(
    'credential-0000000000003', repeat('e', 64), 0, array['internal'],
    'multiDevice', true, 'Three', 'boss', repeat('1', 64),
    '97000000-0000-4000-8000-000000000103'
  );
  begin
    perform public.admin_auth_register_backup_credential(
      'credential-0000000000004', repeat('f', 64), 0, array['internal'],
      'singleDevice', false, 'Four', 'boss', repeat('1', 64),
      '97000000-0000-4000-8000-000000000104'
    );
  exception when others then
    v_overflow_blocked := true;
  end;
  if not v_overflow_blocked then
    raise exception 'fourth Boss passkey was accepted';
  end if;

  v_first := public.admin_auth_create_session(repeat('1', 64), repeat('a', 64), 'boss', 'passphrase+passkey', repeat('f', 64));
  v_second := public.admin_auth_create_session(repeat('2', 64), repeat('b', 64), 'boss', 'passphrase+passkey', repeat('f', 64));
  v_third := public.admin_auth_create_session(repeat('3', 64), repeat('c', 64), 'boss', 'passphrase+passkey', repeat('f', 64));

  if public.admin_auth_verify_session(repeat('1', 64), repeat('f', 64)) is not null then
    raise exception 'oldest session survived the two-session limit';
  end if;
  if public.admin_auth_verify_session(repeat('2', 64), repeat('f', 64)) is null
    or public.admin_auth_verify_session(repeat('3', 64), repeat('f', 64)) is null then
    raise exception 'active session was not verifiable';
  end if;
  if public.admin_auth_verify_session(repeat('2', 64), repeat('0', 64)) is not null then
    raise exception 'session survived passphrase hash rotation';
  end if;

  perform public.admin_auth_create_step_up(
    '97000000-0000-4000-8000-000000000008',
    repeat('3', 64),
    'receipt_amend',
    repeat('4', 64),
    repeat('5', 64)
  );
  if not public.admin_auth_consume_step_up(
    '97000000-0000-4000-8000-000000000008',
    repeat('3', 64),
    'receipt_amend',
    repeat('4', 64),
    repeat('5', 64)
  ) then
    raise exception 'fresh step-up grant could not be consumed';
  end if;
  if public.admin_auth_consume_step_up(
    '97000000-0000-4000-8000-000000000008',
    repeat('3', 64),
    'receipt_amend',
    repeat('4', 64),
    repeat('5', 64)
  ) then
    raise exception 'step-up grant replay succeeded';
  end if;

  v_rotated := public.admin_auth_rotate_session(
    repeat('3', 64), repeat('4', 64), repeat('d', 64),
    'boss', 'passphrase+passkey', repeat('f', 64)
  );
  if v_rotated ->> 'sessionId' is null
    or public.admin_auth_verify_session(repeat('3', 64), repeat('f', 64)) is not null
    or public.admin_auth_verify_session(repeat('4', 64), repeat('f', 64)) is null then
    raise exception 'atomic session rotation did not replace the old session';
  end if;

  if not public.admin_auth_revoke_session(repeat('4', 64), 'logout')
    or public.admin_auth_verify_session(repeat('4', 64), repeat('f', 64)) is not null then
    raise exception 'session revoke did not take effect';
  end if;

  select selector into v_selector from (
    select encode(extensions.digest('passkey-remove-selector-v1' || chr(10) || 'credential-0000000000002', 'sha256'), 'hex') as selector
  ) selectors;
  select encode(extensions.digest(string_agg(selector, chr(10) order by selector), 'sha256'), 'hex')
  into v_set_hash
  from (
    select encode(extensions.digest('passkey-remove-selector-v1' || chr(10) || credential_id, 'sha256'), 'hex') as selector
    from (values ('credential-0000000000001'), ('credential-0000000000002'), ('credential-0000000000003')) as keys(credential_id)
  ) selectors;
  v_target_hash := encode(extensions.digest('passkey-remove-target-v1' || chr(10) || v_selector, 'sha256'), 'hex');
  v_preview_hash := encode(extensions.digest('passkey-remove-preview-v1' || chr(10) || v_selector || chr(10) || v_set_hash, 'sha256'), 'hex');
  perform public.admin_auth_create_session(repeat('6', 64), repeat('e', 64), 'boss', 'passphrase+passkey', repeat('f', 64));
  perform public.admin_auth_create_session(repeat('7', 64), repeat('f', 64), 'boss', 'passphrase+passkey', repeat('f', 64));
  perform public.admin_auth_create_step_up(
    '97000000-0000-4000-8000-000000000010', repeat('7', 64),
    'passkey_remove', v_target_hash, v_preview_hash
  );
  v_removal := public.admin_auth_remove_backup_credential(
    v_selector, v_set_hash, '97000000-0000-4000-8000-000000000010',
    repeat('7', 64), 'boss', '97000000-0000-4000-8000-000000000011'
  );
  if coalesce((v_removal ->> 'removed')::boolean, false) is not true
    or coalesce((v_removal ->> 'remainingPasskeys')::integer, 0) <> 2
    or public.admin_auth_verify_session(repeat('6', 64), repeat('f', 64)) is not null
    or public.admin_auth_verify_session(repeat('7', 64), repeat('f', 64)) is not null then
    raise exception 'passkey removal did not delete atomically and revoke all sessions';
  end if;
  if public.admin_auth_consume_step_up(
    '97000000-0000-4000-8000-000000000010', repeat('7', 64),
    'passkey_remove', v_target_hash, v_preview_hash
  ) then
    raise exception 'passkey removal step-up grant replay succeeded';
  end if;
  perform public.admin_auth_create_session(repeat('8', 64), repeat('1', 64), 'boss', 'passphrase+passkey', repeat('f', 64));
  v_selector := encode(extensions.digest('passkey-remove-selector-v1' || chr(10) || 'credential-0000000000003', 'sha256'), 'hex');
  select encode(extensions.digest(string_agg(selector, chr(10) order by selector), 'sha256'), 'hex')
  into v_set_hash
  from (
    select encode(extensions.digest('passkey-remove-selector-v1' || chr(10) || credential_id, 'sha256'), 'hex') as selector
    from (values ('credential-0000000000001'), ('credential-0000000000003')) as keys(credential_id)
  ) selectors;
  if coalesce((public.admin_auth_remove_backup_credential(
    v_selector, repeat('0', 64), '97000000-0000-4000-8000-000000000012',
    repeat('8', 64), 'boss', '97000000-0000-4000-8000-000000000013'
  ) ->> 'errorCode'), '') <> 'PREVIEW_STALE' then
    raise exception 'stale passkey set was accepted';
  end if;
  v_target_hash := encode(extensions.digest('passkey-remove-target-v1' || chr(10) || v_selector, 'sha256'), 'hex');
  v_preview_hash := encode(extensions.digest('passkey-remove-preview-v1' || chr(10) || v_selector || chr(10) || v_set_hash, 'sha256'), 'hex');
  perform public.admin_auth_create_step_up(
    '97000000-0000-4000-8000-000000000012', repeat('8', 64),
    'passkey_remove', v_target_hash, v_preview_hash
  );
  v_removal := public.admin_auth_remove_backup_credential(
    v_selector, v_set_hash, '97000000-0000-4000-8000-000000000012',
    repeat('8', 64), 'boss', '97000000-0000-4000-8000-000000000014'
  );
  if coalesce((v_removal ->> 'removed')::boolean, false) is not true then
    raise exception 'second non-final passkey removal failed';
  end if;
  perform public.admin_auth_create_session(repeat('9', 64), repeat('2', 64), 'boss', 'passphrase+passkey', repeat('f', 64));
  v_selector := encode(extensions.digest('passkey-remove-selector-v1' || chr(10) || 'credential-0000000000001', 'sha256'), 'hex');
  v_set_hash := encode(extensions.digest(v_selector, 'sha256'), 'hex');
  if coalesce((public.admin_auth_remove_backup_credential(
    v_selector, v_set_hash, '97000000-0000-4000-8000-000000000013',
    repeat('9', 64), 'boss', '97000000-0000-4000-8000-000000000015'
  ) ->> 'errorCode'), '') <> 'FINAL_PASSKEY_PROTECTED' then
    raise exception 'final passkey removal was accepted';
  end if;

  if not public.admin_consume_request_nonce(
    repeat('9', 64),
    '97000000-0000-4000-8000-000000000009',
    clock_timestamp() + interval '30 seconds'
  ) then
    raise exception 'fresh signed-request nonce was rejected';
  end if;
  if public.admin_consume_request_nonce(
    repeat('9', 64),
    '97000000-0000-4000-8000-000000000009',
    clock_timestamp() + interval '30 seconds'
  ) then
    raise exception 'signed-request nonce replay succeeded';
  end if;
end
$$;

reset role;

rollback;

select 'admin_auth_state_smoke_passed' as result;
