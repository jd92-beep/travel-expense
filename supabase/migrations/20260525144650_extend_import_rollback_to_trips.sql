create or replace function private.rollback_import_batch(p_batch_id uuid)
returns table(target_table text, deleted_count integer)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  delete from public.receipt_photos rp
  using private.import_rollback_log l
  where l.batch_id = p_batch_id
    and l.target_table = 'receipt_photos'
    and rp.id = l.target_id;
  get diagnostics deleted_count = row_count;
  target_table := 'receipt_photos';
  return next;

  delete from public.receipt_items ri
  using private.import_rollback_log l
  where l.batch_id = p_batch_id
    and l.target_table = 'receipt_items'
    and ri.id = l.target_id;
  get diagnostics deleted_count = row_count;
  target_table := 'receipt_items';
  return next;

  delete from public.receipts r
  using private.import_rollback_log l
  where l.batch_id = p_batch_id
    and l.target_table = 'receipts'
    and r.id = l.target_id;
  get diagnostics deleted_count = row_count;
  target_table := 'receipts';
  return next;

  delete from public.trips t
  using private.import_rollback_log l
  where l.batch_id = p_batch_id
    and l.target_table = 'trips'
    and t.id = l.target_id;
  get diagnostics deleted_count = row_count;
  target_table := 'trips';
  return next;

  update private.notion_import_batches
  set status = 'rolled_back', finished_at = now(), rollback_notes = coalesce(rollback_notes, '') || E'\nRolled back at ' || now()::text
  where id = p_batch_id;
end;
$$;

revoke all on function private.rollback_import_batch(uuid) from public;;
