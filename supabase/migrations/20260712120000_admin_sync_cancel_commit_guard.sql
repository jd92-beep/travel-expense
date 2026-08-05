-- A claimed Notion job may already have produced an external side effect.
-- Keep the database commit guard aligned with the preview guard: only pending
-- jobs can be cancelled by an administrator.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

grant admin_auth_owner to postgres;
grant usage, create on schema public to admin_auth_owner;

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
    if v_job.status <> 'pending' then
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

alter function public.admin_operation_commit_sync_job(uuid, text, text, uuid)
  owner to admin_auth_owner;
revoke all on function public.admin_operation_commit_sync_job(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_operation_commit_sync_job(uuid, text, text, uuid)
  to service_role;

revoke create on schema public from admin_auth_owner;
revoke admin_auth_owner from postgres;

commit;
