import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.0";
import { classifyBrokerOnlyStatus, classifyProviderStatus, providerProbeSucceeded } from "./provider_status.ts";
import { evaluateAdminRequest, type AdminRequestDecision } from "./security.ts";

export const config = { verify_jwt: false };

type SupabaseClientAny = ReturnType<typeof createClient>;

const VERIFY_URL = Deno.env.get("ADMIN_KANBAN_VERIFY_URL") || "https://travel-expense-admin-kanban.vercel.app/api/verify-session";
const LOGIN_URL = Deno.env.get("ADMIN_KANBAN_LOGIN_URL") || "https://travel-expense-admin-kanban.vercel.app/api/session";
const CREDENTIAL_BROKER_URL = Deno.env.get("CREDENTIAL_BROKER_URL") || "https://travel-expense-credential-broker.ftjdfr.workers.dev";
const ALLOWED_ORIGINS = new Set([
  "https://travel-expense-admin-kanban.vercel.app",
  "https://travel-expense-compact.vercel.app",
  "https://jd92-beep.github.io",
  "http://localhost:8903",
  "http://127.0.0.1:8903",
  "http://localhost:8904",
  "http://127.0.0.1:8904",
]);

// In-memory cache for provider test results (survives within a single Edge Function instance)
const providerTestCache = new Map<string, { status: string; message?: string; testedAt: number }>();
const MAX_JSON_BODY_BYTES = 64 * 1024;
const RECEIPT_STATUSES = new Set(["draft", "pending", "confirmed"]);
const CURRENCY_RE = /^[A-Z]{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const RECEIPT_CATEGORIES = new Set(["transport", "food", "shopping", "lodging", "ticket", "medicine", "other"]);
const RECEIPT_PAYMENTS = new Set(["cash", "credit", "paypay", "suica"]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://travel-expense-admin-kanban.vercel.app",
    "Access-Control-Allow-Headers": "authorization, content-type, x-admin-token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  };
}

function json(req: Request, status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders(req) });
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 5000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function redact(value: unknown) {
  return String(value || "")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted-key]")
    .replace(/ntn_[A-Za-z0-9]+/g, "[redacted-token]")
    .replace(/secret_[A-Za-z0-9]+/g, "[redacted-token]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]");
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL") || "https://fbnnjoahvtdrnigevrtw.supabase.co";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Supabase Edge service role is not configured");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function readBody(req: Request) {
  if (req.method === "GET") return {};
  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_JSON_BODY_BYTES) {
    const err = new Error("JSON body too large") as any;
    err.status = 413;
    throw err;
  }
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error("Invalid JSON body") as any;
    err.status = 400;
    throw err;
  }
}

async function verifyAdmin(req: Request): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://fbnnjoahvtdrnigevrtw.supabase.co";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const adminHeader = req.headers.get("x-admin-token") || "";

  // Transitional read-only HMAC session path. The verifier must explicitly
  // affirm the session; an empty 200 response is never authorization.
  if (adminHeader) {
    try {
      const verifyRes = await fetch(VERIFY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminHeader}` },
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (verifyRes.ok && verifyData?.ok === true && verifyData?.adminSubject) {
        return String(verifyData.adminSubject || "hmac-admin");
      }
    } catch { /* handled below */ }
    throw new Error("Admin session invalid");
  }

  // Now check Authorization header
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Missing authorization");

  // Path 1: Service role key
  if (serviceKey && token === serviceKey) {
    return "service-role-admin";
  }

  // Path 2: Supabase user JWT (for compact app admin console)
  try {
    if (serviceKey) {
      const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { "Authorization": `Bearer ${token}`, "apikey": serviceKey },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        const email = (userData.email || "").toLowerCase();
        const BOSS_EMAILS = ["vc06456@gmail.com"];
        if (BOSS_EMAILS.includes(email)) return String(userData.id || email);
      }
    }
  } catch { /* fall through to HMAC */ }

  // Path 3: HMAC verification (for admin-kanban Vercel app)
  const response = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { Authorization: auth },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || "Admin session invalid");
  }
  return String(data.adminSubject || "admin");
}

async function verifyPassphrase(passphrase: string) {
  const response = await fetch(LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || "Admin re-auth failed");
  }
}

function maskEmail(email: unknown) {
  return String(email || "").trim() || "unknown";
}

async function hashId(value: unknown) {
  const input = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

async function safeCount(supabase: SupabaseClientAny, table: string, column?: string, value?: string) {
  try {
    const query = supabase.from(table).select("*", { count: "exact", head: true });
    if (column && value) query.eq(column, value);
    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
  } catch {
    return 0;
  }
}

async function strictCount(supabase: SupabaseClientAny, table: string, column?: string, value?: string) {
  const query = supabase.from(table).select("*", { count: "exact", head: true });
  if (column && value) query.eq(column, value);
  const { count, error } = await query;
  if (error) throw new Error(`Delete preview count failed for ${table}: ${redact(error.message)}`);
  return count || 0;
}

async function fetchRows(
  supabase: SupabaseClientAny,
  table: string,
  select: string,
  limit = 250,
  orderColumn: string | null = null,
  orderAscending = true
) {
  const PAGE_SIZE = 1000;
  const MAX_ROWS = 10000;
  const effectiveLimit = Math.min(limit, MAX_ROWS);
  try {
    const allRows: any[] = [];
    let from = 0;
    while (from < effectiveLimit) {
      const pageSize = Math.min(PAGE_SIZE, effectiveLimit - from);
      let query = supabase.from(table).select(select);
      if (orderColumn) {
        query = query.order(orderColumn, { ascending: orderAscending });
      }
      const { data, error } = await query.range(from, from + pageSize - 1);
      if (error) throw error;
      const rows = data || [];
      allRows.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return { data: allRows, error: undefined as string | undefined, truncated: allRows.length >= effectiveLimit };
  } catch (err) {
    return { data: [] as any[], error: redact(err), truncated: false };
  }
}

async function safeRlsState(supabase: SupabaseClientAny) {
  try {
    const { data, error } = await supabase.rpc("admin_kanban_rls_state");
    if (error) throw error;
    return { data: data || [] };
  } catch {
    return { data: [] };
  }
}

async function listUsers(supabase: SupabaseClientAny) {
  const users = [];
  let page = 1;
  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...(data.users || []));
    if (!data.users || data.users.length < 1000) break;
    page += 1;
  }
  return users;
}

function groupCount(rows: any[], key: string) {
  const map = new Map<string, number>();
  for (const row of rows || []) {
    const value = row?.[key];
    if (!value) continue;
    map.set(value, (map.get(value) || 0) + 1);
  }
  return map;
}

function groupBy(rows: any[], key: string) {
  const map = new Map<string, any[]>();
  for (const row of rows || []) {
    const value = row?.[key] || "";
    if (!map.has(value)) map.set(value, []);
    map.get(value)!.push(row);
  }
  return map;
}

function providerLabel(provider: string) {
  return {
    kimi: "Kimi",
    google: "Google Gemma",
    mimo: "Mimo v2.5",
    weatherapi: "WeatherAPI",
    notion: "Notion",
  }[provider] || provider;
}

function providerModel(provider: string) {
  return {
    kimi: "kimi-code",
    google: "gemma-4-31b",
    mimo: "mimo-v2.5",
    weatherapi: "forecast",
    notion: "mirror",
  }[provider];
}

function providerModels(provider: string): Array<{ id: string; name: string }> {
  const models: Record<string, Array<{ id: string; name: string }>> = {
    kimi: [
      { id: "kimi-code", name: "Kimi Code" },
      { id: "kimi-8k", name: "Kimi 8K" },
      { id: "kimi-32k", name: "Kimi 32K" },
      { id: "kimi-k2.6", name: "Kimi K2.6" },
      { id: "kimi-for-coding", name: "Kimi for Coding" },
    ],
    google: [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "gemini-3.1-flash", name: "Gemini 3.1 Flash" },
      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite" },
      { id: "gemma-4-31b-it", name: "Gemma 4 31B" },
      { id: "gemma-4-26b", name: "Gemma 4 26B" },
    ],
    mimo: [
      { id: "mimo-v2.5", name: "Mimo v2.5" },
      { id: "mimo-v2.5-pro", name: "Mimo v2.5 Pro" },
    ],
    weatherapi: [
      { id: "forecast", name: "Weather Forecast" },
    ],
    notion: [
      { id: "mirror", name: "Notion Mirror" },
    ],
  };
  return models[provider] || [{ id: providerModel(provider) || provider, name: providerLabel(provider) }];
}

async function brokerHealth(supabase: SupabaseClientAny) {
  const baseUrl = CREDENTIAL_BROKER_URL.replace(/\/+$/, "");
  try {
    const statusRes = await fetchWithTimeout(`${baseUrl}/credentials/status`, {
      headers: {
        'Origin': 'https://travel-expense-compact.vercel.app',
        'X-Admin-Internal': Deno.env.get('EDGE_BROKER_KEY') || '',
      },
    }, 5000);
    if (!statusRes.ok) throw new Error(`broker status ${statusRes.status}`);
    const statusData = await statusRes.json();
    const brokerProviders: any[] = statusData.providers || [];

    // Use stored provider status for error detection
    // If provider status is not "connected", count it as an error
    let errorMap = new Map<string, number>();
    for (const p of brokerProviders) {
      const provider = p.provider || p.name || "";
      const status = p.status || "";
      if (status !== "connected" && status !== "healthy" && status !== "broker_online") {
        errorMap.set(provider, 1);
      }
    }
    // Check cached test results from "Test" button clicks
    const now = Date.now();
    for (const [provider, cached] of providerTestCache.entries()) {
      if (now - cached.testedAt < 24 * 60 * 60 * 1000) { // within 24h
        if (cached.status !== "connected" && cached.status !== "healthy") {
          errorMap.set(provider, (errorMap.get(provider) || 0) + 1);
        }
      }
    }
    // Also check usage events for additional error data (including provider test results)
    try {
      const since = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      const { data: errRows } = await supabase
        .from("app_usage_events")
        .select("provider, outcome, event_name")
        .gte("created_at", since)
        .or("outcome.eq.error,event_name.like.provider_test_%");
      for (const row of errRows || []) {
        if (!row.provider) continue;
        if (row.outcome === "error") {
          errorMap.set(row.provider, (errorMap.get(row.provider) || 0) + 1);
        }
      }
    } catch { /* ignore */ }

    return brokerProviders.map((p: any) => {
      const provider = p.provider || p.name || "";
      // Expand provider into individual model entries
      const models = providerModels(provider);
      const classified = classifyProviderStatus(p);
      return models.map((modelEntry: any) => ({
        provider,
        label: p.label || providerLabel(provider),
        ...classified,
        model: modelEntry.id,
        modelName: modelEntry.name,
        lastTestedAt: p.lastTestedAt || p.last_tested_at || null,
        errors24h: errorMap.get(provider) || 0,
      }));
    }).flat();
  } catch {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/health`, {}, 5000);
      if (!response.ok) throw new Error(`broker ${response.status}`);
      const fallback = ["notion", "kimi", "google", "weatherapi", "mimo"];
      return fallback.map((provider) => ({
        provider,
        label: providerLabel(provider),
        ...classifyBrokerOnlyStatus(),
        model: providerModel(provider),
        lastTestedAt: null,
        errors24h: 0,
        message: "Broker is online; provider health was not verified",
      }));
    } catch (error) {
      const fallback = ["notion", "kimi", "google", "weatherapi", "mimo"];
      return fallback.map((provider) => ({
        provider,
        label: providerLabel(provider),
        status: "warning",
        storedStatus: "broker_unreachable",
        model: providerModel(provider),
        message: redact(error),
        errors24h: 0,
      }));
    }
  }
}

