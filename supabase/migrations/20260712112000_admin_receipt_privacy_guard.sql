-- Keep Admin receipt previews aligned with the Compact/Android private receipt
-- invariant: a hidden receipt cannot affect another beneficiary's balance.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

grant admin_auth_owner to postgres;
grant usage, create on schema private to admin_auth_owner;

create or replace function private.validate_admin_receipt_privacy_operation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.receipts%rowtype;
  v_patch jsonb;
  v_expected bigint;
begin
  if new.action <> 'receipt_amend' then
    return new;
  end if;
  v_patch := new.payload -> 'patch';
  if coalesce(v_patch ->> 'visibility', '') <> 'private' then
    return new;
  end if;
  if new.target_type <> 'receipt'
    or coalesce(new.target_ref, '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or jsonb_typeof(new.payload) <> 'object'
    or jsonb_typeof(v_patch) <> 'object'
    or coalesce(new.payload ->> 'expectedVersion', '') !~ '^\d+$'
  then
    raise exception 'Invalid receipt privacy operation' using errcode = '22023';
  end if;

  select * into v_receipt
  from public.receipts
  where id = new.target_ref::uuid;
  if not found then
    raise exception 'Receipt not found' using errcode = 'P0002';
  end if;
  v_expected := (new.payload ->> 'expectedVersion')::bigint;
  if v_expected <> v_receipt.version
    or coalesce(new.target_version, '') <> v_receipt.version::text
  then
    raise exception 'Receipt preview is stale' using errcode = '40001';
  end if;
  if nullif(btrim(coalesce(v_receipt.beneficiary_id, '')), '') is not null
    and nullif(btrim(v_receipt.beneficiary_id), '') is distinct from
      nullif(btrim(coalesce(v_receipt.person_id, '')), '')
  then
    raise exception 'Cross-person beneficiary cannot be hidden by private visibility'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

alter function private.validate_admin_receipt_privacy_operation()
  owner to admin_auth_owner;

drop trigger if exists admin_operations_validate_receipt_privacy
  on private.admin_operations;
create trigger admin_operations_validate_receipt_privacy
before insert or update of action, target_type, target_ref, target_version, payload
on private.admin_operations
for each row execute function private.validate_admin_receipt_privacy_operation();

revoke all on function private.validate_admin_receipt_privacy_operation()
  from public, anon, authenticated, service_role;

revoke create on schema private from admin_auth_owner;
revoke admin_auth_owner from postgres;

commit;
