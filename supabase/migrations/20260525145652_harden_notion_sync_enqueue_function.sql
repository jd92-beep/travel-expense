create or replace function public.enqueue_notion_receipt_sync(
  p_receipt_id uuid,
  p_operation text default 'upsert',
  p_payload jsonb default '{}'::jsonb
)
returns public.receipt_sync_jobs
language plpgsql
security invoker
set search_path = public, private
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

  insert into public.receipt_sync_jobs as jobs (
    receipt_id,
    trip_id,
    owner_id,
    provider,
    operation,
    status,
    attempts,
    next_attempt_at,
    locked_at,
    locked_by,
    last_error,
    payload
  ) values (
    v_receipt.id,
    v_receipt.trip_id,
    v_receipt.owner_id,
    'notion',
    p_operation,
    'pending',
    0,
    now(),
    null,
    null,
    null,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (receipt_id, provider)
  do update set
    operation = excluded.operation,
    status = 'pending',
    attempts = 0,
    next_attempt_at = now(),
    locked_at = null,
    locked_by = null,
    last_error = null,
    payload = excluded.payload,
    updated_at = now()
  returning * into v_job;

  update public.receipts
  set notion_sync_status = 'pending',
      notion_sync_error = null,
      notion_sync_attempts = 0,
      notion_last_queued_at = now(),
      updated_at = now()
  where id = v_receipt.id;

  return v_job;
end;
$$;

revoke execute on function public.enqueue_notion_receipt_sync(uuid, text, jsonb) from public;
revoke execute on function public.enqueue_notion_receipt_sync(uuid, text, jsonb) from anon;
grant execute on function public.enqueue_notion_receipt_sync(uuid, text, jsonb) to authenticated;

comment on function public.enqueue_notion_receipt_sync(uuid, text, jsonb) is 'Marks a receipt pending for Notion mirror sync and upserts its active sync job. Runs as SECURITY INVOKER so RLS remains authoritative.';;
