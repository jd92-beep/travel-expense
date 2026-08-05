-- Append-only expense comments for shared trips. Applied via Supabase Management API; do not blind db push.

create table if not exists public.expense_comments (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.expense_comments enable row level security;

-- Trip members can read comments on receipts they can see
create policy "expense_comments_select_trip_members"
  on public.expense_comments for select
  using (
    exists (
      select 1 from public.receipts r
      join public.trip_members tm on tm.trip_id = r.trip_id and tm.user_id = auth.uid() and tm.status = 'active'
      where r.id = expense_comments.receipt_id
    )
  );

-- Authenticated users can insert their own comments
create policy "expense_comments_insert_own"
  on public.expense_comments for insert
  with check (user_id = auth.uid());

-- Authors can delete their own comments
create policy "expense_comments_delete_own"
  on public.expense_comments for delete
  using (user_id = auth.uid());

-- Index for fast lookup by receipt
create index if not exists idx_expense_comments_receipt on public.expense_comments(receipt_id, created_at);

-- Grant frontend access
grant select, insert, delete on public.expense_comments to authenticated;;
