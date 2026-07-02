import type { AdminKanbanSnapshot, AdminSession, DeletePreview, SurfaceScope } from './types';

const SESSION_KEY = 'travel-expense-admin-kanban:session:v1';

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZibm5qb2FodnRkcm5pZ2V2cnR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDY5OTksImV4cCI6MjA5NTI4Mjk5OX0.iDibnjCXwlwxeb1mAWy69RRh5gflh9pEsBIOI-P5INM';

function apiBase(): string {
  return String(import.meta.env.VITE_ADMIN_API_URL || 'https://fbnnjoahvtdrnigevrtw.supabase.co/functions/v1/admin-kanban').replace(/\/+$/, '');
}

function adminDataUrl(path: string): string {
  const base = apiBase();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

function sessionUrl(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function readStoredSession(): AdminSession | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminSession;
    if (!parsed.token || Date.parse(parsed.expiresAt) <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredSession(session: AdminSession | null) {
  if (!session) {
    window.sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || data?.message || `${response.status} ${response.statusText}`);
  }
  return data as T;
}

export function currentSession(): AdminSession | null {
  return readStoredSession();
}

export function clearSession() {
  writeStoredSession(null);
}

export async function loginAdmin(passphrase: string): Promise<AdminSession> {
  const data = await parseJson<{ ok: boolean; session: AdminSession }>(await fetch(sessionUrl('/api/session'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passphrase }),
  }));
  writeStoredSession(data.session);
  return data.session;
}

export async function fetchSnapshot(session: AdminSession, rangeDays: number, surface: SurfaceScope = 'compact'): Promise<AdminKanbanSnapshot> {
  const params = new URLSearchParams({ range: `${rangeDays}d`, surface });
  const data = await parseJson<{ ok: boolean; snapshot: AdminKanbanSnapshot }>(await fetch(adminDataUrl(`/api/snapshot?${params}`), {
    headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'X-Admin-Token': session.token },
  }));
  return data.snapshot;
}

export async function previewDeleteUser(session: AdminSession, userId: string): Promise<DeletePreview> {
  const data = await parseJson<{ ok: boolean; preview: DeletePreview }>(await fetch(adminDataUrl('/api/delete-preview'), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'X-Admin-Token': session.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId }),
  }));
  return data.preview;
}

export async function confirmDeleteUser(
  session: AdminSession,
  userId: string,
  confirmPhrase: string,
  adminPassphrase: string,
): Promise<{ deleted: boolean; postDeleteCounts: Record<string, number> }> {
  const data = await parseJson<{ ok: boolean; result: { deleted: boolean; postDeleteCounts: Record<string, number> } }>(
    await fetch(adminDataUrl('/api/delete-user'), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'X-Admin-Token': session.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, confirmPhrase, adminPassphrase }),
    }),
  );
  return data.result;
}

export async function amendReceipt(
  session: AdminSession,
  receiptId: string,
  updates: {
    store?: string; amount?: number; currency?: string; status?: string; category?: string;
    payment?: string; recordDate?: string; recordTime?: string;
    note?: string; itemsText?: string; address?: string; bookingRef?: string;
    originalAmount?: number | null; originalCurrency?: string | null; exchangeRate?: number | null;
  }
): Promise<{ id: string }> {
  const data = await parseJson<{ ok: boolean; id: string }>(
    await fetch(adminDataUrl('/api/amend-receipt'), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'X-Admin-Token': session.token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ receiptId, ...updates }),
    }),
  );
  return data;
}

export async function testProvider(session: AdminSession, provider: string): Promise<{ ok: boolean; provider: string; status?: { status: string; message?: string } }> {
  const data = await parseJson<any>(await fetch(adminDataUrl('/api/test-provider'), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'X-Admin-Token': session.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ provider }),
  }));
  return data;
}

export async function fetchReceiptPhoto(session: AdminSession, receiptId: string): Promise<{ url: string }> {
  const data = await parseJson<{ ok: boolean; url: string }>(await fetch(adminDataUrl(`/api/receipts/${encodeURIComponent(receiptId)}/photo`), {
    headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'X-Admin-Token': session.token },
  }));
  return { url: data.url };
}

