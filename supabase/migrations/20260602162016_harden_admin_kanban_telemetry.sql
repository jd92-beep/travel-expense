-- Harden Admin KanBan telemetry tables after Supabase advisor review.

create index if not exists app_usage_events_trip_id_idx
  on public.app_usage_events(trip_id);
create index if not exists app_usage_events_receipt_id_idx
  on public.app_usage_events(receipt_id);
create index if not exists sync_attempt_events_trip_id_idx
  on public.sync_attempt_events(trip_id);
create index if not exists sync_attempt_events_receipt_id_idx
  on public.sync_attempt_events(receipt_id);

drop policy if exists app_usage_events_insert_own on public.app_usage_events;
create policy app_usage_events_insert_own on public.app_usage_events
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists app_usage_events_select_own on public.app_usage_events;
create policy app_usage_events_select_own on public.app_usage_events
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists sync_attempt_events_insert_own on public.sync_attempt_events;
create policy sync_attempt_events_insert_own on public.sync_attempt_events
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists sync_attempt_events_select_own on public.sync_attempt_events;
create policy sync_attempt_events_select_own on public.sync_attempt_events
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists data_quality_runs_no_browser_access on public.data_quality_runs;
create policy data_quality_runs_no_browser_access on public.data_quality_runs
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists data_quality_findings_no_browser_access on public.data_quality_findings;
create policy data_quality_findings_no_browser_access on public.data_quality_findings
  for all to anon, authenticated
  using (false)
  with check (false);

drop policy if exists admin_audit_events_no_browser_access on public.admin_audit_events;
create policy admin_audit_events_no_browser_access on public.admin_audit_events
  for all to anon, authenticated
  using (false)
  with check (false);

revoke execute on function public.enforce_trip_private_fields() from public, anon, authenticated;
revoke execute on function public.enforce_receipt_private_fields() from public, anon, authenticated;;
