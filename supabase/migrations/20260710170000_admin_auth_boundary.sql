-- Durable state for the passphrase + passkey admin boundary.
-- Browser roles receive no table or RPC access; only signed Edge requests use
-- the service-role wrappers below.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $role$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'admin_auth_owner'
  ) then
    create role admin_auth_owner
      nologin noinherit nosuperuser nocreatedb nocreaterole
      noreplication nobypassrls;
  elsif exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'admin_auth_owner'
      and (
        rolcanlogin or rolsuper or rolinherit or rolcreatedb
        or rolcreaterole or rolreplication or rolbypassrls
      )
  ) then
    raise exception 'admin_auth_owner role attributes are unsafe';
  end if;
end
$role$;

grant usage, create on schema private to admin_auth_owner;
grant usage, create on schema public to admin_auth_owner;
grant admin_auth_owner to postgres;

create table if not exists private.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  csrf_hash text not null,
  actor text not null,
  auth_method text not null,
  passphrase_fingerprint text not null,
  created_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  idle_expires_at timestamptz not null,
  absolute_expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text,
  constraint admin_sessions_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint admin_sessions_csrf_hash_check check (csrf_hash ~ '^[0-9a-f]{64}$'),
  constraint admin_sessions_auth_method_check check (auth_method in ('passphrase+passkey', 'break-glass'))
);

create index if not exists admin_sessions_active_idx
  on private.admin_sessions (created_at desc)
  where revoked_at is null;

create table if not exists private.admin_login_buckets (
  bucket_key text not null,
  bucket_kind text not null,
  window_15_started_at timestamptz not null default clock_timestamp(),
  failures_15m integer not null default 0,
  window_1h_started_at timestamptz not null default clock_timestamp(),
  failures_1h integer not null default 0,
  blocked_until timestamptz,
  last_failure_at timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (bucket_key, bucket_kind),
  constraint admin_login_bucket_key_check check (bucket_key ~ '^[0-9a-f]{64}$' or bucket_key like 'global:%'),
  constraint admin_login_bucket_kind_check check (bucket_kind in ('login', 'reauth')),
  constraint admin_login_failures_check check (failures_15m >= 0 and failures_1h >= 0)
);

create table if not exists private.admin_webauthn_credentials (
  credential_id text primary key,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  device_type text not null,
  backed_up boolean not null default false,
  label text,
  created_at timestamptz not null default clock_timestamp(),
  last_used_at timestamptz,
  disabled_at timestamptz,
  constraint admin_webauthn_counter_check check (counter >= 0)
);

