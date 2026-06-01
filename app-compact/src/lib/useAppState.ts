import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { migrateAppState, stampReceiptForTrip } from '../domain/trip/normalize';
import { DEFAULT_STATE } from './constants';
import { hasCredentialBrokerSession } from './credentialBroker';
import { hasDirectNotionToken } from './notion';
import { clearStoredCredentials, hasStoredState, loadState, saveState } from './storage';
import { clearIndexedState, loadIndexedState } from '../storage/indexedDb';
import { clearDeviceTrust } from '../security/deviceTrust';
import { clearTrustedDevice } from '../security/trustedDevice';
import { clearCurrencyCache } from './currency';
import { receiptSourceTombstoneKey } from './syncMerge';
import type { AppState, Receipt, SyncQueueItem } from './types';

function queueItem(type: SyncQueueItem['type'], entityId: string, op: SyncQueueItem['op'], payload?: SyncQueueItem['payload']): SyncQueueItem {
  const now = Date.now();
  return {
    id: `sync_${now}_${Math.random().toString(16).slice(2)}`,
    type,
    entityId,
    op,
    status: 'queued',
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    payload,
  };
}

function enqueueSyncItem(queue: SyncQueueItem[] | undefined, item: SyncQueueItem) {
  return [
    ...(queue || []).filter((queued) => queued.type !== item.type || queued.entityId !== item.entityId),
    item,
  ].slice(-500);
}

