import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { migrateAppState, stampReceiptForTrip } from '../domain/trip/normalize';
import { DEFAULT_STATE, isBoss } from './constants';
import { hasCredentialBrokerSession } from './credentialBroker';
import { hasDirectNotionToken } from './notion';
import { clearStoredCredentials, hasStoredState, loadState, normalizeState, saveState } from './storage';
import { clearIndexedState, loadIndexedState } from '../storage/indexedDb';
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

function isPublicSupabaseScope(storageScope: string, userEmail: string | null): boolean {
  return storageScope.startsWith('supabase:') && !isBoss(userEmail);
}

function withoutPublicDemoTrip(state: AppState, storageScope: string, userEmail: string | null): AppState {
  if (!isPublicSupabaseScope(storageScope, userEmail)) return state;
  const demoTripId = DEFAULT_STATE.activeTripId;
  const trips = (state.trips || []).filter((trip) => trip.id !== demoTripId);
  const activeTripId = trips.find((trip) => trip.id === state.activeTripId && !trip.archived)?.id
    || trips.find((trip) => trip.active && !trip.archived)?.id
    || trips.find((trip) => !trip.archived)?.id
    || '';
  const active = trips.find((trip) => trip.id === activeTripId);
  return {
    ...state,
    trips: trips.map((trip) => ({ ...trip, active: trip.id === activeTripId && !trip.archived })),
    receipts: (state.receipts || []).filter((receipt) => receipt.tripId !== demoTripId),
    activeTripId,
    tripName: active?.name || (trips.length ? state.tripName : ''),
    tripDateRange: active ? { start: active.startDate, end: active.endDate } : state.tripDateRange,
    customItinerary: active?.itinerary || (trips.length ? state.customItinerary : null),
  };
}

function migrateScopedState(input: unknown, storageScope: string, userEmail: string | null): AppState {
  return withoutPublicDemoTrip(migrateAppState(input), storageScope, userEmail);
}

function normalizeScopedState(input: unknown, storageScope: string, userEmail: string | null): AppState {
  return withoutPublicDemoTrip(normalizeState(input), storageScope, userEmail);
}

export function useAppState(syncAvailable = false, storageScope = 'local', userEmail: string | null = null) {
  const [state, setState] = useState<AppState>(() => {
    return withoutPublicDemoTrip(loadState(storageScope), storageScope, userEmail);
  });
  const [hydratedScope, setHydratedScope] = useState('');
  const [indexedReadyScope, setIndexedReadyScope] = useState('');

  useLayoutEffect(() => {
    let alive = true;
    setIndexedReadyScope('');
    const hasPrimarySnapshot = hasStoredState(storageScope);
    const filteredState = withoutPublicDemoTrip(loadState(storageScope), storageScope, userEmail);
    setState(filteredState);
    setHydratedScope(storageScope);
    loadIndexedState(storageScope).then((indexed) => {
      if (!alive || !indexed) return;
      setState((prev) => {
        if (!hasPrimarySnapshot) {
          console.log('[useAppState] Hydrated from IndexedDB (no primary snapshot)');
          return normalizeScopedState({ ...prev, ...indexed }, storageScope, userEmail);
        }
        const indexedGlobal = stateFreshness(indexed);
        const localGlobal = stateFreshness(prev);
        if (indexedGlobal <= localGlobal) return prev;
        const localReceiptsById = new Map(prev.receipts.map((r) => [r.id, r]));
        const mergedReceipts = (indexed.receipts || []).map((remote) => {
          const local = localReceiptsById.get(remote.id);
          if (!local) return remote;
          const localUpdated = Number(local.updatedAt || local.createdAt || 0);
          const remoteUpdated = Number(remote.updatedAt || remote.createdAt || 0);
          return remoteUpdated > localUpdated ? remote : local;
        });
        for (const [id, local] of localReceiptsById) {
          if (!mergedReceipts.some((r) => r.id === id)) mergedReceipts.push(local);
        }
        console.log('[useAppState] Hydrated newer state from IndexedDB (per-receipt merge)');
        return normalizeScopedState({ ...prev, ...indexed, receipts: mergedReceipts }, storageScope, userEmail);
      });
    }).catch(() => {
      // localStorage remains the compatibility fallback.
    }).finally(() => {
      if (alive) setIndexedReadyScope(storageScope);
    });
    return () => {
      alive = false;
    };
  }, [storageScope, userEmail]);

  useEffect(() => {
    if (indexedReadyScope !== storageScope) return;
    try {
      saveState(migrateScopedState(state, storageScope, userEmail), storageScope);
    } catch (error) {
      console.warn('[useAppState] Persist failed:', error instanceof Error ? error.message : String(error));
    }
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
    setState(withoutPublicDemoTrip({ ...DEFAULT_STATE, receipts: [] }, storageScope, userEmail));
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
