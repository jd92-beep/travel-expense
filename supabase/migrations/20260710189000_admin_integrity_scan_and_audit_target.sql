-- Add a bounded R1 integrity scan and server-side audit target filtering.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

grant admin_auth_owner to postgres;
grant admin_read_owner to postgres;
grant usage, create on schema private to admin_auth_owner;
grant usage, create on schema public to admin_auth_owner;
grant usage, create on schema public to admin_read_owner;
grant usage on schema extensions to admin_auth_owner;

alter table private.admin_operations
  drop constraint if exists admin_operations_action_check;
alter table private.admin_operations
  add constraint admin_operations_action_check check (
    action in (
      'provider_probe', 'support_bundle', 'retry_sync_job',
      'cancel_sync_job', 'run_integrity_scan'
    )
  );

grant select, insert, update on public.data_quality_runs to admin_auth_owner;
grant select, insert on public.data_quality_findings to admin_auth_owner;
grant select on public.trips, public.trip_members, public.receipts,
  public.receipt_items, public.receipt_photos, public.receipt_sync_jobs,
  public.trip_backend_links to admin_auth_owner;

drop policy if exists admin_auth_owner_data_quality_runs on public.data_quality_runs;
create policy admin_auth_owner_data_quality_runs
  on public.data_quality_runs for all to admin_auth_owner
  using (true) with check (true);
drop policy if exists admin_auth_owner_data_quality_findings on public.data_quality_findings;
create policy admin_auth_owner_data_quality_findings
  on public.data_quality_findings for all to admin_auth_owner
  using (true) with check (true);
drop policy if exists admin_auth_owner_trips_integrity_read on public.trips;
create policy admin_auth_owner_trips_integrity_read
  on public.trips for select to admin_auth_owner using (true);
drop policy if exists admin_auth_owner_trip_members_integrity_read on public.trip_members;
create policy admin_auth_owner_trip_members_integrity_read
  on public.trip_members for select to admin_auth_owner using (true);
drop policy if exists admin_auth_owner_receipt_items_integrity_read on public.receipt_items;
create policy admin_auth_owner_receipt_items_integrity_read
  on public.receipt_items for select to admin_auth_owner using (true);
drop policy if exists admin_auth_owner_receipt_photos_integrity_read on public.receipt_photos;
create policy admin_auth_owner_receipt_photos_integrity_read
  on public.receipt_photos for select to admin_auth_owner using (true);
drop policy if exists admin_auth_owner_trip_backend_links_integrity_read on public.trip_backend_links;
create policy admin_auth_owner_trip_backend_links_integrity_read
  on public.trip_backend_links for select to admin_auth_owner using (true);

