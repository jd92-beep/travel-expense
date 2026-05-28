-- Enforce per-user / per-trip isolation for the public React app.
-- This migration is intentionally idempotent and contains no secrets.
--
-- Rollback:
--   drop policy if exists ... for each policy below, then optionally disable RLS.
--   Do not roll back in production unless another equivalent RLS boundary is in place.

create schema if not exists private;
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  home_currency text not null default 'HKD'
    check (char_length(home_currency) >= 3 and char_length(home_currency) <= 8),
  locale text not null default 'zh-HK',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  app_settings jsonb not null default '{}'::jsonb
);

comment on column public.profiles.app_settings is
  'Non-secret Travel Expense app settings for the signed-in user. Protected by profiles RLS.';

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  destination_summary text,
  start_date date,
  end_date date,
  home_currency text not null default 'HKD',
  trip_currency text not null default 'JPY',
  timezones text[] not null default array['Asia/Hong_Kong', 'Asia/Tokyo']::text[],
  budget_amount numeric,
  budget_currency text not null default 'HKD',
  active boolean not null default true,
  legacy_source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  itinerary jsonb not null default '[]'::jsonb,
  app_metadata jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  archived boolean not null default false,
  notion_page_id text,
  notion_database_id text
);

comment on column public.trips.itinerary is
  'Travel Expense per-trip itinerary JSON. Protected by trips RLS.';
comment on column public.trips.app_metadata is
  'Non-secret Travel Expense trip metadata such as local source id. Protected by trips RLS.';

create table if not exists public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer'
    check (role in ('owner', 'admin', 'editor', 'viewer')),
  status text not null default 'active'
    check (status in ('active', 'invited', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, user_id)
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  store text not null check (btrim(store) <> ''),
  record_date date not null,
  record_time time,
  category text,
  payment_method text,
  amount numeric not null check (amount >= 0),
  currency text not null default 'JPY',
  home_amount numeric,
  home_currency text not null default 'HKD',
  original_amount numeric,
  original_currency text,
  exchange_rate numeric,
  items_text text,
  note text,
  address text,
  booking_ref text,
  source_id text,
  status text not null default 'confirmed'
    check (status in ('draft', 'pending', 'confirmed', 'archived', 'deleted')),
  confidence text
    check (confidence is null or confidence in ('low', 'medium', 'high')),
  map_url text,
  notion_page_id text,
  notion_database_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  notion_sync_status text not null default 'disabled'
    check (notion_sync_status in ('disabled', 'pending', 'syncing', 'synced', 'failed', 'conflict')),
  notion_sync_error text,
  notion_sync_attempts integer not null default 0 check (notion_sync_attempts >= 0),
  notion_last_synced_at timestamptz,
  notion_last_queued_at timestamptz
);

comment on column public.receipts.notion_sync_status is
  'Mirror state for optional Notion notebook sync. Supabase remains primary storage; Notion is a mirror/export target.';

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  amount numeric,
  currency text,
  quantity numeric not null default 1 check (quantity > 0),
  sort_order integer not null default 0,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.receipt_photos (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_bucket text not null default 'receipt-photos',
  storage_path text not null check (btrim(storage_path) <> ''),
  mime_type text,
  file_size bigint,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('notion', 'google', 'kimi', 'email')),
  status text not null default 'disconnected'
    check (status in ('connected', 'disconnected', 'expired', 'error')),
  external_account_id text,
  external_account_label text,
  encrypted_secret_ref text,
  notion_workspace_id text,
  notion_database_id text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.receipt_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'notion' check (provider = 'notion'),
  operation text not null default 'upsert' check (operation in ('upsert', 'delete')),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.receipt_sync_jobs is
  'One active Notion mirror job per receipt. Used to retry Supabase-to-Notion sync without duplicating SourceID records.';

create index if not exists trips_owner_id_idx on public.trips(owner_id);
create index if not exists trips_owner_active_idx on public.trips(owner_id, active) where archived = false;
create unique index if not exists trips_owner_legacy_source_unique_idx
  on public.trips(owner_id, legacy_source_id)
  where legacy_source_id is not null and btrim(legacy_source_id) <> '';
create index if not exists trip_members_trip_id_idx on public.trip_members(trip_id);
create index if not exists trip_members_user_id_idx on public.trip_members(user_id);
create index if not exists receipts_trip_id_idx on public.receipts(trip_id);
create index if not exists receipts_owner_id_idx on public.receipts(owner_id);
create index if not exists receipts_record_date_idx on public.receipts(record_date desc);
create unique index if not exists receipts_trip_source_id_unique_idx
  on public.receipts(trip_id, source_id)
  where source_id is not null;
