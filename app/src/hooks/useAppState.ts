import { useCallback, useEffect, useState } from 'react';
import type { AppState, Receipt } from '@/lib/types';
import { loadState, saveState } from '@/lib/storage';

export function useAppState() {
  const [state, setState] = useState<AppState>(() => loadState());

  useEffect(() => {
    saveState(state);
  }, [state]);

  const addReceipt = useCallback((r: Receipt) => {
    setState((s) => ({ ...s, receipts: [r, ...s.receipts] }));
  }, []);

  const updateReceipt = useCallback((id: string, patch: Partial<Receipt>) => {
    setState((s) => ({
      ...s,
      receipts: s.receipts.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }, []);

  const upsertReceipt = useCallback((r: Receipt) => {
    setState((s) => {
      const idx = s.receipts.findIndex((x) => x.id === r.id);
      if (idx < 0) return { ...s, receipts: [r, ...s.receipts] };
      const next = s.receipts.slice();
      next[idx] = { ...next[idx], ...r };
      return { ...s, receipts: next };
    });
  }, []);

  const deleteReceipt = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      receipts: s.receipts.filter((r) => r.id !== id),
      notionDeletedIds: [...(s.notionDeletedIds || []), id],
    }));
  }, []);

  const updateState = useCallback((patch: Partial<AppState>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  const replaceReceipts = useCallback((rs: Receipt[]) => {
    setState((s) => ({ ...s, receipts: rs }));
  }, []);

  return {
    state,
    setState,
    addReceipt,
    updateReceipt,
    upsertReceipt,
    deleteReceipt,
    updateState,
    replaceReceipts,
  };
}
