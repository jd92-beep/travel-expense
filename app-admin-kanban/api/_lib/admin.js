import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 2;
const TABLES = [
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
  'admin_audit_events',
];

const COUNT_KEYS = {
  profiles: 'profiles',
  trips: 'trips',
  receipts: 'receipts',
  receipt_items: 'receiptItems',
  receipt_photos: 'receiptPhotos',
  integrations: 'integrations',
  receipt_sync_jobs: 'receiptSyncJobs',
  app_usage_events: 'usageEvents',
  admin_audit_events: 'auditEvents',
};

export function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export function requireMethod(req, res, method) {
  if (req.method !== method) {
    send(res, 405, { ok: false, error: 'Method not allowed' });
    return false;
  }
  return true;
}

export async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return {};
  return JSON.parse(text);
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payload) {
  const secret = process.env.ADMIN_KANBAN_SESSION_SECRET;
  if (!secret) throw new Error('ADMIN_KANBAN_SESSION_SECRET missing');
  const encoded = base64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySession(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new HttpError('Admin session missing', 401);
  const secret = process.env.ADMIN_KANBAN_SESSION_SECRET;
  if (!secret) throw new Error('ADMIN_KANBAN_SESSION_SECRET missing');
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) throw new HttpError('Admin session invalid', 401);
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new HttpError('Admin session invalid', 401);
  }
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (!payload.exp || Number(payload.exp) <= Date.now()) throw new HttpError('Admin session expired', 401);
  return payload;
}

export class HttpError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

function verifyPbkdf2(passphrase, spec) {
  const [kind, iterationsText, saltB64, hashB64] = String(spec || '').split(':');
  if (kind !== 'pbkdf2' || !saltB64 || !hashB64) throw new Error('ADMIN_KANBAN_HASH format invalid');
  const iterations = Number(iterationsText) || 100000;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.pbkdf2Sync(String(passphrase || ''), salt, iterations, expected.length, 'sha256');
  return crypto.timingSafeEqual(actual, expected);
}

export function verifyAdminPassphrase(passphrase) {
  const hash = process.env.ADMIN_KANBAN_HASH;
  if (!hash) throw new Error('ADMIN_KANBAN_HASH missing');
  return verifyPbkdf2(passphrase, hash);
}

export function createAdminSession() {
  const adminSubject = process.env.ADMIN_KANBAN_SUBJECT || 'admin';
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = sign({ sub: adminSubject, iat: Date.now(), exp: expiresAt });
  return { token, adminSubject, expiresAt: new Date(expiresAt).toISOString() };
}

export function supabaseAdmin() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !key) {
    throw new HttpError('Admin Supabase environment is not configured', 503);
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function maskEmail(email) {
  const clean = String(email || '').trim();
  if (!clean || !clean.includes('@')) return 'unknown';
  const [name, host] = clean.split('@');
  const maskedName = name.length <= 2 ? `${name[0] || 'u'}*` : `${name.slice(0, 2)}***`;
  const [domain, ...rest] = host.split('.');
  return `${maskedName}@${domain.slice(0, 1)}***.${rest.join('.') || 'mail'}`;
}

export function hashId(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 24);
}

async function safeCount(supabase, table, column, value) {
  try {
    const query = supabase.from(table).select('*', { count: 'exact', head: true });
    if (column && value) query.eq(column, value);
    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
  } catch {
    return 0;
  }
}

async function listAuthUsers(supabase) {
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

async function fetchRows(supabase, table, select, limit = 250) {
  try {
    const { data, error } = await supabase.from(table).select(select).limit(limit);
    if (error) throw error;
    return data || [];
  } catch {
    return [];
  }
}

async function brokerHealth() {
  const base = String(process.env.CREDENTIAL_BROKER_URL || process.env.VITE_CREDENTIAL_BROKER_URL || '').replace(/\/+$/, '');
  const providers = ['notion', 'kimi', 'google', 'weatherapi', 'mimo'];
  if (!base) {
    return providers.map((provider) => ({
      provider,
      label: providerLabel(provider),
      status: 'unknown',
      storedStatus: 'broker_url_missing',
      model: providerModel(provider),
      lastTestedAt: null,
      errors24h: 0,
    }));
  }
  try {
    const response = await fetch(`${base}/health`);
    if (!response.ok) throw new Error(`broker ${response.status}`);
    return providers.map((provider) => ({
      provider,
      label: providerLabel(provider),
      status: 'healthy',
      storedStatus: 'broker_online',
      model: providerModel(provider),
      lastTestedAt: null,
      errors24h: 0,
    }));
  } catch (error) {
    return providers.map((provider) => ({
      provider,
      label: providerLabel(provider),
      status: 'warning',
      storedStatus: 'broker_unreachable',
      model: providerModel(provider),
      message: redact(error.message),
      errors24h: 0,
    }));
  }
}

function providerLabel(provider) {
  return {
    kimi: 'Kimi',
    google: 'Google Gemma',
    mimo: 'Mimo v2.5',
    weatherapi: 'WeatherAPI',
    notion: 'Notion',
  }[provider] || provider;
}

function providerModel(provider) {
  return {
    kimi: 'kimi-code',
    google: 'gemma-4-31b',
    mimo: 'mimo-v2.5',
    weatherapi: 'forecast',
    notion: 'mirror',
  }[provider];
}

function redact(value) {
  return String(value || '')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted-key]')
    .replace(/ntn_[A-Za-z0-9]+/g, '[redacted-token]')
    .replace(/secret_[A-Za-z0-9]+/g, '[redacted-token]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]');
}

