import { useState, useEffect, useCallback } from 'react';
import type { AppState, Receipt } from '@/lib/types';
import { loadState, saveState } from '@/lib/storage';

export function useAppState() {
  const [state, setState] = useState<AppState>(() => loadState());

  useEffect(() => {
    saveState(state);
  }, [state]);

  const updateState = useCallback((updates: Partial<AppState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const addReceipt = useCallback((receipt: Receipt) => {
    setState(prev => ({ ...prev, receipts: [receipt, ...prev.receipts] }));
  }, []);

  const updateReceipt = useCallback((id: string, updates: Partial<Receipt>) => {
    setState(prev => ({
      ...prev,
      receipts: prev.receipts.map(r => r.id === id ? { ...r, ...updates } : r),
    }));
  }, []);

  const deleteReceipt = useCallback((id: string) => {
    setState(prev => ({ ...prev, receipts: prev.receipts.filter(r => r.id !== id) }));
  }, []);

  const clearAll = useCallback(() => {
    setState(prev => ({ ...prev, receipts: [] }));
  }, []);

  return { state, updateState, addReceipt, updateReceipt, deleteReceipt, clearAll };
}
