-- Canonical receipt contract shared by Compact, React, Android, and Admin.
-- All browser mutations go through versioned RPCs; hard delete is deliberately absent.

create sequence if not exists private.receipt_sync_revision_seq;
revoke all on sequence private.receipt_sync_revision_seq from public, anon, authenticated;
grant usage, select on sequence private.receipt_sync_revision_seq to service_role;

alter table public.receipts
  add column if not exists record_kind text not null default 'expense',
  add column if not exists split_mode text not null default 'shared',
  add column if not exists person_id text,
  add column if not exists beneficiary_id text,
  add column if not exists sync_revision bigint not null default nextval('private.receipt_sync_revision_seq');

update public.receipts
set record_kind = 'settlement',
    category = null
where lower(coalesce(category, '')) = 'settlement';

update public.receipts
set split_mode = 'private'
where visibility = 'private';

alter table public.receipts
  drop constraint if exists receipts_record_kind_check,
  drop constraint if exists receipts_record_kind_category_check,
  drop constraint if exists receipts_split_mode_check,
  drop constraint if exists receipts_private_split_check,
  drop constraint if exists receipts_splits_array_check,
  drop constraint if exists receipts_payers_array_check,
  drop constraint if exists receipts_sync_revision_check;

alter table public.receipts
  add constraint receipts_record_kind_check
    check (record_kind in ('expense', 'settlement')),
  add constraint receipts_record_kind_category_check
    check (
      (record_kind = 'settlement' and category is null)
      or (record_kind = 'expense' and lower(coalesce(category, '')) <> 'settlement')
    ),
  add constraint receipts_split_mode_check
    check (split_mode in ('shared', 'private')),
  add constraint receipts_private_split_check
    check (visibility <> 'private' or split_mode = 'private'),
  add constraint receipts_splits_array_check
    check (splits is null or jsonb_typeof(splits) = 'array'),
  add constraint receipts_payers_array_check
    check (payers is null or jsonb_typeof(payers) = 'array'),
  add constraint receipts_sync_revision_check
    check (sync_revision > 0);

create index if not exists receipts_sync_revision_idx
  on public.receipts (sync_revision, id);

create or replace function private.guard_private_receipt_notion_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visibility text;
begin
  select r.visibility
  into v_visibility
  from public.receipts r
  where r.id = new.receipt_id;

  if v_visibility = 'private'
     and new.operation = 'upsert'
     and new.status in ('pending', 'processing', 'failed') then
    raise exception 'Private receipts cannot be queued for Notion upsert'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_private_receipt_notion_job() from public, anon, authenticated;

drop trigger if exists receipt_sync_jobs_guard_private on public.receipt_sync_jobs;
create trigger receipt_sync_jobs_guard_private
before insert or update on public.receipt_sync_jobs
for each row execute function private.guard_private_receipt_notion_job();

create or replace function public.enqueue_notion_receipt_sync(
  p_receipt_id uuid,
  p_operation text default 'upsert',
  p_payload jsonb default '{}'::jsonb
)
returns public.receipt_sync_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.receipts%rowtype;
  v_job public.receipt_sync_jobs%rowtype;
