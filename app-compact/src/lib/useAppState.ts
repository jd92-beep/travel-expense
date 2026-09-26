import { useCallback, useEffect, useLayoutEffect, useRef, useState, type SetStateAction } from 'react';
import { migrateAppState, stampReceiptForTrip } from '../domain/trip/normalize';
import { DEFAULT_STATE } from './constants';
import { hasCredentialBrokerSession } from './credentialBroker';
import { hasDirectNotionToken } from './notion';
import { clearStoredCredentials } from './storage';
import { clearIndexedState } from '../storage/indexedDb';
import { hydrateScope, persistScope, safeInitialState, sanitizePublicDemoState } from './scopedPersistence';
import { clearDeviceTrust } from '../security/deviceTrust';
import { clearTrustedDevice } from '../security/trustedDevice';
import { clearCurrencyCache } from './currency';
import { enqueueChange } from './changeJournal';
import { receiptSourceTombstoneKey } from './syncMerge';
import { saveStoredSnapshot } from './storage';
import type { AppState, Receipt } from './types';

const CLOUD_SETTINGS_KEYS = new Set<keyof AppState>([
  'budget',
  'rate',
  'rateMode',
  'rateTable',
  'tripCurrency',
  'notionDb',
  'personalNotionConnected',
  'autoSync',
  'activeTripId',
  'persons',
  'shareRatios',
  'itineraryOverrides',
  'statsIncludeTransportLodging',
  'top10IncludeBigItems',
  'scanModel',
  'voiceModel',
  'emailModel',
  'tripUpdateModel',
  'googleBackupModel',
  'hiddenAiModels',
  'themePreference',
  'credentialBrokerUrl',
  'notionDeletedSourceIds',
]);

function shouldQueueSettings(patch: Partial<AppState>) {
  return Object.keys(patch).some((key) => CLOUD_SETTINGS_KEYS.has(key as keyof AppState));
}

function migrateScopedState(input: unknown, storageScope: string, userEmail: string | null): AppState {
  return sanitizePublicDemoState(migrateAppState(input), storageScope, userEmail);
}

const PERSIST_DEBOUNCE_MS = 0;

