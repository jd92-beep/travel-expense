import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'supabase', 'migrations');
const migrationName = fs.readdirSync(migrationsDir)
  .filter((name) => name.endsWith('_admin_console_emergency_containment.sql'))
  .sort()
  .at(-1);

if (!migrationName) {
  console.error('Admin console containment migration is missing');
  process.exit(1);
}

const sql = fs.readFileSync(path.join(migrationsDir, migrationName), 'utf8').toLowerCase();
const normalizedSql = sql.replace(/\s+/g, ' ');
const required = [
  "set local lock_timeout = '5s'",
  "set local statement_timeout = '30s'",
  'drop policy if exists service_role_admin_action_requests on public.admin_action_requests',
  'drop policy if exists service_role_admin_console_config on public.admin_console_config',
  'drop policy if exists service_role_admin_identity_links on public.admin_identity_links',
  'create policy service_role_admin_action_requests on public.admin_action_requests for all to service_role',
  'create policy service_role_admin_console_config on public.admin_console_config for all to service_role',
  'create policy service_role_admin_identity_links on public.admin_identity_links for all to service_role',
  'revoke all on table public.admin_action_requests from public, anon, authenticated',
  'revoke all on table public.admin_console_config from public, anon, authenticated',
  'revoke all on table public.admin_identity_links from public, anon, authenticated',
  'revoke execute on function public.admin_kanban_rls_state() from public, anon, authenticated',
  "set search_path = ''",
];

const missing = required.filter((needle) => !normalizedSql.includes(needle));
const hasPermissivePolicy = /create\s+policy\s+\S+\s+on\s+public\.admin_(?:action_requests|console_config|identity_links)\s+for\s+all(?!\s+to\s+service_role)/.test(normalizedSql);

if (missing.length || hasPermissivePolicy) {
  if (missing.length) console.error(`Missing containment clauses:\n- ${missing.join('\n- ')}`);
  if (hasPermissivePolicy) console.error('Found an admin FOR ALL policy without TO service_role');
  process.exit(1);
}

console.log(`Admin console containment verified: ${migrationName}`);
