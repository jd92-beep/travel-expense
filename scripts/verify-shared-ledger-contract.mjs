#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const checks = [];
const migrationDir = path.join(root, 'supabase/migrations');
const canonicalMigration = fs.existsSync(migrationDir)
  ? fs.readdirSync(migrationDir).find((name) => name.endsWith('_canonical_receipt_contract.sql'))
  : undefined;

if (canonicalMigration) {
  checks.push({
    file: `supabase/migrations/${canonicalMigration}`,
    expectations: [
      ['versioned upsert RPC exists', /create or replace function public\.upsert_shared_trip_receipt/i],
      ['versioned tombstone RPC exists', /create or replace function public\.delete_receipt_v2/i],
      ['explicit restore RPC exists', /create or replace function public\.restore_receipt_v2/i],
      ['atomic Notion completion RPC exists', /create or replace function public\.finish_receipt_sync_job/i],
      ['RPCs use a fixed empty search path', /security definer\s+set search_path = ''/i],
      ['receipt version conflicts fail closed', /Expected receipt version required[\s\S]*?Receipt version conflict/i],
      ['sync revision advances on mutation', /sync_revision\s*=\s*nextval\('private\.receipt_sync_revision_seq'/i],
      ['private receipts cannot enter Notion upsert queue', /Private receipts cannot be queued for Notion upsert/i],
      ['browser direct receipt DML is revoked', /revoke insert, update, delete on table public\.receipts from authenticated/i],
      ['browser direct sync-job DML is revoked', /revoke insert, update, delete on table public\.receipt_sync_jobs from authenticated/i],
      ['only versioned browser RPCs are granted', /grant execute on function public\.delete_receipt_v2[\s\S]*?grant execute on function public\.restore_receipt_v2/i],
    ],
  });
}

const apps = ['app-react', 'app-compact'].filter((app) =>
  fs.existsSync(path.join(root, app, 'src/lib/receiptTombstones.ts')),
);

for (const app of apps) {
  checks.push(
    {
      file: `${app}/src/lib/supabase.ts`,
      expectations: [
        ['all receipt saves use the versioned RPC', /\.rpc\('upsert_shared_trip_receipt'/i],
        ['all receipt deletes use tombstone RPC v2', /\.rpc\('delete_receipt_v2'/i],
        ['delete supplies expected version', /p_expected_version:\s*expectedVersion/i],
        ['record kind is sent', /record_kind:\s*recordKind/i],
        ['record kind is mapped', /recordKind,\s*\n\s*isSettlement:/i],
        ['split mode is sent', /split_mode:\s*visibility/i],
        ['split mode is mapped', /splitMode:\s*row\.split_mode/i],
        ['sync revision is mapped', /syncRevision:\s*Number\(row\.sync_revision/i],
        ['pull includes deleted rows', /\.in\('trip_id', tripIds\)\.order\('record_date'/i],
        ['pull returns canonical tombstones', /rowToReceiptTombstone[\s\S]*?return \{ trips, receipts, tombstones, settings \}/i],
      ],
      forbidden: [
        ['direct receipt table mutation', /\.from\('receipts'\)\s*\.(?:upsert|update|delete)\s*\(/i],
        ['legacy receipt delete RPC', /\.rpc\('delete_shared_trip_receipt'/i],
      ],
    },
    {
      file: `${app}/src/lib/useSyncEngine.ts`,
      expectations: [
        ['private receipt archives old personal Notion mirror', /receipt\.visibility === 'private'[\s\S]*?archiveReceipt\(current, receipt\)/i],
        ['private receipt never enters browser Notion push branch', /if \(receipt\.visibility === 'private'\)[\s\S]*?else \{\s*synced = await pushReceipt/i],
        ['delete queue preserves receipt version', /version:\s*item\.payload\?\.version/i],
        ['pull merges canonical tombstones', /mergePulledData\(current, receipts, trips, supabaseData\.tombstones\)/i],
      ],
    },
    {
      file: `${app}/src/lib/syncMerge.ts`,
      expectations: [
        ['canonical delete wins during merge', /canonicalTombstoneWins\(state\.receiptTombstones, receipt\)/i],
        ['higher active revision can clear tombstone', /mergeCanonicalReceiptTombstones\(state\.receiptTombstones, pulledReceipts, pulledTombstones\)/i],
        ['cloud sharing role remains authoritative', /remoteTrip\._itineraryNeedsRepair \|\| remoteTrip\.sharing/i],
      ],
    },
  );
}

const failures = [];
for (const group of checks) {
  const filePath = path.join(root, group.file);
  if (!fs.existsSync(filePath)) {
    failures.push(`${group.file}: file is missing`);
    continue;
  }
  const source = fs.readFileSync(filePath, 'utf8');
  for (const [name, pattern] of group.expectations || []) {
    if (!pattern.test(source)) failures.push(`${group.file}: missing ${name}`);
  }
  for (const [name, pattern] of group.forbidden || []) {
    if (pattern.test(source)) failures.push(`${group.file}: forbidden ${name}`);
  }
}

if (apps.includes('app-react') && apps.includes('app-compact')) {
  const reactHelper = fs.readFileSync(path.join(root, 'app-react/src/lib/receiptTombstones.ts'), 'utf8');
  const compactHelper = fs.readFileSync(path.join(root, 'app-compact/src/lib/receiptTombstones.ts'), 'utf8');
  if (reactHelper !== compactHelper) failures.push('React and Compact tombstone helpers diverged');
}

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  summary: 'canonical receipt RPC, tombstone, split, privacy, and cross-client merge contracts are present',
  canonicalMigration: canonicalMigration || 'owned by primary travel-expense repo',
  checkedApps: apps,
}, null, 2));