export function useAppState(syncAvailable = false, storageScope = 'local', userEmail: string | null = null) {
  const [state, setState] = useState<AppState>(() => safeInitialState(storageScope, userEmail));
  const [hydratedScope, setHydratedScope] = useState('');
  const [indexedReadyScope, setIndexedReadyScope] = useState('');
  const persistTimerRef = useRef<number | null>(null);
  const pendingPersistRef = useRef<{ scope: string; userEmail: string | null; state: AppState } | null>(null);
  // Bumped on every user mutation so a late IndexedDB hydrate cannot clobber live edits
  // (e.g. History "Keep local" racing an in-flight hydrateScope).
  const mutationSeqRef = useRef(0);

  // Coalesce the full-AppState snapshot write: typing/upserting would otherwise serialize the
  // entire state to localStorage + IndexedDB on every setState. Flushed on hide/unmount/scope change.
  const flushPersist = useCallback(() => {
    if (persistTimerRef.current != null) {
      window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const pending = pendingPersistRef.current;
    if (!pending) return;
    pendingPersistRef.current = null;
    // Sync localStorage first so pagehide and smoke tests always observe the latest snapshot;
    // IndexedDB still goes through persistScope.
    try {
      saveStoredSnapshot(migrateAppState(pending.state), pending.scope);
    } catch { /* persistScope reports storage failures below */ }
    void persistScope(pending.scope, pending.userEmail, pending.state).then((result) => {
      if (result.status !== 'succeeded') {
        console.warn(`[useAppState] Persist ${result.status}:`, result.error);
      }
    });
  }, []);

  const commitState = useCallback((action: SetStateAction<AppState>) => {
    mutationSeqRef.current += 1;
    setState(action);
  }, []);

  const persistGenRef = useRef(0);
  const schedulePersist = useCallback((scope: string, email: string | null, next: AppState, delayMs: number) => {
    persistGenRef.current += 1;
    const gen = persistGenRef.current;
    pendingPersistRef.current = { scope, userEmail: email, state: next };
    if (persistTimerRef.current != null) window.clearTimeout(persistTimerRef.current);
    persistTimerRef.current = window.setTimeout(() => {
      if (gen !== persistGenRef.current) return;
      flushPersist();
    }, delayMs);
  }, [flushPersist]);

  useLayoutEffect(() => {
    let alive = true;
    setIndexedReadyScope('');
    const seqAtStart = mutationSeqRef.current;
    void hydrateScope(storageScope, userEmail)
      .then((hydrated) => {
        if (!alive) return;
        setState((prev) => {
          // Boot: apply storage. If the user already edited after mount, keep their
          // navigation and any data fields they changed, but fill the rest from storage.
          if (mutationSeqRef.current === seqAtStart) return hydrated;
          return {
            ...hydrated,
            lastTab: prev.lastTab !== hydrated.lastTab ? prev.lastTab : hydrated.lastTab,
            receipts: prev.receipts?.length && prev.receipts !== hydrated.receipts
              ? prev.receipts
              : hydrated.receipts,
            syncQueue: prev.syncQueue?.length && prev.syncQueue !== hydrated.syncQueue
              ? prev.syncQueue
              : hydrated.syncQueue,
          };
        });
        setHydratedScope(storageScope);
        setIndexedReadyScope(storageScope);
      })
      .catch((error) => {
        if (!alive) return;
        console.warn('[useAppState] Hydration failed:',
          error instanceof Error ? error.message : String(error));
        setHydratedScope(storageScope);
        setIndexedReadyScope(storageScope);
      });
    return () => {
      alive = false;
    };
  }, [storageScope, userEmail]);

  useEffect(() => {
    if (indexedReadyScope !== storageScope) return;
    schedulePersist(storageScope, userEmail, state, PERSIST_DEBOUNCE_MS);
  }, [indexedReadyScope, state, storageScope, userEmail, schedulePersist]);

  // Reliability net: write immediately when the tab hides, the page unloads, or the storage
  // identity tears down — the debounce must never lose the last keystroke.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushPersist();
    };
    const onPageHide = () => flushPersist();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      flushPersist();
    };
  }, [flushPersist, storageScope, userEmail]);

  const updateState = useCallback((patch: Partial<AppState>) => {
    commitState((prev) => {
      const now = Date.now();
      const settingsChanged = shouldQueueSettings(patch);
      const cloudReady = prev.autoSync && settingsChanged && (syncAvailable || hasCredentialBrokerSession(prev) || hasDirectNotionToken());
      const nextQueue = cloudReady
        ? enqueueChange(prev.syncQueue, {
            type: 'settings',
            entityId: 'app-settings',
            op: 'upsert',
            payload: { updatedAt: now },
          })
        : prev.syncQueue;
      return migrateScopedState({
        ...prev,
        ...patch,
        syncQueue: nextQueue,
        settingsUpdatedAt: settingsChanged ? now : prev.settingsUpdatedAt,
      }, storageScope, userEmail);
    });
  }, [syncAvailable, storageScope, userEmail, commitState]);

  const upsertReceipt = useCallback((receipt: Receipt) => {
    commitState((prev) => {
      const shouldQueue = prev.autoSync && (syncAvailable || hasCredentialBrokerSession(prev) || hasDirectNotionToken());
      const stamped = stampReceiptForTrip(prev, {
        ...receipt,
        syncStatus: shouldQueue ? 'queued' : 'local',
      });
      const idx = prev.receipts.findIndex((r) => r.id === receipt.id);
      const syncQueue = prev.autoSync && (syncAvailable || hasCredentialBrokerSession(prev) || hasDirectNotionToken())
        ? enqueueChange(prev.syncQueue, {
            type: 'receipt',
            entityId: stamped.id,
            op: idx < 0 ? 'create' : 'update',
            payload: {
              notionPageId: stamped.notionPageId,
              supabaseId: stamped.supabaseId,
              tripId: stamped.tripId,
              sourceId: stamped.sourceId || stamped.id,
              version: stamped.version,
              syncRevision: stamped.syncRevision,
              updatedAt: stamped.updatedAt,
            },
          })
        : prev.syncQueue;
      if (idx < 0) return { ...prev, receipts: [...prev.receipts, stamped], syncQueue };
      const next = prev.receipts.slice();
      next[idx] = { ...next[idx], ...stamped };
      return { ...prev, receipts: next, syncQueue };
    });
  }, [syncAvailable, commitState]);

  const deleteReceipt = useCallback((receipt: Receipt) => {
    const rawSourceId = receipt.sourceId || receipt.id;
    const tombstoneKey = receiptSourceTombstoneKey(receipt);
    const deletedAt = Date.now();
    commitState((prev) => ({
      ...prev,
      receipts: prev.receipts.filter((r) => r.id !== receipt.id),
      notionDeletedIds: receipt.notionPageId
        ? [...(prev.notionDeletedIds || []), receipt.notionPageId].slice(-5000)
        : prev.notionDeletedIds,
      notionDeletedSourceIds: tombstoneKey
        ? [...(prev.notionDeletedSourceIds || []), tombstoneKey].slice(-5000)
        : prev.notionDeletedSourceIds,
      receiptTombstones: {
        ...(prev.receiptTombstones || {}),
        [tombstoneKey]: {
          supabaseId: receipt.supabaseId || receipt.id,
          sourceId: rawSourceId,
          tripId: receipt.tripId || prev.activeTripId || '',
          version: Math.max(1, Number(receipt.version) || 1),
          syncRevision: Math.max(0, Number(receipt.syncRevision) || 0),
          deletedAt,
          pending: true,
        },
      },
      syncQueue: prev.autoSync && (syncAvailable || hasCredentialBrokerSession(prev) || hasDirectNotionToken())
        ? enqueueChange(prev.syncQueue, {
            type: 'delete-receipt',
            entityId: receipt.id,
            op: 'delete',
            payload: {
              notionPageId: receipt.notionPageId,
              supabaseId: receipt.supabaseId,
              tripId: receipt.tripId,
              sourceId: rawSourceId,
              tombstoneKey,
              version: receipt.version,
              syncRevision: receipt.syncRevision,
              updatedAt: receipt.updatedAt,
            },
          })
        : prev.syncQueue,
    }));
  }, [syncAvailable, commitState]);

  const resetLocal = useCallback(async () => {
    await clearIndexedState(storageScope);
    await clearTrustedDevice();
    clearStoredCredentials();
    clearDeviceTrust();
    clearCurrencyCache();
    commitState(sanitizePublicDemoState({ ...DEFAULT_STATE, receipts: [] }, storageScope, userEmail));
  }, [storageScope, userEmail, commitState]);

  return {
    state,
    setState: commitState,
    updateState,
    upsertReceipt,
    deleteReceipt,
    resetLocal,
    flushPersist,
    hydratedScope,
    isHydratingScope: hydratedScope !== storageScope,
    isStorageReady: hydratedScope === storageScope && indexedReadyScope === storageScope,
  };
}
