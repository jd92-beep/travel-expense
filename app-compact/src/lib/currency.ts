import type { AppState } from './types';

export const SUPPORTED_CURRENCIES = ['JPY', 'HKD', 'USD', 'KRW', 'TWD', 'CNY', 'EUR', 'GBP', 'AUD', 'SGD', 'THB', 'MYR', 'VND', 'CAD', 'NZD', 'CHF', 'PHP'] as const;

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
};

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
};

export interface CurrencySnapshot {
  base: 'HKD';
  rates: Record<string, number>;
  fetchedAt: number;
  source: string;
}

interface FetchCurrencyOptions {
  /**
   * Manual refresh can still prefer Visa first, but app boot should avoid the
   * public CORS proxy path because it frequently returns 403 and pollutes the
   * mobile console on every launch.
   */
  officialFirst?: boolean;
}

const CACHE_KEY = 'boss-japan-tracker:react-currency';
const MAX_AGE = 60 * 60 * 1000; // 1 hour cache

function jpyPerHkd(state: AppState): number {
  return Math.max(0.1, Number(state.rate) || 20.36);
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
  return value / Math.max(0.1, perHkdForCurrency(state, code));
}

export function hkdToCurrency(amountHkd: number, currency: string, state: AppState): number {
  const code = String(currency || 'JPY').toUpperCase();
  const value = Number(amountHkd) || 0;
  if (code === 'HKD') return value;
  return value * Math.max(0.1, perHkdForCurrency(state, code));
}

export function currencyPrefix(currency: string): string {
  const code = String(currency || '').toUpperCase();
  return CURRENCY_PREFIX[code] || `${code} `;
}

export function formatCurrencyAmount(amount: number, currency: string): string {
  const code = String(currency || '').toUpperCase();
  const prefix = currencyPrefix(code);
  const rounded = Math.round(Number(amount) || 0).toLocaleString('en-US');
  return prefix.endsWith(' ') ? `${prefix}${rounded}` : `${prefix} ${rounded}`;
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
  const response = await fetch('https://open.er-api.com/v6/latest/HKD');
  if (!response.ok) throw new Error(`FX ${response.status}: ${(await response.text()).slice(0, 160)}`);
  const data = await response.json();
  const rates = data?.rates || {};
  if (data?.result !== 'success' || !Number.isFinite(rates.JPY)) throw new Error('FX 回覆缺少有效 JPY rate');
  return persistCurrencySnapshot({
    base: 'HKD',
    rates: { ...rates, HKD: 1 },
    fetchedAt: Date.now(),
    source: data?.provider || 'open.er-api.com',
  });
}

async function fetchVisaSnapshot(): Promise<CurrencySnapshot | null> {
  // 嘗試 Visa 官方匯率 (需要透過 CORS proxy，因為 Visa 阻擋跨域)
  try {
    const d = new Date();
    const datePart = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
    const visaUrl = `https://www.visa.com.tw/cmsapi/fx/rates?amount=1&fee=0&utcConvertedDate=${encodeURIComponent(datePart)}&exchangedate=${encodeURIComponent(datePart)}&fromCurr=HKD&toCurr=JPY&_t=${Date.now()}`;

    // 使用 corsproxy.io 作為代理
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(visaUrl)}`;
    const visaResponse = await fetch(proxyUrl, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (visaResponse.ok) {
      const visaData = await visaResponse.json();
      const rate = parseFloat(visaData.convertedAmount || visaData.fxRateVisa);

      if (rate && rate > 0 && Number.isFinite(rate)) {
        return persistCurrencySnapshot({
          base: 'HKD',
          rates: { HKD: 1, JPY: rate },
          fetchedAt: Date.now(),
          source: 'Visa (官方即時)',
        });
      }
    }
  } catch (err) {
    console.warn('Visa rate fetch failed:', err);
  }
  return null;
}

export async function fetchLiveCurrencySnapshot(options: FetchCurrencyOptions = {}): Promise<CurrencySnapshot> {
  if (!options.officialFirst) return fetchExchangeRateSnapshot();
  return (await fetchVisaSnapshot()) || fetchExchangeRateSnapshot();
}

export function usableSnapshot(snapshot: CurrencySnapshot | null): CurrencySnapshot | null {
  if (!snapshot) return null;
  return Date.now() - snapshot.fetchedAt < MAX_AGE ? snapshot : null;
}

export function convertAmount(amount: number, from: string, to: string, state: AppState, snapshot: CurrencySnapshot | null): number | null {
  const n = Number(amount) || 0;
  if (from === to) return n;
  const rate = jpyPerHkd(state);
  if (from === 'JPY' && to === 'HKD') return n / rate;
  if (from === 'HKD' && to === 'JPY') return n * rate;
  const rates = usableSnapshot(snapshot)?.rates;
  if (rates && Number.isFinite(rates[from]) && Number.isFinite(rates[to]) && rates[from] !== 0 && rates[to] !== 0) {
    const hkd = n / Number(rates[from]);
    return hkd * Number(rates[to]);
  }
  const viaHkd = amountToHkd(n, from, state);
  return hkdToCurrency(viaHkd, to, state);
}
