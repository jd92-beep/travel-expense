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

function scopedSnapshotKey(scope?: string): string {
  return scope && scope !== 'local' ? `${SNAPSHOT_KEY}:${scope}` : SNAPSHOT_KEY;
}

export async function loadIndexedState(scope?: string): Promise<Partial<AppState> | null> {
  if (!window.indexedDB) return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STATE_STORE, 'readonly');
    const req = tx.objectStore(STATE_STORE).get(scopedSnapshotKey(scope));
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
  }).finally(() => db.close()) as Promise<Partial<AppState> | null>;
}

export async function saveIndexedState(state: AppState, scope?: string): Promise<void> {
  if (!window.indexedDB) return;
  const db = await openDb();
  const safe = stripSensitiveState(state);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STATE_STORE, 'readwrite');
    tx.objectStore(STATE_STORE).put(safe, scopedSnapshotKey(scope));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
  }).finally(() => db.close());
}

export async function clearIndexedState(scope?: string): Promise<void> {
  if (!window.indexedDB) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STATE_STORE, 'readwrite');
    tx.objectStore(STATE_STORE).delete(scopedSnapshotKey(scope));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB clear failed'));
  }).finally(() => db.close());
}
