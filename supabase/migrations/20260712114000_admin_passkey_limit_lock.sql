-- Serialize Boss passkey registration so concurrent requests cannot exceed the
-- maximum of three active credentials.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

grant admin_auth_owner to postgres;
grant usage, create on schema public to admin_auth_owner;

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
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('private.admin_webauthn_credentials')
  );
  select count(*) into v_count
  from private.admin_webauthn_credentials
  where disabled_at is null;
  if v_count <> 0 then
    raise exception 'Bootstrap enrollment is closed' using errcode = '23514';
  end if;
  if length(p_credential_id) < 16 or length(p_public_key) < 16 or p_counter < 0 then
    raise exception 'Invalid credential input' using errcode = '22023';
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

alter function public.admin_auth_register_credential(
  text, text, bigint, text[], text, boolean, text
) owner to admin_auth_owner;
revoke all on function public.admin_auth_register_credential(
  text, text, bigint, text[], text, boolean, text
) from public, anon, authenticated;
grant execute on function public.admin_auth_register_credential(
  text, text, bigint, text[], text, boolean, text
) to service_role;

revoke create on schema public from admin_auth_owner;
revoke admin_auth_owner from postgres;

commit;
