import type { AppState } from './types';

export const SUPPORTED_CURRENCIES = ['JPY', 'HKD', 'USD', 'KRW', 'TWD', 'CNY', 'EUR', 'GBP', 'AUD', 'SGD', 'THB', 'MYR', 'VND', 'CAD', 'NZD', 'CHF', 'PHP'] as const;

export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number];

export interface CurrencySnapshot {
  base: 'HKD';
  rates: Record<string, number>;
  fetchedAt: number;
  source: string;
}

const CACHE_KEY = 'boss-japan-tracker:react-currency';
const MAX_AGE = 60 * 60 * 1000;

function jpyPerHkd(state: AppState): number {
  return Math.max(0.1, Number(state.rate) || 20.36);
}

export function isCurrencyCode(value: string): value is CurrencyCode {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export function loadCurrencySnapshot(): CurrencySnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CurrencySnapshot;
    if (!parsed || parsed.base !== 'HKD' || !parsed.rates || typeof parsed.fetchedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function fetchLiveCurrencySnapshot(): Promise<CurrencySnapshot> {
  const response = await fetch('https://open.er-api.com/v6/latest/HKD');
  if (!response.ok) throw new Error(`FX ${response.status}: ${(await response.text()).slice(0, 160)}`);
  const data = await response.json();
  const rates = data?.rates || {};
  if (data?.result !== 'success' || !Number(rates.JPY)) throw new Error('FX 回覆缺少 JPY rate');
  const snapshot: CurrencySnapshot = {
    base: 'HKD',
    rates: { ...rates, HKD: 1 },
    fetchedAt: Date.now(),
    source: data?.provider || 'open.er-api.com',
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  return snapshot;
}

export function usableSnapshot(snapshot: CurrencySnapshot | null): CurrencySnapshot | null {
  if (!snapshot) return null;
  return Date.now() - snapshot.fetchedAt < MAX_AGE ? snapshot : snapshot;
}

export function convertAmount(amount: number, from: string, to: string, state: AppState, snapshot: CurrencySnapshot | null): number | null {
  const n = Number(amount) || 0;
  if (from === to) return n;
  const rate = jpyPerHkd(state);
  if (from === 'JPY' && to === 'HKD') return n / rate;
  if (from === 'HKD' && to === 'JPY') return n * rate;
  const rates = usableSnapshot(snapshot)?.rates;
  if (!rates || !Number(rates[from]) || !Number(rates[to])) return null;
  const hkd = n / Number(rates[from]);
  return hkd * Number(rates[to]);
}

