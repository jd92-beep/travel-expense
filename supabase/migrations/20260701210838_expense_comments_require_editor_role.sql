-- Close a viewer-permission gap: viewers could post/delete expense comments despite being
-- read-only everywhere else (receipts insert/update/delete already require can_edit_trip, which
-- excludes viewer). Comments remain readable by any active trip member (select policy unchanged).

drop policy if exists "expense_comments_insert_own_trip_members" on public.expense_comments;
create policy "expense_comments_insert_own_trip_members"
  on public.expense_comments for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.receipts r
      where r.id = expense_comments.receipt_id
        and private.can_edit_trip(r.trip_id)
    )
  );

drop policy if exists "expense_comments_delete_own" on public.expense_comments;
create policy "expense_comments_delete_own"
  on public.expense_comments for delete
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.receipts r
      where r.id = expense_comments.receipt_id
        and private.can_edit_trip(r.trip_id)
    )
  );
