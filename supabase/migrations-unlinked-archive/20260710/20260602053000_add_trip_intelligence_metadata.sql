-- Add optional first-class trip intelligence fields for dynamic currency,
-- theme, locale, and weather context. Runtime remains backward-compatible:
-- the React and Compact apps also persist the same payload in app_metadata.

alter table public.trips
  add column if not exists country_code text,
  add column if not exists theme_key text,
  add column if not exists locale text,
  add column if not exists weather_region text,
  add column if not exists trip_intelligence jsonb not null default '{}'::jsonb;

comment on column public.trips.country_code is
  'Optional country/region code inferred from trip onboarding, e.g. JP, KR, TW, GB, EU.';
comment on column public.trips.theme_key is
  'Optional UI theme key inferred from trip onboarding, e.g. japan_washi or korea_editorial.';
comment on column public.trips.trip_intelligence is
  'Structured non-secret trip context mirrored from app_metadata.intelligence for analytics/search.';

update public.trips
set
  trip_intelligence = coalesce(app_metadata->'intelligence', trip_intelligence, '{}'::jsonb),
  country_code = coalesce(country_code, app_metadata->'intelligence'->>'countryCode'),
  theme_key = coalesce(theme_key, app_metadata->'intelligence'->>'themeKey'),
  locale = coalesce(locale, app_metadata->'intelligence'->>'locale'),
  weather_region = coalesce(weather_region, app_metadata->'intelligence'->>'weatherRegion')
where app_metadata ? 'intelligence';

create index if not exists idx_trips_owner_theme_key
  on public.trips (owner_id, theme_key)
  where archived = false;

create index if not exists idx_trips_owner_country_code
  on public.trips (owner_id, country_code)
  where archived = false;