create index if not exists receipt_items_receipt_id_idx on public.receipt_items(receipt_id);
create index if not exists receipt_items_owner_id_idx on public.receipt_items(owner_id);
create index if not exists receipt_photos_receipt_id_idx on public.receipt_photos(receipt_id);
create index if not exists receipt_photos_owner_id_idx on public.receipt_photos(owner_id);
create index if not exists integrations_user_id_idx on public.integrations(user_id);
create unique index if not exists integrations_user_provider_account_unique_idx
  on public.integrations(user_id, provider, coalesce(external_account_id, ''));
create index if not exists receipt_sync_jobs_owner_id_idx on public.receipt_sync_jobs(owner_id);
create index if not exists receipt_sync_jobs_trip_id_idx on public.receipt_sync_jobs(trip_id);
create unique index if not exists receipt_sync_jobs_receipt_provider_unique_idx
  on public.receipt_sync_jobs(receipt_id, provider);
create index if not exists receipt_sync_jobs_due_idx
  on public.receipt_sync_jobs(provider, status, next_attempt_at)
  where status in ('pending', 'failed');

create or replace function private.can_access_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trips t
    where t.id = p_trip_id
      and t.owner_id = auth.uid()
  ) or exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
  );
$$;

create or replace function private.can_edit_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trips t
    where t.id = p_trip_id
      and t.owner_id = auth.uid()
  ) or exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and tm.role in ('owner', 'admin', 'editor')
  );
$$;

create or replace function private.can_admin_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trips t
    where t.id = p_trip_id
      and t.owner_id = auth.uid()
  ) or exists (
    select 1
    from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and tm.role in ('owner', 'admin')
  );
$$;

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;
alter table public.receipt_photos enable row level security;
alter table public.integrations enable row level security;
alter table public.receipt_sync_jobs enable row level security;

alter table public.profiles force row level security;
alter table public.trips force row level security;
alter table public.trip_members force row level security;
alter table public.receipts force row level security;
alter table public.receipt_items force row level security;
alter table public.receipt_photos force row level security;
alter table public.integrations force row level security;
alter table public.receipt_sync_jobs force row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists trips_select_members on public.trips;
create policy trips_select_members
  on public.trips for select
  to authenticated
  using (private.can_access_trip(id));

drop policy if exists trips_insert_own on public.trips;
create policy trips_insert_own
  on public.trips for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists trips_update_editors on public.trips;
create policy trips_update_editors
  on public.trips for update
  to authenticated
  using (private.can_edit_trip(id))
  with check (private.can_edit_trip(id));

drop policy if exists trips_delete_admins on public.trips;
create policy trips_delete_admins
  on public.trips for delete
  to authenticated
  using (private.can_admin_trip(id));

drop policy if exists trip_members_select_visible on public.trip_members;
create policy trip_members_select_visible
  on public.trip_members for select
  to authenticated
  using (user_id = (select auth.uid()) or private.can_admin_trip(trip_id));

drop policy if exists trip_members_insert_admins on public.trip_members;
create policy trip_members_insert_admins
  on public.trip_members for insert
  to authenticated
  with check (private.can_admin_trip(trip_id));

drop policy if exists trip_members_update_admins on public.trip_members;
create policy trip_members_update_admins
  on public.trip_members for update
  to authenticated
  using (private.can_admin_trip(trip_id))
  with check (private.can_admin_trip(trip_id));

drop policy if exists trip_members_delete_admins on public.trip_members;
create policy trip_members_delete_admins
  on public.trip_members for delete
  to authenticated
  using (private.can_admin_trip(trip_id));

drop policy if exists receipts_select_trip_members on public.receipts;
create policy receipts_select_trip_members
  on public.receipts for select
  to authenticated
  using (private.can_access_trip(trip_id));

drop policy if exists receipts_insert_trip_editors on public.receipts;
create policy receipts_insert_trip_editors
  on public.receipts for insert
  to authenticated
  with check (owner_id = (select auth.uid()) and private.can_edit_trip(trip_id));

drop policy if exists receipts_update_trip_editors on public.receipts;
create policy receipts_update_trip_editors
  on public.receipts for update
  to authenticated
  using (private.can_edit_trip(trip_id))
  with check (private.can_edit_trip(trip_id));

drop policy if exists receipts_delete_trip_editors on public.receipts;
create policy receipts_delete_trip_editors
  on public.receipts for delete
  to authenticated
  using (private.can_edit_trip(trip_id));

