import { useCallback, useEffect, useState } from 'react';
import { migrateAppState, stampReceiptForTrip } from '../domain/trip/normalize';
import { DEFAULT_STATE } from './constants';
import { hasCredentialBrokerSession } from './credentialBroker';
import { loadState, saveState } from './storage';
import { clearIndexedState, loadIndexedState } from '../storage/indexedDb';
import type { AppState, Receipt, SyncQueueItem } from './types';

function queueItem(type: SyncQueueItem['type'], entityId: string, op: SyncQueueItem['op']): SyncQueueItem {
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
  };
}

export function useAppState() {
  const [state, setState] = useState<AppState>(() => loadState());

  useEffect(() => {
    let alive = true;
    loadIndexedState().then((indexed) => {
      if (!alive || !indexed) return;
      setState((prev) => migrateAppState({ ...indexed, ...prev }));
    }).catch(() => {
      // localStorage remains the compatibility fallback.
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    saveState(migrateAppState(state));
  }, [state]);

  const updateState = useCallback((patch: Partial<AppState>) => {
    setState((prev) => migrateAppState({ ...prev, ...patch, settingsUpdatedAt: Date.now() }));
  }, []);

  const upsertReceipt = useCallback((receipt: Receipt) => {
    setState((prev) => {
      const stamped = stampReceiptForTrip(prev, {
        ...receipt,
        syncStatus: receipt.syncStatus || (prev.autoSync && hasCredentialBrokerSession(prev) ? 'queued' : 'local'),
      });
      const idx = prev.receipts.findIndex((r) => r.id === receipt.id);
      const syncQueue = prev.autoSync && hasCredentialBrokerSession(prev)
        ? [...(prev.syncQueue || []), queueItem('receipt', stamped.id, idx < 0 ? 'create' : 'update')].slice(-500)
        : prev.syncQueue;
      if (idx < 0) return { ...prev, receipts: [...prev.receipts, stamped], syncQueue };
      const next = prev.receipts.slice();
      next[idx] = { ...next[idx], ...stamped };
      return { ...prev, receipts: next, syncQueue };
    });
  }, []);

  const deleteReceipt = useCallback((receipt: Receipt) => {
    setState((prev) => ({
      ...prev,
      receipts: prev.receipts.filter((r) => r.id !== receipt.id),
      notionDeletedIds: receipt.notionPageId
        ? [...(prev.notionDeletedIds || []), receipt.notionPageId].slice(-500)
        : prev.notionDeletedIds,
      notionDeletedSourceIds: receipt.id.startsWith('email_')
        ? [...(prev.notionDeletedSourceIds || []), receipt.id].slice(-500)
        : prev.notionDeletedSourceIds,
      syncQueue: prev.autoSync && hasCredentialBrokerSession(prev)
        ? [...(prev.syncQueue || []), queueItem('delete-receipt', receipt.id, 'delete')].slice(-500)
        : prev.syncQueue,
    }));
  }, []);

  const resetLocal = useCallback(() => {
    void clearIndexedState();
    setState({ ...DEFAULT_STATE, receipts: [] });
  }, []);

  return { state, setState, updateState, upsertReceipt, deleteReceipt, resetLocal };
}
