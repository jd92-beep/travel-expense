-- Advance runtime and append-only audit provenance after the Admin 1.0 RC
-- forward fixes. Older migrations remain untouched and reproducible.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

grant admin_auth_owner to postgres;
grant admin_read_owner to postgres;
grant usage, create on schema private to admin_auth_owner;
grant usage, create on schema public to admin_read_owner;

alter table private.admin_audit_events_v2
  alter column schema_version set default '20260712121000';

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
  v_sequence bigint;
  v_previous_hash text;
  v_event_hash text;
  v_auth_method text;
  v_payload jsonb;
  v_occurred_at timestamptz := clock_timestamp();
  v_schema_version constant text := '20260712121000';
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
  select coalesce(max(sequence), 0) + 1,
         coalesce((array_agg(event_hash order by sequence desc))[1], repeat('0', 64))
  into v_sequence, v_previous_hash
  from private.admin_audit_events_v2;

  select coalesce(s.auth_method, 'signed-bff')
  into v_auth_method
  from private.admin_sessions s
  where s.token_hash = p_session_hash
  limit 1;

  v_payload := jsonb_build_object(
    'id', v_id,
    'sequence', v_sequence,
    'previousEventHash', v_previous_hash,
    'occurredAt', v_occurred_at,
    'actorHash', p_actor_hash,
    'sessionHash', p_session_hash,
    'authenticationMethod', coalesce(v_auth_method, 'signed-bff'),
    'risk', p_risk,
    'action', p_action,
    'targetType', p_target_type,
    'targetHash', p_target_hash,
    'previewHash', p_preview_hash,
    'before', p_before_state,
    'after', p_after_state,
    'result', p_result,
    'errorCode', p_error_code,
    'requestId', p_request_id,
    'operationId', p_operation_id,
    'incidentId', p_incident_id,
    'edgeVersion', v_edge_version,
    'schemaVersion', v_schema_version
  );
  v_event_hash := encode(
    extensions.digest(v_previous_hash || v_payload::text, 'sha256'),
    'hex'
  );

  insert into private.admin_audit_events_v2 (
    id, sequence, previous_event_hash, event_hash, occurred_at, actor_hash, session_hash,
    authentication_method, risk, action, target_type, target_hash,
    preview_hash, before_state, after_state, result, error_code, request_id,
    operation_id, incident_id, edge_version, schema_version
  ) values (
    v_id, v_sequence, v_previous_hash, v_event_hash, v_occurred_at, p_actor_hash, p_session_hash,
    coalesce(v_auth_method, 'signed-bff'), p_risk, p_action, p_target_type,
    p_target_hash, p_preview_hash, p_before_state, p_after_state, p_result,
    p_error_code, p_request_id, p_operation_id, p_incident_id, v_edge_version,
    v_schema_version
  );
  return v_id;
end;
$$;

create or replace function public.admin_read_runtime_contract()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'schemaVersion', '20260712121000',
    'operationContractVersion', 'admin-operation-v1',
    'auditContractVersion', 'admin-audit-v2',
    'itineraryContractVersion', 'versioned-itinerary-v1',
    'receiptContractVersion', 'canonical-receipt-v1',
    'passkeyContractVersion', 'admin-passkeys-v1'
  );
$$;

alter function private.append_admin_audit_v2(
  text, text, text, text, text, text, text, jsonb, jsonb, jsonb, text, uuid, uuid, uuid
) owner to admin_auth_owner;
alter function public.admin_read_runtime_contract() owner to admin_read_owner;

revoke all on function private.append_admin_audit_v2(
  text, text, text, text, text, text, text, jsonb, jsonb, jsonb, text, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.admin_read_runtime_contract()
  from public, anon, authenticated;
grant execute on function public.admin_read_runtime_contract() to service_role;

revoke create on schema private from admin_auth_owner;
revoke create on schema public from admin_read_owner;
revoke admin_auth_owner from postgres;
revoke admin_read_owner from postgres;

commit;