drop policy if exists receipt_items_select_trip_members on public.receipt_items;
create policy receipt_items_select_trip_members
  on public.receipt_items for select
  to authenticated
  using (
    exists (
      select 1
      from public.receipts r
      where r.id = receipt_items.receipt_id
        and private.can_access_trip(r.trip_id)
    )
  );

drop policy if exists receipt_items_insert_trip_editors on public.receipt_items;
create policy receipt_items_insert_trip_editors
  on public.receipt_items for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.receipts r
      where r.id = receipt_items.receipt_id
        and private.can_edit_trip(r.trip_id)
    )
  );

drop policy if exists receipt_items_update_trip_editors on public.receipt_items;
create policy receipt_items_update_trip_editors
  on public.receipt_items for update
  to authenticated
  using (
    exists (
      select 1
      from public.receipts r
      where r.id = receipt_items.receipt_id
        and private.can_edit_trip(r.trip_id)
    )
  )
  with check (
    exists (
      select 1
      from public.receipts r
      where r.id = receipt_items.receipt_id
        and private.can_edit_trip(r.trip_id)
    )
  );

drop policy if exists receipt_items_delete_trip_editors on public.receipt_items;
create policy receipt_items_delete_trip_editors
  on public.receipt_items for delete
  to authenticated
  using (
    exists (
      select 1
      from public.receipts r
      where r.id = receipt_items.receipt_id
        and private.can_edit_trip(r.trip_id)
    )
  );

drop policy if exists receipt_photos_select_trip_members on public.receipt_photos;
create policy receipt_photos_select_trip_members
  on public.receipt_photos for select
  to authenticated
  using (
    exists (
      select 1
      from public.receipts r
      where r.id = receipt_photos.receipt_id
        and private.can_access_trip(r.trip_id)
    )
  );

drop policy if exists receipt_photos_insert_trip_editors on public.receipt_photos;
create policy receipt_photos_insert_trip_editors
  on public.receipt_photos for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.receipts r
      where r.id = receipt_photos.receipt_id
        and private.can_edit_trip(r.trip_id)
    )
  );

drop policy if exists receipt_photos_update_trip_editors on public.receipt_photos;
create policy receipt_photos_update_trip_editors
  on public.receipt_photos for update
  to authenticated
  using (
    exists (
      select 1
      from public.receipts r
      where r.id = receipt_photos.receipt_id
        and private.can_edit_trip(r.trip_id)
    )
  )
  with check (
    exists (
      select 1
      from public.receipts r
      where r.id = receipt_photos.receipt_id
        and private.can_edit_trip(r.trip_id)
    )
  );

drop policy if exists receipt_photos_delete_trip_editors on public.receipt_photos;
create policy receipt_photos_delete_trip_editors
  on public.receipt_photos for delete
  to authenticated
  using (
    exists (
      select 1
      from public.receipts r
      where r.id = receipt_photos.receipt_id
        and private.can_edit_trip(r.trip_id)
    )
  );

drop policy if exists integrations_select_own on public.integrations;
create policy integrations_select_own
  on public.integrations for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists integrations_insert_own on public.integrations;
create policy integrations_insert_own
  on public.integrations for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists integrations_update_own on public.integrations;
create policy integrations_update_own
  on public.integrations for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists integrations_delete_own on public.integrations;
create policy integrations_delete_own
  on public.integrations for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists receipt_sync_jobs_select_trip_members on public.receipt_sync_jobs;
create policy receipt_sync_jobs_select_trip_members
  on public.receipt_sync_jobs for select
  to authenticated
  using (private.can_access_trip(trip_id));

drop policy if exists receipt_sync_jobs_insert_trip_editors on public.receipt_sync_jobs;
create policy receipt_sync_jobs_insert_trip_editors
  on public.receipt_sync_jobs for insert
  to authenticated
  with check (owner_id = (select auth.uid()) and private.can_edit_trip(trip_id));

drop policy if exists receipt_sync_jobs_update_trip_editors on public.receipt_sync_jobs;
create policy receipt_sync_jobs_update_trip_editors
  on public.receipt_sync_jobs for update
  to authenticated
  using (private.can_edit_trip(trip_id))
  with check (private.can_edit_trip(trip_id));

drop policy if exists receipt_sync_jobs_delete_trip_editors on public.receipt_sync_jobs;
create policy receipt_sync_jobs_delete_trip_editors
  on public.receipt_sync_jobs for delete
  to authenticated
  using (private.can_edit_trip(trip_id));
