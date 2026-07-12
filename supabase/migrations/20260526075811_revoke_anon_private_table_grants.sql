-- Least-privilege hardening for the public React app.
-- The app uses Supabase Auth; anonymous visitors must not have direct table
-- privileges on private travel data even though RLS also blocks access.
--
-- Rollback, if absolutely required for a different public-data feature:
--   grant select, insert, update, delete on <specific table> to anon;
-- Prefer adding a narrow authenticated policy instead of rolling this back.

revoke all privileges on table public.profiles from anon;
revoke all privileges on table public.trips from anon;
revoke all privileges on table public.trip_members from anon;
revoke all privileges on table public.receipts from anon;
revoke all privileges on table public.receipt_items from anon;
revoke all privileges on table public.receipt_photos from anon;
revoke all privileges on table public.integrations from anon;
revoke all privileges on table public.receipt_sync_jobs from anon;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.trips to authenticated;
grant select, insert, update, delete on table public.trip_members to authenticated;
grant select, insert, update, delete on table public.receipts to authenticated;
grant select, insert, update, delete on table public.receipt_items to authenticated;
grant select, insert, update, delete on table public.receipt_photos to authenticated;
grant select, insert, update, delete on table public.integrations to authenticated;
grant select, insert, update, delete on table public.receipt_sync_jobs to authenticated;;
