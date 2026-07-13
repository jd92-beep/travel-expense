-- Admin Console Framework: action requests, sync actions, identity resolver, runtime config
-- Idempotent migration for admin console operational features

-- 1. Admin action requests — preview/commit/audit for all mutating admin actions
create table if not exists public.admin_action_requests (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  target_type text not null,
  target_id_hash text not null,
  admin_subject_hash text not null,
  status text not null default 'previewed' check (status in ('previewed','committed','failed','cancelled')),
  idempotency_key text unique,
  preview jsonb not null default '{}',
  payload jsonb not null default '{}',
  result jsonb,
  error text,
  reason text,
  created_at timestamptz not null default now(),
  committed_at timestamptz
);

alter table public.admin_action_requests enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'service_role_admin_action_requests' and tablename = 'admin_action_requests') then
    create policy service_role_admin_action_requests on public.admin_action_requests for all using (true) with check (true);
  end if;
end $$;
grant all on public.admin_action_requests to service_role;

-- 2. Admin console config — store runtime settings in DB instead of hardcoded values
create table if not exists public.admin_console_config (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamptz not null default now()
);

alter table public.admin_console_config enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'service_role_admin_console_config' and tablename = 'admin_console_config') then
    create policy service_role_admin_console_config on public.admin_console_config for all using (true) with check (true);
  end if;
end $$;
grant all on public.admin_console_config to service_role;

-- 3. Identity links — track duplicate account aliases
create table if not exists public.admin_identity_links (
  id uuid primary key default gen_random_uuid(),
  primary_user_id uuid not null references auth.users(id) on delete cascade,
  linked_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  status text not null default 'active' check (status in ('active','revolved','cancelled')),
  admin_subject_hash text not null,
  created_at timestamptz not null default now(),
  unique(primary_user_id, linked_user_id)
);

alter table public.admin_identity_links enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'service_role_admin_identity_links' and tablename = 'admin_identity_links') then
    create policy service_role_admin_identity_links on public.admin_identity_links for all using (true) with check (true);
  end if;
end $$;
grant all on public.admin_identity_links to service_role;

-- 4. Indexes for performance
create index if not exists idx_admin_action_requests_status on public.admin_action_requests(status);
create index if not exists idx_admin_action_requests_target on public.admin_action_requests(target_type, target_id_hash);
create index if not exists idx_admin_action_requests_idempotency on public.admin_action_requests(idempotency_key) where idempotency_key is not null;
create index if not exists idx_admin_identity_links_primary on public.admin_identity_links(primary_user_id);
create index if not exists idx_admin_identity_links_linked on public.admin_identity_links(linked_user_id);
