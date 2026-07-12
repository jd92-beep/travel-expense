-- Versioned, range-complete itinerary writes for Compact, Android, and Admin.
-- Strict RPC-only enforcement remains off until the client compatibility gate is complete.

set lock_timeout = '5s';
set statement_timeout = '30s';

alter table public.trips
  add column if not exists itinerary_version bigint not null default 1;

update public.trips
set itinerary_version = greatest(coalesce(version, 1), 1)
where itinerary_version = 1
  and coalesce(version, 1) > 1;

create table if not exists private.client_contract_config (
  singleton boolean primary key default true check (singleton),
  strict_itinerary_writes boolean not null default false,
  minimum_contract_version integer not null default 4 check (minimum_contract_version > 0),
  updated_at timestamptz not null default now()
);

insert into private.client_contract_config (singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists private.trip_itinerary_versions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  version bigint not null check (version > 0),
  start_date date not null,
  end_date date not null,
  itinerary jsonb not null,
  actor_id uuid,
  source text not null default 'legacy'
    check (source in ('compact', 'android', 'admin', 'restore', 'import', 'legacy', 'migration')),
  created_at timestamptz not null default clock_timestamp(),
  unique (trip_id, version),
  check (start_date <= end_date),
  check (jsonb_typeof(itinerary) = 'array')
);

create index if not exists trip_itinerary_versions_trip_created_idx
  on private.trip_itinerary_versions (trip_id, created_at desc, version desc);

revoke all on table private.client_contract_config from public, anon, authenticated, service_role;
revoke all on table private.trip_itinerary_versions from public, anon, authenticated, service_role;
grant select on table private.trip_itinerary_versions to admin_read_owner;

