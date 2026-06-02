import type { AdminKanbanSnapshot, AdminSession, DeletePreview } from './types';

const SESSION_KEY = 'travel-expense-admin-kanban:session:v1';

function apiBase(): string {
  return String(import.meta.env.VITE_ADMIN_API_URL || '').replace(/\/+$/, '');
}

function apiUrl(path: string): string {
  const base = apiBase();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
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
  const data = await parseJson<{ ok: boolean; session: AdminSession }>(await fetch(apiUrl('/api/session'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passphrase }),
  }));
  writeStoredSession(data.session);
  return data.session;
}

export async function fetchSnapshot(session: AdminSession, rangeDays: number): Promise<AdminKanbanSnapshot> {
  const params = new URLSearchParams({ range: `${rangeDays}d` });
  const data = await parseJson<{ ok: boolean; snapshot: AdminKanbanSnapshot }>(await fetch(apiUrl(`/api/snapshot?${params}`), {
    headers: { Authorization: `Bearer ${session.token}` },
  }));
  return data.snapshot;
}

export async function previewDeleteUser(session: AdminSession, userId: string): Promise<DeletePreview> {
  const data = await parseJson<{ ok: boolean; preview: DeletePreview }>(await fetch(apiUrl('/api/delete-preview'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.token}`,
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
    await fetch(apiUrl('/api/delete-user'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, confirmPhrase, adminPassphrase }),
    }),
  );
  return data.result;
}
