-- Admin Console data-accuracy pass (admin 1.5.0).
--
-- Idempotent and additive. Live DB history diverges from this repo, so every
-- function change below is applied as an anchored text patch on the *live*
-- definition (pg_get_functiondef) instead of a full re-declaration, and each
-- patch is skipped when its marker is already present. Views only gain
-- trailing columns (CREATE OR REPLACE VIEW keeps the existing column prefix).
--
-- 1. receipt_amend recomputes home_amount / exchange_rate / original_* when the
--    admin changes amount or currency (previously the HKD snapshot went stale,
--    and a currency change kept the old currency's rate).
-- 2. private.admin_receipt_read exposes the HKD snapshot + payer/beneficiary.
-- 3. private.admin_trip_read exposes spend totals and an owner-inclusive
--    member count.
-- 4. admin_read_trip returns a spend breakdown (category / currency / owner).
-- 5. admin_read_overview returns platform totals and 30-day HKD spend.
-- 6. admin_read_accounts / admin_read_search accept a full email (service_role
--    only; lists stay masked, the account detail already returns the email).

-- Function/view owners are dedicated nologin roles (admin_auth_owner /
-- admin_read_owner). The runner (postgres) holds them WITH ADMIN but SET FALSE
-- (platform hardening). A transaction-scoped postgres-granted SET membership is
-- added, used, and revoked again before commit, so the committed membership
-- state is unchanged (only the supabase_admin-granted row remains).
grant admin_auth_owner to postgres with set true, inherit false;
grant admin_read_owner to postgres with set true, inherit false;
-- Owners also lack CREATE (needed by CREATE OR REPLACE); same transaction scope.
grant create on schema public, private to admin_auth_owner, admin_read_owner;

-- 1 ------------------------------------------------------------------------
set local role admin_auth_owner;
do $patch$
declare
  v_def text := pg_get_functiondef('public.admin_operation_commit_r2'::regproc);
  v_anchor text := $a$split_mode = case when coalesce(v_patch ->> 'visibility', receipt.visibility) = 'private' then 'private' else receipt.split_mode end,$a$;
  v_insert text := $i$
          -- admin-1.5.0:home-recompute
          original_amount = case when v_patch ? 'amount' or v_patch ? 'currency'
            then coalesce((v_patch ->> 'amount')::numeric, receipt.amount) else receipt.original_amount end,
          original_currency = case when v_patch ? 'amount' or v_patch ? 'currency'
            then coalesce(v_patch ->> 'currency', receipt.currency) else receipt.original_currency end,
          exchange_rate = case
            when not (v_patch ? 'amount' or v_patch ? 'currency') then receipt.exchange_rate
            when coalesce(v_patch ->> 'currency', receipt.currency) = coalesce(receipt.home_currency, 'HKD') then 1
            when coalesce(v_patch ->> 'currency', receipt.currency) = receipt.currency then receipt.exchange_rate
            else null end,
          home_amount = case
            when not (v_patch ? 'amount' or v_patch ? 'currency') then receipt.home_amount
            when coalesce(v_patch ->> 'currency', receipt.currency) = coalesce(receipt.home_currency, 'HKD')
              then coalesce((v_patch ->> 'amount')::numeric, receipt.amount)
            when coalesce(v_patch ->> 'currency', receipt.currency) = receipt.currency then case
              when receipt.home_amount is not null and receipt.amount is not null and receipt.amount <> 0
                then round(receipt.home_amount * coalesce((v_patch ->> 'amount')::numeric, receipt.amount) / receipt.amount, 2)
              when receipt.exchange_rate > 0
                then round(coalesce((v_patch ->> 'amount')::numeric, receipt.amount) / receipt.exchange_rate, 2)
              else null end
            else null end,$i$;
begin
  if position('admin-1.5.0:home-recompute' in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'admin_operation_commit_r2 receipt_amend anchor not found exactly once';
  end if;
  execute replace(v_def, v_anchor, v_anchor || v_insert);
end
$patch$;

reset role;

-- 2 ------------------------------------------------------------------------
set local role admin_read_owner;
create or replace view private.admin_receipt_read as
 SELECT r.id,
    r.trip_id,
    t.name AS trip_name,
    r.owner_id,
    private.admin_mask_email(u.email) AS owner_masked_email,
    r.store,
    r.record_date,
    r.record_time,
    r.amount,
    r.currency,
    r.record_kind,
    COALESCE(r.visibility, 'trip'::text) AS visibility,
    r.category,
    r.payment_method,
    r.status,
    r.notion_sync_status,
    r.version,
    r.deleted_at,
    r.created_at,
    r.updated_at,
    (EXISTS ( SELECT 1
           FROM public.receipt_photos photo
          WHERE (photo.receipt_id = r.id))) AS has_photo,
        CASE
            WHEN (r.deleted_at IS NOT NULL) THEN 'trash'::text
            WHEN ((r.record_date < t.start_date) OR (r.record_date > t.end_date)) THEN 'issue'::text
            WHEN (r.notion_sync_status = 'failed'::text) THEN 'issue'::text
            ELSE 'healthy'::text
        END AS integrity_status,
    r.sync_revision,
    r.split_mode,
    r.split_type,
    r.home_amount,
    COALESCE(r.home_currency, 'HKD'::text) AS home_currency,
    r.exchange_rate,
    r.person_id,
    r.beneficiary_id
   FROM ((public.receipts r
     LEFT JOIN public.trips t ON ((t.id = r.trip_id)))
     LEFT JOIN private.admin_auth_user_rows() u(id, email, email_confirmed_at, banned_until, last_sign_in_at, created_at, updated_at, deleted_at, is_sso_user, is_anonymous) ON ((u.id = r.owner_id)));

-- 3 ------------------------------------------------------------------------
create or replace view private.admin_trip_read as
 SELECT t.id,
    t.owner_id,
    private.admin_mask_email(u.email) AS owner_masked_email,
    t.name,
    t.destination_summary,
    t.start_date,
    t.end_date,
    t.trip_currency,
    t.home_currency,
    t.budget_amount,
    t.budget_currency,
    t.version,
    t.archived,
    t.created_at,
    t.updated_at,
    (COALESCE(members.member_count, (0)::bigint))::integer AS member_count,
    (COALESCE(receipt_stats.receipt_count, (0)::bigint))::integer AS receipt_count,
    itinerary.expected_days,
    itinerary.actual_days,
    itinerary.out_of_range_days,
    itinerary.duplicate_days,
        CASE
            WHEN ((t.start_date IS NULL) OR (t.end_date IS NULL) OR (t.end_date < t.start_date)) THEN 'invalid_dates'::text
            WHEN ((itinerary.actual_days <> itinerary.expected_days) OR (itinerary.out_of_range_days > 0) OR (itinerary.duplicate_days > 0)) THEN 'issue'::text
            ELSE 'healthy'::text
        END AS integrity_status,
        CASE
            WHEN (itinerary.expected_days > 0) THEN (LEAST((100)::numeric, round(((100.0 * (itinerary.actual_days)::numeric) / (itinerary.expected_days)::numeric))))::integer
            ELSE 0
        END AS itinerary_coverage,
    COALESCE(bl.status,
        CASE
            WHEN (t.notion_database_id IS NULL) THEN 'not_configured'::text
            ELSE 'legacy_binding'::text
        END) AS notion_binding_status,
    ((COALESCE(members.member_count, (0)::bigint)) + 1)::integer AS total_member_count,
    COALESCE(spend.expense_total_home, (0)::numeric) AS expense_total_home,
    COALESCE(spend.expense_count, 0) AS expense_count,
    COALESCE(spend.settlement_count, 0) AS settlement_count,
    COALESCE(spend.private_count, 0) AS private_count,
    COALESCE(spend.trash_count, 0) AS trash_count,
    COALESCE(spend.missing_home_count, 0) AS missing_home_count,
    spend.last_receipt_at
   FROM ((((((public.trips t
     LEFT JOIN private.admin_auth_user_rows() u(id, email, email_confirmed_at, banned_until, last_sign_in_at, created_at, updated_at, deleted_at, is_sso_user, is_anonymous) ON ((u.id = t.owner_id)))
     LEFT JOIN LATERAL ( SELECT count(*) AS member_count
           FROM public.trip_members tm
          WHERE ((tm.trip_id = t.id) AND (tm.status = 'active'::text) AND (tm.user_id <> t.owner_id))) members ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) AS receipt_count
           FROM public.receipts r
          WHERE ((r.trip_id = t.id) AND (r.deleted_at IS NULL))) receipt_stats ON (true))
     LEFT JOIN LATERAL ( SELECT
                CASE
                    WHEN ((t.start_date IS NOT NULL) AND (t.end_date IS NOT NULL) AND (t.end_date >= t.start_date)) THEN ((t.end_date - t.start_date) + 1)
                    ELSE 0
                END AS expected_days,
                CASE
                    WHEN (jsonb_typeof(t.itinerary) = 'array'::text) THEN jsonb_array_length(t.itinerary)
                    ELSE 0
                END AS actual_days,
                CASE
                    WHEN (jsonb_typeof(t.itinerary) = 'array'::text) THEN ( SELECT (count(*))::integer AS count
                       FROM jsonb_array_elements(t.itinerary) day(value)
                      WHERE
                            CASE
                                WHEN pg_input_is_valid((day.value ->> 'date'::text), 'date'::text) THEN ((((day.value ->> 'date'::text))::date < t.start_date) OR (((day.value ->> 'date'::text))::date > t.end_date))
                                ELSE true
                            END)
                    ELSE 0
                END AS out_of_range_days,
                CASE
                    WHEN (jsonb_typeof(t.itinerary) = 'array'::text) THEN ( SELECT (COALESCE(sum((duplicates.day_count - 1)), (0)::numeric))::integer AS "coalesce"
                       FROM ( SELECT count(*) AS day_count
                               FROM jsonb_array_elements(t.itinerary) day(value)
                              GROUP BY (day.value ->> 'date'::text)
                             HAVING (count(*) > 1)) duplicates)
                    ELSE 0
                END AS duplicate_days) itinerary ON (true))
     LEFT JOIN LATERAL ( SELECT link.status
           FROM public.trip_backend_links link
          WHERE (link.trip_id = t.id)
          ORDER BY link.updated_at DESC
         LIMIT 1) bl ON (true))
     LEFT JOIN LATERAL ( SELECT
            round(COALESCE(sum(r.home_amount) FILTER (WHERE ((r.deleted_at IS NULL) AND (r.record_kind = 'expense'::text))), (0)::numeric), 2) AS expense_total_home,
            (count(*) FILTER (WHERE ((r.deleted_at IS NULL) AND (r.record_kind = 'expense'::text))))::integer AS expense_count,
            (count(*) FILTER (WHERE ((r.deleted_at IS NULL) AND (r.record_kind = 'settlement'::text))))::integer AS settlement_count,
            (count(*) FILTER (WHERE ((r.deleted_at IS NULL) AND (COALESCE(r.visibility, 'trip'::text) = 'private'::text))))::integer AS private_count,
            (count(*) FILTER (WHERE (r.deleted_at IS NOT NULL)))::integer AS trash_count,
            (count(*) FILTER (WHERE ((r.deleted_at IS NULL) AND (r.record_kind = 'expense'::text) AND (r.home_amount IS NULL) AND (COALESCE(r.amount, (0)::numeric) <> (0)::numeric))))::integer AS missing_home_count,
            max(r.updated_at) AS last_receipt_at
           FROM public.receipts r
          WHERE (r.trip_id = t.id)) spend ON (true));

-- 4 ------------------------------------------------------------------------
do $patch$
declare
  v_def text := pg_get_functiondef('public.admin_read_trip'::regproc);
  v_anchor text := $a$    'integration', ($a$;
  v_insert text := $i$    -- admin-1.5.0:trip-spend
    'spend', jsonb_build_object(
      'byCategory', coalesce((
        select jsonb_agg(to_jsonb(category_row) order by category_row.home_total desc nulls last)
        from (
          select coalesce(nullif(r.category, ''), 'other') as category,
            count(*)::integer as receipts,
            round(coalesce(sum(r.home_amount), 0), 2) as home_total
          from public.receipts r
          where r.trip_id = p_id and r.deleted_at is null and r.record_kind = 'expense'
          group by 1
        ) category_row
      ), '[]'::jsonb),
      'byCurrency', coalesce((
        select jsonb_agg(to_jsonb(currency_row) order by currency_row.receipts desc)
        from (
          select r.currency,
            count(*)::integer as receipts,
            round(coalesce(sum(r.amount), 0), 2) as amount_total,
            round(coalesce(sum(r.home_amount), 0), 2) as home_total
          from public.receipts r
          where r.trip_id = p_id and r.deleted_at is null and r.record_kind = 'expense'
          group by r.currency
        ) currency_row
      ), '[]'::jsonb),
      'byOwner', coalesce((
        select jsonb_agg(to_jsonb(owner_row) order by owner_row.home_total desc nulls last)
        from (
          select r.owner_id,
            private.admin_mask_email(owner_user.email) as masked_email,
            count(*)::integer as receipts,
            round(coalesce(sum(r.home_amount), 0), 2) as home_total
          from public.receipts r
          left join private.admin_auth_user_rows() owner_user on owner_user.id = r.owner_id
          where r.trip_id = p_id and r.deleted_at is null and r.record_kind = 'expense'
          group by r.owner_id, owner_user.email
        ) owner_row
      ), '[]'::jsonb)
    ),
$i$;
begin
  if position('admin-1.5.0:trip-spend' in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'admin_read_trip integration anchor not found exactly once';
  end if;
  execute replace(v_def, v_anchor, v_insert || v_anchor);
end
$patch$;

-- 5 ------------------------------------------------------------------------
do $patch$
declare
  v_def text := pg_get_functiondef('public.admin_read_overview'::regproc);
  v_anchor text := $a$'counts', jsonb_build_object($a$;
  v_insert text := $i$
      -- admin-1.5.0:overview-totals
      'totalAccounts', (select count(*) from private.admin_auth_user_rows() where deleted_at is null),
      'totalTrips', (select count(*) from public.trips),
      'totalReceipts', (select count(*) from public.receipts where deleted_at is null),
      'trashReceipts', (select count(*) from public.receipts where deleted_at is not null),
      'spend30dHome', (
        select round(coalesce(sum(home_amount), 0), 2) from public.receipts
        where deleted_at is null and record_kind = 'expense'
          and created_at >= clock_timestamp() - interval '30 days'
      ),
      'pendingJobs', (select count(*) from public.receipt_sync_jobs where status in ('pending', 'processing')),$i$;
begin
  if position('admin-1.5.0:overview-totals' in v_def) > 0 then return; end if;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'admin_read_overview counts anchor not found exactly once';
  end if;
  execute replace(v_def, v_anchor, v_anchor || v_insert);
end
$patch$;

-- 6 ------------------------------------------------------------------------
do $patch$
declare
  v_def text := pg_get_functiondef('public.admin_read_accounts'::regproc);
  v_reject text := $a$
    or coalesce(p_q, '') like '%@%'$a$;
  v_anchor text := $a$or a.masked_email ilike p_q || '%'$a$;
  v_insert text := $i$
      -- admin-1.5.0:email-search
      or exists (
        select 1 from private.admin_auth_user_rows() email_user
        where email_user.id = a.id and email_user.email ilike '%' || p_q || '%'
      )$i$;
begin
  if position('admin-1.5.0:email-search' in v_def) > 0 then return; end if;
  if position(v_reject in v_def) = 0 or position(v_anchor in v_def) = 0 then
    raise exception 'admin_read_accounts email-search anchors not found';
  end if;
  v_def := replace(v_def, v_reject, '');
  execute replace(v_def, v_anchor, v_anchor || v_insert);
end
$patch$;

do $patch$
declare
  v_def text := pg_get_functiondef('public.admin_read_search'::regproc);
  v_reject text := $a$ or p_q like '%@%'$a$;
  v_anchor text := $a$or masked_email ilike p_q || '%'$a$;
  v_insert text := $i$
          -- admin-1.5.0:email-search
          or exists (
            select 1 from private.admin_auth_user_rows() email_user
            where email_user.id = admin_account_read.id and email_user.email ilike '%' || p_q || '%'
          )$i$;
begin
  if position('admin-1.5.0:email-search' in v_def) > 0 then return; end if;
  if position(v_reject in v_def) = 0 or position(v_anchor in v_def) = 0 then
    raise exception 'admin_read_search email-search anchors not found';
  end if;
  v_def := replace(v_def, v_reject, '');
  execute replace(v_def, v_anchor, v_anchor || v_insert);
end
$patch$;

reset role;
revoke admin_auth_owner from postgres granted by postgres;
revoke admin_read_owner from postgres granted by postgres;
revoke create on schema public, private from admin_auth_owner, admin_read_owner;
