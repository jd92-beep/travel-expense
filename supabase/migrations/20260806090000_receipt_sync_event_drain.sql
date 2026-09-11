-- Event-driven receipt-sync drain. Instead of an always-on external cron, a
-- shared ledger entering its travel window (trip dates +/- 7 days) schedules a
-- 20-minute pg_cron tick; the tick unschedules itself once no shared ledger is
-- in window. New outbox work also kicks an immediate drain, debounced.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

create schema if not exists private;

create table if not exists private.receipt_sync_drain_config (
  id boolean primary key default true check (id),
  endpoint text not null,
  shared_secret text not null,
  last_tick_at timestamptz,
  last_tick_result text,
  updated_at timestamptz not null default now()
);

revoke all on table private.receipt_sync_drain_config from public, anon, authenticated;

-- True when any shared ledger (trip with a Notion backend link) sits inside its
-- travel window: trip dates +/- 7 days. Undated trips count as in-window so
-- real work is never silently skipped.
create or replace function private.receipt_sync_shared_trip_in_window()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_backend_links link
    join public.trips trip on trip.id = link.trip_id
    where (trip.start_date is null or trip.start_date <= (current_date + 7))
      and (trip.end_date is null or trip.end_date >= (current_date - 7))
  );
$$;

-- 20-minute tick. Unschedules itself when no shared ledger is in window, so the
-- loop only exists while a trip is active-ish.
create or replace function private.receipt_sync_drain_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_endpoint text;
  v_secret text;
begin
  if not private.receipt_sync_shared_trip_in_window() then
    begin
      perform cron.unschedule('receipt-sync-drain');
    exception when others then
      null;
    end;
    update private.receipt_sync_drain_config
       set last_tick_at = now(),
           last_tick_result = 'unscheduled: no shared trip in window',
           updated_at = now()
     where id is true;
    return;
  end if;

  select endpoint, shared_secret
    into v_endpoint, v_secret
    from private.receipt_sync_drain_config
   where id is true;

  if v_endpoint is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Sync-Worker-Key', v_secret
    ),
    body := '{"limit":10}'::jsonb,
    timeout_milliseconds := 5000
  );

  update private.receipt_sync_drain_config
     set last_tick_at = now(),
         last_tick_result = 'posted',
         updated_at = now()
   where id is true;
end;
$$;

-- Kick: called by triggers when a shared ledger appears or new outbox work
-- lands. Schedules the 20-minute loop if missing, and fires one immediate
-- drain (debounced to 2 minutes) so fresh work does not wait for the next tick.
create or replace function private.receipt_sync_drain_kick()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_tick timestamptz;
begin
  if not private.receipt_sync_shared_trip_in_window() then
    return null;
  end if;

  begin
    if not exists (select 1 from cron.job where jobname = 'receipt-sync-drain') then
      perform cron.schedule(
        'receipt-sync-drain',
        '*/20 * * * *',
        'select private.receipt_sync_drain_tick()'
      );
    end if;
  exception when others then
    -- Non-fatal: pg_cron may be unavailable to the migration role in
    -- disposable stacks; the next in-window kick or tick retries.
    null;
  end;

  select last_tick_at into v_last_tick
    from private.receipt_sync_drain_config
   where id is true;

  if v_last_tick is null or v_last_tick < now() - interval '2 minutes' then
    perform private.receipt_sync_drain_tick();
  end if;

  return null;
end;
$$;

drop trigger if exists receipt_sync_drain_kick_links on public.trip_backend_links;
create trigger receipt_sync_drain_kick_links
after insert on public.trip_backend_links
for each statement execute function private.receipt_sync_drain_kick();

drop trigger if exists receipt_sync_drain_kick_jobs on public.receipt_sync_jobs;
create trigger receipt_sync_drain_kick_jobs
after insert on public.receipt_sync_jobs
for each statement execute function private.receipt_sync_drain_kick();

drop trigger if exists receipt_sync_drain_kick_trips on public.trips;
create trigger receipt_sync_drain_kick_trips
after insert or update of start_date, end_date on public.trips
for each statement execute function private.receipt_sync_drain_kick();

revoke all on function private.receipt_sync_shared_trip_in_window() from public, anon, authenticated, service_role;
revoke all on function private.receipt_sync_drain_tick() from public, anon, authenticated, service_role;
revoke all on function private.receipt_sync_drain_kick() from public, anon, authenticated, service_role;

commit;
