-- Notify Boss when a new Supabase Auth user is created.
--
-- Runtime contract:
-- - This migration is idempotent and safe to apply with the Management API.
-- - The trigger never blocks sign-up; failures are recorded in
--   public.admin_signup_notifications.
-- - The Edge Function URL and shared secret are stored in private.signup_notify_config,
--   not in git. Apply the runtime config with the Management API after this migration:
--     insert into private.signup_notify_config (id, endpoint, shared_secret) values
--       (true, 'https://<project>.supabase.co/functions/v1/notify-new-user', '<random secret>')
--     on conflict (id) do update set endpoint = excluded.endpoint, shared_secret = excluded.shared_secret;
-- - The Edge Function sends email through Resend when RESEND_API_KEY exists.

create extension if not exists pg_net with schema extensions;
create schema if not exists private;

create table if not exists private.signup_notify_config (
  id boolean primary key default true check (id),
  endpoint text not null check (endpoint ~ '^https://'),
  shared_secret text not null check (length(shared_secret) >= 32),
  updated_at timestamptz not null default now()
);

revoke all on schema private from anon, authenticated;
revoke all on table private.signup_notify_config from anon, authenticated;

create table if not exists public.admin_signup_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  provider text not null default 'unknown',
  request_id bigint,
  status text not null default 'queued',
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  notified_at timestamptz,
  constraint admin_signup_notifications_user_unique unique (user_id),
  constraint admin_signup_notifications_status_check check (
    status in (
      'queued',
      'requested',
      'queued_missing_endpoint',
      'trigger_error'
    )
  )
);

alter table public.admin_signup_notifications enable row level security;
alter table public.admin_signup_notifications force row level security;

revoke all on table public.admin_signup_notifications from anon, authenticated;
grant select, insert, update on table public.admin_signup_notifications to service_role;

create or replace function public.notify_admin_on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_endpoint text;
  v_secret text;
  v_provider text := coalesce(nullif(new.raw_app_meta_data ->> 'provider', ''), 'unknown');
  v_payload jsonb;
  v_request_id bigint;
begin
  select endpoint, shared_secret
    into v_endpoint, v_secret
    from private.signup_notify_config
   where id is true;

  insert into public.admin_signup_notifications (user_id, email, provider, status)
  values (new.id, lower(new.email), v_provider, 'queued')
  on conflict (user_id) do update set
    email = excluded.email,
    provider = excluded.provider,
    updated_at = now();

  if v_endpoint is null or v_secret is null then
    update public.admin_signup_notifications
       set status = 'queued_missing_endpoint',
           updated_at = now(),
           error = 'private.signup_notify_config is not configured'
     where user_id = new.id;
    return new;
  end if;

  v_payload := jsonb_build_object(
    'id', new.id,
    'email', new.email,
    'created_at', new.created_at,
    'provider', v_provider,
    'providers', new.raw_app_meta_data -> 'providers',
    'app_metadata', new.raw_app_meta_data,
    'user_metadata', new.raw_user_meta_data
  );

  select net.http_post(
    url := v_endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-signup-notify-secret', v_secret
    ),
    body := v_payload,
    timeout_milliseconds := 5000
  ) into v_request_id;

  update public.admin_signup_notifications
     set request_id = v_request_id,
         status = 'requested',
         error = null,
         updated_at = now()
   where user_id = new.id;

  return new;
exception when others then
  insert into public.admin_signup_notifications (user_id, email, provider, status, error)
  values (new.id, lower(new.email), coalesce(v_provider, 'unknown'), 'trigger_error', sqlerrm)
  on conflict (user_id) do update set
    status = 'trigger_error',
    error = excluded.error,
    updated_at = now();
  return new;
end;
$$;

revoke all on function public.notify_admin_on_auth_user_created() from public, anon, authenticated;
grant execute on function public.notify_admin_on_auth_user_created() to supabase_auth_admin;

drop trigger if exists on_auth_user_created_notify_admin on auth.users;
create trigger on_auth_user_created_notify_admin
after insert on auth.users
for each row execute function public.notify_admin_on_auth_user_created();
