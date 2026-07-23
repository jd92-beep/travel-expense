import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { migrateAppState, stampReceiptForTrip } from '../domain/trip/normalize';
import { DEFAULT_STATE } from './constants';
import { hasCredentialBrokerSession } from './credentialBroker';
import { hasDirectNotionToken } from './notion';
import { clearStoredCredentials, loadState } from './storage';
import { clearIndexedState } from '../storage/indexedDb';
import { hydrateScope, persistScope, sanitizePublicDemoState } from './scopedPersistence';
import { clearDeviceTrust } from '../security/deviceTrust';
import { clearTrustedDevice } from '../security/trustedDevice';
import { clearCurrencyCache } from './currency';
import { enqueueChange } from './changeJournal';
import { receiptSourceTombstoneKey } from './syncMerge';
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
  'credentialBrokerUrl',
  'notionDeletedSourceIds',
]);

function shouldQueueSettings(patch: Partial<AppState>) {
  return Object.keys(patch).some((key) => CLOUD_SETTINGS_KEYS.has(key as keyof AppState));
}

function migrateScopedState(input: unknown, storageScope: string, userEmail: string | null): AppState {
  return sanitizePublicDemoState(migrateAppState(input), storageScope, userEmail);
}

export function useAppState(syncAvailable = false, storageScope = 'local', userEmail: string | null = null) {
  const [state, setState] = useState<AppState>(() => {
    return sanitizePublicDemoState(loadState(storageScope), storageScope, userEmail);
  });
  const [hydratedScope, setHydratedScope] = useState('');
  const [indexedReadyScope, setIndexedReadyScope] = useState('');

  useLayoutEffect(() => {
    let alive = true;
    setIndexedReadyScope('');
    void hydrateScope(storageScope, userEmail)
      .then((hydrated) => {
        if (!alive) return;
        setState(hydrated);
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
    void persistScope(storageScope, userEmail, state).then((result) => {
      if (result.status !== 'succeeded') {
        console.warn(`[useAppState] Persist ${result.status}:`, result.error);
      }
    });
  }, [indexedReadyScope, state, storageScope, userEmail]);

  const updateState = useCallback((patch: Partial<AppState>) => {
    setState((prev) => {
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
  }, [syncAvailable, storageScope, userEmail]);

  const upsertReceipt = useCallback((receipt: Receipt) => {
    setState((prev) => {
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
  }, [syncAvailable]);

  const deleteReceipt = useCallback((receipt: Receipt) => {
    const rawSourceId = receipt.sourceId || receipt.id;
    const tombstoneKey = receiptSourceTombstoneKey(receipt);
    const deletedAt = Date.now();
    setState((prev) => ({
      ...prev,
      receipts: prev.receipts.filter((r) => r.id !== receipt.id),
      notionDeletedIds: receipt.notionPageId
        ? [...(prev.notionDeletedIds || []), receipt.notionPageId].slice(-500)
        : prev.notionDeletedIds,
      notionDeletedSourceIds: tombstoneKey
        ? [...(prev.notionDeletedSourceIds || []), tombstoneKey].slice(-500)
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
  }, [syncAvailable]);

  const resetLocal = useCallback(async () => {
    await clearIndexedState(storageScope);
    await clearTrustedDevice();
    clearStoredCredentials();
    clearDeviceTrust();
    clearCurrencyCache();
    setState(sanitizePublicDemoState({ ...DEFAULT_STATE, receipts: [] }, storageScope, userEmail));
  }, [storageScope, userEmail]);

  return {
    state,
    setState,
    updateState,
    upsertReceipt,
    deleteReceipt,
    resetLocal,
    hydratedScope,
    isHydratingScope: hydratedScope !== storageScope,
    isStorageReady: hydratedScope === storageScope && indexedReadyScope === storageScope,
  };
}
