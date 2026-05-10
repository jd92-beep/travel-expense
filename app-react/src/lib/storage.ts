import { ALLOWED_CREDENTIAL_BROKER_URLS, DEFAULT_CREDENTIAL_BROKER_URL, DEFAULT_GOOGLE_BACKUP_MODEL, DEFAULT_NOTION_DB, DEFAULT_STATE, STORAGE_KEY } from './constants';
import { migrateAppState } from '../domain/trip/normalize';
import { saveIndexedState } from '../storage/indexedDb';
import type { AppCredentials, AppState } from './types';

const CREDENTIALS_KEY = `${STORAGE_KEY}:react-credentials`;
const BROKER_SESSION_KEY = `${STORAGE_KEY}:credential-session:v1`;
const DIRECT_NOTION_TOKEN_KEY = `${STORAGE_KEY}:direct-notion-token`;
const STALE_BROKER_URLS = new Set(['https://travel-expense-credential-broker.jd92-beep.workers.dev']);
const STALE_GOOGLE_BACKUP_MODELS = new Set(['gemma-3-27b-it', 'gemma-4-31b-it', 'gemma-4-26b-a4b-it']);

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
    tripDateRange: { ...DEFAULT_STATE.tripDateRange, ...(parsed.tripDateRange || {}) },
    persons: Array.isArray(parsed.persons) && parsed.persons.length ? parsed.persons : DEFAULT_STATE.persons,
    receipts: Array.isArray(parsed.receipts) ? parsed.receipts.filter((r) => r && r.id && r.store !== undefined) : [],
    shareRatios: parsed.shareRatios && typeof parsed.shareRatios === 'object' ? parsed.shareRatios : {},
    itineraryOverrides: parsed.itineraryOverrides && typeof parsed.itineraryOverrides === 'object' ? parsed.itineraryOverrides : {},
    notionDeletedIds: Array.isArray(parsed.notionDeletedIds) ? parsed.notionDeletedIds : [],
    notionDeletedSourceIds: Array.isArray(parsed.notionDeletedSourceIds) ? parsed.notionDeletedSourceIds : [],
  });

  state.notionDb = cleanSecretValue(state.notionDb) || DEFAULT_NOTION_DB;
  state.credentialBrokerUrl = normalizeCredentialBrokerUrl(state.credentialBrokerUrl);
  if (!state.googleBackupModel || STALE_GOOGLE_BACKUP_MODELS.has(String(state.googleBackupModel))) {
    state.googleBackupModel = DEFAULT_GOOGLE_BACKUP_MODEL;
  }
  state.credentialSession = cleanSecretValue(state.credentialSession);
  state.credentialSessionExpiresAt = Number(state.credentialSessionExpiresAt) || 0;
  if (!state.persons.find((p) => p.id === 'p_boss')) {
    state.persons = [DEFAULT_STATE.persons[0], ...state.persons];
  }
  if (!state.persons.find((p) => p.id === 'p_xinxin')) {
    state.persons = [...state.persons, DEFAULT_STATE.persons[1]];
  }
  state.receipts = state.receipts.filter((r) => !(typeof r.id === 'string' && r.id.startsWith('__meta_')));
  return stripLegacyProviderSecrets(state);
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const credentials = loadCredentials();
    return normalizeState({ ...(raw ? JSON.parse(raw) : null), ...credentials });
  } catch {
    return { ...DEFAULT_STATE, ...loadCredentials() };
  }
}

export function saveState(state: AppState): void {
  saveCredentials(state);
  const safeState = stripSensitiveState(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState));
  void saveIndexedState(safeState);
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

export function loadCredentials(): AppCredentials {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const session = loadCredentialSession();
    if (!parsed || typeof parsed !== 'object') return session;
    const credentials = {
      credentialBrokerUrl: normalizeCredentialBrokerUrl((parsed as AppCredentials).credentialBrokerUrl),
    };
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
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
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
}

export function saveDirectNotionToken(token: string): void {
  const cleaned = cleanSecretValue(token);
  if (cleaned) localStorage.setItem(DIRECT_NOTION_TOKEN_KEY, cleaned);
  else localStorage.removeItem(DIRECT_NOTION_TOKEN_KEY);
}

export function getDirectNotionToken(): string {
  try {
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
