alter table public.trips
  add column if not exists itinerary jsonb not null default '[]'::jsonb,
  add column if not exists app_metadata jsonb not null default '{}'::jsonb,
  add column if not exists version integer not null default 1,
  add column if not exists archived boolean not null default false,
  add column if not exists notion_page_id text,
  add column if not exists notion_database_id text;

alter table public.profiles
  add column if not exists app_settings jsonb not null default '{}'::jsonb;

comment on column public.trips.itinerary is 'Travel Expense per-trip itinerary JSON. Protected by trips RLS.';
comment on column public.trips.app_metadata is 'Non-secret Travel Expense trip metadata such as local source id. Protected by trips RLS.';
comment on column public.profiles.app_settings is 'Non-secret Travel Expense app settings for the signed-in user. Protected by profiles RLS.';

create index if not exists trips_owner_active_idx on public.trips (owner_id, active) where archived = false;;
