-- Shared-trip receipt mutation RPCs.
--
-- These functions move collaborative receipt writes into one server-side
-- Supabase mutation path and create durable Notion outbox jobs when a trip has
-- an active dual-write backend link. They intentionally do not expose Notion
-- credentials or claim Notion sync before a worker completes the job.

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
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_existing public.receipts%rowtype;
  v_receipt public.receipts%rowtype;
  v_source_id text := coalesce(nullif(btrim(p_source_id), ''), nullif(btrim(p_receipt->>'source_id'), ''));
  v_record_date date;
  v_record_time time;
  v_amount numeric;
  v_home_amount numeric;
  v_original_amount numeric;
  v_exchange_rate numeric;
  v_has_backend boolean;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if not private.can_edit_trip(p_trip_id) then
    raise exception 'Trip editor role required';
  end if;
  if p_receipt is null or jsonb_typeof(p_receipt) <> 'object' then
    raise exception 'Receipt payload must be a JSON object';
  end if;

  insert into public.profiles (id)
  values (v_user)
  on conflict (id) do nothing;

  if v_source_id is null then
    v_source_id := coalesce(p_receipt_id::text, gen_random_uuid()::text);
  end if;

  if coalesce(p_receipt->>'record_date', '') ~ '^\d{4}-\d{2}-\d{2}$' then
    v_record_date := (p_receipt->>'record_date')::date;
  else
    v_record_date := current_date;
  end if;

  if coalesce(p_receipt->>'record_time', '') ~ '^\d{1,2}:\d{2}(:\d{2})?$' then
    v_record_time := (p_receipt->>'record_time')::time;
  else
    v_record_time := null;
  end if;

  v_amount := case
    when coalesce(p_receipt->>'amount', '') ~ '^-?\d+(\.\d+)?$' then greatest((p_receipt->>'amount')::numeric, 0)
    else 0
  end;
  v_home_amount := case
    when coalesce(p_receipt->>'home_amount', '') ~ '^-?\d+(\.\d+)?$' then greatest((p_receipt->>'home_amount')::numeric, 0)
    else null
  end;
  v_original_amount := case
    when coalesce(p_receipt->>'original_amount', '') ~ '^-?\d+(\.\d+)?$' then greatest((p_receipt->>'original_amount')::numeric, 0)
    else null
  end;
  v_exchange_rate := case
    when coalesce(p_receipt->>'exchange_rate', '') ~ '^-?\d+(\.\d+)?$' then greatest((p_receipt->>'exchange_rate')::numeric, 0)
    else null
  end;

  select *
  into v_existing
  from public.receipts
  where trip_id = p_trip_id
    and (
      (p_receipt_id is not null and id = p_receipt_id)
      or (source_id = v_source_id)
    )
  order by case when p_receipt_id is not null and id = p_receipt_id then 0 else 1 end
  limit 1
  for update;

  if v_existing.id is not null and v_existing.owner_id <> v_user then
    raise exception 'Only the original receipt owner can update this receipt';
  end if;

  select exists (
    select 1
    from public.trip_backend_links
    where trip_id = p_trip_id
      and status = 'active'
      and sync_mode = 'dual_write'
  ) into v_has_backend;

  if v_existing.id is null then
    insert into public.receipts (
      id,
      trip_id,
      owner_id,
      store,
      record_date,
      record_time,
      category,
      payment_method,
      amount,
      currency,
      home_amount,
      home_currency,
      original_amount,
      original_currency,
      exchange_rate,
      items_text,
      note,
      address,
      booking_ref,
      source_id,
      status,
      confidence,
      map_url,
      notion_sync_status,
      notion_last_queued_at,
      created_at,
      updated_at
    )
    values (
      coalesce(p_receipt_id, gen_random_uuid()),
      p_trip_id,
      v_user,
      coalesce(nullif(btrim(p_receipt->>'store'), ''), '未命名'),
      v_record_date,
      v_record_time,
      nullif(btrim(p_receipt->>'category'), ''),
      nullif(btrim(p_receipt->>'payment_method'), ''),
      v_amount,
      coalesce(nullif(btrim(p_receipt->>'currency'), ''), 'JPY'),
      v_home_amount,
      coalesce(nullif(btrim(p_receipt->>'home_currency'), ''), 'HKD'),
      v_original_amount,
      nullif(btrim(p_receipt->>'original_currency'), ''),
      v_exchange_rate,
      nullif(p_receipt->>'items_text', ''),
      nullif(p_receipt->>'note', ''),
      nullif(p_receipt->>'address', ''),
      nullif(p_receipt->>'booking_ref', ''),
      v_source_id,
      'confirmed',
      nullif(btrim(p_receipt->>'confidence'), ''),
      nullif(p_receipt->>'map_url', ''),
      case when v_has_backend then 'pending' else 'disabled' end,
      case when v_has_backend then now() else null end,
      now(),
      now()
    )
    returning * into v_receipt;
  else
    update public.receipts
    set store = coalesce(nullif(btrim(p_receipt->>'store'), ''), store),
        record_date = v_record_date,
        record_time = v_record_time,
        category = nullif(btrim(p_receipt->>'category'), ''),
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
        deleted_at = null,
        notion_sync_status = case when v_has_backend then 'pending' else 'disabled' end,
        notion_last_queued_at = case when v_has_backend then now() else null end,
        notion_sync_error = null,
        updated_at = now()
    where id = v_existing.id
    returning * into v_receipt;
  end if;

  if v_has_backend then
    insert into public.receipt_sync_jobs (
      receipt_id,
      trip_id,
      owner_id,
      provider,
      operation,
      status,
      attempts,
      next_attempt_at,
      last_error,
      payload
    )
    values (
      v_receipt.id,
      p_trip_id,
      v_user,
      'notion',
      'upsert',
      'pending',
      0,
      now(),
      null,
      jsonb_build_object(
        'idempotencyKey', nullif(btrim(p_idempotency_key), ''),
        'sourceId', v_receipt.source_id,
        'queuedBy', v_user,
        'queuedAt', now()
      )
    )
    on conflict (receipt_id, provider)
    do update set operation = 'upsert',
                  status = 'pending',
                  attempts = 0,
                  next_attempt_at = now(),
                  locked_at = null,
                  locked_by = null,
                  last_error = null,
                  payload = excluded.payload,
                  updated_at = now();
  end if;

  return query select * from public.receipts where id = v_receipt.id;
