import { ALLOWED_CREDENTIAL_BROKER_URLS, DEFAULT_CREDENTIAL_BROKER_URL, DEFAULT_NOTION_DB, DEFAULT_STATE, STORAGE_KEY, normalizeAiModelSettings } from './constants';
import { migrateAppState } from '../domain/trip/normalize';
import { saveIndexedState } from '../storage/indexedDb';
import type { AppCredentials, AppState } from './types';

const CREDENTIALS_KEY = `${STORAGE_KEY}:react-credentials`;
const BROKER_SESSION_KEY = `${STORAGE_KEY}:credential-session:v1`;
const DIRECT_NOTION_TOKEN_KEY = `${STORAGE_KEY}:direct-notion-token`;
const STALE_BROKER_URLS = new Set(['https://travel-expense-credential-broker.jd92-beep.workers.dev']);

type LegacySecretFields = {
  notionToken?: unknown;
  apiKey?: unknown;
  googleKey?: unknown;
  zaiKey?: unknown;
  minimaxKey?: unknown;
  openrouterKey?: unknown;
  kimiKey?: unknown;
  kimiProxy?: unknown;
  credentialSession?: unknown;
  credentialSessionExpiresAt?: unknown;
};

function stripLegacyProviderSecrets(state: AppState): AppState {
  const {
    notionToken: _notionToken,
    apiKey: _apiKey,
    googleKey: _googleKey,
    zaiKey: _zaiKey,
    minimaxKey: _minimaxKey,
    openrouterKey: _openrouterKey,
    kimiKey: _kimiKey,
    kimiProxy: _kimiProxy,
    ...safe
  } = state as AppState & LegacySecretFields;
  return safe as AppState;
}

function cleanSecretValue(value: unknown): string {
  const s = value == null ? '' : String(value).trim();
  return /^__[\w-]+__$/.test(s) ? '' : s;
}

function trimSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function safeLocalStorageSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn('[storage] localStorage write skipped:', error instanceof Error ? error.name : 'unknown');
    return false;
  }
}

function scopedStateKey(scope?: string): string {
  return scope && scope !== 'local' ? `${STORAGE_KEY}:state:${scope}` : STORAGE_KEY;
}

function normalizeCredentialBrokerUrl(value: unknown): string {
  const url = trimSlash(cleanSecretValue(value));
  return url && !STALE_BROKER_URLS.has(url) && ALLOWED_CREDENTIAL_BROKER_URLS.includes(url as typeof ALLOWED_CREDENTIAL_BROKER_URLS[number])
    ? url
    : DEFAULT_CREDENTIAL_BROKER_URL;
}

export function normalizeState(input: unknown): AppState {
  const parsed = input && typeof input === 'object' ? input as Partial<AppState> : {};
  const state: AppState = migrateAppState({
    ...parsed,
    receipts: Array.isArray(parsed.receipts) ? parsed.receipts.filter((r) => r && r.id && r.store !== undefined) : [],
    notionDeletedIds: Array.isArray(parsed.notionDeletedIds) ? parsed.notionDeletedIds : [],
    notionDeletedSourceIds: Array.isArray(parsed.notionDeletedSourceIds) ? parsed.notionDeletedSourceIds : [],
  });

  state.notionDb = cleanSecretValue(state.notionDb) || DEFAULT_NOTION_DB;
  state.personalNotionConnected = state.personalNotionConnected === true;
  state.credentialBrokerUrl = normalizeCredentialBrokerUrl(state.credentialBrokerUrl);
  Object.assign(state, normalizeAiModelSettings(state));
  state.credentialSession = cleanSecretValue(state.credentialSession);
  state.credentialSessionExpiresAt = Number(state.credentialSessionExpiresAt) || 0;
  if (!state.persons.find((p) => p.id === 'p_boss')) {
    state.persons = [DEFAULT_STATE.persons[0], ...state.persons];
  }
  state.receipts = state.receipts.filter((r) => !(typeof r.id === 'string' && r.id.startsWith('__meta_')));
  return stripLegacyProviderSecrets(state);
}

export function loadState(scope?: string): AppState {
  try {
    const raw = localStorage.getItem(scopedStateKey(scope));
    const credentials = scope && scope !== 'local' ? {} : loadCredentials();
    return normalizeState({ ...(raw ? JSON.parse(raw) : null), ...credentials });
  } catch {
    return normalizeState({ ...DEFAULT_STATE, ...(scope && scope !== 'local' ? {} : loadCredentials()) });
  }
}

export function hasStoredState(scope?: string): boolean {
  try {
    return localStorage.getItem(scopedStateKey(scope)) !== null;
  } catch {
    return false;
  }
}

export function clearStoredState(scope?: string): void {
  try {
    localStorage.removeItem(scopedStateKey(scope));
  } catch {
    // Best effort only.
  }
}

export function saveState(state: AppState, scope?: string): void {
  saveCredentials(state);
  const safeState = stripSensitiveState(state);
  safeLocalStorageSet(scopedStateKey(scope), JSON.stringify(safeState));
  void saveIndexedState(safeState, scope).catch((error) => {
    console.warn('[storage] IndexedDB snapshot write failed:', error instanceof Error ? error.message : String(error));
  });
}

