import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { activeTrip } from '../domain/trip/normalize';
import { archiveReceipt, pullAll, pullTrips, pushReceipt, pushSettingsMeta, pushTripPage } from './notion';
import { hasCredentialBrokerSession } from './credentialBroker';
import { mergePulledData } from './syncMerge';
import type { AppState, Receipt, SyncEngineState, SyncQueueItem, TripProfile } from './types';

const MAX_RETRY_ATTEMPTS = 3;
const DEBOUNCE_MS = 3000;
const BACKGROUND_INTERVAL_MS = 120_000;
const MIN_SYNC_INTERVAL_MS = 30_000;

function redactError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || 'Sync failed');
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
    if (item.status === 'synced' || item.attempts >= MAX_RETRY_ATTEMPTS) continue;
    latest.set(queueKey(item), item);
  }
  return [...latest.values()].sort((a, b) => a.createdAt - b.createdAt);
}

function pendingCount(queue: SyncQueueItem[] = []) {
  return queue.filter((item) => item.status !== 'synced' && item.attempts < MAX_RETRY_ATTEMPTS).length;
}

export function useSyncEngine(
  state: AppState,
  setState: Dispatch<SetStateAction<AppState>>,
) {
  const stateRef = useRef(state);
  const processingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushSucceededRef = useRef(true);

  stateRef.current = state;

  const [engineState, setEngineState] = useState<SyncEngineState>({
    status: state.globalSyncStatus || 'idle',
    lastSyncedAt: state.lastSyncedAt || 0,
    pendingCount: pendingCount(state.syncQueue),
    error: state.syncError,
  });

  const persistEngine = useCallback((patch: Partial<SyncEngineState>) => {
    setEngineState((prev) => {
      const next = { ...prev, ...patch };
      setState((current) => ({
        ...current,
        globalSyncStatus: next.status,
        lastSyncedAt: next.lastSyncedAt,
        syncError: next.error || '',
      }));
      return next;
    });
  }, [setState]);

  const markQueueItem = useCallback((item: SyncQueueItem, patch: Partial<SyncQueueItem>) => {
    setState((current) => ({
      ...current,
      syncQueue: (current.syncQueue || []).map((queued) => queued.id === item.id ? { ...queued, ...patch, updatedAt: Date.now() } : queued),
    }));
  }, [setState]);

  const removeQueueItem = useCallback((item: SyncQueueItem) => {
    setState((current) => ({
      ...current,
      syncQueue: (current.syncQueue || []).filter((queued) => queued.id !== item.id),
    }));
  }, [setState]);

  const applyReceiptSyncResult = useCallback((item: SyncQueueItem, receipt: Receipt) => {
    setState((current) => ({
      ...current,
      receipts: current.receipts.map((candidate) => {
        if (candidate.id !== receipt.id) return candidate;
        const queueUpdatedAt = Number(item.payload?.updatedAt || receipt.updatedAt || 0);
        const currentUpdatedAt = Number(candidate.updatedAt || 0);
        if (queueUpdatedAt && currentUpdatedAt > queueUpdatedAt) {
          return {
            ...candidate,
            notionPageId: receipt.notionPageId || candidate.notionPageId,
            sourceId: receipt.sourceId || candidate.sourceId,
          };
        }
        return { ...candidate, ...receipt, syncStatus: 'synced' };
      }),
    }));
  }, [setState]);

  const applyTripSyncResult = useCallback((item: SyncQueueItem, trip: TripProfile) => {
    setState((current) => ({
      ...current,
      trips: (current.trips || []).map((candidate) => {
        if (candidate.id !== trip.id) return candidate;
        const queueUpdatedAt = Number(item.payload?.updatedAt || trip.updatedAt || 0);
        const currentUpdatedAt = Number(candidate.updatedAt || 0);
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
    const pending = pendingCount(stateRef.current.syncQueue);
    lastPushSucceededRef.current = failures === 0;
    persistEngine({
      status: failures ? 'error' : (pending ? 'queued' : 'synced'),
      pendingCount: pending,
      lastSyncedAt: failures ? stateRef.current.lastSyncedAt || 0 : Date.now(),
      error: failures ? lastError : undefined,
    });
  }, [persistEngine]);

  const yieldToStateFlush = useCallback(() => new Promise<void>((resolve) => {
    window.setTimeout(() => resolve(), 0);
  }), []);

  const processItem = useCallback(async (item: SyncQueueItem) => {
    const current = stateRef.current;
    if (item.type === 'receipt') {
      const receipt = current.receipts.find((candidate) => candidate.id === item.entityId);
      if (!receipt) return;
      const synced = await pushReceipt(current, { ...receipt, syncStatus: 'syncing' });
      applyReceiptSyncResult(item, synced);
      return;
    }
    if (item.type === 'delete-receipt') {
      await archiveReceipt(current, {
        id: item.entityId,
        store: '',
        total: 0,
        date: current.tripDateRange.start,
        category: 'other',
        payment: 'cash',
        notionPageId: item.payload?.notionPageId,
        sourceId: item.payload?.sourceId || item.entityId,
      });
      return;
    }
    if (item.type === 'trip') {
      const trip = current.trips?.find((candidate) => candidate.id === item.entityId) || activeTrip(current);
      const synced = await pushTripPage(current, trip);
      applyTripSyncResult(item, synced);
      return;
    }
    await pushSettingsMeta(current);
  }, [applyReceiptSyncResult, applyTripSyncResult, setState]);

  const push = useCallback(async () => {
    if (processingRef.current) {
      lastPushSucceededRef.current = false;
      return;
    }
    if (!navigator.onLine) {
      lastPushSucceededRef.current = false;
      persistEngine({ status: 'offline', pendingCount: pendingCount(stateRef.current.syncQueue), error: undefined });
      return;
    }
    if (!hasCredentialBrokerSession(stateRef.current)) {
      lastPushSucceededRef.current = false;
      persistEngine({ status: pendingCount(stateRef.current.syncQueue) ? 'queued' : 'idle', pendingCount: pendingCount(stateRef.current.syncQueue), error: undefined });
      return;
    }
    processingRef.current = true;
    persistEngine({ status: 'pushing', pendingCount: pendingCount(stateRef.current.syncQueue), error: undefined });
    try {
      let failures = 0;
      let lastError = '';
      for (const item of dedupeQueue(stateRef.current.syncQueue || [])) {
        markQueueItem(item, { status: 'syncing' });
        try {
          await processItem(item);
          removeQueueItem(item);
        } catch (error) {
          failures += 1;
          lastError = redactError(error);
          markQueueItem(item, { status: 'error', attempts: item.attempts + 1, error: lastError });
        }
      }
      setState((current) => ({
        ...current,
        syncQueue: dedupeQueue(current.syncQueue || []).slice(-500),
      }));
      await yieldToStateFlush();
      settlePushStatus(failures, lastError || undefined);
    } finally {
      processingRef.current = false;
    }
  }, [markQueueItem, persistEngine, processItem, removeQueueItem, settlePushStatus]);

  const pull = useCallback(async () => {
    if (!navigator.onLine) {
      persistEngine({ status: 'offline', pendingCount: pendingCount(stateRef.current.syncQueue), error: undefined });
      return;
    }
    if (!hasCredentialBrokerSession(stateRef.current)) {
      persistEngine({ status: pendingCount(stateRef.current.syncQueue) ? 'queued' : 'idle', pendingCount: pendingCount(stateRef.current.syncQueue), error: undefined });
      return;
    }
    persistEngine({ status: 'pulling', error: undefined });
    try {
      const [tripsResult, receiptsResult] = await Promise.allSettled([
        pullTrips(stateRef.current),
        pullAll(stateRef.current),
      ]);
      const trips = tripsResult.status === 'fulfilled' ? tripsResult.value : [];
      const receipts = receiptsResult.status === 'fulfilled' ? receiptsResult.value : [];
      const pullErrors = [tripsResult, receiptsResult]
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => redactError(result.reason));
      const mergedAt = Date.now();
      const pending = pendingCount(stateRef.current.syncQueue);
      const nextSyncedAt = pullErrors.length ? stateRef.current.lastSyncedAt || 0 : mergedAt;
      setState((current) => ({
        ...mergePulledData(current, receipts, trips),
        globalSyncStatus: pullErrors.length ? 'error' : (pending ? 'queued' : 'synced'),
        lastSyncedAt: nextSyncedAt,
        syncError: pullErrors.join(' | '),
      }));
      persistEngine({
        status: pullErrors.length ? 'error' : (pending ? 'queued' : 'synced'),
        lastSyncedAt: nextSyncedAt,
        pendingCount: pending,
        error: pullErrors.join(' | ') || undefined,
      });
    } catch (error) {
      const message = redactError(error);
      persistEngine({ status: 'error', pendingCount: pendingCount(stateRef.current.syncQueue), error: message });
    }
  }, [persistEngine, setState]);

  const sync = useCallback(async () => {
    await push();
    await yieldToStateFlush();
    if (lastPushSucceededRef.current) {
      await pull();
    }
  }, [pull, push, yieldToStateFlush]);

  useEffect(() => {
    setEngineState((prev) => ({
      ...prev,
      pendingCount: pendingCount(state.syncQueue),
      status: state.globalSyncStatus ?? prev.status,
      error: state.syncError ?? '',
    }));
    if (!state.autoSync || !pendingCount(state.syncQueue) || !hasCredentialBrokerSession(state)) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => void push(), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [push, state.autoSync, state.credentialSession, state.credentialSessionExpiresAt, state.globalSyncStatus, state.syncError, state.syncQueue]);

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

  return useMemo(() => ({ engineState, pull, push, sync }), [engineState, pull, push, sync]);
}