export async function buildSnapshot(rangeDays = 7) {
  const supabase = supabaseAdmin();
  const [users, trips, receipts, integrations, jobs, usage, audits, rlsRpc, llm] = await Promise.all([
    listAuthUsers(supabase),
    fetchRows(supabase, 'trips', 'id,owner_id,name,destination_summary,start_date,end_date,trip_currency,active,archived,updated_at,app_metadata'),
    fetchRows(supabase, 'receipts', 'id,trip_id,owner_id,store,status,amount,currency,record_date,updated_at,notion_page_id,notion_sync_status,notion_last_synced_at'),
    fetchRows(supabase, 'integrations', 'id,user_id,provider,status,last_synced_at'),
    fetchRows(supabase, 'receipt_sync_jobs', 'id,owner_id,provider,status,last_error,created_at,updated_at'),
    fetchRows(supabase, 'app_usage_events', 'user_id,session_id_hash,app_surface,event_name,provider,model,outcome,created_at', 1000),
    fetchRows(supabase, 'admin_audit_events', 'id,admin_subject_hash,action,target_type,target_id_hash,created_at', 50),
    supabase.rpc('admin_kanban_rls_state').catch(() => ({ data: [], error: null })),
    brokerHealth(),
  ]);
  const counts = {
    authUsers: users.length,
    profiles: await safeCount(supabase, 'profiles'),
    trips: await safeCount(supabase, 'trips'),
    receipts: await safeCount(supabase, 'receipts'),
    receiptItems: await safeCount(supabase, 'receipt_items'),
    receiptPhotos: await safeCount(supabase, 'receipt_photos'),
    integrations: await safeCount(supabase, 'integrations'),
    receiptSyncJobs: await safeCount(supabase, 'receipt_sync_jobs'),
    usageEvents: await safeCount(supabase, 'app_usage_events'),
    auditEvents: await safeCount(supabase, 'admin_audit_events'),
  };
  const cutoff = Date.now() - Math.max(1, Number(rangeDays) || 7) * 24 * 60 * 60 * 1000;
  const rangedUsage = usage.filter((event) => Date.parse(event.created_at || '') >= cutoff);
  const userById = new Map(users.map((user) => [user.id, user]));
  const tripsByOwner = groupCount(trips, 'owner_id');
  const receiptsByOwner = groupCount(receipts, 'owner_id');
  const usageByUser = groupBy(rangedUsage, 'user_id');
  const sessionsByUser = new Map();
  for (const [userId, rows] of usageByUser) {
    sessionsByUser.set(userId, new Set(rows.map((row) => row.session_id_hash).filter(Boolean)).size);
  }
  const userCards = users.map((user) => {
    const userUsage = usageByUser.get(user.id) || [];
    const lastSeenAt = userUsage.map((row) => row.created_at).sort().at(-1) || user.last_sign_in_at || null;
    return {
      id: user.id,
      emailMasked: maskEmail(user.email),
      joinedAt: user.created_at || null,
      lastSeenAt,
      sessionCount: sessionsByUser.get(user.id) || 0,
      eventCount: userUsage.length,
      tripCount: tripsByOwner.get(user.id) || 0,
      receiptCount: receiptsByOwner.get(user.id) || 0,
      notionConnected: integrations.some((row) => row.user_id === user.id && row.provider === 'notion' && row.status === 'connected'),
      aiRequestsToday: userUsage.filter((row) => /^ai_request/.test(row.event_name || '')).length,
      health: 'healthy',
    };
  });
  const receiptCountByTrip = groupCount(receipts, 'trip_id');
  const tripCards = trips.map((trip) => {
    const metadata = trip.app_metadata && typeof trip.app_metadata === 'object' ? trip.app_metadata : {};
    const intelligence = metadata.intelligence || {};
    return {
      id: trip.id,
      ownerId: trip.owner_id,
      ownerEmailMasked: maskEmail(userById.get(trip.owner_id)?.email),
      name: trip.name,
      destination: trip.destination_summary || 'Unknown destination',
      dateRange: [trip.start_date, trip.end_date].filter(Boolean).join(' - ') || 'No dates',
      countryCode: intelligence.countryCode || intelligence.country_code || 'GLOBAL',
      currency: trip.trip_currency || intelligence.primaryCurrency || 'JPY',
      active: !!trip.active,
      archived: !!trip.archived,
      receiptCount: receiptCountByTrip.get(trip.id) || 0,
      updatedAt: trip.updated_at || null,
    };
  });
  const receiptCards = receipts.map((receipt) => ({
    id: receipt.id,
    tripId: receipt.trip_id,
    ownerId: receipt.owner_id,
    store: receipt.store,
    status: receipt.status,
    amount: Number(receipt.amount || 0),
    currency: receipt.currency || 'JPY',
    recordDate: receipt.record_date,
    updatedAt: receipt.updated_at || null,
    notionSynced: !!receipt.notion_page_id || receipt.notion_sync_status === 'synced',
  }));
  const bySurface = [...groupBy(rangedUsage, 'app_surface')].map(([surface, rows]) => ({
    surface: surface || 'unknown',
    events: rows.length,
    users: new Set(rows.map((row) => row.user_id).filter(Boolean)).size,
  }));
  const rlsRows = (rlsRpc.data || []).map((row) => ({
    table: row.table_name,
    enabled: !!row.rls_enabled,
    force: !!row.force_rls,
  }));
  const warnings = [];
  if (!counts.usageEvents) warnings.push('Usage telemetry table is ready, but no app usage events have been recorded yet.');
  if (!rlsRows.length) warnings.push('RLS runtime RPC is unavailable until the latest migration is applied.');
  return {
    generatedAt: new Date().toISOString(),
    staleAfterSeconds: 60,
    source: 'live',
    supabase: {
      projectRef: projectRefFromUrl(process.env.SUPABASE_URL),
      status: 'healthy',
      counts,
      rls: rlsRows,
    },
    usage: {
      rangeDays,
      events: rangedUsage.length,
      activeUsers: new Set(rangedUsage.map((row) => row.user_id).filter(Boolean)).size,
      sessions: new Set(rangedUsage.map((row) => row.session_id_hash).filter(Boolean)).size,
      bySurface,
    },
    users: userCards,
    trips: tripCards,
    receipts: receiptCards,
    notion: {
      connectedUsers: new Set(integrations.filter((row) => row.provider === 'notion' && row.status === 'connected').map((row) => row.user_id)).size,
      integrationRows: integrations.length,
      syncedReceipts: receipts.filter((row) => row.notion_page_id || row.notion_sync_status === 'synced').length,
      failedJobs: jobs.filter((row) => row.status === 'failed').length,
      pendingJobs: jobs.filter((row) => ['pending', 'processing'].includes(row.status)).length,
      lastSyncedAt: integrations.map((row) => row.last_synced_at).filter(Boolean).sort().at(-1) || null,
    },
    llm,
    audit: audits.map((row) => ({
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

function groupCount(rows, key) {
  const map = new Map();
  for (const row of rows || []) {
    const value = row?.[key];
    if (!value) continue;
    map.set(value, (map.get(value) || 0) + 1);
  }
  return map;
}

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows || []) {
    const value = row?.[key] || '';
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(row);
  }
  return map;
}

function projectRefFromUrl(url) {
  return String(url || '').match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i)?.[1] || 'unknown';
}

export async function deletePreview(userId) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) throw new HttpError('User not found', 404);
  const counts = {
    authUsers: 1,
    profiles: await safeCount(supabase, 'profiles', 'id', userId),
    trips: await safeCount(supabase, 'trips', 'owner_id', userId),
    tripMembers: await safeCount(supabase, 'trip_members', 'user_id', userId),
    receipts: await safeCount(supabase, 'receipts', 'owner_id', userId),
    receiptItems: await safeCount(supabase, 'receipt_items', 'owner_id', userId),
    receiptPhotos: await safeCount(supabase, 'receipt_photos', 'owner_id', userId),
    integrations: await safeCount(supabase, 'integrations', 'user_id', userId),
    receiptSyncJobs: await safeCount(supabase, 'receipt_sync_jobs', 'owner_id', userId),
    usageEvents: await safeCount(supabase, 'app_usage_events', 'user_id', userId),
    syncAttemptEvents: await safeCount(supabase, 'sync_attempt_events', 'user_id', userId),
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

export async function deleteUser(userId, confirmPhrase, adminPassphrase, adminSubject) {
  if (!verifyAdminPassphrase(adminPassphrase)) throw new HttpError('Admin re-auth failed', 403);
  const preview = await deletePreview(userId);
  if (confirmPhrase !== preview.confirmPhrase) throw new HttpError('Confirm phrase mismatch', 400);
  const supabase = supabaseAdmin();
  const requestId = crypto.randomUUID();
  await writeAudit(supabase, {
    adminSubject,
    action: 'delete_user_started',
    targetType: 'user',
    targetId: userId,
    requestId,
    previewCounts: preview.counts,
    result: { emailMasked: preview.emailMasked },
  });
  const photos = await fetchRows(supabase, 'receipt_photos', 'owner_id,storage_bucket,storage_path', 1000);
  const targetPhotos = photos.filter((row) => row.owner_id === userId && row.storage_bucket && row.storage_path);
  for (const [bucket, rows] of groupBy(targetPhotos, 'storage_bucket')) {
    await supabase.storage.from(bucket).remove(rows.map((row) => row.storage_path)).catch(() => null);
  }
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw error;
  const postDeleteCounts = (await deletePreview(userId).catch(() => null))?.counts || {};
  await writeAudit(supabase, {
    adminSubject,
    action: 'delete_user_completed',
    targetType: 'user',
    targetId: userId,
    requestId,
    previewCounts: preview.counts,
    result: { postDeleteCounts, storageObjectsAttempted: targetPhotos.length },
  });
  return { deleted: true, postDeleteCounts };
}

async function writeAudit(supabase, entry) {
  const { error } = await supabase.from('admin_audit_events').insert({
    admin_subject_hash: hashId(entry.adminSubject),
    action: entry.action,
    target_type: entry.targetType,
    target_id_hash: hashId(entry.targetId),
    request_id: entry.requestId,
    preview_counts: entry.previewCounts,
    result: entry.result,
  });
  if (error) throw new HttpError('Admin audit unavailable', 503);
}

export function fixtureSnapshot() {
  return {
    generatedAt: new Date().toISOString(),
    staleAfterSeconds: 60,
    source: 'fixture',
    supabase: {
      projectRef: 'fbnnjoahvtdrnigevrtw',
      status: 'healthy',
      counts: {
        authUsers: 3,
        profiles: 3,
        trips: 1,
        receipts: 0,
        receiptItems: 0,
        receiptPhotos: 0,
        integrations: 0,
        receiptSyncJobs: 0,
        usageEvents: 0,
        auditEvents: 0,
      },
      rls: TABLES.map((table) => ({ table, enabled: true, force: true })),
    },
    usage: { rangeDays: 7, events: 0, activeUsers: 0, sessions: 0, bySurface: [] },
    users: [
      {
        id: 'fixture-user-1',
        emailMasked: 'vc***@g***.com',
        joinedAt: new Date().toISOString(),
        lastSeenAt: null,
        sessionCount: 0,
        eventCount: 0,
        tripCount: 1,
        receiptCount: 0,
        notionConnected: false,
        aiRequestsToday: 0,
        health: 'healthy',
      },
    ],
    trips: [
      {
        id: 'fixture-trip-1',
        ownerId: 'fixture-user-1',
        ownerEmailMasked: 'vc***@g***.com',
        name: 'Production trip snapshot',
        destination: 'Japan',
        dateRange: '2026-06-02 - 2026-06-02',
        countryCode: 'JP',
        currency: 'JPY',
        active: true,
        archived: false,
        receiptCount: 0,
        updatedAt: new Date().toISOString(),
      },
    ],
    receipts: [],
    notion: { connectedUsers: 0, integrationRows: 0, syncedReceipts: 0, failedJobs: 0, pendingJobs: 0, lastSyncedAt: null },
    llm: ['kimi', 'google', 'mimo', 'weatherapi', 'notion'].map((provider) => ({
      provider,
      label: providerLabel(provider),
      status: 'unknown',
      storedStatus: 'fixture',
      model: providerModel(provider),
      lastTestedAt: null,
      errors24h: 0,
    })),
    audit: [],
    warnings: ['Fixture mode: configure server-side Supabase admin env for live data.'],
  };
}

export async function handler(req, res, fn) {
  try {
    await fn();
  } catch (error) {
    const status = Number(error?.status || 500);
    send(res, status, { ok: false, error: redact(error?.message || error) });
  }
}
