\set ON_ERROR_STOP on

begin;

do $$
declare
  role_name text;
  table_name text;
begin
  foreach role_name in array array['public', 'anon', 'authenticated']
  loop
    foreach table_name in array array['admin_action_requests', 'admin_console_config', 'admin_identity_links']
    loop
      if pg_catalog.has_table_privilege(role_name, format('public.%I', table_name), 'select')
        or pg_catalog.has_table_privilege(role_name, format('public.%I', table_name), 'insert')
        or pg_catalog.has_table_privilege(role_name, format('public.%I', table_name), 'update')
        or pg_catalog.has_table_privilege(role_name, format('public.%I', table_name), 'delete') then
        raise exception '% still has CRUD on public.%', role_name, table_name;
      end if;
    end loop;
  end loop;

  if pg_catalog.has_function_privilege('public', 'public.admin_kanban_rls_state()', 'execute')
    or pg_catalog.has_function_privilege('anon', 'public.admin_kanban_rls_state()', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'public.admin_kanban_rls_state()', 'execute') then
    raise exception 'browser roles can still execute public.admin_kanban_rls_state()';
  end if;

  if not pg_catalog.has_function_privilege('service_role', 'public.admin_kanban_rls_state()', 'execute') then
    raise exception 'service_role cannot execute public.admin_kanban_rls_state()';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in ('admin_action_requests', 'admin_console_config', 'admin_identity_links')
      and (
        'public' = any(roles)
        or 'anon' = any(roles)
        or 'authenticated' = any(roles)
      )
  ) then
    raise exception 'browser-visible admin policy remains';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('admin_action_requests', 'admin_console_config', 'admin_identity_links')
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then
    raise exception 'browser-visible admin table grant remains';
  end if;
end
$$;

rollback;

select 'admin_console_privilege_smoke_passed' as result;
