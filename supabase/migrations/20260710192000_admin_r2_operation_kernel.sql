-- R2 canonical-data operations. Preview is computed by the signed Edge server;
-- commit rechecks versions and consumes the passphrase+passkey grant atomically.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

grant admin_auth_owner to postgres;
grant usage, create on schema private to admin_auth_owner;
grant usage, create on schema public to admin_auth_owner;
grant usage on schema extensions to admin_auth_owner;
grant select, update on public.trips to admin_auth_owner;
grant select, insert, update on public.trip_members to admin_auth_owner;
grant select, insert, update on public.trip_invites to admin_auth_owner;
grant select on public.trip_backend_links to admin_auth_owner;
grant select, update on public.receipts, public.receipt_sync_jobs to admin_auth_owner;
grant select on private.trip_itinerary_versions to admin_auth_owner;
grant usage, select on sequence private.receipt_sync_revision_seq to admin_auth_owner;
grant execute on function private.assert_itinerary_contract(date, date, jsonb)
  to admin_auth_owner;

drop policy if exists admin_auth_owner_trips_r2 on public.trips;
create policy admin_auth_owner_trips_r2
  on public.trips for all to admin_auth_owner using (true) with check (true);
drop policy if exists admin_auth_owner_trip_members_r2 on public.trip_members;
create policy admin_auth_owner_trip_members_r2
  on public.trip_members for all to admin_auth_owner using (true) with check (true);
drop policy if exists admin_auth_owner_trip_invites_r2 on public.trip_invites;
create policy admin_auth_owner_trip_invites_r2
  on public.trip_invites for all to admin_auth_owner using (true) with check (true);
drop policy if exists admin_auth_owner_backend_links_r2 on public.trip_backend_links;
create policy admin_auth_owner_backend_links_r2
  on public.trip_backend_links for select to admin_auth_owner using (true);

alter table public.trip_invites
  drop constraint if exists trip_invites_role_check;
alter table public.trip_invites
  add constraint trip_invites_role_check check (role in ('admin', 'editor', 'viewer'));

alter table private.admin_operations
  drop constraint if exists admin_operations_action_check;
alter table private.admin_operations
  add constraint admin_operations_action_check check (
    action in (
      'provider_probe', 'support_bundle', 'retry_sync_job', 'cancel_sync_job',
      'run_integrity_scan', 'receipt_amend', 'receipt_trash', 'receipt_restore',
      'trip_amend', 'itinerary_amend', 'itinerary_restore',
      'member_add', 'member_role', 'member_remove'
    )
  );

