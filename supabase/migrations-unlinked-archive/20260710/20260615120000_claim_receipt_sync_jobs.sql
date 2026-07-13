-- Atomic outbox job claiming for shared-trip Notion mirror.
-- Uses FOR UPDATE SKIP LOCKED to prevent multiple clients from processing the same job.

create or replace function public.claim_receipt_sync_jobs(
  p_trip_ids uuid[],
  p_provider text default 'notion',
  p_worker text default null,
  p_limit integer default 20
)
returns setof public.receipt_sync_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate as (
    select j.id
    from public.receipt_sync_jobs j
    where j.provider = p_provider
      and j.trip_id = any(p_trip_ids)
      and j.status in ('pending', 'failed')
      and j.next_attempt_at <= now()
      and j.attempts < 5
      and (
        j.locked_at is null
        or j.locked_at < now() - interval '120 seconds'
      )
      and private.can_edit_trip(j.trip_id)
    order by j.next_attempt_at asc
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    for update skip locked
  )
  update public.receipt_sync_jobs j
  set locked_at = now(),
      locked_by = coalesce(nullif(p_worker, ''), auth.uid()::text),
      updated_at = now()
  from candidate
  where j.id = candidate.id
  returning j.*;
end;
$$;

revoke execute on function public.claim_receipt_sync_jobs(uuid[], text, text, integer) from public, anon;
grant execute on function public.claim_receipt_sync_jobs(uuid[], text, text, integer) to authenticated;
