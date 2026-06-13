#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);

const checks = [
  {
    file: 'supabase/migrations/20260612165000_shared_ledger_receipt_rpc.sql',
    expectations: [
      ['upsert RPC exists', /create or replace function public\.upsert_shared_trip_receipt/i],
      ['delete RPC exists', /create or replace function public\.delete_shared_trip_receipt/i],
      ['RPCs run with definer search path', /security definer[\s\S]*?set search_path = public/i],
      ['upsert requires editable trip membership', /if not private\.can_edit_trip\(p_trip_id\) then[\s\S]*?Trip editor role required/i],
      ['upsert protects other members receipts', /Only the original receipt owner can update this receipt/i],
      ['delete protects other members receipts', /Only the original receipt owner can delete this receipt/i],
      ['upsert creates Notion outbox job', /receipt_sync_jobs[\s\S]*?'notion'[\s\S]*?'upsert'[\s\S]*?'pending'/i],
      ['delete creates Notion outbox job', /receipt_sync_jobs[\s\S]*?'notion'[\s\S]*?'delete'[\s\S]*?'pending'/i],
      ['anonymous execute revoked', /revoke execute on function public\.upsert_shared_trip_receipt[\s\S]*?from public, anon[\s\S]*?revoke execute on function public\.delete_shared_trip_receipt[\s\S]*?from public, anon/i],
      ['authenticated execute granted', /grant execute on function public\.upsert_shared_trip_receipt[\s\S]*?to authenticated[\s\S]*?grant execute on function public\.delete_shared_trip_receipt[\s\S]*?to authenticated/i],
    ],
  },
  {
    file: 'supabase/migrations/20260613001000_harden_shared_invites_and_receipt_versions.sql',
    expectations: [
      ['accept invite keeps higher existing member roles', /private\.trip_member_role_rank\(trip_members\.role\) >= private\.trip_member_role_rank\(excluded\.role\)/i],
      ['upsert rejects stale receipt versions', /Receipt version conflict/i],
      ['upsert increments receipt versions', /version\s*=\s*coalesce\(v_existing\.version, 1\) \+ 1/i],
      ['upsert queues Notion outbox with version', /jsonb_build_object\([\s\S]*?'version', v_receipt\.version/i],
    ],
  },
  ...['app-react', 'app-compact'].flatMap((app) => [
    {
      file: `${app}/src/lib/supabase.ts`,
      expectations: [
        ['shared trip detector exists', /function isSharedLedgerTrip\(trip\?: TripProfile\): boolean/i],
        ['ledger sync status maps Notion pending', /notion_sync_status === 'pending'[\s\S]*?return 'notion_pending'/i],
        ['receipt sync status preserves pending queue state', /ledgerSyncStatus === 'notion_pending'[\s\S]*?return 'queued'/i],
        ['shared upsert uses RPC', /\.rpc\('upsert_shared_trip_receipt'/i],
        ['shared upsert sends receipt version', /version:\s*Math\.max\(1, Number\(receipt\.version\) \|\| 1\)/i],
        ['shared delete uses RPC', /\.rpc\('delete_shared_trip_receipt'/i],
        ['shared receipt save ensures profile exists for outbox owner', /await ensureSupabaseProfile\(session, state\);/i],
      ],
    },
    {
      file: `${app}/src/lib/useSyncEngine.ts`,
      expectations: [
        ['sync engine detects shared ledger trip', /function usesSharedLedger\(state: AppState, receipt: Receipt\): boolean/i],
        ['shared receipt upsert skips browser Notion push', /if \(hasNotionSync && !sharedLedger\)/i],
        ['shared receipt delete skips browser Notion archive', /if \(hasNotionSync && !usesSharedLedger\(current, tombstone\)\)/i],
        ['pending Notion status stays queued in UI', /receipt\.ledgerSyncStatus === 'notion_pending'[\s\S]*?syncStatus: nextSyncStatus/i],
      ],
    },
  ]),
];

const failures = [];

for (const group of checks) {
  const filePath = path.join(root, group.file);
  if (!fs.existsSync(filePath)) {
    failures.push(`${group.file}: file is missing`);
    continue;
  }
  const text = fs.readFileSync(filePath, 'utf8');
  for (const [name, pattern] of group.expectations) {
    if (!pattern.test(text)) failures.push(`${group.file}: missing ${name}`);
  }
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  summary: 'shared ledger RPC, frontend routing, and Notion outbox contract are present in React and Compact',
  checkedFiles: checks.map((group) => group.file),
}, null, 2));
