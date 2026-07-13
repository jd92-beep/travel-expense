-- Admin 1.0 operation state, append-only audit, and private receipt photos.
-- Browser roles never receive table access; the signed Edge runtime uses the
-- fixed service-role RPCs below.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

grant admin_auth_owner to postgres;
grant usage, create on schema private to admin_auth_owner;
grant usage, create on schema public to admin_auth_owner;
grant usage on schema extensions to admin_auth_owner;

update storage.buckets
set public = false
where id = 'receipt-photos';

drop policy if exists "receipt_photos_public_read" on storage.objects;
drop policy if exists "receipt_photos_read_own" on storage.objects;
create policy "receipt_photos_read_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'receipt-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create table if not exists private.admin_operations (
  id uuid primary key,
  idempotency_key uuid not null unique,
  session_hash text not null,
  actor_hash text not null,
  action text not null,
  risk text not null,
  target_type text not null,
  target_ref text not null,
  target_hash text not null,
  target_version text,
  payload jsonb not null default '{}'::jsonb,
  payload_hash text not null,
  preview jsonb not null,
  preview_hash text not null,
  status text not null default 'previewed',
  request_id uuid not null,
  result jsonb,
  error_code text,
  error_message text,
  preview_expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint admin_operations_session_hash_check check (session_hash ~ '^[0-9a-f]{64}$'),
  constraint admin_operations_actor_hash_check check (actor_hash ~ '^[0-9a-f]{64}$'),
  constraint admin_operations_action_check check (
    action in ('provider_probe', 'support_bundle', 'retry_sync_job', 'cancel_sync_job')
  ),
  constraint admin_operations_risk_check check (risk in ('R1', 'R2', 'R3')),
  constraint admin_operations_target_type_check check (target_type ~ '^[a-z0-9_]{1,64}$'),
  constraint admin_operations_target_hash_check check (target_hash ~ '^[0-9a-f]{64}$'),
  constraint admin_operations_payload_hash_check check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint admin_operations_preview_hash_check check (preview_hash ~ '^[0-9a-f]{64}$'),
  constraint admin_operations_status_check check (
    status in (
      'previewed', 'authorized', 'queued', 'executing', 'compensating',
      'completed', 'partially_failed', 'failed', 'failed_manual',
      'outcome_unknown', 'cancelled', 'expired'
    )
  )
);

create index if not exists admin_operations_status_updated_idx
  on private.admin_operations (status, updated_at desc, id desc);
create index if not exists admin_operations_created_idx
  on private.admin_operations (created_at desc, id desc);

create table if not exists private.admin_operation_steps (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references private.admin_operations(id) on delete cascade,
  step_key text not null,
  idempotency_key text not null,
  status text not null,
  attempts integer not null default 0,
  verified_result jsonb,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (operation_id, step_key),
  unique (idempotency_key),
  constraint admin_operation_steps_key_check check (step_key ~ '^[a-z0-9_]{1,64}$'),
  constraint admin_operation_steps_status_check check (
    status in ('queued', 'executing', 'completed', 'failed', 'outcome_unknown', 'cancelled')
  ),
  constraint admin_operation_steps_attempts_check check (attempts >= 0)
);

create index if not exists admin_operation_steps_operation_idx
  on private.admin_operation_steps (operation_id, created_at, id);

create table if not exists private.admin_audit_events_v2 (
  id uuid primary key default gen_random_uuid(),
  sequence bigint not null unique,
  previous_event_hash text not null,
  event_hash text not null unique,
  occurred_at timestamptz not null default clock_timestamp(),
  actor_hash text not null,
  session_hash text not null,
  authentication_method text not null,
  risk text not null,
  action text not null,
  target_type text not null,
  target_hash text not null,
  preview_hash text,
  before_state jsonb,
  after_state jsonb,
  result jsonb,
  error_code text,
  request_id uuid not null,
  operation_id uuid,
  incident_id uuid,
  frontend_version text,
  edge_version text,
  schema_version text not null default '20260710187000',
  constraint admin_audit_v2_previous_hash_check check (previous_event_hash ~ '^[0-9a-f]{64}$'),
  constraint admin_audit_v2_event_hash_check check (event_hash ~ '^[0-9a-f]{64}$'),
  constraint admin_audit_v2_actor_hash_check check (actor_hash ~ '^[0-9a-f]{64}$'),
  constraint admin_audit_v2_session_hash_check check (session_hash ~ '^[0-9a-f]{64}$'),
  constraint admin_audit_v2_risk_check check (risk in ('R0', 'R1', 'R2', 'R3')),
  constraint admin_audit_v2_target_hash_check check (target_hash ~ '^[0-9a-f]{64}$'),
  constraint admin_audit_v2_preview_hash_check check (
    preview_hash is null or preview_hash ~ '^[0-9a-f]{64}$'
  )
);

