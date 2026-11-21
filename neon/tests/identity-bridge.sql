-- Run on a disposable copy of the ledger schema after identity-bridge.sql.
begin;
insert into migration_auth.users (id, email, email_confirmed_at)
values
  ('12300000-0000-4000-8000-000000000001', 'linked@example.invalid', now()),
  ('12300000-0000-4000-8000-000000000002', 'unverified@example.invalid', null);

do $$
begin
  if has_function_privilege('authenticated', 'migration_auth.link_neon_account(uuid,uuid,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'migration_auth.resolve_neon_account(uuid)', 'EXECUTE')
    or has_table_privilege('travel_account_linker', 'migration_auth.neon_user_links', 'INSERT')
    or has_table_privilege('authenticated', 'migration_auth.neon_user_links', 'SELECT') then
    raise exception 'Unexpected identity bridge privilege';
  end if;
end $$;

set local role travel_account_linker;
do $$
declare
  ledger_id constant uuid := '12300000-0000-4000-8000-000000000001';
  unverified_ledger constant uuid := '12300000-0000-4000-8000-000000000002';
  neon_id constant uuid := '22300000-0000-4000-8000-000000000001';
  other_neon constant uuid := '22300000-0000-4000-8000-000000000002';
begin
  if migration_auth.resolve_neon_account(neon_id) is not null then
    raise exception 'Unlinked user resolved';
  end if;

  begin
    perform migration_auth.link_neon_account(ledger_id, neon_id, 'different@example.invalid');
    raise exception 'Link accepted an unrelated email';
  exception when insufficient_privilege then null; end;
  begin
    perform migration_auth.link_neon_account(unverified_ledger, neon_id, 'unverified@example.invalid');
    raise exception 'Link accepted an unverified legacy identity';
  exception when insufficient_privilege then null; end;

  perform migration_auth.link_neon_account(ledger_id, neon_id, 'linked@example.invalid');
  perform migration_auth.link_neon_account(ledger_id, neon_id, 'linked@example.invalid');
  if migration_auth.resolve_neon_account(neon_id) is distinct from ledger_id then
    raise exception 'Existing owner UUID did not survive linking';
  end if;

  begin
    perform migration_auth.link_neon_account(ledger_id, other_neon, 'linked@example.invalid');
    raise exception 'Unexpected reassignment to another user';
  exception when unique_violation then null; end;
  if migration_auth.resolve_neon_account(other_neon) is not null then
    raise exception 'Another account gained access to the ledger';
  end if;
end $$;
reset role;

update migration_auth.users set banned_until = now() + interval '1 day'
  where id = '12300000-0000-4000-8000-000000000001';
set local role travel_account_linker;
do $$
begin
  if migration_auth.resolve_neon_account('22300000-0000-4000-8000-000000000001') is not null then
    raise exception 'Banned legacy identity retained access';
  end if;
end $$;
rollback;
