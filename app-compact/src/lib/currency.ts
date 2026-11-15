import type { AppState, ExchangeRateEntry } from './types';

export const SUPPORTED_CURRENCIES = [
  'JPY', 'HKD', 'USD', 'KRW', 'TWD', 'CNY', 'EUR', 'GBP', 'AUD', 'SGD', 'THB', 'MYR', 'VND', 'CAD', 'NZD', 'CHF', 'PHP',
  // Phase 1 multi-currency expansion: Europe / Middle East / India / SEA.
  'CZK', 'DKK', 'NOK', 'SEK', 'PLN', 'HUF', 'RON', 'TRY', 'ISK', 'AED', 'SAR', 'ILS', 'INR', 'IDR', 'EGP',
] as const;

export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number];

export const FALLBACK_PER_HKD: Record<string, number> = {
  HKD: 1,
  JPY: 20.36,
  KRW: 175,
  USD: 0.128,
  TWD: 4,
  CNY: 0.92,
  EUR: 0.118,
  GBP: 0.1,
  AUD: 0.195,
  SGD: 0.173,
  THB: 4.7,
  MYR: 0.6,
  VND: 3250,
  CAD: 0.175,
  NZD: 0.21,
  CHF: 0.114,
  PHP: 7.2,
  // --- Phase 1 expansion: coarse offline fallbacks only (units of currency per 1 HKD).
  // Live fetch (open.er-api, ~160 codes) always overrides these when available — these
  // exist purely so the app never silently treats these currencies as 1:1 HKD offline.
  CZK: 2.9,
  DKK: 0.87,
  NOK: 1.35,
  SEK: 1.32,
  PLN: 0.5,
  HUF: 45,
  RON: 0.58,
  TRY: 5.2,
  ISK: 17.5,
  AED: 0.47,
  SAR: 0.48,
  ILS: 0.43,
  INR: 11,
  IDR: 2050,
  EGP: 6.3,
};

// Dev-only self-check: every SUPPORTED_CURRENCIES code must have a FALLBACK_PER_HKD entry,
// otherwise offline conversion silently treats it as 1:1 HKD (the exact bug this Phase 1
// expansion fixes). Runs once at module load; cheap, so no extra guard is needed.
if (import.meta.env?.DEV) {
  for (const code of SUPPORTED_CURRENCIES) {
    if (!(code in FALLBACK_PER_HKD)) {
      console.warn(`[currency] SUPPORTED_CURRENCIES 缺少 FALLBACK_PER_HKD['${code}'] — 離線時會靜默當 1:1 兌 HKD`);
    }
  }
}

const CURRENCY_PREFIX: Record<string, string> = {
  HKD: 'HK$',
  JPY: '¥',
  KRW: '₩',
  USD: 'US$',
  TWD: 'NT$',
  CNY: '¥',
  EUR: '€',
  GBP: '£',
  AUD: 'A$',
  SGD: 'S$',
  THB: '฿',
  MYR: 'RM',
  VND: '₫',
  CAD: 'C$',
  NZD: 'NZ$',
  CHF: 'CHF',
  PHP: '₱',
  // --- Phase 1 expansion.
  CZK: 'Kč ',
  DKK: 'DKr ',
  NOK: 'NKr ',
  SEK: 'SKr ',
  PLN: 'zł ',
  HUF: 'Ft ',
  RON: 'lei ',
  TRY: '₺',
  ISK: 'IKr ',
  AED: 'AED ',
  SAR: 'SAR ',
  ILS: '₪',
  INR: '₹',
  IDR: 'Rp ',
  EGP: 'EGP ',
};

export interface CurrencySnapshot {
  base: 'HKD';
  rates: Record<string, number>;
  fetchedAt: number;
  source: string;
  // Provider publication time is distinct from the local retrieval time. Older caches omit it.
  updatedAt?: number;
  nextUpdateAt?: number;
}

