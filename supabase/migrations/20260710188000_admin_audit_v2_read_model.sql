-- Move the production audit workspace to the private tamper-evident chain.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

grant admin_auth_owner to postgres;
grant admin_read_owner to postgres;
grant usage, create on schema public to admin_read_owner;

grant select on private.admin_audit_events_v2 to admin_read_owner;

set role admin_auth_owner;
drop policy if exists admin_read_owner_audit_v2 on private.admin_audit_events_v2;
create policy admin_read_owner_audit_v2
  on private.admin_audit_events_v2 for select to admin_read_owner
  using (true);
reset role;

drop function if exists public.admin_read_audit(
  integer, timestamptz, uuid, text, text, text, timestamptz, timestamptz
);

create function public.admin_read_audit(
  p_limit integer default 51,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_action text default null,
  p_target_type text default null,
  p_request_id text default null,
  p_risk text default null,
  p_result text default null,
  p_start_at timestamptz default null,
  p_end_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_result jsonb;
begin
  if p_limit < 1 or p_limit > 201
    or (p_cursor_created_at is null) <> (p_cursor_id is null)
    or length(coalesce(p_action, '')) > 80
    or length(coalesce(p_target_type, '')) > 80
    or length(coalesce(p_request_id, '')) > 80
    or coalesce(p_risk, '') not in ('', 'R0', 'R1', 'R2', 'R3')
    or coalesce(p_result, '') not in ('', 'succeeded', 'failed')
    or (p_start_at is not null and p_end_at is not null and p_start_at > p_end_at) then
    raise exception 'Invalid audit read parameters';
  end if;

  with filtered as materialized (
    select
      id,
      sequence,
      previous_event_hash,
      event_hash,
      actor_hash as admin_subject_hash,
      session_hash,
      authentication_method,
      risk,
      action,
      target_type,
      target_hash as target_id_hash,
      request_id::text as request_id,
      jsonb_build_object('previewHash', preview_hash) as preview_counts,
      preview_hash,
      before_state,
      after_state,
      coalesce(result, '{}'::jsonb) || jsonb_build_object(
        'ok', error_code is null,
        'errorCode', error_code
      ) as result,
      error_code,
      operation_id,
      incident_id,
      frontend_version,
      edge_version,
      schema_version,
      occurred_at as created_at
    from private.admin_audit_events_v2
    where (nullif(p_action, '') is null or action = p_action)
      and (nullif(p_target_type, '') is null or target_type = p_target_type)
      and (nullif(p_request_id, '') is null or request_id::text = p_request_id)
      and (nullif(p_risk, '') is null or risk = p_risk)
      and (
        nullif(p_result, '') is null
        or (p_result = 'succeeded' and error_code is null)
        or (p_result = 'failed' and error_code is not null)
      )
      and (p_start_at is null or occurred_at >= p_start_at)
      and (p_end_at is null or occurred_at <= p_end_at)
  ), page_rows as (
    select * from filtered
    where p_cursor_created_at is null
      or (created_at, id) < (p_cursor_created_at, p_cursor_id)
    order by created_at desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(page_rows) order by created_at desc, id desc)
      from page_rows
    ), '[]'::jsonb),
    'total', (select count(*) from filtered)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.admin_read_audit_event(p_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'id', event.id,
    'sequence', event.sequence,
    'previous_event_hash', event.previous_event_hash,
    'event_hash', event.event_hash,
    'admin_subject_hash', event.actor_hash,
    'session_hash', event.session_hash,
    'authentication_method', event.authentication_method,
    'risk', event.risk,
    'action', event.action,
    'target_type', event.target_type,
    'target_id_hash', event.target_hash,
    'request_id', event.request_id::text,
    'preview_counts', jsonb_build_object('previewHash', event.preview_hash),
    'preview_hash', event.preview_hash,
    'before_state', event.before_state,
    'after_state', event.after_state,
    'result', coalesce(event.result, '{}'::jsonb) || jsonb_build_object(
      'ok', event.error_code is null,
      'errorCode', event.error_code
    ),
    'error_code', event.error_code,
    'operation_id', event.operation_id,
    'incident_id', event.incident_id,
    'frontend_version', event.frontend_version,
    'edge_version', event.edge_version,
    'schema_version', event.schema_version,
    'created_at', event.occurred_at
  )
  from private.admin_audit_events_v2 event
  where event.id = p_id;
$$;

alter function public.admin_read_audit(integer, timestamptz, uuid, text, text, text, text, text, timestamptz, timestamptz)
  owner to admin_read_owner;
alter function public.admin_read_audit_event(uuid) owner to admin_read_owner;

revoke all on function public.admin_read_audit(integer, timestamptz, uuid, text, text, text, text, text, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke all on function public.admin_read_audit_event(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_read_audit(integer, timestamptz, uuid, text, text, text, text, text, timestamptz, timestamptz)
  to service_role;
grant execute on function public.admin_read_audit_event(uuid) to service_role;

revoke create on schema public from admin_read_owner;
revoke admin_read_owner from postgres;
revoke admin_auth_owner from postgres;

commit;