create or replace function private.admin_integrity_scan(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_summary jsonb;
begin
  insert into public.data_quality_findings (
    run_id, severity, finding_type, entity_type, entity_id, detail
  )
  with expected_days as (
    select
      t.id as trip_id,
      generated.day::date as expected_date,
      to_char(generated.day::date, 'YYYY-MM-DD') as expected_text,
      t.itinerary
    from public.trips t
    cross join lateral generate_series(
      t.start_date::timestamp,
      t.end_date::timestamp,
      interval '1 day'
    ) generated(day)
    where t.start_date is not null and t.end_date is not null
  )
  select
    p_run_id,
    'danger',
    'missing_itinerary_day',
    'trip',
    expected.trip_id::text,
    jsonb_build_object('date', expected.expected_text)
  from expected_days expected
  where not exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(expected.itinerary) = 'array'
        then expected.itinerary else '[]'::jsonb end
    ) day_entry(day)
    where day_entry.day ->> 'date' = expected.expected_text
  );

  insert into public.data_quality_findings (
    run_id, severity, finding_type, entity_type, entity_id, detail
  )
  select
    p_run_id,
    'danger',
    case
      when coalesce(day_entry.day ->> 'date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        then 'invalid_itinerary_date'
      else 'out_of_range_itinerary_day'
    end,
    'trip',
    t.id::text,
    jsonb_build_object(
      'date', day_entry.day ->> 'date',
      'startDate', t.start_date,
      'endDate', t.end_date,
      'spotCount', case when jsonb_typeof(day_entry.day -> 'spots') = 'array'
        then jsonb_array_length(day_entry.day -> 'spots') else 0 end
    )
  from public.trips t
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(t.itinerary) = 'array'
      then t.itinerary else '[]'::jsonb end
  ) day_entry(day)
  where t.start_date is null
    or t.end_date is null
    or coalesce(day_entry.day ->> 'date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or day_entry.day ->> 'date' < t.start_date::text
    or day_entry.day ->> 'date' > t.end_date::text;

  insert into public.data_quality_findings (
    run_id, severity, finding_type, entity_type, entity_id, detail
  )
  select
    p_run_id,
    'danger',
    'duplicate_itinerary_day',
    'trip',
    t.id::text,
    jsonb_build_object('date', day_entry.day ->> 'date', 'count', count(*))
  from public.trips t
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(t.itinerary) = 'array'
      then t.itinerary else '[]'::jsonb end
  ) day_entry(day)
  group by t.id, day_entry.day ->> 'date'
  having count(*) > 1;

  insert into public.data_quality_findings (
    run_id, severity, finding_type, entity_type, entity_id, detail
  )
  with spots as (
    select
      t.id as trip_id,
      day_entry.day ->> 'date' as day_date,
      spot_entry.spot ->> 'id' as spot_id,
      spot_entry.spot ->> 'name' as spot_name
    from public.trips t
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(t.itinerary) = 'array'
        then t.itinerary else '[]'::jsonb end
    ) day_entry(day)
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(day_entry.day -> 'spots') = 'array'
        then day_entry.day -> 'spots' else '[]'::jsonb end
    ) spot_entry(spot)
  )
  select
    p_run_id,
    'danger',
    case when nullif(btrim(spot_id), '') is null or nullif(btrim(spot_name), '') is null
      then 'invalid_itinerary_spot' else 'duplicate_itinerary_spot' end,
    'trip',
    trip_id::text,
    jsonb_build_object(
      'spotId', spot_id,
      'dates', jsonb_agg(distinct day_date),
      'count', count(*)
    )
  from spots
  group by trip_id, spot_id, spot_name
  having nullif(btrim(spot_id), '') is null
    or nullif(btrim(spot_name), '') is null
    or count(*) > 1;

  insert into public.data_quality_findings (
    run_id, severity, finding_type, entity_type, entity_id, detail
  )
  select
    p_run_id,
    'danger',
    'receipt_date_outside_trip',
    'receipt',
    r.id::text,
    jsonb_build_object(
      'tripId', r.trip_id,
      'recordDate', r.record_date,
      'startDate', t.start_date,
      'endDate', t.end_date
    )
  from public.receipts r
  join public.trips t on t.id = r.trip_id
  where r.deleted_at is null
    and (t.start_date is null or t.end_date is null
      or r.record_date < t.start_date or r.record_date > t.end_date);

  insert into public.data_quality_findings (
    run_id, severity, finding_type, entity_type, entity_id, detail
  )
  select
    p_run_id,
    'danger',
    'duplicate_trip_source_id',
    'trip',
    r.trip_id::text,
    jsonb_build_object('sourceIdHash', encode(extensions.digest(r.source_id, 'sha256'), 'hex'), 'count', count(*))
  from public.receipts r
  where nullif(btrim(r.source_id), '') is not null
  group by r.trip_id, r.source_id
  having count(*) > 1;

  insert into public.data_quality_findings (
    run_id, severity, finding_type, entity_type, entity_id, detail
  )
  select
    p_run_id,
    'danger',
    'receipt_owner_membership_mismatch',
    'receipt',
    r.id::text,
    jsonb_build_object('tripId', r.trip_id, 'ownerId', r.owner_id)
  from public.receipts r
  join public.trips t on t.id = r.trip_id
  where r.owner_id <> t.owner_id
    and not exists (
      select 1 from public.trip_members member
      where member.trip_id = r.trip_id
        and member.user_id = r.owner_id
        and member.status = 'active'
    );

  insert into public.data_quality_findings (
    run_id, severity, finding_type, entity_type, entity_id, detail
  )
  select
    p_run_id,
    'warning',
    'membership_owner_mismatch',
    'membership',
    member.id::text,
    jsonb_build_object('tripId', member.trip_id, 'userId', member.user_id, 'role', member.role)
  from public.trip_members member
  join public.trips t on t.id = member.trip_id
  where (member.user_id = t.owner_id and member.role <> 'owner')
    or (member.user_id <> t.owner_id and member.role = 'owner');

  insert into public.data_quality_findings (
    run_id, severity, finding_type, entity_type, entity_id, detail
  )
  select
    p_run_id,
    'warning',
    'receipt_item_owner_mismatch',
    'receipt_item',
    item.id::text,
    jsonb_build_object('receiptId', item.receipt_id)
  from public.receipt_items item
  join public.receipts receipt on receipt.id = item.receipt_id
  where item.owner_id <> receipt.owner_id;

  insert into public.data_quality_findings (
    run_id, severity, finding_type, entity_type, entity_id, detail
  )
  select
    p_run_id,
    'warning',
    'receipt_photo_owner_mismatch',
    'receipt_photo',
    photo.id::text,
    jsonb_build_object('receiptId', photo.receipt_id)
  from public.receipt_photos photo
  join public.receipts receipt on receipt.id = photo.receipt_id
  where photo.owner_id <> receipt.owner_id;

  insert into public.data_quality_findings (
    run_id, severity, finding_type, entity_type, entity_id, detail
  )
  select
    p_run_id,
    'danger',
    'split_payer_settlement_inconsistency',
    'receipt',
    r.id::text,
    jsonb_build_object(
      'recordKind', r.record_kind,
      'visibility', r.visibility,
      'splitMode', r.split_mode,
      'splitType', r.split_type
    )
  from public.receipts r
  where (r.record_kind = 'settlement' and r.category is not null)
    or (r.record_kind = 'expense' and lower(coalesce(r.category, '')) = 'settlement')
    or (r.visibility = 'private' and r.split_mode <> 'private')
    or (r.splits is not null and jsonb_typeof(r.splits) <> 'array')
    or (r.payers is not null and jsonb_typeof(r.payers) <> 'array')
    or (r.split_type is not null and coalesce(jsonb_array_length(r.splits), 0) = 0);

  insert into public.data_quality_findings (
    run_id, severity, finding_type, entity_type, entity_id, detail
  )
  select
    p_run_id,
    'danger',
    'tombstone_version_regression',
    'receipt',
    r.id::text,
    jsonb_build_object(
      'status', r.status,
      'deletedAt', r.deleted_at,
      'version', r.version,
      'syncRevision', r.sync_revision
    )
  from public.receipts r
  where r.version < 1
    or r.sync_revision < 1
    or (r.deleted_at is not null and r.status <> 'deleted')
    or (r.deleted_at is null and r.status = 'deleted');

  insert into public.data_quality_findings (
    run_id, severity, finding_type, entity_type, entity_id, detail
  )
  select
    p_run_id,
    'danger',
    'private_receipt_queued_to_notion',
    'sync_job',
    job.id::text,
    jsonb_build_object('receiptId', job.receipt_id, 'status', job.status)
  from public.receipt_sync_jobs job
  join public.receipts receipt on receipt.id = job.receipt_id
  where receipt.visibility = 'private'
    and job.operation = 'upsert'
    and job.status in ('pending', 'processing', 'failed');

  insert into public.data_quality_findings (
    run_id, severity, finding_type, entity_type, entity_id, detail
  )
  select
    p_run_id,
    'danger',
    'invalid_backend_binding',
    'trip',
    link.trip_id::text,
    jsonb_build_object(
      'status', link.status,
      'ownerId', link.notion_owner_user_id,
      'lastHealthAt', link.last_health_at,
      'hasError', link.last_error is not null
    )
  from public.trip_backend_links link
  join public.trips trip on trip.id = link.trip_id
  where link.status = 'error'
    or nullif(btrim(link.notion_database_ref), '') is null
    or (
      link.notion_owner_user_id <> trip.owner_id
      and not exists (
        select 1 from public.trip_members member
        where member.trip_id = link.trip_id
          and member.user_id = link.notion_owner_user_id
          and member.status = 'active'
      )
    );

  insert into public.data_quality_findings (
    run_id, severity, finding_type, entity_type, entity_id, detail
  )
  select
    p_run_id,
    'warning',
    'stuck_sync_job',
    'sync_job',
    job.id::text,
    jsonb_build_object(
      'status', job.status,
      'attempts', job.attempts,
      'updatedAt', job.updated_at,
      'nextAttemptAt', job.next_attempt_at
    )
  from public.receipt_sync_jobs job
  where (job.status = 'processing' and coalesce(job.locked_at, job.updated_at) < clock_timestamp() - interval '15 minutes')
    or (job.status in ('pending', 'failed') and job.next_attempt_at < clock_timestamp() - interval '24 hours');

  select jsonb_build_object(
    'checkVersion', 'admin-integrity-v1',
    'recordsChecked',
      (select count(*) from public.trips)
      + (select count(*) from public.trip_members)
      + (select count(*) from public.receipts)
      + (select count(*) from public.receipt_items)
      + (select count(*) from public.receipt_photos)
      + (select count(*) from public.receipt_sync_jobs)
      + (select count(*) from public.trip_backend_links),
    'findings', (select count(*) from public.data_quality_findings where run_id = p_run_id),
    'high', (select count(*) from public.data_quality_findings where run_id = p_run_id and severity = 'danger'),
    'medium', (select count(*) from public.data_quality_findings where run_id = p_run_id and severity = 'warning'),
    'low', (select count(*) from public.data_quality_findings where run_id = p_run_id and severity = 'info')
  ) into v_summary;
  return v_summary;
