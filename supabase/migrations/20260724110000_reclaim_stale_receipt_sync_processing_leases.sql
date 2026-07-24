-- Reclaim only expired receipt-sync processing leases. Fresh leases remain owned.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

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
      and j.status in ('pending', 'failed', 'processing')
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

create or replace function public.claim_receipt_sync_jobs_worker(
  p_worker text,
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_worker !~ '^receipt-sync:[A-Za-z0-9._:-]{8,112}$'
    or p_limit < 1 or p_limit > 20 then
    raise exception 'Invalid receipt sync worker claim' using errcode = '22023';
  end if;

  update public.receipt_sync_jobs job
  set status = 'cancelled', locked_at = null, locked_by = null,
      last_error = 'Private receipts are never mirrored to Notion',
      updated_at = clock_timestamp()
  from public.receipts receipt
  where receipt.id = job.receipt_id
    and receipt.visibility = 'private'
    and job.status in ('pending', 'failed', 'processing');

  update public.receipts receipt
  set notion_sync_status = 'disabled', notion_sync_error = null,
      updated_at = clock_timestamp()
  where receipt.visibility = 'private'
    and receipt.notion_sync_status <> 'disabled';

  with candidate as materialized (
    select job.id
    from public.receipt_sync_jobs job
    join public.receipts receipt on receipt.id = job.receipt_id
    join public.trip_backend_links link on link.trip_id = job.trip_id
    where job.provider = 'notion'
      and job.status in ('pending', 'failed', 'processing')
      and job.next_attempt_at <= clock_timestamp()
      and job.attempts < 5
      and (job.locked_at is null or job.locked_at < clock_timestamp() - interval '120 seconds')
      and receipt.visibility = 'trip'
      and link.status = 'active'
      and link.sync_mode = 'dual_write'
    order by job.next_attempt_at, job.id
    limit p_limit
    for update of job skip locked
  ), claimed as (
    update public.receipt_sync_jobs job
    set status = 'processing', locked_at = clock_timestamp(), locked_by = p_worker,
        last_error = null, updated_at = clock_timestamp()
    from candidate
    where job.id = candidate.id
    returning job.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', job.id,
    'receiptId', job.receipt_id,
    'tripId', job.trip_id,
    'ownerId', job.owner_id,
    'operation', case when receipt.deleted_at is null then job.operation else 'delete' end,
    'attempts', job.attempts,
    'payload', job.payload,
    'databaseRef', link.notion_database_ref,
    'notionOwnerUserId', link.notion_owner_user_id,
    'notionTripId', coalesce(
      nullif(trip.app_metadata ->> 'localTripId', ''),
      nullif(trip.legacy_source_id, ''),
      trip.id::text
    ),
    'receipt', jsonb_build_object(
      'id', receipt.id,
      'sourceId', receipt.source_id,
      'store', receipt.store,
      'recordDate', receipt.record_date,
      'recordTime', receipt.record_time,
      'amount', receipt.amount,
      'currency', receipt.currency,
      'category', receipt.category,
      'paymentMethod', receipt.payment_method,
      'note', receipt.note,
      'address', receipt.address,
      'itemsText', receipt.items_text,
      'recordKind', receipt.record_kind,
      'visibility', receipt.visibility,
      'version', receipt.version,
      'deletedAt', receipt.deleted_at
    )
  ) order by job.next_attempt_at, job.id), '[]'::jsonb)
  into v_result
  from claimed job
  join public.receipts receipt on receipt.id = job.receipt_id
  join public.trips trip on trip.id = job.trip_id
  join public.trip_backend_links link on link.trip_id = job.trip_id;

  return v_result;
end;
$$;

alter function public.claim_receipt_sync_jobs_worker(text, integer)
  owner to receipt_sync_owner;

revoke all on function public.claim_receipt_sync_jobs(uuid[], text, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_receipt_sync_jobs_worker(text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_receipt_sync_jobs(uuid[], text, text, integer)
  to authenticated, service_role;
grant execute on function public.claim_receipt_sync_jobs_worker(text, integer)
  to service_role;

commit;
