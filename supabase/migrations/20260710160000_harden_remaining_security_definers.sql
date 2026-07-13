-- Close adjacent SECURITY DEFINER exposure found during Admin 1.0 containment.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter function public.delete_own_user_account() set search_path = '';
revoke execute on function public.delete_own_user_account() from public, anon;
grant execute on function public.delete_own_user_account() to authenticated, service_role;

alter function public.trip_member_display_names(uuid[]) set search_path = '';
revoke execute on function public.trip_member_display_names(uuid[]) from public, anon;
grant execute on function public.trip_member_display_names(uuid[]) to authenticated, service_role;

alter function private.trip_member_role_rank(text) set search_path = '';
revoke execute on function private.trip_member_role_rank(text) from public, anon;
grant execute on function private.trip_member_role_rank(text) to authenticated, service_role;

commit;