end;
$$;

create or replace function public.admin_operation_preview_integrity_create(
  p_id uuid,
  p_idempotency_key uuid,
  p_session_hash text,
  p_actor text,
  p_target_hash text,
  p_target_version text,
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
    or p_preview_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid integrity operation preview' using errcode = '22023';
  end if;

  if not exists (
    select 1 from private.admin_sessions session
    where session.token_hash = p_session_hash
      and session.revoked_at is null
      and session.idle_expires_at > clock_timestamp()
      and session.absolute_expires_at > clock_timestamp()
  ) then
    raise exception 'active admin session required' using errcode = '28000';
  end if;

  select * into v_existing
  from private.admin_operations
  where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.session_hash <> p_session_hash
      or v_existing.actor_hash <> v_actor_hash
      or v_existing.action <> 'run_integrity_scan'
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
    p_id, p_idempotency_key, p_session_hash, v_actor_hash,
    'run_integrity_scan', 'R1', 'integrity_scan', 'system:integrity',
    p_target_hash, p_target_version, '{}'::jsonb, p_payload_hash,
    coalesce(p_preview, '{}'::jsonb), p_preview_hash, p_request_id,
    clock_timestamp() + interval '5 minutes'
  ) returning * into v_operation;

  perform private.append_admin_audit_v2(
    v_actor_hash, p_session_hash, 'R1', 'operation_previewed', 'integrity_scan',
    p_target_hash, p_preview_hash, null, p_preview,
    jsonb_build_object('action', 'run_integrity_scan'), null,
    p_request_id, p_id, null
  );
  return private.admin_operation_json(v_operation);
