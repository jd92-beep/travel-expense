import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

import type { AdminSession } from './types';

const LEGACY_SESSION_KEY = 'travel-expense-admin-kanban:session:v1';

export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly requestId?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

function csrfToken(): string {
  const prefix = '__Host-admin_csrf=';
  const part = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
  return part ? decodeURIComponent(part.slice(prefix.length)) : '';
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: any;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new AdminApiError('伺服器回應格式無效', 'UPSTREAM_UNAVAILABLE', response.status);
  }
  if (!response.ok || payload?.ok === false) {
    const error = payload?.error;
    throw new AdminApiError(
      typeof error === 'string' ? error : error?.message || payload?.message || `${response.status} ${response.statusText}`,
      error?.code || 'UPSTREAM_UNAVAILABLE',
      response.status,
      payload?.meta?.requestId || response.headers.get('x-admin-request-id') || undefined,
      error?.retryAfterSeconds,
    );
  }
  return payload as T;
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && method !== 'HEAD') {
    const token = csrfToken();
    if (token) headers['X-Admin-CSRF'] = token;
  }
  return parseJson<T>(await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }));
}

function sessionFrom(data: any): AdminSession {
  return {
    adminSubject: String(data.actor || 'boss'),
    authMethod: String(data.authMethod || 'passphrase+passkey'),
    idleExpiresAt: String(data.idleExpiresAt || ''),
    absoluteExpiresAt: String(data.absoluteExpiresAt || ''),
  };
}

export async function currentSession(): Promise<AdminSession | null> {
  window.sessionStorage.removeItem(LEGACY_SESSION_KEY);
  try {
    const payload = await request<{ data: any }>('/api/admin/session');
    return sessionFrom(payload.data);
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) return null;
    throw error;
  }
}

export function clearSession() {
  window.sessionStorage.removeItem(LEGACY_SESSION_KEY);
}

export async function logoutAdmin(): Promise<void> {
  await request('/api/admin/session', { method: 'DELETE' });
  clearSession();
}

export async function loginAdmin(passphrase: string): Promise<AdminSession> {
  const begin = await request<{ data: { flowId: string; options: any } }>('/api/admin/auth/begin', {
    method: 'POST',
    body: { passphrase },
  });
  const response = await startAuthentication({ optionsJSON: begin.data.options });
  const finish = await request<{ data: any }>('/api/admin/auth/finish', {
    method: 'POST',
    body: { flowId: begin.data.flowId, response },
  });
  return sessionFrom(finish.data);
}

export async function enrollBossPasskey(
  passphrase: string,
  bootstrapSecret: string,
  label: string,
): Promise<AdminSession> {
  const begin = await request<{ data: { flowId: string; options: any } }>('/api/admin/passkeys/enroll/begin', {
    method: 'POST',
    body: { passphrase, bootstrapSecret },
  });
  const response = await startRegistration({ optionsJSON: begin.data.options });
  const finish = await request<{ data: any }>('/api/admin/passkeys/enroll/finish', {
    method: 'POST',
    body: { flowId: begin.data.flowId, bootstrapSecret, label, response },
  });
  return sessionFrom(finish.data);
}

export async function reauthenticateAdmin(
  passphrase: string,
  context: { action: string; targetHash: string; previewHash: string },
): Promise<{ grantId: string; expiresAt: string }> {
  const begin = await request<{ data: { flowId: string; options: any } }>('/api/admin/reauth/begin', {
    method: 'POST',
    body: { passphrase, ...context },
  });
  const response = await startAuthentication({ optionsJSON: begin.data.options });
  const finish = await request<{ data: { grantId: string; expiresAt: string } }>('/api/admin/reauth/finish', {
    method: 'POST',
    body: { flowId: begin.data.flowId, response },
  });
  return finish.data;
}