const CACHE_KEY = 'boss-japan-tracker:react-currency';
const MAX_AGE = 60 * 60 * 1000; // 1 hour cache
const MAX_PUBLICATION_AGE = 3 * 24 * MAX_AGE;
const REQUEST_TIMEOUT = 8_000;
let pendingSnapshot: Promise<CurrencySnapshot> | undefined;

function jpyPerHkd(state: AppState): number {
  const rate = Number(state.rate);
  return Number.isFinite(rate) && rate > 0 ? rate : 20.36;
}

export function perHkdForCurrency(state: AppState, currency = 'JPY'): number {
  const code = String(currency || 'JPY').toUpperCase();
  if (code === 'HKD') return 1;
  const explicit = Number(state.rateTable?.[code]?.perHkd);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (code === 'JPY') return jpyPerHkd(state);
  return FALLBACK_PER_HKD[code] || 1;
}

export function amountToHkd(amount: number, currency: string, state: AppState): number {
  const code = String(currency || 'JPY').toUpperCase();
  const value = Number(amount) || 0;
  if (code === 'HKD') return value;
  return value / perHkdForCurrency(state, code);
}

export function hkdToCurrency(amountHkd: number, currency: string, state: AppState): number {
  const code = String(currency || 'JPY').toUpperCase();
  const value = Number(amountHkd) || 0;
  if (code === 'HKD') return value;
  return value * perHkdForCurrency(state, code);
}

export function rateTableFromSnapshot(snapshot: CurrencySnapshot): Record<string, ExchangeRateEntry> {
  const now = Number(snapshot.fetchedAt) || Date.now();
  return Object.fromEntries(
    Object.entries(snapshot.rates || {})
      .filter(([code, rate]) => code && Number.isFinite(Number(rate)) && Number(rate) > 0)
      .map(([code, rate]) => [
        code.toUpperCase(),
        {
          currency: code.toUpperCase(),
          perHkd: Number(rate),
          source: snapshot.source || 'unknown',
          fetchedAt: now,
        },
      ]),
  );
}

export function appRatePatchFromSnapshot(snapshot: CurrencySnapshot): Partial<AppState> {
  const rateTable = rateTableFromSnapshot(snapshot);
  return {
    rate: Number(snapshot.rates?.JPY?.toFixed?.(4) || snapshot.rates?.JPY || 20.36),
    rateTable,
  };
}

export function currencyPrefix(currency: string): string {
  const code = String(currency || '').toUpperCase();
  return CURRENCY_PREFIX[code] || `${code} `;
}

// Reuse per-currency formatters for receipt lists; ISO 4217 minor units preserve HKD cents.
const amountFormatters = new Map<string, Intl.NumberFormat>();

export function formatCurrencyAmount(amount: number, currency: string): string {
  const code = String(currency || '').toUpperCase();
  const prefix = currencyPrefix(code);
  const value = Number(amount) || 0;
  let formatter = amountFormatters.get(code);
  if (!formatter) {
    const decimals = /^[A-Z]{3}$/.test(code)
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits
      : 2;
    formatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    amountFormatters.set(code, formatter);
  }
  const formatted = formatter.format(value);
  return prefix.endsWith(' ') ? `${prefix}${formatted}` : `${prefix} ${formatted}`;
}

export function isCurrencyCode(value: string): value is CurrencyCode {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export function loadCurrencySnapshot(): CurrencySnapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CurrencySnapshot;
    if (!parsed || parsed.base !== 'HKD' || !parsed.rates || !Number.isFinite(parsed.fetchedAt)
      || !Number.isFinite(new Date(parsed.fetchedAt).getTime())
      || parsed.rates.HKD !== 1 || !Number.isFinite(parsed.rates.JPY) || parsed.rates.JPY <= 0) return null;
    for (const time of [parsed.updatedAt, parsed.nextUpdateAt]) {
      if (time != null && (!Number.isFinite(time) || time <= 0 || !Number.isFinite(new Date(time).getTime()))) return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearCurrencyCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Best effort only.
  }
}