create or replace function private.admin_apply_receipt_mirror_state(
  p_receipt_id uuid,
  p_operation text,
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.receipts%rowtype;
  v_has_backend boolean;
begin
  if p_operation not in ('upsert', 'delete') then
    raise exception 'Invalid receipt mirror operation' using errcode = '22023';
  end if;
  select * into v_receipt from public.receipts where id = p_receipt_id for update;
  if not found then raise exception 'Receipt not found' using errcode = 'P0002'; end if;
  select exists (
    select 1 from public.trip_backend_links link
    where link.trip_id = v_receipt.trip_id
      and link.status = 'active' and link.sync_mode = 'dual_write'
  ) into v_has_backend;

  if v_receipt.visibility = 'private' or not v_has_backend then
    update public.receipt_sync_jobs
    set status = 'cancelled', locked_at = null, locked_by = null,
        last_error = case when v_receipt.visibility = 'private'
          then 'Private receipts are never mirrored to Notion' else last_error end,
        updated_at = clock_timestamp()
    where receipt_id = v_receipt.id and provider = 'notion'
      and status in ('pending', 'failed', 'processing');
    update public.receipts
    set notion_sync_status = 'disabled', notion_sync_error = null,
        notion_last_queued_at = null, updated_at = clock_timestamp()
    where id = v_receipt.id;
    return;
  end if;

  insert into public.receipt_sync_jobs (
    receipt_id, trip_id, owner_id, provider, operation, status, attempts,
    next_attempt_at, locked_at, locked_by, last_error, payload
  ) values (
    v_receipt.id, v_receipt.trip_id, v_receipt.owner_id, 'notion', p_operation,
    'pending', 0, clock_timestamp(), null, null, null,
    jsonb_build_object(
      'idempotencyKey', p_request_id,
      'sourceId', v_receipt.source_id,
      'version', v_receipt.version,
      'syncRevision', v_receipt.sync_revision,
      'queuedBy', 'admin',
      'queuedAt', clock_timestamp()
    )
  )
  on conflict (receipt_id, provider)
  do update set operation = excluded.operation, status = 'pending', attempts = 0,
    next_attempt_at = clock_timestamp(), locked_at = null, locked_by = null,
    last_error = null, payload = excluded.payload, updated_at = clock_timestamp();

  update public.receipts
  set notion_sync_status = 'pending', notion_sync_error = null,
      notion_sync_attempts = 0, notion_last_queued_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = v_receipt.id;
end;
$$;

create or replace function public.admin_operation_preview_r2_create(
  p_id uuid,
  p_idempotency_key uuid,
  p_session_hash text,
  p_actor text,
  p_action text,
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
    or p_action not in (
      'receipt_amend', 'receipt_trash', 'receipt_restore', 'trip_amend',
      'itinerary_amend', 'itinerary_restore', 'member_add', 'member_role', 'member_remove'
    )
    or p_target_type not in ('receipt', 'trip', 'membership')
    or p_target_ref !~ '^[0-9a-f-]{36}$'
    or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_preview, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid R2 operation preview' using errcode = '22023';
  end if;
  if not exists (
    select 1 from private.admin_sessions session
    where session.token_hash = p_session_hash and session.revoked_at is null
      and session.idle_expires_at > clock_timestamp()
      and session.absolute_expires_at > clock_timestamp()
  ) then
    raise exception 'Active admin session required' using errcode = '28000';
  end if;

  select * into v_existing
  from private.admin_operations where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.session_hash <> p_session_hash
      or v_existing.actor_hash <> v_actor_hash
      or v_existing.action <> p_action
      or v_existing.target_hash <> p_target_hash
      or v_existing.payload_hash <> p_payload_hash then
      raise exception 'Idempotency key payload mismatch' using errcode = '23505';
    end if;
    return private.admin_operation_json(v_existing);
  end if;

  insert into private.admin_operations (
    id, idempotency_key, session_hash, actor_hash, action, risk,
    target_type, target_ref, target_hash, target_version, payload,
    payload_hash, preview, preview_hash, request_id, preview_expires_at
  ) values (
    p_id, p_idempotency_key, p_session_hash, v_actor_hash, p_action, 'R2',
    p_target_type, p_target_ref, p_target_hash, p_target_version,
    coalesce(p_payload, '{}'::jsonb), p_payload_hash,
    coalesce(p_preview, '{}'::jsonb), p_preview_hash, p_request_id,
    clock_timestamp() + interval '5 minutes'
  ) returning * into v_operation;

  perform private.append_admin_audit_v2(
    v_actor_hash, p_session_hash, 'R2', 'operation_previewed', p_target_type,
    p_target_hash, p_preview_hash, null, p_preview,
    jsonb_build_object('action', p_action), null, p_request_id, p_id, null
  );
  return private.admin_operation_json(v_operation);
end;
$$;

create or replace function public.admin_operation_commit_r2(
  p_id uuid,
  p_grant_id uuid,
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
  v_receipt public.receipts%rowtype;
  v_trip public.trips%rowtype;
  v_member public.trip_members%rowtype;
  v_existing_member public.trip_members%rowtype;
  v_invite public.trip_invites%rowtype;
  v_patch jsonb;
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_expected bigint;
  v_restore_version bigint;
  v_user_id uuid;
  v_role text;
  v_email text;
  v_invite_token text;
  v_invite_hash text;
  v_itinerary_start date;
  v_itinerary_end date;
  v_itinerary jsonb;
  v_itinerary_source text;
begin
  if p_session_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Active admin session required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from private.admin_sessions session
    where session.token_hash = p_session_hash and session.revoked_at is null
      and session.idle_expires_at > clock_timestamp()
      and session.absolute_expires_at > clock_timestamp()
  ) then
    raise exception 'Active admin session required' using errcode = '28000';
  end if;

  select * into v_operation
  from private.admin_operations where id = p_id for update;
  if not found then raise exception 'Operation not found' using errcode = 'P0002'; end if;
  if v_operation.risk <> 'R2' or v_operation.actor_hash <> v_actor_hash then
    raise exception 'Operation cannot be committed' using errcode = '55000';
  end if;
  if v_operation.status = 'completed' then return private.admin_operation_json(v_operation); end if;
  if v_operation.status <> 'previewed'
    or v_operation.preview_expires_at <= clock_timestamp()
  then
    raise exception 'Operation cannot be committed' using errcode = '55000';
  end if;

  update private.admin_step_up_grants
  set consumed_at = clock_timestamp()
  where id = p_grant_id and session_hash = p_session_hash
    and action = v_operation.action and target_hash = v_operation.target_hash
    and preview_hash = v_operation.preview_hash and consumed_at is null
    and expires_at > clock_timestamp();
  if not found then raise exception 'MFA_STEP_UP_REQUIRED' using errcode = '42501'; end if;

  if v_operation.action in ('receipt_amend', 'receipt_trash', 'receipt_restore') then
    if v_operation.target_type <> 'receipt' then
      raise exception 'Invalid receipt operation target' using errcode = '22023';
    end if;
    select * into v_receipt from public.receipts
    where id = v_operation.target_ref::uuid for update;
    if not found then raise exception 'Receipt not found' using errcode = 'P0002'; end if;
    v_expected := (v_operation.payload ->> 'expectedVersion')::bigint;
    if v_expected <> v_receipt.version
      or coalesce(v_operation.target_version, '') <> v_receipt.version::text then
      raise exception 'PREVIEW_STALE' using errcode = '40001';
    end if;
    v_before := jsonb_build_object(
      'version', v_receipt.version, 'store', v_receipt.store,
      'recordDate', v_receipt.record_date, 'amount', v_receipt.amount,
      'currency', v_receipt.currency, 'recordKind', v_receipt.record_kind,
      'visibility', v_receipt.visibility, 'deletedAt', v_receipt.deleted_at
    );

    if v_operation.action = 'receipt_amend' then
      if v_receipt.deleted_at is not null then
        raise exception 'Deleted receipt cannot be amended' using errcode = '23514';
      end if;
      v_patch := v_operation.payload -> 'patch';
      if jsonb_typeof(v_patch) <> 'object' or v_patch = '{}'::jsonb
        or exists (
          select 1 from jsonb_object_keys(v_patch) as keys(key)
          where key not in (
            'store', 'recordDate', 'recordTime', 'amount', 'currency',
            'category', 'paymentMethod', 'recordKind', 'visibility'
          )
        ) then
        raise exception 'Invalid receipt amendment' using errcode = '22023';
      end if;
      if v_patch ? 'store' and btrim(coalesce(v_patch ->> 'store', '')) = '' then
        raise exception 'Receipt store is required' using errcode = '22023';
      end if;
      if v_patch ? 'recordDate' and coalesce(v_patch ->> 'recordDate', '') !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'Receipt date is invalid' using errcode = '22023';
      end if;
      if v_patch ? 'amount' and (v_patch ->> 'amount')::numeric < 0 then
        raise exception 'Receipt amount is invalid' using errcode = '22023';
      end if;
      if v_patch ? 'currency' and coalesce(v_patch ->> 'currency', '') !~ '^[A-Z]{3}$' then
        raise exception 'Receipt currency is invalid' using errcode = '22023';
      end if;
      if v_patch ? 'recordKind' and v_patch ->> 'recordKind' not in ('expense', 'settlement') then
        raise exception 'Receipt kind is invalid' using errcode = '22023';
      end if;
      if v_patch ? 'visibility' and v_patch ->> 'visibility' not in ('trip', 'private') then
        raise exception 'Receipt visibility is invalid' using errcode = '22023';
      end if;

      update public.receipts receipt
      set store = case when v_patch ? 'store' then btrim(v_patch ->> 'store') else receipt.store end,
          record_date = case when v_patch ? 'recordDate' then (v_patch ->> 'recordDate')::date else receipt.record_date end,
          record_time = case when v_patch ? 'recordTime' then nullif(v_patch ->> 'recordTime', '')::time else receipt.record_time end,
          amount = case when v_patch ? 'amount' then (v_patch ->> 'amount')::numeric else receipt.amount end,
          currency = case when v_patch ? 'currency' then v_patch ->> 'currency' else receipt.currency end,
          record_kind = case when v_patch ? 'recordKind' then v_patch ->> 'recordKind' else receipt.record_kind end,
          category = case
            when coalesce(v_patch ->> 'recordKind', receipt.record_kind) = 'settlement' then null
            when v_patch ? 'category' then nullif(v_patch ->> 'category', '')
            else receipt.category end,
          payment_method = case when v_patch ? 'paymentMethod' then nullif(v_patch ->> 'paymentMethod', '') else receipt.payment_method end,
          visibility = case when v_patch ? 'visibility' then v_patch ->> 'visibility' else receipt.visibility end,
          split_mode = case when coalesce(v_patch ->> 'visibility', receipt.visibility) = 'private' then 'private' else receipt.split_mode end,
          version = receipt.version + 1,
          sync_revision = nextval('private.receipt_sync_revision_seq'),
          updated_at = clock_timestamp()
      where receipt.id = v_receipt.id returning * into v_receipt;
      perform private.admin_apply_receipt_mirror_state(v_receipt.id, 'upsert', p_request_id);
    elsif v_operation.action = 'receipt_trash' then
      if v_receipt.deleted_at is not null then
        raise exception 'Receipt is already in Trash' using errcode = '23514';
      end if;
      update public.receipts receipt
      set status = 'deleted', deleted_at = clock_timestamp(), version = receipt.version + 1,
          sync_revision = nextval('private.receipt_sync_revision_seq'),
          updated_at = clock_timestamp()
      where receipt.id = v_receipt.id returning * into v_receipt;
      perform private.admin_apply_receipt_mirror_state(v_receipt.id, 'delete', p_request_id);
    else
      if v_receipt.deleted_at is null then
        raise exception 'Receipt is not in Trash' using errcode = '23514';
      end if;
      update public.receipts receipt
      set status = 'confirmed', deleted_at = null, version = receipt.version + 1,
          sync_revision = nextval('private.receipt_sync_revision_seq'),
          updated_at = clock_timestamp()
      where receipt.id = v_receipt.id returning * into v_receipt;
      perform private.admin_apply_receipt_mirror_state(v_receipt.id, 'upsert', p_request_id);
    end if;
    v_after := jsonb_build_object(
      'version', v_receipt.version, 'store', v_receipt.store,
      'recordDate', v_receipt.record_date, 'amount', v_receipt.amount,
      'currency', v_receipt.currency, 'recordKind', v_receipt.record_kind,
      'visibility', v_receipt.visibility, 'deletedAt', v_receipt.deleted_at
    );
    v_result := jsonb_build_object(
      'action', v_operation.action, 'receiptIdHash', v_operation.target_hash,
      'version', v_receipt.version, 'syncRevision', v_receipt.sync_revision
    );

  elsif v_operation.action = 'trip_amend' then
    if v_operation.target_type <> 'trip' then
      raise exception 'Invalid trip operation target' using errcode = '22023';
    end if;
    select * into v_trip from public.trips
    where id = v_operation.target_ref::uuid for update;
    if not found then raise exception 'Trip not found' using errcode = 'P0002'; end if;
    v_expected := (v_operation.payload ->> 'expectedVersion')::bigint;
    if v_expected <> v_trip.version
      or coalesce(v_operation.target_version, '') <> v_trip.version::text then
      raise exception 'PREVIEW_STALE' using errcode = '40001';
    end if;
    v_patch := v_operation.payload -> 'patch';
    if jsonb_typeof(v_patch) <> 'object' or v_patch = '{}'::jsonb
      or exists (
        select 1 from jsonb_object_keys(v_patch) as keys(key)
        where key not in (
          'name', 'destinationSummary', 'homeCurrency', 'tripCurrency',
          'budgetAmount', 'budgetCurrency', 'archived'
        )
      ) then
      raise exception 'Invalid trip amendment' using errcode = '22023';
    end if;
    if v_patch ? 'name' and btrim(coalesce(v_patch ->> 'name', '')) = '' then
      raise exception 'Trip name is required' using errcode = '22023';
    end if;
    if (v_patch ? 'homeCurrency' and coalesce(v_patch ->> 'homeCurrency', '') !~ '^[A-Z]{3}$')
      or (v_patch ? 'tripCurrency' and coalesce(v_patch ->> 'tripCurrency', '') !~ '^[A-Z]{3}$')
      or (v_patch ? 'budgetCurrency' and coalesce(v_patch ->> 'budgetCurrency', '') !~ '^[A-Z]{3}$') then
      raise exception 'Trip currency is invalid' using errcode = '22023';
    end if;
    if v_patch ? 'budgetAmount' and v_patch -> 'budgetAmount' <> 'null'::jsonb
      and (v_patch ->> 'budgetAmount')::numeric < 0 then
      raise exception 'Trip budget is invalid' using errcode = '22023';
    end if;
    v_before := jsonb_build_object(
      'version', v_trip.version, 'name', v_trip.name,
      'destinationSummary', v_trip.destination_summary,
      'homeCurrency', v_trip.home_currency, 'tripCurrency', v_trip.trip_currency,
      'budgetAmount', v_trip.budget_amount, 'budgetCurrency', v_trip.budget_currency,
      'archived', v_trip.archived
    );
    update public.trips trip
    set name = case when v_patch ? 'name' then btrim(v_patch ->> 'name') else trip.name end,
        destination_summary = case when v_patch ? 'destinationSummary' then nullif(btrim(v_patch ->> 'destinationSummary'), '') else trip.destination_summary end,
        home_currency = case when v_patch ? 'homeCurrency' then v_patch ->> 'homeCurrency' else trip.home_currency end,
        trip_currency = case when v_patch ? 'tripCurrency' then v_patch ->> 'tripCurrency' else trip.trip_currency end,
        budget_amount = case when v_patch ? 'budgetAmount' then nullif(v_patch ->> 'budgetAmount', '')::numeric else trip.budget_amount end,
        budget_currency = case when v_patch ? 'budgetCurrency' then v_patch ->> 'budgetCurrency' else trip.budget_currency end,
        archived = case when v_patch ? 'archived' then (v_patch ->> 'archived')::boolean else trip.archived end,
        version = trip.version + 1, updated_at = clock_timestamp()
    where trip.id = v_trip.id returning * into v_trip;
    v_after := jsonb_build_object(
      'version', v_trip.version, 'name', v_trip.name,
      'destinationSummary', v_trip.destination_summary,
      'homeCurrency', v_trip.home_currency, 'tripCurrency', v_trip.trip_currency,
      'budgetAmount', v_trip.budget_amount, 'budgetCurrency', v_trip.budget_currency,
      'archived', v_trip.archived
    );
    v_result := jsonb_build_object(
      'action', v_operation.action, 'tripIdHash', v_operation.target_hash,
      'version', v_trip.version
    );

  elsif v_operation.action in ('itinerary_amend', 'itinerary_restore') then
    if v_operation.target_type <> 'trip' then
      raise exception 'Invalid itinerary operation target' using errcode = '22023';
    end if;
    select * into v_trip from public.trips
    where id = v_operation.target_ref::uuid for update;
    if not found then raise exception 'Trip not found' using errcode = 'P0002'; end if;
    v_expected := (v_operation.payload ->> 'expectedVersion')::bigint;
    if v_expected <> v_trip.itinerary_version
      or coalesce(v_operation.target_version, '') <> v_trip.itinerary_version::text then
      raise exception 'PREVIEW_STALE' using errcode = '40001';
    end if;
    v_before := jsonb_build_object(
      'version', v_trip.itinerary_version, 'startDate', v_trip.start_date,
      'endDate', v_trip.end_date,
      'days', jsonb_array_length(coalesce(v_trip.itinerary, '[]'::jsonb))
    );
    if v_operation.action = 'itinerary_amend' then
      v_itinerary_start := (v_operation.payload ->> 'startDate')::date;
      v_itinerary_end := (v_operation.payload ->> 'endDate')::date;
      v_itinerary := v_operation.payload -> 'itinerary';
      v_itinerary_source := 'admin';
    else
      v_restore_version := (v_operation.payload ->> 'restoreVersion')::bigint;
      select snapshot.start_date, snapshot.end_date, snapshot.itinerary
      into v_itinerary_start, v_itinerary_end, v_itinerary
      from private.trip_itinerary_versions snapshot
      where snapshot.trip_id = v_trip.id and snapshot.version = v_restore_version;
      if not found then
        raise exception 'Itinerary version not found' using errcode = 'P0002';
      end if;
      v_itinerary_source := 'restore';
    end if;

    perform private.assert_itinerary_contract(
      v_itinerary_start, v_itinerary_end, v_itinerary
    );
    if (v_itinerary_start > v_trip.start_date or v_itinerary_end < v_trip.end_date)
      and exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(v_trip.itinerary) = 'array'
            then v_trip.itinerary else '[]'::jsonb end
        ) as entry(day)
        where case
          when coalesce(day ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
            then (day ->> 'date')::date
          else null
        end not between v_itinerary_start and v_itinerary_end
        and (
          (jsonb_typeof(day -> 'spots') = 'array'
            and jsonb_array_length(day -> 'spots') > 0)
          or coalesce(day -> 'lodging' ->> 'name', '') <> ''
        )
      ) then
      raise exception 'Itinerary date shrink requires resolution' using errcode = '22023';
    end if;

    perform set_config('app.itinerary_expected_version', v_expected::text, true);
    perform set_config('app.itinerary_source', v_itinerary_source, true);
    update public.trips trip
    set start_date = v_itinerary_start,
        end_date = v_itinerary_end,
        itinerary = v_itinerary,
        version = greatest(coalesce(trip.version, 1) + 1, v_expected + 1)
    where trip.id = v_trip.id;
    select * into v_trip from public.trips where id = v_trip.id;
    v_after := jsonb_build_object(
      'version', v_trip.itinerary_version, 'startDate', v_trip.start_date,
      'endDate', v_trip.end_date,
      'days', jsonb_array_length(coalesce(v_trip.itinerary, '[]'::jsonb))
    );
    v_result := jsonb_build_object(
      'action', v_operation.action, 'tripIdHash', v_operation.target_hash,
      'itineraryVersion', v_trip.itinerary_version
    );

  elsif v_operation.action = 'member_add' then
    if v_operation.target_type <> 'trip' then
      raise exception 'Invalid membership operation target' using errcode = '22023';
    end if;
    select * into v_trip from public.trips
    where id = v_operation.target_ref::uuid for update;
    if not found then raise exception 'Trip not found' using errcode = 'P0002'; end if;
    v_role := v_operation.payload ->> 'role';
    if v_role not in ('admin', 'editor', 'viewer') then
      raise exception 'Membership role is invalid' using errcode = '22023';
    end if;
    if coalesce(v_operation.payload ->> 'userId', '') <> '' then
      v_user_id := (v_operation.payload ->> 'userId')::uuid;
      if v_user_id = v_trip.owner_id then
        raise exception 'PROTECTED_TARGET' using errcode = '23514';
      end if;
      select * into v_existing_member from public.trip_members
      where trip_id = v_trip.id and user_id = v_user_id for update;
      if v_existing_member.id is null then
        if v_operation.target_version !~ '^absent:'
          or substring(v_operation.target_version from 8)::timestamptz is distinct from v_trip.updated_at then
          raise exception 'PREVIEW_STALE' using errcode = '40001';
        end if;
      elsif v_operation.target_version !~ '^member:'
        or substring(v_operation.target_version from 8)::timestamptz is distinct from v_existing_member.updated_at then
        raise exception 'PREVIEW_STALE' using errcode = '40001';
      end if;
      insert into public.trip_members (trip_id, user_id, role, status)
      values (v_trip.id, v_user_id, v_role, 'active')
      on conflict on constraint trip_members_trip_id_user_id_key
      do update set role = excluded.role, status = 'active', updated_at = clock_timestamp()
      returning * into v_member;
      v_before := jsonb_build_object(
        'status', coalesce(v_existing_member.status, 'absent'),
        'role', v_existing_member.role,
        'userIdHash', encode(extensions.digest(v_user_id::text, 'sha256'), 'hex')
      );
      v_after := jsonb_build_object(
        'status', v_member.status, 'role', v_member.role,
        'userIdHash', encode(extensions.digest(v_user_id::text, 'sha256'), 'hex')
      );
      v_result := jsonb_build_object(
        'action', v_operation.action, 'membershipId', v_member.id,
        'status', v_member.status, 'role', v_member.role
      );
    else
      v_email := lower(btrim(coalesce(v_operation.payload ->> 'email', '')));
      if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'Invitation email is invalid' using errcode = '22023';
      end if;
      select * into v_invite from public.trip_invites
      where trip_id = v_trip.id and email_normalized = v_email and status = 'pending'
      for update;
      if v_invite.id is null then
        if v_operation.target_version !~ '^invite-absent:'
          or substring(v_operation.target_version from 15)::timestamptz is distinct from v_trip.updated_at then
          raise exception 'PREVIEW_STALE' using errcode = '40001';
        end if;
      elsif v_operation.target_version !~ '^invite:'
        or substring(v_operation.target_version from 8)::timestamptz is distinct from v_invite.updated_at then
        raise exception 'PREVIEW_STALE' using errcode = '40001';
      end if;

      v_invite_token := encode(extensions.gen_random_bytes(32), 'hex');
      v_invite_hash := encode(extensions.digest(v_invite_token, 'sha256'), 'hex');
      if v_invite.id is null then
        insert into public.trip_invites (
          trip_id, email_normalized, role, status, token_hash, invited_by, expires_at
        ) values (
          v_trip.id, v_email, v_role, 'pending', v_invite_hash,
          v_trip.owner_id, clock_timestamp() + interval '14 days'
        ) returning * into v_invite;
      else
        update public.trip_invites
        set role = v_role, token_hash = v_invite_hash, accepted_by = null,
            expires_at = clock_timestamp() + interval '14 days',
            updated_at = clock_timestamp()
        where id = v_invite.id returning * into v_invite;
      end if;
      v_before := jsonb_build_object(
        'status', case when v_operation.target_version like 'invite:%'
          then 'pending' else 'absent' end,
        'emailHash', encode(extensions.digest(v_email, 'sha256'), 'hex')
      );
      v_after := jsonb_build_object(
        'status', v_invite.status, 'role', v_invite.role,
        'expiresAt', v_invite.expires_at,
        'emailHash', encode(extensions.digest(v_email, 'sha256'), 'hex')
      );
      v_result := jsonb_build_object(
        'action', v_operation.action, 'inviteId', v_invite.id,
        'status', v_invite.status, 'role', v_invite.role,
        'expiresAt', v_invite.expires_at
      );
    end if;

  elsif v_operation.action in ('member_role', 'member_remove') then
    if v_operation.target_type <> 'membership' then
      raise exception 'Invalid membership operation target' using errcode = '22023';
    end if;
    select member.* into v_member
    from public.trip_members member
    where member.id = v_operation.target_ref::uuid for update;
    if not found then raise exception 'Membership not found' using errcode = 'P0002'; end if;
    select * into v_trip from public.trips where id = v_member.trip_id;
    if v_member.role = 'owner' or v_member.user_id = v_trip.owner_id then
      raise exception 'PROTECTED_TARGET' using errcode = '23514';
    end if;
    if v_operation.target_version::timestamptz is distinct from v_member.updated_at then
      raise exception 'PREVIEW_STALE' using errcode = '40001';
    end if;
    v_before := jsonb_build_object(
      'status', v_member.status, 'role', v_member.role,
      'userIdHash', encode(extensions.digest(v_member.user_id::text, 'sha256'), 'hex')
    );
    if v_operation.action = 'member_role' then
      v_role := v_operation.payload ->> 'role';
      if v_role not in ('admin', 'editor', 'viewer') then
        raise exception 'Membership role is invalid' using errcode = '22023';
      end if;
      update public.trip_members
      set role = v_role, status = 'active', updated_at = clock_timestamp()
      where id = v_member.id returning * into v_member;
    else
      update public.trip_members
      set status = 'removed', updated_at = clock_timestamp()
      where id = v_member.id returning * into v_member;
    end if;
    v_after := jsonb_build_object(
      'status', v_member.status, 'role', v_member.role,
      'userIdHash', encode(extensions.digest(v_member.user_id::text, 'sha256'), 'hex')
    );
    v_result := jsonb_build_object(
      'action', v_operation.action, 'membershipId', v_member.id,
      'status', v_member.status, 'role', v_member.role
    );
  else
    raise exception 'R2 operation action is not implemented' using errcode = '22023';
  end if;

  insert into private.admin_operation_steps (
    operation_id, step_key, idempotency_key, status, attempts,
    verified_result, started_at, completed_at
  ) values (
    p_id, 'database', p_id::text || ':database', 'completed', 1,
    v_after, clock_timestamp(), clock_timestamp()
  );
  update private.admin_operations
  set status = 'completed', result = v_result, request_id = p_request_id,
      started_at = clock_timestamp(), completed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_id returning * into v_operation;
  perform private.append_admin_audit_v2(
    v_operation.actor_hash, p_session_hash, 'R2', 'operation_completed',
    v_operation.target_type, v_operation.target_hash, v_operation.preview_hash,
    v_before, v_after, v_result, null, p_request_id, p_id, null
  );
  if v_invite_token is not null then
    return jsonb_build_object(
      'operation', private.admin_operation_json(v_operation),
      'inviteToken', v_invite_token,
      'expiresAt', v_invite.expires_at
    );
  end if;
  return private.admin_operation_json(v_operation);
end;
$$;

alter function private.admin_apply_receipt_mirror_state(uuid, text, uuid)
  owner to admin_auth_owner;
alter function public.admin_operation_preview_r2_create(
  uuid, uuid, text, text, text, text, text, text, text, jsonb, text, jsonb, text, uuid
) owner to admin_auth_owner;
alter function public.admin_operation_commit_r2(uuid, uuid, text, text, uuid)
  owner to admin_auth_owner;

revoke all on function private.admin_apply_receipt_mirror_state(uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_operation_preview_r2_create(
  uuid, uuid, text, text, text, text, text, text, text, jsonb, text, jsonb, text, uuid
) from public, anon, authenticated;
revoke all on function public.admin_operation_commit_r2(uuid, uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_operation_preview_r2_create(
  uuid, uuid, text, text, text, text, text, text, text, jsonb, text, jsonb, text, uuid
) to service_role;
grant execute on function public.admin_operation_commit_r2(uuid, uuid, text, text, uuid)
  to service_role;

revoke create on schema public from admin_auth_owner;
revoke create on schema private from admin_auth_owner;
revoke admin_auth_owner from postgres;

commit;
