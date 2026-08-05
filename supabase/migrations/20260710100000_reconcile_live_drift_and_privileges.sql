begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Match the live account-deletion contract without deleting import history early.
alter table private.notion_import_batches
  drop constraint if exists notion_import_batches_target_owner_id_fkey;

alter table private.notion_import_batches
  add constraint notion_import_batches_target_owner_id_fkey
  foreign key (target_owner_id)
  references auth.users(id)
  on delete cascade;

-- Browser writes must never persist personal Notion references. Server-side
-- service-role writes may retain them for verified mirror operations.
create or replace function public.enforce_receipt_private_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.notion_page_id := null;
    new.notion_database_id := null;
  end if;
  return new;
end;
$$;

-- Child rows inherit the receipt visibility boundary. Owners keep the
-- dedicated *_select_own policies; trip members may only read children of a
-- receipt that is explicitly shared with the trip.
drop policy if exists receipt_items_select_trip_members on public.receipt_items;
create policy receipt_items_select_trip_members
  on public.receipt_items for select
  to authenticated
  using (
    exists (
      select 1
      from public.receipts r
      where r.id = receipt_items.receipt_id
        and r.visibility = 'trip'
        and private.can_access_trip(r.trip_id)
    )
  );

drop policy if exists receipt_photos_select_trip_members on public.receipt_photos;
create policy receipt_photos_select_trip_members
  on public.receipt_photos for select
  to authenticated
  using (
    exists (
      select 1
      from public.receipts r
      where r.id = receipt_photos.receipt_id
        and r.visibility = 'trip'
        and private.can_access_trip(r.trip_id)
    )
  );

-- Remove platform-version-dependent default grants before adding the explicit
-- browser and service-role contract.
revoke all privileges on table
  public.admin_action_requests,
  public.admin_audit_events,
  public.admin_console_config,
  public.admin_identity_links,
  public.admin_signup_notifications,
  public.app_usage_events,
  public.data_quality_findings,
  public.data_quality_runs,
  public.expense_comments,
  public.integrations,
  public.profiles,
  public.receipt_items,
  public.receipt_photos,
  public.receipt_sync_jobs,
  public.receipts,
  public.sync_attempt_events,
  public.trip_accounting_people,
  public.trip_backend_links,
  public.trip_invites,
  public.trip_members,
  public.trips
from anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.integrations,
  public.profiles,
  public.receipt_items,
  public.receipt_photos,
  public.receipt_sync_jobs,
  public.receipts,
  public.trip_members,
  public.trips
to authenticated;

grant select, insert on table
  public.app_usage_events,
  public.sync_attempt_events
to authenticated;

grant select on table
  public.trip_backend_links,
  public.trip_invites
to authenticated;

grant select, insert, update, delete on table public.trip_accounting_people
to authenticated;

grant select, insert, delete on table public.expense_comments
to authenticated;

grant select, insert, update, delete on table
  public.admin_action_requests,
  public.admin_console_config,
  public.admin_identity_links,
  public.app_usage_events,
  public.data_quality_findings,
  public.data_quality_runs,
  public.expense_comments,
  public.integrations,
  public.profiles,
  public.receipt_items,
  public.receipt_photos,
  public.receipt_sync_jobs,
  public.receipts,
  public.sync_attempt_events,
  public.trip_accounting_people,
  public.trip_backend_links,
  public.trip_invites,
  public.trip_members,
  public.trips
to service_role;

grant select, insert on table public.admin_audit_events to service_role;
grant select, insert, update on table public.admin_signup_notifications to service_role;

-- SECURITY DEFINER functions are never executable by anon or PUBLIC. Trigger
-- functions remain callable by their trusted internal roles only.
revoke all privileges on function private.add_owner_trip_member() from public, anon, authenticated, service_role;
revoke all privileges on function private.can_access_trip(uuid) from public, anon, authenticated, service_role;
revoke all privileges on function private.can_admin_trip(uuid) from public, anon, authenticated, service_role;
revoke all privileges on function private.can_edit_trip(uuid) from public, anon, authenticated, service_role;
revoke all privileges on function private.handle_new_user_profile() from public, anon, authenticated, service_role;
revoke all privileges on function private.rollback_import_batch(uuid) from public, anon, authenticated, service_role;
revoke all privileges on function private.set_updated_at() from public, anon, authenticated, service_role;

