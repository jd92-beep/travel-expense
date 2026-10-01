import type { AppState } from '../lib/types';
import { stripSensitiveState } from '../lib/sanitizeState';

const DB_NAME = 'travel-expense-react';
const DB_VERSION = 1;
const STATE_STORE = 'state';
const SNAPSHOT_KEY = 'app-state';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    let settled = false;
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE);
    };
    req.onblocked = () => {
      const timer = setTimeout(() => {
        settled = true;
        reject(new Error('IndexedDB open blocked — timeout after 3s'));
      }, 3000);
      req.onsuccess = () => {
        clearTimeout(timer);
        if (settled) {
          // Timed out earlier — don't leak the late connection.
          req.result.close();
          return;
        }
        resolve(req.result);
      };
      req.onerror = () => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        reject(req.error || new Error('IndexedDB open failed'));
      };
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

function scopedSnapshotKey(scope?: string): string {
  return scope && scope !== 'local' ? `${SNAPSHOT_KEY}:${scope}` : SNAPSHOT_KEY;
}

// Both onerror and onabort must settle the promise: quota exhaustion and version-change
// aborts fire `abort` without a request `error`, and a hanging write freezes persistScope.
function runTx<T>(db: IDBDatabase, mode: IDBTransactionMode, exec: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let result: T;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const tx = db.transaction(STATE_STORE, mode);
    const req = exec(tx.objectStore(STATE_STORE));
    req.onsuccess = () => { result = req.result as T; };
    req.onerror = () => settle(() => reject(req.error || new Error('IndexedDB request failed')));
    // Resolve on oncomplete (not req.onsuccess): writes must reach commit, and a late
    // abort (quota at commit) still rejects below.
    tx.oncomplete = () => settle(() => resolve(result as T));
    tx.onabort = () => settle(() => reject(tx.error || new Error('IndexedDB transaction aborted')));
    tx.onerror = () => settle(() => reject(tx.error || new Error('IndexedDB transaction failed')));
  });
}

export async function loadIndexedState(scope?: string): Promise<Partial<AppState> | null> {
  if (!('indexedDB' in window)) return null;
  const db = await openDb();
  try {
    const result = await runTx<unknown>(db, 'readonly', (store) => store.get(scopedSnapshotKey(scope)));
    return (result && typeof result === 'object' ? result : null) as Partial<AppState> | null;
  } finally {
    db.close();
  }
}

// Serialize writes through one chain: each saveIndexedState opens its own connection, so two
// overlapping writes (debounced persist vs pagehide flushPersist) can commit out of order and
// let an OLDER snapshot overwrite a NEWER one. A mutex preserves call order.
let writeChain: Promise<unknown> = Promise.resolve();

async function saveIndexedStateUnqueued(state: AppState, scope?: string): Promise<void> {
  if (!('indexedDB' in window)) return;
  const db = await openDb();
  try {
    const safe = stripSensitiveState(state);
    await runTx<void>(db, 'readwrite', (store) => store.put(safe, scopedSnapshotKey(scope)));
  } finally {
    db.close();
  }
}

export function saveIndexedState(state: AppState, scope?: string): Promise<void> {
  const task = writeChain.then(() => saveIndexedStateUnqueued(state, scope));
  writeChain = task.catch(() => undefined);
  return task;
}

async function clearIndexedStateUnqueued(scope?: string): Promise<void> {
  if (!('indexedDB' in window)) return;
  const db = await openDb();
  try {
    await runTx<void>(db, 'readwrite', (store) => store.delete(scopedSnapshotKey(scope)));
  } finally {
    db.close();
  }
}

export function clearIndexedState(scope?: string): Promise<void> {
  const task = writeChain.then(() => clearIndexedStateUnqueued(scope));
  writeChain = task.catch(() => undefined);
  return task;
}
