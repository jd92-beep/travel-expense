create table if not exists private.notion_import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'notion',
  source_database_id text not null,
  target_owner_id uuid references auth.users(id) on delete restrict,
  target_trip_id uuid references public.trips(id) on delete set null,
  status text not null default 'draft',
  total_rows integer not null default 0,
  staged_rows integer not null default 0,
  imported_rows integer not null default 0,
  error text,
  rollback_notes text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notion_import_batches_status_check check (status in ('draft','staged','importing','imported','rolled_back','failed'))
);

create table if not exists private.notion_receipt_staging (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references private.notion_import_batches(id) on delete cascade,
  notion_page_id text,
  notion_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  source_id text,
  store text,
  record_date date,
  record_time time,
  category text,
  payment_method text,
  amount numeric(14,2),
  currency text,
  home_amount numeric(14,2),
  home_currency text default 'HKD',
  original_amount numeric(14,2),
  original_currency text,
  exchange_rate numeric(18,8),
  items_text text,
  note text,
  address text,
  booking_ref text,
  map_url text,
  photo_url text,
  validation_errors text[] not null default '{}',
  imported_receipt_id uuid references public.receipts(id) on delete set null,
  status text not null default 'staged',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notion_receipt_staging_status_check check (status in ('staged','valid','invalid','imported','skipped','failed'))
);

create table if not exists private.import_rollback_log (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references private.notion_import_batches(id) on delete cascade,
  target_table text not null,
  target_id uuid not null,
  action text not null default 'inserted',
  created_at timestamptz not null default now(),
  constraint import_rollback_log_action_check check (action in ('inserted','updated','deleted'))
);

create index if not exists notion_receipt_staging_batch_id_idx on private.notion_receipt_staging(batch_id);
create index if not exists notion_receipt_staging_source_id_idx on private.notion_receipt_staging(source_id);
create index if not exists import_rollback_log_batch_id_idx on private.import_rollback_log(batch_id);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notion_import_batches_set_updated_at on private.notion_import_batches;
create trigger notion_import_batches_set_updated_at before update on private.notion_import_batches for each row execute function private.set_updated_at();

drop trigger if exists notion_receipt_staging_set_updated_at on private.notion_receipt_staging;
create trigger notion_receipt_staging_set_updated_at before update on private.notion_receipt_staging for each row execute function private.set_updated_at();

create or replace function private.rollback_import_batch(p_batch_id uuid)
returns table(target_table text, deleted_count integer)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  delete from public.receipt_photos rp
  using private.import_rollback_log l
  where l.batch_id = p_batch_id
    and l.target_table = 'receipt_photos'
    and rp.id = l.target_id;
  get diagnostics deleted_count = row_count;
  target_table := 'receipt_photos';
  return next;

  delete from public.receipt_items ri
  using private.import_rollback_log l
  where l.batch_id = p_batch_id
    and l.target_table = 'receipt_items'
    and ri.id = l.target_id;
  get diagnostics deleted_count = row_count;
  target_table := 'receipt_items';
  return next;

  delete from public.receipts r
  using private.import_rollback_log l
  where l.batch_id = p_batch_id
    and l.target_table = 'receipts'
    and r.id = l.target_id;
  get diagnostics deleted_count = row_count;
  target_table := 'receipts';
  return next;

  update private.notion_import_batches
  set status = 'rolled_back', finished_at = now(), rollback_notes = coalesce(rollback_notes, '') || E'\nRolled back at ' || now()::text
  where id = p_batch_id;
end;
$$;

revoke all on function private.rollback_import_batch(uuid) from public;
revoke all on private.notion_import_batches from public;
revoke all on private.notion_receipt_staging from public;
revoke all on private.import_rollback_log from public;;