end;
$$;

create or replace function public.delete_shared_trip_receipt(
  p_trip_id uuid,
  p_receipt_id uuid default null,
  p_source_id text default null,
  p_idempotency_key text default null
)
returns setof public.receipts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_receipt public.receipts%rowtype;
  v_source_id text := nullif(btrim(p_source_id), '');
  v_has_backend boolean;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if not private.can_edit_trip(p_trip_id) then
    raise exception 'Trip editor role required';
  end if;

  insert into public.profiles (id)
  values (v_user)
  on conflict (id) do nothing;

  select exists (
    select 1
    from public.trip_backend_links
    where trip_id = p_trip_id
      and status = 'active'
      and sync_mode = 'dual_write'
  ) into v_has_backend;

  select *
  into v_receipt
  from public.receipts
  where trip_id = p_trip_id
    and (
      (p_receipt_id is not null and id = p_receipt_id)
      or (v_source_id is not null and source_id = v_source_id)
    )
  order by case when p_receipt_id is not null and id = p_receipt_id then 0 else 1 end
  limit 1
  for update;

  if v_receipt.id is null then
    raise exception 'Receipt not found';
  end if;
  if v_receipt.owner_id <> v_user then
    raise exception 'Only the original receipt owner can delete this receipt';
  end if;

  update public.receipts
  set status = 'deleted',
      deleted_at = now(),
      notion_sync_status = case when v_has_backend then 'pending' else 'disabled' end,
      notion_last_queued_at = case when v_has_backend then now() else null end,
      notion_sync_error = null,
      updated_at = now()
  where id = v_receipt.id
  returning * into v_receipt;

  if v_has_backend then
    insert into public.receipt_sync_jobs (
      receipt_id,
      trip_id,
      owner_id,
      provider,
      operation,
      status,
      attempts,
      next_attempt_at,
      last_error,
      payload
    )
    values (
      v_receipt.id,
      p_trip_id,
      v_user,
      'notion',
      'delete',
      'pending',
      0,
      now(),
      null,
      jsonb_build_object(
        'idempotencyKey', nullif(btrim(p_idempotency_key), ''),
        'sourceId', v_receipt.source_id,
        'queuedBy', v_user,
        'queuedAt', now()
      )
    )
    on conflict (receipt_id, provider)
    do update set operation = 'delete',
                  status = 'pending',
                  attempts = 0,
                  next_attempt_at = now(),
                  locked_at = null,
                  locked_by = null,
                  last_error = null,
                  payload = excluded.payload,
                  updated_at = now();
  end if;

  return query select * from public.receipts where id = v_receipt.id;
end;
$$;

revoke execute on function public.upsert_shared_trip_receipt(uuid, jsonb, uuid, text, text) from public, anon;
revoke execute on function public.delete_shared_trip_receipt(uuid, uuid, text, text) from public, anon;
grant execute on function public.upsert_shared_trip_receipt(uuid, jsonb, uuid, text, text) to authenticated;
grant execute on function public.delete_shared_trip_receipt(uuid, uuid, text, text) to authenticated;;
