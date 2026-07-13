begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create index if not exists app_usage_events_heartbeat_surface_created_idx
  on public.app_usage_events(app_surface, created_at desc)
  where event_name = 'heartbeat';

grant usage, create on schema public to admin_read_owner;
grant admin_read_owner to postgres;
set local role admin_read_owner;

create or replace function public.admin_read_account_installations(p_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.last_seen_at desc), '[]'::jsonb)
  from (
    select
      left(session_id_hash, 16) as installation_id,
      app_surface,
      (array_agg(app_build order by created_at desc) filter (where app_build is not null))[1]
        as app_build,
      (array_agg((metadata ->> 'contractVersion')::integer order by created_at desc)
        filter (where metadata ->> 'contractVersion' ~ '^[1-9][0-9]*$'))[1]
        as contract_version,
      min(created_at) as first_seen_at,
      max(created_at) as last_seen_at,
      count(*) as event_count,
      (array_agg(left(user_agent, 160) order by created_at desc) filter (where user_agent is not null))[1]
        as client_summary
    from public.app_usage_events
    where user_id = p_id
      and app_surface in ('compact', 'android')
      and event_name = 'heartbeat'
      and session_id_hash is not null
    group by session_id_hash, app_surface
    order by max(created_at) desc
    limit 100
  ) row_data;
$$;

create or replace function public.admin_read_overview()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'counts', jsonb_build_object(
      'activeAccounts', (
        select count(*) from private.admin_auth_user_rows()
        where deleted_at is null
          and (banned_until is null or banned_until <= clock_timestamp())
      ),
      'openTrips', (
        select count(*) from public.trips
        where not archived and (end_date is null or end_date >= current_date)
      ),
      'recentReceipts', (
        select count(*) from public.receipts
        where deleted_at is null and created_at >= clock_timestamp() - interval '30 days'
      ),
      'failedJobs', (
        select count(*) from public.receipt_sync_jobs where status = 'failed'
      ),
      'integrityIssues', (
        select count(*)
        from public.data_quality_findings f
        where f.run_id = (select id from public.data_quality_runs order by started_at desc limit 1)
      )
    ),
    'incidents', coalesce((
      select jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc)
      from (
        select id, severity, kind, status, title, created_at
        from private.admin_incidents
        where status <> 'resolved' and severity in ('P0', 'P1')
        order by created_at desc, id desc
        limit 5
      ) row_data
    ), '[]'::jsonb),
    'statusStrip', jsonb_build_array(
      jsonb_build_object('id', 'shared-cloud', 'status', 'healthy', 'lastSeenAt', clock_timestamp()),
      jsonb_build_object(
        'id', 'compact-web',
        'status', case
          when (select max(created_at) from public.app_usage_events where app_surface = 'compact' and event_name = 'heartbeat') is null
            then 'unknown'
          when (select max(created_at) from public.app_usage_events where app_surface = 'compact' and event_name = 'heartbeat')
            >= clock_timestamp() - interval '24 hours' then 'healthy'
          else 'stale'
        end,
        'lastSeenAt', (select max(created_at) from public.app_usage_events where app_surface = 'compact' and event_name = 'heartbeat')
      ),
      jsonb_build_object(
        'id', 'android',
        'status', case
          when (select max(created_at) from public.app_usage_events where app_surface = 'android' and event_name = 'heartbeat') is null
            then 'unknown'
          when (select max(created_at) from public.app_usage_events where app_surface = 'android' and event_name = 'heartbeat')
            >= clock_timestamp() - interval '24 hours' then 'healthy'
          else 'stale'
        end,
        'lastSeenAt', (select max(created_at) from public.app_usage_events where app_surface = 'android' and event_name = 'heartbeat')
      ),
      jsonb_build_object(
        'id', 'notion',
        'status', case
          when exists (select 1 from public.receipt_sync_jobs where provider = 'notion' and status = 'failed')
            then 'degraded'
          when exists (select 1 from public.integrations where provider = 'notion' and status = 'connected')
            then 'healthy'
          else 'unconfigured'
        end,
        'lastSeenAt', (select max(last_synced_at) from public.integrations where provider = 'notion')
      ),
      jsonb_build_object('id', 'broker', 'status', 'unknown', 'lastSeenAt', null)
    ),
    'clientVersions', coalesce((
      select jsonb_agg(to_jsonb(version_row) order by version_row.app_surface, version_row.last_seen_at desc)
      from (
        select
          heartbeat.app_surface,
          heartbeat.app_build,
          heartbeat.contract_version,
          count(distinct heartbeat.session_id_hash) as installations,
          max(heartbeat.created_at) as last_seen_at
        from (
          select
            app_surface,
            coalesce(app_build, 'unknown') as app_build,
            case
              when metadata ->> 'contractVersion' ~ '^[1-9][0-9]*$'
                then (metadata ->> 'contractVersion')::integer
              else 0
            end as contract_version,
            session_id_hash,
            created_at
          from public.app_usage_events
          where app_surface in ('compact', 'android')
            and event_name = 'heartbeat'
        ) heartbeat
        group by heartbeat.app_surface, heartbeat.app_build, heartbeat.contract_version
      ) version_row
    ), '[]'::jsonb),
    'recentOperations', coalesce((
      select jsonb_agg(to_jsonb(event_row) order by event_row.created_at desc)
      from (
        select id, action, target_type, target_id_hash, request_id, result, created_at
        from public.admin_audit_events
        order by created_at desc, id desc
        limit 5
      ) event_row
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_read_account_installations(uuid) from public, anon, authenticated;
revoke all on function public.admin_read_overview() from public, anon, authenticated;
grant execute on function public.admin_read_account_installations(uuid) to service_role;
grant execute on function public.admin_read_overview() to service_role;

reset role;
revoke create on schema public from admin_read_owner;
revoke admin_read_owner from postgres;

commit;
