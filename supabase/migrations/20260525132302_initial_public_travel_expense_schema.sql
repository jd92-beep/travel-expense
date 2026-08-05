create extension if not exists pgcrypto;

create schema if not exists private;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  home_currency text not null default 'HKD',
  locale text not null default 'zh-HK',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_home_currency_check check (char_length(home_currency) between 3 and 8)
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  destination_summary text,
  start_date date,
  end_date date,
  home_currency text not null default 'HKD',
  trip_currency text not null default 'JPY',
  timezones text[] not null default array['Asia/Hong_Kong','Asia/Tokyo'],
  budget_amount numeric(14,2),
  budget_currency text not null default 'HKD',
  active boolean not null default true,
  legacy_source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_name_not_blank check (btrim(name) <> ''),
  constraint trips_date_range_check check (start_date is null or end_date is null or start_date <= end_date)
);

create table if not exists public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_members_role_check check (role in ('owner','admin','editor','viewer')),
  constraint trip_members_status_check check (status in ('active','invited','removed')),
  unique (trip_id, user_id)
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  store text not null,
  record_date date not null,
  record_time time,
  category text,
  payment_method text,
  amount numeric(14,2) not null,
  currency text not null default 'JPY',
  home_amount numeric(14,2),
  home_currency text not null default 'HKD',
  original_amount numeric(14,2),
  original_currency text,
  exchange_rate numeric(18,8),
  items_text text,
  note text,
  address text,
  booking_ref text,
  source_id text,
  status text not null default 'confirmed',
  confidence text,
  map_url text,
  notion_page_id text,
  notion_database_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint receipts_store_not_blank check (btrim(store) <> ''),
  constraint receipts_amount_nonnegative check (amount >= 0),
  constraint receipts_status_check check (status in ('draft','pending','confirmed','archived','deleted')),
  constraint receipts_confidence_check check (confidence is null or confidence in ('low','medium','high'))
);

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(14,2),
  currency text,
  quantity numeric(12,3) not null default 1,
  sort_order integer not null default 0,
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint receipt_items_name_not_blank check (btrim(name) <> ''),
  constraint receipt_items_quantity_positive check (quantity > 0)
);

create table if not exists public.receipt_photos (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_bucket text not null default 'receipt-photos',
  storage_path text not null,
  mime_type text,
  file_size bigint,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  constraint receipt_photos_path_not_blank check (btrim(storage_path) <> '')
);

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null default 'disconnected',
  external_account_id text,
  external_account_label text,
  encrypted_secret_ref text,
  notion_workspace_id text,
  notion_database_id text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integrations_provider_check check (provider in ('notion','google','kimi','email')),
  constraint integrations_status_check check (status in ('connected','disconnected','expired','error'))
);

create index if not exists trips_owner_id_idx on public.trips(owner_id);
create index if not exists trip_members_user_id_idx on public.trip_members(user_id);
create index if not exists trip_members_trip_id_idx on public.trip_members(trip_id);
create index if not exists receipts_trip_id_idx on public.receipts(trip_id);
create index if not exists receipts_owner_id_idx on public.receipts(owner_id);
create index if not exists receipts_record_date_idx on public.receipts(record_date desc);
create unique index if not exists receipts_trip_source_id_unique_idx on public.receipts(trip_id, source_id) where source_id is not null;
create index if not exists receipt_items_receipt_id_idx on public.receipt_items(receipt_id);
create index if not exists receipt_photos_receipt_id_idx on public.receipt_photos(receipt_id);
create index if not exists integrations_user_id_idx on public.integrations(user_id);
create unique index if not exists integrations_user_provider_account_unique_idx on public.integrations(user_id, provider, coalesce(external_account_id, ''));

create or replace function private.can_access_trip(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and t.owner_id = auth.uid()
  ) or exists (
    select 1 from public.trip_members tm
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
    select 1 from public.trips t
    where t.id = p_trip_id
      and t.owner_id = auth.uid()
  ) or exists (
    select 1 from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and tm.role in ('owner','admin','editor')
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
    select 1 from public.trips t
    where t.id = p_trip_id
      and t.owner_id = auth.uid()
  ) or exists (
    select 1 from public.trip_members tm
    where tm.trip_id = p_trip_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
      and tm.role in ('owner','admin')
  );
$$;

create or replace function private.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function private.add_owner_trip_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.trip_members (trip_id, user_id, role, status)
  values (new.id, new.owner_id, 'owner', 'active')
  on conflict (trip_id, user_id) do update set role = 'owner', status = 'active', updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function private.set_updated_at();

drop trigger if exists trips_set_updated_at on public.trips;
create trigger trips_set_updated_at before update on public.trips for each row execute function private.set_updated_at();

drop trigger if exists trip_members_set_updated_at on public.trip_members;
create trigger trip_members_set_updated_at before update on public.trip_members for each row execute function private.set_updated_at();

drop trigger if exists receipts_set_updated_at on public.receipts;
create trigger receipts_set_updated_at before update on public.receipts for each row execute function private.set_updated_at();

drop trigger if exists receipt_items_set_updated_at on public.receipt_items;
create trigger receipt_items_set_updated_at before update on public.receipt_items for each row execute function private.set_updated_at();

drop trigger if exists receipt_photos_set_updated_at on public.receipt_photos;
create trigger receipt_photos_set_updated_at before update on public.receipt_photos for each row execute function private.set_updated_at();

drop trigger if exists integrations_set_updated_at on public.integrations;
create trigger integrations_set_updated_at before update on public.integrations for each row execute function private.set_updated_at();

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile after insert on auth.users for each row execute function private.handle_new_user_profile();

