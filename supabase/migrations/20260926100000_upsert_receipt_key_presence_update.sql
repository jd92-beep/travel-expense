-- Harden upsert_shared_trip_receipt UPDATE branch: key-presence semantics.
--
-- Problem: the canonical contract's UPDATE branch assigned most columns directly from
-- the payload (nullif(p_receipt->>'note', '') etc.). A payload MISSING a key therefore
-- overwrote the stored value with NULL (or worse: amount→0, record_date→current_date,
-- visibility→'trip', record_kind→'expense'), silently destroying data for any caller
-- that sends a partial receipt. Today's clients always send a full payload, so this is
-- a latent contract bug, not a live incident — but the RPC is the only write path and
-- must not depend on caller discipline.
--
-- Fix: every column in the UPDATE branch now only changes when its key is PRESENT in
-- the payload (`p_receipt ? 'field'`). Present-but-empty still clears the value, so
-- intentional clears (e.g. deleting a note) keep working exactly as before.
--
-- No table/index/policy changes; CREATE OR REPLACE preserves existing grants.

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
  v_effective_visibility text;
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

  -- Effective visibility after this write: the payload's value when present, else the
  -- stored value. Drives both the UPDATE assignment and the Notion mirror job logic so
  -- a partial payload can never silently flip a private receipt back to 'trip'.
  v_effective_visibility := case
    when p_receipt ? 'visibility' or v_existing.id is null then v_visibility
    else coalesce(v_existing.visibility, 'trip')
  end;

  v_should_delete_mirror := v_effective_visibility = 'private'
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
    -- Key-presence UPDATE: a column only changes when its key is present in the payload.
    -- Present-but-empty clears (intentional clear); absent preserves the stored value.
    update public.receipts
    set store = case when p_receipt ? 'store' then coalesce(nullif(btrim(p_receipt->>'store'), ''), store) else store end,
        record_date = case when p_receipt ? 'record_date' then v_record_date else record_date end,
        record_time = case when p_receipt ? 'record_time' then v_record_time else record_time end,
        category = case when p_receipt ? 'category' or p_receipt ? 'record_kind' then v_category else category end,
        record_kind = case when p_receipt ? 'record_kind' or p_receipt ? 'category' then v_record_kind else record_kind end,
        payment_method = case when p_receipt ? 'payment_method' then nullif(btrim(p_receipt->>'payment_method'), '') else payment_method end,
        amount = case when p_receipt ? 'amount' then v_amount else amount end,
        currency = case when p_receipt ? 'currency' then coalesce(nullif(btrim(p_receipt->>'currency'), ''), currency) else currency end,
        home_amount = case when p_receipt ? 'home_amount' then v_home_amount else home_amount end,
        home_currency = case when p_receipt ? 'home_currency' then coalesce(nullif(btrim(p_receipt->>'home_currency'), ''), home_currency) else home_currency end,
        original_amount = case when p_receipt ? 'original_amount' then v_original_amount else original_amount end,
        original_currency = case when p_receipt ? 'original_currency' then nullif(btrim(p_receipt->>'original_currency'), '') else original_currency end,
        exchange_rate = case when p_receipt ? 'exchange_rate' then v_exchange_rate else exchange_rate end,
        items_text = case when p_receipt ? 'items_text' then nullif(p_receipt->>'items_text', '') else items_text end,
        note = case when p_receipt ? 'note' then nullif(p_receipt->>'note', '') else note end,
        address = case when p_receipt ? 'address' then nullif(p_receipt->>'address', '') else address end,
        booking_ref = case when p_receipt ? 'booking_ref' then nullif(p_receipt->>'booking_ref', '') else booking_ref end,
        source_id = v_source_id,
        status = 'confirmed',
        confidence = case when p_receipt ? 'confidence' then nullif(btrim(p_receipt->>'confidence'), '') else confidence end,
        map_url = case when p_receipt ? 'map_url' then nullif(p_receipt->>'map_url', '') else map_url end,
        visibility = case when p_receipt ? 'visibility' then v_visibility else visibility end,
        split_mode = case
          when p_receipt ? 'split_mode' or p_receipt ? 'visibility' then v_split_mode
          else split_mode
        end,
        split_type = case when p_receipt ? 'split_type' then v_split_type else split_type end,
        splits = case when p_receipt ? 'splits' then v_splits else splits end,
        payers = case when p_receipt ? 'payers' then v_payers else payers end,
        person_id = case when p_receipt ? 'person_id' then nullif(btrim(p_receipt->>'person_id'), '') else person_id end,
        beneficiary_id = case when p_receipt ? 'beneficiary_id' then nullif(btrim(p_receipt->>'beneficiary_id'), '') else beneficiary_id end,
        notion_sync_status = case
          when v_should_delete_mirror and v_existing.notion_page_id is not null then 'pending'
          when v_has_backend and v_effective_visibility = 'trip' then 'pending'
          else 'disabled'
        end,
        notion_last_queued_at = case
          when v_should_delete_mirror and v_existing.notion_page_id is not null then clock_timestamp()
          when v_has_backend and v_effective_visibility = 'trip' then clock_timestamp()
          else null
        end,
        notion_sync_error = null,
        version = coalesce(v_existing.version, 1) + 1,
        sync_revision = nextval('private.receipt_sync_revision_seq'),
        updated_at = clock_timestamp()
    where id = v_existing.id
    returning * into v_receipt;
  end if;

  if v_effective_visibility = 'private' then
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
  elsif v_has_backend and v_effective_visibility = 'trip' then
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