create or replace function private.assert_itinerary_contract(
  p_start_date date,
  p_end_date date,
  p_itinerary jsonb
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_expected_days integer;
  v_actual_days integer;
  v_unique_days integer;
begin
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception using errcode = '22023', message = 'ITINERARY_DATE_RANGE_INVALID';
  end if;
  if p_itinerary is null or jsonb_typeof(p_itinerary) <> 'array' then
    raise exception using errcode = '22023', message = 'ITINERARY_PAYLOAD_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_itinerary) as entry(day)
    where jsonb_typeof(day) <> 'object'
      or coalesce(day ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or not (day ? 'spots')
      or jsonb_typeof(day -> 'spots') <> 'array'
  ) then
    raise exception using errcode = '22023', message = 'ITINERARY_DAY_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_itinerary) as entry(day)
    where (day ->> 'date')::date < p_start_date
       or (day ->> 'date')::date > p_end_date
  ) then
    raise exception using errcode = '22023', message = 'ITINERARY_DAY_OUT_OF_RANGE';
  end if;

  select count(*), count(distinct day ->> 'date')
  into v_actual_days, v_unique_days
  from jsonb_array_elements(p_itinerary) as entry(day);
  v_expected_days := (p_end_date - p_start_date) + 1;

  if v_actual_days <> v_expected_days then
    raise exception using errcode = '22023', message = 'ITINERARY_DAYS_INCOMPLETE';
  end if;
  if v_unique_days <> v_actual_days then
    raise exception using errcode = '22023', message = 'ITINERARY_DATE_DUPLICATE';
  end if;
  if exists (
    select 1
    from generate_series(p_start_date, p_end_date, interval '1 day') expected(day_date)
    where not exists (
      select 1
      from jsonb_array_elements(p_itinerary) as entry(day)
      where (day ->> 'date')::date = expected.day_date::date
    )
  ) then
    raise exception using errcode = '22023', message = 'ITINERARY_DAYS_INCOMPLETE';
  end if;

  if exists (
    select 1
    from (
      select coalesce(nullif(spot ->> 'id', ''), nullif(spot ->> 'spotId', '')) as spot_id
      from jsonb_array_elements(p_itinerary) as day_entry(day)
      cross join lateral jsonb_array_elements(day -> 'spots') as spot_entry(spot)
    ) spots
    where spots.spot_id is not null
    group by spots.spot_id
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'ITINERARY_SPOT_DUPLICATE';
  end if;
end;
$$;

revoke all on function private.assert_itinerary_contract(date, date, jsonb) from public, anon, authenticated, service_role;

create or replace function private.guard_trip_itinerary_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_strict boolean := false;
  v_expected text;
begin
  select strict_itinerary_writes
  into v_strict
  from private.client_contract_config
  where singleton = true;

  if tg_op = 'INSERT' then
    new.itinerary_version := greatest(coalesce(new.itinerary_version, 1), 1);
    if v_strict then
      perform private.assert_itinerary_contract(new.start_date, new.end_date, new.itinerary);
    end if;
    return new;
  end if;

  if new.itinerary is not distinct from old.itinerary
    and new.start_date is not distinct from old.start_date
    and new.end_date is not distinct from old.end_date then
    new.itinerary_version := old.itinerary_version;
    return new;
  end if;

  if v_strict then
    v_expected := current_setting('app.itinerary_expected_version', true);
    if v_expected is null or v_expected = '' then
      raise exception using errcode = '42501', message = 'ITINERARY_RPC_REQUIRED';
    end if;
    if v_expected::bigint <> old.itinerary_version then
      raise exception using errcode = '40001', message = 'ITINERARY_VERSION_CONFLICT';
    end if;
    perform private.assert_itinerary_contract(new.start_date, new.end_date, new.itinerary);
  end if;

  new.itinerary_version := old.itinerary_version + 1;
  new.version := greatest(coalesce(new.version, old.version + 1), old.version + 1);
  return new;
end;
$$;

revoke all on function private.guard_trip_itinerary_write() from public, anon, authenticated, service_role;

drop trigger if exists trips_guard_itinerary_write on public.trips;
create trigger trips_guard_itinerary_write
before insert or update of itinerary, start_date, end_date on public.trips
for each row execute function private.guard_trip_itinerary_write();

create or replace function private.capture_trip_itinerary_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text;
begin
  if new.start_date is null or new.end_date is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and new.itinerary is not distinct from old.itinerary
    and new.start_date is not distinct from old.start_date
    and new.end_date is not distinct from old.end_date then
    return new;
  end if;

  v_source := coalesce(nullif(current_setting('app.itinerary_source', true), ''), 'legacy');
  if v_source not in ('compact', 'android', 'admin', 'restore', 'import', 'legacy', 'migration') then
    v_source := 'legacy';
  end if;

  insert into private.trip_itinerary_versions (
    trip_id, version, start_date, end_date, itinerary, actor_id, source
  ) values (
    new.id,
    new.itinerary_version,
    new.start_date,
    new.end_date,
    case when jsonb_typeof(new.itinerary) = 'array' then new.itinerary else '[]'::jsonb end,
    auth.uid(),
    v_source
  )
  on conflict (trip_id, version) do nothing;
  return new;
end;
$$;

revoke all on function private.capture_trip_itinerary_version() from public, anon, authenticated, service_role;

drop trigger if exists trips_capture_itinerary_version on public.trips;
create trigger trips_capture_itinerary_version
after insert or update of itinerary, start_date, end_date on public.trips
for each row execute function private.capture_trip_itinerary_version();

insert into private.trip_itinerary_versions (
  trip_id, version, start_date, end_date, itinerary, actor_id, source, created_at
)
select
  id,
  itinerary_version,
  start_date,
  end_date,
  case when jsonb_typeof(itinerary) = 'array' then itinerary else '[]'::jsonb end,
  null,
  'migration',
  updated_at
from public.trips
where start_date is not null
  and end_date is not null
on conflict (trip_id, version) do nothing;

create or replace function public.update_trip_itinerary(
  p_trip_id uuid,
  p_expected_version bigint,
  p_start_date date,
  p_end_date date,
  p_itinerary jsonb,
  p_source text default 'compact'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.trips%rowtype;
  v_result jsonb;
  v_service_role boolean;
begin
  v_service_role := coalesce(auth.role() = 'service_role', false);
  if not v_service_role and not private.can_edit_trip(p_trip_id) then
    raise exception using errcode = '42501', message = 'TRIP_EDIT_FORBIDDEN';
  end if;
  if p_source not in ('compact', 'android', 'admin', 'import') then
    raise exception using errcode = '22023', message = 'ITINERARY_SOURCE_INVALID';
  end if;

  select * into v_current
  from public.trips
  where id = p_trip_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'TRIP_NOT_FOUND';
  end if;
  if v_current.itinerary_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'ITINERARY_VERSION_CONFLICT';
  end if;

  perform private.assert_itinerary_contract(p_start_date, p_end_date, p_itinerary);

  if (p_start_date > v_current.start_date or p_end_date < v_current.end_date)
    and exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(v_current.itinerary) = 'array' then v_current.itinerary else '[]'::jsonb end
      ) as entry(day)
      where case
        when coalesce(day ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$' then (day ->> 'date')::date
        else null
      end not between p_start_date and p_end_date
      and (
        (jsonb_typeof(day -> 'spots') = 'array' and jsonb_array_length(day -> 'spots') > 0)
        or coalesce(day -> 'lodging' ->> 'name', '') <> ''
      )
    ) then
    raise exception using errcode = '22023', message = 'ITINERARY_DATE_SHRINK_REQUIRES_RESOLUTION';
  end if;

  perform set_config('app.itinerary_expected_version', p_expected_version::text, true);
  perform set_config('app.itinerary_source', p_source, true);

  update public.trips as trip
  set start_date = p_start_date,
      end_date = p_end_date,
      itinerary = p_itinerary,
      version = greatest(coalesce(v_current.version, 1) + 1, p_expected_version + 1)
  where trip.id = p_trip_id
  returning to_jsonb(trip) into v_result;

  return v_result;
end;
$$;

revoke all on function public.update_trip_itinerary(uuid, bigint, date, date, jsonb, text) from public, anon;
grant execute on function public.update_trip_itinerary(uuid, bigint, date, date, jsonb, text) to authenticated, service_role;

create or replace function public.restore_trip_itinerary_version(
  p_trip_id uuid,
  p_restore_version bigint,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot private.trip_itinerary_versions%rowtype;
begin
  if not coalesce(auth.role() = 'service_role', false) then
    raise exception using errcode = '42501', message = 'ADMIN_SERVICE_ROLE_REQUIRED';
  end if;
  select * into v_snapshot
  from private.trip_itinerary_versions
  where trip_id = p_trip_id
    and version = p_restore_version;
  if not found then
    raise exception using errcode = 'P0002', message = 'ITINERARY_VERSION_NOT_FOUND';
  end if;
  return public.update_trip_itinerary(
    p_trip_id,
    p_expected_version,
    v_snapshot.start_date,
    v_snapshot.end_date,
    v_snapshot.itinerary,
    'admin'
  );
end;
$$;

revoke all on function public.restore_trip_itinerary_version(uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.restore_trip_itinerary_version(uuid, bigint, bigint) to service_role;

create or replace function public.admin_read_trip_itinerary_versions(
  p_trip_id uuid,
  p_limit integer default 50,
  p_before_version bigint default null
)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  with selected as (
    select version, start_date, end_date, itinerary, actor_id, source, created_at
    from private.trip_itinerary_versions
    where trip_id = p_trip_id
      and (p_before_version is null or version < p_before_version)
    order by version desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(to_jsonb(selected) order by version desc), '[]'::jsonb),
    'total', (select count(*) from private.trip_itinerary_versions where trip_id = p_trip_id)
  )
  from selected;
$$;

grant create on schema public to admin_read_owner;
grant admin_read_owner to postgres;
alter function public.admin_read_trip_itinerary_versions(uuid, integer, bigint) owner to admin_read_owner;
revoke all on function public.admin_read_trip_itinerary_versions(uuid, integer, bigint) from public, anon, authenticated;
grant execute on function public.admin_read_trip_itinerary_versions(uuid, integer, bigint) to service_role;
revoke admin_read_owner from postgres;
revoke create on schema public from admin_read_owner;

reset statement_timeout;
reset lock_timeout;
