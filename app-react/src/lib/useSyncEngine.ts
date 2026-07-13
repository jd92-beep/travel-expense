import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { activeTrip } from '../domain/trip/normalize';
import { archiveReceipt, pullAll, pullTrips, pullSettingsMeta, pushReceipt, pushSettingsMeta, pushTripPage } from './notion';
import { canUseNotionMirror } from './notionAccess';
import { archiveSupabaseReceipt, hasSupabaseSession, pullSupabaseData, pushSupabaseSettings, upsertSupabaseReceipt, upsertSupabaseTrip } from './supabase';
import { filterSupersededTripQueue, mergePulledData, rawReceiptSourceId, receiptSourceTombstoneKey } from './syncMerge';
import type { AppState, Receipt, SyncEngineState, SyncQueueItem, TripProfile } from './types';
import type { Session } from '@supabase/supabase-js';

const MAX_RETRY_ATTEMPTS = 3;
const DEBOUNCE_MS = 3000;
const BACKGROUND_INTERVAL_MS = 120_000;
const MIN_SYNC_INTERVAL_MS = 30_000;

function redactError(error: unknown) {
  let raw = 'Sync failed';
  if (error instanceof Error) {
    raw = error.message;
  } else if (error && typeof error === 'object') {
    raw = (error as any).message || (error as any).error_description || (error as any).error || JSON.stringify(error);
  } else {
    raw = String(error || 'Sync failed');
  }
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/ntn_[A-Za-z0-9._-]+/g, '[redacted-notion-token]')
    .replace(/sk-[A-Za-z0-9._-]+/g, '[redacted-key]')
    .slice(0, 220);
}

function queueKey(item: SyncQueueItem) {
  return `${item.type}:${item.entityId}`;
}

function dedupeQueue(queue: SyncQueueItem[]) {
  const latest = new Map<string, SyncQueueItem>();
  for (const item of queue) {
    if (item.status === 'synced') continue;
    latest.set(queueKey(item), item);
  }
  return [...latest.values()].sort((a, b) => a.createdAt - b.createdAt);
}

function pendingCount(queue: SyncQueueItem[] = []) {
  return queue.filter((item) => item.status !== 'synced' && item.status !== 'failed' && item.status !== 'error').length;
}

function usesSharedLedger(state: AppState, receipt: Receipt): boolean {
  const trip = (state.trips || []).find((candidate) => candidate.id === receipt.tripId);
  return !!trip?.sharing?.isShared;
}

