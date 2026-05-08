import type { AppState } from '../lib/types';

const DB_NAME = 'travel-expense-react';
const DB_VERSION = 1;
const STATE_STORE = 'state';
const SNAPSHOT_KEY = 'app-state';

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

function stripSensitiveState(state: AppState): AppState {
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
    ...safe
  } = state as AppState & LegacySecretFields;
  return safe as AppState;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

export async function loadIndexedState(): Promise<Partial<AppState> | null> {
  if (!('indexedDB' in window)) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STATE_STORE, 'readonly');
    const req = tx.objectStore(STATE_STORE).get(SNAPSHOT_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
  }).finally(() => db.close()) as Promise<Partial<AppState> | null>;
}

export async function saveIndexedState(state: AppState): Promise<void> {
  if (!('indexedDB' in window)) return;
  const db = await openDb();
  const safe = stripSensitiveState(state);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STATE_STORE, 'readwrite');
    tx.objectStore(STATE_STORE).put(safe, SNAPSHOT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
  }).finally(() => db.close());
}

export async function clearIndexedState(): Promise<void> {
  if (!('indexedDB' in window)) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STATE_STORE, 'readwrite');
    tx.objectStore(STATE_STORE).delete(SNAPSHOT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB clear failed'));
  }).finally(() => db.close());
}
