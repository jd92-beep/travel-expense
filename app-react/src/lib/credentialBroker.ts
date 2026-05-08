import { ALLOWED_CREDENTIAL_BROKER_URLS, DEFAULT_CREDENTIAL_BROKER_URL } from './constants';
import { loadCredentialSession, saveCredentialSession } from './storage';
import type { AppState } from './types';

export type CredentialProvider = 'notion' | 'kimi' | 'google';

export interface BrokerSession {
  credentialSession: string;
  credentialSessionExpiresAt: number;
}

export interface ProviderStatus {
  provider: CredentialProvider;
  status: 'connected' | 'invalid' | 'expired' | 'missing' | 'unknown';
  updatedAt?: number;
  lastTestedAt?: number;
  message?: string;
}

export interface ConnectionStatus {
  broker: 'online' | 'offline' | 'unknown';
  providers: ProviderStatus[];
}

const SESSION_HEADER = 'X-Travel-Session';

function trimSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export function isAllowedCredentialBrokerUrl(value: unknown): boolean {
  const url = trimSlash(String(value || '').trim());
  return ALLOWED_CREDENTIAL_BROKER_URLS.includes(url as typeof ALLOWED_CREDENTIAL_BROKER_URLS[number]);
}

export function redactedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted-key]')
    .replace(/ntn_[A-Za-z0-9]+/g, '[redacted-token]')
    .replace(/secret_[A-Za-z0-9]+/g, '[redacted-token]')
    .replace(/AIza[0-9A-Za-z_-]+/g, '[redacted-key]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]');
}

export function brokerUrl(state?: Pick<AppState, 'credentialBrokerUrl'>): string {
  const candidate = trimSlash((state?.credentialBrokerUrl || DEFAULT_CREDENTIAL_BROKER_URL).trim());
  return isAllowedCredentialBrokerUrl(candidate) ? candidate : DEFAULT_CREDENTIAL_BROKER_URL;
}

export function currentBrokerSession(state?: Pick<AppState, 'credentialSession' | 'credentialSessionExpiresAt'>): BrokerSession | null {
  const stored = loadCredentialSession();
  const token = state?.credentialSession || stored.credentialSession || '';
  const exp = Number(state?.credentialSessionExpiresAt || stored.credentialSessionExpiresAt || 0);
  if (!token || exp <= Date.now()) return null;
  return { credentialSession: token, credentialSessionExpiresAt: exp };
}

export function hasCredentialBrokerSession(state: Pick<AppState, 'credentialSession' | 'credentialSessionExpiresAt'>): boolean {
  return currentBrokerSession(state) !== null;
}

async function parseBrokerResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(redactedError(`${response.status} ${response.statusText}`));
  }
  if (!response.ok || data?.ok === false) {
    throw new Error(redactedError(data?.error || data?.message || `${response.status} ${response.statusText}`));
  }
  return data as T;
}

async function brokerFetch<T>(
  state: Pick<AppState, 'credentialBrokerUrl' | 'credentialSession' | 'credentialSessionExpiresAt'>,
  path: string,
  body?: unknown,
  requireSession = true,
): Promise<T> {
  const session = currentBrokerSession(state);
  if (requireSession && !session) throw new Error('Credential Broker session 未連線或已過期');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session) headers[SESSION_HEADER] = session.credentialSession;
  const response = await fetch(`${brokerUrl(state)}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseBrokerResponse<T>(response);
}

export async function unlockCredentialBroker(
  password: string,
  state?: Pick<AppState, 'credentialBrokerUrl'>,
): Promise<BrokerSession> {
  const data = await brokerFetch<{ ok: boolean; session: string; expiresAt: number }>(
    state || {},
    '/session/unlock',
    { password },
    false,
  );
  const session = { credentialSession: data.session, credentialSessionExpiresAt: Number(data.expiresAt) || 0 };
  saveCredentialSession(session);
  return session;
}

export async function brokerHealth(state: Pick<AppState, 'credentialBrokerUrl'>): Promise<string> {
  const data = await brokerFetch<{ ok: boolean; service: string; version: string }>(state, '/health', undefined, false);
  return `${data.service || 'Credential Broker'} ${data.version || ''}`.trim();
}

export async function getConnectionStatus(
  state: Pick<AppState, 'credentialBrokerUrl' | 'credentialSession' | 'credentialSessionExpiresAt'>,
): Promise<ConnectionStatus> {
  const data = await brokerFetch<{ ok: boolean; broker: ConnectionStatus['broker']; providers: ProviderStatus[] }>(state, '/credentials/status');
  return { broker: data.broker || 'unknown', providers: data.providers || [] };
}

export async function testProviderConnection(state: AppState, provider: CredentialProvider): Promise<string> {
  const data = await brokerFetch<{ ok: boolean; status: ProviderStatus }>(state, '/credentials/test', { provider });
  return `${provider} ${data.status?.status || 'unknown'}`;
}

export async function testAllProviderConnections(state: AppState): Promise<ProviderStatus[]> {
  const data = await brokerFetch<{ ok: boolean; providers: ProviderStatus[] }>(state, '/credentials/test-all', {});
  return data.providers || [];
}

export async function rotateProviderCredential(
  state: AppState,
  provider: CredentialProvider,
  secret: string,
  adminPassphrase: string,
  extra?: Record<string, unknown>,
): Promise<ProviderStatus> {
  const data = await brokerFetch<{ ok: boolean; status: ProviderStatus }>(state, '/credentials/rotate', {
    provider,
    secret,
    adminPassphrase,
    extra: extra || {},
  });
  return data.status;
}

export async function brokerNotionRequest<T>(state: AppState, path: string, init: RequestInit = {}): Promise<T> {
  let body: unknown;
  if (init.body) {
    try {
      body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    } catch {
      throw new Error('Notion request body 必須係 JSON');
    }
  }
  const data = await brokerFetch<{ ok: boolean; data: T }>(state, '/notion/request', {
    path,
    method: init.method || 'GET',
    body,
    databaseId: state.notionDb || undefined,
  });
  return data.data;
}

export async function brokerAiJson(
  state: AppState,
  provider: 'kimi' | 'google',
  prompt: string,
  kind: 'scan' | 'voice' | 'email' | 'trip' | 'test',
  image?: { base64: string; mime: string },
): Promise<unknown> {
  const data = await brokerFetch<{ ok: boolean; data: unknown }>(state, `/${provider}/json`, {
    prompt,
    kind,
    image,
    model: provider === 'kimi' ? 'kimi-for-coding' : state.googleBackupModel,
  });
  return data.data;
}
