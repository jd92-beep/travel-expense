-- Reliability, reconciliation, audit, and bounded global-search read models.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.admin_read_incidents(
  p_limit integer default 51,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_severity text default null,
  p_status text default null
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
    or coalesce(p_severity, 'all') not in ('all', 'P0', 'P1', 'P2', 'P3')
    or coalesce(p_status, 'all') not in ('all', 'open', 'acknowledged', 'resolved') then
    raise exception 'Invalid incident read parameters';
  end if;

  with filtered as materialized (
    select id, severity, kind, status, title, created_at, resolved_at
    from private.admin_incidents
    where (coalesce(p_severity, 'all') = 'all' or severity = p_severity)
      and (coalesce(p_status, 'all') = 'all' or status = p_status)
  ), page_rows as (
    select * from filtered
    where p_cursor_created_at is null
      or (created_at, id) < (p_cursor_created_at, p_cursor_id)
    order by created_at desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(page_rows) order by created_at desc, id desc) from page_rows), '[]'::jsonb),
    'total', (select count(*) from filtered)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.admin_read_sync_jobs(
  p_limit integer default 51,
  p_cursor_updated_at timestamptz default null,
  p_cursor_id uuid default null,
  p_status text default null,
  p_provider text default null,
  p_user_id uuid default null
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
    or (p_cursor_updated_at is null) <> (p_cursor_id is null)
    or length(coalesce(p_status, '')) > 40
    or length(coalesce(p_provider, '')) > 40 then
    raise exception 'Invalid sync read parameters';
  end if;

  with filtered as materialized (
    select
      j.id,
      j.receipt_id,
      j.trip_id,
      j.owner_id,
      private.admin_mask_email(u.email) as owner_masked_email,
      j.provider,
      j.operation,
      j.status,
      j.attempts,
      j.next_attempt_at,
      j.last_error,
      j.created_at,
      j.updated_at
    from public.receipt_sync_jobs j
    left join private.admin_auth_user_rows() u on u.id = j.owner_id
    where (nullif(p_status, '') is null or j.status = p_status)
      and (nullif(p_provider, '') is null or j.provider = p_provider)
      and (p_user_id is null or j.owner_id = p_user_id)
  ), page_rows as (
    select * from filtered
    where p_cursor_updated_at is null
      or (updated_at, id) < (p_cursor_updated_at, p_cursor_id)
    order by updated_at desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(page_rows) order by updated_at desc, id desc) from page_rows), '[]'::jsonb),
    'total', (select count(*) from filtered)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.admin_read_integrity(
  p_limit integer default 51,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_severity text default null,
  p_finding_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_result jsonb;
  v_run public.data_quality_runs%rowtype;
begin
  if p_limit < 1 or p_limit > 201
    or (p_cursor_created_at is null) <> (p_cursor_id is null)
    or coalesce(p_severity, 'all') not in ('all', 'high', 'medium', 'low')
    or length(coalesce(p_finding_type, '')) > 80 then
    raise exception 'Invalid integrity read parameters';
  end if;

  select * into v_run
  from public.data_quality_runs
  order by started_at desc, id desc
  limit 1;

  if v_run.id is null then
    return jsonb_build_object('run', null, 'state', 'never_run', 'items', '[]'::jsonb, 'total', 0);
  end if;

  with source_rows as materialized (
    select
      id,
      run_id,
      case severity
        when 'danger' then 'high'
        when 'warning' then 'medium'
        else 'low'
      end as severity,
      finding_type,
      entity_type,
      entity_id,
      detail,
      created_at
    from public.data_quality_findings
    where run_id = v_run.id
  ), filtered as materialized (
    select *
    from source_rows
    where (coalesce(p_severity, 'all') = 'all' or severity = p_severity)
      and (nullif(p_finding_type, '') is null or finding_type = p_finding_type)
  ), page_rows as (
    select * from filtered
    where p_cursor_created_at is null
      or (created_at, id) < (p_cursor_created_at, p_cursor_id)
    order by created_at desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'run', jsonb_build_object(
      'id', v_run.id,
      'source', v_run.source,
      'status', v_run.status,
      'summary', v_run.summary,
      'startedAt', v_run.started_at,
      'completedAt', v_run.completed_at
    ),
    'state', case
      when v_run.status = 'started' then 'running'
      when v_run.status = 'failed' then 'failed'
      when (select count(*) from filtered) = 0 then 'no_issues'
      else 'issues_found'
    end,
    'items', coalesce((select jsonb_agg(to_jsonb(page_rows) order by created_at desc, id desc) from page_rows), '[]'::jsonb),
    'total', (select count(*) from filtered)
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.admin_read_reconciliation(p_trip_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'tripId', t.id,
    'tripName', t.name,
    'binding', case
      when bl.trip_id is null and t.notion_database_id is null then 'none'
      when bl.status = 'error' then 'invalid'
      else 'configured'
    end,
    'syncMode', bl.sync_mode,
    'bindingStatus', coalesce(bl.status, 'legacy_binding'),
    'lastHealthAt', bl.last_health_at,
    'lastError', bl.last_error,
    'tripReceipts', count(r.id) filter (where r.visibility = 'trip' and r.deleted_at is null),
    'privateReceiptsExcluded', count(r.id) filter (where r.visibility = 'private' and r.deleted_at is null),
    'linkedReceipts', count(r.id) filter (
      where r.visibility = 'trip' and r.deleted_at is null and r.notion_page_id is not null
    ),
    'notionSource', 'unavailable'
  )
  from public.trips t
  left join public.trip_backend_links bl on bl.trip_id = t.id
  left join public.receipts r on r.trip_id = t.id
  where t.id = p_trip_id
  group by t.id, t.name, t.notion_database_id, bl.trip_id, bl.sync_mode, bl.status,
    bl.last_health_at, bl.last_error;
$$;

create or replace function public.admin_read_audit(
  p_limit integer default 51,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_action text default null,
  p_target_type text default null,
  p_request_id text default null,
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
    or (p_start_at is not null and p_end_at is not null and p_start_at > p_end_at) then
    raise exception 'Invalid audit read parameters';
  end if;

  with filtered as materialized (
    select id, admin_subject_hash, action, target_type, target_id_hash, request_id,
      preview_counts, result, created_at
    from public.admin_audit_events
    where (nullif(p_action, '') is null or action = p_action)
      and (nullif(p_target_type, '') is null or target_type = p_target_type)
      and (nullif(p_request_id, '') is null or request_id = p_request_id)
      and (p_start_at is null or created_at >= p_start_at)
      and (p_end_at is null or created_at <= p_end_at)
  ), page_rows as (
    select * from filtered
    where p_cursor_created_at is null
      or (created_at, id) < (p_cursor_created_at, p_cursor_id)
    order by created_at desc, id desc
    limit p_limit
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(page_rows) order by created_at desc, id desc) from page_rows), '[]'::jsonb),
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
  select to_jsonb(event_row)
  from (
    select id, admin_subject_hash, action, target_type, target_id_hash, request_id,
      preview_counts, result, created_at
    from public.admin_audit_events
    where id = p_id
  ) event_row;
$$;

create or replace function public.admin_read_search(p_q text)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if length(coalesce(p_q, '')) < 2 or length(p_q) > 100 or p_q like '%@%' then
    raise exception 'Invalid admin search query';
  end if;

  return jsonb_build_object(
    'accounts', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.updated_at desc)
      from (
        select * from private.admin_account_read
        where id::text = p_q or display_name ilike '%' || p_q || '%' or masked_email ilike p_q || '%'
        order by updated_at desc, id desc
        limit 5
      ) a
    ), '[]'::jsonb),
    'trips', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.updated_at desc)
      from (
        select * from private.admin_trip_read
        where id::text = p_q or name ilike '%' || p_q || '%' or destination_summary ilike '%' || p_q || '%'
        order by updated_at desc, id desc
        limit 5
      ) t
    ), '[]'::jsonb),
    'receipts', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.updated_at desc)
      from (
        select * from private.admin_receipt_read
        where id::text = p_q or store ilike '%' || p_q || '%' or trip_name ilike '%' || p_q || '%'
        order by updated_at desc, id desc
        limit 5
      ) r
    ), '[]'::jsonb)
  );
end;
$$;

do $functions$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'admin_read_%'
  loop
    execute format('alter function %s owner to admin_read_owner', v_function);
    execute format('revoke all on function %s from public, anon, authenticated', v_function);
    execute format('grant execute on function %s to service_role', v_function);
  end loop;
end
$functions$;

revoke create on schema private from admin_read_owner;
revoke create on schema public from admin_read_owner;
revoke admin_read_owner from postgres;

commit;
