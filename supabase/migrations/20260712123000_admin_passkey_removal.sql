-- R2 removal of a non-final Boss passkey. The opaque selector and set hash are
-- recomputed under one credential-set lock; no credential identifier is returned.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

grant admin_auth_owner to postgres;
grant admin_read_owner to postgres;
grant usage, create on schema public to admin_auth_owner;
grant usage, create on schema private to admin_auth_owner;
grant usage on schema extensions to admin_auth_owner;

create or replace function public.admin_auth_remove_backup_credential(
  p_selector text,
  p_set_hash text,
  p_grant_id uuid,
  p_session_hash text,
  p_actor text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target private.admin_webauthn_credentials%rowtype;
  v_count integer;
  v_actual_set_hash text;
  v_actor_hash text := encode(extensions.digest(coalesce(p_actor, ''), 'sha256'), 'hex');
  v_target_hash text;
  v_preview_hash text;
  v_revoked_sessions integer;
begin
  if p_selector !~ '^[0-9a-f]{64}$'
    or p_set_hash !~ '^[0-9a-f]{64}$'
    or p_session_hash !~ '^[0-9a-f]{64}$'
    or p_actor = '' then
    return jsonb_build_object('removed', false, 'errorCode', 'VALIDATION_FAILED');
  end if;
  if not exists (
    select 1 from private.admin_sessions session
    where session.token_hash = p_session_hash and session.revoked_at is null
      and session.idle_expires_at > clock_timestamp()
      and session.absolute_expires_at > clock_timestamp()
  ) then
    return jsonb_build_object('removed', false, 'errorCode', 'UNAUTHORIZED');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('private.admin_webauthn_credentials')
  );
  select count(*), encode(extensions.digest(coalesce(string_agg(
    encode(extensions.digest('passkey-remove-selector-v1' || chr(10) || credential_id, 'sha256'), 'hex'),
    chr(10) order by encode(extensions.digest('passkey-remove-selector-v1' || chr(10) || credential_id, 'sha256'), 'hex')
  ), ''), 'sha256'), 'hex')
  into v_count, v_actual_set_hash
  from private.admin_webauthn_credentials
  where disabled_at is null;

  select * into v_target
  from private.admin_webauthn_credentials
  where disabled_at is null
    and encode(extensions.digest('passkey-remove-selector-v1' || chr(10) || credential_id, 'sha256'), 'hex') = p_selector
  for update;
  if not found then
    return jsonb_build_object('removed', false, 'errorCode', 'TARGET_NOT_FOUND');
  end if;
  if v_count <= 1 then
    return jsonb_build_object('removed', false, 'errorCode', 'FINAL_PASSKEY_PROTECTED');
  end if;
  if v_actual_set_hash <> p_set_hash then
    return jsonb_build_object('removed', false, 'errorCode', 'PREVIEW_STALE');
  end if;

  v_target_hash := encode(extensions.digest('passkey-remove-target-v1' || chr(10) || p_selector, 'sha256'), 'hex');
  v_preview_hash := encode(extensions.digest('passkey-remove-preview-v1' || chr(10) || p_selector || chr(10) || p_set_hash, 'sha256'), 'hex');
  update private.admin_step_up_grants
  set consumed_at = clock_timestamp()
  where id = p_grant_id and session_hash = p_session_hash
    and action = 'passkey_remove' and target_hash = v_target_hash
    and preview_hash = v_preview_hash and consumed_at is null
    and expires_at > clock_timestamp();
  if not found then
    return jsonb_build_object('removed', false, 'errorCode', 'MFA_STEP_UP_REQUIRED');
  end if;

  delete from private.admin_webauthn_credentials where credential_id = v_target.credential_id;
  perform private.append_admin_audit_v2(
    v_actor_hash, p_session_hash, 'R2', 'passkey_removed', 'passkey', v_target_hash,
    v_preview_hash,
    jsonb_build_object('activePasskeys', v_count),
    jsonb_build_object('activePasskeys', v_count - 1),
    jsonb_build_object('removed', true, 'remainingPasskeys', v_count - 1),
    null, p_request_id, null, null
  );
  v_revoked_sessions := public.admin_auth_revoke_all_sessions('passkey_removed');
  return jsonb_build_object(
    'removed', true,
    'remainingPasskeys', v_count - 1,
    'revokedSessions', v_revoked_sessions
  );
end;
$$;