async function brokerNotionRequest(path: string, method: string, body?: unknown, databaseId?: string) {
  const res = await fetchWithTimeout(`${CREDENTIAL_BROKER_URL.replace(/\/+$/, "")}/notion/request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://travel-expense-compact.vercel.app",
      "X-Admin-Internal": Deno.env.get("EDGE_BROKER_KEY") || "",
    },
    body: JSON.stringify({ path, method, body, databaseId }),
  }, 15000);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) throw new Error(redact(data?.error || `broker notion ${res.status}`));
  return data.data;
}

async function notionReceiptSourceIds(databaseId: string): Promise<string[]> {
  const sourceIds: string[] = [];
  let cursor: string | undefined = undefined;
  let guard = 0;
  do {
    const resp: any = await brokerNotionRequest(`/databases/${databaseId}/query`, "POST", {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    }, databaseId);
    for (const page of resp?.results || []) {
      const prop = page?.properties?.SourceID;
      const text = (prop?.rich_text || []).map((t: any) => t?.plain_text || "").join("").trim();
      if (!text || text.startsWith("__") || text.startsWith("trip_")) continue; // settings meta / trip pages
      // Itinerary-update notices from the email pipeline (店名 starts with "🗓 行程更新：") are
      // not real expenses and are never pushed to Supabase by design — counting them as
      // reconciler "orphans" was a false positive. Title, not amount: a real $0 receipt (free
      // sample etc.) does have a Supabase counterpart and must still reconcile normally.
      const title = (page?.properties?.["店名"]?.title || []).map((t: any) => t?.plain_text || "").join("");
      if (title.startsWith("🗓")) continue;
      sourceIds.push(text);
    }
    cursor = resp?.has_more ? resp.next_cursor : undefined;
  } while (cursor && ++guard < 20);
  return sourceIds;
}

async function snapshot(rangeDays: number, surface: string = "compact") {
  const supabase = serviceClient();
  const sinceIso = new Date(Date.now() - Math.max(1, rangeDays) * 24 * 60 * 60 * 1000).toISOString();

  const usageQuery = supabase
    .from("app_usage_events")
    .select("user_id,session_id_hash,app_surface,event_name,provider,model,outcome,created_at")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (surface !== "all") usageQuery.eq("app_surface", surface);
  const { data: usageRows, error: usageError } = await usageQuery;

  const [
    users,
    tripsRes, receiptsRes, photosRes, integrationsRes, jobsRes, auditsRes,
    rlsRpc, llm, profilesRes, tripMembersRes,
  ] = await Promise.all([
    listUsers(supabase),
    fetchRows(supabase, "trips", "id,owner_id,name,destination_summary,start_date,end_date,trip_currency,budget_amount,budget_currency,itinerary,timezones,active,archived,updated_at,app_metadata"),
    // ROOT CAUSE OF puiyuchau@gmail.com 0-receipt BUG:
    // Previously, this query retrieved only up to 1000 receipts without any explicit sorting. 
    // Since newer receipts were ordered arbitrarily/by insertion and the total count of receipts across 
    // all users exceeded 1000, newer user records (e.g. for newer accounts or specific users) 
    // were completely truncated from the returned set, causing their active receipts to calculate as 0.
    // FIX: Raise limit to 10000 and explicitly order by  so that the newest receipts
    // are prioritized first in case of a hard cap, ensuring correct user dashboard displays.
    fetchRows(supabase, "receipts", "id,trip_id,owner_id,store,status,amount,currency,category,payment_method,record_date,record_time,note,items_text,address,booking_ref,original_amount,original_currency,exchange_rate,home_amount,created_at,updated_at,deleted_at,notion_page_id,notion_sync_status,notion_last_synced_at", 10000, "created_at", false),
    fetchRows(supabase, "receipt_photos", "id,receipt_id,owner_id,storage_path"),
    fetchRows(supabase, "integrations", "id,user_id,provider,status,last_synced_at"),
    fetchRows(supabase, "receipt_sync_jobs", "id,owner_id,provider,status,last_error,created_at,updated_at"),
    fetchRows(supabase, "admin_audit_events", "id,admin_subject_hash,action,target_type,target_id_hash,created_at", 50),
    safeRlsState(supabase),
    brokerHealth(supabase),
    fetchRows(supabase, "profiles", "id,display_name,avatar_url,home_currency,locale"),
    fetchRows(supabase, "trip_members", "trip_id,user_id"),
  ]);
  const trips = tripsRes.data;
  // Soft-deleted receipts must not appear in the console
  const receipts = receiptsRes.data.filter((row: any) => !row.deleted_at);
  const photos = photosRes.data;
  const integrations = integrationsRes.data;
  const jobs = jobsRes.data;
  const usage = usageRows || [];
  const audits = auditsRes.data;
  const profiles = profilesRes.data;
  const tripMembers = tripMembersRes.data;

  const warnings: string[] = [];
  if (usageError) warnings.push(`Usage events read failed: ${redact(usageError)}`);
  if (usage.length >= 5000) warnings.push("Usage events hit 5000 row limit; counts may be partial.");
  const tableReads = [
    { name: "Trips", res: tripsRes },
    { name: "Receipts", res: receiptsRes },
    { name: "Photos", res: photosRes },
    { name: "Integrations", res: integrationsRes },
    { name: "Sync jobs", res: jobsRes },
    { name: "Audit events", res: auditsRes },
    { name: "Profiles", res: profilesRes },
    { name: "Trip members", res: tripMembersRes },
  ];
  for (const { name, res } of tableReads) {
    if (res.error) warnings.push(`${name} read failed: ${res.error}`);
    if (res.truncated) warnings.push(`${name} read hit max row cap; counts may be partial.`);
  }

  const countResults: Record<string, { count: number | null; error?: string }> = {};
  const countKeys = [
    ["profiles", "profiles"], ["trips", "trips"], ["receipts", "receipts"],
    ["receiptItems", "receipt_items"], ["receiptPhotos", "receipt_photos"],
    ["integrations", "integrations"], ["receiptSyncJobs", "receipt_sync_jobs"],
    ["usageEvents", "app_usage_events"], ["auditEvents", "admin_audit_events"],
  ] as const;
  for (const [key, table] of countKeys) {
    try {
      const query = supabase.from(table).select("*", { count: "exact", head: true });
      const { count, error } = await query;
      if (error) throw error;
      countResults[key] = { count: count || 0 };
    } catch (err) {
      countResults[key] = { count: null, error: redact(err) };
    }
  }
  const counts = {
    authUsers: users.length,
    profiles: countResults.profiles.count ?? 0,
    trips: countResults.trips.count ?? 0,
    receipts: countResults.receipts.count ?? 0,
    receiptItems: countResults.receiptItems.count ?? 0,
    receiptPhotos: countResults.receiptPhotos.count ?? 0,
    integrations: countResults.integrations.count ?? 0,
    receiptSyncJobs: countResults.receiptSyncJobs.count ?? 0,
    usageEvents: countResults.usageEvents.count ?? 0,
    auditEvents: countResults.auditEvents.count ?? 0,
  };
  const countHealth: Record<string, string> = {};
  for (const [key, result] of Object.entries(countResults)) {
    countHealth[key] = result.error ? "error" : "ok";
    if (result.error) warnings.push(`Count failed for ${key}: ${result.error}`);
  }
  const cutoff = Date.now() - Math.max(1, Number(rangeDays) || 7) * 24 * 60 * 60 * 1000;
  const rangedUsage = usage;
  const userById = new Map(users.map((user: any) => [user.id, user]));
  const profileById = new Map(profiles.map((p: any) => [p.id, p]));
  const tripsByOwner = groupCount(trips, "owner_id");
  const receiptsByOwner = groupCount(receipts, "owner_id");
  const photosByOwner = groupCount(photos, "owner_id");
  const membersByTrip = groupCount(tripMembers, "trip_id");
  const usageByUser = groupBy(rangedUsage, "user_id");
  const userCards = users.map((user: any) => {
    const userUsage = usageByUser.get(user.id) || [];
    const lastSeenAt = userUsage.map((row) => row.created_at).sort().at(-1) || user.last_sign_in_at || null;
    const profile = profileById.get(user.id) || {};
    const userIntegrations = integrations.filter((row: any) => row.user_id === user.id);
    const notionIntegration = userIntegrations.find((row: any) => row.provider === "notion");
    const userSyncJobs = jobs.filter((row: any) => row.owner_id === user.id);
    const failedJobs = userSyncJobs.filter((row: any) => row.status === "failed");
    const lastSyncAt = userSyncJobs.map((row: any) => row.updated_at).sort().at(-1) || null;
    return {
      id: user.id,
      email: maskEmail(user.email),
      displayName: profile.display_name || null,
      avatarUrl: profile.avatar_url || null,
      homeCurrency: profile.home_currency || null,
      locale: profile.locale || null,
      createdAt: user.created_at || null,
      joinedAt: user.created_at || null,
      lastSeenAt,
      lastSyncAt,
      sessionCount: new Set(userUsage.map((row) => row.session_id_hash).filter(Boolean)).size,
      eventCount: userUsage.length,
      tripCount: tripsByOwner.get(user.id) || 0,
      receiptCount: receiptsByOwner.get(user.id) || 0,
      imageCount: photosByOwner.get(user.id) || 0,
      notionConnected: !!notionIntegration && notionIntegration.status === "connected",
      notionStatus: notionIntegration ? notionIntegration.status : "not_configured",
      notionStatusLabel: notionIntegration
        ? notionIntegration.status === "connected" ? "Connected" : notionIntegration.status === "syncing" ? "Syncing" : notionIntegration.status === "error" ? "Error" : notionIntegration.status
        : "Not Configured",
      notionLastSyncedAt: notionIntegration?.last_synced_at || null,
      supabaseConnected: !!user.last_sign_in_at,
      syncJobCount: userSyncJobs.length,
      failedSyncJobs: failedJobs.length,
      aiRequestsToday: userUsage.filter((row) => /^ai_request/.test(row.event_name || "")).length,
      health: failedJobs.length > 0 ? "warning" : "healthy",
    };
  });
  const receiptCountByTrip = groupCount(receipts, "trip_id");
  const tripCards = trips.map((trip: any) => {
    const metadata = trip.app_metadata && typeof trip.app_metadata === "object" ? trip.app_metadata : {};
    const intelligence = metadata.intelligence || {};
    return {
      id: trip.id,
      ownerId: trip.owner_id,
      ownerEmail: maskEmail((userById.get(trip.owner_id) as any)?.email),
      name: trip.name,
      destination: trip.destination_summary || "Unknown destination",
      dateRange: [trip.start_date, trip.end_date].filter(Boolean).join(" - ") || "No dates",
      countryCode: intelligence.countryCode || intelligence.country_code || "GLOBAL",
      currency: trip.trip_currency || intelligence.primaryCurrency || "JPY",
      budgetAmount: trip.budget_amount != null ? Number(trip.budget_amount) : null,
      budgetCurrency: trip.budget_currency || null,
      itinerary: trip.itinerary || null,
      timezones: trip.timezones || null,
      memberCount: membersByTrip.get(trip.id) || 0,
      members: tripMembers.filter((m: any) => m.trip_id === trip.id).map((m: any) => m.user_id),
      active: !!trip.active,
      archived: !!trip.archived,
      receiptCount: receiptCountByTrip.get(trip.id) || 0,
      updatedAt: trip.updated_at || null,
    };
  });
  const photosByReceipt = groupBy(photos, "receipt_id");
  const receiptCards = receipts.map((receipt: any) => {
    const rPhotos = photosByReceipt.get(receipt.id) || [];
    return {
      id: receipt.id,
      tripId: receipt.trip_id,
      ownerId: receipt.owner_id,
      store: receipt.store,
      status: receipt.status,
      category: receipt.category || null,
      payment: receipt.payment_method || null,
      amount: Number(receipt.amount || 0),
      currency: receipt.currency || "JPY",
      recordDate: receipt.record_date,
      recordTime: receipt.record_time || null,
      note: receipt.note || null,
      itemsText: receipt.items_text || null,
      address: receipt.address || null,
      bookingRef: receipt.booking_ref || null,
      originalAmount: receipt.original_amount != null ? Number(receipt.original_amount) : null,
      originalCurrency: receipt.original_currency || null,
      exchangeRate: receipt.exchange_rate != null ? Number(receipt.exchange_rate) : null,
      homeAmount: receipt.home_amount != null ? Number(receipt.home_amount) : null,
      createdAt: receipt.created_at || null,
      updatedAt: receipt.updated_at || null,
      notionSynced: !!receipt.notion_page_id || receipt.notion_sync_status === "synced",
      photoPath: rPhotos.length > 0 ? rPhotos[0].storage_path : null,
    };
  });
  const bySurface = [...groupBy(rangedUsage, "app_surface")].map(([surface, rows]) => ({
    surface: surface || "unknown",
    events: rows.length,
    users: new Set(rows.map((row) => row.user_id).filter(Boolean)).size,
  }));
  const rlsRows = ((rlsRpc as any).data || []).map((row: any) => ({
    table: row.table_name,
    enabled: !!row.rls_enabled,
    force: !!row.force_rls,
  }));
  const readErrors = tableReads.filter(({ res }) => res.error).map(({ name }) => name);
  const truncatedTables = tableReads.filter(({ res }) => res.truncated).map(({ name }) => name);
  const rlsAvailable = rlsRows.length > 0;
  const supabaseStatus = readErrors.length > 0 || !rlsAvailable ? "danger" : truncatedTables.length > 0 || !counts.usageEvents ? "warning" : "healthy";

  const surfaceLabel = surface === "compact" ? "Compact" : surface === "react" ? "React" : surface === "legacy" ? "Legacy" : surface === "admin-kanban" ? "Admin" : "All Surfaces";

  const warningsSnapshot: string[] = warnings;
  if (!counts.usageEvents) warningsSnapshot.push("Usage telemetry table is ready, but no app usage events have been recorded yet.");
  if (!rlsAvailable) warningsSnapshot.push("RLS runtime RPC is unavailable.");
  return {
    generatedAt: new Date().toISOString(),
    staleAfterSeconds: 60,
    source: "live-edge",
    scope: {
      surface,
      label: surfaceLabel,
      filterApplied: surface !== "all",
      surfaceAttribution: surface === "all" ? "all" : "usage-only",
    },
    supabase: {
      projectRef: "fbnnjoahvtdrnigevrtw",
      status: supabaseStatus,
      counts,
      countHealth,
      rls: rlsRows,
      readHealth: {
        errors: readErrors,
        truncatedTables,
        rlsAvailable,
      },
    },
    usage: {
      rangeDays,
      events: rangedUsage.length,
      activeUsers: new Set(rangedUsage.map((row: any) => row.user_id).filter(Boolean)).size,
      sessions: new Set(rangedUsage.map((row: any) => row.session_id_hash).filter(Boolean)).size,
      bySurface,
    },
    users: userCards,
    trips: tripCards,
    receipts: receiptCards,
    notion: {
      connectedUsers: new Set(integrations.filter((row: any) => row.provider === "notion" && row.status === "connected").map((row: any) => row.user_id)).size,
      integrationRows: integrations.length,
      syncedReceipts: receipts.filter((row: any) => row.notion_page_id || row.notion_sync_status === "synced").length,
      failedJobs: jobs.filter((row: any) => row.status === "failed").length,
      pendingJobs: jobs.filter((row: any) => ["pending", "processing"].includes(row.status)).length,
      lastSyncedAt: integrations.map((row: any) => row.last_synced_at).filter(Boolean).sort().at(-1) || null,
    },
    llm,
    audit: audits.map((row: any) => ({
      id: row.id,
      adminSubject: row.admin_subject_hash,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id_hash || null,
      createdAt: row.created_at,
    })),
    warnings: warningsSnapshot,
  };
}

async function deletePreview(userId: string) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(userId)) throw new Error("Invalid user ID format");
  const supabase = serviceClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) throw new Error("User not found");
  const counts = {
    authUsers: 1,
    profiles: await strictCount(supabase, "profiles", "id", userId),
    trips: await strictCount(supabase, "trips", "owner_id", userId),
    tripMembers: await strictCount(supabase, "trip_members", "user_id", userId),
    receipts: await strictCount(supabase, "receipts", "owner_id", userId),
    receiptItems: await strictCount(supabase, "receipt_items", "owner_id", userId),
    receiptPhotos: await strictCount(supabase, "receipt_photos", "owner_id", userId),
    integrations: await strictCount(supabase, "integrations", "user_id", userId),
    receiptSyncJobs: await strictCount(supabase, "receipt_sync_jobs", "owner_id", userId),
    usageEvents: await strictCount(supabase, "app_usage_events", "user_id", userId),
    syncAttemptEvents: await strictCount(supabase, "sync_attempt_events", "user_id", userId),
  };
  const emailMasked = maskEmail(data.user.email);
  return {
    userId,
    emailMasked,
    counts,
    confirmPhrase: `DELETE USER ${emailMasked}`,
    generatedAt: new Date().toISOString(),
  };
}

async function writeAudit(supabase: SupabaseClientAny, entry: Record<string, any>) {
  const { error } = await supabase.from("admin_audit_events").insert({
    admin_subject_hash: await hashId(entry.adminSubject),
    action: entry.action,
    target_type: entry.targetType,
    target_id_hash: await hashId(entry.targetId),
    request_id: entry.requestId,
    preview_counts: entry.previewCounts,
    result: entry.result,
  });
  if (error) throw new Error("Admin audit write failed; delete operation blocked for safety");
}

async function recordRejectedAdminRequest(
  req: Request,
  decision: Extract<AdminRequestDecision, { allowed: false }>,
) {
  const event = {
    event: "admin_security_event",
    code: decision.code,
    method: req.method.toUpperCase(),
    route: decision.route || "invalid",
    requestId: decision.requestId,
    writeMode: decision.writeMode,
  };
  console.warn(JSON.stringify(event));

  try {
    const supabase = serviceClient();
    const { error } = await supabase.from("admin_audit_events").insert({
      admin_subject_hash: await hashId("unauthenticated"),
      action: "admin_request_denied",
      target_type: "admin_route",
      target_id_hash: await hashId(`${event.method}:${event.route}`),
      request_id: event.requestId,
      preview_counts: null,
      result: {
        code: event.code,
        method: event.method,
        route: event.route,
        writeMode: event.writeMode,
      },
    });
    if (error) console.error(JSON.stringify({ event: "admin_security_event_store_failed", requestId: event.requestId }));
  } catch {
    console.error(JSON.stringify({ event: "admin_security_event_store_failed", requestId: event.requestId }));
  }
}

async function deleteUser(userId: string, confirmPhrase: string, adminPassphrase: string, adminSubject: string) {
  await verifyPassphrase(adminPassphrase);
  const preview = await deletePreview(userId);
  if (confirmPhrase !== preview.confirmPhrase) throw new Error("Confirm phrase mismatch");
  const supabase = serviceClient();
  const requestId = crypto.randomUUID();
  await writeAudit(supabase, {
    adminSubject,
    action: "delete_user_started",
    targetType: "user",
    targetId: userId,
    requestId,
    previewCounts: preview.counts,
    result: { emailMasked: preview.emailMasked },
  });
  const photosRes = await fetchRows(supabase, "receipt_photos", "owner_id,storage_bucket,storage_path", 1000);
  const targetPhotos = photosRes.data.filter((row: any) => row.owner_id === userId && row.storage_bucket && row.storage_path);
  let storageAttempted = 0;
  let storageSucceeded = 0;
  let storageFailed = 0;
  for (const [bucket, rows] of groupBy(targetPhotos, "storage_bucket")) {
    const paths = rows.map((row: any) => row.storage_path);
    storageAttempted += paths.length;
    const { error: removeErr } = await supabase.storage.from(bucket).remove(paths);
    if (removeErr) storageFailed += paths.length;
    else storageSucceeded += paths.length;
  }
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw error;
  const postDelete = await deletePreview(userId).catch((err) => ({ userMissingAfterDelete: /not found/i.test(String(err?.message || err)) }));
  const postDeleteCounts = (postDelete as any).counts || {};
  await writeAudit(supabase, {
    adminSubject,
    action: "delete_user_completed",
    targetType: "user",
    targetId: userId,
    requestId,
    previewCounts: preview.counts,
    result: {
      postDeleteCounts,
      storageObjectsAttempted: storageAttempted,
      storageObjectsSucceeded: storageSucceeded,
      storageObjectsFailed: storageFailed,
      userMissingAfterDelete: !!(postDelete as any).userMissingAfterDelete,
    },
  });
  return { deleted: true, postDeleteCounts, storageObjectsAttempted: storageAttempted, storageObjectsSucceeded: storageSucceeded, storageObjectsFailed: storageFailed };
}

Deno.serve(async (req) => {
  const requestDecision = evaluateAdminRequest(req);
  if (!requestDecision.allowed) {
    await recordRejectedAdminRequest(req, requestDecision);
    return json(req, requestDecision.status, {
      ok: false,
      data: null,
      error: {
        code: requestDecision.code,
        message: requestDecision.code === "ADMIN_WRITES_DISABLED"
          ? "Admin writes are disabled during maintenance"
          : "Admin route is not available",
        retryable: false,
      },
      meta: {
        requestId: requestDecision.requestId,
        generatedAt: new Date().toISOString(),
        warnings: [],
      },
    });
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  try {
    const adminSubject = await verifyAdmin(req);
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname.endsWith("/api/snapshot")) {
      const range = String(url.searchParams.get("range") || "7d").match(/^\d+/)?.[0] || "7";
      const surface = String(url.searchParams.get("surface") || "compact").toLowerCase();
      return json(req, 200, { ok: true, snapshot: await snapshot(Number(range), surface) });
    }
    if (req.method === "GET" && url.pathname.endsWith("/api/audit-events")) {
      const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || "50")));
      const actionType = url.searchParams.get("actionType");
      const targetType = url.searchParams.get("targetType");
      const startDate = url.searchParams.get("startDate");
      const endDate = url.searchParams.get("endDate");

      const supabase = serviceClient();
      let query = supabase
        .from("admin_audit_events")
        .select("id,admin_subject_hash,action,target_type,target_id_hash,request_id,preview_counts,result,created_at", { count: "exact" });

      if (actionType) {
        query = query.eq("action", actionType);
      }
      if (targetType) {
        query = query.eq("target_type", targetType);
      }
      if (startDate) {
        query = query.gte("created_at", startDate);
      }
      if (endDate) {
        query = query.lte("created_at", endDate);
      }

      query = query.order("created_at", { ascending: false });
      const from = (page - 1) * limit;
      const to = page * limit - 1;
      const { data, error, count } = await query.range(from, to);
      if (error) throw error;

      return json(req, 200, {
        ok: true,
        events: data || [],
        total: count || 0,
      });
    }
    if (req.method === "POST" && url.pathname.endsWith("/api/trips/amend")) {
      const body = await readBody(req) as any;
      const tripId = body.tripId;
      if (!tripId) throw new Error("Missing tripId");
      const supabase = serviceClient();
      const updates: any = { updated_at: new Date().toISOString() };
      if (body.name !== undefined) updates.name = String(body.name || "").trim() || null;
      if (body.destination_summary !== undefined) updates.destination_summary = String(body.destination_summary || "").trim() || null;
      if (body.start_date !== undefined) {
        const startDate = String(body.start_date || "").trim();
        if (startDate && !DATE_RE.test(startDate)) throw new Error("start_date must be YYYY-MM-DD");
        updates.start_date = startDate || null;
      }
      if (body.end_date !== undefined) {
        const endDate = String(body.end_date || "").trim();
        if (endDate && !DATE_RE.test(endDate)) throw new Error("end_date must be YYYY-MM-DD");
        updates.end_date = endDate || null;
      }
      if (body.trip_currency !== undefined) {
        const tripCurrency = String(body.trip_currency || "").toUpperCase().trim();
        if (tripCurrency && !CURRENCY_RE.test(tripCurrency)) throw new Error("trip_currency must be a 3-letter uppercase code");
        updates.trip_currency = tripCurrency || null;
      }
      if (body.budget_amount !== undefined) {
        if (body.budget_amount === null || body.budget_amount === "") {
          updates.budget_amount = null;
        } else {
          const budgetAmount = Number(body.budget_amount);
          if (!Number.isFinite(budgetAmount) || budgetAmount < 0) throw new Error("budget_amount must be a finite non-negative number");
          updates.budget_amount = budgetAmount;
        }
      }
      if (body.budget_currency !== undefined) {
        const budgetCurrency = String(body.budget_currency || "").toUpperCase().trim();
        if (budgetCurrency && !CURRENCY_RE.test(budgetCurrency)) throw new Error("budget_currency must be a 3-letter uppercase code");
        updates.budget_currency = budgetCurrency || null;
      }
      if (body.active !== undefined) updates.active = Boolean(body.active);
      if (body.archived !== undefined) updates.archived = Boolean(body.archived);

      const { data, error } = await supabase.from("trips").update(updates).eq("id", tripId).select("id").single();
      if (error) throw error;

      await writeAudit(supabase, {
        adminSubject,
        action: "amend_trip",
        targetType: "trip",
        targetId: tripId,
        requestId: crypto.randomUUID(),
        previewCounts: {},
        result: { amended: true, fields: Object.keys(updates).filter((k) => k !== "updated_at") },
      });

      return json(req, 200, { ok: true, tripId: data?.id });
    }
    if (req.method === "POST" && url.pathname.endsWith("/api/trips/members/manage")) {
      const body = await readBody(req) as any;
      const { tripId, userId, action } = body;
      if (!tripId || !userId || !action) throw new Error("Missing tripId, userId, or action");
      if (action !== "add" && action !== "remove") throw new Error("Action must be 'add' or 'remove'");

      const supabase = serviceClient();
      if (action === "add") {
        const { error } = await supabase.from("trip_members").insert({ trip_id: tripId, user_id: userId });
        if (error) {
          if (error.code !== "23505") { // unique violation code
            throw error;
          }
        }
      } else {
        const { error } = await supabase.from("trip_members").delete().eq("trip_id", tripId).eq("user_id", userId);
        if (error) throw error;
      }

      await writeAudit(supabase, {
        adminSubject,
        action: `${action}_trip_member`,
        targetType: "trip",
        targetId: tripId,
        requestId: crypto.randomUUID(),
        previewCounts: {},
        result: { action, userId },
      });

      return json(req, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname.endsWith("/api/receipts/batch-action")) {
      const body = await readBody(req) as any;
      const { receiptIds, action, status } = body;
      if (!Array.isArray(receiptIds) || receiptIds.length === 0) throw new Error("receiptIds must be a non-empty array");
      if (receiptIds.length > 200) throw new Error("Cannot perform batch action on more than 200 receipts at once");
      if (action !== "update_status" && action !== "delete") throw new Error("Action must be 'update_status' or 'delete'");

      const supabase = serviceClient();
      const updates: any = { updated_at: new Date().toISOString() };
      if (action === "update_status") {
        if (!status || !RECEIPT_STATUSES.has(status)) {
          throw new Error(`Status must be one of: ${[...RECEIPT_STATUSES].join(", ")}`);
        }
        updates.status = status;
      } else {
        updates.deleted_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from("receipts")
        .update(updates)
        .in("id", receiptIds)
        .select("id");
      if (error) throw error;
      const affectedCount = data?.length || 0;

      await writeAudit(supabase, {
        adminSubject,
        action: `batch_${action}`,
        targetType: "receipt",
        targetId: receiptIds[0] || "batch",
        requestId: crypto.randomUUID(),
        previewCounts: {},
        result: { action, status, affectedCount },
      });

      return json(req, 200, { ok: true, affectedCount });
    }
    if (req.method === "GET" && url.pathname.endsWith("/api/analytics/timeseries")) {
      const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") || "30")));
      const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const supabase = serviceClient();

      const [usageRes, receiptsRes] = await Promise.all([
        supabase
          .from("app_usage_events")
          .select("created_at,user_id,app_surface,provider,model,metadata")
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: true }),
        supabase
          .from("receipts")
          .select("created_at")
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: true })
      ]);

      if (usageRes.error) throw usageRes.error;
      if (receiptsRes.error) throw receiptsRes.error;

      const usageRows = usageRes.data || [];
      const receiptsRows = receiptsRes.data || [];

      const usageTrendMap = new Map<string, { date: string; eventCount: number; activeUsers: Set<string> }>();
      const aiConsumptionMap = new Map<string, Map<string, number>>();
      const receiptVelocityMap = new Map<string, number>();
      const surfaceBreakdownMap = new Map<string, number>();

      for (let i = days - 1; i >= 0; i--) {
        const dateStr = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        usageTrendMap.set(dateStr, { date: dateStr, eventCount: 0, activeUsers: new Set() });
        aiConsumptionMap.set(dateStr, new Map());
        receiptVelocityMap.set(dateStr, 0);
      }

      for (const row of usageRows) {
        const dateStr = String(row.created_at || "").split("T")[0];
        if (!usageTrendMap.has(dateStr)) continue;

        const trend = usageTrendMap.get(dateStr)!;
        trend.eventCount += 1;
        if (row.user_id) {
          trend.activeUsers.add(row.user_id);
        }

        if (row.provider) {
          const aiMap = aiConsumptionMap.get(dateStr)!;
          let val = 1;
          if (row.metadata && typeof row.metadata === "object") {
            const meta = row.metadata as any;
            if (meta.tokens) val = Number(meta.tokens) || 1;
            else if (meta.total_tokens) val = Number(meta.total_tokens) || 1;
          }
          aiMap.set(row.provider, (aiMap.get(row.provider) || 0) + val);
        }

        if (row.app_surface) {
          const surf = row.app_surface;
          surfaceBreakdownMap.set(surf, (surfaceBreakdownMap.get(surf) || 0) + 1);
        }
      }

      for (const row of receiptsRows) {
        const dateStr = String(row.created_at || "").split("T")[0];
        if (receiptVelocityMap.has(dateStr)) {
          receiptVelocityMap.set(dateStr, receiptVelocityMap.get(dateStr)! + 1);
        }
      }

      const usageTrend = Array.from(usageTrendMap.values()).map(t => ({
        date: t.date,
        events: t.eventCount,
        activeUsers: t.activeUsers.size
      }));

      const aiConsumption: any[] = [];
      for (const [date, providerMap] of aiConsumptionMap.entries()) {
        const entry: any = { date };
        for (const [provider, count] of providerMap.entries()) {
          entry[provider] = count;
        }
        aiConsumption.push(entry);
      }

      const receiptVelocity = Array.from(receiptVelocityMap.entries()).map(([date, count]) => ({
        date,
        count
      }));

      const surfaceBreakdown = Array.from(surfaceBreakdownMap.entries()).map(([surface, count]) => ({
        surface,
        count
      }));

      return json(req, 200, {
        ok: true,
        usageTrend,
        aiConsumption,
        receiptVelocity,
        surfaceBreakdown
      });
    }
    if (req.method === "GET" && url.pathname.endsWith("/api/ai-monitoring/latency-trending")) {
      const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") || "30")));
      const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const supabase = serviceClient();

      const { data: rows, error } = await supabase
        .from("app_usage_events")
        .select("created_at,provider,model,outcome,metadata")
        .not("provider", "is", null)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const events = rows || [];

      const dailyLatency = new Map<string, Map<string, { sumLatency: number; count: number }>>();
      const comparisonMap = new Map<string, {
        provider: string;
        model: string;
        totalRequests: number;
        errorCount: number;
        sumLatency: number;
        latencyCount: number;
      }>();

      for (let i = days - 1; i >= 0; i--) {
        const dateStr = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
        dailyLatency.set(dateStr, new Map());
      }

      for (const row of events) {
        const dateStr = String(row.created_at || "").split("T")[0];
        const provider = row.provider || "unknown";
        const model = row.model || "unknown";
        const outcome = row.outcome || "success";
        
        let latency: number | null = null;
        if (row.metadata && typeof row.metadata === "object") {
          const meta = row.metadata as any;
          const rawLat = meta.latencyMs ?? meta.latency_ms ?? meta.duration ?? meta.durationMs ?? meta.duration_ms;
          if (rawLat != null) {
            latency = Number(rawLat);
          }
        }

        if (dailyLatency.has(dateStr)) {
          const provMap = dailyLatency.get(dateStr)!;
          if (latency != null && Number.isFinite(latency)) {
            const current = provMap.get(provider) || { sumLatency: 0, count: 0 };
            provMap.set(provider, {
              sumLatency: current.sumLatency + latency,
              count: current.count + 1
            });
          }
        }

        const compKey = `${provider}/${model}`;
        if (!comparisonMap.has(compKey)) {
          comparisonMap.set(compKey, {
            provider,
            model,
            totalRequests: 0,
            errorCount: 0,
            sumLatency: 0,
            latencyCount: 0
          });
        }
        const comp = comparisonMap.get(compKey)!;
        comp.totalRequests += 1;
        if (outcome === "error" || outcome === "failed" || outcome === "fail") {
          comp.errorCount += 1;
        }
        if (latency != null && Number.isFinite(latency)) {
          comp.sumLatency += latency;
          comp.latencyCount += 1;
        }
      }

      const latencyTrend: any[] = [];
      for (const [date, provMap] of dailyLatency.entries()) {
        const entry: any = { date };
        for (const [provider, stats] of provMap.entries()) {
          entry[provider] = stats.count > 0 ? Math.round(stats.sumLatency / stats.count) : null;
        }
        latencyTrend.push(entry);
      }

      const providerComparison = Array.from(comparisonMap.values()).map(comp => ({
        provider: comp.provider,
        model: comp.model,
        totalRequests: comp.totalRequests,
        errorRate: comp.totalRequests > 0 ? Number((comp.errorCount / comp.totalRequests).toFixed(4)) : 0,
        avgLatencyMs: comp.latencyCount > 0 ? Math.round(comp.sumLatency / comp.latencyCount) : null
      }));

      return json(req, 200, {
        ok: true,
        latencyTrend,
        providerComparison
      });
    }
    const photoMatch = url.pathname.match(/\/api\/receipts\/([^/]+)\/photo$/);
    if (req.method === "GET" && photoMatch) {
      const receiptId = photoMatch[1];
      const supabase = serviceClient();
      // No .single(): a receipt can have multiple photo rows — .single() errors on >1
      const { data: photoRows, error: photoErr } = await supabase
        .from("receipt_photos")
        .select("storage_path,storage_bucket")
        .eq("receipt_id", receiptId)
        .limit(10);
      const photoRow = (photoRows || [])[0];
      if (photoErr || !photoRow?.storage_path) throw new Error("Receipt photo not found");
      const bucket = photoRow.storage_bucket || "receipt-photos";
      const { data: signed, error: signedError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(photoRow.storage_path, 60);
      if (signedError || !signed?.signedUrl) {
        const error = new Error("Receipt photo signing unavailable") as Error & { status?: number };
        error.status = 502;
        throw error;
      }
      await writeAudit(supabase, {
        adminSubject,
        action: "view_receipt_photo",
        targetType: "receipt",
        targetId: receiptId,
        requestId: crypto.randomUUID(),
        previewCounts: {},
        result: { viewed: true },
      }).catch(() => {});
      return json(req, 200, { ok: true, url: signed.signedUrl });
    }
    if (req.method === "GET" && url.pathname.endsWith("/api/config-health")) {
      const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
      const optional = ["EDGE_BROKER_KEY", "ADMIN_CONSOLE_OWNER_EMAILS", "CREDENTIAL_BROKER_URL", "ADMIN_KANBAN_VERIFY_URL", "ADMIN_KANBAN_LOGIN_URL", "ADMIN_KANBAN_USAGE_USER_ID"];
      const configured: string[] = [];
      const missing: string[] = [];
      const configWarnings: string[] = [];
      for (const key of required) {
        if (Deno.env.get(key)) configured.push(key);
        else missing.push(key);
      }
      for (const key of optional) {
        if (Deno.env.get(key)) configured.push(key);
      }
      if (!Deno.env.get("ADMIN_CONSOLE_OWNER_EMAILS")) configWarnings.push("ADMIN_CONSOLE_OWNER_EMAILS not set; using default allowlist.");
      if (!Deno.env.get("ADMIN_KANBAN_USAGE_USER_ID")) configWarnings.push("ADMIN_KANBAN_USAGE_USER_ID not set; provider test telemetry will not be persisted.");
      return json(req, 200, { ok: true, config: { configured, missing, warnings: configWarnings } });
    }
    if (req.method === "POST" && url.pathname.endsWith("/api/delete-preview")) {
      const body = await readBody(req);
      return json(req, 200, { ok: true, preview: await deletePreview(String((body as any).userId || "")) });
    }
    if (req.method === "POST" && url.pathname.endsWith("/api/delete-user")) {
      const body = await readBody(req) as any;
      const result = await deleteUser(String(body.userId || ""), String(body.confirmPhrase || ""), String(body.adminPassphrase || ""), adminSubject);
      return json(req, 200, { ok: true, result });
    }
    if (req.method === "POST" && url.pathname.endsWith("/api/amend-receipt")) {
      const body = await readBody(req) as any;
      if (!body.receiptId) throw new Error("Missing receiptId");
      const supabase = serviceClient();
      const updates: any = { updated_at: new Date().toISOString() };
      if (body.store !== undefined) {
        const trimmed = String(body.store).trim();
        if (!trimmed) throw new Error("Store name cannot be empty");
        updates.store = trimmed;
      }
      if (body.amount !== undefined) {
        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount < 0) throw new Error("Amount must be a finite non-negative number");
        updates.amount = amount;
      }
      if (body.currency !== undefined) {
        const currency = String(body.currency).toUpperCase().trim();
        if (!CURRENCY_RE.test(currency)) throw new Error("Currency must be a 3-letter uppercase code");
        updates.currency = currency;
      }
      if (body.status !== undefined) {
        const status = String(body.status).trim();
        if (!RECEIPT_STATUSES.has(status)) throw new Error(`Status must be one of: ${[...RECEIPT_STATUSES].join(', ')}`);
        updates.status = status;
      }
      if (body.category !== undefined) {
        const category = String(body.category).trim();
        if (!RECEIPT_CATEGORIES.has(category)) throw new Error(`Category must be one of: ${[...RECEIPT_CATEGORIES].join(', ')}`);
        updates.category = category;
      }
      if (body.payment !== undefined) {
        const payment = String(body.payment).trim();
        if (!RECEIPT_PAYMENTS.has(payment)) throw new Error(`Payment must be one of: ${[...RECEIPT_PAYMENTS].join(', ')}`);
        updates.payment_method = payment;
      }
      if (body.recordDate !== undefined) {
        const recordDate = String(body.recordDate).trim();
        if (!DATE_RE.test(recordDate)) throw new Error("recordDate must be YYYY-MM-DD");
        updates.record_date = recordDate;
      }
      if (body.recordTime !== undefined) {
        const recordTime = String(body.recordTime || "").trim();
        if (recordTime && !TIME_RE.test(recordTime)) throw new Error("recordTime must be HH:MM");
        updates.record_time = recordTime || null;
      }
      // Free-text fields: trim, empty -> null
      for (const [key, column] of [["note", "note"], ["itemsText", "items_text"], ["address", "address"], ["bookingRef", "booking_ref"]] as const) {
        if (body[key] !== undefined) updates[column] = String(body[key] || "").trim() || null;
      }
      if (body.originalAmount !== undefined) {
        const raw = body.originalAmount;
        if (raw === null || raw === "") updates.original_amount = null;
        else {
          const originalAmount = Number(raw);
          if (!Number.isFinite(originalAmount) || originalAmount < 0) throw new Error("originalAmount must be a finite non-negative number");
          updates.original_amount = originalAmount;
        }
      }
      if (body.originalCurrency !== undefined) {
        const originalCurrency = String(body.originalCurrency || "").toUpperCase().trim();
        if (originalCurrency && !CURRENCY_RE.test(originalCurrency)) throw new Error("originalCurrency must be a 3-letter code");
        updates.original_currency = originalCurrency || null;
      }
      if (body.exchangeRate !== undefined) {
        const raw = body.exchangeRate;
        if (raw === null || raw === "") updates.exchange_rate = null;
        else {
          const exchangeRate = Number(raw);
          if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) throw new Error("exchangeRate must be a positive number");
          updates.exchange_rate = exchangeRate;
        }
      }

      const { data, error } = await supabase.from("receipts").update(updates).eq("id", body.receiptId).select("id").single();
      if (error) throw error;
      
      await writeAudit(supabase, {
        adminSubject,
        action: "amend_receipt",
        targetType: "receipt",
        targetId: body.receiptId,
        requestId: crypto.randomUUID(),
        previewCounts: {},
        result: {
          amended: true,
          fields: Object.keys(updates).filter((key) => key !== "updated_at"),
        },
      });
      return json(req, 200, { ok: true, id: data?.id });
    }
    if (req.method === "POST" && url.pathname.endsWith("/api/test-provider")) {
      const body = await readBody(req) as any;
      const provider = String(body.provider || "").trim();
      if (!provider) throw new Error("Missing provider");
      const brokerBase = CREDENTIAL_BROKER_URL.replace(/\/+$/, "");
      const testRes = await fetchWithTimeout(`${brokerBase}/credentials/test?provider=${encodeURIComponent(provider)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://travel-expense-compact.vercel.app',
          'X-Admin-Internal': Deno.env.get('EDGE_BROKER_KEY') || '',
        },
        body: JSON.stringify({ provider }),
      });
      const testData = await testRes.json().catch(() => ({ ok: false, error: "broker returned non-JSON" }));
      // Store test result in app_usage_events for persistence
      const testStatus = testData.status?.status || (testRes.ok ? "unknown" : "error");
      const testMessage = testData.status?.message || testData.error || "";
      const probeSucceeded = providerProbeSucceeded(testRes.status, testData);
      try {
        const supabase = serviceClient();
        const usageUserId = Deno.env.get("ADMIN_KANBAN_USAGE_USER_ID") || "";
        if (usageUserId) {
          await supabase.from("app_usage_events").insert({
            user_id: usageUserId,
            session_id_hash: "admin-console-test",
            event_name: `provider_test_${provider}`,
            provider,
            outcome: probeSucceeded ? "success" : "error",
            metadata: { status: testStatus, message: testMessage },
            app_surface: "admin-kanban",
          });
        }
      } catch (e) { console.warn("Failed to store test result:", e); }
      // Also cache in memory for this instance
      providerTestCache.set(provider, { status: testStatus, message: testMessage, testedAt: Date.now() });
      return json(req, probeSucceeded ? 200 : (testRes.ok ? 502 : testRes.status), {
        ok: probeSucceeded,
        provider,
        status: testData.status || { status: testStatus, message: testMessage },
        error: probeSucceeded ? null : (testMessage || `Provider probe failed with status ${testStatus}`),
      });
    }
    // --- Action Framework ---
    if (req.method === "POST" && url.pathname.endsWith("/api/actions/preview")) {
      const body = await readBody(req) as any;
      if (!body.action || !body.targetType || !body.targetId) throw new Error("Missing action, targetType, targetId");
      const supabase = serviceClient();
      const previewData = body.preview || {};
      const idemKey = body.idempotencyKey || crypto.randomUUID();
      const { data: existing } = await supabase.from("admin_action_requests").select("id, status, preview").eq("idempotency_key", idemKey).limit(1).single();
      if (existing && existing.status === "committed") return json(req, 200, { ok: true, action: existing, reused: true });
      const { data: actionRow, error: insertErr } = await supabase.from("admin_action_requests").insert({
        action: body.action,
        target_type: body.targetType,
        target_id_hash: await hashId(body.targetId),
        admin_subject_hash: await hashId(adminSubject),
        idempotency_key: idemKey,
        preview: previewData,
        payload: body.payload || {},
        reason: body.reason || null,
        status: "previewed",
      }).select("id, action, target_type, status, preview, created_at").single();
      if (insertErr) throw insertErr;
      return json(req, 200, { ok: true, action: actionRow });
    }
    if (req.method === "POST" && url.pathname.endsWith("/api/actions/commit")) {
      const body = await readBody(req) as any;
      if (!body.actionId) throw new Error("Missing actionId");
      const supabase = serviceClient();
      const { data: actionRow, error: fetchErr } = await supabase.from("admin_action_requests").select("*").eq("id", body.actionId).single();
      if (fetchErr || !actionRow) throw new Error("Action not found");
      if (actionRow.status === "committed") return json(req, 200, { ok: true, action: actionRow, reused: true });
      if (actionRow.status !== "previewed") throw new Error(`Action status is ${actionRow.status}, cannot commit`);
      let result: any = {};
      try {
        if (actionRow.action === "retry_sync_job") {
          const jobId = actionRow.payload?.jobId;
          if (jobId) {
            await supabase.from("receipt_sync_jobs").update({ status: "pending", attempts: 0, last_error: null, updated_at: new Date().toISOString() }).eq("id", jobId);
            result = { retried: true, jobId };
          }
        } else if (actionRow.action === "cancel_sync_job") {
          const jobId = actionRow.payload?.jobId;
          if (jobId) {
            await supabase.from("receipt_sync_jobs").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", jobId);
            result = { cancelled: true, jobId };
          }
        } else if (actionRow.action === "reassign_data") {
          const { sourceUserId, targetUserId, tables } = actionRow.payload || {};
          if (!sourceUserId || !targetUserId) throw new Error("Missing source/target user");
          const reassignTables = tables || ["trips", "receipts", "receipt_photos", "receipt_sync_jobs"];
          const reassigned: Record<string, number> = {};
          for (const table of reassignTables) {
            const ownerCol = table === "receipt_sync_jobs" ? "owner_id" : "owner_id";
            const { count } = await supabase.from(table).select("*", { count: "exact", head: true }).eq(ownerCol, sourceUserId);
            await supabase.from(table).update({ owner_id: targetUserId }).eq(ownerCol, sourceUserId);
            reassigned[table] = count || 0;
          }
          await supabase.from("admin_identity_links").upsert({
            primary_user_id: targetUserId,
            linked_user_id: sourceUserId,
            reason: `Reassigned by admin: ${actionRow.reason || 'identity merge'}`,
            admin_subject_hash: await hashId(adminSubject),
          }, { onConflict: "primary_user_id,linked_user_id" });
          result = { reassigned };
        } else {
          result = { note: "Action type not implemented for commit; record only" };
        }
        await supabase.from("admin_action_requests").update({ status: "committed", result, committed_at: new Date().toISOString() }).eq("id", actionRow.id);
        await writeAudit(supabase, { adminSubject, action: `commit_${actionRow.action}`, targetType: actionRow.target_type, targetId: actionRow.target_id_hash, requestId: crypto.randomUUID(), previewCounts: {}, result });
      } catch (commitErr) {
        await supabase.from("admin_action_requests").update({ status: "failed", error: redact(commitErr) }).eq("id", actionRow.id);
        throw commitErr;
      }
      return json(req, 200, { ok: true, action: { ...actionRow, status: "committed", result } });
    }
    const actionIdMatch = url.pathname.match(/\/api\/actions\/([a-f0-9-]+)$/);
    if (req.method === "GET" && actionIdMatch) {
      const supabase = serviceClient();
      const { data, error } = await supabase.from("admin_action_requests").select("*").eq("id", actionIdMatch[1]).single();
      if (error || !data) throw new Error("Action not found");
      return json(req, 200, { ok: true, action: data });
    }
    // --- Sync Jobs ---
    if (req.method === "GET" && url.pathname.endsWith("/api/sync/jobs")) {
      const supabase = serviceClient();
      const statusFilter = url.searchParams.get("status") || undefined;
      const providerFilter = url.searchParams.get("provider") || undefined;
      const userFilter = url.searchParams.get("userId") || undefined;
      const limit = Math.min(Number(url.searchParams.get("limit") || "50"), 200);
      let query = supabase.from("receipt_sync_jobs").select("id,owner_id,provider,status,last_error,attempts,created_at,updated_at").order("updated_at", { ascending: false }).limit(limit);
      if (statusFilter) query = query.eq("status", statusFilter);
      if (providerFilter) query = query.eq("provider", providerFilter);
      if (userFilter) query = query.eq("owner_id", userFilter);
      const { data: jobs, error: jobsErr } = await query;
      if (jobsErr) throw jobsErr;
      return json(req, 200, { ok: true, jobs: jobs || [], total: jobs?.length || 0 });
    }
    // --- Identity Duplicates ---
    if (req.method === "GET" && url.pathname.endsWith("/api/identity/duplicates")) {
      const supabase = serviceClient();
      const { data: allUsers } = await supabase.auth.admin.listUsers({ perPage: 10000 });
      const users = allUsers?.users || [];
      const profilesRes = await fetchRows(supabase, "profiles", "id,display_name,avatar_url", 10000);
      const profileMap = new Map(profilesRes.data.map((p: any) => [p.id, p]));
      const emailGroups = new Map<string, any[]>();
      for (const user of users) {
        const email = (user.email || "").toLowerCase();
        const prefix = email.split("@")[0] || "";
        if (!prefix) continue;
        if (!emailGroups.has(prefix)) emailGroups.set(prefix, []);
        emailGroups.get(prefix)!.push({ id: user.id, email: user.email, displayName: profileMap.get(user.id)?.display_name || null, createdAt: user.created_at });
      }
      const duplicates = [...emailGroups.entries()]
        .filter(([, group]) => group.length > 1)
        .map(([prefix, group]) => ({ prefix, users: group }));
      return json(req, 200, { ok: true, duplicates });
    }
    // --- Runtime Status ---
    if (req.method === "GET" && url.pathname.endsWith("/api/runtime")) {
      const supabase = serviceClient();
      const brokerVersion = await fetchWithTimeout(`${CREDENTIAL_BROKER_URL.replace(/\/+$/, "")}/health`, {}, 3000)
        .then(r => r.json()).then(d => d.version || "unknown").catch(() => "unreachable");
      const edgeDeployId = Deno.env.get("DENO_DEPLOYMENT_ID") || "local";
      // PostgrestBuilder has no .catch(); schema_migrations is not exposed via PostgREST anyway
      let dbSchemaVersion = "unknown";
      try {
        const { data: latestMigration } = await supabase.from("schema_migrations").select("version").order("version", { ascending: false }).limit(1).maybeSingle();
        dbSchemaVersion = (latestMigration as any)?.version || "unknown";
      } catch { /* table not exposed */ }
      const frontendOrigin = new URL(VERIFY_URL).origin;
      const vercelFrontend = await fetchWithTimeout(`${frontendOrigin}/api/health`, {}, 3000)
        .then(r => r.ok ? "healthy" : `error ${r.status}`).catch(() => "unreachable");
      return json(req, 200, {
        ok: true,
        runtime: {
          adminConsoleVersion: "0.7.1",
          edgeDeployId,
          edgeRouteVersion: "2026-07-02",
          brokerVersion,
          vercelFrontend,
          dbSchemaVersion,
          supabaseUrl: "fbnnjoahvtdrnigevrtw",
        },
      });
    }
    // --- Data Doctor ---
    if (req.method === "GET" && url.pathname.endsWith("/api/data-doctor")) {
      const supabase = serviceClient();
      const issues: Array<{ severity: string; category: string; message: string; entityId?: string }> = [];
      const receiptsRes = await fetchRows(supabase, "receipts", "id,trip_id,owner_id,store,amount,currency,status,source_id,notion_sync_status,record_date", 5000);
      const receipts = receiptsRes.data;
      for (const r of receipts) {
        if (!r.trip_id) issues.push({ severity: "high", category: "receipt", message: `Receipt ${r.id} missing trip_id`, entityId: r.id });
        if (!r.owner_id) issues.push({ severity: "high", category: "receipt", message: `Receipt ${r.id} missing owner_id`, entityId: r.id });
        if (r.amount != null && (isNaN(Number(r.amount)) || Number(r.amount) < 0)) issues.push({ severity: "high", category: "receipt", message: `Receipt ${r.id} has invalid amount: ${r.amount}`, entityId: r.id });
        if (r.currency && !/^[A-Z]{3}$/.test(r.currency)) issues.push({ severity: "medium", category: "receipt", message: `Receipt ${r.id} has invalid currency: ${r.currency}`, entityId: r.id });
        if (r.notion_sync_status === "failed") issues.push({ severity: "medium", category: "sync", message: `Receipt ${r.id} Notion sync failed`, entityId: r.id });
        if (r.status === "confirmed" && !r.store) issues.push({ severity: "low", category: "receipt", message: `Confirmed receipt ${r.id} missing store name`, entityId: r.id });
      }
      const tripsRes = await fetchRows(supabase, "trips", "id,owner_id,name,active,archived,start_date,end_date,itinerary", 2000);
      const trips = tripsRes.data;
      for (const t of trips) {
        if (t.active && t.archived) issues.push({ severity: "high", category: "trip", message: `Trip ${t.id} is both active and archived`, entityId: t.id });
      }
      const jobsRes = await fetchRows(supabase, "receipt_sync_jobs", "id,status,last_error,updated_at", 1000);
      const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      for (const j of jobsRes.data) {
        if (j.status === "processing" && j.updated_at && j.updated_at < staleThreshold) {
          issues.push({ severity: "high", category: "sync", message: `Sync job ${j.id} stuck in processing since ${j.updated_at}`, entityId: j.id });
        }
      }
      const photosRes = await fetchRows(supabase, "receipt_photos", "id,receipt_id", 5000);
      const receiptIds = new Set(receipts.map((r: any) => r.id));
      for (const p of photosRes.data) {
        if (p.receipt_id && !receiptIds.has(p.receipt_id)) {
          issues.push({ severity: "low", category: "photo", message: `Orphan photo ${p.id} references missing receipt ${p.receipt_id}`, entityId: p.id });
        }
      }
      const bySeverity = { high: issues.filter(i => i.severity === "high").length, medium: issues.filter(i => i.severity === "medium").length, low: issues.filter(i => i.severity === "low").length };
      return json(req, 200, { ok: true, issues, summary: bySeverity, total: issues.length });
    }
    // --- Notion Mirror Repair (link pages / recover photos / create missing pages) ---
    if (req.method === "POST" && url.pathname.endsWith("/api/notion/repair")) {
      const body = await readBody(req) as any;
      const dryRun = !!body.dryRun;
      const supabase = serviceClient();
      const defaultNotionDb = Deno.env.get("ADMIN_DEFAULT_NOTION_DB") || "3438d94d5f7c81878221fcda6d65d39d";
      const CATEGORY_ZH: Record<string, string> = { flight: "機票", transport: "交通", food: "餐飲", shopping: "購物", lodging: "住宿", ticket: "門票", localtour: "當地旅遊", medicine: "藥品", other: "其他" };
      const PAYMENT_ZH: Record<string, string> = { cash: "現金", credit: "信用卡", paypay: "PayPay", suica: "Suica" };

      const receiptsRes = await fetchRows(supabase, "receipts", "id,trip_id,owner_id,store,amount,currency,category,payment_method,record_date,record_time,note,items_text,address,booking_ref,original_amount,original_currency,exchange_rate,home_amount,source_id,notion_page_id,deleted_at", 10000);
      const receipts = receiptsRes.data.filter((row: any) => !row.deleted_at && row.source_id);
      const tripsRes = await fetchRows(supabase, "trips", "id,name,app_metadata", 500);
      const tripById = new Map(tripsRes.data.map((trip: any) => [trip.id, trip]));
      const photosRes = await fetchRows(supabase, "receipt_photos", "receipt_id,storage_path,storage_bucket", 10000);
      const photoByReceipt = new Map(photosRes.data.map((row: any) => [row.receipt_id, row]));
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://fbnnjoahvtdrnigevrtw.supabase.co";

      // Notion pages: sourceId -> { pageId, photo file URL (fresh signed) }
      const notionPages = new Map<string, { pageId: string; fileUrl: string | null }>();
      let cursor: string | undefined = undefined;
      let guard = 0;
      do {
        const resp: any = await brokerNotionRequest(`/databases/${defaultNotionDb}/query`, "POST", {
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        }, defaultNotionDb);
        for (const page of resp?.results || []) {
          const props = page?.properties || {};
          const src = (props.SourceID?.rich_text || []).map((t: any) => t?.plain_text || "").join("").trim();
          if (!src || src.startsWith("__") || src.startsWith("trip_")) continue;
          let fileUrl: string | null = null;
          const filesProp = props["📷 收據相片"];
          if (filesProp?.type === "files" && filesProp.files?.length) {
            const file = filesProp.files[0];
            fileUrl = file?.file?.url || file?.external?.url || null;
          }
          // Duplicate pages exist (historical double-pushes) — prefer the copy that has a photo
          const existingPage = notionPages.get(src);
          if (!existingPage || (!existingPage.fileUrl && fileUrl)) notionPages.set(src, { pageId: page.id, fileUrl });
        }
        cursor = resp?.has_more ? resp.next_cursor : undefined;
      } while (cursor && ++guard < 30);

      // Phase 1: link notion_page_id where a matching page exists
      let linked = 0;
      for (const receipt of receipts) {
        if (receipt.notion_page_id) continue;
        const page = notionPages.get(String(receipt.source_id));
        if (!page) continue;
        if (!dryRun) {
          await supabase.from("receipts").update({
            notion_page_id: page.pageId,
            notion_database_id: defaultNotionDb,
            notion_sync_status: "synced",
          }).eq("id", receipt.id);
        }
        receipt.notion_page_id = page.pageId;
        linked += 1;
      }

      // Phase 2: recover photos — Notion has the file, Supabase storage does not
      const PHOTO_CAP = 40;
      let photosRecovered = 0;
      let photosFailed = 0;
      let photosRemaining = 0;
      for (const receipt of receipts) {
        if (photoByReceipt.has(receipt.id)) continue;
        const page = notionPages.get(String(receipt.source_id));
        if (!page?.fileUrl) continue;
        if (photosRecovered + photosFailed >= PHOTO_CAP) { photosRemaining += 1; continue; }
        if (dryRun) { photosRecovered += 1; continue; }
        try {
          const imgRes = await fetchWithTimeout(page.fileUrl, {}, 20000);
          if (!imgRes.ok) throw new Error(`fetch ${imgRes.status}`);
          const bytes = new Uint8Array(await imgRes.arrayBuffer());
          if (bytes.length > 6_000_000) throw new Error("photo too large");
          const mime = imgRes.headers.get("content-type")?.split(";")[0] || "image/jpeg";
          const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
          // Unguessable suffix — bucket is public, keys must not be derivable
          const path = `${receipt.owner_id}/${receipt.id}-notionrepair-${crypto.randomUUID().slice(0, 8)}.${ext}`;
          const { error: upErr } = await supabase.storage.from("receipt-photos").upload(path, bytes, { contentType: mime, upsert: true });
          if (upErr) throw upErr;
          const { error: rowErr } = await supabase.from("receipt_photos").insert({
            receipt_id: receipt.id,
            owner_id: receipt.owner_id,
            storage_bucket: "receipt-photos",
            storage_path: path,
            mime_type: mime,
            file_size: bytes.length,
          });
          if (rowErr) throw rowErr;
          photosRecovered += 1;
        } catch (err) {
          console.warn(`photo recovery failed for ${receipt.id}:`, redact(err));
          photosFailed += 1;
        }
      }

      // Phase 3: create Notion pages for receipts with no mirror at all
      const CREATE_CAP = 50;
      let pagesCreated = 0;
      let createFailed = 0;
      let createRemaining = 0;
      for (const receipt of receipts) {
        if (receipt.notion_page_id || notionPages.has(String(receipt.source_id))) continue;
        if (pagesCreated + createFailed >= CREATE_CAP) { createRemaining += 1; continue; }
        if (dryRun) { pagesCreated += 1; continue; }
        try {
          const trip = tripById.get(receipt.trip_id) as any;
          const tripSourceId = trip?.app_metadata?.sourceId || (trip ? `trip_${trip.id}` : "");
          const photoRow = photoByReceipt.get(receipt.id) as any;
          const text = (value: unknown) => ({ rich_text: value ? [{ text: { content: String(value).slice(0, 1900) } }] : [] });
          const properties: Record<string, unknown> = {
            "店名": { title: [{ text: { content: receipt.store || "未命名" } }] },
            "金額": { number: Number(receipt.amount || 0) },
            "日期": receipt.record_date ? { date: { start: receipt.record_date } } : { date: null },
            "類別": { select: { name: CATEGORY_ZH[receipt.category] || "其他" } },
            "支付": { select: { name: PAYMENT_ZH[receipt.payment_method] || "現金" } },
            "Currency": { select: { name: receipt.currency || "JPY" } },
            "SourceID": text(receipt.source_id),
            "TripID": text(tripSourceId),
            "Object Type": { select: { name: "receipt" } },
            "品項": text(receipt.items_text),
            "備註": text(receipt.note),
            "⏰ 時間": text(receipt.record_time ? String(receipt.record_time).slice(0, 5) : ""),
            "🗺️ 地址": text(receipt.address),
            "🎫 Booking Ref": text(receipt.booking_ref),
            "HKD": { number: receipt.home_amount != null ? Number(receipt.home_amount) : null },
            "Original Amount": { number: receipt.original_amount != null ? Number(receipt.original_amount) : null },
            "Original Currency": receipt.original_currency ? { select: { name: receipt.original_currency } } : { select: null },
            "Exchange Rate": { number: receipt.exchange_rate != null ? Number(receipt.exchange_rate) : null },
          };
          if (photoRow?.storage_path) {
            properties["📷 相片 URL"] = { url: `${supabaseUrl}/storage/v1/object/public/${photoRow.storage_bucket || "receipt-photos"}/${photoRow.storage_path}` };
          }
          const created: any = await brokerNotionRequest("/pages", "POST", {
            parent: { database_id: defaultNotionDb },
            properties,
          }, defaultNotionDb);
          if (created?.id) {
            await supabase.from("receipts").update({
              notion_page_id: created.id,
              notion_database_id: defaultNotionDb,
              notion_sync_status: "synced",
            }).eq("id", receipt.id);
            pagesCreated += 1;
          } else {
            createFailed += 1;
          }
        } catch (err) {
          console.warn(`notion page create failed for ${receipt.id}:`, redact(err));
          createFailed += 1;
        }
      }

      await writeAudit(supabase, {
        adminSubject,
        action: "notion_mirror_repair",
        targetType: "notion_db",
        targetId: defaultNotionDb,
        requestId: crypto.randomUUID(),
        previewCounts: {},
        result: { dryRun, linked, photosRecovered, photosFailed, photosRemaining, pagesCreated, createFailed, createRemaining },
      }).catch(() => {});
      return json(req, 200, {
        ok: true,
        dryRun,
        linked,
        photosRecovered,
        photosFailed,
        photosRemaining,
        pagesCreated,
        createFailed,
        createRemaining,
        notionPagesScanned: notionPages.size,
      });
    }
    // --- Notion <-> Supabase Reconciler ---
    if (req.method === "GET" && url.pathname.endsWith("/api/reconcile")) {
      const supabase = serviceClient();
      const tripsRes = await fetchRows(supabase, "trips", "id,name,owner_id,notion_database_id", 500);
      const receiptsRes = await fetchRows(supabase, "receipts", "id,trip_id,source_id,notion_page_id,notion_sync_status,notion_database_id,deleted_at", 10000);
      const receipts = receiptsRes.data.filter((row: any) => !row.deleted_at);
      const receiptsByTrip = groupBy(receipts, "trip_id");
      const userById = new Map((await listUsers(supabase)).map((u: any) => [u.id, u]));
      const results: any[] = [];
      // Same default as compact's DEFAULT_NOTION_DB — trips rarely carry an explicit binding.
      // Multiple trips can share one Notion DB, so cache per-db page ids and compute
      // orphans against the UNION of all Supabase source_ids (per-trip orphan would lie).
      const defaultNotionDb = Deno.env.get("ADMIN_DEFAULT_NOTION_DB") || "3438d94d5f7c81878221fcda6d65d39d";
      const notionCache = new Map<string, { ids: string[] } | { error: string }>();
      async function notionIdsFor(dbId: string) {
        if (!notionCache.has(dbId)) {
          try {
            notionCache.set(dbId, { ids: await notionReceiptSourceIds(dbId) });
          } catch (err) {
            notionCache.set(dbId, { error: redact(err instanceof Error ? err.message : err) });
          }
        }
        return notionCache.get(dbId)!;
      }
      const allSupabaseSourceIds = new Set(receipts.map((row: any) => String(row.source_id || "")).filter(Boolean));
      for (const trip of tripsRes.data) {
        const rows = receiptsByTrip.get(trip.id) || [];
        const dbId = trip.notion_database_id || rows.find((row: any) => row.notion_database_id)?.notion_database_id || defaultNotionDb;
        const supabaseSourceIds = new Set(rows.map((row: any) => String(row.source_id || "")).filter(Boolean));
        const entry: any = {
          tripId: trip.id,
          tripName: trip.name,
          ownerEmail: maskEmail((userById.get(trip.owner_id) as any)?.email),
          notionDatabaseId: dbId,
          supabaseReceipts: rows.length,
          supabaseSyncedToNotion: rows.filter((row: any) => row.notion_page_id).length,
        };
        const notion = await notionIdsFor(dbId);
        if ("error" in notion) {
          entry.status = "notion_unreachable";
          entry.error = notion.error;
        } else {
          const notionSet = new Set(notion.ids);
          const missingInNotion = [...supabaseSourceIds].filter((id) => !notionSet.has(id));
          const orphanInNotion = notion.ids.filter((id) => !allSupabaseSourceIds.has(id));
          entry.notionReceipts = notion.ids.length;
          entry.missingInNotion = missingInNotion.length;
          entry.orphanInNotion = orphanInNotion.length;
          entry.orphanSamples = orphanInNotion.slice(0, 10);
          entry.status = missingInNotion.length === 0 && orphanInNotion.length === 0 ? "balanced" : "mismatch";
        }
        results.push(entry);
      }
      return json(req, 200, { ok: true, generatedAt: new Date().toISOString(), trips: results });
    }
    // --- Support Bundle ---
    if (req.method === "POST" && url.pathname.endsWith("/api/support-bundle")) {
      const body = await readBody(req) as any;
      const supabase = serviceClient();
      const bundle: any = { generatedAt: new Date().toISOString(), requestedBy: adminSubject };
      if (body.userId) {
        const { data: user } = await supabase.auth.admin.getUserById(body.userId).catch(() => ({ data: null }));
        bundle.user = user?.user ? { id: user.user.id, email: maskEmail(user.user.email), createdAt: user.user.created_at, lastSignIn: user.user.last_sign_in_at } : null;
      }
      if (body.tripId) {
        const { data: trip } = await supabase.from("trips").select("id,name,destination_summary,start_date,end_date,trip_currency,active,archived").eq("id", body.tripId).single().catch(() => ({ data: null }));
        bundle.trip = trip;
      }
      if (body.includeJobs) {
        const jobsFilter = supabase.from("receipt_sync_jobs").select("id,provider,status,last_error,attempts,updated_at").order("updated_at", { ascending: false }).limit(20);
        if (body.userId) jobsFilter.eq("owner_id", body.userId);
        const { data: jobs } = await jobsFilter;
        bundle.syncJobs = jobs;
      }
      if (body.includeDoctor) {
        const doctorUrl = new URL(req.url);
        doctorUrl.pathname = doctorUrl.pathname.replace(/\/api\/support-bundle$/, "/api/data-doctor");
        bundle.doctor = { note: "Run /api/data-doctor separately for full results" };
      }
      return json(req, 200, { ok: true, bundle });
    }
    return json(req, 404, { ok: false, error: "Admin KanBan route not found" });
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : error);
    const explicitStatus = Number((error as any)?.status || 0);
    const status = explicitStatus || (/session|auth|login|buffer|byte length|invalid/i.test(message) ? 401 : /confirm phrase|mismatch/i.test(message) ? 400 : /not found/i.test(message) ? 404 : 500);
    return json(req, status, { ok: false, error: message });
  }
});
