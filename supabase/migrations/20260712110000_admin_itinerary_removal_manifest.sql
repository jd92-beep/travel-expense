-- Require an exact, version-bound removal manifest before an admin itinerary
-- preview can be persisted. Commit rechecks the bound itinerary version.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

grant admin_auth_owner to postgres;
grant usage, create on schema private to admin_auth_owner;

create or replace function private.validate_admin_itinerary_operation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip public.trips%rowtype;
  v_start date;
  v_end date;
  v_expected bigint;
  v_required date[];
  v_provided date[];
begin
  if new.action <> 'itinerary_amend' then
    return new;
  end if;
  if new.target_type <> 'trip'
    or coalesce(new.target_ref, '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(new.payload) <> 'object'
    or exists (
      select 1 from jsonb_object_keys(new.payload) as keys(key)
      where key not in (
        'endDate', 'expectedVersion', 'itinerary', 'removedDates', 'startDate'
      )
    )
  then
    raise exception 'Invalid itinerary operation payload' using errcode = '22023';
  end if;

  select * into v_trip
  from public.trips
  where id = new.target_ref::uuid;
  if not found then
    raise exception 'Trip not found' using errcode = 'P0002';
  end if;

  begin
    if coalesce(new.payload ->> 'startDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(new.payload ->> 'endDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(new.payload ->> 'expectedVersion', '') !~ '^\d+$'
    then
      raise exception 'Invalid itinerary operation payload' using errcode = '22023';
    end if;
    v_start := (new.payload ->> 'startDate')::date;
    v_end := (new.payload ->> 'endDate')::date;
    v_expected := (new.payload ->> 'expectedVersion')::bigint;
  exception when datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
    raise exception 'Invalid itinerary operation payload' using errcode = '22023';
  end;

  if v_start > v_end
    or v_expected <> v_trip.itinerary_version
    or coalesce(new.target_version, '') <> v_trip.itinerary_version::text
  then
    raise exception 'Itinerary preview is stale' using errcode = '40001';
  end if;
  perform private.assert_itinerary_contract(v_start, v_end, new.payload -> 'itinerary');

  if jsonb_typeof(new.payload -> 'removedDates') <> 'array'
    or jsonb_array_length(new.payload -> 'removedDates') > 366
    or exists (
      select 1
      from jsonb_array_elements(new.payload -> 'removedDates') as removed(value)
      where jsonb_typeof(value) <> 'string'
        or value #>> '{}' !~ '^\d{4}-\d{2}-\d{2}$'
    )
    or (
      select count(*) <> count(distinct value #>> '{}')
      from jsonb_array_elements(new.payload -> 'removedDates') as removed(value)
    )
  then
    raise exception 'Invalid itinerary removal manifest' using errcode = '22023';
  end if;

  begin
    select coalesce(array_agg(day::date order by day), array[]::date[])
    into v_required
    from generate_series(
      v_trip.start_date::timestamp,
      v_trip.end_date::timestamp,
      interval '1 day'
    ) as generated(day)
    where day::date < v_start or day::date > v_end;

    select coalesce(
      array_agg((value #>> '{}')::date order by (value #>> '{}')::date),
      array[]::date[]
    )
    into v_provided
    from jsonb_array_elements(new.payload -> 'removedDates') as removed(value);
  exception when datetime_field_overflow or invalid_datetime_format then
    raise exception 'Invalid itinerary removal manifest' using errcode = '22023';
  end;

  if v_provided is distinct from v_required then
    raise exception 'Itinerary date shrink requires exact explicit removals'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

alter function private.validate_admin_itinerary_operation()
  owner to admin_auth_owner;

drop trigger if exists admin_operations_validate_itinerary_manifest
  on private.admin_operations;
create trigger admin_operations_validate_itinerary_manifest
before insert or update of action, target_type, target_ref, target_version, payload
on private.admin_operations
for each row execute function private.validate_admin_itinerary_operation();

revoke all on function private.validate_admin_itinerary_operation()
  from public, anon, authenticated, service_role;

revoke create on schema private from admin_auth_owner;
revoke admin_auth_owner from postgres;

commit;
