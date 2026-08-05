-- Keep public app tables under RLS even for table-owner contexts.
-- Supabase clients already use anon/authenticated roles, but FORCE RLS keeps
-- the production schema aligned with the intended least-privilege boundary.
--
-- Rollback, only if a trusted server-side maintenance role explicitly needs it:
--   alter table <table> no force row level security;

alter table public.profiles force row level security;
alter table public.trips force row level security;
alter table public.trip_members force row level security;
alter table public.receipts force row level security;
alter table public.receipt_items force row level security;
alter table public.receipt_photos force row level security;
alter table public.integrations force row level security;
alter table public.receipt_sync_jobs force row level security;;