export function stripSensitiveState<T extends Partial<AppState>>(state: T): T {
  const {
    notionToken: _notionToken,
    apiKey: _apiKey,
    googleKey: _googleKey,
    zaiKey: _zaiKey,
    minimaxKey: _minimaxKey,
    openrouterKey: _openrouterKey,
    kimiKey: _kimiKey,
    kimiProxy: _kimiProxy,
    credentialSession: _credentialSession,
    credentialSessionExpiresAt: _credentialSessionExpiresAt,
    ...safeState
  } = state as T & LegacySecretFields;
  return safeState as T;
}

export function stripPortableBackupState(state: AppState): Partial<AppState> {
  const {
    notionDb: _notionDb,
    personalNotionConnected: _personalNotionConnected,
    syncQueue: _syncQueue,
    notionDeletedIds: _notionDeletedIds,
    notionDeletedSourceIds: _notionDeletedSourceIds,
    lastSyncedAt: _lastSyncedAt,
    globalSyncStatus: _globalSyncStatus,
    syncError: _syncError,
    settingsPulledAt: _settingsPulledAt,
    receipts: _receipts,
    trips: _trips,
    ...safeState
  } = stripSensitiveState(state);

  const receipts = (state.receipts || []).map((receipt) => {
    const {
      supabaseId: _supabaseId,
      notionPageId: _notionPageId,
      notionFileUploadId: _notionFileUploadId,
      _photoSyncedToNotion,
      _photoBodyBlockAdded,
      _photoSyncedToSupabase,
      supabasePhotoPath,
      sourceId: _sourceId,
      syncStatus: _syncStatus,
      photoUrl: _photoUrl,
      ...localReceipt
    } = receipt;
    return localReceipt;
  });

  const trips = (state.trips || []).map((trip) => {
    const {
      supabaseId: _supabaseId,
      notionPageId: _notionPageId,
      notionDb: _notionDb,
      sourceId: _sourceId,
      ...localTrip
    } = trip;
    return localTrip;
  });

  return {
    ...safeState,
    receipts,
    trips,
  };
}

export function loadCredentials(): AppCredentials {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const session = loadCredentialSession();
    if (!parsed || typeof parsed !== 'object') return session;
    const credentials = {
      credentialBrokerUrl: normalizeCredentialBrokerUrl((parsed as AppCredentials).credentialBrokerUrl),
    };
    safeLocalStorageSet(CREDENTIALS_KEY, JSON.stringify(credentials));
    return {
      ...credentials,
      credentialSession: session.credentialSession,
      credentialSessionExpiresAt: session.credentialSessionExpiresAt,
    };
  } catch {
    return loadCredentialSession();
  }
}

export function saveCredentials(state: Partial<AppCredentials>): void {
  const credentials: AppCredentials = {
    credentialBrokerUrl: normalizeCredentialBrokerUrl(state.credentialBrokerUrl),
  };
  safeLocalStorageSet(CREDENTIALS_KEY, JSON.stringify(credentials));
}

export function saveDirectNotionToken(token: string): void {
  if (import.meta.env.PROD) {
    localStorage.removeItem(DIRECT_NOTION_TOKEN_KEY);
    return;
  }
  const cleaned = cleanSecretValue(token);
  if (cleaned) localStorage.setItem(DIRECT_NOTION_TOKEN_KEY, cleaned);
  else localStorage.removeItem(DIRECT_NOTION_TOKEN_KEY);
}

export function getDirectNotionToken(): string {
  try {
    if (import.meta.env.PROD) {
      localStorage.removeItem(DIRECT_NOTION_TOKEN_KEY);
      return '';
    }
    return cleanSecretValue(localStorage.getItem(DIRECT_NOTION_TOKEN_KEY)) || '';
  } catch {
    return '';
  }
}

export function loadCredentialSession(): AppCredentials {
  try {
    const raw = localStorage.getItem(BROKER_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) as AppCredentials : {};
    if (!parsed.credentialSession || Number(parsed.credentialSessionExpiresAt) <= Date.now()) {
      localStorage.removeItem(BROKER_SESSION_KEY);
      return {};
    }
    return {
      credentialSession: cleanSecretValue(parsed.credentialSession),
      credentialSessionExpiresAt: Number(parsed.credentialSessionExpiresAt) || 0,
    };
  } catch {
    return {};
  }
}

export function saveCredentialSession(session: AppCredentials): void {
  const token = cleanSecretValue(session.credentialSession);
  const exp = Number(session.credentialSessionExpiresAt) || 0;
  if (!token || exp <= Date.now()) {
    localStorage.removeItem(BROKER_SESSION_KEY);
    return;
  }
  localStorage.setItem(BROKER_SESSION_KEY, JSON.stringify({ credentialSession: token, credentialSessionExpiresAt: exp }));
}

export function clearCredentialSession(): void {
  localStorage.removeItem(BROKER_SESSION_KEY);
}

export function clearStoredCredentials(): void {
  try {
    localStorage.removeItem(CREDENTIALS_KEY);
    localStorage.removeItem(DIRECT_NOTION_TOKEN_KEY);
    clearCredentialSession();
  } catch {
    // Best effort only.
  }
}