create or replace function private.append_admin_audit_v2(
  p_actor_hash text,
  p_session_hash text,
  p_risk text,
  p_action text,
  p_target_type text,
  p_target_hash text,
  p_preview_hash text,
  p_before_state jsonb,
  p_after_state jsonb,
  p_result jsonb,
  p_error_code text,
  p_request_id uuid,
  p_operation_id uuid default null,
  p_incident_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_head private.admin_audit_chain_heads%rowtype;
  v_sequence bigint;
  v_previous_hash text;
  v_event_hash text;
  v_auth_method text;
  v_payload jsonb;
  v_occurred_at timestamptz := clock_timestamp();
  v_schema_version constant text := '20260712123000';
  v_edge_version constant text := 'admin-kanban-v1';
begin
  if p_actor_hash !~ '^[0-9a-f]{64}$'
    or p_session_hash !~ '^[0-9a-f]{64}$'
    or p_target_hash !~ '^[0-9a-f]{64}$'
    or (p_preview_hash is not null and p_preview_hash !~ '^[0-9a-f]{64}$')
    or p_risk not in ('R0', 'R1', 'R2', 'R3') then
    raise exception 'invalid admin audit input' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('private.admin_audit_events_v2'));
  select * into v_head from private.admin_audit_chain_heads where chain_key = 'admin' for update;
  if v_head.chain_key is null then raise exception 'admin audit chain head is unavailable' using errcode = '55000'; end if;
  v_sequence := v_head.sequence + 1;
  v_previous_hash := v_head.event_hash;
  select coalesce(s.auth_method, 'signed-bff') into v_auth_method
  from private.admin_sessions s where s.token_hash = p_session_hash limit 1;
  v_payload := jsonb_build_object(
    'id', v_id, 'sequence', v_sequence, 'previousEventHash', v_previous_hash,
    'occurredAt', v_occurred_at, 'actorHash', p_actor_hash, 'sessionHash', p_session_hash,
    'authenticationMethod', coalesce(v_auth_method, 'signed-bff'), 'risk', p_risk,
    'action', p_action, 'targetType', p_target_type, 'targetHash', p_target_hash,
    'previewHash', p_preview_hash, 'before', p_before_state, 'after', p_after_state,
    'result', p_result, 'errorCode', p_error_code, 'requestId', p_request_id,
    'operationId', p_operation_id, 'incidentId', p_incident_id,
    'edgeVersion', v_edge_version, 'schemaVersion', v_schema_version
  );
  v_event_hash := encode(extensions.digest(v_previous_hash || v_payload::text, 'sha256'), 'hex');
  insert into private.admin_audit_events_v2 (
    id, sequence, previous_event_hash, event_hash, occurred_at, actor_hash, session_hash,
    authentication_method, risk, action, target_type, target_hash, preview_hash,
    before_state, after_state, result, error_code, request_id, operation_id, incident_id,
    edge_version, schema_version
  ) values (
    v_id, v_sequence, v_previous_hash, v_event_hash, v_occurred_at, p_actor_hash, p_session_hash,
    coalesce(v_auth_method, 'signed-bff'), p_risk, p_action, p_target_type, p_target_hash,
    p_preview_hash, p_before_state, p_after_state, p_result, p_error_code, p_request_id,
    p_operation_id, p_incident_id, v_edge_version, v_schema_version
  );
  update private.admin_audit_chain_heads set sequence = v_sequence, event_hash = v_event_hash where chain_key = 'admin';
  return v_id;
end;
$$;

alter table private.admin_audit_events_v2
  alter column schema_version set default '20260712123000';

create or replace function public.admin_read_runtime_contract()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'schemaVersion', '20260712123000',
    'operationContractVersion', 'admin-operation-v1',
    'auditContractVersion', 'admin-audit-v2',
    'securityEventAggregationVersion', 'admin-security-events-v1',
    'itineraryContractVersion', 'versioned-itinerary-v1',
    'receiptContractVersion', 'canonical-receipt-v1',
    'passkeyContractVersion', 'admin-passkeys-v2'
  );
$$;

alter function public.admin_auth_remove_backup_credential(text, text, uuid, text, text, uuid) owner to admin_auth_owner;
alter function private.append_admin_audit_v2(
  text, text, text, text, text, text, text, jsonb, jsonb, jsonb, text, uuid, uuid, uuid
) owner to admin_auth_owner;
alter function public.admin_read_runtime_contract() owner to admin_read_owner;

revoke all on function public.admin_auth_remove_backup_credential(text, text, uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.append_admin_audit_v2(
  text, text, text, text, text, text, text, jsonb, jsonb, jsonb, text, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.admin_read_runtime_contract() from public, anon, authenticated;
grant execute on function public.admin_auth_remove_backup_credential(text, text, uuid, text, text, uuid) to service_role;
grant execute on function public.admin_read_runtime_contract() to service_role;

revoke create on schema private from admin_auth_owner;
revoke create on schema public from admin_auth_owner;
revoke admin_auth_owner from postgres;
revoke admin_read_owner from postgres;

commit;
