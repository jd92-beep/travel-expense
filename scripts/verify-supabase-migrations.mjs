import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..');
const files = [
  'supabase/migrations/20260526071500_enforce_user_isolation_rls.sql',
  'supabase/migrations/20260526075811_revoke_anon_private_table_grants.sql',
  'supabase/migrations/20260526093000_scope_receipt_owner_updates.sql',
  'supabase/migrations/20260526094500_keep_notion_scope_private.sql',
  'supabase/migrations/20260526101000_tighten_shared_private_rows.sql',
  'supabase/migrations/20260612153000_trip_sharing_dual_backend.sql',
  'supabase/migrations/20260612165000_shared_ledger_receipt_rpc.sql',
  'supabase/migrations/20260613000000_receipt_photo_storage.sql',
  'supabase/migrations/20260613001000_harden_shared_invites_and_receipt_versions.sql',
  'supabase/migrations/20260710160000_harden_remaining_security_definers.sql',
  'supabase/migrations/20260710161000_private_receipt_photo_storage.sql',
];

const sql = files
  .map((file) => readFileSync(join(repoRoot, file), 'utf8'))
  .join('\n\n');

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
    name: 'receipt photo storage bucket is made private',
    re: /update storage\.buckets[\s\S]*?set public = false[\s\S]*?where id = 'receipt-photos'/i,
  },
  {
    name: 'receipt photo public storage reads are removed',
    re: /drop policy if exists "receipt_photos_public_read" on storage\.objects/i,
  },
  {
    name: 'receipt photo storage reads require authenticated trip access',
    re: /create policy "receipt_photos_read_trip_members"[\s\S]*?on storage\.objects for select to authenticated[\s\S]*?private\.can_access_trip\(r\.trip_id\)/i,
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

const findings = requiredPatterns.filter((item) => !item.re.test(sql));

if (findings.length) {
  console.error('Supabase migration policy scan failed:');
  for (const item of findings) console.error(`- ${item.name}`);
  process.exit(1);
}

console.log('Supabase migration policy scan passed');
