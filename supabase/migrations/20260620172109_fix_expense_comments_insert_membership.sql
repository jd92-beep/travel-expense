-- Tighten expense comment inserts: authors must also be active members of the receipt trip.

drop policy if exists "expense_comments_insert_own" on public.expense_comments;
drop policy if exists "expense_comments_insert_own_trip_members" on public.expense_comments;

create policy "expense_comments_insert_own_trip_members"
  on public.expense_comments for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.receipts r
      join public.trip_members tm
        on tm.trip_id = r.trip_id
       and tm.user_id = auth.uid()
       and tm.status = 'active'
      where r.id = expense_comments.receipt_id
    )
  );;
