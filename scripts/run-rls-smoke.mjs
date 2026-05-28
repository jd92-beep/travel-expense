#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '..');
const sqlPath = resolve(repoRoot, 'supabase/tests/rls_isolation_smoke.sql');
const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');
const psqlBin = process.env.PSQL_BIN || 'psql';
const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '';

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function parsePostgresUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    fail('SUPABASE_DB_URL is not a valid Postgres connection URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    fail('SUPABASE_DB_URL must start with postgres:// or postgresql://.');
  }

  return {
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || '5432',
    PGDATABASE: parsed.pathname.replace(/^\//, ''),
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGSSLMODE: parsed.searchParams.get('sslmode') || 'require',
  };
}

if (!existsSync(sqlPath)) {
  fail(`Missing RLS smoke SQL at ${sqlPath}`);
}

if (checkOnly) {
  console.log('RLS smoke runner check passed');
  process.exit(0);
}

if (!dbUrl) {
  fail([
    'Set SUPABASE_DB_URL to a service-role or owner Postgres connection URL before running live RLS smoke.',
    'The value is read from the environment only and must not be committed.',
  ].join('\n'));
}

const pgEnv = parsePostgresUrl(dbUrl);
if (!pgEnv.PGHOST || !pgEnv.PGDATABASE || !pgEnv.PGUSER || !pgEnv.PGPASSWORD) {
  fail('SUPABASE_DB_URL is missing host, database, user, or password.');
}

const result = spawnSync(
  psqlBin,
  ['--no-psqlrc', '--quiet', '--set', 'ON_ERROR_STOP=1', '--file', sqlPath],
  {
    env: {
      ...process.env,
      ...pgEnv,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

if (result.error) {
  if (result.error.code === 'ENOENT') {
    fail(`Could not find psql. Install PostgreSQL client tools or set PSQL_BIN. Tried: ${psqlBin}`);
  }
  fail(`Failed to run psql: ${result.error.message}`);
}

const output = `${result.stdout || ''}\n${result.stderr || ''}`;
if (result.status !== 0) {
  process.stderr.write(output);
  process.exit(result.status || 1);
}

if (!output.includes('rls_isolation_smoke_passed')) {
  process.stderr.write(output);
  fail('RLS smoke did not print rls_isolation_smoke_passed.');
}

console.log('RLS isolation smoke passed');
