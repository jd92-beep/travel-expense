-- Register backup Boss passkeys with an atomic credential-limit check and audit event.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

grant admin_auth_owner to postgres;
grant admin_read_owner to postgres;
grant usage, create on schema public to admin_auth_owner;
grant usage, create on schema public to admin_read_owner;

create or replace function public.admin_auth_register_backup_credential(
  p_credential_id text,
  p_public_key text,
  p_counter bigint,
  p_transports text[],
  p_device_type text,
  p_backed_up boolean,
  p_label text,
  p_actor text,
  p_session_hash text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_created_at timestamptz;
  v_actor_hash text;
  v_target_hash text;
begin
  if length(p_credential_id) < 16 or length(p_public_key) < 16 or p_counter < 0
    or p_actor !~ '^[A-Za-z0-9._-]{1,128}$'
    or p_session_hash !~ '^[0-9a-f]{64}$'
    or p_request_id is null then
    raise exception 'Invalid backup credential input' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('private.admin_webauthn_credentials')
  );
  select count(*) into v_count
  from private.admin_webauthn_credentials
  where disabled_at is null;

  if v_count < 1 then
    raise exception 'Bootstrap passkey required' using errcode = '22023';
  end if;
  if v_count >= 3 then
    raise exception 'Passkey limit reached' using errcode = '23514';
  end if;

  insert into private.admin_webauthn_credentials (
    credential_id, public_key, counter, transports, device_type, backed_up, label
  ) values (
    p_credential_id, p_public_key, p_counter, coalesce(p_transports, '{}'),
    p_device_type, p_backed_up, nullif(left(coalesce(p_label, ''), 128), '')
  )
  returning created_at into v_created_at;

  v_actor_hash := encode(extensions.digest(p_actor, 'sha256'), 'hex');
  v_target_hash := encode(extensions.digest(p_credential_id, 'sha256'), 'hex');
  perform private.append_admin_audit_v2(
    v_actor_hash,
    p_session_hash,
    'R2',
    'admin_passkey_added',
    'admin_passkey',
    v_target_hash,
    null,
    jsonb_build_object('activePasskeys', v_count),
    jsonb_build_object('activePasskeys', v_count + 1),
    jsonb_build_object('registered', true, 'backedUp', p_backed_up),
    null,
    p_request_id,
    null,
    null
  );

  return jsonb_build_object(
    'id', left(v_target_hash, 12),
    'label', coalesce(nullif(left(coalesce(p_label, ''), 128), ''), 'Boss passkey'),
    'deviceType', p_device_type,
    'backedUp', p_backed_up,
    'createdAt', v_created_at,
    'lastUsedAt', null,
    'count', v_count + 1
  );
end;
$$;

create or replace function public.admin_read_runtime_contract()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'schemaVersion', '20260712115000',
    'operationContractVersion', 'admin-operation-v1',
    'auditContractVersion', 'admin-audit-v2',
    'itineraryContractVersion', 'versioned-itinerary-v1',
    'receiptContractVersion', 'canonical-receipt-v1',
    'passkeyContractVersion', 'admin-passkeys-v1'
  );
$$;

alter function public.admin_auth_register_backup_credential(
  text, text, bigint, text[], text, boolean, text, text, text, uuid
) owner to admin_auth_owner;
alter function public.admin_read_runtime_contract() owner to admin_read_owner;

revoke all on function public.admin_auth_register_backup_credential(
  text, text, bigint, text[], text, boolean, text, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.admin_auth_register_backup_credential(
  text, text, bigint, text[], text, boolean, text, text, text, uuid
) to service_role;

revoke all on function public.admin_read_runtime_contract()
  from public, anon, authenticated;
grant execute on function public.admin_read_runtime_contract() to service_role;

revoke create on schema public from admin_auth_owner;
revoke create on schema public from admin_read_owner;
revoke admin_auth_owner from postgres;
revoke admin_read_owner from postgres;

commit;