begin
  select * into v_receipt
  from public.receipts
  where id = p_receipt_id;

  if not found then
    raise exception 'receipt % not found', p_receipt_id using errcode = 'P0002';
  end if;
  if not private.can_edit_trip(v_receipt.trip_id) then
    raise exception 'not allowed to enqueue sync for receipt %', p_receipt_id using errcode = '42501';
  end if;
  if p_operation not in ('upsert', 'delete') then
    raise exception 'invalid sync operation %', p_operation using errcode = '22023';
  end if;
  if v_receipt.visibility = 'private' and p_operation = 'upsert' then
    raise exception 'Private receipts cannot be queued for Notion upsert' using errcode = '23514';
  end if;

  insert into public.receipt_sync_jobs as jobs (
    receipt_id, trip_id, owner_id, provider, operation, status, attempts,
    next_attempt_at, locked_at, locked_by, last_error, payload
  ) values (
    v_receipt.id, v_receipt.trip_id, v_receipt.owner_id, 'notion', p_operation,
    'pending', 0, clock_timestamp(), null, null, null, coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (receipt_id, provider)
  do update set
    operation = excluded.operation,
    status = 'pending',
    attempts = 0,
    next_attempt_at = clock_timestamp(),
    locked_at = null,
    locked_by = null,
    last_error = null,
    payload = excluded.payload,
    updated_at = clock_timestamp()
  returning * into v_job;

  update public.receipts
  set notion_sync_status = 'pending',
      notion_sync_error = null,
      notion_sync_attempts = 0,
      notion_last_queued_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = v_receipt.id;

  return v_job;
end;
$$;

revoke all on function public.enqueue_notion_receipt_sync(uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.enqueue_notion_receipt_sync(uuid, text, jsonb)
  to authenticated, service_role;

create or replace function public.upsert_shared_trip_receipt(
  p_trip_id uuid,
  p_receipt jsonb,
  p_receipt_id uuid default null,
  p_source_id text default null,
  p_idempotency_key text default null
)
returns setof public.receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_existing public.receipts%rowtype;
  v_receipt public.receipts%rowtype;
  v_source_id text := coalesce(nullif(btrim(p_source_id), ''), nullif(btrim(p_receipt->>'source_id'), ''));
  v_expected_version integer;
  v_record_date date;
  v_record_time time;
  v_amount numeric;
  v_home_amount numeric;
  v_original_amount numeric;
  v_exchange_rate numeric;
  v_has_backend boolean;
  v_visibility text;
  v_record_kind text;
  v_category text;
  v_split_mode text;
  v_split_type text;
  v_splits jsonb;
  v_payers jsonb;
  v_should_delete_mirror boolean := false;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not private.can_edit_trip(p_trip_id) then
    raise exception 'Trip editor role required' using errcode = '42501';
  end if;
  if p_receipt is null or jsonb_typeof(p_receipt) <> 'object' then
    raise exception 'Receipt payload must be a JSON object' using errcode = '22023';
  end if;

  if coalesce(p_receipt->>'version', '') ~ '^\d+$' then
    v_expected_version := (p_receipt->>'version')::integer;
  end if;

  insert into public.profiles (id)
  values (v_user)
  on conflict (id) do nothing;

  if v_source_id is null then
    v_source_id := coalesce(p_receipt_id::text, extensions.gen_random_uuid()::text);
  end if;

  v_record_date := case
    when coalesce(p_receipt->>'record_date', '') ~ '^\d{4}-\d{2}-\d{2}$'
      then (p_receipt->>'record_date')::date
    else current_date
  end;
  v_record_time := case
    when coalesce(p_receipt->>'record_time', '') ~ '^\d{1,2}:\d{2}(:\d{2})?$'
      then (p_receipt->>'record_time')::time
    else null
  end;
  v_amount := case
    when coalesce(p_receipt->>'amount', '') ~ '^-?\d+(\.\d+)?$'
      then greatest((p_receipt->>'amount')::numeric, 0)
    else 0
  end;
  v_home_amount := case
    when coalesce(p_receipt->>'home_amount', '') ~ '^-?\d+(\.\d+)?$'
      then greatest((p_receipt->>'home_amount')::numeric, 0)
    else null
  end;
  v_original_amount := case
    when coalesce(p_receipt->>'original_amount', '') ~ '^-?\d+(\.\d+)?$'
      then greatest((p_receipt->>'original_amount')::numeric, 0)
    else null
  end;
  v_exchange_rate := case
    when coalesce(p_receipt->>'exchange_rate', '') ~ '^-?\d+(\.\d+)?$'
      then greatest((p_receipt->>'exchange_rate')::numeric, 0)
    else null
  end;

  v_visibility := case when lower(coalesce(p_receipt->>'visibility', '')) = 'private' then 'private' else 'trip' end;
  v_category := nullif(btrim(p_receipt->>'category'), '');
  v_record_kind := lower(coalesce(nullif(btrim(p_receipt->>'record_kind'), ''),
    case when lower(coalesce(v_category, '')) = 'settlement' then 'settlement' else 'expense' end));
  if v_record_kind not in ('expense', 'settlement') then
    raise exception 'Invalid record kind' using errcode = '22023';
  end if;
  if v_record_kind = 'settlement' then
    v_category := null;
  elsif lower(coalesce(v_category, '')) = 'settlement' then
    raise exception 'Settlement must use record_kind' using errcode = '22023';
  end if;

  v_split_mode := lower(coalesce(nullif(btrim(p_receipt->>'split_mode'), ''),
    case when v_visibility = 'private' then 'private' else 'shared' end));
  if v_split_mode not in ('shared', 'private') then
    raise exception 'Invalid split mode' using errcode = '22023';
  end if;
  if v_visibility = 'private' and v_split_mode <> 'private' then
    raise exception 'Private visibility requires private split mode' using errcode = '23514';
  end if;
  if v_visibility = 'private'
     and nullif(btrim(p_receipt->>'beneficiary_id'), '') is not null
     and nullif(btrim(p_receipt->>'beneficiary_id'), '') <> nullif(btrim(p_receipt->>'person_id'), '') then
    raise exception 'Private receipt cannot have a cross-person beneficiary' using errcode = '23514';
  end if;

  v_split_type := nullif(btrim(p_receipt->>'split_type'), '');
  if v_split_type is not null and v_split_type not in ('equal', 'shares', 'exact', 'percent', 'adjustment', 'itemized') then
    raise exception 'Invalid split type' using errcode = '22023';
  end if;
  v_splits := case when jsonb_typeof(p_receipt->'splits') = 'array' then p_receipt->'splits' else null end;
  v_payers := case when jsonb_typeof(p_receipt->'payers') = 'array' then p_receipt->'payers' else null end;

  select *
  into v_existing
  from public.receipts
  where trip_id = p_trip_id
    and ((p_receipt_id is not null and id = p_receipt_id) or source_id = v_source_id)
  order by case when p_receipt_id is not null and id = p_receipt_id then 0 else 1 end
  limit 1
  for update;

  if v_existing.id is not null and v_existing.owner_id <> v_user then
    raise exception 'Only the original receipt owner can update this receipt' using errcode = '42501';
  end if;
  if v_existing.id is not null and v_expected_version is null then
    raise exception 'Expected receipt version required' using errcode = '22023';
  end if;
  if v_existing.id is not null and coalesce(v_existing.version, 1) <> v_expected_version then
    raise exception 'Receipt version conflict'
      using errcode = '40001',
            detail = format('expected version %s but found %s', v_expected_version, coalesce(v_existing.version, 1));
  end if;
  if v_existing.id is not null and v_existing.deleted_at is not null then
    raise exception 'Receipt is deleted; use restore_receipt_v2' using errcode = '40001';
  end if;

  select exists (
    select 1 from public.trip_backend_links
    where trip_id = p_trip_id and status = 'active' and sync_mode = 'dual_write'
  ) into v_has_backend;

  v_should_delete_mirror := v_visibility = 'private'
    and v_existing.id is not null
    and (v_existing.visibility = 'trip' or v_existing.notion_page_id is not null);

  if v_existing.id is null then
    insert into public.receipts (
      id, trip_id, owner_id, store, record_date, record_time, category, record_kind,
      payment_method, amount, currency, home_amount, home_currency, original_amount,
      original_currency, exchange_rate, items_text, note, address, booking_ref,
      source_id, status, confidence, map_url, visibility, split_mode, split_type,
      splits, payers, person_id, beneficiary_id, notion_sync_status,
      notion_last_queued_at, version, sync_revision, created_at, updated_at
    ) values (
      coalesce(p_receipt_id, extensions.gen_random_uuid()), p_trip_id, v_user,
      coalesce(nullif(btrim(p_receipt->>'store'), ''), '未命名'), v_record_date,
      v_record_time, v_category, v_record_kind, nullif(btrim(p_receipt->>'payment_method'), ''),
      v_amount, coalesce(nullif(btrim(p_receipt->>'currency'), ''), 'JPY'),
      v_home_amount, coalesce(nullif(btrim(p_receipt->>'home_currency'), ''), 'HKD'),
      v_original_amount, nullif(btrim(p_receipt->>'original_currency'), ''), v_exchange_rate,
      nullif(p_receipt->>'items_text', ''), nullif(p_receipt->>'note', ''),
      nullif(p_receipt->>'address', ''), nullif(p_receipt->>'booking_ref', ''),
      v_source_id, 'confirmed', nullif(btrim(p_receipt->>'confidence'), ''),
      nullif(p_receipt->>'map_url', ''), v_visibility, v_split_mode, v_split_type,
      v_splits, v_payers, nullif(btrim(p_receipt->>'person_id'), ''),
      nullif(btrim(p_receipt->>'beneficiary_id'), ''),
      case when v_has_backend and v_visibility = 'trip' then 'pending' else 'disabled' end,
      case when v_has_backend and v_visibility = 'trip' then clock_timestamp() else null end,
      1, nextval('private.receipt_sync_revision_seq'), clock_timestamp(), clock_timestamp()
    ) returning * into v_receipt;
  else
    update public.receipts
    set store = coalesce(nullif(btrim(p_receipt->>'store'), ''), store),
        record_date = v_record_date,
        record_time = v_record_time,
        category = v_category,
        record_kind = v_record_kind,
        payment_method = nullif(btrim(p_receipt->>'payment_method'), ''),
        amount = v_amount,
        currency = coalesce(nullif(btrim(p_receipt->>'currency'), ''), currency),
        home_amount = v_home_amount,
        home_currency = coalesce(nullif(btrim(p_receipt->>'home_currency'), ''), home_currency),
        original_amount = v_original_amount,
        original_currency = nullif(btrim(p_receipt->>'original_currency'), ''),
        exchange_rate = v_exchange_rate,
        items_text = nullif(p_receipt->>'items_text', ''),
        note = nullif(p_receipt->>'note', ''),
        address = nullif(p_receipt->>'address', ''),
        booking_ref = nullif(p_receipt->>'booking_ref', ''),
        source_id = v_source_id,
        status = 'confirmed',
        confidence = nullif(btrim(p_receipt->>'confidence'), ''),
        map_url = nullif(p_receipt->>'map_url', ''),
        visibility = v_visibility,
        split_mode = v_split_mode,
        split_type = v_split_type,
        splits = v_splits,
        payers = v_payers,
        person_id = nullif(btrim(p_receipt->>'person_id'), ''),
        beneficiary_id = nullif(btrim(p_receipt->>'beneficiary_id'), ''),
        notion_sync_status = case
          when v_should_delete_mirror and v_existing.notion_page_id is not null then 'pending'
          when v_has_backend and v_visibility = 'trip' then 'pending'
          else 'disabled'
        end,
        notion_last_queued_at = case
          when v_should_delete_mirror and v_existing.notion_page_id is not null then clock_timestamp()
          when v_has_backend and v_visibility = 'trip' then clock_timestamp()
          else null
        end,
        notion_sync_error = null,
        version = coalesce(v_existing.version, 1) + 1,
        sync_revision = nextval('private.receipt_sync_revision_seq'),
        updated_at = clock_timestamp()
    where id = v_existing.id
    returning * into v_receipt;
  end if;

  if v_visibility = 'private' then
    update public.receipt_sync_jobs
    set status = 'cancelled', locked_at = null, locked_by = null,
        last_error = null, updated_at = clock_timestamp()
    where receipt_id = v_receipt.id and provider = 'notion' and operation = 'upsert';
  end if;

  if v_should_delete_mirror and v_existing.notion_page_id is not null then
    insert into public.receipt_sync_jobs (
      receipt_id, trip_id, owner_id, provider, operation, status, attempts,
      next_attempt_at, locked_at, locked_by, last_error, payload
    ) values (
      v_receipt.id, p_trip_id, v_user, 'notion', 'delete', 'pending', 0,
      clock_timestamp(), null, null, null,
      jsonb_build_object('idempotencyKey', nullif(btrim(p_idempotency_key), ''),
        'sourceId', v_receipt.source_id, 'version', v_receipt.version,
        'syncRevision', v_receipt.sync_revision, 'queuedBy', v_user,
        'queuedAt', clock_timestamp())
    )
    on conflict (receipt_id, provider)
    do update set operation = 'delete', status = 'pending', attempts = 0,
      next_attempt_at = clock_timestamp(), locked_at = null, locked_by = null,
      last_error = null, payload = excluded.payload, updated_at = clock_timestamp();
  elsif v_has_backend and v_visibility = 'trip' then
    insert into public.receipt_sync_jobs (
      receipt_id, trip_id, owner_id, provider, operation, status, attempts,
      next_attempt_at, locked_at, locked_by, last_error, payload
    ) values (
      v_receipt.id, p_trip_id, v_user, 'notion', 'upsert', 'pending', 0,
      clock_timestamp(), null, null, null,
      jsonb_build_object('idempotencyKey', nullif(btrim(p_idempotency_key), ''),
        'sourceId', v_receipt.source_id, 'version', v_receipt.version,
        'syncRevision', v_receipt.sync_revision, 'queuedBy', v_user,
        'queuedAt', clock_timestamp())
    )
    on conflict (receipt_id, provider)
    do update set operation = 'upsert', status = 'pending', attempts = 0,
      next_attempt_at = clock_timestamp(), locked_at = null, locked_by = null,
      last_error = null, payload = excluded.payload, updated_at = clock_timestamp();
  end if;

  return query select * from public.receipts where id = v_receipt.id;
end;
$$;

create or replace function public.delete_receipt_v2(
  p_trip_id uuid,
  p_receipt_id uuid,
  p_expected_version integer,
  p_idempotency_key text default null
)
returns setof public.receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_receipt public.receipts%rowtype;
  v_has_backend boolean;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not private.can_edit_trip(p_trip_id) then raise exception 'Trip editor role required' using errcode = '42501'; end if;

  select * into v_receipt
  from public.receipts
  where id = p_receipt_id and trip_id = p_trip_id
  for update;

  if v_receipt.id is null then raise exception 'Receipt not found' using errcode = 'P0002'; end if;
  if v_receipt.owner_id <> v_user then raise exception 'Only the original receipt owner can delete this receipt' using errcode = '42501'; end if;
  if coalesce(v_receipt.version, 1) <> p_expected_version then
    raise exception 'Receipt version conflict' using errcode = '40001';
  end if;
  if v_receipt.deleted_at is not null then
    return query select * from public.receipts where id = v_receipt.id;
    return;
  end if;

  select exists (
    select 1 from public.trip_backend_links
    where trip_id = p_trip_id and status = 'active' and sync_mode = 'dual_write'
  ) into v_has_backend;

  update public.receipts
  set status = 'deleted', deleted_at = clock_timestamp(),
      notion_sync_status = case when v_has_backend and visibility = 'trip' then 'pending' else 'disabled' end,
      notion_last_queued_at = case when v_has_backend and visibility = 'trip' then clock_timestamp() else null end,
      notion_sync_error = null, version = coalesce(version, 1) + 1,
      sync_revision = nextval('private.receipt_sync_revision_seq'),
      updated_at = clock_timestamp()
  where id = v_receipt.id
  returning * into v_receipt;

  update public.receipt_sync_jobs
  set status = 'cancelled', locked_at = null, locked_by = null, updated_at = clock_timestamp()
  where receipt_id = v_receipt.id and provider = 'notion' and operation = 'upsert';

  if v_has_backend and v_receipt.visibility = 'trip' then
    insert into public.receipt_sync_jobs (
      receipt_id, trip_id, owner_id, provider, operation, status, attempts,
      next_attempt_at, locked_at, locked_by, last_error, payload
    ) values (
      v_receipt.id, p_trip_id, v_user, 'notion', 'delete', 'pending', 0,
      clock_timestamp(), null, null, null,
      jsonb_build_object('idempotencyKey', nullif(btrim(p_idempotency_key), ''),
        'sourceId', v_receipt.source_id, 'version', v_receipt.version,
        'syncRevision', v_receipt.sync_revision, 'queuedBy', v_user,
        'queuedAt', clock_timestamp())
    )
    on conflict (receipt_id, provider)
    do update set operation = 'delete', status = 'pending', attempts = 0,
      next_attempt_at = clock_timestamp(), locked_at = null, locked_by = null,
      last_error = null, payload = excluded.payload, updated_at = clock_timestamp();
  end if;

  return query select * from public.receipts where id = v_receipt.id;
end;
$$;

create or replace function public.restore_receipt_v2(
  p_trip_id uuid,
  p_receipt_id uuid,
  p_expected_version integer,
  p_idempotency_key text default null
)
returns setof public.receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_receipt public.receipts%rowtype;
  v_has_backend boolean;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not private.can_edit_trip(p_trip_id) then raise exception 'Trip editor role required' using errcode = '42501'; end if;

  select * into v_receipt
  from public.receipts
  where id = p_receipt_id and trip_id = p_trip_id
  for update;

  if v_receipt.id is null then raise exception 'Receipt not found' using errcode = 'P0002'; end if;
  if v_receipt.owner_id <> v_user then raise exception 'Only the original receipt owner can restore this receipt' using errcode = '42501'; end if;
  if coalesce(v_receipt.version, 1) <> p_expected_version then
    raise exception 'Receipt version conflict' using errcode = '40001';
  end if;
  if v_receipt.deleted_at is null then
    raise exception 'Receipt is not deleted' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.trip_backend_links
    where trip_id = p_trip_id and status = 'active' and sync_mode = 'dual_write'
  ) into v_has_backend;

  update public.receipts
  set status = 'confirmed', deleted_at = null,
      notion_sync_status = case when v_has_backend and visibility = 'trip' then 'pending' else 'disabled' end,
      notion_last_queued_at = case when v_has_backend and visibility = 'trip' then clock_timestamp() else null end,
      notion_sync_error = null, version = coalesce(version, 1) + 1,
      sync_revision = nextval('private.receipt_sync_revision_seq'),
      updated_at = clock_timestamp()
  where id = v_receipt.id
  returning * into v_receipt;

  if v_has_backend and v_receipt.visibility = 'trip' then
    insert into public.receipt_sync_jobs (
      receipt_id, trip_id, owner_id, provider, operation, status, attempts,
      next_attempt_at, locked_at, locked_by, last_error, payload
    ) values (
      v_receipt.id, p_trip_id, v_user, 'notion', 'upsert', 'pending', 0,
      clock_timestamp(), null, null, null,
      jsonb_build_object('idempotencyKey', nullif(btrim(p_idempotency_key), ''),
        'sourceId', v_receipt.source_id, 'version', v_receipt.version,
        'syncRevision', v_receipt.sync_revision, 'queuedBy', v_user,
        'queuedAt', clock_timestamp())
    )
    on conflict (receipt_id, provider)
    do update set operation = 'upsert', status = 'pending', attempts = 0,
      next_attempt_at = clock_timestamp(), locked_at = null, locked_by = null,
      last_error = null, payload = excluded.payload, updated_at = clock_timestamp();
  end if;

  return query select * from public.receipts where id = v_receipt.id;
end;
$$;

create or replace function public.claim_receipt_sync_jobs(
  p_trip_ids uuid[],
  p_provider text default 'notion',
  p_worker text default null,
  p_limit integer default 20
)
returns setof public.receipt_sync_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_provider <> 'notion' then raise exception 'Unsupported sync provider' using errcode = '22023'; end if;
  if p_worker is not null and btrim(p_worker) <> '' and btrim(p_worker) <> v_user::text then
    raise exception 'Worker identity must match authenticated user' using errcode = '42501';
  end if;

  return query
  with candidate as (
    select j.id
    from public.receipt_sync_jobs j
    where j.provider = p_provider
      and j.trip_id = any(coalesce(p_trip_ids, array[]::uuid[]))
      and j.status in ('pending', 'failed')
      and j.next_attempt_at <= clock_timestamp()
      and j.attempts < 5
      and (j.locked_at is null or j.locked_at < clock_timestamp() - interval '120 seconds')
      and private.can_admin_trip(j.trip_id)
    order by j.next_attempt_at, j.id
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    for update skip locked
  )
  update public.receipt_sync_jobs j
  set status = 'processing', locked_at = clock_timestamp(), locked_by = v_user::text,
      last_error = null, updated_at = clock_timestamp()
  from candidate
  where j.id = candidate.id
  returning j.*;
end;
$$;

create or replace function public.finish_receipt_sync_job(
  p_job_id uuid,
  p_status text,
  p_error text default null
)
returns public.receipt_sync_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_job public.receipt_sync_jobs%rowtype;
  v_attempts integer;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_status not in ('succeeded', 'failed') then
    raise exception 'Invalid terminal sync status' using errcode = '22023';
  end if;

  select * into v_job
  from public.receipt_sync_jobs
  where id = p_job_id
  for update;

  if v_job.id is null then raise exception 'Sync job not found' using errcode = 'P0002'; end if;
  if not private.can_admin_trip(v_job.trip_id) then
    raise exception 'Trip owner or admin required' using errcode = '42501';
  end if;
  if v_job.status <> 'processing' or v_job.locked_by <> v_user::text then
    raise exception 'Sync job is not owned by this worker' using errcode = '40001';
  end if;

  if p_status = 'succeeded' then
    update public.receipt_sync_jobs
    set status = 'succeeded', locked_at = null, locked_by = null, last_error = null,
        updated_at = clock_timestamp()
    where id = v_job.id
    returning * into v_job;

    update public.receipts
    set notion_sync_status = case when visibility = 'private' then 'disabled' else 'synced' end,
        notion_sync_error = null,
        notion_sync_attempts = v_job.attempts,
        notion_last_synced_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = v_job.receipt_id;
  else
    v_attempts := v_job.attempts + 1;
    update public.receipt_sync_jobs
    set status = 'failed', attempts = v_attempts,
        next_attempt_at = clock_timestamp() + make_interval(mins => least(60, power(2, least(v_attempts, 6))::integer)),
        locked_at = null, locked_by = null,
        last_error = left(coalesce(nullif(btrim(p_error), ''), 'Notion sync failed'), 500),
        updated_at = clock_timestamp()
    where id = v_job.id
    returning * into v_job;

    update public.receipts
    set notion_sync_status = 'failed', notion_sync_error = v_job.last_error,
        notion_sync_attempts = v_attempts, updated_at = clock_timestamp()
    where id = v_job.receipt_id;
  end if;

  return v_job;
end;
$$;

revoke all on function public.upsert_shared_trip_receipt(uuid, jsonb, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.delete_shared_trip_receipt(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.delete_receipt_v2(uuid, uuid, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.restore_receipt_v2(uuid, uuid, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_receipt_sync_jobs(uuid[], text, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.finish_receipt_sync_job(uuid, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.upsert_shared_trip_receipt(uuid, jsonb, uuid, text, text)
  to authenticated, service_role;
grant execute on function public.delete_receipt_v2(uuid, uuid, integer, text)
  to authenticated, service_role;
grant execute on function public.restore_receipt_v2(uuid, uuid, integer, text)
  to authenticated, service_role;
grant execute on function public.claim_receipt_sync_jobs(uuid[], text, text, integer)
  to authenticated, service_role;
grant execute on function public.finish_receipt_sync_job(uuid, text, text)
  to authenticated, service_role;

revoke insert, update, delete on table public.receipts from authenticated;
revoke insert, update, delete on table public.receipt_sync_jobs from authenticated;
grant select on table public.receipt_sync_jobs to authenticated;

grant admin_read_owner to postgres;
grant usage, create on schema private to admin_read_owner;
set role admin_read_owner;

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
  r.record_kind,
  coalesce(r.visibility, 'trip') as visibility,
  r.category,
  r.payment_method,
  r.status,
  r.notion_sync_status,
  r.version,
  r.deleted_at,
  r.created_at,
  r.updated_at,
  exists (select 1 from public.receipt_photos photo where photo.receipt_id = r.id) as has_photo,
  case
    when r.deleted_at is not null then 'trash'
    when r.record_date < t.start_date or r.record_date > t.end_date then 'issue'
    when r.notion_sync_status = 'failed' then 'issue'
    else 'healthy'
  end as integrity_status,
  r.sync_revision,
  r.split_mode,
  r.split_type
from public.receipts r
left join public.trips t on t.id = r.trip_id
left join private.admin_auth_user_rows() u on u.id = r.owner_id;

reset role;
revoke create on schema private from admin_read_owner;
revoke admin_read_owner from postgres;
