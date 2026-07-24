import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..');
const files = readdirSync(join(repoRoot, 'supabase/migrations'))
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => `supabase/migrations/${file}`);

const stagedFiles = [
  'supabase/migrations-staged/20260710161000_private_receipt_photo_storage.sql',
];
const receiptPhotoCompatibilityMigration =
  'supabase/migrations/20260712122500_restore_receipt_photo_compatibility.sql';
const adminOperationKernelMigration =
  'supabase/migrations/20260710187000_admin_operation_kernel.sql';
const adminPasskeyRemovalMigration =
  'supabase/migrations/20260712123000_admin_passkey_removal.sql';
const staleReceiptSyncLeaseRecoveryMigration =
  'supabase/migrations/20260724110000_reclaim_stale_receipt_sync_processing_leases.sql';

const activeSql = files
  .map((file) => readFileSync(join(repoRoot, file), 'utf8'))
  .join('\n\n');
const stagedSql = stagedFiles
  .map((file) => readFileSync(join(repoRoot, file), 'utf8'))
  .join('\n\n');
const receiptPhotoCompatibilitySql = files.includes(receiptPhotoCompatibilityMigration)
  ? readFileSync(join(repoRoot, receiptPhotoCompatibilityMigration), 'utf8')
  : '';
const staleReceiptSyncLeaseRecoverySql = files.includes(staleReceiptSyncLeaseRecoveryMigration)
  ? readFileSync(join(repoRoot, staleReceiptSyncLeaseRecoveryMigration), 'utf8')
  : '';

