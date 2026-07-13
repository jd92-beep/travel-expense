-- Fixed, service-role-only read models for the production admin console.
-- The browser never queries these functions directly; the signed Edge runtime
-- maps each public BFF route to one fixed function and a bounded DTO.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $role$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'admin_read_owner'
  ) then
    create role admin_read_owner
      nologin inherit nosuperuser nocreatedb nocreaterole
      noreplication nobypassrls;
  elsif exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'admin_read_owner'
      and (
        rolcanlogin or rolsuper or not rolinherit or rolcreatedb
        or rolcreaterole or rolreplication or rolbypassrls
      )
  ) then
    raise exception 'admin_read_owner role attributes are unsafe';
  end if;
end
$role$;

grant usage, create on schema private to admin_read_owner;
grant usage, create on schema public to admin_read_owner;
grant admin_read_owner to postgres;
grant pg_read_all_data to admin_read_owner;

alter table public.app_usage_events
  drop constraint if exists app_usage_events_app_surface_check;
alter table public.app_usage_events
  add constraint app_usage_events_app_surface_check
  check (app_surface in ('react', 'compact', 'android', 'legacy', 'worker'));

grant select on public.profiles to admin_read_owner;
grant select on public.trips to admin_read_owner;
grant select on public.trip_members to admin_read_owner;
grant select on public.trip_invites to admin_read_owner;
grant select on public.trip_backend_links to admin_read_owner;
grant select on public.receipts to admin_read_owner;
grant select on public.receipt_photos to admin_read_owner;
grant select on public.integrations to admin_read_owner;
grant select on public.receipt_sync_jobs to admin_read_owner;
grant select on public.app_usage_events to admin_read_owner;
grant select on public.data_quality_runs to admin_read_owner;
grant select on public.data_quality_findings to admin_read_owner;
grant select on public.admin_audit_events to admin_read_owner;

do $policies$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles',
    'trips',
    'trip_members',
    'trip_invites',
    'trip_backend_links',
    'receipts',
    'receipt_photos',
    'integrations',
    'receipt_sync_jobs',
    'app_usage_events',
    'data_quality_runs',
    'data_quality_findings',
    'admin_audit_events'
  ]
  loop
    execute format('drop policy if exists admin_read_owner_select on public.%I', v_table);
    execute format(
      'create policy admin_read_owner_select on public.%I for select to admin_read_owner using (true)',
      v_table
    );
  end loop;
end
$policies$;

grant admin_auth_owner to postgres;
set local role admin_auth_owner;
grant select on private.admin_incidents to admin_read_owner;
drop policy if exists admin_read_owner_incidents on private.admin_incidents;
create policy admin_read_owner_incidents on private.admin_incidents
  for select to admin_read_owner using (true);
reset role;
revoke admin_auth_owner from postgres;

