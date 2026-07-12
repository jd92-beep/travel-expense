-- Replace create-then-revoke privilege elevation with one atomic session swap.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

grant admin_auth_owner to postgres;
grant usage, create on schema public to admin_auth_owner;

create or replace function public.admin_auth_rotate_session(
  p_current_token_hash text,
  p_next_token_hash text,
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
  v_current private.admin_sessions%rowtype;
  v_id uuid;
  v_idle timestamptz;
begin
  if p_current_token_hash !~ '^[0-9a-f]{64}$'
    or p_next_token_hash !~ '^[0-9a-f]{64}$'
    or p_next_token_hash = p_current_token_hash
    or p_csrf_hash !~ '^[0-9a-f]{64}$'
    or p_auth_method <> 'passphrase+passkey'
    or length(p_passphrase_fingerprint) < 16
  then
    raise exception 'Invalid session rotation input' using errcode = '22023';
  end if;

  select * into v_current
  from private.admin_sessions
  where token_hash = p_current_token_hash
  for update;
  if v_current.id is null
    or v_current.revoked_at is not null
    or v_current.idle_expires_at <= v_now
    or v_current.absolute_expires_at <= v_now
    or v_current.actor <> p_actor
    or v_current.auth_method <> p_auth_method
    or v_current.passphrase_fingerprint <> p_passphrase_fingerprint
  then
    raise exception 'Active admin session required' using errcode = '28000';
  end if;

  v_idle := least(v_now + interval '10 minutes', v_current.absolute_expires_at);
  update private.admin_sessions
  set revoked_at = v_now,
      revoke_reason = 'privilege_elevation'
  where id = v_current.id;

  insert into private.admin_sessions (
    token_hash, csrf_hash, actor, auth_method, passphrase_fingerprint,
    idle_expires_at, absolute_expires_at
  ) values (
    p_next_token_hash, p_csrf_hash, p_actor, p_auth_method,
    p_passphrase_fingerprint, v_idle, v_current.absolute_expires_at
  ) returning id into v_id;

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
    'absoluteExpiresAt', v_current.absolute_expires_at
  );
end;
$$;

alter function public.admin_auth_rotate_session(text, text, text, text, text, text)
  owner to admin_auth_owner;
revoke all on function public.admin_auth_rotate_session(text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_auth_rotate_session(text, text, text, text, text, text)
  to service_role;

revoke create on schema public from admin_auth_owner;
revoke admin_auth_owner from postgres;

commit;
