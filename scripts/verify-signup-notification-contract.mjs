import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..');
const migration = readFileSync(
  join(repoRoot, 'supabase/migrations/20260614184500_admin_signup_notifications.sql'),
  'utf8',
);
const edgeFunction = readFileSync(
  join(repoRoot, 'supabase/functions/notify-new-user/index.ts'),
  'utf8',
);

const checks = [
  {
    name: 'Auth users trigger runs after insert',
    ok: /create trigger on_auth_user_created_notify_admin[\s\S]*?after insert on auth\.users/i.test(migration),
  },
  {
    name: 'Trigger uses pg_net HTTP post',
    ok: /create extension if not exists pg_net[\s\S]*?net\.http_post/i.test(migration),
  },
  {
    name: 'Trigger reads endpoint and secret from private config storage',
    ok: /create table if not exists private\.signup_notify_config/i.test(migration)
      && /select endpoint, shared_secret[\s\S]*?from private\.signup_notify_config/i.test(migration)
      && /revoke all on table private\.signup_notify_config from anon, authenticated/i.test(migration),
  },
  {
    name: 'Notification audit table is not readable by app users',
    ok: /revoke all on table public\.admin_signup_notifications from anon, authenticated/i.test(migration)
      && /force row level security/i.test(migration),
  },
  {
    name: 'Trigger is non-blocking for sign-up failures',
    ok: /exception when others[\s\S]*?return new;/i.test(migration),
  },
  {
    name: 'Edge Function uses custom shared-secret auth',
    ok: /verify_jwt: false/.test(edgeFunction)
      && /SIGNUP_NOTIFY_SECRET/.test(edgeFunction)
      && /x-signup-notify-secret/.test(edgeFunction)
      && /return json\(401/.test(edgeFunction),
  },
  {
    name: 'Edge Function sends through Resend only when secret exists',
    ok: /RESEND_API_KEY/.test(edgeFunction)
      && /https:\/\/api\.resend\.com\/emails/.test(edgeFunction)
      && /email_provider_missing/.test(edgeFunction),
  },
  {
    name: 'No committed Resend API key literal',
    ok: !/re_[A-Za-z0-9_-]{20,}/.test(`${migration}\n${edgeFunction}`),
  },
  {
    name: 'No committed signup shared secret literal',
    ok: !/SIGNUP_NOTIFY_SECRET\s*=\s*['"][^'"]+['"]/.test(`${migration}\n${edgeFunction}`),
  },
];

const failed = checks.filter((check) => !check.ok);
if (failed.length) {
  console.error('Signup notification contract failed:');
  for (const check of failed) console.error(`- ${check.name}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  checks: checks.map((check) => check.name),
}, null, 2));
