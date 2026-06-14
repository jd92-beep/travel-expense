import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.0";

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
  const adminToken = Deno.env.get("ADMIN_TOKEN") || "";

  // Path 0: Custom admin token via X-Admin-Token header (check FIRST, before Authorization)
  const adminHeader = req.headers.get("x-admin-token") || "";
  if (adminToken && adminHeader === adminToken) {
    return "admin-token";
  }

  // Path 0.5: HMAC session token via X-Admin-Token header
  if (adminHeader && adminHeader !== adminToken) {
    try {
      const verifyRes = await fetch(VERIFY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminHeader}` },
      });
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (verifyRes.ok && verifyData?.ok !== false) {
        return String(verifyData.adminSubject || "hmac-admin");
      }
    } catch { /* fall through */ }
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

async function fetchRows(supabase: SupabaseClientAny, table: string, select: string, limit = 250) {
  const PAGE_SIZE = 1000;
  const MAX_ROWS = 10000;
  const effectiveLimit = Math.min(limit, MAX_ROWS);
  try {
    const allRows: any[] = [];
    let from = 0;
    while (from < effectiveLimit) {
      const pageSize = Math.min(PAGE_SIZE, effectiveLimit - from);
      const { data, error } = await supabase.from(table).select(select).range(from, from + pageSize - 1);
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
    const statusRes = await fetch(`${baseUrl}/credentials/status`, {
      headers: {
        'Origin': 'https://travel-expense-compact.vercel.app',
        'X-Admin-Internal': Deno.env.get('ADMIN_TOKEN') || '',
      },
    });
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
        if (row.outcome === "error" && !row.event_name?.startsWith("provider_test_")) {
          errorMap.set(row.provider, (errorMap.get(row.provider) || 0) + 1);
        }
      }
    } catch { /* ignore */ }

    return brokerProviders.map((p: any) => {
      const provider = p.provider || p.name || "";
      // Expand provider into individual model entries
      const models = providerModels(provider);
      return models.map((modelEntry: any) => ({
        provider,
        label: p.label || providerLabel(provider),
        status: p.hasKey || p.status === "connected" ? "healthy" : "warning",
        storedStatus: p.status || (p.hasKey ? "connected" : "missing"),
        model: modelEntry.id,
        modelName: modelEntry.name,
        lastTestedAt: p.lastTestedAt || p.last_tested_at || null,
        errors24h: errorMap.get(provider) || 0,
      }));
    }).flat();
  } catch {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (!response.ok) throw new Error(`broker ${response.status}`);
      const fallback = ["notion", "kimi", "google", "weatherapi", "mimo"];
      return fallback.map((provider) => ({
        provider,
        label: providerLabel(provider),
        status: "healthy",
        storedStatus: "broker_online",
        model: providerModel(provider),
        lastTestedAt: null,
        errors24h: 0,
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

async function snapshot(rangeDays: number) {
  const supabase = serviceClient();
  const [
    users,
    tripsRes, receiptsRes, photosRes, integrationsRes, jobsRes, usageRes, auditsRes,
    rlsRpc, llm, profilesRes, tripMembersRes,
  ] = await Promise.all([
    listUsers(supabase),
    fetchRows(supabase, "trips", "id,owner_id,name,destination_summary,start_date,end_date,trip_currency,budget_amount,budget_currency,itinerary,timezones,active,archived,updated_at,app_metadata"),
    fetchRows(supabase, "receipts", "id,trip_id,owner_id,store,status,amount,currency,category,record_date,updated_at,notion_page_id,notion_sync_status,notion_last_synced_at", 1000),
    fetchRows(supabase, "receipt_photos", "id,receipt_id,owner_id,storage_path"),
    fetchRows(supabase, "integrations", "id,user_id,provider,status,last_synced_at"),
    fetchRows(supabase, "receipt_sync_jobs", "id,owner_id,provider,status,last_error,created_at,updated_at"),
    fetchRows(supabase, "app_usage_events", "user_id,session_id_hash,app_surface,event_name,provider,model,outcome,created_at", 1000),
    fetchRows(supabase, "admin_audit_events", "id,admin_subject_hash,action,target_type,target_id_hash,created_at", 50),
    safeRlsState(supabase),
    brokerHealth(supabase),
    fetchRows(supabase, "profiles", "id,display_name,avatar_url,home_currency,locale"),
    fetchRows(supabase, "trip_members", "trip_id,user_id"),
  ]);
  const trips = tripsRes.data;
  const receipts = receiptsRes.data;
  const photos = photosRes.data;
  const integrations = integrationsRes.data;
  const jobs = jobsRes.data;
  const usage = usageRes.data;
  const audits = auditsRes.data;
  const profiles = profilesRes.data;
  const tripMembers = tripMembersRes.data;

  const warnings: string[] = [];
  const tableReads = [
    { name: "Trips", res: tripsRes },
    { name: "Receipts", res: receiptsRes },
    { name: "Photos", res: photosRes },
    { name: "Integrations", res: integrationsRes },
    { name: "Sync jobs", res: jobsRes },
    { name: "Usage events", res: usageRes },
    { name: "Audit events", res: auditsRes },
    { name: "Profiles", res: profilesRes },
    { name: "Trip members", res: tripMembersRes },
  ];
  for (const { name, res } of tableReads) {
    if (res.error) warnings.push(`${name} read failed: ${res.error}`);
    if (res.truncated) warnings.push(`${name} read hit max row cap; counts may be partial.`);
  }

  const counts = {
    authUsers: users.length,
    profiles: await safeCount(supabase, "profiles"),
    trips: await safeCount(supabase, "trips"),
    receipts: await safeCount(supabase, "receipts"),
    receiptItems: await safeCount(supabase, "receipt_items"),
    receiptPhotos: await safeCount(supabase, "receipt_photos"),
    integrations: await safeCount(supabase, "integrations"),
    receiptSyncJobs: await safeCount(supabase, "receipt_sync_jobs"),
    usageEvents: await safeCount(supabase, "app_usage_events"),
    auditEvents: await safeCount(supabase, "admin_audit_events"),
  };
  const cutoff = Date.now() - Math.max(1, Number(rangeDays) || 7) * 24 * 60 * 60 * 1000;
  const rangedUsage = usage.filter((event: any) => Date.parse(event.created_at || "") >= cutoff);
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
      amount: Number(receipt.amount || 0),
      currency: receipt.currency || "JPY",
      recordDate: receipt.record_date,
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
  const warningsSnapshot: string[] = warnings;
  if (!counts.usageEvents) warningsSnapshot.push("Usage telemetry table is ready, but no app usage events have been recorded yet.");
  if (!rlsRows.length) warningsSnapshot.push("RLS runtime RPC is unavailable.");
  return {
    generatedAt: new Date().toISOString(),
    staleAfterSeconds: 60,
    source: "live-edge",
    supabase: {
      projectRef: "fbnnjoahvtdrnigevrtw",
      status: "healthy",
      counts,
      rls: rlsRows,
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
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  try {
    const adminSubject = await verifyAdmin(req);
    const url = new URL(req.url);
    if (req.method === "GET" && url.pathname.endsWith("/api/snapshot")) {
      const range = String(url.searchParams.get("range") || "7d").match(/^\d+/)?.[0] || "7";
      return json(req, 200, { ok: true, snapshot: await snapshot(Number(range)) });
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
        updates.category = body.category;
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
      const testRes = await fetch(`${brokerBase}/credentials/test?provider=${encodeURIComponent(provider)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://travel-expense-compact.vercel.app',
          'X-Admin-Internal': Deno.env.get('ADMIN_TOKEN') || '',
        },
        body: JSON.stringify({ provider }),
      });
      const testData = await testRes.json().catch(() => ({ ok: false, error: "broker returned non-JSON" }));
      // Store test result in app_usage_events for persistence
      const testStatus = testData.status?.status || (testRes.ok ? "connected" : "error");
      const testMessage = testData.status?.message || testData.error || "";
      try {
        const supabase = serviceClient();
        const usageUserId = Deno.env.get("ADMIN_KANBAN_USAGE_USER_ID") || "";
        if (usageUserId) {
          await supabase.from("app_usage_events").insert({
            user_id: usageUserId,
            session_id_hash: "admin-console-test",
            event_name: `provider_test_${provider}`,
            provider,
            outcome: testStatus === "connected" ? "success" : "error",
            metadata: { status: testStatus, message: testMessage },
            app_surface: "admin-kanban",
          });
        }
      } catch (e) { console.warn("Failed to store test result:", e); }
      // Also cache in memory for this instance
      providerTestCache.set(provider, { status: testStatus, message: testMessage, testedAt: Date.now() });
      return json(req, testRes.ok ? 200 : testRes.status, { ok: testRes.ok, provider, ...testData });
    }
    return json(req, 404, { ok: false, error: "Admin KanBan route not found" });
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : error);
    const explicitStatus = Number((error as any)?.status || 0);
    const status = explicitStatus || (/session|auth|login/i.test(message) ? 401 : /confirm phrase|mismatch/i.test(message) ? 400 : /not found/i.test(message) ? 404 : 500);
    return json(req, status, { ok: false, error: message });
  }
});
