import { ALLOWED_CREDENTIAL_BROKER_URLS, DEFAULT_CREDENTIAL_BROKER_URL } from './constants';
import { loadCredentialSession, saveCredentialSession } from './storage';
import { currentSupabaseAccessToken } from './supabase';
import type { AppState } from './types';

export type CredentialProvider = 'notion' | 'kimi' | 'google';

export interface BrokerSession {
  credentialSession: string;
  credentialSessionExpiresAt: number;
  device?: TrustedBrokerDevice;
}

export interface TrustedBrokerDevice {
  deviceId: string;
  deviceName?: string;
  createdAt?: number;
  expiresAt: number;
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

export interface PersonalNotionStatus {
  provider: 'notion';
  status: 'connected' | 'disconnected' | 'expired' | 'error' | 'missing' | 'unknown';
  databaseId?: string;
  updatedAt?: number;
  lastTestedAt?: number;
}

const SESSION_HEADER = 'X-Travel-Session';
const SUPABASE_AUTH_HEADER = 'X-Supabase-Auth';

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
  const stored = state ? {} : loadCredentialSession();
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
  const supabaseToken = await currentSupabaseAccessToken();
  if (requireSession && !session && !supabaseToken) {
    throw new Error('Credential Broker 或 Supabase session 未連線');
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session) headers[SESSION_HEADER] = session.credentialSession;
  if (supabaseToken) headers[SUPABASE_AUTH_HEADER] = `Bearer ${supabaseToken}`;
  try {
    const response = await fetch(`${brokerUrl(state)}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return parseBrokerResponse<T>(response);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Network error: ${error.message}`);
    }
    throw error;
  }
}

