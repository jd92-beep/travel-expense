-- Keep authenticated users on the narrow table privileges the app needs.
-- RLS policies still decide which rows each user can access.
--
-- Rollback, if a future feature truly needs extra table privileges:
--   grant <specific privilege> on <specific table> to authenticated;
-- Avoid granting broad privileges such as truncate or trigger to app clients.

revoke all privileges on table public.profiles from authenticated;
revoke all privileges on table public.trips from authenticated;
revoke all privileges on table public.trip_members from authenticated;
revoke all privileges on table public.receipts from authenticated;
revoke all privileges on table public.receipt_items from authenticated;
revoke all privileges on table public.receipt_photos from authenticated;
revoke all privileges on table public.integrations from authenticated;
revoke all privileges on table public.receipt_sync_jobs from authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.trips to authenticated;
grant select, insert, update, delete on table public.trip_members to authenticated;
grant select, insert, update, delete on table public.receipts to authenticated;
grant select, insert, update, delete on table public.receipt_items to authenticated;
grant select, insert, update, delete on table public.receipt_photos to authenticated;
grant select, insert, update, delete on table public.integrations to authenticated;
grant select, insert, update, delete on table public.receipt_sync_jobs to authenticated;;
