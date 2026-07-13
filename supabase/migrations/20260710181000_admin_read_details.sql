-- Bounded entity detail read models. Sensitive detail fields are returned only
-- for an explicitly addressed UUID and storage paths/credential references are
-- deliberately omitted.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.admin_read_account(p_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'identity', to_jsonb(account_row) || jsonb_build_object(
      'email', u.email,
      'emailConfirmedAt', u.email_confirmed_at,
      'bannedUntil', u.banned_until,
      'deletedAt', u.deleted_at,
      'isSsoUser', u.is_sso_user,
      'isAnonymous', u.is_anonymous
    ),
    'integrations', coalesce((
      select jsonb_agg(to_jsonb(integration_row) order by integration_row.updated_at desc)
      from (
        select provider, status, external_account_label, last_synced_at, created_at, updated_at
        from public.integrations
        where user_id = p_id
        order by updated_at desc
        limit 20
      ) integration_row
    ), '[]'::jsonb),
    'trips', coalesce((
      select jsonb_agg(to_jsonb(trip_row) order by trip_row.updated_at desc)
      from (
        select t.*
        from private.admin_trip_read t
        where t.owner_id = p_id
          or exists (
            select 1 from public.trip_members tm
            where tm.trip_id = t.id and tm.user_id = p_id and tm.status = 'active'
          )
        order by t.updated_at desc, t.id desc
        limit 20
      ) trip_row
    ), '[]'::jsonb),
    'recentReceipts', coalesce((
      select jsonb_agg(to_jsonb(receipt_row) order by receipt_row.updated_at desc)
      from (
        select r.* from private.admin_receipt_read r
        where r.owner_id = p_id
        order by r.updated_at desc, r.id desc
        limit 20
      ) receipt_row
    ), '[]'::jsonb),
    'incidents', coalesce((
      select jsonb_agg(to_jsonb(incident_row) order by incident_row.created_at desc)
      from (
        select id, severity, kind, status, title, created_at, resolved_at
        from private.admin_incidents
        where details ->> 'userId' = p_id::text
        order by created_at desc, id desc
        limit 20
      ) incident_row
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(to_jsonb(audit_row) order by audit_row.created_at desc)
      from (
        select id, action, target_type, target_id_hash, request_id, result, created_at
        from public.admin_audit_events
        where target_id_hash in (
          encode(sha256(p_id::text::bytea), 'hex'),
          left(encode(sha256(p_id::text::bytea), 'hex'), 24)
        )
        order by created_at desc, id desc
        limit 20
      ) audit_row
    ), '[]'::jsonb)
  )
  from private.admin_account_read account_row
  join private.admin_auth_user_rows() u on u.id = account_row.id
  where account_row.id = p_id;
$$;

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
      min(created_at) as first_seen_at,
      max(created_at) as last_seen_at,
      count(*) as event_count,
      (array_agg(left(user_agent, 160) order by created_at desc) filter (where user_agent is not null))[1]
        as client_summary
    from public.app_usage_events
    where user_id = p_id
      and app_surface in ('compact', 'android')
      and session_id_hash is not null
    group by session_id_hash, app_surface
    order by max(created_at) desc
    limit 100
  ) row_data;
$$;