create index if not exists admin_audit_events_v2_occurred_idx
  on private.admin_audit_events_v2 (occurred_at desc, id desc);
create index if not exists admin_audit_events_v2_operation_idx
  on private.admin_audit_events_v2 (operation_id, sequence);

alter table private.admin_operations owner to admin_auth_owner;
alter table private.admin_operation_steps owner to admin_auth_owner;
alter table private.admin_audit_events_v2 owner to admin_auth_owner;

alter table private.admin_operations enable row level security;
alter table private.admin_operations force row level security;
alter table private.admin_operation_steps enable row level security;
alter table private.admin_operation_steps force row level security;
alter table private.admin_audit_events_v2 enable row level security;
alter table private.admin_audit_events_v2 force row level security;

create policy admin_auth_owner_operations on private.admin_operations
  for all to admin_auth_owner using (true) with check (true);
create policy admin_auth_owner_operation_steps on private.admin_operation_steps
  for all to admin_auth_owner using (true) with check (true);
create policy admin_auth_owner_audit_v2 on private.admin_audit_events_v2
  for insert to admin_auth_owner with check (true);
create policy admin_auth_owner_audit_v2_select on private.admin_audit_events_v2
  for select to admin_auth_owner using (true);

grant select, update on public.receipt_sync_jobs to admin_auth_owner;
grant select, update on public.receipts to admin_auth_owner;

drop policy if exists admin_auth_owner_receipt_sync_jobs on public.receipt_sync_jobs;
create policy admin_auth_owner_receipt_sync_jobs
  on public.receipt_sync_jobs for all to admin_auth_owner
  using (true) with check (true);

drop policy if exists admin_auth_owner_receipts on public.receipts;
create policy admin_auth_owner_receipts
  on public.receipts for select to admin_auth_owner
  using (true);
drop policy if exists admin_auth_owner_receipts_update on public.receipts;
create policy admin_auth_owner_receipts_update
  on public.receipts for update to admin_auth_owner
  using (true) with check (true);

create or replace function private.reject_admin_audit_v2_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'admin audit history is append-only' using errcode = '42501';
end;
$$;

drop trigger if exists admin_audit_events_v2_append_only on private.admin_audit_events_v2;
create trigger admin_audit_events_v2_append_only
before update or delete on private.admin_audit_events_v2
for each row execute function private.reject_admin_audit_v2_mutation();

create or replace function private.admin_operation_json(
  p_operation private.admin_operations
)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'id', p_operation.id,
    'idempotencyKey', p_operation.idempotency_key,
    'action', p_operation.action,
    'risk', p_operation.risk,
    'targetType', p_operation.target_type,
    'targetHash', p_operation.target_hash,
    'targetVersion', p_operation.target_version,
    'previewHash', p_operation.preview_hash,
    'status', case
      when p_operation.status = 'previewed'
        and p_operation.preview_expires_at <= clock_timestamp() then 'expired'
      else p_operation.status
    end,
    'preview', p_operation.preview,
    'result', p_operation.result,
    'error', case when p_operation.error_code is null then null else jsonb_build_object(
      'code', p_operation.error_code,
      'message', p_operation.error_message
    ) end,
    'requestId', p_operation.request_id,
    'previewExpiresAt', p_operation.preview_expires_at,
    'createdAt', p_operation.created_at,
    'updatedAt', p_operation.updated_at,
    'startedAt', p_operation.started_at,
    'completedAt', p_operation.completed_at
  );
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
  v_sequence bigint;
  v_previous_hash text;
  v_event_hash text;
  v_auth_method text;
  v_payload jsonb;
  v_occurred_at timestamptz := clock_timestamp();
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
    'schemaVersion', '20260710187000'
  );
  v_event_hash := encode(
    extensions.digest(v_previous_hash || v_payload::text, 'sha256'),
    'hex'
  );

  insert into private.admin_audit_events_v2 (
    id, sequence, previous_event_hash, event_hash, occurred_at, actor_hash, session_hash,
    authentication_method, risk, action, target_type, target_hash,
    preview_hash, before_state, after_state, result, error_code, request_id,
    operation_id, incident_id
  ) values (
    v_id, v_sequence, v_previous_hash, v_event_hash, v_occurred_at, p_actor_hash, p_session_hash,
    coalesce(v_auth_method, 'signed-bff'), p_risk, p_action, p_target_type,
    p_target_hash, p_preview_hash, p_before_state, p_after_state, p_result,
    p_error_code, p_request_id, p_operation_id, p_incident_id
  );
  return v_id;