export async function fetchConfigHealth(session: AdminSession): Promise<{ configured: string[]; missing: string[]; warnings: string[] }> {
  const data = await parseJson<{ ok: boolean; config: { configured: string[]; missing: string[]; warnings: string[] } }>(await fetch(adminDataUrl('/api/config-health'), {
    headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'X-Admin-Token': session.token },
  }));
  return data.config;
}

export async function previewAction(session: AdminSession, params: { action: string; targetType: string; targetId: string; preview?: any; payload?: any; reason?: string; idempotencyKey?: string }): Promise<any> {
  const data = await parseJson<any>(await fetch(adminDataUrl('/api/actions/preview'), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'X-Admin-Token': session.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }));
  return data.action;
}

export async function commitAction(session: AdminSession, actionId: string): Promise<any> {
  const data = await parseJson<any>(await fetch(adminDataUrl('/api/actions/commit'), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'X-Admin-Token': session.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ actionId }),
  }));
  return data.action;
}

export async function fetchSyncJobs(session: AdminSession, params?: { status?: string; provider?: string; userId?: string; limit?: number }): Promise<any[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.provider) qs.set('provider', params.provider);
  if (params?.userId) qs.set('userId', params.userId);
  if (params?.limit) qs.set('limit', String(params.limit));
  const data = await parseJson<{ ok: boolean; jobs: any[] }>(await fetch(adminDataUrl(`/api/sync/jobs?${qs}`), {
    headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'X-Admin-Token': session.token },
  }));
  return data.jobs;
}

export async function fetchIdentityDuplicates(session: AdminSession): Promise<Array<{ prefix: string; users: any[] }>> {
  const data = await parseJson<{ ok: boolean; duplicates: Array<{ prefix: string; users: any[] }> }>(await fetch(adminDataUrl('/api/identity/duplicates'), {
    headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'X-Admin-Token': session.token },
  }));
  return data.duplicates;
}

export async function fetchRuntime(session: AdminSession): Promise<any> {
  const data = await parseJson<{ ok: boolean; runtime: any }>(await fetch(adminDataUrl('/api/runtime'), {
    headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'X-Admin-Token': session.token },
  }));
  return data.runtime;
}

export async function fetchDataDoctor(session: AdminSession): Promise<{ issues: any[]; summary: { high: number; medium: number; low: number }; total: number }> {
  const data = await parseJson<{ ok: boolean; issues: any[]; summary: { high: number; medium: number; low: number }; total: number }>(await fetch(adminDataUrl('/api/data-doctor'), {
    headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'X-Admin-Token': session.token },
  }));
  return { issues: data.issues, summary: data.summary, total: data.total };
}

export async function fetchReconcile(session: AdminSession): Promise<{ generatedAt: string; trips: import('./types').ReconcileTripEntry[] }> {
  const data = await parseJson<{ ok: boolean; generatedAt: string; trips: import('./types').ReconcileTripEntry[] }>(await fetch(adminDataUrl('/api/reconcile'), {
    headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'X-Admin-Token': session.token },
  }));
  return { generatedAt: data.generatedAt, trips: data.trips };
}

export async function runNotionRepair(session: AdminSession, dryRun = false): Promise<{
  linked: number; photosRecovered: number; photosFailed: number; photosRemaining: number;
  pagesCreated: number; createFailed: number; createRemaining: number; notionPagesScanned: number; dryRun: boolean;
}> {
  const data = await parseJson<any>(await fetch(adminDataUrl('/api/notion/repair'), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'X-Admin-Token': session.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dryRun }),
  }));
  return data;
}

export async function fetchSupportBundle(session: AdminSession, params: { userId?: string; tripId?: string; includeJobs?: boolean; includeDoctor?: boolean }): Promise<any> {
  const data = await parseJson<{ ok: boolean; bundle: any }>(await fetch(adminDataUrl('/api/support-bundle'), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'X-Admin-Token': session.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  }));
  return data.bundle;
}