create or replace function public.admin_read_trip(p_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'overview', to_jsonb(trip_row),
    'members', coalesce((
      select jsonb_agg(to_jsonb(member_row) order by member_row.role_order, member_row.created_at)
      from (
        select
          t.owner_id as user_id,
          private.admin_mask_email(owner_user.email) as masked_email,
          'owner'::text as role,
          'active'::text as status,
          t.created_at,
          0 as role_order
        from public.trips t
        left join private.admin_auth_user_rows() owner_user on owner_user.id = t.owner_id
        where t.id = p_id
        union all
        select
          tm.user_id,
          private.admin_mask_email(member_user.email),
          tm.role,
          tm.status,
          tm.created_at,
          1
        from public.trip_members tm
        left join private.admin_auth_user_rows() member_user on member_user.id = tm.user_id
        join public.trips owned_trip on owned_trip.id = tm.trip_id
        where tm.trip_id = p_id and tm.user_id <> owned_trip.owner_id
      ) member_row
    ), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(to_jsonb(invite_row) order by invite_row.created_at desc)
      from (
        select
          id,
          private.admin_mask_email(email_normalized) as masked_email,
          role,
          status,
          expires_at,
          created_at,
          updated_at
        from public.trip_invites
        where trip_id = p_id
        order by created_at desc
        limit 50
      ) invite_row
    ), '[]'::jsonb),
    'receipts', coalesce((
      select jsonb_agg(to_jsonb(receipt_row) order by receipt_row.updated_at desc)
      from (
        select r.* from private.admin_receipt_read r
        where r.trip_id = p_id
        order by r.updated_at desc, r.id desc
        limit 20
      ) receipt_row
    ), '[]'::jsonb),
    'integration', (
      select jsonb_build_object(
        'status', link.status,
        'syncMode', link.sync_mode,
        'databaseConfigured', link.notion_database_ref is not null,
        'lastHealthAt', link.last_health_at,
        'lastError', link.last_error,
        'updatedAt', link.updated_at
      )
      from public.trip_backend_links link
      where link.trip_id = p_id
      order by link.updated_at desc
      limit 1
    ),
    'audit', coalesce((
      select jsonb_agg(to_jsonb(audit_row) order by audit_row.created_at desc)
      from (
        select id, action, target_type, target_id_hash, request_id, result, created_at
        from public.admin_audit_events
        where target_id_hash in (
          encode(sha256(p_id::text::bytea), 'hex'),
          left(encode(sha256(p_id::text::bytea), 'hex'), 24)
        )
        order by created_at desc, id desc
        limit 20
      ) audit_row
    ), '[]'::jsonb)
  )
  from private.admin_trip_read trip_row
  where trip_row.id = p_id;
$$;

create or replace function public.admin_read_trip_itinerary(p_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'tripId', id,
    'startDate', start_date,
    'endDate', end_date,
    'version', version,
    'itinerary', case when jsonb_typeof(itinerary) = 'array' then itinerary else '[]'::jsonb end
  )
  from public.trips
  where id = p_id;
$$;

create or replace function public.admin_read_receipt(p_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'receipt', to_jsonb(list_row) || jsonb_build_object(
      'homeAmount', r.home_amount,
      'homeCurrency', r.home_currency,
      'originalAmount', r.original_amount,
      'originalCurrency', r.original_currency,
      'exchangeRate', r.exchange_rate,
      'itemsText', r.items_text,
      'note', r.note,
      'address', r.address,
      'bookingRef', r.booking_ref,
      'sourceId', r.source_id,
      'confidence', r.confidence,
      'splitType', r.split_type,
      'splits', r.splits,
      'payers', r.payers,
      'notionSyncError', r.notion_sync_error,
      'notionSyncAttempts', r.notion_sync_attempts,
      'notionLastSyncedAt', r.notion_last_synced_at
    ),
    'photo', (
      select jsonb_build_object(
        'id', p.id,
        'mimeType', p.mime_type,
        'fileSize', p.file_size,
        'width', p.width,
        'height', p.height,
        'createdAt', p.created_at,
        'updatedAt', p.updated_at
      )
      from public.receipt_photos p
      where p.receipt_id = p_id
      order by p.created_at desc
      limit 1
    ),
    'syncJobs', coalesce((
      select jsonb_agg(to_jsonb(job_row) order by job_row.updated_at desc)
      from (
        select id, provider, operation, status, attempts, next_attempt_at, last_error, created_at, updated_at
        from public.receipt_sync_jobs
        where receipt_id = p_id
        order by updated_at desc, id desc
        limit 20
      ) job_row
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(to_jsonb(audit_row) order by audit_row.created_at desc)
      from (
        select id, action, target_type, target_id_hash, request_id, result, created_at
        from public.admin_audit_events
        where target_id_hash in (
          encode(sha256(p_id::text::bytea), 'hex'),
          left(encode(sha256(p_id::text::bytea), 'hex'), 24)
        )
        order by created_at desc, id desc
        limit 20
      ) audit_row
    ), '[]'::jsonb)
  )
  from private.admin_receipt_read list_row
  join public.receipts r on r.id = list_row.id
  where list_row.id = p_id;
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
