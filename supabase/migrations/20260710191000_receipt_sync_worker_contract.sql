-- Server-owned receipt outbox claims and completion. Browser roles keep their
-- existing owner/admin worker RPCs; only service_role can call this fixed path.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'receipt_sync_owner') then
    create role receipt_sync_owner nologin noinherit;
  end if;
end
$$;

grant receipt_sync_owner to postgres;
grant usage, create on schema public to receipt_sync_owner;
grant usage on schema extensions to receipt_sync_owner;
grant select, update on public.receipt_sync_jobs to receipt_sync_owner;
grant select, update on public.receipts to receipt_sync_owner;
grant select on public.trips, public.trip_backend_links to receipt_sync_owner;

drop policy if exists receipt_sync_owner_jobs on public.receipt_sync_jobs;
create policy receipt_sync_owner_jobs
  on public.receipt_sync_jobs for all to receipt_sync_owner
  using (true) with check (true);

drop policy if exists receipt_sync_owner_receipts_select on public.receipts;
create policy receipt_sync_owner_receipts_select
  on public.receipts for select to receipt_sync_owner using (true);
drop policy if exists receipt_sync_owner_receipts_update on public.receipts;
create policy receipt_sync_owner_receipts_update
  on public.receipts for update to receipt_sync_owner using (true) with check (true);

drop policy if exists receipt_sync_owner_trips_select on public.trips;
create policy receipt_sync_owner_trips_select
  on public.trips for select to receipt_sync_owner using (true);
drop policy if exists receipt_sync_owner_backend_links_select on public.trip_backend_links;
create policy receipt_sync_owner_backend_links_select
  on public.trip_backend_links for select to receipt_sync_owner using (true);

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
      and job.status in ('pending', 'failed')
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

create or replace function public.finish_receipt_sync_job_worker(
  p_job_id uuid,
  p_worker text,
  p_status text,
  p_notion_page_id text default null,
  p_error_code text default null,
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.receipt_sync_jobs%rowtype;
  v_attempts integer;
  v_error text;
begin
  if p_worker !~ '^receipt-sync:[A-Za-z0-9._:-]{8,112}$'
    or p_status not in ('succeeded', 'failed')
    or (p_notion_page_id is not null and length(p_notion_page_id) > 100)
    or (p_error_code is not null and p_error_code !~ '^[A-Z0-9_]{3,64}$') then
    raise exception 'Invalid receipt sync worker result' using errcode = '22023';
  end if;

  select * into v_job
  from public.receipt_sync_jobs
  where id = p_job_id
  for update;
  if not found then raise exception 'Sync job not found' using errcode = 'P0002'; end if;

  if v_job.status = 'succeeded' and p_status = 'succeeded' then
    return jsonb_build_object('id', v_job.id, 'status', v_job.status, 'reused', true);
  end if;
  if v_job.status <> 'processing' or v_job.locked_by <> p_worker then
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
        notion_page_id = case
          when nullif(btrim(coalesce(p_notion_page_id, '')), '') is null then notion_page_id
          else btrim(p_notion_page_id)
        end,
        updated_at = clock_timestamp()
    where id = v_job.receipt_id;
  else
    v_attempts := v_job.attempts + 1;
    v_error := left(
      coalesce(nullif(p_error_code, ''), 'NOTION_SYNC_FAILED') || ': ' ||
      coalesce(nullif(btrim(p_error_message), ''), 'Notion sync failed'),
      500
    );
    update public.receipt_sync_jobs
    set status = 'failed', attempts = v_attempts,
        next_attempt_at = clock_timestamp() + make_interval(
          mins => least(60, power(2, least(v_attempts, 6))::integer)
        ),
        locked_at = null, locked_by = null, last_error = v_error,
        updated_at = clock_timestamp()
    where id = v_job.id
    returning * into v_job;

    update public.receipts
    set notion_sync_status = 'failed', notion_sync_error = v_error,
        notion_sync_attempts = v_attempts, updated_at = clock_timestamp()
    where id = v_job.receipt_id;
  end if;

  return jsonb_build_object(
    'id', v_job.id,
    'status', v_job.status,
    'attempts', v_job.attempts,
    'nextAttemptAt', v_job.next_attempt_at,
    'reused', false
  );
end;
$$;

alter function public.claim_receipt_sync_jobs_worker(text, integer)
  owner to receipt_sync_owner;
alter function public.finish_receipt_sync_job_worker(uuid, text, text, text, text, text)
  owner to receipt_sync_owner;

revoke all on function public.claim_receipt_sync_jobs_worker(text, integer)
  from public, anon, authenticated;
revoke all on function public.finish_receipt_sync_job_worker(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_receipt_sync_jobs_worker(text, integer)
  to service_role;
grant execute on function public.finish_receipt_sync_job_worker(uuid, text, text, text, text, text)
  to service_role;

revoke create on schema public from receipt_sync_owner;
revoke receipt_sync_owner from postgres;

commit;
