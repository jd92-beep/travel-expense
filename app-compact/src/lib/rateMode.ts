import { appRatePatchFromSnapshot, fetchLiveCurrencySnapshot, loadCurrencySnapshot, perHkdForCurrency } from './currency';
import type { AppState } from './types';

// Shared by Settings 匯率設定, the Scan rate sheet and the receipt editor so every surface
// confirms a live/fixed choice the same way.
export const MIN_FIXED_RATE = 0.01;
export const MAX_FIXED_RATE = 1_000_000;

export function rateCurrency(state: AppState): string {
  return String(state.tripCurrency || 'JPY').toUpperCase();
}

export function isValidFixedRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= MIN_FIXED_RATE && rate <= MAX_FIXED_RATE;
}

export function fixedRatePatch(state: AppState, code: string, rate: number): Partial<AppState> {
  return {
    rateMode: 'fixed',
    rate,
    rateTable: { ...state.rateTable, [code]: { currency: code, perHkd: rate, source: 'manual', fetchedAt: Date.now() } },
  };
}

// The rate the user typed in Settings (or the Scan sheet) while fixed mode is confirmed.
export function settingsFixedRate(state: AppState, code: string): number | undefined {
  if (state.rateMode !== 'fixed') return undefined;
  const rate = perHkdForCurrency(state, code);
  return Number.isFinite(rate) && rate > 0 ? rate : undefined;
}

// Best known market rate without a network call: cached snapshot first, then live-mode state.
export function knownLiveRate(state: AppState, code: string): number | undefined {
  if (code === 'HKD') return 1;
  const cached = Number(loadCurrencySnapshot()?.rates?.[code]);
  if (Number.isFinite(cached) && cached > 0) return cached;
  if (state.rateMode === 'fixed') return undefined;
  const rate = perHkdForCurrency(state, code);
  return Number.isFinite(rate) && rate > 0 ? rate : undefined;
}

/** Fetches a live snapshot and returns the patch that confirms live mode, or throws. */
export async function confirmLiveRate(code: string): Promise<{ patch: Partial<AppState>; rate: number }> {
  const snapshot = await fetchLiveCurrencySnapshot();
  const rate = Number(snapshot.rates[code]);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`未取得有效嘅 ${code} 即時匯率`);
  return { patch: { ...appRatePatchFromSnapshot(snapshot), rateMode: 'live' }, rate };
}

export function formatRate(rate: number | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return '—';
  return rate >= 100 ? rate.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(Number(rate.toFixed(4)));
}