export function useSyncEngine(
  state: AppState,
  setState: Dispatch<SetStateAction<AppState>>,
  supabaseSession?: Session | null,
) {
  const stateRef = useRef(state);
  const processingRef = useRef(false);
  const debounceRef = useRef<number | null>(null);
  const tripPullDebounceRef = useRef<number | null>(null);
  const hydratedTripPullRef = useRef(false);
  const lastPulledTripIdRef = useRef('');
  const lastPushSucceededRef = useRef(true);
  const syncingRef = useRef(false);
  const aliveRef = useRef(true);

  stateRef.current = state;
  const supabaseSessionRef = useRef<Session | null | undefined>(supabaseSession);
  supabaseSessionRef.current = supabaseSession;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      processingRef.current = false;
      syncingRef.current = false;
      if (tripPullDebounceRef.current) window.clearTimeout(tripPullDebounceRef.current);
    };
  }, []);

  const engineState = useMemo<SyncEngineState>(() => ({
    status: state.globalSyncStatus || 'idle',
    lastSyncedAt: state.lastSyncedAt || 0,
    pendingCount: pendingCount(state.syncQueue),
    error: state.syncError || undefined,
  }), [state.globalSyncStatus, state.lastSyncedAt, state.syncQueue, state.syncError]);

  const updateSyncState = useCallback((patch: {
    status: SyncEngineState['status'];
    lastSyncedAt?: number;
    error?: string;
  }) => {
    if (!aliveRef.current) return;
    setState((current) => ({
      ...current,
      globalSyncStatus: patch.status,
      lastSyncedAt: patch.lastSyncedAt !== undefined ? patch.lastSyncedAt : current.lastSyncedAt,
      syncError: patch.error !== undefined ? patch.error : current.syncError,
    }));
  }, [setState]);

  const markQueueItem = useCallback((item: SyncQueueItem, patch: Partial<SyncQueueItem>) => {
    if (!aliveRef.current) return;
    setState((current) => ({
      ...current,
      syncQueue: (current.syncQueue || []).map((queued) => queued.id === item.id ? { ...queued, ...patch, updatedAt: Date.now() } : queued),
    }));
  }, [setState]);

  const removeQueueItem = useCallback((item: SyncQueueItem) => {
    if (!aliveRef.current) return;
    setState((current) => ({
      ...current,
      syncQueue: (current.syncQueue || []).filter((queued) => queued.id !== item.id),
    }));
  }, [setState]);

  const applyReceiptSyncResult = useCallback((item: SyncQueueItem, receipt: Receipt) => {
    if (!aliveRef.current) return;
    setState((current) => ({
      ...current,
      receipts: current.receipts.map((candidate) => {
        if (candidate.id !== receipt.id) return candidate;
        const queueUpdatedAt = Number(item.payload?.updatedAt || receipt.updatedAt || receipt.createdAt || 0);
        const currentUpdatedAt = Number(candidate.updatedAt || candidate.createdAt || Date.now());
        if (queueUpdatedAt && currentUpdatedAt > queueUpdatedAt) {
          return {
            ...candidate,
            notionPageId: receipt.notionPageId || candidate.notionPageId,
            sourceId: receipt.sourceId || candidate.sourceId,
            syncStatus: hasSupabaseSession(supabaseSessionRef.current) || canUseNotionMirror(current, false, (supabaseSessionRef.current as any)?.user?.email || null) ? 'queued' : 'local',
          };
        }
        const nextSyncStatus = receipt.ledgerSyncStatus === 'notion_pending' || receipt.ledgerSyncStatus === 'queued'
          ? 'queued'
          : receipt.ledgerSyncStatus === 'notion_failed' || receipt.ledgerSyncStatus === 'conflict'
            ? 'failed'
            : 'synced';
        return { ...candidate, ...receipt, syncStatus: nextSyncStatus };
      }),
    }));
  }, [setState]);

  const applyTripSyncResult = useCallback((item: SyncQueueItem, trip: TripProfile) => {
    if (!aliveRef.current) return;
    setState((current) => ({
      ...current,
      trips: (current.trips || []).map((candidate) => {
        if (candidate.id !== trip.id) return candidate;
        const queueUpdatedAt = Number(item.payload?.updatedAt || trip.updatedAt || trip.createdAt || 0);
        const currentUpdatedAt = Number(candidate.updatedAt || candidate.createdAt || Date.now());
        if (queueUpdatedAt && currentUpdatedAt > queueUpdatedAt) {
          return {
            ...candidate,
            notionPageId: trip.notionPageId || candidate.notionPageId,
            sourceId: trip.sourceId || candidate.sourceId,
          };
        }
        return { ...candidate, ...trip };
      }),
    }));
  }, [setState]);

  const settlePushStatus = useCallback((failures: number, lastError?: string) => {
    if (!aliveRef.current) return;
    lastPushSucceededRef.current = failures === 0;
    updateSyncState({
      status: failures ? 'error' : (pendingCount(stateRef.current.syncQueue) ? 'queued' : 'synced'),
      lastSyncedAt: failures ? stateRef.current.lastSyncedAt || 0 : Date.now(),
      error: failures ? lastError : '',
    });
  }, [updateSyncState]);

  const yieldToStateFlush = useCallback(() => new Promise<void>((resolve) => {
    if (!aliveRef.current) {
      resolve();
      return;
    }
    const timer = window.setTimeout(() => {
      resolve();
    }, 0);
    return () => window.clearTimeout(timer);
  }), []);

  const processItem = useCallback(async (item: SyncQueueItem) => {
    const current = stateRef.current;
    const session = supabaseSessionRef.current;
    const supabaseSession = hasSupabaseSession(session) ? session : null;
    const hasNotionSync = canUseNotionMirror(current, !!supabaseSession, session?.user?.email || null);
    if (item.type === 'receipt') {
      const receipt = current.receipts.find((candidate) => candidate.id === item.entityId);
      if (!receipt) return;
      const sharedLedger = usesSharedLedger(current, receipt);
      let synced = supabaseSession
        ? await upsertSupabaseReceipt(supabaseSession, current, { ...receipt, syncStatus: 'syncing' })
        : { ...receipt, syncStatus: 'syncing' as const };
      if (hasNotionSync && !sharedLedger) {
        if (receipt.visibility === 'private') {
          if (receipt.notionPageId) await archiveReceipt(current, receipt);
          synced = { ...synced, notionPageId: undefined };
        } else {
          synced = await pushReceipt(current, { ...synced, notionPageId: receipt.notionPageId });
        }
      }
      applyReceiptSyncResult(item, synced);
      return;
    }
    if (item.type === 'delete-receipt') {
      const tombstone = {
        id: item.entityId,
        store: '',
        total: 0,
        date: current.tripDateRange.start,
        category: 'other',
        payment: 'cash',
        notionPageId: item.payload?.notionPageId,
        supabaseId: item.payload?.supabaseId,
        tripId: item.payload?.tripId,
        sourceId: rawReceiptSourceId(item.payload?.sourceId || item.entityId, item.payload?.tripId),
        version: item.payload?.version,
        syncRevision: item.payload?.syncRevision,
      } as Receipt;
      if (hasSupabaseSession(session)) await archiveSupabaseReceipt(session, current, tombstone);
      if (hasNotionSync && !usesSharedLedger(current, tombstone)) await archiveReceipt(current, tombstone);
      return;
    }
    if (item.type === 'trip') {
      const trip = current.trips?.find((candidate) => candidate.id === item.entityId) || activeTrip(current);
      let synced = hasSupabaseSession(session) ? await upsertSupabaseTrip(session, current, trip) : trip;
      if (hasNotionSync) synced = await pushTripPage(current, synced);
      applyTripSyncResult(item, synced);
      return;
    }
    if (item.type === 'settings') {
      if (hasSupabaseSession(session)) await pushSupabaseSettings(session, current);
      if (hasNotionSync) await pushSettingsMeta(current);
      return;
    }
    if (hasNotionSync) await pushSettingsMeta(current);
  }, [applyReceiptSyncResult, applyTripSyncResult]);

  const push = useCallback(async () => {
    console.log('[SyncEngine] push() started');
    if (processingRef.current) {
      lastPushSucceededRef.current = false;
      console.log('[SyncEngine] push() skipped — already processing');
      return;
    }
    if (!navigator.onLine) {
      lastPushSucceededRef.current = false;
      updateSyncState({ status: 'offline', error: '' });
      console.log('[SyncEngine] push() skipped — offline');
      return;
    }
    if (!hasSupabaseSession(supabaseSessionRef.current) && !canUseNotionMirror(stateRef.current, false, (supabaseSessionRef.current as any)?.user?.email || null)) {
      lastPushSucceededRef.current = false;
      updateSyncState({ status: pendingCount(stateRef.current.syncQueue) ? 'queued' : 'idle', error: '' });
      console.log('[SyncEngine] push() skipped — no broker session');
      return;
    }
    processingRef.current = true;
    updateSyncState({ status: 'pushing', error: '' });
    try {
      let failures = 0;
      let lastError = '';
      for (const item of dedupeQueue(stateRef.current.syncQueue || [])) {
        if (item.status === 'failed' || item.status === 'error' || item.attempts >= MAX_RETRY_ATTEMPTS) continue;
        markQueueItem(item, { status: 'syncing' });
        try {
          await processItem(item);
          removeQueueItem(item);
        } catch (error) {
          failures += 1;
          lastError = redactError(error);
          const nextAttempts = item.attempts + 1;
          const isAuthError = lastError.toLowerCase().includes('session') ||
                              lastError.includes('401') ||
                              lastError.toLowerCase().includes('unauthorized') ||
                              lastError.toLowerCase().includes('expired');

          markQueueItem(item, {
            status: 'error', // Keep as error status, do not drop!
            attempts: nextAttempts,
            error: lastError,
          });

          if (isAuthError) {
            console.log('[SyncEngine] Auth error detected mid-push, halting queue');
            break;
          }
        }
      }
      if (aliveRef.current) {
        setState((current) => ({
          ...current,
          syncQueue: dedupeQueue(current.syncQueue || []).slice(-500),
        }));
      }
      await yieldToStateFlush();
      console.log(`[SyncEngine] push() complete — failures: ${failures}, pending: ${pendingCount(stateRef.current.syncQueue)}`);
      settlePushStatus(failures, lastError || undefined);
    } finally {
      processingRef.current = false;
    }
  }, [markQueueItem, updateSyncState, processItem, removeQueueItem, settlePushStatus, setState, yieldToStateFlush]);

  const pull = useCallback(async () => {
    console.log('[SyncEngine] pull() started');
    if (!navigator.onLine) {
      updateSyncState({ status: 'offline', error: '' });
      console.log('[SyncEngine] pull() skipped — offline');
      return;
    }
    if (!hasSupabaseSession(supabaseSessionRef.current) && !canUseNotionMirror(stateRef.current, false, (supabaseSessionRef.current as any)?.user?.email || null)) {
      updateSyncState({ status: pendingCount(stateRef.current.syncQueue) ? 'queued' : 'idle', error: '' });
      console.log('[SyncEngine] pull() skipped — no broker session');
      return;
    }
    updateSyncState({ status: 'pulling', error: '' });
    try {
      const cloudSession = hasSupabaseSession(supabaseSessionRef.current) ? supabaseSessionRef.current : null;
      const hasCloudSync = !!cloudSession;
      const hasNotionSync = canUseNotionMirror(stateRef.current, hasCloudSync, cloudSession?.user?.email || null);
      const [supabaseResult, tripsResult, receiptsResult, settingsResult] = await Promise.allSettled([
        cloudSession ? pullSupabaseData(cloudSession, stateRef.current) : Promise.resolve({ trips: [], receipts: [], tombstones: [], settings: undefined }),
        hasNotionSync ? pullTrips(stateRef.current) : Promise.resolve([]),
        hasNotionSync ? pullAll(stateRef.current) : Promise.resolve([]),
        hasNotionSync && !hasCloudSync ? pullSettingsMeta(stateRef.current) : Promise.resolve(null),
      ]);
      const supabaseData = supabaseResult.status === 'fulfilled' ? supabaseResult.value : { trips: [], receipts: [], tombstones: [] };
      const trips = [...supabaseData.trips, ...(tripsResult.status === 'fulfilled' ? tripsResult.value : [])];
      const receipts = [...supabaseData.receipts, ...(receiptsResult.status === 'fulfilled' ? receiptsResult.value : [])];
      const settingsCandidates = [
        supabaseData.settings,
        settingsResult.status === 'fulfilled' ? settingsResult.value : null,
      ].filter((candidate): candidate is Partial<AppState> => !!candidate);
      settingsCandidates.sort((a, b) => Number(a.settingsUpdatedAt || 0) - Number(b.settingsUpdatedAt || 0));
      const settings = settingsCandidates.length ? settingsCandidates[settingsCandidates.length - 1] : null;
      const pullErrors = [supabaseResult, tripsResult, receiptsResult, settingsResult]
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => redactError(result.reason));
      const mergedAt = Date.now();
      const overwrittenIds = new Set<string>();
      for (const remote of receipts) {
        const local = stateRef.current.receipts.find((r) => r.id === remote.id);
        if (!local) continue;
        const localUpdated = Number(local.updatedAt || local.createdAt || Date.now());
        const remoteUpdated = Number(remote.updatedAt || remote.createdAt || 0);
        const remoteHasMissingLink = (!local.notionPageId && !!remote.notionPageId) || (!local.sourceId && !!remote.sourceId);
        if (remoteUpdated > localUpdated || (remoteUpdated === localUpdated && remoteHasMissingLink)) {
          overwrittenIds.add(remote.id);
        }
      }
      const serverTombstoneKeys = new Set(supabaseData.tombstones.map((tombstone) =>
        receiptSourceTombstoneKey({ id: tombstone.supabaseId, sourceId: tombstone.sourceId, tripId: tombstone.tripId })));
      const prePullQueue = stateRef.current.syncQueue || [];
      const filteredQueue = filterSupersededTripQueue(
        prePullQueue,
        stateRef.current.trips || [],
        trips,
      )
        .filter((item) => !overwrittenIds.has(item.entityId))
        .filter((item) => {
          if (item.type !== 'receipt' && item.type !== 'delete-receipt') return true;
          const key = item.payload?.tombstoneKey || receiptSourceTombstoneKey({
            id: item.payload?.sourceId || item.entityId,
            sourceId: item.payload?.sourceId,
            tripId: item.payload?.tripId,
          });
          return !serverTombstoneKeys.has(key);
        });
      const pending = pendingCount(filteredQueue);
      const nextSyncedAt = pullErrors.length ? stateRef.current.lastSyncedAt || 0 : mergedAt;
      const cloudPullOk = !!cloudSession && supabaseResult.status === 'fulfilled';
      const authorizedSupabaseIds = new Set(
        supabaseData.trips.map((trip) => trip.supabaseId).filter((id): id is string => !!id),
      );
      if (aliveRef.current) {
        setState((current) => {
          const mergedBase = mergePulledData(current, receipts, trips, supabaseData.tombstones);
          let finalState = mergedBase;
          if (settings) {
            const remoteTs = Number(settings.settingsUpdatedAt || 0);
            const localTs = Number(current.settingsUpdatedAt || 0);
            if (remoteTs > localTs) {
              const settingsTrips = Array.isArray(settings.trips) ? settings.trips : [];
              const tripsById = new Map((finalState.trips || []).map((trip) => [trip.id, trip]));
              for (const trip of settingsTrips) {
                if (trip?.id) tripsById.set(trip.id, { ...tripsById.get(trip.id), ...trip });
              }
              const mergedTrips = (settingsTrips.length ? [...tripsById.values()] : finalState.trips) || [];
              const settingsActiveTripId = typeof settings.activeTripId === 'string' &&
                mergedTrips.some((trip) => trip.id === settings.activeTripId && !trip.archived)
                ? settings.activeTripId
                : undefined;
              const activeTripId = settingsActiveTripId ?? finalState.activeTripId;
              finalState = {
                ...finalState,
                budget: settings.budget ?? finalState.budget,
                rate: settings.rate ?? finalState.rate,
                tripCurrency: settings.tripCurrency ?? finalState.tripCurrency,
                notionDb: settings.notionDb ?? finalState.notionDb,
                personalNotionConnected: settings.personalNotionConnected ?? finalState.personalNotionConnected,
                autoSync: settings.autoSync ?? finalState.autoSync,
                activeTripId,
                trips: mergedTrips.map((trip) => ({ ...trip, active: trip.id === activeTripId && !trip.archived })),
                persons: settings.persons ?? finalState.persons,
                shareRatios: settings.shareRatios ?? finalState.shareRatios,
                itineraryOverrides: {
                  ...(finalState.itineraryOverrides || {}),
                  ...(settings.itineraryOverrides || {}),
                },
                statsIncludeTransportLodging: settings.statsIncludeTransportLodging ?? finalState.statsIncludeTransportLodging,
                top10IncludeBigItems: settings.top10IncludeBigItems ?? finalState.top10IncludeBigItems,
                scanModel: settings.scanModel ?? finalState.scanModel,
                voiceModel: settings.voiceModel ?? finalState.voiceModel,
                emailModel: settings.emailModel ?? finalState.emailModel,
                tripUpdateModel: settings.tripUpdateModel ?? finalState.tripUpdateModel,
                googleBackupModel: settings.googleBackupModel ?? finalState.googleBackupModel,
                credentialBrokerUrl: settings.credentialBrokerUrl ?? finalState.credentialBrokerUrl,
                notionDeletedSourceIds: settings.notionDeletedSourceIds ?? finalState.notionDeletedSourceIds,
                settingsUpdatedAt: remoteTs,
                settingsPulledAt: mergedAt,
              };
            }
          }
          let nextQueue = filteredQueue;
          if (cloudPullOk) {
            const purgedTripIds = new Set(
              (finalState.trips || [])
                .filter((trip) => trip.supabaseId && !authorizedSupabaseIds.has(trip.supabaseId))
                .map((trip) => trip.id),
            );
            if (purgedTripIds.size) {
              const removedReceiptIds = new Set(
                (finalState.receipts || []).filter((receipt) => receipt.tripId && purgedTripIds.has(receipt.tripId)).map((receipt) => receipt.id),
              );
              const remainingTrips = (finalState.trips || []).filter((trip) => !purgedTripIds.has(trip.id));
              const nextActiveTripId = remainingTrips.some((trip) => trip.id === finalState.activeTripId && !trip.archived)
                ? finalState.activeTripId
                : (remainingTrips.find((trip) => !trip.archived)?.id || remainingTrips[0]?.id || finalState.activeTripId);
              const peopleByTripId = Object.fromEntries(
                Object.entries(finalState.peopleByTripId || {}).filter(([tripId]) => !purgedTripIds.has(tripId)),
              );
              const shareRatiosByTripId = Object.fromEntries(
                Object.entries(finalState.shareRatiosByTripId || {}).filter(([tripId]) => !purgedTripIds.has(tripId)),
              );
              nextQueue = nextQueue.filter((item) =>
                !removedReceiptIds.has(item.entityId)
                && !(item.type === 'trip' && purgedTripIds.has(item.entityId))
                && !(item.payload?.tripId && purgedTripIds.has(item.payload.tripId)));
              finalState = {
                ...finalState,
                trips: remainingTrips,
                receipts: (finalState.receipts || []).filter((receipt) => !receipt.tripId || !purgedTripIds.has(receipt.tripId)),
                activeTripId: nextActiveTripId,
                peopleByTripId,
                shareRatiosByTripId,
                receiptTombstones: Object.fromEntries(
                  Object.entries(finalState.receiptTombstones || {}).filter(([, tombstone]) => !purgedTripIds.has(tombstone.tripId)),
                ),
              };
            }
          }
          return {
            ...finalState,
            syncQueue: nextQueue,
            globalSyncStatus: pullErrors.length ? 'error' : (pending ? 'queued' : 'synced'),
            lastSyncedAt: nextSyncedAt,
            syncError: pullErrors.join(' | '),
          };
        });
      }
      updateSyncState({
        status: pullErrors.length ? 'error' : (pending ? 'queued' : 'synced'),
        lastSyncedAt: nextSyncedAt,
        error: pullErrors.join(' | '),
      });
      console.log(`[SyncEngine] pull() complete — trips: ${trips.length}, receipts: ${receipts.length}, settings: ${settings ? 'yes' : 'no'}, errors: ${pullErrors.length}`);
    } catch (error) {
      const message = redactError(error);
      console.log('[SyncEngine] pull() error:', message);
      updateSyncState({ status: 'error', error: message });
    }
  }, [updateSyncState, setState]);

  const pushSettings = useCallback(async () => {
    const current = stateRef.current;
    const session = supabaseSessionRef.current;
    const hasNotionSync = canUseNotionMirror(current, hasSupabaseSession(session), session?.user?.email || null);
    if (!navigator.onLine) {
      updateSyncState({ status: 'offline', error: '' });
      return;
    }
    if (!hasSupabaseSession(session) && !hasNotionSync) {
      updateSyncState({ status: pendingCount(current.syncQueue) ? 'queued' : 'idle', error: '' });
      return;
    }
    updateSyncState({ status: 'pushing', error: '' });
    try {
      if (hasSupabaseSession(session)) await pushSupabaseSettings(session, current);
      if (hasNotionSync) await pushSettingsMeta(current);
      updateSyncState({ status: pendingCount(stateRef.current.syncQueue) ? 'queued' : 'synced', lastSyncedAt: Date.now(), error: '' });
    } catch (error) {
      updateSyncState({ status: 'error', error: redactError(error) });
      throw error;
    }
  }, [updateSyncState]);

  const sync = useCallback(async () => {
    if (syncingRef.current) {
      console.log('[SyncEngine] sync() skipped — already syncing');
      return;
    }
    syncingRef.current = true;
    console.log('[SyncEngine] sync() started');
    try {
      await push();
      await yieldToStateFlush();
      if (!navigator.onLine) {
        console.log('[SyncEngine] Offline — skipping pull');
        return;
      }
      if (!hasSupabaseSession(supabaseSessionRef.current) && !canUseNotionMirror(stateRef.current, false, (supabaseSessionRef.current as any)?.user?.email || null)) {
        console.log('[SyncEngine] No cloud session — skipping pull');
        return;
      }
      console.log('[SyncEngine] Running pull()...');
      await pull();
    } finally {
      syncingRef.current = false;
    }
  }, [pull, push, yieldToStateFlush]);

  const retryFailedItems = useCallback(() => {
    if (!aliveRef.current) return;
    setState((current) => ({
      ...current,
      syncQueue: (current.syncQueue || []).map((item) =>
        item.status === 'failed' || item.status === 'error'
          ? { ...item, status: 'queued', attempts: 0, error: undefined }
          : item
      ),
    }));
    setTimeout(() => {
      void push();
    }, 100);
  }, [setState, push]);

  useEffect(() => {
    if (!aliveRef.current || !state.activeTripId) return;
    if (!hydratedTripPullRef.current) {
      hydratedTripPullRef.current = true;
      lastPulledTripIdRef.current = state.activeTripId;
      return;
    }
    if (lastPulledTripIdRef.current === state.activeTripId) return;
    lastPulledTripIdRef.current = state.activeTripId;
    if (!navigator.onLine || (!hasSupabaseSession(supabaseSessionRef.current) && !canUseNotionMirror(state, false, (supabaseSessionRef.current as any)?.user?.email || null))) return;
    if (tripPullDebounceRef.current) window.clearTimeout(tripPullDebounceRef.current);
    tripPullDebounceRef.current = window.setTimeout(() => {
      tripPullDebounceRef.current = null;
      if (!aliveRef.current) return;
      console.log('[SyncEngine] activeTripId changed, triggering debounced pull sync...');
      void pull();
    }, 700);
    return () => {
      if (tripPullDebounceRef.current) window.clearTimeout(tripPullDebounceRef.current);
    };
  }, [state.activeTripId, state.credentialSession, state.credentialSessionExpiresAt, pull, supabaseSession]);

  useEffect(() => {
    if (!state.autoSync || !pendingCount(state.syncQueue) || (!hasSupabaseSession(supabaseSession) && !canUseNotionMirror(state, false, (supabaseSession as any)?.user?.email || null))) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => void push(), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [push, state.autoSync, state.credentialSession, state.credentialSessionExpiresAt, state.syncQueue, supabaseSession]);

  useEffect(() => {
    const onOnline = () => {
      if (stateRef.current.autoSync) void sync();
    };
    const onVisibility = () => {
      if (!document.hidden && stateRef.current.autoSync && Date.now() - (stateRef.current.lastSyncedAt || 0) >= MIN_SYNC_INTERVAL_MS) void sync();
    };
    const timer = window.setInterval(() => {
      if (stateRef.current.autoSync && Date.now() - (stateRef.current.lastSyncedAt || 0) >= MIN_SYNC_INTERVAL_MS) void sync();
    }, BACKGROUND_INTERVAL_MS);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [sync]);

  return useMemo(() => ({ engineState, pull, push, pushSettings, sync, retryFailedItems }), [engineState, pull, push, pushSettings, sync, retryFailedItems]);
}
