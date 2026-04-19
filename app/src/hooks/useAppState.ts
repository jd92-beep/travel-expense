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

  const deleteReceipt = useCallback((id: string) => {
    setState((s) => ({ ...s, receipts: s.receipts.filter((r) => r.id !== id) }));
  }, []);

  const updateState = useCallback((patch: Partial<AppState>) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  return { state, setState, addReceipt, updateReceipt, deleteReceipt, updateState };
}
