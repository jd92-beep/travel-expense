-- Trip-scoped sharing and dual-backend coordination.
--
-- This migration adds the collaboration primitives needed by the React and
-- Compact apps without weakening the existing owner-scoped receipt privacy.

create extension if not exists pgcrypto;

create table if not exists public.trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  email_normalized text not null check (email_normalized = lower(btrim(email_normalized)) and position('@' in email_normalized) > 1),
  role text not null default 'editor' check (role in ('editor', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id) on delete cascade,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists trip_invites_pending_email_idx
  on public.trip_invites(trip_id, email_normalized)
  where status = 'pending';

create index if not exists trip_invites_trip_id_idx on public.trip_invites(trip_id);
create index if not exists trip_invites_email_status_idx on public.trip_invites(email_normalized, status);
create index if not exists trip_invites_due_idx on public.trip_invites(status, expires_at);

comment on table public.trip_invites is
  'Pending per-trip email invitations. Only token hashes are stored; plaintext invite tokens are returned once by create_trip_invite().';

create table if not exists public.trip_backend_links (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  notion_database_ref text not null,
  notion_owner_user_id uuid not null references auth.users(id) on delete cascade,
  credential_ref text not null,
  sync_mode text not null default 'dual_write' check (sync_mode in ('dual_write')),
  status text not null default 'active' check (status in ('active', 'pending', 'error', 'disabled')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_health_at timestamptz,
  last_error text
);

comment on table public.trip_backend_links is
  'Per-trip Notion backend binding used by server-side dual-write flows. Values are safe references, not raw Notion tokens.';

create table if not exists public.trip_accounting_people (
  trip_id uuid not null references public.trips(id) on delete cascade,
  person_id text not null check (btrim(person_id) <> ''),
  name text not null check (btrim(name) <> ''),
  emoji text,
  color text,
  share_ratio numeric not null default 1 check (share_ratio >= 0),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (trip_id, person_id)
);

comment on table public.trip_accounting_people is
  'Trip-scoped accounting participants and split ratios. These are separate from authenticated trip members.';

alter table public.trip_invites enable row level security;
alter table public.trip_invites force row level security;
alter table public.trip_backend_links enable row level security;
alter table public.trip_backend_links force row level security;
alter table public.trip_accounting_people enable row level security;
alter table public.trip_accounting_people force row level security;

grant select on table public.trip_invites to authenticated;
grant select on table public.trip_backend_links to authenticated;
grant select, insert, update, delete on table public.trip_accounting_people to authenticated;

drop policy if exists trip_invites_select_visible on public.trip_invites;
create policy trip_invites_select_visible
  on public.trip_invites for select
  to authenticated
  using (
    private.can_admin_trip(trip_id)
    or (
      status = 'pending'
      and email_normalized = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
    )
  );

drop policy if exists trip_invites_insert_admins on public.trip_invites;
create policy trip_invites_insert_admins
  on public.trip_invites for insert
  to authenticated
  with check (private.can_admin_trip(trip_id));

drop policy if exists trip_invites_update_admins on public.trip_invites;
create policy trip_invites_update_admins
  on public.trip_invites for update
  to authenticated
  using (
    private.can_admin_trip(trip_id)
    or (
      status = 'pending'
      and email_normalized = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
    )
  )
  with check (
    private.can_admin_trip(trip_id)
    or (
      status in ('accepted', 'expired')
      and accepted_by = (select auth.uid())
      and email_normalized = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
    )
  );

drop policy if exists trip_invites_delete_admins on public.trip_invites;
create policy trip_invites_delete_admins
  on public.trip_invites for delete
  to authenticated
  using (private.can_admin_trip(trip_id));

drop policy if exists trip_backend_links_select_admins on public.trip_backend_links;
create policy trip_backend_links_select_admins
  on public.trip_backend_links for select
  to authenticated
  using (private.can_admin_trip(trip_id));

drop policy if exists trip_backend_links_insert_admins on public.trip_backend_links;
create policy trip_backend_links_insert_admins
  on public.trip_backend_links for insert
  to authenticated
  with check (private.can_admin_trip(trip_id) and created_by = (select auth.uid()));

drop policy if exists trip_backend_links_update_admins on public.trip_backend_links;
create policy trip_backend_links_update_admins
  on public.trip_backend_links for update
  to authenticated
  using (private.can_admin_trip(trip_id))
  with check (private.can_admin_trip(trip_id));

drop policy if exists trip_backend_links_delete_admins on public.trip_backend_links;
create policy trip_backend_links_delete_admins
  on public.trip_backend_links for delete
  to authenticated
  using (private.can_admin_trip(trip_id));

drop policy if exists trip_accounting_people_select_members on public.trip_accounting_people;
create policy trip_accounting_people_select_members
  on public.trip_accounting_people for select
  to authenticated
  using (private.can_access_trip(trip_id));

drop policy if exists trip_accounting_people_insert_admins on public.trip_accounting_people;
create policy trip_accounting_people_insert_admins
  on public.trip_accounting_people for insert
  to authenticated
  with check (private.can_admin_trip(trip_id));

drop policy if exists trip_accounting_people_update_admins on public.trip_accounting_people;
create policy trip_accounting_people_update_admins
  on public.trip_accounting_people for update
  to authenticated
  using (private.can_admin_trip(trip_id))
  with check (private.can_admin_trip(trip_id));

drop policy if exists trip_accounting_people_delete_admins on public.trip_accounting_people;
create policy trip_accounting_people_delete_admins
  on public.trip_accounting_people for delete
  to authenticated
  using (private.can_admin_trip(trip_id));

create or replace function public.create_trip_invite(
  p_trip_id uuid,
  p_email text,
  p_role text default 'editor',
  p_expires_days integer default 14
)
returns table (
  invite_id uuid,
  token text,
  email_normalized text,
  role text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_role text := coalesce(nullif(btrim(p_role), ''), 'editor');
  v_token text := encode(gen_random_bytes(32), 'hex');
  v_hash text := encode(digest(v_token, 'sha256'), 'hex');
  v_expires timestamptz := now() + make_interval(days => greatest(1, least(coalesce(p_expires_days, 14), 30)));
  v_existing uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if not private.can_admin_trip(p_trip_id) then
    raise exception 'Trip admin role required';
  end if;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Invalid invite email';
  end if;
  if v_email = lower(btrim(coalesce(auth.jwt() ->> 'email', ''))) then
    raise exception 'Cannot invite your own email';
  end if;
  if v_role not in ('editor', 'viewer') then
    raise exception 'Invalid invite role';
  end if;

  update public.trip_invites ti
  set token_hash = v_hash,
      role = v_role,
      status = 'pending',
      invited_by = (select auth.uid()),
      accepted_by = null,
      expires_at = v_expires,
      updated_at = now()
  where ti.trip_id = p_trip_id
    and ti.email_normalized = v_email
    and ti.status = 'pending'
  returning ti.id into v_existing;

  if v_existing is null then
    insert into public.trip_invites (trip_id, email_normalized, role, token_hash, invited_by, expires_at)
    values (p_trip_id, v_email, v_role, v_hash, (select auth.uid()), v_expires)
    returning id into v_existing;
  end if;

  invite_id := v_existing;
  token := v_token;
  email_normalized := v_email;
  role := v_role;
  expires_at := v_expires;
  return next;
end;
$$;

create or replace function public.accept_trip_invite(p_token text)
returns table (
  trip_id uuid,
  role text,
  status text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text := encode(digest(btrim(coalesce(p_token, '')), 'sha256'), 'hex');
  v_invite public.trip_invites%rowtype;
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if v_email = '' then
    raise exception 'Authenticated email required';
  end if;

  select *
  into v_invite
  from public.trip_invites
  where token_hash = v_hash
  for update;

  if v_invite.id is null then
    raise exception 'Invite not found';
  end if;
  if v_invite.status <> 'pending' then
    raise exception 'Invite is not pending';
  end if;
  if v_invite.expires_at <= now() then
    update public.trip_invites
    set status = 'expired', updated_at = now()
    where id = v_invite.id;
    trip_id := v_invite.trip_id;
    role := v_invite.role;
    status := 'expired';
    return next;
  end if;
  if v_invite.email_normalized <> v_email then
    raise exception 'Invite email does not match signed-in user';
  end if;

  insert into public.trip_members (trip_id, user_id, role, status)
  values (v_invite.trip_id, (select auth.uid()), v_invite.role, 'active')
  on conflict (trip_id, user_id)
  do update set role = excluded.role, status = 'active', updated_at = now();

  update public.trip_invites
  set status = 'accepted', accepted_by = (select auth.uid()), updated_at = now()
  where id = v_invite.id;

  trip_id := v_invite.trip_id;
  role := v_invite.role;
  status := 'accepted';
  return next;
end;
$$;

create or replace function public.revoke_trip_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
begin
  select trip_id into v_trip_id from public.trip_invites where id = p_invite_id;
  if v_trip_id is null then
    raise exception 'Invite not found';
  end if;
  if not private.can_admin_trip(v_trip_id) then
    raise exception 'Trip admin role required';
  end if;
  update public.trip_invites
  set status = 'revoked', updated_at = now()
  where id = p_invite_id and status = 'pending';
end;
$$;

create or replace function public.update_trip_member_role(
  p_trip_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_role text := coalesce(nullif(btrim(p_role), ''), 'viewer');
begin
  if not private.can_admin_trip(p_trip_id) then
    raise exception 'Trip admin role required';
  end if;
  if v_role not in ('admin', 'editor', 'viewer') then
    raise exception 'Invalid member role';
  end if;
  select owner_id into v_owner from public.trips where id = p_trip_id;
  if p_user_id = v_owner then
    raise exception 'Cannot change trip owner role';
  end if;
  update public.trip_members
  set role = v_role, status = 'active', updated_at = now()
  where trip_id = p_trip_id and user_id = p_user_id;
end;
$$;

create or replace function public.remove_trip_member(
  p_trip_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if not private.can_admin_trip(p_trip_id) then
    raise exception 'Trip admin role required';
  end if;
  select owner_id into v_owner from public.trips where id = p_trip_id;
  if p_user_id = v_owner then
    raise exception 'Cannot remove trip owner';
  end if;
  update public.trip_members
  set status = 'removed', updated_at = now()
  where trip_id = p_trip_id and user_id = p_user_id;
end;
$$;

create or replace function public.leave_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.trips where id = p_trip_id;
  if v_owner = (select auth.uid()) then
    raise exception 'Trip owner must transfer ownership before leaving';
  end if;
  update public.trip_members
  set status = 'removed', updated_at = now()
  where trip_id = p_trip_id and user_id = (select auth.uid());
end;
$$;

revoke execute on function public.create_trip_invite(uuid, text, text, integer) from public, anon;
revoke execute on function public.accept_trip_invite(text) from public, anon;
revoke execute on function public.revoke_trip_invite(uuid) from public, anon;
revoke execute on function public.update_trip_member_role(uuid, uuid, text) from public, anon;
revoke execute on function public.remove_trip_member(uuid, uuid) from public, anon;
revoke execute on function public.leave_trip(uuid) from public, anon;
grant execute on function public.create_trip_invite(uuid, text, text, integer) to authenticated;
grant execute on function public.accept_trip_invite(text) to authenticated;
grant execute on function public.revoke_trip_invite(uuid) to authenticated;
grant execute on function public.update_trip_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.remove_trip_member(uuid, uuid) to authenticated;
grant execute on function public.leave_trip(uuid) to authenticated;;
