alter table public.receipts
  add column if not exists notion_sync_status text not null default 'disabled',
  add column if not exists notion_sync_error text,
  add column if not exists notion_sync_attempts integer not null default 0,
  add column if not exists notion_last_synced_at timestamp with time zone,
  add column if not exists notion_last_queued_at timestamp with time zone;

alter table public.receipts
  drop constraint if exists receipts_notion_sync_status_check;

alter table public.receipts
  add constraint receipts_notion_sync_status_check
  check (notion_sync_status in ('disabled', 'pending', 'syncing', 'synced', 'failed', 'conflict'));

alter table public.receipts
  drop constraint if exists receipts_notion_sync_attempts_check;

alter table public.receipts
  add constraint receipts_notion_sync_attempts_check
  check (notion_sync_attempts >= 0);

create index if not exists receipts_notion_sync_status_idx
  on public.receipts (notion_sync_status, notion_last_queued_at)
  where notion_sync_status in ('pending', 'failed', 'conflict');

create table if not exists public.receipt_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'notion',
  operation text not null default 'upsert',
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamp with time zone not null default now(),
  locked_at timestamp with time zone,
  locked_by text,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint receipt_sync_jobs_provider_check check (provider in ('notion')),
  constraint receipt_sync_jobs_operation_check check (operation in ('upsert', 'delete')),
  constraint receipt_sync_jobs_status_check check (status in ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
  constraint receipt_sync_jobs_attempts_check check (attempts >= 0)
);

create unique index if not exists receipt_sync_jobs_receipt_provider_unique_idx
  on public.receipt_sync_jobs (receipt_id, provider);

create index if not exists receipt_sync_jobs_owner_id_idx
  on public.receipt_sync_jobs (owner_id);

create index if not exists receipt_sync_jobs_trip_id_idx
  on public.receipt_sync_jobs (trip_id);

create index if not exists receipt_sync_jobs_due_idx
  on public.receipt_sync_jobs (provider, status, next_attempt_at)
  where status in ('pending', 'failed');

alter table public.receipt_sync_jobs enable row level security;

drop policy if exists receipt_sync_jobs_select_trip_members on public.receipt_sync_jobs;
drop policy if exists receipt_sync_jobs_insert_trip_editors on public.receipt_sync_jobs;
drop policy if exists receipt_sync_jobs_update_trip_editors on public.receipt_sync_jobs;
drop policy if exists receipt_sync_jobs_delete_trip_editors on public.receipt_sync_jobs;

create policy receipt_sync_jobs_select_trip_members
  on public.receipt_sync_jobs
  for select
  to authenticated
  using (private.can_access_trip(trip_id));

create policy receipt_sync_jobs_insert_trip_editors
  on public.receipt_sync_jobs
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()) and private.can_edit_trip(trip_id));

create policy receipt_sync_jobs_update_trip_editors
  on public.receipt_sync_jobs
  for update
  to authenticated
  using (private.can_edit_trip(trip_id))
  with check (private.can_edit_trip(trip_id));

create policy receipt_sync_jobs_delete_trip_editors
  on public.receipt_sync_jobs
  for delete
  to authenticated
  using (private.can_edit_trip(trip_id));

create trigger receipt_sync_jobs_set_updated_at
  before update on public.receipt_sync_jobs
  for each row execute function private.set_updated_at();

create or replace function public.enqueue_notion_receipt_sync(
  p_receipt_id uuid,
  p_operation text default 'upsert',
  p_payload jsonb default '{}'::jsonb
)
returns public.receipt_sync_jobs
language plpgsql
security definer
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

grant execute on function public.enqueue_notion_receipt_sync(uuid, text, jsonb) to authenticated;

comment on column public.receipts.notion_sync_status is 'Mirror state for optional Notion notebook sync. Supabase remains primary storage; Notion is a mirror/export target.';
comment on table public.receipt_sync_jobs is 'One active Notion mirror job per receipt. Used to retry Supabase-to-Notion sync without duplicating SourceID records.';
comment on function public.enqueue_notion_receipt_sync(uuid, text, jsonb) is 'Marks a receipt pending for Notion mirror sync and upserts its active sync job.';;
