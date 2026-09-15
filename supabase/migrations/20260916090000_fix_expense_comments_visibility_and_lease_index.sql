-- Session 90: backend correctness fixes found in audit.
-- NOT applied live by this commit. Requires Boss review + controlled apply.

begin;

-- 1) Expense comments must respect receipt visibility.
-- Co-members could previously read comments on private receipts.
drop policy if exists expense_comments_select_trip_members on public.expense_comments;
create policy expense_comments_select_trip_members
  on public.expense_comments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.receipts r
      join public.trip_members tm
        on tm.trip_id = r.trip_id
       and tm.user_id = auth.uid()
       and tm.status = 'active'
      where r.id = expense_comments.receipt_id
        and (r.visibility = 'trip' or r.owner_id = auth.uid())
    )
  );

-- 2) Stale processing lease reclaim needs an index that includes processing + locked_at.
create index if not exists receipt_sync_jobs_processing_lease_idx
  on private.receipt_sync_jobs (locked_at)
  where status = 'processing' and locked_at is not null;

commit;
