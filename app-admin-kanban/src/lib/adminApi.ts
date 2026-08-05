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

export const PASSKEY_FOCUS_GUIDANCE = 'Passkey 需要此 Chrome 分頁或視窗有焦點。請返回後再試一次。';

export function ensureWebAuthnFocus() {
  if (!document.hasFocus()) {
    throw new AdminApiError(PASSKEY_FOCUS_GUIDANCE, 'WEBAUTHN_FOCUS_REQUIRED', 409);
  }
}

async function runWebAuthnCeremony<T>(start: () => Promise<T>): Promise<T> {
  ensureWebAuthnFocus();
  try {
    return await start();
  } catch (error) {
    if (error instanceof Error && /page does not have focus/i.test(error.message)) {
      throw new AdminApiError(PASSKEY_FOCUS_GUIDANCE, 'WEBAUTHN_FOCUS_REQUIRED', 409);
    }
    throw error;
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
    const apiError = new AdminApiError(
      typeof error === 'string' ? error : error?.message || payload?.message || `${response.status} ${response.statusText}`,
      error?.code || 'UPSTREAM_UNAVAILABLE',
      response.status,
      payload?.meta?.requestId || response.headers.get('x-admin-request-id') || undefined,
      error?.retryAfterSeconds,
    );
    if (apiError.status === 401) window.dispatchEvent(new Event('admin:unauthorized'));
    throw apiError;
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
  const response = await runWebAuthnCeremony(() => startAuthentication({ optionsJSON: begin.data.options }));
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
  const response = await runWebAuthnCeremony(() => startRegistration({ optionsJSON: begin.data.options }));
  const finish = await request<{ data: any }>('/api/admin/passkeys/enroll/finish', {
    method: 'POST',
    body: { flowId: begin.data.flowId, bootstrapSecret, label, response },
  });
  return sessionFrom(finish.data);
}

export type AdminPasskey = {
  id: string;
  label: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string | null;
  lastUsedAt: string | null;
  removal?: { selector: string; setHash: string; action: string; targetHash: string; previewHash: string };
};

export type AdminPasskeyState = {
  credentials: AdminPasskey[];
  count: number;
  max: number;
  context: { action: string; targetHash: string; previewHash: string };
};

export async function listAdminPasskeys(): Promise<AdminPasskeyState> {
  const payload = await request<{ data: AdminPasskeyState }>('/api/admin/passkeys');
  return payload.data;
}

export async function addBossPasskey(passphrase: string, label: string): Promise<AdminPasskey> {
  const state = await listAdminPasskeys();
  if (state.count < 1 || state.count >= state.max) {
    throw new AdminApiError('備用 passkey enrollment 暫時不可用', 'PROTECTED_TARGET', 403);
  }
  const grant = await reauthenticateAdmin(passphrase, state.context);
  const begin = await request<{ data: { flowId: string; options: any } }>('/api/admin/passkeys/add/begin', {
    method: 'POST',
    body: { grantId: grant.grantId },
  });
  const response = await runWebAuthnCeremony(() => startRegistration({ optionsJSON: begin.data.options }));
  const finish = await request<{ data: { credential: AdminPasskey } }>('/api/admin/passkeys/add/finish', {
    method: 'POST',
    body: { flowId: begin.data.flowId, label, response },
  });
  return finish.data.credential;
}

export type AdminPasskeyRemovalPreview = {
  selector: string;
  setHash: string;
  count: number;
  remainingCount: number;
  target: Omit<AdminPasskey, 'removal'>;
  context: { action: string; targetHash: string; previewHash: string };
};

export async function previewBossPasskeyRemoval(
  removal: NonNullable<AdminPasskey['removal']>,
): Promise<AdminPasskeyRemovalPreview> {
  const payload = await request<{ data: AdminPasskeyRemovalPreview }>('/api/admin/passkeys/remove/preview', {
    method: 'POST',
    body: { selector: removal.selector, setHash: removal.setHash },
  });
  return payload.data;
}

export async function removeBossPasskey(
  passphrase: string,
  preview: AdminPasskeyRemovalPreview,
): Promise<void> {
  const grant = await reauthenticateAdmin(passphrase, preview.context);
  await request('/api/admin/passkeys/remove/commit', {
    method: 'POST',
    body: { selector: preview.selector, setHash: preview.setHash, grantId: grant.grantId },
  });
  clearSession();
}

export async function reauthenticateAdmin(
  passphrase: string,
  context: { action: string; targetHash: string; previewHash: string },
): Promise<{ grantId: string; expiresAt: string }> {
  const begin = await request<{ data: { flowId: string; options: any } }>('/api/admin/reauth/begin', {
    method: 'POST',
    body: { passphrase, ...context },
  });
  const response = await runWebAuthnCeremony(() => startAuthentication({ optionsJSON: begin.data.options }));
  const finish = await request<{ data: { grantId: string; expiresAt: string } }>('/api/admin/reauth/finish', {
    method: 'POST',
    body: { flowId: begin.data.flowId, response },
  });
  return finish.data;
}