create or replace function private.admin_auth_user_rows()
returns table (
  id uuid,
  email text,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz,
  is_sso_user boolean,
  is_anonymous boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    u.id,
    u.email::text,
    u.email_confirmed_at,
    u.banned_until,
    u.last_sign_in_at,
    u.created_at,
    u.updated_at,
    u.deleted_at,
    u.is_sso_user,
    u.is_anonymous
  from auth.users u;
$$;

alter function private.admin_auth_user_rows() owner to postgres;
revoke all on function private.admin_auth_user_rows() from public, anon, authenticated, service_role;
grant execute on function private.admin_auth_user_rows() to admin_read_owner;

create or replace function private.admin_mask_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_email is null or pg_catalog.strpos(p_email, '@') <= 1 then 'unknown'
    else pg_catalog.left(pg_catalog.split_part(p_email, '@', 1), 2)
      || '***@' || pg_catalog.split_part(p_email, '@', 2)
  end;
$$;

alter function private.admin_mask_email(text) owner to admin_read_owner;
revoke all on function private.admin_mask_email(text) from public, anon, authenticated, service_role;

create or replace view private.admin_account_read as
select
  u.id,
  private.admin_mask_email(u.email) as masked_email,
  p.display_name,
  p.home_currency,
  p.locale,
  u.created_at,
  greatest(u.updated_at, coalesce(p.updated_at, u.updated_at)) as updated_at,
  u.last_sign_in_at,
  greatest(usage.last_seen_at, u.last_sign_in_at) as last_seen_at,
  usage.compact_last_seen_at,
  usage.android_last_seen_at,
  usage.compact_version,
  usage.android_version,
  coalesce(trip_stats.trip_count, 0)::integer as trip_count,
  coalesce(receipt_stats.receipt_count, 0)::integer as receipt_count,
  sync_stats.last_sync_at,
  coalesce(sync_stats.failed_sync_jobs, 0)::integer as failed_sync_jobs,
  coalesce(notion.status, 'not_configured') as notion_status,
  notion.last_synced_at as notion_last_synced_at,
  coalesce(shared_mirror.status, 'not_configured') as shared_mirror_status,
  coalesce(risks.open_risk, 0)::integer as open_risk,
  case
    when u.deleted_at is not null then 'deleted'
    when u.banned_until is not null and u.banned_until > clock_timestamp() then 'banned'
    when coalesce(risks.open_risk, 0) > 0 or coalesce(sync_stats.failed_sync_jobs, 0) > 0 then 'risk'
    else 'active'
  end as status
from private.admin_auth_user_rows() u
left join public.profiles p on p.id = u.id
left join lateral (
  select
    max(e.created_at) as last_seen_at,
    max(e.created_at) filter (where e.app_surface = 'compact') as compact_last_seen_at,
    max(e.created_at) filter (where e.app_surface = 'android') as android_last_seen_at,
    (array_agg(e.app_build order by e.created_at desc)
      filter (where e.app_surface = 'compact' and e.app_build is not null))[1] as compact_version,
    (array_agg(e.app_build order by e.created_at desc)
      filter (where e.app_surface = 'android' and e.app_build is not null))[1] as android_version
  from public.app_usage_events e
  where e.user_id = u.id
) usage on true
left join lateral (
  select count(distinct t.id) as trip_count
  from public.trips t
  where t.owner_id = u.id
    or exists (
      select 1
      from public.trip_members tm
      where tm.trip_id = t.id
        and tm.user_id = u.id
        and tm.status = 'active'
    )
) trip_stats on true
left join lateral (
  select count(*) as receipt_count
  from public.receipts r
  where r.owner_id = u.id and r.deleted_at is null
) receipt_stats on true
left join lateral (
  select
    max(j.updated_at) as last_sync_at,
    count(*) filter (where j.status = 'failed') as failed_sync_jobs
  from public.receipt_sync_jobs j
  where j.owner_id = u.id
) sync_stats on true
left join lateral (
  select i.status, i.last_synced_at
  from public.integrations i
  where i.user_id = u.id and i.provider = 'notion'
  order by i.updated_at desc, i.id desc
  limit 1
) notion on true
left join lateral (
  select case
    when bool_or(bl.status = 'error') then 'error'
    when bool_or(bl.status = 'connected') then 'connected'
    else max(bl.status)
  end as status
  from public.trip_backend_links bl
  join public.trips t on t.id = bl.trip_id
  where t.owner_id = u.id
    or exists (
      select 1 from public.trip_members tm
      where tm.trip_id = t.id and tm.user_id = u.id and tm.status = 'active'
    )
) shared_mirror on true
left join lateral (
  select count(*) as open_risk
  from private.admin_incidents i
  where i.status <> 'resolved'
    and i.details ->> 'userId' = u.id::text
) risks on true;

alter view private.admin_account_read owner to admin_read_owner;

create or replace view private.admin_trip_read as
select
  t.id,
  t.owner_id,
  private.admin_mask_email(u.email) as owner_masked_email,
  t.name,
  t.destination_summary,
  t.start_date,
  t.end_date,
  t.trip_currency,
  t.home_currency,
  t.budget_amount,
  t.budget_currency,
  t.version,
  t.archived,
  t.created_at,
  t.updated_at,
  coalesce(members.member_count, 0)::integer as member_count,
  coalesce(receipt_stats.receipt_count, 0)::integer as receipt_count,
  itinerary.expected_days,
  itinerary.actual_days,
  itinerary.out_of_range_days,
  itinerary.duplicate_days,
  case
    when t.start_date is null or t.end_date is null or t.end_date < t.start_date then 'invalid_dates'
    when itinerary.actual_days <> itinerary.expected_days
      or itinerary.out_of_range_days > 0
      or itinerary.duplicate_days > 0 then 'issue'
    else 'healthy'
  end as integrity_status,
  case
    when itinerary.expected_days > 0
      then least(100, round(100.0 * itinerary.actual_days / itinerary.expected_days))::integer
    else 0
  end as itinerary_coverage,
  coalesce(bl.status, case when t.notion_database_id is null then 'not_configured' else 'legacy_binding' end)
    as notion_binding_status
from public.trips t
left join private.admin_auth_user_rows() u on u.id = t.owner_id
left join lateral (
  select count(*) as member_count
  from public.trip_members tm
  where tm.trip_id = t.id
    and tm.status = 'active'
    and tm.user_id <> t.owner_id
) members on true
left join lateral (
  select count(*) as receipt_count
  from public.receipts r
  where r.trip_id = t.id and r.deleted_at is null
) receipt_stats on true
left join lateral (
  select
    case
      when t.start_date is not null and t.end_date is not null and t.end_date >= t.start_date
        then (t.end_date - t.start_date + 1)::integer
      else 0
    end as expected_days,
    case when jsonb_typeof(t.itinerary) = 'array' then jsonb_array_length(t.itinerary) else 0 end
      as actual_days,
    case when jsonb_typeof(t.itinerary) = 'array' then (
      select count(*)::integer
      from jsonb_array_elements(t.itinerary) day
      where case
        when pg_catalog.pg_input_is_valid(day ->> 'date', 'date')
          then (day ->> 'date')::date < t.start_date or (day ->> 'date')::date > t.end_date
        else true
      end
    ) else 0 end as out_of_range_days,
    case when jsonb_typeof(t.itinerary) = 'array' then (
      select coalesce(sum(day_count - 1), 0)::integer
      from (
        select count(*) as day_count
        from jsonb_array_elements(t.itinerary) day
        group by day ->> 'date'
        having count(*) > 1
      ) duplicates
    ) else 0 end as duplicate_days
) itinerary on true
left join lateral (
  select link.status
  from public.trip_backend_links link
  where link.trip_id = t.id
  order by link.updated_at desc
  limit 1
) bl on true;

alter view private.admin_trip_read owner to admin_read_owner;

create or replace view private.admin_receipt_read as
select
  r.id,
  r.trip_id,
  t.name as trip_name,
  r.owner_id,
  private.admin_mask_email(u.email) as owner_masked_email,
  r.store,
  r.record_date,
  r.record_time,
  r.amount,
  r.currency,
  case when r.category = 'settlement' then 'settlement' else 'expense' end as record_kind,
  coalesce(r.visibility, 'trip') as visibility,
  r.category,
  r.payment_method,
  r.status,
  r.notion_sync_status,
  r.version,
  r.deleted_at,
  r.created_at,
  r.updated_at,
  exists (
    select 1 from public.receipt_photos photo where photo.receipt_id = r.id
  ) as has_photo,
  case
    when r.deleted_at is not null then 'trash'
    when r.record_date < t.start_date or r.record_date > t.end_date then 'issue'
    when r.notion_sync_status = 'failed' then 'issue'
    else 'healthy'
  end as integrity_status
from public.receipts r
left join public.trips t on t.id = r.trip_id
left join private.admin_auth_user_rows() u on u.id = r.owner_id;

alter view private.admin_receipt_read owner to admin_read_owner;

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
          when (select max(created_at) from public.app_usage_events where app_surface = 'compact') is null
            then 'unknown'
          when (select max(created_at) from public.app_usage_events where app_surface = 'compact')
            >= clock_timestamp() - interval '24 hours' then 'healthy'
          else 'stale'
        end,
        'lastSeenAt', (select max(created_at) from public.app_usage_events where app_surface = 'compact')
      ),
      jsonb_build_object(
        'id', 'android',
        'status', case
          when (select max(created_at) from public.app_usage_events where app_surface = 'android') is null
            then 'unknown'
          when (select max(created_at) from public.app_usage_events where app_surface = 'android')
            >= clock_timestamp() - interval '24 hours' then 'healthy'
          else 'stale'
        end,
        'lastSeenAt', (select max(created_at) from public.app_usage_events where app_surface = 'android')
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
          app_surface,
          coalesce(app_build, 'unknown') as app_build,
          count(distinct session_id_hash) as installations,
          max(created_at) as last_seen_at
        from public.app_usage_events
        where app_surface in ('compact', 'android')
        group by app_surface, coalesce(app_build, 'unknown')
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

create or replace function public.admin_read_accounts(
  p_limit integer default 51,
  p_cursor_updated_at timestamptz default null,
  p_cursor_id uuid default null,
  p_q text default null,
  p_status text default null,
  p_platform text default null
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
    or length(coalesce(p_q, '')) > 100
    or coalesce(p_q, '') like '%@%'
    or coalesce(p_status, 'all') not in ('all', 'active', 'banned', 'deleted', 'risk')
    or coalesce(p_platform, 'all') not in ('all', 'compact', 'android') then
    raise exception 'Invalid account read parameters';
  end if;

  with filtered as materialized (
    select a.*
    from private.admin_account_read a
    where (
      nullif(p_q, '') is null
      or a.id::text = p_q
      or a.display_name ilike '%' || p_q || '%'
      or a.masked_email ilike p_q || '%'
    )
      and (coalesce(p_status, 'all') = 'all' or a.status = p_status)
      and (
        coalesce(p_platform, 'all') = 'all'
        or (p_platform = 'compact' and a.compact_last_seen_at is not null)
        or (p_platform = 'android' and a.android_last_seen_at is not null)
      )
  ), page_rows as (
    select *
    from filtered
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

create or replace function public.admin_read_trips(
  p_limit integer default 51,
  p_cursor_updated_at timestamptz default null,
  p_cursor_id uuid default null,
  p_q text default null,
  p_status text default null,
  p_integrity text default null
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
    or length(coalesce(p_q, '')) > 100
    or coalesce(p_status, 'all') not in ('all', 'open', 'past', 'archived')
    or coalesce(p_integrity, 'all') not in ('all', 'healthy', 'issue', 'invalid_dates') then
    raise exception 'Invalid trip read parameters';
  end if;

  with filtered as materialized (
    select t.*
    from private.admin_trip_read t
    where (
      nullif(p_q, '') is null
      or t.id::text = p_q
      or t.name ilike '%' || p_q || '%'
      or t.destination_summary ilike '%' || p_q || '%'
    )
      and (
        coalesce(p_status, 'all') = 'all'
        or (p_status = 'open' and not t.archived and (t.end_date is null or t.end_date >= current_date))
        or (p_status = 'past' and not t.archived and t.end_date < current_date)
        or (p_status = 'archived' and t.archived)
      )
      and (coalesce(p_integrity, 'all') = 'all' or t.integrity_status = p_integrity)
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

create or replace function public.admin_read_receipts(
  p_limit integer default 51,
  p_cursor_updated_at timestamptz default null,
  p_cursor_id uuid default null,
  p_q text default null,
  p_trip_id uuid default null,
  p_owner_id uuid default null,
  p_visibility text default null,
  p_record_kind text default null,
  p_trash text default null
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
    or length(coalesce(p_q, '')) > 100
    or coalesce(p_visibility, 'all') not in ('all', 'trip', 'private')
    or coalesce(p_record_kind, 'all') not in ('all', 'expense', 'settlement')
    or coalesce(p_trash, 'active') not in ('active', 'trash', 'all') then
    raise exception 'Invalid receipt read parameters';
  end if;

  with filtered as materialized (
    select r.*
    from private.admin_receipt_read r
    where (
      nullif(p_q, '') is null
      or r.id::text = p_q
      or r.store ilike '%' || p_q || '%'
      or r.trip_name ilike '%' || p_q || '%'
    )
      and (p_trip_id is null or r.trip_id = p_trip_id)
      and (p_owner_id is null or r.owner_id = p_owner_id)
      and (coalesce(p_visibility, 'all') = 'all' or r.visibility = p_visibility)
      and (coalesce(p_record_kind, 'all') = 'all' or r.record_kind = p_record_kind)
      and (
        coalesce(p_trash, 'active') = 'all'
        or (p_trash = 'active' and r.deleted_at is null)
        or (p_trash = 'trash' and r.deleted_at is not null and r.deleted_at >= clock_timestamp() - interval '30 days')
      )
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

commit;
