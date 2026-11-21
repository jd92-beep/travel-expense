-- Apply on travel-migration-staging only, after identity-bridge.sql.
-- The deployment supplies the selected legacy UUID and a separate login secret.
\set ON_ERROR_STOP on
begin;
select set_config('preview.ledger_id', :'preview_ledger_id'::uuid::text, true);
create role travel_web_user nologin noinherit;
create role travel_preview_runtime login noinherit;
grant travel_web_user, travel_account_linker to travel_preview_runtime;
grant usage on schema public, migration_auth, private to travel_web_user;
grant select on public.trips, public.receipts, public.receipt_photos to travel_web_user;
grant execute on function private.can_access_trip(uuid) to travel_web_user;
grant select on migration_auth.claims to travel_web_user;

do $$
declare
  policy record;
  scope_id uuid := current_setting('preview.ledger_id')::uuid;
begin
  if not exists (select 1 from migration_auth.users where id = scope_id and email_confirmed_at is not null) then
    raise exception 'Preview account missing';
  end if;
  for policy in select tablename, policyname, qual from pg_policies
    where schemaname = 'public' and tablename in ('trips', 'receipts', 'receipt_photos')
      and cmd = 'SELECT' and 'authenticated'::name = any(roles)
  loop
    execute format('create policy %I on public.%I for select to travel_web_user using ((%s) and exists (select 1 from migration_auth.claims where (claims->>''sub'')::uuid = %L))',
      'preview_' || policy.policyname, policy.tablename, policy.qual, scope_id);
  end loop;
end
$$;
commit;
