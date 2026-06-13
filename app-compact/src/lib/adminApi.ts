import { getSupabaseClient } from './supabase';

const ADMIN_BASE = 'https://fbnnjoahvtdrnigevrtw.supabase.co/functions/v1/admin-kanban';

async function adminFetch(path: string, options: RequestInit = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase not configured');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  const res = await fetch(`${ADMIN_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`Admin API ${res.status}: ${res.statusText}`);
  return res.json();
}

export async function fetchAdminSnapshot(range = '7d') {
  return adminFetch(`/api/snapshot?range=${range}`);
}

export async function deletePreview(userId: string) {
  return adminFetch('/api/delete-preview', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function deleteUser(userId: string, confirmPhrase: string) {
  return adminFetch('/api/delete-user', {
    method: 'POST',
    body: JSON.stringify({ userId, confirmPhrase }),
  });
}

export async function amendReceipt(receiptId: string, updates: Record<string, unknown>) {
  return adminFetch('/api/amend-receipt', {
    method: 'POST',
    body: JSON.stringify({ receiptId, ...updates }),
  });
}