const requiredPatterns = [
  {
    name: 'receipts update policy keeps row ownership with the signed-in user',
    re: /create policy receipts_update_trip_editors[\s\S]*?using\s*\(\s*owner_id\s*=\s*\(select auth\.uid\(\)\)[\s\S]*?with check\s*\(\s*owner_id\s*=\s*\(select auth\.uid\(\)\)/i,
  },
  {
    name: 'receipts delete policy keeps row ownership with the signed-in user',
    re: /create policy receipts_delete_trip_editors[\s\S]*?using\s*\(\s*owner_id\s*=\s*\(select auth\.uid\(\)\)/i,
  },
  {
    name: 'receipt sync job updates keep row ownership with the signed-in user',
    re: /create policy receipt_sync_jobs_update_trip_editors[\s\S]*?using\s*\(\s*owner_id\s*=\s*\(select auth\.uid\(\)\)[\s\S]*?with check\s*\(\s*owner_id\s*=\s*\(select auth\.uid\(\)\)/i,
  },
  {
    name: 'public tables force RLS',
    re: /alter table public\.receipts force row level security/i,
  },
  {
    name: 'anon direct table grants are revoked',
    re: /revoke all privileges on table public\.receipts from anon/i,
  },
  {
    name: 'trip writes scrub shared-row Notion page and database identifiers',
    re: /new\.notion_page_id\s*:=\s*null[\s\S]*?new\.notion_database_id\s*:=\s*null[\s\S]*?create trigger enforce_trip_private_fields_before_write[\s\S]*?before insert or update on public\.trips/i,
  },
  {
    name: 'receipt writes scrub shared-row Notion page and database identifiers',
    re: /create trigger enforce_receipt_private_fields_before_write[\s\S]*?before insert or update on public\.receipts/i,
  },
  {
    name: 'receipt item inserts require the parent receipt to belong to the signed-in user',
    re: /create policy receipt_items_insert_trip_editors[\s\S]*?r\.owner_id\s*=\s*\(select auth\.uid\(\)\)/i,
  },
  {
    name: 'receipt sync job inserts require matching receipt trip and owner',
    re: /create policy receipt_sync_jobs_insert_trip_editors[\s\S]*?r\.trip_id\s*=\s*receipt_sync_jobs\.trip_id[\s\S]*?r\.owner_id\s*=\s*\(select auth\.uid\(\)\)/i,
  },
  {
    name: 'receipt item select is owner-only',
    re: /create policy receipt_items_select_own[\s\S]*?using\s*\(\s*owner_id\s*=\s*\(select auth\.uid\(\)\)\s*\)/i,
  },
  {
    name: 'receipt photo select is owner-only',
    re: /create policy receipt_photos_select_own[\s\S]*?using\s*\(\s*owner_id\s*=\s*\(select auth\.uid\(\)\)\s*\)/i,
  },
  {
    name: 'trip-visible receipt items are shared without exposing private items',
    re: /create policy receipt_items_select_trip_members[\s\S]*?r\.visibility\s*=\s*'trip'[\s\S]*?private\.can_access_trip\(r\.trip_id\)/i,
  },
  {
    name: 'trip-visible receipt photos are shared without exposing private photos',
    re: /create policy receipt_photos_select_trip_members[\s\S]*?r\.visibility\s*=\s*'trip'[\s\S]*?private\.can_access_trip\(r\.trip_id\)/i,
  },
  {
    name: 'receipt sync job select is owner-only',
    re: /create policy receipt_sync_jobs_select_own[\s\S]*?using\s*\(\s*owner_id\s*=\s*\(select auth\.uid\(\)\)\s*\)/i,
  },
  {
    name: 'trip sharing tables force RLS',
    re: /alter table public\.trip_invites force row level security[\s\S]*?alter table public\.trip_backend_links force row level security[\s\S]*?alter table public\.trip_accounting_people force row level security/i,
  },
  {
    name: 'trip invites only grant direct select to authenticated clients',
    re: /grant select on table public\.trip_invites to authenticated/i,
  },
  {
    name: 'trip backend links only grant direct select to authenticated clients',
    re: /grant select on table public\.trip_backend_links to authenticated/i,
  },
  {
    name: 'trip accounting people are trip member readable',
    re: /create policy trip_accounting_people_select_members[\s\S]*?using\s*\(\s*private\.can_access_trip\(trip_id\)\s*\)/i,
  },
  {
    name: 'trip invite accept marks expired without rolling back status update',
    re: /if v_invite\.expires_at <= now\(\) then[\s\S]*?set status = 'expired'[\s\S]*?status := 'expired'[\s\S]*?return next;/i,
  },
  {
    name: 'trip invite accept keeps higher existing member roles',
    re: /on conflict \(trip_id, user_id\)[\s\S]*?private\.trip_member_role_rank\(trip_members\.role\) >= private\.trip_member_role_rank\(excluded\.role\)[\s\S]*?then trip_members\.role/i,
  },
  {
    name: 'trip sharing security definer RPCs revoke public and anon execute',
    re: /revoke execute on function public\.create_trip_invite\(uuid, text, text, integer\) from public, anon[\s\S]*?revoke execute on function public\.leave_trip\(uuid\) from public, anon/i,
  },
  {
    name: 'trip sharing security definer RPCs grant execute only to authenticated',
    re: /grant execute on function public\.create_trip_invite\(uuid, text, text, integer\) to authenticated[\s\S]*?grant execute on function public\.leave_trip\(uuid\) to authenticated/i,
  },
  {
    name: 'trip invite token hashes are stored instead of plaintext tokens',
    re: /token_hash text not null unique[\s\S]*?v_hash text := encode\(digest\(v_token, 'sha256'\), 'hex'\)/i,
  },
  {
    name: 'shared ledger receipt upsert requires trip edit permission',
    re: /create or replace function public\.upsert_shared_trip_receipt[\s\S]*?if not private\.can_edit_trip\(p_trip_id\) then[\s\S]*?Trip editor role required/i,
  },
  {
    name: 'shared ledger receipt upsert only edits receipts owned by current user',
    re: /if v_existing\.id is not null and v_existing\.owner_id <> v_user then[\s\S]*?Only the original receipt owner can update this receipt/i,
  },
  {
    name: 'shared ledger receipt upsert rejects stale expected versions',
    re: /v_expected_version[\s\S]*?coalesce\(v_existing\.version, 1\) <> v_expected_version[\s\S]*?Receipt version conflict/i,
  },
  {
    name: 'shared ledger receipt upsert increments receipt version on update',
    re: /version\s*=\s*coalesce\(v_existing\.version, 1\) \+ 1/i,
  },
  {
    name: 'shared ledger receipt upsert creates Notion outbox jobs instead of fake sync',
    re: /insert into public\.receipt_sync_jobs[\s\S]*?'notion'[\s\S]*?'upsert'[\s\S]*?'pending'/i,
  },
  {
    name: 'receipt photo storage bucket migration is idempotent',
    re: /insert into storage\.buckets[\s\S]*?on conflict \(id\) do nothing[\s\S]*?drop policy if exists "receipt_photos_upload_own" on storage\.objects/i,
  },
  {
    name: 'browser receipt writes cannot retain private Notion identifiers',
    re: /create or replace function public\.enforce_receipt_private_fields\(\)[\s\S]*?coalesce\(auth\.role\(\), ''\)\s*<>\s*'service_role'[\s\S]*?new\.notion_page_id\s*:=\s*null[\s\S]*?new\.notion_database_id\s*:=\s*null/i,
  },
  {
    name: 'adjacent security definer functions deny anonymous execute',
    re: /revoke execute on function public\.delete_own_user_account\(\) from public, anon[\s\S]*?revoke execute on function public\.trip_member_display_names\(uuid\[\]\) from public, anon/i,
  },
  {
    name: 'shared ledger receipt delete only deletes receipts owned by current user',
    re: /create or replace function public\.delete_shared_trip_receipt[\s\S]*?if v_receipt\.owner_id <> v_user then[\s\S]*?Only the original receipt owner can delete this receipt/i,
  },
  {
    name: 'shared ledger receipt delete creates Notion delete outbox jobs',
    re: /create or replace function public\.delete_shared_trip_receipt[\s\S]*?insert into public\.receipt_sync_jobs[\s\S]*?'notion'[\s\S]*?'delete'[\s\S]*?'pending'/i,
  },
  {
    name: 'shared ledger receipt RPCs revoke public and anon execute',
    re: /revoke execute on function public\.upsert_shared_trip_receipt\(uuid, jsonb, uuid, text, text\) from public, anon[\s\S]*?revoke execute on function public\.delete_shared_trip_receipt\(uuid, uuid, text, text\) from public, anon/i,
  },
  {
    name: 'shared ledger receipt RPCs grant execute only to authenticated',
    re: /grant execute on function public\.upsert_shared_trip_receipt\(uuid, jsonb, uuid, text, text\) to authenticated[\s\S]*?grant execute on function public\.delete_shared_trip_receipt\(uuid, uuid, text, text\) to authenticated/i,
  },
];

const receiptPhotoCompatibilityPatterns = [
  {
    name: 'final receipt photo compatibility migration keeps only the receipt-photos bucket public',
    re: /update storage\.buckets\s+set public = true\s+where id = 'receipt-photos'/i,
  },
  {
    name: 'final receipt photo compatibility migration restores the exact public read policy',
    re: /create policy "receipt_photos_public_read"\s+on storage\.objects for select\s+using\s*\(\s*bucket_id\s*=\s*'receipt-photos'\s*\)/i,
  },
  {
    name: 'final receipt photo compatibility migration removes the interim owner-only read policy',
    re: /drop policy if exists "receipt_photos_read_own" on storage\.objects/i,
  },
  {
    name: 'final receipt photo compatibility migration sets local lock and statement timeouts',
    re: /set local lock_timeout = '5s';[\s\S]*?set local statement_timeout = '30s';/i,
  },
];

const stagedReceiptPhotoPatterns = [
  {
    name: 'staged receipt photo migration makes the bucket private',
    re: /update storage\.buckets[\s\S]*?set public = false[\s\S]*?where id = 'receipt-photos'/i,
  },
  {
    name: 'staged receipt photo migration removes public storage reads',
    re: /drop policy if exists "receipt_photos_public_read" on storage\.objects/i,
  },
  {
    name: 'staged receipt photo migration requires authenticated trip access for storage reads',
    re: /create policy "receipt_photos_read_trip_members"[\s\S]*?on storage\.objects for select to authenticated[\s\S]*?private\.can_access_trip\(r\.trip_id\)[\s\S]*?r\.visibility\s*=\s*'trip'[\s\S]*?r\.owner_id\s*=\s*\(select auth\.uid\(\)\)/i,
  },
];

const staleReceiptSyncLeaseRecoveryPatterns = [
  {
    name: 'stale receipt-sync lease recovery migration is transactional with local timeouts',
    re: /\bbegin;[\s\S]*?set local lock_timeout = '5s';[\s\S]*?set local statement_timeout = '30s';[\s\S]*?commit;\s*$/i,
  },
  {
    name: 'browser claim keeps its signature, SECURITY DEFINER, empty search path, stale processing recovery, due time, attempts cap, and row lock',
    re: /create or replace function public\.claim_receipt_sync_jobs\(\s*p_trip_ids uuid\[\],\s*p_provider text default 'notion',\s*p_worker text default null,\s*p_limit integer default 20\s*\)[\s\S]*?returns setof public\.receipt_sync_jobs\s*language plpgsql\s*security definer\s*set search_path = ''[\s\S]*?where j\.provider = p_provider[\s\S]*?and j\.trip_id = any\(coalesce\(p_trip_ids, array\[\]::uuid\[\]\)\)[\s\S]*?and j\.status in \('pending', 'failed', 'processing'\)[\s\S]*?and j\.next_attempt_at <= clock_timestamp\(\)[\s\S]*?and j\.attempts < 5[\s\S]*?and \(j\.locked_at is null or j\.locked_at < clock_timestamp\(\) - interval '120 seconds'\)[\s\S]*?and private\.can_admin_trip\(j\.trip_id\)[\s\S]*?for update skip locked/i,
  },
  {
    name: 'worker claim keeps its signature, SECURITY DEFINER, empty search path, stale processing recovery, due time, attempts cap, payload joins, and row lock',
    re: /create or replace function public\.claim_receipt_sync_jobs_worker\(\s*p_worker text,\s*p_limit integer default 10\s*\)[\s\S]*?returns jsonb\s*language plpgsql\s*security definer\s*set search_path = ''[\s\S]*?with candidate as materialized \([\s\S]*?where job\.provider = 'notion'[\s\S]*?and job\.status in \('pending', 'failed', 'processing'\)[\s\S]*?and job\.next_attempt_at <= clock_timestamp\(\)[\s\S]*?and job\.attempts < 5[\s\S]*?and \(job\.locked_at is null or job\.locked_at < clock_timestamp\(\) - interval '120 seconds'\)[\s\S]*?and receipt\.visibility = 'trip'[\s\S]*?and link\.status = 'active'[\s\S]*?and link\.sync_mode = 'dual_write'[\s\S]*?for update of job skip locked[\s\S]*?jsonb_build_object\([\s\S]*?'databaseRef', link\.notion_database_ref[\s\S]*?'receipt', jsonb_build_object/i,
  },
  {
    name: 'worker claim owner remains receipt_sync_owner',
    re: /alter function public\.claim_receipt_sync_jobs_worker\(text, integer\)\s*owner to receipt_sync_owner;/i,
  },
  {
    name: 'browser claim revokes default execution before its existing authenticated and service-role grant',
    re: /revoke all on function public\.claim_receipt_sync_jobs\(uuid\[\], text, text, integer\)\s*from public, anon, authenticated, service_role;[\s\S]*?grant execute on function public\.claim_receipt_sync_jobs\(uuid\[\], text, text, integer\)\s*to authenticated, service_role;/i,
  },
  {
    name: 'worker claim revokes browser execution before its existing service-role grant',
    re: /revoke all on function public\.claim_receipt_sync_jobs_worker\(text, integer\)\s*from public, anon, authenticated;[\s\S]*?grant execute on function public\.claim_receipt_sync_jobs_worker\(text, integer\)\s*to service_role;/i,
  },
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function executeGrantRoles(sql, signature) {
  const re = new RegExp(
    `grant\\s+execute\\s+on\\s+function\\s+${escapeRegExp(signature)}\\s+to\\s+([^;]+);`,
    'gi',
  );
  return [...sql.matchAll(re)]
    .flatMap((match) => match[1].split(','))
    .map((role) => role.trim().toLowerCase())
    .sort();
}

const findings = [
  ...requiredPatterns.filter((item) => !item.re.test(activeSql)),
  ...receiptPhotoCompatibilityPatterns.filter(
    (item) => !item.re.test(receiptPhotoCompatibilitySql),
  ),
  ...stagedReceiptPhotoPatterns.filter((item) => !item.re.test(stagedSql)),
  ...staleReceiptSyncLeaseRecoveryPatterns.filter(
    (item) => !item.re.test(staleReceiptSyncLeaseRecoverySql),
  ),
];

const recreatedStaleLeaseFunctions = [
  ...staleReceiptSyncLeaseRecoverySql.matchAll(
    /create\s+or\s+replace\s+function\s+(public\.[a-z_][a-z0-9_]*)\s*\(/gi,
  ),
].map((match) => match[1].toLowerCase()).sort();
if (
  recreatedStaleLeaseFunctions.join(',')
  !== 'public.claim_receipt_sync_jobs,public.claim_receipt_sync_jobs_worker'
) {
  findings.push({
    name: 'stale receipt-sync lease recovery migration replaces only the two claim functions',
  });
}

if (/\b(?:alter\s+table|create\s+policy|drop\s+policy|create\s+trigger|drop\s+trigger)\b/i.test(staleReceiptSyncLeaseRecoverySql)) {
  findings.push({
    name: 'stale receipt-sync lease recovery migration does not change tables, RLS, or triggers',
  });
}

for (const { signature, roles } of [
  {
    signature: 'public.claim_receipt_sync_jobs(uuid[], text, text, integer)',
    roles: ['authenticated', 'service_role'],
  },
  {
    signature: 'public.claim_receipt_sync_jobs_worker(text, integer)',
    roles: ['service_role'],
  },
]) {
  if (executeGrantRoles(staleReceiptSyncLeaseRecoverySql, signature).join(',') !== roles.join(',')) {
    findings.push({
      name: `${signature} execute grant roles are not exact`,
    });
  }
}

if (/\b(?:begin|commit)\s*;/i.test(receiptPhotoCompatibilitySql)) {
  findings.push({
    name: 'final receipt photo compatibility migration relies on the migration runner transaction',
  });
}

if (/drop policy if exists "receipt_photos_(?:upload|delete)_own" on storage\.objects/i.test(receiptPhotoCompatibilitySql)) {
  findings.push({
    name: 'final receipt photo compatibility migration preserves upload and delete policies',
  });
}

const receiptPhotoCompatibilityIndex = files.indexOf(receiptPhotoCompatibilityMigration);
const adminOperationKernelIndex = files.indexOf(adminOperationKernelMigration);
if (
  adminOperationKernelIndex === -1
  || receiptPhotoCompatibilityIndex <= adminOperationKernelIndex
  || files[receiptPhotoCompatibilityIndex + 1] !== adminPasskeyRemovalMigration
) {
  findings.push({
    name: 'final receipt photo compatibility migration is ordered after 20260710187000 and immediately before 20260712123000',
  });
}

const storageBucketMutations = [
  ...receiptPhotoCompatibilitySql.matchAll(
    /\b(?:insert\s+into|update|delete\s+from|alter\s+table)\s+storage\.buckets\b[^;]*;/gi,
  ),
];
if (
  !/^\s*update\s+storage\.buckets\s+set\s+[^;]*?\bpublic\s*=\s*true\b[^;]*?\bwhere\s+id\s*=\s*'receipt-photos'\s*;\s*$/i.test(
    storageBucketMutations.at(-1)?.[0] ?? '',
  )
) {
  findings.push({
    name: 'final receipt photo compatibility storage.buckets mutation leaves receipt-photos public',
  });
}

const storageObjectPolicyActions = [
  ...receiptPhotoCompatibilitySql.matchAll(
    /\b(drop|create|alter)\s+policy(?:\s+if\s+exists)?\s+(?:"([^"]+)"|([^\s]+))\s+on\s+storage\.objects\b/gi,
  ),
];
const finalStorageObjectPolicyAction = storageObjectPolicyActions.at(-1);
if (
  finalStorageObjectPolicyAction?.[1].toLowerCase() !== 'create'
  || (finalStorageObjectPolicyAction?.[2] ?? finalStorageObjectPolicyAction?.[3])
    !== 'receipt_photos_public_read'
) {
  findings.push({
    name: 'final receipt photo compatibility public-read create is the final storage.objects policy action',
  });
}

if (receiptPhotoCompatibilityIndex !== -1) {
  const laterActiveStorageMutationFiles = files.slice(receiptPhotoCompatibilityIndex + 1).filter((file) => {
    const sql = readFileSync(join(repoRoot, file), 'utf8');
    return /\bstorage\.buckets\b/i.test(sql)
      || /\b(?:create|drop|alter)\s+policy\b[\s\S]*?\bon\s+storage\.objects\b/i.test(sql);
  });
  if (laterActiveStorageMutationFiles.length) {
    findings.push({
      name: `later active migrations mutate Storage state: ${laterActiveStorageMutationFiles.join(', ')}`,
    });
  }
}

if (findings.length) {
  console.error('Supabase migration policy scan failed:');
  for (const item of findings) console.error(`- ${item.name}`);
  process.exit(1);
}

console.log('Supabase migration policy scan passed');
