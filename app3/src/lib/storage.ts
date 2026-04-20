import type { AppState } from './types';

export const STORAGE_KEY = 'boss-japan-tracker';

export const DEFAULT_STATE: AppState = {
  receipts: [],
  budget: 101800,
  rate: 19.93,
  apiKey: '',
  scanModel: 'gemini-2.5-flash',
  notionToken: '',
  notionDb: '',
  proxy: 'https://corsproxy.io/?',
  autoSync: false,
  persons: [],
  shareRatios: {},
  tripName: '2026 名古屋之旅',
  tripDateRange: { start: '2026-04-20', end: '2026-04-25' },
  statsIncludeTransportLodging: true,
};

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable
  }
}