const CLOUD_SETTINGS_KEYS = new Set<keyof AppState>([
  'budget',
  'rate',
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

function stateFreshness(state: Partial<AppState>): number {
  const receiptFreshness = Array.isArray(state.receipts)
    ? Math.max(0, ...state.receipts.map((receipt) => Number(receipt.updatedAt || receipt.createdAt || 0)))
    : 0;
  return Math.max(
    Number(state.settingsUpdatedAt || 0),
    Number(state.lastSyncedAt || 0),
    receiptFreshness,
  );
}

export function useAppState(syncAvailable = false, storageScope = 'local', userEmail: string | null = null) {
  const [state, setState] = useState<AppState>(() => {
    const rawState = loadState(storageScope);
    if (userEmail && userEmail !== 'vc06456@gmail.com') {
      return {
        ...rawState,
        trips: (rawState.trips || []).filter((t) => t.id !== 'trip_2026_04_nagoya'),
        receipts: (rawState.receipts || []).filter((r) => r.tripId !== 'trip_2026_04_nagoya'),
        activeTripId: rawState.activeTripId === 'trip_2026_04_nagoya' ? '' : rawState.activeTripId,
      };
    }
    return rawState;
  });
  const [hydratedScope, setHydratedScope] = useState(storageScope);

  useLayoutEffect(() => {
    let alive = true;
    const hasPrimarySnapshot = hasStoredState(storageScope);
    const scopedState = loadState(storageScope);
    let filteredState = scopedState;
    if (userEmail && userEmail !== 'vc06456@gmail.com') {
      filteredState = {
        ...scopedState,
        trips: (scopedState.trips || []).filter((t) => t.id !== 'trip_2026_04_nagoya'),
        receipts: (scopedState.receipts || []).filter((r) => r.tripId !== 'trip_2026_04_nagoya'),
        activeTripId: scopedState.activeTripId === 'trip_2026_04_nagoya' ? '' : scopedState.activeTripId,
      };
    }
    setState(filteredState);
    setHydratedScope(storageScope);
    loadIndexedState(storageScope).then((indexed) => {
      if (!alive || !indexed) return;
      setState((prev) => {
        const indexedWins = !hasPrimarySnapshot || (stateFreshness(indexed) > stateFreshness(prev));
        if (indexedWins) {
          console.log('[useAppState] Hydrated newer state from IndexedDB');
          let merged = { ...prev, ...indexed };
          if (userEmail && userEmail !== 'vc06456@gmail.com') {
            merged = {
              ...merged,
              trips: (merged.trips || []).filter((t) => t.id !== 'trip_2026_04_nagoya'),
              receipts: (merged.receipts || []).filter((r) => r.tripId !== 'trip_2026_04_nagoya'),
              activeTripId: merged.activeTripId === 'trip_2026_04_nagoya' ? '' : merged.activeTripId,
            };
          }
          return migrateAppState(merged);
        }
        return prev;
      });
    }).catch(() => {
      // localStorage remains the compatibility fallback.
    });
    return () => {
      alive = false;
    };
  }, [storageScope, userEmail]);

  useEffect(() => {
    try {
      saveState(migrateAppState(state), storageScope);
    } catch (error) {
      console.warn('[useAppState] Persist failed:', error instanceof Error ? error.message : String(error));
    }
  }, [state, storageScope]);

  const updateState = useCallback((patch: Partial<AppState>) => {
    setState((prev) => {
      const now = Date.now();
      const settingsChanged = shouldQueueSettings(patch);
      const cloudReady = prev.autoSync && settingsChanged && (syncAvailable || hasCredentialBrokerSession(prev) || hasDirectNotionToken());
      const nextQueue = cloudReady
        ? enqueueSyncItem(prev.syncQueue, queueItem('settings', 'app-settings', 'upsert', { updatedAt: now }))
        : prev.syncQueue;
      return migrateAppState({
        ...prev,
        ...patch,
        syncQueue: nextQueue,
        settingsUpdatedAt: settingsChanged ? now : prev.settingsUpdatedAt,
      });
    });
  }, [syncAvailable]);

  const upsertReceipt = useCallback((receipt: Receipt) => {
    setState((prev) => {
      const shouldQueue = prev.autoSync && (syncAvailable || hasCredentialBrokerSession(prev) || hasDirectNotionToken());
      const stamped = stampReceiptForTrip(prev, {
        ...receipt,
        syncStatus: shouldQueue ? 'queued' : 'local',
      });
      const idx = prev.receipts.findIndex((r) => r.id === receipt.id);
      const syncQueue = prev.autoSync && (syncAvailable || hasCredentialBrokerSession(prev) || hasDirectNotionToken())
        ? enqueueSyncItem(prev.syncQueue, queueItem('receipt', stamped.id, idx < 0 ? 'create' : 'update', {
            notionPageId: stamped.notionPageId,
            sourceId: stamped.sourceId || stamped.id,
            updatedAt: stamped.updatedAt,
          }))
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
    setState((prev) => ({
      ...prev,
      receipts: prev.receipts.filter((r) => r.id !== receipt.id),
      notionDeletedIds: receipt.notionPageId
        ? [...(prev.notionDeletedIds || []), receipt.notionPageId].slice(-500)
        : prev.notionDeletedIds,
      notionDeletedSourceIds: tombstoneKey
        ? [...(prev.notionDeletedSourceIds || []), tombstoneKey].slice(-500)
        : prev.notionDeletedSourceIds,
      syncQueue: prev.autoSync && (syncAvailable || hasCredentialBrokerSession(prev) || hasDirectNotionToken())
        ? enqueueSyncItem(prev.syncQueue, queueItem('delete-receipt', receipt.id, 'delete', {
            notionPageId: receipt.notionPageId,
            supabaseId: receipt.supabaseId,
            tripId: receipt.tripId,
            sourceId: rawSourceId,
            tombstoneKey,
            updatedAt: receipt.updatedAt,
          }))
        : prev.syncQueue,
    }));
  }, [syncAvailable]);

  const resetLocal = useCallback(async () => {
    await clearIndexedState(storageScope);
    await clearTrustedDevice();
    clearStoredCredentials();
    clearDeviceTrust();
    clearCurrencyCache();
    setState({ ...DEFAULT_STATE, receipts: [] });
  }, [storageScope]);

  return { state, setState, updateState, upsertReceipt, deleteReceipt, resetLocal, hydratedScope, isHydratingScope: hydratedScope !== storageScope };
}
