-- Serialize session mutation, aggregate unauthenticated denials, and keep the
-- audit chain head in constant-time state. This is forward-only.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

grant admin_auth_owner to postgres;
grant admin_read_owner to postgres;
grant usage, create on schema private to admin_auth_owner;
grant usage, create on schema public to admin_read_owner;

create table if not exists private.admin_audit_chain_heads (
  chain_key text primary key check (chain_key = 'admin'),
  sequence bigint not null check (sequence >= 0),
  event_hash text not null check (event_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists private.admin_security_event_buckets (
  bucket_started_at timestamptz not null,
  action text not null check (action in ('admin_request_denied', 'admin_signature_rejected')),
  method text not null check (method ~ '^[A-Z]{3,10}$'),
  route text not null check (route ~ '^(/api/[A-Za-z0-9_./-]*|invalid)$'),
  error_code text not null check (error_code ~ '^[A-Z0-9_]{3,64}$'),
  rejection_count bigint not null default 1 check (rejection_count > 0),
  sample_request_id uuid not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  primary key (bucket_started_at, action, method, route, error_code)
);

insert into private.admin_audit_chain_heads (chain_key, sequence, event_hash)
select
  'admin',
  coalesce((select sequence from private.admin_audit_events_v2 order by sequence desc limit 1), 0),
  coalesce((select event_hash from private.admin_audit_events_v2 order by sequence desc limit 1), repeat('0', 64))
on conflict (chain_key) do nothing;

alter table private.admin_audit_chain_heads owner to admin_auth_owner;
alter table private.admin_security_event_buckets owner to admin_auth_owner;
alter table private.admin_audit_chain_heads enable row level security;
alter table private.admin_audit_chain_heads force row level security;
alter table private.admin_security_event_buckets enable row level security;
alter table private.admin_security_event_buckets force row level security;

create policy admin_auth_owner_audit_chain_heads
  on private.admin_audit_chain_heads for all to admin_auth_owner
  using (true) with check (true);
create policy admin_auth_owner_security_event_buckets
  on private.admin_security_event_buckets for all to admin_auth_owner
  using (true) with check (true);

create or replace function public.admin_auth_create_session(
  p_token_hash text,
  p_csrf_hash text,
  p_actor text,
  p_auth_method text,
  p_passphrase_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_id uuid;
  v_idle timestamptz := v_now + interval '10 minutes';
  v_absolute timestamptz := v_now + interval '2 hours';
begin
  if p_token_hash !~ '^[0-9a-f]{64}$'
    or p_csrf_hash !~ '^[0-9a-f]{64}$'
    or p_auth_method not in ('passphrase+passkey', 'break-glass')
    or length(p_passphrase_fingerprint) < 16 then
    raise exception 'Invalid session input' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('private.admin_sessions'));
  update private.admin_sessions
  set revoked_at = v_now,
      revoke_reason = 'expired'
  where revoked_at is null
    and (idle_expires_at <= v_now or absolute_expires_at <= v_now);

  insert into private.admin_sessions (
    token_hash, csrf_hash, actor, auth_method, passphrase_fingerprint,
    idle_expires_at, absolute_expires_at
  ) values (
    p_token_hash, p_csrf_hash, p_actor, p_auth_method,
    p_passphrase_fingerprint, v_idle, v_absolute
  ) returning id into v_id;

  update private.admin_sessions
  set revoked_at = v_now,
      revoke_reason = 'max_sessions'
  where id in (
    select id from private.admin_sessions
    where revoked_at is null
    order by created_at desc, id desc
    offset 2
  );

  return jsonb_build_object(
    'sessionId', v_id,
    'actor', p_actor,
    'idleExpiresAt', v_idle,
    'absoluteExpiresAt', v_absolute
  );
end;
$$;

create or replace function public.admin_auth_rotate_session(
  p_current_token_hash text,
  p_next_token_hash text,
  p_csrf_hash text,
  p_actor text,
  p_auth_method text,
  p_passphrase_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_current private.admin_sessions%rowtype;
  v_id uuid;
  v_idle timestamptz;
begin
  if p_current_token_hash !~ '^[0-9a-f]{64}$'
    or p_next_token_hash !~ '^[0-9a-f]{64}$'
    or p_next_token_hash = p_current_token_hash
    or p_csrf_hash !~ '^[0-9a-f]{64}$'
    or p_auth_method <> 'passphrase+passkey'
    or length(p_passphrase_fingerprint) < 16 then
    raise exception 'Invalid session rotation input' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('private.admin_sessions'));
  select * into v_current
  from private.admin_sessions
  where token_hash = p_current_token_hash
  for update;
  if v_current.id is null
    or v_current.revoked_at is not null
    or v_current.idle_expires_at <= v_now
    or v_current.absolute_expires_at <= v_now
    or v_current.actor <> p_actor
    or v_current.auth_method <> p_auth_method
    or v_current.passphrase_fingerprint <> p_passphrase_fingerprint then
    raise exception 'Active admin session required' using errcode = '28000';
  end if;

  v_idle := least(v_now + interval '10 minutes', v_current.absolute_expires_at);
  update private.admin_sessions
  set revoked_at = v_now,
      revoke_reason = 'privilege_elevation'
  where id = v_current.id;

  insert into private.admin_sessions (
    token_hash, csrf_hash, actor, auth_method, passphrase_fingerprint,
    idle_expires_at, absolute_expires_at
  ) values (
    p_next_token_hash, p_csrf_hash, p_actor, p_auth_method,
    p_passphrase_fingerprint, v_idle, v_current.absolute_expires_at
  ) returning id into v_id;

  update private.admin_sessions
  set revoked_at = v_now,
      revoke_reason = 'max_sessions'
  where id in (
    select id from private.admin_sessions
    where revoked_at is null
    order by created_at desc, id desc
    offset 2
  );

  return jsonb_build_object(
    'sessionId', v_id,
    'actor', p_actor,
    'idleExpiresAt', v_idle,
    'absoluteExpiresAt', v_current.absolute_expires_at
  );
end;
$$;

create or replace function public.admin_auth_revoke_session(
  p_token_hash text,
  p_reason text default 'logout'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid session revoke input' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('private.admin_sessions'));
  update private.admin_sessions
  set revoked_at = coalesce(revoked_at, clock_timestamp()),
      revoke_reason = coalesce(revoke_reason, nullif(btrim(p_reason), ''), 'logout')
  where token_hash = p_token_hash;
  return found;
end;
$$;

create or replace function public.admin_auth_revoke_all_sessions(
  p_reason text default 'security_incident'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('private.admin_sessions'));
  update private.admin_sessions
  set revoked_at = clock_timestamp(),
      revoke_reason = coalesce(nullif(btrim(p_reason), ''), 'security_incident')
  where revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
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
  v_schema_version constant text := '20260712122000';
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
  select * into v_head
  from private.admin_audit_chain_heads
  where chain_key = 'admin'
  for update;
  if v_head.chain_key is null then
    raise exception 'admin audit chain head is unavailable' using errcode = '55000';
  end if;
  v_sequence := v_head.sequence + 1;
  v_previous_hash := v_head.event_hash;

  select coalesce(s.auth_method, 'signed-bff') into v_auth_method
  from private.admin_sessions s
  where s.token_hash = p_session_hash
  limit 1;

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
    authentication_method, risk, action, target_type, target_hash,
    preview_hash, before_state, after_state, result, error_code, request_id,
    operation_id, incident_id, edge_version, schema_version
  ) values (
    v_id, v_sequence, v_previous_hash, v_event_hash, v_occurred_at, p_actor_hash, p_session_hash,
    coalesce(v_auth_method, 'signed-bff'), p_risk, p_action, p_target_type, p_target_hash,
    p_preview_hash, p_before_state, p_after_state, p_result, p_error_code, p_request_id,
    p_operation_id, p_incident_id, v_edge_version, v_schema_version
  );
  update private.admin_audit_chain_heads
  set sequence = v_sequence, event_hash = v_event_hash
  where chain_key = 'admin';
  return v_id;
end;
$$;

create or replace function public.admin_audit_record_security_event(
  p_action text,
  p_actor text,
  p_session_hash text,
  p_method text,
  p_route text,
  p_error_code text,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_bucket timestamptz := date_trunc('minute', v_now);
  v_method text := upper(coalesce(p_method, ''));
  v_route text := left(coalesce(nullif(p_route, ''), 'invalid'), 256);
  v_bucket_route text;
  v_target_hash text;
begin
  if p_actor <> 'unauthenticated'
    or p_session_hash <> 'unauthenticated'
    or p_action not in ('admin_request_denied', 'admin_signature_rejected')
    or v_method !~ '^[A-Z]{3,10}$'
    or v_route !~ '^(/api/[A-Za-z0-9_./-]*|invalid)$'
    or p_error_code !~ '^[A-Z0-9_]{3,64}$' then
    raise exception 'invalid admin security event' using errcode = '22023';
  end if;
  v_bucket_route := case when v_route = 'invalid' then 'invalid' else '/api/aggregated' end;

  insert into private.admin_security_event_buckets (
    bucket_started_at, action, method, route, error_code, sample_request_id, first_seen_at, last_seen_at
  ) values (
    v_bucket, p_action, v_method, v_bucket_route, p_error_code, p_request_id, v_now, v_now
  ) on conflict do nothing;
  if not found then
    update private.admin_security_event_buckets
    set rejection_count = rejection_count + 1,
        last_seen_at = v_now
    where bucket_started_at = v_bucket
      and action = p_action
      and method = v_method
      and route = v_bucket_route
      and error_code = p_error_code;
    return null;
  end if;

  v_target_hash := encode(extensions.digest(v_method || ':' || v_route, 'sha256'), 'hex');
  return private.append_admin_audit_v2(
    encode(extensions.digest('unauthenticated', 'sha256'), 'hex'),
    encode(extensions.digest('unauthenticated', 'sha256'), 'hex'),
    'R1', p_action, 'admin_route', v_target_hash, null, null, null,
    jsonb_build_object('blocked', true, 'method', v_method, 'route', v_route, 'sampled', true),
    p_error_code, p_request_id, null, null
  );
end;
$$;

alter table private.admin_audit_events_v2
  alter column schema_version set default '20260712122000';

create or replace function public.admin_read_runtime_contract()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'schemaVersion', '20260712122000',
    'operationContractVersion', 'admin-operation-v1',
    'auditContractVersion', 'admin-audit-v2',
    'securityEventAggregationVersion', 'admin-security-events-v1',
    'itineraryContractVersion', 'versioned-itinerary-v1',
    'receiptContractVersion', 'canonical-receipt-v1',
    'passkeyContractVersion', 'admin-passkeys-v1'
  );
$$;

alter function public.admin_auth_create_session(text, text, text, text, text) owner to admin_auth_owner;
alter function public.admin_auth_rotate_session(text, text, text, text, text, text) owner to admin_auth_owner;
alter function public.admin_auth_revoke_session(text, text) owner to admin_auth_owner;
alter function public.admin_auth_revoke_all_sessions(text) owner to admin_auth_owner;
alter function private.append_admin_audit_v2(
  text, text, text, text, text, text, text, jsonb, jsonb, jsonb, text, uuid, uuid, uuid
) owner to admin_auth_owner;
alter function public.admin_audit_record_security_event(
  text, text, text, text, text, text, uuid
) owner to admin_auth_owner;
alter function public.admin_read_runtime_contract() owner to admin_read_owner;

revoke all on table private.admin_audit_chain_heads, private.admin_security_event_buckets
  from public, anon, authenticated, service_role;
revoke all on function public.admin_auth_create_session(text, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_auth_rotate_session(text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_auth_revoke_session(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_auth_revoke_all_sessions(text)
  from public, anon, authenticated, service_role;
revoke all on function private.append_admin_audit_v2(
  text, text, text, text, text, text, text, jsonb, jsonb, jsonb, text, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.admin_audit_record_security_event(
  text, text, text, text, text, text, uuid
) from public, anon, authenticated;
revoke all on function public.admin_read_runtime_contract()
  from public, anon, authenticated;

grant execute on function public.admin_auth_create_session(text, text, text, text, text) to service_role;
grant execute on function public.admin_auth_rotate_session(text, text, text, text, text, text) to service_role;
grant execute on function public.admin_auth_revoke_session(text, text) to service_role;
grant execute on function public.admin_auth_revoke_all_sessions(text) to service_role;
grant execute on function public.admin_audit_record_security_event(
  text, text, text, text, text, text, uuid
) to service_role;
grant execute on function public.admin_read_runtime_contract() to service_role;

revoke create on schema private from admin_auth_owner;
revoke create on schema public from admin_read_owner;
revoke admin_auth_owner from postgres;
revoke admin_read_owner from postgres;

commit;
