select jsonb_build_object(
  'policies', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', tablename,
      'policy', policyname,
      'roles', roles,
      'command', cmd
    ) order by tablename, policyname)
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in ('admin_action_requests', 'admin_console_config', 'admin_identity_links')
  ), '[]'::jsonb),
  'browser_grants', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', table_name,
      'grantee', grantee,
      'privilege', privilege_type
    ) order by table_name, grantee, privilege_type)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('admin_action_requests', 'admin_console_config', 'admin_identity_links')
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ), '[]'::jsonb),
  'privilege_checks', (
    select jsonb_agg(jsonb_build_object(
      'role', role_name,
      'table', table_name,
      'select', pg_catalog.has_table_privilege(role_name, format('public.%I', table_name), 'select'),
      'insert', pg_catalog.has_table_privilege(role_name, format('public.%I', table_name), 'insert'),
      'update', pg_catalog.has_table_privilege(role_name, format('public.%I', table_name), 'update'),
      'delete', pg_catalog.has_table_privilege(role_name, format('public.%I', table_name), 'delete')
    ) order by role_name, table_name)
    from unnest(array['anon', 'authenticated']) role_name
    cross join unnest(array['admin_action_requests', 'admin_console_config', 'admin_identity_links']) table_name
  ),
  'rpc_execute', jsonb_build_object(
    'anon', pg_catalog.has_function_privilege('anon', 'public.admin_kanban_rls_state()', 'execute'),
    'authenticated', pg_catalog.has_function_privilege('authenticated', 'public.admin_kanban_rls_state()', 'execute'),
    'service_role', pg_catalog.has_function_privilege('service_role', 'public.admin_kanban_rls_state()', 'execute')
  )
) as admin_console_privilege_report;
