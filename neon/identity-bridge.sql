-- The trusted account-linking endpoint must verify both providers' sessions
-- and require a verified Neon email before calling the linker.
begin;

create role travel_account_linker nologin noinherit;
grant usage on schema migration_auth to travel_account_linker;
grant create on schema migration_auth to migration_app_owner;

create table migration_auth.neon_user_links (
  neon_id uuid primary key,
  ledger_id uuid not null unique references migration_auth.users(id) on delete cascade,
  linked_at timestamptz not null default now()
);
alter table migration_auth.neon_user_links owner to migration_app_owner;
alter table migration_auth.neon_user_links enable row level security;
alter table migration_auth.neon_user_links force row level security;
revoke all on migration_auth.neon_user_links from public, anon, authenticated, service_role, travel_account_linker;

create function migration_auth.link_neon_account(
  p_ledger_id uuid, p_neon_id uuid, p_verified_email text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_link uuid;
begin
  if p_ledger_id is null or p_neon_id is null or nullif(btrim(p_verified_email), '') is null
     or not exists (
       select 1
       from migration_auth.users u
       where u.id = p_ledger_id
         and lower(btrim(u.email)) = lower(btrim(p_verified_email))
         and u.email_confirmed_at is not null
         and u.deleted_at is null
         and (u.banned_until is null or u.banned_until <= now())
     ) then
    raise exception 'Account verification required' using errcode = '42501';
  end if;

  insert into migration_auth.neon_user_links (neon_id, ledger_id)
    values (p_neon_id, p_ledger_id) on conflict do nothing;
  select ledger_id into v_link
    from migration_auth.neon_user_links where neon_id = p_neon_id;
  if v_link is distinct from p_ledger_id then
    raise exception 'Account is already linked' using errcode = '23505';
  end if;
  return v_link;
end
$$;
alter function migration_auth.link_neon_account(uuid, uuid, text) owner to migration_app_owner;
revoke all on function migration_auth.link_neon_account(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function migration_auth.link_neon_account(uuid, uuid, text) to travel_account_linker;

-- The caller supplies the subject from a verified Neon JWT. The resolver never
-- uses a submitted email or rewrites a trip, receipt, or Storage owner ID.
create function migration_auth.resolve_neon_account(p_neon_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select l.ledger_id
    from migration_auth.neon_user_links l
    join migration_auth.users u on u.id = l.ledger_id
    where l.neon_id = p_neon_id
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
$$;
alter function migration_auth.resolve_neon_account(uuid) owner to migration_app_owner;
revoke all on function migration_auth.resolve_neon_account(uuid) from public, anon, authenticated, service_role;
grant execute on function migration_auth.resolve_neon_account(uuid) to travel_account_linker;

revoke create on schema migration_auth from migration_app_owner;
commit;