end;
$$;

create or replace function public.admin_operation_preview_create(
  p_id uuid,
  p_idempotency_key uuid,
  p_session_hash text,
  p_actor text,
  p_action text,
  p_risk text,
  p_target_type text,
  p_target_ref text,
  p_target_hash text,
  p_target_version text,
  p_payload jsonb,
  p_payload_hash text,
  p_preview jsonb,
  p_preview_hash text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_hash text := encode(extensions.digest(coalesce(p_actor, ''), 'sha256'), 'hex');
  v_existing private.admin_operations%rowtype;
  v_operation private.admin_operations%rowtype;
begin
  if p_session_hash !~ '^[0-9a-f]{64}$'
    or p_target_hash !~ '^[0-9a-f]{64}$'
    or p_payload_hash !~ '^[0-9a-f]{64}$'
    or p_preview_hash !~ '^[0-9a-f]{64}$'
    or p_action not in ('provider_probe', 'support_bundle', 'retry_sync_job', 'cancel_sync_job')
    or p_risk <> 'R1'
    or p_target_type !~ '^[a-z0-9_]{1,64}$'
    or length(p_target_ref) < 1
    or length(p_target_ref) > 256 then
    raise exception 'invalid admin operation preview' using errcode = '22023';
  end if;

  if not exists (
    select 1 from private.admin_sessions s
    where s.token_hash = p_session_hash
      and s.revoked_at is null
      and s.idle_expires_at > clock_timestamp()
      and s.absolute_expires_at > clock_timestamp()
  ) then
    raise exception 'active admin session required' using errcode = '28000';
  end if;

  select * into v_existing
  from private.admin_operations
  where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.session_hash <> p_session_hash
      or v_existing.actor_hash <> v_actor_hash
      or v_existing.action <> p_action
      or v_existing.target_hash <> p_target_hash
      or v_existing.payload_hash <> p_payload_hash then
      raise exception 'idempotency key payload mismatch' using errcode = '23505';
    end if;
    return private.admin_operation_json(v_existing);
  end if;

  insert into private.admin_operations (
    id, idempotency_key, session_hash, actor_hash, action, risk,
    target_type, target_ref, target_hash, target_version, payload,
    payload_hash, preview, preview_hash, request_id, preview_expires_at
  ) values (
    p_id, p_idempotency_key, p_session_hash, v_actor_hash, p_action, p_risk,
    p_target_type, p_target_ref, p_target_hash, p_target_version,
    coalesce(p_payload, '{}'::jsonb), p_payload_hash,
    coalesce(p_preview, '{}'::jsonb), p_preview_hash, p_request_id,
    clock_timestamp() + interval '5 minutes'
  ) returning * into v_operation;

  perform private.append_admin_audit_v2(
    v_actor_hash, p_session_hash, p_risk, 'operation_previewed', p_target_type,
    p_target_hash, p_preview_hash, null, p_preview,
    jsonb_build_object('action', p_action), null, p_request_id, p_id, null
  );
  return private.admin_operation_json(v_operation);
end;
$$;

create or replace function public.admin_operation_get(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_operation private.admin_operations%rowtype;
begin
  select * into v_operation from private.admin_operations where id = p_id;
  if not found then return null; end if;
  return private.admin_operation_json(v_operation);
end;
$$;

create or replace function public.admin_operation_list(
  p_status text default 'active',
  p_limit integer default 20
)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(jsonb_agg(private.admin_operation_json(row_data) order by row_data.updated_at desc, row_data.id desc), '[]'::jsonb)
  from (
    select *
    from private.admin_operations o
    where case p_status
      when 'active' then o.status in ('previewed', 'authorized', 'queued', 'executing', 'compensating', 'outcome_unknown')
      when 'terminal' then o.status in ('completed', 'partially_failed', 'failed', 'failed_manual', 'cancelled', 'expired')
      when 'all' then true
      else false
    end
    order by o.updated_at desc, o.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) row_data;
$$;

create or replace function public.admin_operation_begin_external(
  p_id uuid,
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
  v_operation private.admin_operations%rowtype;
  v_actor_hash text := encode(extensions.digest(coalesce(p_actor, ''), 'sha256'), 'hex');
begin
  select * into v_operation
  from private.admin_operations where id = p_id for update;
  if not found then raise exception 'operation not found' using errcode = 'P0002'; end if;
  if v_operation.status = 'completed' then
    return jsonb_build_object('operation', private.admin_operation_json(v_operation), 'reused', true);
  end if;
  if v_operation.action not in ('provider_probe', 'support_bundle')
    or v_operation.status <> 'previewed'
    or v_operation.preview_expires_at <= clock_timestamp()
    or v_operation.session_hash <> p_session_hash
    or v_operation.actor_hash <> v_actor_hash then
    raise exception 'operation cannot be executed' using errcode = '55000';
  end if;

  update private.admin_operations
  set status = 'executing', started_at = clock_timestamp(), updated_at = clock_timestamp(),
      request_id = p_request_id
  where id = p_id
  returning * into v_operation;

  insert into private.admin_operation_steps (
    operation_id, step_key, idempotency_key, status, attempts, started_at
  ) values (
    p_id, 'execute', p_id::text || ':execute', 'executing', 1, clock_timestamp()
  ) on conflict (operation_id, step_key) do update
    set status = 'executing', attempts = private.admin_operation_steps.attempts + 1,
        started_at = clock_timestamp(), updated_at = clock_timestamp();

  perform private.append_admin_audit_v2(
    v_operation.actor_hash, p_session_hash, v_operation.risk, 'operation_executing',
    v_operation.target_type, v_operation.target_hash, v_operation.preview_hash,
    jsonb_build_object('status', 'previewed'), jsonb_build_object('status', 'executing'),
    jsonb_build_object('action', v_operation.action), null, p_request_id, p_id, null
  );
  return jsonb_build_object(
    'operation', private.admin_operation_json(v_operation),
    'action', v_operation.action,
    'targetRef', v_operation.target_ref,
    'payload', v_operation.payload,
    'reused', false
  );
end;
$$;

create or replace function public.admin_operation_finish_external(
  p_id uuid,
  p_status text,
  p_result jsonb,
  p_error_code text,
  p_error_message text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operation private.admin_operations%rowtype;
begin
  if p_status not in ('completed', 'failed', 'outcome_unknown') then
    raise exception 'invalid external operation result' using errcode = '22023';
  end if;
  select * into v_operation
  from private.admin_operations where id = p_id for update;
  if not found then raise exception 'operation not found' using errcode = 'P0002'; end if;
  if v_operation.status in ('completed', 'failed', 'outcome_unknown') then
    return private.admin_operation_json(v_operation);
  end if;
  if v_operation.status <> 'executing' then
    raise exception 'operation is not executing' using errcode = '55000';
  end if;

  update private.admin_operations
  set status = p_status,
      result = case when p_status = 'completed' then coalesce(p_result, '{}'::jsonb) else p_result end,
      error_code = nullif(left(coalesce(p_error_code, ''), 64), ''),
      error_message = nullif(left(coalesce(p_error_message, ''), 500), ''),
      completed_at = clock_timestamp(), updated_at = clock_timestamp(), request_id = p_request_id
  where id = p_id
  returning * into v_operation;

  update private.admin_operation_steps
  set status = p_status, verified_result = p_result,
      error_code = v_operation.error_code, error_message = v_operation.error_message,
      completed_at = clock_timestamp(), updated_at = clock_timestamp()
  where operation_id = p_id and step_key = 'execute';

  perform private.append_admin_audit_v2(
    v_operation.actor_hash, v_operation.session_hash, v_operation.risk,
    case when p_status = 'completed' then 'operation_completed' else 'operation_failed' end,
    v_operation.target_type, v_operation.target_hash, v_operation.preview_hash,
    jsonb_build_object('status', 'executing'), jsonb_build_object('status', p_status),
    p_result, v_operation.error_code, p_request_id, p_id, null
  );
  return private.admin_operation_json(v_operation);
end;
$$;

create or replace function public.admin_operation_commit_sync_job(
  p_id uuid,
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
  v_operation private.admin_operations%rowtype;
  v_job public.receipt_sync_jobs%rowtype;
  v_actor_hash text := encode(extensions.digest(coalesce(p_actor, ''), 'sha256'), 'hex');
  v_before jsonb;
  v_after jsonb;
begin
  select * into v_operation
  from private.admin_operations where id = p_id for update;
  if not found then raise exception 'operation not found' using errcode = 'P0002'; end if;
  if v_operation.status = 'completed' then return private.admin_operation_json(v_operation); end if;
  if v_operation.action not in ('retry_sync_job', 'cancel_sync_job')
    or v_operation.status <> 'previewed'
    or v_operation.preview_expires_at <= clock_timestamp()
    or v_operation.session_hash <> p_session_hash
    or v_operation.actor_hash <> v_actor_hash then
    raise exception 'operation cannot be committed' using errcode = '55000';
  end if;

  select * into v_job
  from public.receipt_sync_jobs
  where id::text = v_operation.target_ref
  for update;
  if not found then raise exception 'sync job not found' using errcode = 'P0002'; end if;
  if v_operation.target_version is null
    or v_job.updated_at is distinct from v_operation.target_version::timestamptz then
    raise exception 'PREVIEW_STALE' using errcode = '40001';
  end if;

  v_before := jsonb_build_object(
    'status', v_job.status, 'attempts', v_job.attempts,
    'nextAttemptAt', v_job.next_attempt_at, 'updatedAt', v_job.updated_at
  );
  if v_operation.action = 'retry_sync_job' then
    if v_job.status not in ('failed', 'cancelled') then
      raise exception 'sync job is not eligible for retry' using errcode = '23514';
    end if;
    update public.receipt_sync_jobs
    set status = 'pending', next_attempt_at = clock_timestamp(), locked_at = null,
        locked_by = null, last_error = null, updated_at = clock_timestamp()
    where id = v_job.id returning * into v_job;
    update public.receipts
    set notion_sync_status = 'pending', notion_sync_error = null,
        notion_last_queued_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = v_job.receipt_id;
  else
    if v_job.status not in ('pending', 'processing') then
      raise exception 'sync job is not eligible for cancellation' using errcode = '23514';
    end if;
    update public.receipt_sync_jobs
    set status = 'cancelled', locked_at = null, locked_by = null,
        last_error = 'Cancelled by admin', updated_at = clock_timestamp()
    where id = v_job.id returning * into v_job;
    update public.receipts
    set notion_sync_status = 'failed', notion_sync_error = 'Cancelled by admin',
        updated_at = clock_timestamp()
    where id = v_job.receipt_id;
  end if;

  v_after := jsonb_build_object(
    'status', v_job.status, 'attempts', v_job.attempts,
    'nextAttemptAt', v_job.next_attempt_at, 'updatedAt', v_job.updated_at
  );
  update private.admin_operations
  set status = 'completed', started_at = clock_timestamp(), completed_at = clock_timestamp(),
      updated_at = clock_timestamp(), request_id = p_request_id,
      result = jsonb_build_object('jobIdHash', v_operation.target_hash, 'status', v_job.status)
  where id = p_id returning * into v_operation;

  insert into private.admin_operation_steps (
    operation_id, step_key, idempotency_key, status, attempts,
    verified_result, started_at, completed_at
  ) values (
    p_id, 'database', p_id::text || ':database', 'completed', 1,
    v_after, clock_timestamp(), clock_timestamp()
  );

  perform private.append_admin_audit_v2(
    v_operation.actor_hash, p_session_hash, v_operation.risk, 'operation_completed',
    v_operation.target_type, v_operation.target_hash, v_operation.preview_hash,
    v_before, v_after, v_operation.result, null, p_request_id, p_id, null
  );
  return private.admin_operation_json(v_operation);
end;
$$;

create or replace function public.admin_audit_record_photo_view(
  p_session_hash text,
  p_actor text,
  p_receipt_hash text,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_hash text := encode(extensions.digest(coalesce(p_actor, ''), 'sha256'), 'hex');
begin
  if p_receipt_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid receipt hash' using errcode = '22023';
  end if;
  return private.append_admin_audit_v2(
    v_actor_hash, p_session_hash, 'R0', 'view_receipt_photo', 'receipt',
    p_receipt_hash, null, null, null, jsonb_build_object('viewed', true),
    null, p_request_id, null, null
  );
end;
$$;

alter function private.reject_admin_audit_v2_mutation() owner to admin_auth_owner;
alter function private.admin_operation_json(private.admin_operations) owner to admin_auth_owner;
alter function private.append_admin_audit_v2(text, text, text, text, text, text, text, jsonb, jsonb, jsonb, text, uuid, uuid, uuid) owner to admin_auth_owner;
alter function public.admin_operation_preview_create(uuid, uuid, text, text, text, text, text, text, text, text, jsonb, text, jsonb, text, uuid) owner to admin_auth_owner;
alter function public.admin_operation_get(uuid) owner to admin_auth_owner;
alter function public.admin_operation_list(text, integer) owner to admin_auth_owner;
alter function public.admin_operation_begin_external(uuid, text, text, uuid) owner to admin_auth_owner;
alter function public.admin_operation_finish_external(uuid, text, jsonb, text, text, uuid) owner to admin_auth_owner;
alter function public.admin_operation_commit_sync_job(uuid, text, text, uuid) owner to admin_auth_owner;
alter function public.admin_audit_record_photo_view(text, text, text, uuid) owner to admin_auth_owner;

revoke all privileges on table
  private.admin_operations,
  private.admin_operation_steps,
  private.admin_audit_events_v2
from public, anon, authenticated, service_role;

revoke all privileges on function private.reject_admin_audit_v2_mutation() from public, anon, authenticated, service_role;
revoke all privileges on function private.admin_operation_json(private.admin_operations) from public, anon, authenticated, service_role;
revoke all privileges on function private.append_admin_audit_v2(text, text, text, text, text, text, text, jsonb, jsonb, jsonb, text, uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_operation_preview_create(uuid, uuid, text, text, text, text, text, text, text, text, jsonb, text, jsonb, text, uuid) from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_operation_get(uuid) from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_operation_list(text, integer) from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_operation_begin_external(uuid, text, text, uuid) from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_operation_finish_external(uuid, text, jsonb, text, text, uuid) from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_operation_commit_sync_job(uuid, text, text, uuid) from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_audit_record_photo_view(text, text, text, uuid) from public, anon, authenticated, service_role;

grant execute on function public.admin_operation_preview_create(uuid, uuid, text, text, text, text, text, text, text, text, jsonb, text, jsonb, text, uuid) to service_role;
grant execute on function public.admin_operation_get(uuid) to service_role;
grant execute on function public.admin_operation_list(text, integer) to service_role;
grant execute on function public.admin_operation_begin_external(uuid, text, text, uuid) to service_role;
grant execute on function public.admin_operation_finish_external(uuid, text, jsonb, text, text, uuid) to service_role;
grant execute on function public.admin_operation_commit_sync_job(uuid, text, text, uuid) to service_role;
grant execute on function public.admin_audit_record_photo_view(text, text, text, uuid) to service_role;

revoke create on schema private from admin_auth_owner;
revoke create on schema public from admin_auth_owner;
revoke admin_auth_owner from postgres;

commit;