create table if not exists private.admin_webauthn_challenges (
  id uuid primary key,
  kind text not null,
  challenge text not null unique,
  context_hash text not null,
  payload jsonb not null default '{}'::jsonb,
  passphrase_verified_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint admin_webauthn_kind_check check (kind in ('authentication', 'registration', 'reauth')),
  constraint admin_webauthn_context_hash_check check (context_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists admin_webauthn_challenges_expiry_idx
  on private.admin_webauthn_challenges (expires_at);

create table if not exists private.admin_request_nonces (
  nonce_hash text primary key,
  request_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint admin_request_nonce_hash_check check (nonce_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists admin_request_nonces_expiry_idx
  on private.admin_request_nonces (expires_at);

create table if not exists private.admin_step_up_grants (
  id uuid primary key,
  session_hash text not null,
  action text not null,
  target_hash text not null,
  preview_hash text not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint admin_step_up_session_hash_check check (session_hash ~ '^[0-9a-f]{64}$'),
  constraint admin_step_up_action_check check (action ~ '^[a-z0-9_]{1,64}$'),
  constraint admin_step_up_target_hash_check check (target_hash ~ '^[0-9a-f]{64}$'),
  constraint admin_step_up_preview_hash_check check (preview_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists admin_step_up_grants_expiry_idx
  on private.admin_step_up_grants (expires_at);

create table if not exists private.admin_incidents (
  id uuid primary key default gen_random_uuid(),
  severity text not null,
  kind text not null,
  status text not null default 'open',
  title text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  constraint admin_incident_severity_check check (severity in ('P0', 'P1', 'P2', 'P3')),
  constraint admin_incident_status_check check (status in ('open', 'acknowledged', 'resolved'))
);

alter table private.admin_sessions owner to admin_auth_owner;
alter table private.admin_login_buckets owner to admin_auth_owner;
alter table private.admin_webauthn_credentials owner to admin_auth_owner;
alter table private.admin_webauthn_challenges owner to admin_auth_owner;
alter table private.admin_request_nonces owner to admin_auth_owner;
alter table private.admin_step_up_grants owner to admin_auth_owner;
alter table private.admin_incidents owner to admin_auth_owner;

alter table private.admin_sessions enable row level security;
alter table private.admin_login_buckets enable row level security;
alter table private.admin_webauthn_credentials enable row level security;
alter table private.admin_webauthn_challenges enable row level security;
alter table private.admin_request_nonces enable row level security;
alter table private.admin_step_up_grants enable row level security;
alter table private.admin_incidents enable row level security;

create policy admin_auth_owner_sessions on private.admin_sessions
  for all to admin_auth_owner using (true) with check (true);
create policy admin_auth_owner_login_buckets on private.admin_login_buckets
  for all to admin_auth_owner using (true) with check (true);
create policy admin_auth_owner_credentials on private.admin_webauthn_credentials
  for all to admin_auth_owner using (true) with check (true);
create policy admin_auth_owner_challenges on private.admin_webauthn_challenges
  for all to admin_auth_owner using (true) with check (true);
create policy admin_auth_owner_nonces on private.admin_request_nonces
  for all to admin_auth_owner using (true) with check (true);
create policy admin_auth_owner_step_up_grants on private.admin_step_up_grants
  for all to admin_auth_owner using (true) with check (true);
create policy admin_auth_owner_incidents on private.admin_incidents
  for all to admin_auth_owner using (true) with check (true);

create or replace function public.admin_auth_rate_precheck(
  p_bucket_key text,
  p_bucket_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_source private.admin_login_buckets%rowtype;
  v_global private.admin_login_buckets%rowtype;
  v_retry integer := 0;
begin
  if p_bucket_key !~ '^[0-9a-f]{64}$' or p_bucket_kind not in ('login', 'reauth') then
    raise exception 'Invalid rate bucket input';
  end if;

  insert into private.admin_login_buckets (bucket_key, bucket_kind)
  values (p_bucket_key, p_bucket_kind)
  on conflict do nothing;

  insert into private.admin_login_buckets (bucket_key, bucket_kind)
  values ('global:' || p_bucket_kind, p_bucket_kind)
  on conflict do nothing;

  update private.admin_login_buckets
  set window_15_started_at = case when window_15_started_at <= v_now - interval '15 minutes' then v_now else window_15_started_at end,
      failures_15m = case when window_15_started_at <= v_now - interval '15 minutes' then 0 else failures_15m end,
      window_1h_started_at = case when window_1h_started_at <= v_now - interval '1 hour' then v_now else window_1h_started_at end,
      failures_1h = case when window_1h_started_at <= v_now - interval '1 hour' then 0 else failures_1h end,
      blocked_until = case when blocked_until <= v_now then null else blocked_until end,
      updated_at = v_now
  where (bucket_key = p_bucket_key or bucket_key = 'global:' || p_bucket_kind)
    and bucket_kind = p_bucket_kind;

  select * into v_source
  from private.admin_login_buckets
  where bucket_key = p_bucket_key and bucket_kind = p_bucket_kind
  for update;

  select * into v_global
  from private.admin_login_buckets
  where bucket_key = 'global:' || p_bucket_kind and bucket_kind = p_bucket_kind
  for update;

  if v_source.blocked_until is not null then
    v_retry := greatest(v_retry, ceil(extract(epoch from (v_source.blocked_until - v_now)))::integer);
  end if;
  if v_global.blocked_until is not null then
    v_retry := greatest(v_retry, ceil(extract(epoch from (v_global.blocked_until - v_now)))::integer);
  end if;

  return jsonb_build_object(
    'allowed', v_retry <= 0,
    'retryAfterSeconds', greatest(v_retry, 0),
    'sourceFailures15m', v_source.failures_15m,
    'sourceFailures1h', v_source.failures_1h,
    'globalFailures15m', v_global.failures_15m
  );
end;
$$;

create or replace function public.admin_auth_rate_record(
  p_bucket_key text,
  p_bucket_kind text,
  p_succeeded boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_source private.admin_login_buckets%rowtype;
  v_global private.admin_login_buckets%rowtype;
  v_delay integer := 0;
begin
  perform public.admin_auth_rate_precheck(p_bucket_key, p_bucket_kind);

  if p_succeeded then
    update private.admin_login_buckets
    set failures_15m = greatest(failures_15m - 2, 0),
        failures_1h = greatest(failures_1h - 1, 0),
        blocked_until = null,
        last_success_at = v_now,
        updated_at = v_now
    where bucket_key = p_bucket_key and bucket_kind = p_bucket_kind
    returning * into v_source;
  else
    update private.admin_login_buckets
    set failures_15m = failures_15m + 1,
        failures_1h = failures_1h + 1,
        last_failure_at = v_now,
        updated_at = v_now
    where bucket_key = p_bucket_key and bucket_kind = p_bucket_kind
    returning * into v_source;

    if v_source.failures_15m >= 5 then
      v_delay := least(60, (2 ^ least(v_source.failures_15m - 5, 5))::integer * 2);
    end if;
    if v_source.failures_1h >= 20 then
      v_delay := greatest(v_delay, 900);
      insert into private.admin_incidents (severity, kind, title, details)
      values (
        'P1',
        'admin_login_rate_limit',
        'Admin login source temporarily blocked',
        jsonb_build_object('bucketHash', p_bucket_key, 'kind', p_bucket_kind, 'failures1h', v_source.failures_1h)
      );
    end if;
    if v_delay > 0 then
      update private.admin_login_buckets
      set blocked_until = v_now + make_interval(secs => v_delay)
      where bucket_key = p_bucket_key and bucket_kind = p_bucket_kind;
    end if;

    update private.admin_login_buckets
    set failures_15m = failures_15m + 1,
        failures_1h = failures_1h + 1,
        last_failure_at = v_now,
        updated_at = v_now,
        blocked_until = case
          when failures_15m + 1 >= 100 then v_now + interval '15 minutes'
          else blocked_until
        end
    where bucket_key = 'global:' || p_bucket_kind and bucket_kind = p_bucket_kind
    returning * into v_global;

    if v_global.failures_15m = 100 then
      insert into private.admin_incidents (severity, kind, title, details)
      values (
        'P0',
        'admin_login_global_pause',
        'Admin login globally paused',
        jsonb_build_object('kind', p_bucket_kind, 'failures15m', v_global.failures_15m)
      );
    end if;
  end if;

  return jsonb_build_object(
    'recorded', true,
    'retryAfterSeconds', v_delay,
    'sourceFailures15m', v_source.failures_15m,
    'sourceFailures1h', v_source.failures_1h
  );
end;
$$;

create or replace function public.admin_auth_list_credentials()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'credentialId', credential_id,
        'publicKey', public_key,
        'counter', counter,
        'transports', transports,
        'deviceType', device_type,
        'backedUp', backed_up,
        'label', label,
        'createdAt', created_at,
        'lastUsedAt', last_used_at
      ) order by created_at
    ),
    '[]'::jsonb
  )
  from private.admin_webauthn_credentials
  where disabled_at is null;
$$;

create or replace function public.admin_auth_create_challenge(
  p_id uuid,
  p_kind text,
  p_challenge text,
  p_context_hash text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expires timestamptz := clock_timestamp() + interval '5 minutes';
begin
  if p_kind not in ('authentication', 'registration', 'reauth')
    or p_context_hash !~ '^[0-9a-f]{64}$'
    or length(p_challenge) < 16 then
    raise exception 'Invalid challenge input';
  end if;

  delete from private.admin_webauthn_challenges
  where expires_at < clock_timestamp() - interval '24 hours';

  insert into private.admin_webauthn_challenges (
    id, kind, challenge, context_hash, payload, expires_at
  ) values (
    p_id, p_kind, p_challenge, p_context_hash, coalesce(p_payload, '{}'::jsonb), v_expires
  );

  return jsonb_build_object('id', p_id, 'expiresAt', v_expires);
end;
$$;

create or replace function public.admin_auth_consume_challenge(
  p_id uuid,
  p_kind text,
  p_context_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row private.admin_webauthn_challenges%rowtype;
begin
  update private.admin_webauthn_challenges
  set consumed_at = clock_timestamp()
  where id = p_id
    and kind = p_kind
    and context_hash = p_context_hash
    and consumed_at is null
    and expires_at > clock_timestamp()
  returning * into v_row;

  if v_row.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'challenge', v_row.challenge,
    'payload', v_row.payload,
    'passphraseVerifiedAt', v_row.passphrase_verified_at,
    'expiresAt', v_row.expires_at
  );
end;
$$;

create or replace function public.admin_auth_register_credential(
  p_credential_id text,
  p_public_key text,
  p_counter bigint,
  p_transports text[],
  p_device_type text,
  p_backed_up boolean,
  p_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from private.admin_webauthn_credentials
  where disabled_at is null;

  if v_count >= 3 then
    raise exception 'Passkey limit reached';
  end if;
  if length(p_credential_id) < 16 or length(p_public_key) < 16 or p_counter < 0 then
    raise exception 'Invalid credential input';
  end if;

  insert into private.admin_webauthn_credentials (
    credential_id, public_key, counter, transports, device_type, backed_up, label
  ) values (
    p_credential_id,
    p_public_key,
    p_counter,
    coalesce(p_transports, '{}'),
    p_device_type,
    coalesce(p_backed_up, false),
    nullif(btrim(p_label), '')
  );

  return jsonb_build_object('credentialId', p_credential_id, 'registered', true);
end;
$$;

create or replace function public.admin_auth_update_credential(
  p_credential_id text,
  p_counter bigint,
  p_device_type text,
  p_backed_up boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.admin_webauthn_credentials
  set counter = p_counter,
      device_type = p_device_type,
      backed_up = p_backed_up,
      last_used_at = clock_timestamp()
  where credential_id = p_credential_id
    and disabled_at is null
    and p_counter >= counter;
  return found;
end;
$$;

create or replace function public.admin_auth_create_session(
  p_token_hash text,
  p_csrf_hash text,
  p_actor text,
  p_auth_method text,
  p_passphrase_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_id uuid;
  v_idle timestamptz := v_now + interval '10 minutes';
  v_absolute timestamptz := v_now + interval '2 hours';
begin
  if p_token_hash !~ '^[0-9a-f]{64}$'
    or p_csrf_hash !~ '^[0-9a-f]{64}$'
    or p_auth_method not in ('passphrase+passkey', 'break-glass')
    or length(p_passphrase_fingerprint) < 16 then
    raise exception 'Invalid session input';
  end if;

  update private.admin_sessions
  set revoked_at = v_now,
      revoke_reason = 'expired'
  where revoked_at is null
    and (idle_expires_at <= v_now or absolute_expires_at <= v_now);

  insert into private.admin_sessions (
    token_hash, csrf_hash, actor, auth_method, passphrase_fingerprint,
    idle_expires_at, absolute_expires_at
  ) values (
    p_token_hash, p_csrf_hash, p_actor, p_auth_method,
    p_passphrase_fingerprint, v_idle, v_absolute
  )
  returning id into v_id;

  update private.admin_sessions
  set revoked_at = v_now,
      revoke_reason = 'max_sessions'
  where id in (
    select id
    from private.admin_sessions
    where revoked_at is null
    order by created_at desc, id desc
    offset 2
  );

  return jsonb_build_object(
    'sessionId', v_id,
    'actor', p_actor,
    'idleExpiresAt', v_idle,
    'absoluteExpiresAt', v_absolute
  );
end;
$$;

create or replace function public.admin_auth_verify_session(
  p_token_hash text,
  p_passphrase_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row private.admin_sessions%rowtype;
begin
  select * into v_row
  from private.admin_sessions
  where token_hash = p_token_hash
  for update;

  if v_row.id is null or v_row.revoked_at is not null then
    return null;
  end if;

  if v_row.passphrase_fingerprint <> p_passphrase_fingerprint
    or v_row.idle_expires_at <= v_now
    or v_row.absolute_expires_at <= v_now then
    update private.admin_sessions
    set revoked_at = v_now,
        revoke_reason = case
          when v_row.passphrase_fingerprint <> p_passphrase_fingerprint then 'passphrase_rotated'
          else 'expired'
        end
    where id = v_row.id;
    return null;
  end if;

  if v_row.last_seen_at <= v_now - interval '1 minute' then
    update private.admin_sessions
    set last_seen_at = v_now,
        idle_expires_at = least(v_now + interval '10 minutes', absolute_expires_at)
    where id = v_row.id
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'sessionId', v_row.id,
    'actor', v_row.actor,
    'authMethod', v_row.auth_method,
    'csrfHash', v_row.csrf_hash,
    'idleExpiresAt', v_row.idle_expires_at,
    'absoluteExpiresAt', v_row.absolute_expires_at
  );
end;
$$;

create or replace function public.admin_auth_revoke_session(
  p_token_hash text,
  p_reason text default 'logout'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.admin_sessions
  set revoked_at = coalesce(revoked_at, clock_timestamp()),
      revoke_reason = coalesce(revoke_reason, nullif(btrim(p_reason), ''), 'logout')
  where token_hash = p_token_hash;
  return found;
end;
$$;

create or replace function public.admin_auth_revoke_all_sessions(
  p_reason text default 'security_incident'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update private.admin_sessions
  set revoked_at = clock_timestamp(),
      revoke_reason = coalesce(nullif(btrim(p_reason), ''), 'security_incident')
  where revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.admin_auth_create_step_up(
  p_id uuid,
  p_session_hash text,
  p_action text,
  p_target_hash text,
  p_preview_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expires timestamptz := clock_timestamp() + interval '2 minutes';
begin
  if p_session_hash !~ '^[0-9a-f]{64}$'
    or p_action !~ '^[a-z0-9_]{1,64}$'
    or p_target_hash !~ '^[0-9a-f]{64}$'
    or p_preview_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid step-up input';
  end if;

  if not exists (
    select 1
    from private.admin_sessions
    where token_hash = p_session_hash
      and revoked_at is null
      and idle_expires_at > clock_timestamp()
      and absolute_expires_at > clock_timestamp()
  ) then
    raise exception 'Active session required';
  end if;

  delete from private.admin_step_up_grants
  where expires_at < clock_timestamp() - interval '24 hours';

  insert into private.admin_step_up_grants (
    id, session_hash, action, target_hash, preview_hash, expires_at
  ) values (
    p_id, p_session_hash, p_action, p_target_hash, p_preview_hash, v_expires
  );

  return jsonb_build_object('grantId', p_id, 'expiresAt', v_expires);
end;
$$;

create or replace function public.admin_auth_consume_step_up(
  p_id uuid,
  p_session_hash text,
  p_action text,
  p_target_hash text,
  p_preview_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.admin_step_up_grants
  set consumed_at = clock_timestamp()
  where id = p_id
    and session_hash = p_session_hash
    and action = p_action
    and target_hash = p_target_hash
    and preview_hash = p_preview_hash
    and consumed_at is null
    and expires_at > clock_timestamp();
  return found;
end;
$$;

create or replace function public.admin_consume_request_nonce(
  p_nonce_hash text,
  p_request_id uuid,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_nonce_hash !~ '^[0-9a-f]{64}$'
    or p_expires_at <= clock_timestamp()
    or p_expires_at > clock_timestamp() + interval '1 minute' then
    return false;
  end if;

  delete from private.admin_request_nonces
  where expires_at < clock_timestamp() - interval '24 hours';

  insert into private.admin_request_nonces (nonce_hash, request_id, expires_at)
  values (p_nonce_hash, p_request_id, p_expires_at)
  on conflict do nothing;
  return found;
end;
$$;

alter function public.admin_auth_rate_precheck(text, text) owner to admin_auth_owner;
alter function public.admin_auth_rate_record(text, text, boolean) owner to admin_auth_owner;
alter function public.admin_auth_list_credentials() owner to admin_auth_owner;
alter function public.admin_auth_create_challenge(uuid, text, text, text, jsonb) owner to admin_auth_owner;
alter function public.admin_auth_consume_challenge(uuid, text, text) owner to admin_auth_owner;
alter function public.admin_auth_register_credential(text, text, bigint, text[], text, boolean, text) owner to admin_auth_owner;
alter function public.admin_auth_update_credential(text, bigint, text, boolean) owner to admin_auth_owner;
alter function public.admin_auth_create_session(text, text, text, text, text) owner to admin_auth_owner;
alter function public.admin_auth_verify_session(text, text) owner to admin_auth_owner;
alter function public.admin_auth_revoke_session(text, text) owner to admin_auth_owner;
alter function public.admin_auth_revoke_all_sessions(text) owner to admin_auth_owner;
alter function public.admin_auth_create_step_up(uuid, text, text, text, text) owner to admin_auth_owner;
alter function public.admin_auth_consume_step_up(uuid, text, text, text, text) owner to admin_auth_owner;
alter function public.admin_consume_request_nonce(text, uuid, timestamptz) owner to admin_auth_owner;

revoke all privileges on table
  private.admin_sessions,
  private.admin_login_buckets,
  private.admin_webauthn_credentials,
  private.admin_webauthn_challenges,
  private.admin_request_nonces,
  private.admin_step_up_grants,
  private.admin_incidents
from public, anon, authenticated, service_role;

revoke all privileges on function public.admin_auth_rate_precheck(text, text) from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_auth_rate_record(text, text, boolean) from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_auth_list_credentials() from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_auth_create_challenge(uuid, text, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_auth_consume_challenge(uuid, text, text) from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_auth_register_credential(text, text, bigint, text[], text, boolean, text) from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_auth_update_credential(text, bigint, text, boolean) from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_auth_create_session(text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_auth_verify_session(text, text) from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_auth_revoke_session(text, text) from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_auth_revoke_all_sessions(text) from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_auth_create_step_up(uuid, text, text, text, text) from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_auth_consume_step_up(uuid, text, text, text, text) from public, anon, authenticated, service_role;
revoke all privileges on function public.admin_consume_request_nonce(text, uuid, timestamptz) from public, anon, authenticated, service_role;

grant execute on function public.admin_auth_rate_precheck(text, text) to service_role;
grant execute on function public.admin_auth_rate_record(text, text, boolean) to service_role;
grant execute on function public.admin_auth_list_credentials() to service_role;
grant execute on function public.admin_auth_create_challenge(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.admin_auth_consume_challenge(uuid, text, text) to service_role;
grant execute on function public.admin_auth_register_credential(text, text, bigint, text[], text, boolean, text) to service_role;
grant execute on function public.admin_auth_update_credential(text, bigint, text, boolean) to service_role;
grant execute on function public.admin_auth_create_session(text, text, text, text, text) to service_role;
grant execute on function public.admin_auth_verify_session(text, text) to service_role;
grant execute on function public.admin_auth_revoke_session(text, text) to service_role;
grant execute on function public.admin_auth_revoke_all_sessions(text) to service_role;
grant execute on function public.admin_auth_create_step_up(uuid, text, text, text, text) to service_role;
grant execute on function public.admin_auth_consume_step_up(uuid, text, text, text, text) to service_role;
grant execute on function public.admin_consume_request_nonce(text, uuid, timestamptz) to service_role;

revoke create on schema private from admin_auth_owner;
revoke create on schema public from admin_auth_owner;
revoke admin_auth_owner from postgres;

commit;