function persistCurrencySnapshot(snapshot: CurrencySnapshot): CurrencySnapshot {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Currency cache is opportunistic; conversion still works with in-memory data.
  }
  return snapshot;
}

async function fetchExchangeRateSnapshot(): Promise<CurrencySnapshot> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const response = await fetch('https://open.er-api.com/v6/latest/HKD', { signal: controller.signal });
    if (!response.ok) throw new Error(`FX ${response.status}`);
    const data = await response.json();
    const rawRates = data?.rates || {};
    if (data?.result !== 'success' || (data.base_code && data.base_code !== 'HKD')
      || !Number.isFinite(rawRates.JPY) || rawRates.JPY <= 0 || rawRates.HKD !== 1) {
      throw new Error('FX 回覆缺少有效 HKD 基準匯率');
    }
    const rates = Object.fromEntries(Object.entries(rawRates)
      .filter(([code, rate]) => /^[A-Z]{3}$/.test(code) && typeof rate === 'number' && Number.isFinite(rate) && rate > 0)) as Record<string, number>;
    const timestamp = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value * 1000 : undefined;
    const snapshot: CurrencySnapshot = {
      base: 'HKD', rates, fetchedAt: Date.now(), source: 'https://www.exchangerate-api.com',
      updatedAt: timestamp(data.time_last_update_unix), nextUpdateAt: timestamp(data.time_next_update_unix),
    };
    if (!usableSnapshot(snapshot)) throw new Error('匯率資料已過期或發布時間無效，請稍後再試。');
    return persistCurrencySnapshot(snapshot);
  } catch (error) {
    if (controller.signal.aborted) throw new Error('匯率請求逾時，請重試。');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// One shared request for overlapping boot, Settings and calculator refreshes. Explicit refreshes
// still contact the provider; a completed response is not silently reused as a new fetch.
export function fetchLiveCurrencySnapshot(): Promise<CurrencySnapshot> {
  pendingSnapshot ||= fetchExchangeRateSnapshot().finally(() => { pendingSnapshot = undefined; });
  return pendingSnapshot;
}

export function usableSnapshot(snapshot: CurrencySnapshot | null): CurrencySnapshot | null {
  if (!snapshot) return null;
  const now = Date.now();
  const age = now - snapshot.fetchedAt;
  if (!Number.isFinite(age) || age < 0 || age >= MAX_AGE) return null;
  if (snapshot.updatedAt != null && (!Number.isFinite(snapshot.updatedAt)
    || snapshot.updatedAt > now + 5 * 60 * 1000 || now - snapshot.updatedAt > MAX_PUBLICATION_AGE)) return null;
  return snapshot;
}

export function convertAmount(amount: number, from: string, to: string, state: AppState, snapshot: CurrencySnapshot | null): number {
  const n = Number(amount) || 0;
  const fromCode = String(from || '').toUpperCase();
  const toCode = String(to || '').toUpperCase();
  if (fromCode === toCode) return n;
  // Prefer a freshly-fetched snapshot over persisted state for this pair — the one caller
  // (Scan's FX quick-reference calculator) fetches `snapshot` on demand in live mode so
  // "更新匯率" shows an up-to-date number; without this, the success toast would quote a new
  // rate while the displayed converted amount silently kept using the old persisted rate.
  // 固定匯率模式下永遠用 persisted state（rateTable → state.rate → fallback），snapshot 唔會覆蓋。
  const rates = state.rateMode === 'fixed' ? undefined : usableSnapshot(snapshot)?.rates;
  if (rates
    && Number.isFinite(rates[fromCode]) && Number(rates[fromCode]) > 0
    && Number.isFinite(rates[toCode]) && Number(rates[toCode]) > 0) {
    const hkd = n / Number(rates[fromCode]);
    return hkd * Number(rates[toCode]);
  }
  const viaHkd = amountToHkd(n, fromCode, state);
  return hkdToCurrency(viaHkd, toCode, state);
}