end;
$$;

create or replace function public.admin_operation_commit_integrity_scan(
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
  v_current_version text;
  v_run_id uuid := gen_random_uuid();
  v_summary jsonb;
  v_before jsonb;
  v_after jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('private.admin_integrity_scan'));

  select * into v_operation
  from private.admin_operations where id = p_id for update;
  if not found then raise exception 'operation not found' using errcode = 'P0002'; end if;
  if v_operation.status = 'completed' then return private.admin_operation_json(v_operation); end if;
  if v_operation.action <> 'run_integrity_scan'
    or v_operation.status <> 'previewed'
    or v_operation.preview_expires_at <= clock_timestamp()
    or v_operation.session_hash <> p_session_hash
    or v_operation.actor_hash <> v_actor_hash then
    raise exception 'operation cannot be committed' using errcode = '55000';
  end if;

  select concat_ws(':', run.id::text, run.status, run.completed_at::text)
  into v_current_version
  from public.data_quality_runs run
  order by run.started_at desc, run.id desc
  limit 1;
  if coalesce(v_operation.target_version, '') <> coalesce(v_current_version, '') then
    raise exception 'PREVIEW_STALE' using errcode = '40001';
  end if;

  v_before := jsonb_build_object('latestRunVersion', v_current_version);
  update private.admin_operations
  set status = 'executing', started_at = clock_timestamp(), updated_at = clock_timestamp(),
      request_id = p_request_id
  where id = p_id returning * into v_operation;

  insert into private.admin_operation_steps (
    operation_id, step_key, idempotency_key, status, attempts, started_at
  ) values (
    p_id, 'database', p_id::text || ':database', 'executing', 1, clock_timestamp()
  );

  insert into public.data_quality_runs (id, source, status, summary, started_at)
  values (v_run_id, 'admin-integrity-v1', 'started', '{}'::jsonb, clock_timestamp());

  begin
    v_summary := private.admin_integrity_scan(v_run_id);
    update public.data_quality_runs
    set status = 'completed', summary = v_summary, completed_at = clock_timestamp()
    where id = v_run_id;

    v_after := v_summary || jsonb_build_object(
      'runId', v_run_id,
      'status', 'completed',
      'completedAt', clock_timestamp()
    );
    update private.admin_operations
    set status = 'completed', result = v_after, completed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = p_id returning * into v_operation;
    update private.admin_operation_steps
    set status = 'completed', verified_result = v_after,
        completed_at = clock_timestamp(), updated_at = clock_timestamp()
    where operation_id = p_id and step_key = 'database';

    perform private.append_admin_audit_v2(
      v_operation.actor_hash, p_session_hash, 'R1', 'operation_completed',
      'integrity_scan', v_operation.target_hash, v_operation.preview_hash,
      v_before, v_after, v_after, null, p_request_id, p_id, null
    );
  exception when others then
    update public.data_quality_runs
    set status = 'failed',
        summary = jsonb_build_object('checkVersion', 'admin-integrity-v1', 'errorCode', sqlstate),
        completed_at = clock_timestamp()
    where id = v_run_id;
    v_after := jsonb_build_object('runId', v_run_id, 'status', 'failed', 'errorCode', sqlstate);
    update private.admin_operations
    set status = 'failed', result = v_after, error_code = 'INTEGRITY_SCAN_FAILED',
        error_message = 'Integrity scan failed', completed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = p_id returning * into v_operation;
    update private.admin_operation_steps
    set status = 'failed', verified_result = v_after,
        error_code = 'INTEGRITY_SCAN_FAILED', error_message = 'Integrity scan failed',
        completed_at = clock_timestamp(), updated_at = clock_timestamp()
    where operation_id = p_id and step_key = 'database';
    perform private.append_admin_audit_v2(
      v_operation.actor_hash, p_session_hash, 'R1', 'operation_failed',
      'integrity_scan', v_operation.target_hash, v_operation.preview_hash,
      v_before, v_after, v_after, 'INTEGRITY_SCAN_FAILED', p_request_id, p_id, null
    );
  end;

  return private.admin_operation_json(v_operation);