revoke all privileges on function public.accept_trip_invite(text) from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_kanban_rls_state() from public, anon, authenticated, service_role;
revoke all privileges on function public.create_trip_invite(uuid, text, text, integer) from public, anon, authenticated, service_role;
revoke all privileges on function public.delete_own_user_account() from public, anon, authenticated, service_role;
revoke all privileges on function public.delete_shared_trip_receipt(uuid, uuid, text, text) from public, anon, authenticated, service_role;
revoke all privileges on function public.enforce_receipt_private_fields() from public, anon, authenticated, service_role;
revoke all privileges on function public.enforce_trip_private_fields() from public, anon, authenticated, service_role;
revoke all privileges on function public.enqueue_notion_receipt_sync(uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all privileges on function public.leave_trip(uuid) from public, anon, authenticated, service_role;
revoke all privileges on function public.notify_admin_on_auth_user_created() from public, anon, authenticated, service_role;
revoke all privileges on function public.remove_trip_member(uuid, uuid) from public, anon, authenticated, service_role;
revoke all privileges on function public.revoke_trip_invite(uuid) from public, anon, authenticated, service_role;
revoke all privileges on function public.trip_member_display_names(uuid[]) from public, anon, authenticated, service_role;
revoke all privileges on function public.update_trip_member_role(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all privileges on function public.upsert_shared_trip_receipt(uuid, jsonb, uuid, text, text) from public, anon, authenticated, service_role;

grant execute on function
  private.can_access_trip(uuid),
  private.can_admin_trip(uuid),
  private.can_edit_trip(uuid)
to authenticated, service_role;

grant execute on function
  private.add_owner_trip_member(),
  private.handle_new_user_profile(),
  private.rollback_import_batch(uuid),
  private.set_updated_at(),
  public.admin_kanban_rls_state(),
  public.enforce_receipt_private_fields(),
  public.enforce_trip_private_fields()
to service_role;

grant execute on function public.enqueue_notion_receipt_sync(uuid, text, jsonb)
to authenticated, service_role;

grant execute on function
  public.accept_trip_invite(text),
  public.create_trip_invite(uuid, text, text, integer),
  public.delete_own_user_account(),
  public.delete_shared_trip_receipt(uuid, uuid, text, text),
  public.leave_trip(uuid),
  public.remove_trip_member(uuid, uuid),
  public.revoke_trip_invite(uuid),
  public.trip_member_display_names(uuid[]),
  public.update_trip_member_role(uuid, uuid, text),
  public.upsert_shared_trip_receipt(uuid, jsonb, uuid, text, text)
to authenticated, service_role;

grant execute on function private.handle_new_user_profile() to supabase_auth_admin;
grant execute on function public.notify_admin_on_auth_user_created() to supabase_auth_admin;

alter function private.add_owner_trip_member() set search_path = '';
alter function private.can_access_trip(uuid) set search_path = '';
alter function private.can_admin_trip(uuid) set search_path = '';
alter function private.can_edit_trip(uuid) set search_path = '';
alter function private.handle_new_user_profile() set search_path = '';
alter function private.rollback_import_batch(uuid) set search_path = '';

alter function public.accept_trip_invite(text) set search_path = pg_catalog, extensions;
alter function public.create_trip_invite(uuid, text, text, integer) set search_path = pg_catalog, extensions;
alter function public.delete_shared_trip_receipt(uuid, uuid, text, text) set search_path = '';
alter function public.enforce_receipt_private_fields() set search_path = '';
alter function public.enforce_trip_private_fields() set search_path = '';
alter function public.leave_trip(uuid) set search_path = '';
alter function public.notify_admin_on_auth_user_created() set search_path = pg_catalog, extensions;
alter function public.remove_trip_member(uuid, uuid) set search_path = '';
alter function public.revoke_trip_invite(uuid) set search_path = '';
alter function public.update_trip_member_role(uuid, uuid, text) set search_path = '';
alter function public.upsert_shared_trip_receipt(uuid, jsonb, uuid, text, text) set search_path = '';

commit;
