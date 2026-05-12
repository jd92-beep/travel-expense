import { useCallback, useEffect, useState } from 'react';
import { migrateAppState, stampReceiptForTrip } from '../domain/trip/normalize';
import { DEFAULT_STATE } from './constants';
import { hasCredentialBrokerSession } from './credentialBroker';
import { hasDirectNotionToken } from './notion';
import { clearStoredCredentials, loadState, saveState } from './storage';
import { clearIndexedState, loadIndexedState } from '../storage/indexedDb';
import { clearDeviceTrust } from '../security/deviceTrust';
import { clearCurrencyCache } from './currency';
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

export function useAppState() {
  const [state, setState] = useState<AppState>(() => loadState());

  useEffect(() => {
    let alive = true;
    loadIndexedState().then((indexed) => {
      if (!alive || !indexed) return;
      setState((prev) => {
        const indexedWins = stateFreshness(indexed) > stateFreshness(prev);
        return migrateAppState(indexedWins ? { ...prev, ...indexed } : { ...indexed, ...prev });
      });
    }).catch(() => {
      // localStorage remains the compatibility fallback.
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    try {
      saveState(migrateAppState(state));
    } catch (error) {
      console.warn('[useAppState] Persist failed:', error instanceof Error ? error.message : String(error));
    }
  }, [state]);

  const updateState = useCallback((patch: Partial<AppState>) => {
    setState((prev) => migrateAppState({ ...prev, ...patch, settingsUpdatedAt: Date.now() }));
  }, []);

  const upsertReceipt = useCallback((receipt: Receipt) => {
    setState((prev) => {
      const shouldQueue = prev.autoSync && (hasCredentialBrokerSession(prev) || hasDirectNotionToken());
      const stamped = stampReceiptForTrip(prev, {
        ...receipt,
        syncStatus: shouldQueue ? 'queued' : 'local',
      });
      const idx = prev.receipts.findIndex((r) => r.id === receipt.id);
      const syncQueue = prev.autoSync && (hasCredentialBrokerSession(prev) || hasDirectNotionToken())
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
  }, []);

  const deleteReceipt = useCallback((receipt: Receipt) => {
    const sourceId = receipt.sourceId || receipt.id;
    setState((prev) => ({
      ...prev,
      receipts: prev.receipts.filter((r) => r.id !== receipt.id),
      notionDeletedIds: receipt.notionPageId
        ? [...(prev.notionDeletedIds || []), receipt.notionPageId].slice(-500)
        : prev.notionDeletedIds,
      notionDeletedSourceIds: sourceId
        ? [...(prev.notionDeletedSourceIds || []), sourceId].slice(-500)
        : prev.notionDeletedSourceIds,
      syncQueue: prev.autoSync && (hasCredentialBrokerSession(prev) || hasDirectNotionToken())
        ? enqueueSyncItem(prev.syncQueue, queueItem('delete-receipt', receipt.id, 'delete', {
            notionPageId: receipt.notionPageId,
            sourceId,
            updatedAt: receipt.updatedAt,
          }))
        : prev.syncQueue,
    }));
  }, []);

  const resetLocal = useCallback(() => {
    void clearIndexedState();
    clearStoredCredentials();
    clearDeviceTrust();
    clearCurrencyCache();
    setState({ ...DEFAULT_STATE, receipts: [] });
  }, []);

  return { state, setState, updateState, upsertReceipt, deleteReceipt, resetLocal };
}
