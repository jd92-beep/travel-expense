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
];

const findings = requiredPatterns.filter((item) => !item.re.test(sql));

if (findings.length) {
  console.error('Supabase migration policy scan failed:');
  for (const item of findings) console.error(`- ${item.name}`);
  process.exit(1);
}

console.log('Supabase migration policy scan passed');