async function brokerAiFetch<T>(
  state: Pick<AppState, 'credentialBrokerUrl' | 'credentialSession' | 'credentialSessionExpiresAt'>,
  provider: 'kimi' | 'google',
  body: unknown,
): Promise<T> {
  const session = currentBrokerSession(state);
  const supabaseToken = await currentSupabaseAccessToken();
  if (!session && !supabaseToken) throw new Error('Credential Broker 或 Supabase session 未連線');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session) headers[SESSION_HEADER] = session.credentialSession;
  if (supabaseToken) headers[SUPABASE_AUTH_HEADER] = `Bearer ${supabaseToken}`;
  try {
    const response = await fetch(`${brokerUrl(state)}/${provider}/json`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    return parseBrokerResponse<T>(response);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Network error: ${error.message}`);
    }
    throw error;
  }
}

async function brokerNotionFetch<T>(
  state: Pick<AppState, 'credentialBrokerUrl' | 'credentialSession' | 'credentialSessionExpiresAt'>,
  path: string,
  body?: unknown,
): Promise<T> {
  const session = currentBrokerSession(state);
  const supabaseToken = await currentSupabaseAccessToken();
  if (!session && !supabaseToken) throw new Error('Credential Broker 或 Supabase session 未連線');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (session) headers[SESSION_HEADER] = session.credentialSession;
  if (supabaseToken) headers[SUPABASE_AUTH_HEADER] = `Bearer ${supabaseToken}`;
  try {
    const response = await fetch(`${brokerUrl(state)}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return parseBrokerResponse<T>(response);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Network error: ${error.message}`);
    }
    throw error;
  }
}

export async function unlockCredentialBroker(
  password: string,
  state?: Pick<AppState, 'credentialBrokerUrl'>,
  trustedDevice?: { devicePublicKey: JsonWebKey; deviceName?: string },
  options: { persist?: boolean } = {},
): Promise<BrokerSession> {
  const data = await brokerFetch<{ ok: boolean; session: string; expiresAt: number; device?: TrustedBrokerDevice }>(
    state || {},
    '/session/unlock',
    {
      password,
      ...(trustedDevice ? {
        trustDevice: true,
        devicePublicKey: trustedDevice.devicePublicKey,
        deviceName: trustedDevice.deviceName,
      } : {}),
    },
    false,
  );
  const session = { credentialSession: data.session, credentialSessionExpiresAt: Number(data.expiresAt) || 0, device: data.device };
  if (options.persist !== false) saveCredentialSession(session);
  return session;
}

export async function requestBrokerSessionChallenge(
  state: Pick<AppState, 'credentialBrokerUrl'>,
  deviceId: string,
): Promise<{ challenge: string; expiresAt: number }> {
  const data = await brokerFetch<{ ok: boolean; challenge: string; expiresAt: number }>(
    state,
    '/session/challenge',
    { deviceId },
    false,
  );
  return { challenge: data.challenge, expiresAt: Number(data.expiresAt) || 0 };
}

export async function refreshCredentialBrokerSession(
  state: Pick<AppState, 'credentialBrokerUrl'>,
  deviceId: string,
  challenge: string,
  signature: string,
): Promise<BrokerSession> {
  const data = await brokerFetch<{ ok: boolean; session: string; expiresAt: number }>(
    state,
    '/session/refresh',
    { deviceId, challenge, signature },
    false,
  );
  const session = { credentialSession: data.session, credentialSessionExpiresAt: Number(data.expiresAt) || 0 };
  saveCredentialSession(session);
  return session;
}

export async function listTrustedBrokerDevices(
  state: Pick<AppState, 'credentialBrokerUrl' | 'credentialSession' | 'credentialSessionExpiresAt'>,
): Promise<TrustedBrokerDevice[]> {
  const data = await brokerFetch<{ ok: boolean; devices: TrustedBrokerDevice[] }>(state, '/session/devices');
  return data.devices || [];
}

export async function revokeTrustedBrokerDevice(
  state: Pick<AppState, 'credentialBrokerUrl' | 'credentialSession' | 'credentialSessionExpiresAt'>,
  deviceId: string,
): Promise<void> {
  await brokerFetch<{ ok: boolean }>(state, '/session/revoke-device', { deviceId });
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
  const data = await brokerNotionFetch<{ ok: boolean; data: T }>(state, '/notion/request', {
    path,
    method: init.method || 'GET',
    body,
    databaseId: state.notionDb || undefined,
  });
  return data.data;
}

export async function getPersonalNotionIntegration(state: AppState): Promise<PersonalNotionStatus> {
  const data = await brokerNotionFetch<{ ok: boolean; status: PersonalNotionStatus }>(state, '/integrations/notion/status');
  return data.status;
}

export async function registerPersonalNotionIntegration(
  state: AppState,
  secret: string,
  databaseId: string,
): Promise<PersonalNotionStatus> {
  const data = await brokerNotionFetch<{ ok: boolean; status: PersonalNotionStatus }>(state, '/integrations/notion/connect', {
    secret,
    databaseId,
  });
  return data.status;
}

export async function disconnectPersonalNotionIntegration(state: AppState): Promise<PersonalNotionStatus> {
  const data = await brokerNotionFetch<{ ok: boolean; status: PersonalNotionStatus }>(state, '/integrations/notion/disconnect', {});
  return data.status;
}

export async function brokerAiJson(
  state: AppState,
  provider: 'kimi' | 'google',
  prompt: string,
  kind: 'scan' | 'voice' | 'email' | 'trip' | 'test',
  image?: { base64: string; mime: string },
  model?: string,
): Promise<unknown> {
  const data = await brokerAiFetch<{ ok: boolean; data: unknown }>(state, provider, {
    prompt,
    kind,
    image,
    model: model || (provider === 'kimi' ? 'kimi-code' : state.googleBackupModel),
  });
  return data.data;
}

export async function brokerNotionUploadFile(
  state: AppState,
  base64: string,
  mime: string,
  filename: string,
): Promise<{ fileUploadId: string }> {
  return brokerNotionFetch<{ fileUploadId: string }>(state, '/notion/upload-file', {
    base64,
    mime,
    filename,
  });
}
