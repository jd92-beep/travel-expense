import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.87.0";

type SupabaseClientAny = ReturnType<typeof createClient>;

const VERIFY_URL = Deno.env.get("ADMIN_KANBAN_VERIFY_URL") || "https://travel-expense-admin-kanban.vercel.app/api/verify-session";
const LOGIN_URL = Deno.env.get("ADMIN_KANBAN_LOGIN_URL") || "https://travel-expense-admin-kanban.vercel.app/api/session";
const CREDENTIAL_BROKER_URL = Deno.env.get("CREDENTIAL_BROKER_URL") || "https://travel-expense-credential-broker.ftjdfr.workers.dev";
const ALLOWED_ORIGINS = new Set([
  "https://travel-expense-admin-kanban.vercel.app",
  "http://localhost:8904",
  "http://127.0.0.1:8904",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://travel-expense-admin-kanban.vercel.app",
    "Access-Control-Allow-Headers": "authorization, content-type",
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
  const text = await req.text();
  return text.trim() ? JSON.parse(text) : {};
}

async function verifyAdmin(req: Request) {
  const auth = req.headers.get("authorization") || "";
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
  const clean = String(email || "").trim();
  if (!clean || !clean.includes("@")) return "unknown";
  const [name, host] = clean.split("@");
  const maskedName = name.length <= 2 ? `${name[0] || "u"}*` : `${name.slice(0, 2)}***`;
  const [domain, ...rest] = host.split(".");
  return `${maskedName}@${domain.slice(0, 1)}***.${rest.join(".") || "mail"}`;
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

async function fetchRows(supabase: SupabaseClientAny, table: string, select: string, limit = 250) {
  try {
    const { data, error } = await supabase.from(table).select(select).limit(limit);
    if (error) throw error;
    return data || [];
  } catch {
    return [];
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

async function brokerHealth() {
  const providers = ["notion", "kimi", "google", "weatherapi", "mimo"];
  try {
    const response = await fetch(`${CREDENTIAL_BROKER_URL.replace(/\/+$/, "")}/health`);
    if (!response.ok) throw new Error(`broker ${response.status}`);
    return providers.map((provider) => ({
      provider,
      label: providerLabel(provider),
      status: "healthy",
      storedStatus: "broker_online",
      model: providerModel(provider),
      lastTestedAt: null,
      errors24h: 0,
    }));
  } catch (error) {
    return providers.map((provider) => ({
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

async function snapshot(rangeDays: number) {
  const supabase = serviceClient();
  const [users, trips, receipts, photos, integrations, jobs, usage, audits, rlsRpc, llm] = await Promise.all([
    listUsers(supabase),
    fetchRows(supabase, "trips", "id,owner_id,name,destination_summary,start_date,end_date,trip_currency,active,archived,updated_at,app_metadata"),
    fetchRows(supabase, "receipts", "id,trip_id,owner_id,store,status,amount,currency,record_date,updated_at,notion_page_id,notion_sync_status,notion_last_synced_at"),
    fetchRows(supabase, "receipt_photos", "id,owner_id"),
    fetchRows(supabase, "integrations", "id,user_id,provider,status,last_synced_at"),
    fetchRows(supabase, "receipt_sync_jobs", "id,owner_id,provider,status,last_error,created_at,updated_at"),
    fetchRows(supabase, "app_usage_events", "user_id,session_id_hash,app_surface,event_name,provider,model,outcome,created_at", 1000),
    fetchRows(supabase, "admin_audit_events", "id,admin_subject_hash,action,target_type,target_id_hash,created_at", 50),
    safeRlsState(supabase),
    brokerHealth(),
  ]);
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
  const tripsByOwner = groupCount(trips, "owner_id");
  const receiptsByOwner = groupCount(receipts, "owner_id");
  const photosByOwner = groupCount(photos, "owner_id");
  const usageByUser = groupBy(rangedUsage, "user_id");
  const userCards = users.map((user: any) => {
    const userUsage = usageByUser.get(user.id) || [];
    const lastSeenAt = userUsage.map((row) => row.created_at).sort().at(-1) || user.last_sign_in_at || null;
    return {
      id: user.id,
      emailMasked: maskEmail(user.email),
      joinedAt: user.created_at || null,
      lastSeenAt,
      sessionCount: new Set(userUsage.map((row) => row.session_id_hash).filter(Boolean)).size,
      eventCount: userUsage.length,
      tripCount: tripsByOwner.get(user.id) || 0,
      receiptCount: receiptsByOwner.get(user.id) || 0,
      imageCount: photosByOwner.get(user.id) || 0,
      notionConnected: integrations.some((row: any) => row.user_id === user.id && row.provider === "notion" && row.status === "connected"),
      aiRequestsToday: userUsage.filter((row) => /^ai_request/.test(row.event_name || "")).length,
      health: "healthy",
    };
  });
  const receiptCountByTrip = groupCount(receipts, "trip_id");
  const tripCards = trips.map((trip: any) => {
    const metadata = trip.app_metadata && typeof trip.app_metadata === "object" ? trip.app_metadata : {};
    const intelligence = metadata.intelligence || {};
    return {
      id: trip.id,
      ownerId: trip.owner_id,
      ownerEmailMasked: maskEmail((userById.get(trip.owner_id) as any)?.email),
      name: trip.name,
      destination: trip.destination_summary || "Unknown destination",
      dateRange: [trip.start_date, trip.end_date].filter(Boolean).join(" - ") || "No dates",
      countryCode: intelligence.countryCode || intelligence.country_code || "GLOBAL",
      currency: trip.trip_currency || intelligence.primaryCurrency || "JPY",
      active: !!trip.active,
      archived: !!trip.archived,
      receiptCount: receiptCountByTrip.get(trip.id) || 0,
      updatedAt: trip.updated_at || null,
    };
  });
  const receiptCards = receipts.map((receipt: any) => ({
    id: receipt.id,
    tripId: receipt.trip_id,
    ownerId: receipt.owner_id,
    store: receipt.store,
    status: receipt.status,
    amount: Number(receipt.amount || 0),
    currency: receipt.currency || "JPY",
    recordDate: receipt.record_date,
    updatedAt: receipt.updated_at || null,
    notionSynced: !!receipt.notion_page_id || receipt.notion_sync_status === "synced",
  }));
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
  const warnings = [];
  if (!counts.usageEvents) warnings.push("Usage telemetry table is ready, but no app usage events have been recorded yet.");
  if (!rlsRows.length) warnings.push("RLS runtime RPC is unavailable.");
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
    warnings,
  };
}

async function deletePreview(userId: string) {
  const supabase = serviceClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) throw new Error("User not found");
  const counts = {
    authUsers: 1,
    profiles: await safeCount(supabase, "profiles", "id", userId),
    trips: await safeCount(supabase, "trips", "owner_id", userId),
    tripMembers: await safeCount(supabase, "trip_members", "user_id", userId),
    receipts: await safeCount(supabase, "receipts", "owner_id", userId),
    receiptItems: await safeCount(supabase, "receipt_items", "owner_id", userId),
    receiptPhotos: await safeCount(supabase, "receipt_photos", "owner_id", userId),
    integrations: await safeCount(supabase, "integrations", "user_id", userId),
    receiptSyncJobs: await safeCount(supabase, "receipt_sync_jobs", "owner_id", userId),
    usageEvents: await safeCount(supabase, "app_usage_events", "user_id", userId),
    syncAttemptEvents: await safeCount(supabase, "sync_attempt_events", "user_id", userId),
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
  if (error) throw new Error("Admin audit unavailable");
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
  const photos = await fetchRows(supabase, "receipt_photos", "owner_id,storage_bucket,storage_path", 1000);
  const targetPhotos = photos.filter((row: any) => row.owner_id === userId && row.storage_bucket && row.storage_path);
  for (const [bucket, rows] of groupBy(targetPhotos, "storage_bucket")) {
    await supabase.storage.from(bucket).remove(rows.map((row: any) => row.storage_path)).catch(() => null);
  }
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw error;
  const postDeleteCounts = (await deletePreview(userId).catch(() => null))?.counts || {};
  await writeAudit(supabase, {
    adminSubject,
    action: "delete_user_completed",
    targetType: "user",
    targetId: userId,
    requestId,
    previewCounts: preview.counts,
    result: { postDeleteCounts, storageObjectsAttempted: targetPhotos.length },
  });
  return { deleted: true, postDeleteCounts };
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
    return json(req, 404, { ok: false, error: "Admin KanBan route not found" });
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : error);
    const status = /session|auth|login/i.test(message) ? 401 : /confirm phrase|mismatch/i.test(message) ? 400 : /not found/i.test(message) ? 404 : 500;
    return json(req, status, { ok: false, error: message });
  }
});