end;
$$;

drop function if exists public.admin_read_audit(
  integer, timestamptz, uuid, text, text, text, text, text, timestamptz, timestamptz
);

create function public.admin_read_audit(
  p_limit integer default 51,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_action text default null,
  p_target_type text default null,
  p_target_id uuid default null,
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
  v_target_hash text := case when p_target_id is null then null
    else encode(extensions.digest(p_target_id::text, 'sha256'), 'hex') end;
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
      event.id,
      event.sequence,
      event.previous_event_hash,
      event.event_hash,
      event.actor_hash as admin_subject_hash,
      event.session_hash,
      event.authentication_method,
      event.risk,
      event.action,
      event.target_type,
      event.target_hash as target_id_hash,
      event.request_id::text as request_id,
      jsonb_build_object('previewHash', event.preview_hash) as preview_counts,
      event.preview_hash,
      event.before_state,
      event.after_state,
      coalesce(event.result, '{}'::jsonb) || jsonb_build_object(
        'ok', event.error_code is null,
        'errorCode', event.error_code
      ) as result,
      event.error_code,
      event.operation_id,
      event.incident_id,
      event.frontend_version,
      event.edge_version,
      event.schema_version,
      event.occurred_at as created_at
    from private.admin_audit_events_v2 event
    where (nullif(p_action, '') is null or event.action = p_action)
      and (nullif(p_target_type, '') is null or event.target_type = p_target_type)
      and (v_target_hash is null or event.target_hash = v_target_hash)
      and (nullif(p_request_id, '') is null or event.request_id::text = p_request_id)
      and (nullif(p_risk, '') is null or event.risk = p_risk)
      and (
        nullif(p_result, '') is null
        or (p_result = 'succeeded' and event.error_code is null)
        or (p_result = 'failed' and event.error_code is not null)
      )
      and (p_start_at is null or event.occurred_at >= p_start_at)
      and (p_end_at is null or event.occurred_at <= p_end_at)
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

alter function private.admin_integrity_scan(uuid) owner to admin_auth_owner;
alter function public.admin_operation_preview_integrity_create(
  uuid, uuid, text, text, text, text, text, jsonb, text, uuid
) owner to admin_auth_owner;
alter function public.admin_operation_commit_integrity_scan(uuid, text, text, uuid)
  owner to admin_auth_owner;
alter function public.admin_read_audit(
  integer, timestamptz, uuid, text, text, uuid, text, text, text, timestamptz, timestamptz
) owner to admin_read_owner;

revoke all on function private.admin_integrity_scan(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_operation_preview_integrity_create(
  uuid, uuid, text, text, text, text, text, jsonb, text, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.admin_operation_commit_integrity_scan(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_read_audit(
  integer, timestamptz, uuid, text, text, uuid, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated;

grant execute on function public.admin_operation_preview_integrity_create(
  uuid, uuid, text, text, text, text, text, jsonb, text, uuid
) to service_role;
grant execute on function public.admin_operation_commit_integrity_scan(uuid, text, text, uuid)
  to service_role;
grant execute on function public.admin_read_audit(
  integer, timestamptz, uuid, text, text, uuid, text, text, text, timestamptz, timestamptz
) to service_role;

revoke create on schema private from admin_auth_owner;
revoke create on schema public from admin_auth_owner;
revoke create on schema public from admin_read_owner;
revoke admin_read_owner from postgres;
revoke admin_auth_owner from postgres;

commit;
