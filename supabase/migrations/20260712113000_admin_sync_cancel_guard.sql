-- A processing sync job is owned by a worker. Admin may cancel only while the
-- job is still pending; claimed work must finish or fail through worker state.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

grant admin_auth_owner to postgres;
grant usage, create on schema private to admin_auth_owner;

create or replace function private.validate_admin_sync_cancel_operation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.receipt_sync_jobs%rowtype;
begin
  if new.action <> 'cancel_sync_job' then
    return new;
  end if;
  if new.target_type <> 'sync_job'
    or coalesce(new.target_ref, '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or new.payload ->> 'jobId' is distinct from new.target_ref
  then
    raise exception 'Invalid sync cancellation operation' using errcode = '22023';
  end if;

  select * into v_job
  from public.receipt_sync_jobs
  where id = new.target_ref::uuid;
  if not found then
    raise exception 'Sync job not found' using errcode = 'P0002';
  end if;
  if v_job.status <> 'pending' then
    raise exception 'Only a pending sync job can be cancelled immediately'
      using errcode = '23514';
  end if;
  if new.target_version is null
    or v_job.updated_at is distinct from new.target_version::timestamptz
  then
    raise exception 'Sync job preview is stale' using errcode = '40001';
  end if;
  return new;
end;
$$;

alter function private.validate_admin_sync_cancel_operation()
  owner to admin_auth_owner;

drop trigger if exists admin_operations_validate_sync_cancel
  on private.admin_operations;
create trigger admin_operations_validate_sync_cancel
before insert or update of action, target_type, target_ref, target_version, payload
on private.admin_operations
for each row execute function private.validate_admin_sync_cancel_operation();

revoke all on function private.validate_admin_sync_cancel_operation()
  from public, anon, authenticated, service_role;

revoke create on schema private from admin_auth_owner;
revoke admin_auth_owner from postgres;

commit;