drop trigger if exists trips_add_owner_member on public.trips;
create trigger trips_add_owner_member after insert on public.trips for each row execute function private.add_owner_trip_member();

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;
alter table public.receipt_photos enable row level security;
alter table public.integrations enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id = auth.uid());

create policy "trips_select_members" on public.trips for select to authenticated using (private.can_access_trip(id));
create policy "trips_insert_own" on public.trips for insert to authenticated with check (owner_id = auth.uid());
create policy "trips_update_editors" on public.trips for update to authenticated using (private.can_edit_trip(id)) with check (private.can_edit_trip(id));
create policy "trips_delete_admins" on public.trips for delete to authenticated using (private.can_admin_trip(id));

create policy "trip_members_select_visible" on public.trip_members for select to authenticated using (user_id = auth.uid() or private.can_admin_trip(trip_id));
create policy "trip_members_insert_admins" on public.trip_members for insert to authenticated with check (private.can_admin_trip(trip_id));
create policy "trip_members_update_admins" on public.trip_members for update to authenticated using (private.can_admin_trip(trip_id)) with check (private.can_admin_trip(trip_id));
create policy "trip_members_delete_admins" on public.trip_members for delete to authenticated using (private.can_admin_trip(trip_id));

create policy "receipts_select_trip_members" on public.receipts for select to authenticated using (private.can_access_trip(trip_id));
create policy "receipts_insert_trip_editors" on public.receipts for insert to authenticated with check (owner_id = auth.uid() and private.can_edit_trip(trip_id));
create policy "receipts_update_trip_editors" on public.receipts for update to authenticated using (private.can_edit_trip(trip_id)) with check (private.can_edit_trip(trip_id));
create policy "receipts_delete_trip_editors" on public.receipts for delete to authenticated using (private.can_edit_trip(trip_id));

create policy "receipt_items_select_trip_members" on public.receipt_items for select to authenticated using (
  exists (select 1 from public.receipts r where r.id = receipt_id and private.can_access_trip(r.trip_id))
);
create policy "receipt_items_insert_trip_editors" on public.receipt_items for insert to authenticated with check (
  owner_id = auth.uid() and exists (select 1 from public.receipts r where r.id = receipt_id and private.can_edit_trip(r.trip_id))
);
create policy "receipt_items_update_trip_editors" on public.receipt_items for update to authenticated using (
  exists (select 1 from public.receipts r where r.id = receipt_id and private.can_edit_trip(r.trip_id))
) with check (
  exists (select 1 from public.receipts r where r.id = receipt_id and private.can_edit_trip(r.trip_id))
);
create policy "receipt_items_delete_trip_editors" on public.receipt_items for delete to authenticated using (
  exists (select 1 from public.receipts r where r.id = receipt_id and private.can_edit_trip(r.trip_id))
);

create policy "receipt_photos_select_trip_members" on public.receipt_photos for select to authenticated using (
  exists (select 1 from public.receipts r where r.id = receipt_id and private.can_access_trip(r.trip_id))
);
create policy "receipt_photos_insert_trip_editors" on public.receipt_photos for insert to authenticated with check (
  owner_id = auth.uid() and exists (select 1 from public.receipts r where r.id = receipt_id and private.can_edit_trip(r.trip_id))
);
create policy "receipt_photos_update_trip_editors" on public.receipt_photos for update to authenticated using (
  exists (select 1 from public.receipts r where r.id = receipt_id and private.can_edit_trip(r.trip_id))
) with check (
  exists (select 1 from public.receipts r where r.id = receipt_id and private.can_edit_trip(r.trip_id))
);
create policy "receipt_photos_delete_trip_editors" on public.receipt_photos for delete to authenticated using (
  exists (select 1 from public.receipts r where r.id = receipt_id and private.can_edit_trip(r.trip_id))
);

create policy "integrations_select_own" on public.integrations for select to authenticated using (user_id = auth.uid());
create policy "integrations_insert_own" on public.integrations for insert to authenticated with check (user_id = auth.uid());
create policy "integrations_update_own" on public.integrations for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "integrations_delete_own" on public.integrations for delete to authenticated using (user_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.trips to authenticated;
grant select, insert, update, delete on public.trip_members to authenticated;
grant select, insert, update, delete on public.receipts to authenticated;
grant select, insert, update, delete on public.receipt_items to authenticated;
grant select, insert, update, delete on public.receipt_photos to authenticated;
grant select, insert, update, delete on public.integrations to authenticated;

grant usage on schema private to authenticated;
grant execute on function private.can_access_trip(uuid) to authenticated;
grant execute on function private.can_edit_trip(uuid) to authenticated;
grant execute on function private.can_admin_trip(uuid) to authenticated;

insert into storage.buckets (id, name, public)
values ('receipt-photos', 'receipt-photos', false)
on conflict (id) do nothing;

create policy "receipt_photos_storage_select_own_prefix" on storage.objects for select to authenticated using (
  bucket_id = 'receipt-photos' and split_part(name, '/', 1) = auth.uid()::text
);
create policy "receipt_photos_storage_insert_own_prefix" on storage.objects for insert to authenticated with check (
  bucket_id = 'receipt-photos' and split_part(name, '/', 1) = auth.uid()::text
);
create policy "receipt_photos_storage_update_own_prefix" on storage.objects for update to authenticated using (
  bucket_id = 'receipt-photos' and split_part(name, '/', 1) = auth.uid()::text
) with check (
  bucket_id = 'receipt-photos' and split_part(name, '/', 1) = auth.uid()::text
);
create policy "receipt_photos_storage_delete_own_prefix" on storage.objects for delete to authenticated using (
  bucket_id = 'receipt-photos' and split_part(name, '/', 1) = auth.uid()::text
);;
