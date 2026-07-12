-- Keep expense comment table grants aligned with the append/delete UI.

revoke all privileges on table public.expense_comments from anon;
revoke all privileges on table public.expense_comments from authenticated;

grant select, insert, delete on table public.expense_comments to authenticated;;
