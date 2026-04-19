import { STORAGE_KEY, DEFAULT_BUDGET, DEFAULT_RATE } from './constants';
import type { AppState } from './types';

const DEFAULT_STATE: AppState = {
  receipts: [],
  budget: DEFAULT_BUDGET,
  rate: DEFAULT_RATE,
  currency: 'JPY',
  model: 'gemini-3.1-pro-preview',
  notionToken: '',
  notionDb: '',
  proxy: 'https://corsproxy.io/?',
  autoSync: false,
  itineraryOverrides: {},
};

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed, receipts: Array.isArray(parsed.receipts) ? parsed.receipts : [] };
  } catch (e) {
    console.warn('[storage] load failed', e);
    return { ...DEFAULT_STATE };
  }
}

export function saveState(s: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch (e) {
    console.warn('[storage] save failed', e);
  }
}
