-- Admin KanBan telemetry and audit support.
-- This migration is intentionally idempotent and contains no secrets.

create table if not exists public.app_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id_hash text not null,
  app_surface text not null default 'react'
    check (app_surface in ('react', 'compact', 'legacy', 'worker')),
  event_name text not null check (btrim(event_name) <> ''),
  tab_name text,
  trip_id uuid references public.trips(id) on delete set null,
  receipt_id uuid references public.receipts(id) on delete set null,
  source_id text,
  provider text,
  model text,
  outcome text check (outcome is null or outcome in ('start', 'success', 'error', 'cancelled')),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  app_build text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table if not exists public.sync_attempt_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete set null,
  receipt_id uuid references public.receipts(id) on delete set null,
  provider text not null check (provider in ('supabase', 'notion')),
  operation text not null check (btrim(operation) <> ''),
  status text not null check (status in ('started', 'succeeded', 'failed', 'cancelled')),
  attempt integer not null default 1 check (attempt >= 1),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  error_code text,
  source_id text,
  correlation_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.data_quality_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'admin-kanban',
  status text not null default 'completed'
    check (status in ('started', 'completed', 'failed')),
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.data_quality_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.data_quality_runs(id) on delete cascade,
  severity text not null check (severity in ('info', 'warning', 'danger')),
  finding_type text not null,
  entity_type text not null,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_subject_hash text not null,
  action text not null,
  target_type text not null,
  target_id_hash text,
  request_id text,
  preview_counts jsonb,
  result jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_usage_events_user_created_idx
  on public.app_usage_events(user_id, created_at desc);
create index if not exists app_usage_events_surface_created_idx
  on public.app_usage_events(app_surface, created_at desc);
create index if not exists sync_attempt_events_user_created_idx
  on public.sync_attempt_events(user_id, created_at desc);
create index if not exists sync_attempt_events_provider_status_idx
  on public.sync_attempt_events(provider, status, created_at desc);
create index if not exists data_quality_findings_run_id_idx
  on public.data_quality_findings(run_id);
create index if not exists admin_audit_events_created_idx
  on public.admin_audit_events(created_at desc);

alter table public.app_usage_events enable row level security;
alter table public.app_usage_events force row level security;
alter table public.sync_attempt_events enable row level security;
alter table public.sync_attempt_events force row level security;
alter table public.data_quality_runs enable row level security;
alter table public.data_quality_runs force row level security;
alter table public.data_quality_findings enable row level security;
alter table public.data_quality_findings force row level security;
alter table public.admin_audit_events enable row level security;
alter table public.admin_audit_events force row level security;

drop policy if exists app_usage_events_insert_own on public.app_usage_events;
create policy app_usage_events_insert_own on public.app_usage_events
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists app_usage_events_select_own on public.app_usage_events;
create policy app_usage_events_select_own on public.app_usage_events
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists sync_attempt_events_insert_own on public.sync_attempt_events;
create policy sync_attempt_events_insert_own on public.sync_attempt_events
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists sync_attempt_events_select_own on public.sync_attempt_events;
create policy sync_attempt_events_select_own on public.sync_attempt_events
  for select to authenticated
  using (user_id = auth.uid());

revoke all on table public.data_quality_runs from anon, authenticated;
revoke all on table public.data_quality_findings from anon, authenticated;
revoke all on table public.admin_audit_events from anon, authenticated;

comment on table public.app_usage_events is
  'User-scoped telemetry for the Admin KanBan usage lane. Users can only insert/select their own rows.';
comment on table public.admin_audit_events is
  'Server-only admin audit trail written by the Admin KanBan API using service role credentials.';

create or replace function public.admin_kanban_rls_state()
returns table(table_name text, rls_enabled boolean, force_rls boolean)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select c.relname::text as table_name,
         c.relrowsecurity as rls_enabled,
         c.relforcerowsecurity as force_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'profiles',
      'trips',
      'trip_members',
      'receipts',
      'receipt_items',
      'receipt_photos',
      'integrations',
      'receipt_sync_jobs',
      'app_usage_events',
      'sync_attempt_events',
      'data_quality_runs',
      'data_quality_findings',
      'admin_audit_events'
    )
  order by c.relname;
$$;

revoke all on function public.admin_kanban_rls_state() from public;
revoke all on function public.admin_kanban_rls_state() from anon;
revoke all on function public.admin_kanban_rls_state() from authenticated;
grant execute on function public.admin_kanban_rls_state() to service_role;;
