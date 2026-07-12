-- Harden shared invite acceptance and collaborative receipt updates.
--
-- Fixes:
-- - Accepting a duplicate invite must not downgrade an existing member role.
-- - Shared receipt updates must use optimistic locking through receipts.version.

create or replace function private.trip_member_role_rank(p_role text)
returns integer
language sql
immutable
as $$
  select case coalesce(p_role, 'viewer')
    when 'owner' then 4
    when 'admin' then 3
    when 'editor' then 2
    when 'viewer' then 1
    else 0
  end
$$;

create or replace function public.accept_trip_invite(p_token text)
returns table (
  trip_id uuid,
  role text,
  status text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text := encode(digest(btrim(coalesce(p_token, '')), 'sha256'), 'hex');
  v_invite public.trip_invites%rowtype;
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if v_email = '' then
    raise exception 'Authenticated email required';
  end if;

  select *
  into v_invite
  from public.trip_invites
  where token_hash = v_hash
  for update;

  if v_invite.id is null then
    raise exception 'Invite not found';
  end if;
  if v_invite.status <> 'pending' then
    raise exception 'Invite is not pending';
  end if;
  if v_invite.expires_at <= now() then
    update public.trip_invites
    set status = 'expired', updated_at = now()
    where id = v_invite.id;
    trip_id := v_invite.trip_id;
    role := v_invite.role;
    status := 'expired';
    return next;
  end if;
  if v_invite.email_normalized <> v_email then
    raise exception 'Invite email does not match signed-in user';
  end if;

  insert into public.trip_members (trip_id, user_id, role, status)
  values (v_invite.trip_id, (select auth.uid()), v_invite.role, 'active')
  on conflict (trip_id, user_id)
  do update set role = case
                         when private.trip_member_role_rank(trip_members.role) >= private.trip_member_role_rank(excluded.role)
                           then trip_members.role
                         else excluded.role
                       end,
                status = 'active',
                updated_at = now();

  update public.trip_invites
  set status = 'accepted', accepted_by = (select auth.uid()), updated_at = now()
  where id = v_invite.id;

  trip_id := v_invite.trip_id;
  select tm.role
  into role
  from public.trip_members tm
  where tm.trip_id = v_invite.trip_id
    and tm.user_id = (select auth.uid());
  status := 'accepted';
  return next;
end;
$$;

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
  v_expected_version integer := null;
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

  if coalesce(p_receipt->>'version', '') ~ '^\d+$' then
    v_expected_version := (p_receipt->>'version')::integer;
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
  if v_existing.id is not null
     and v_expected_version is not null
     and coalesce(v_existing.version, 1) <> v_expected_version then
    raise exception 'Receipt version conflict'
      using errcode = '40001',
            detail = format('expected version %s but found %s', v_expected_version, coalesce(v_existing.version, 1));
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
      version,
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
      1,
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
        version = coalesce(v_existing.version, 1) + 1,
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
        'version', v_receipt.version,
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

revoke execute on function private.trip_member_role_rank(text) from public, anon;
grant execute on function private.trip_member_role_rank(text) to authenticated;

revoke execute on function public.accept_trip_invite(text) from public, anon;
grant execute on function public.accept_trip_invite(text) to authenticated;

revoke execute on function public.upsert_shared_trip_receipt(uuid, jsonb, uuid, text, text) from public, anon;
grant execute on function public.upsert_shared_trip_receipt(uuid, jsonb, uuid, text, text) to authenticated;
