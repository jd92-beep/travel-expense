begin;

do $$
begin
  if pg_catalog.has_function_privilege('anon', 'public.delete_own_user_account()', 'execute') then
    raise exception 'anon can execute public.delete_own_user_account()';
  end if;
  if pg_catalog.has_function_privilege('anon', 'public.trip_member_display_names(uuid[])', 'execute') then
    raise exception 'anon can execute public.trip_member_display_names(uuid[])';
  end if;
  if pg_catalog.has_function_privilege('anon', 'private.trip_member_role_rank(text)', 'execute') then
    raise exception 'anon can execute private.trip_member_role_rank(text)';
  end if;

  if not pg_catalog.has_function_privilege('authenticated', 'public.delete_own_user_account()', 'execute') then
    raise exception 'authenticated cannot execute public.delete_own_user_account()';
  end if;
  if not pg_catalog.has_function_privilege('authenticated', 'public.trip_member_display_names(uuid[])', 'execute') then
    raise exception 'authenticated cannot execute public.trip_member_display_names(uuid[])';
  end if;
end
$$;

select 'adjacent_security_privilege_smoke_passed' as result;

rollback;
