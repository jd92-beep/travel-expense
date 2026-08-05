create index if not exists notion_import_batches_target_owner_id_idx
  on private.notion_import_batches (target_owner_id);

create index if not exists notion_import_batches_target_trip_id_idx
  on private.notion_import_batches (target_trip_id);

create index if not exists notion_receipt_staging_imported_receipt_id_idx
  on private.notion_receipt_staging (imported_receipt_id);;
