-- Emergency containment for Admin Console state. Forward-only and idempotent.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create schema if not exists private;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'admin_console_owner') then
    create role admin_console_owner nologin noinherit;
  end if;
end
$$;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role, admin_console_owner;

alter table public.admin_action_requests enable row level security;
alter table public.admin_action_requests force row level security;
alter table public.admin_console_config enable row level security;
alter table public.admin_console_config force row level security;
alter table public.admin_identity_links enable row level security;
alter table public.admin_identity_links force row level security;

drop policy if exists service_role_admin_action_requests on public.admin_action_requests;
drop policy if exists service_role_admin_console_config on public.admin_console_config;
drop policy if exists service_role_admin_identity_links on public.admin_identity_links;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in ('admin_action_requests', 'admin_console_config', 'admin_identity_links')
      and (
        'public' = any(roles)
        or 'anon' = any(roles)
        or 'authenticated' = any(roles)
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$$;

create policy service_role_admin_action_requests
  on public.admin_action_requests for all to service_role
  using (true) with check (true);
create policy service_role_admin_console_config
  on public.admin_console_config for all to service_role
  using (true) with check (true);
create policy service_role_admin_identity_links
  on public.admin_identity_links for all to service_role
  using (true) with check (true);

revoke all on table public.admin_action_requests from public, anon, authenticated;
revoke all on table public.admin_console_config from public, anon, authenticated;
revoke all on table public.admin_identity_links from public, anon, authenticated;

grant select, insert, update, delete on table public.admin_action_requests to service_role;
grant select, insert, update, delete on table public.admin_console_config to service_role;
grant select, insert, update, delete on table public.admin_identity_links to service_role;

do $$
declare
  sequence_record record;
begin
  for sequence_record in
    select distinct sequence_namespace.nspname as schema_name, sequence_class.relname as sequence_name
    from pg_catalog.pg_class sequence_class
    join pg_catalog.pg_namespace sequence_namespace on sequence_namespace.oid = sequence_class.relnamespace
    join pg_catalog.pg_depend dependency on dependency.objid = sequence_class.oid
    join pg_catalog.pg_class table_class on table_class.oid = dependency.refobjid
    join pg_catalog.pg_namespace table_namespace on table_namespace.oid = table_class.relnamespace
    where sequence_class.relkind = 'S'
      and table_namespace.nspname = 'public'
      and table_class.relname in ('admin_action_requests', 'admin_console_config', 'admin_identity_links')
  loop
    execute format(
      'revoke all on sequence %I.%I from public, anon, authenticated',
      sequence_record.schema_name,
      sequence_record.sequence_name
    );
    execute format(
      'grant usage, select, update on sequence %I.%I to service_role',
      sequence_record.schema_name,
      sequence_record.sequence_name
    );
  end loop;
end
$$;

do $$
declare
  view_record record;
begin
  for view_record in
    select distinct view_namespace.nspname as schema_name, view_class.relname as view_name
    from pg_catalog.pg_class view_class
    join pg_catalog.pg_namespace view_namespace on view_namespace.oid = view_class.relnamespace
    join pg_catalog.pg_rewrite rewrite_rule on rewrite_rule.ev_class = view_class.oid
    join pg_catalog.pg_depend dependency on dependency.objid = rewrite_rule.oid
    join pg_catalog.pg_class source_class on source_class.oid = dependency.refobjid
    join pg_catalog.pg_namespace source_namespace on source_namespace.oid = source_class.relnamespace
    where view_class.relkind in ('v', 'm')
      and source_namespace.nspname = 'public'
      and source_class.relname in ('admin_action_requests', 'admin_console_config', 'admin_identity_links')
  loop
    execute format(
      'revoke all on table %I.%I from public, anon, authenticated',
      view_record.schema_name,
      view_record.view_name
    );
    execute format(
      'grant select on table %I.%I to service_role',
      view_record.schema_name,
      view_record.view_name
    );
  end loop;
end
$$;

create or replace function public.admin_kanban_rls_state()
returns table(table_name text, rls_enabled boolean, force_rls boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select relation.relname::text as table_name,
         relation.relrowsecurity as rls_enabled,
         relation.relforcerowsecurity as force_rls
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname in (
      'profiles',
      'trips',
      'trip_members',
      'receipts',
      'receipt_items',
      'receipt_photos',
      'integrations',
      'receipt_sync_jobs',
      'app_usage_events',
      'sync_attempt_events',
      'data_quality_runs',
      'data_quality_findings',
      'admin_audit_events',
      'admin_action_requests',
      'admin_console_config',
      'admin_identity_links'
    )
  order by relation.relname;
$$;

grant usage, create on schema public to admin_console_owner;
alter function public.admin_kanban_rls_state() owner to admin_console_owner;
revoke create on schema public from admin_console_owner;
grant usage on schema public to admin_console_owner;

revoke execute on function public.admin_kanban_rls_state() from public, anon, authenticated;
grant execute on function public.admin_kanban_rls_state() to service_role;

do $$
declare
  function_record record;
begin
  for function_record in
    select namespace.nspname as schema_name,
           procedure.proname as function_name,
           pg_catalog.pg_get_function_identity_arguments(procedure.oid) as identity_arguments
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
      and procedure.proname like 'admin\_%' escape '\'
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from public, anon, authenticated',
      function_record.schema_name,
      function_record.function_name,
      function_record.identity_arguments
    );
    execute format(
      'grant execute on function %I.%I(%s) to service_role',
      function_record.schema_name,
      function_record.function_name,
      function_record.identity_arguments
    );
  end loop;
end
$$;

alter default privileges for role admin_console_owner in schema private
  revoke all on tables from public, anon, authenticated;
alter default privileges for role admin_console_owner in schema private
  revoke execute on functions from public, anon, authenticated;

commit;
