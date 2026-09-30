import assert from 'node:assert/strict';
import {
  budgetDayCount,
  computeSettlements,
  dailyBudgetAmount,
  getReceiptHkdAmount,
  getReceiptTripAmount,
  getResolvedTripCurrency,
  getTripPhase,
  roundZeroSum,
  sharePercents,
  todayForReceipts,
} from '../src/lib/domain.ts';
import { amountToHkd, hkdToCurrency, perHkdForCurrency } from '../src/lib/currency.ts';
import type { AppState, Receipt } from '../src/lib/types.ts';

const baseState = {
  rate: 20.36,
  tripCurrency: 'JPY',
  budget: 0,
  tripDateRange: { start: '2026-04-20', end: '2026-04-25' },
  trips: [{
    id: 'trip_a',
    name: 'Nagoya',
    startDate: '2026-04-20',
    endDate: '2026-04-25',
    currencies: ['HKD', 'JPY'],
    timezones: ['Asia/Tokyo'],
    active: true,
  }],
  activeTripId: 'trip_a',
  persons: [{ id: 'p_a', name: 'A', emoji: 'a', color: '#000' }, { id: 'p_b', name: 'B', emoji: 'b', color: '#111' }],
} as unknown as AppState;

function receipt(patch: Partial<Receipt>): Receipt {
  return {
    id: 'r1',
    store: 's',
    total: 1000,
    date: '2026-04-20',
    category: 'food',
    payment: 'cash',
    personId: 'p_a',
    splitMode: 'shared',
    createdAt: 1,
    ...patch,
  } as Receipt;
}

// --- currency case normalization ---
assert.equal(getReceiptHkdAmount(receipt({ total: 2036, currency: 'hkd' }), baseState), 2036,
  "lowercase 'hkd' must take the HKD identity branch (was converted via rate)");
assert.equal(getReceiptTripAmount(receipt({ total: 1000, currency: 'jpy' }), baseState, 'JPY'), 1000,
  "lowercase 'jpy' receipt on a JPY trip must be identity (was round-tripped via HKD)");
assert.equal(
  getResolvedTripCurrency({ ...baseState, trips: [{ ...(baseState as any).trips[0], currencies: ['hkd', 'jpy'] }] } as AppState, (baseState as any).trips[0]),
  'JPY',
  "lowercase 'hkd' entry must not win the non-HKD pick",
);

// --- rate floor: pinned rate below 0.1 (GBP-class) must not clamp to 0.1 ---
const pinned = receipt({ total: 100, currency: 'GBP', exchangeRate: 0.095, exchangeRatePinned: true, hkdAmount: 1053 });
assert.equal(getReceiptHkdAmount(pinned, baseState), Math.round(100 / 0.095),
  'pinned rate 0.095 must convert with the real rate, not the 0.1 floor');

// --- zero / negative totals ---
assert.equal(getReceiptHkdAmount(receipt({ total: 0, currency: 'JPY' }), baseState), 0);
assert.equal(getReceiptHkdAmount(receipt({ total: -500, currency: 'JPY' }), baseState), -25,
  'negative totals convert (refund) rather than NaN');

// --- multi-currency trip amount via HKD anchor ---
const krw = receipt({ total: 175000, currency: 'KRW' });
const krwHkd = getReceiptHkdAmount(krw, baseState); // 175000 / 175 fallback
assert.equal(krwHkd, 1000);
assert.equal(getReceiptTripAmount(krw, baseState, 'JPY'), Math.round(hkdToCurrency(1000, 'JPY', baseState)));

// --- missing rate: perHkdForCurrency must not 1:1 a missing exotic as HKD when fallback exists ---
assert.equal(perHkdForCurrency(baseState, 'KRW'), 175);
assert.equal(amountToHkd(175000, 'KRW', baseState), 1000);
assert.equal(hkdToCurrency(1000, 'KRW', baseState), 175000);

// --- trip date math: no crash on missing tripDateRange ---
const bare = { ...baseState, tripDateRange: undefined as any, trips: [{ ...(baseState as any).trips[0], startDate: '', endDate: '' }] } as unknown as AppState;
assert.doesNotThrow(() => todayForReceipts(bare), 'todayForReceipts must not crash without tripDateRange');
assert.equal(getTripPhase(bare, '2026-04-20'), 'trip', 'empty bounds must not classify every date as post');

// --- dailyBudget shared helper ---
const itin = [{ date: '2026-04-20' }, { date: '2026-04-21' }] as any[];
assert.equal(budgetDayCount({ ...baseState, budget: 6000 } as AppState, itin), 2);
assert.equal(dailyBudgetAmount({ ...baseState, budget: 6000 } as AppState, itin), 3000);
assert.equal(dailyBudgetAmount({ ...baseState, budget: 6000 } as AppState, []), Math.round(6000 / 6), 'falls back to trip date span');

// --- settlement / split edge cases ---
const settled = computeSettlements({
  ...baseState,
  receipts: [
    receipt({ id: 'r1', total: 1000, personId: 'p_a', splitMode: 'shared' }),
    receipt({ id: 'r2', total: 0, personId: 'p_b', splitMode: 'shared' }),
    receipt({ id: 'r3', total: -200, personId: 'p_a', splitMode: 'shared' }),
  ],
} as AppState);
assert.equal(settled.sharedTotal, 800, 'negative (refund) shared receipt nets against the shared total');
assert.equal(settled.sharedByPayer[0], 800);

const zeros = computeSettlements({
  ...baseState,
  shareRatios: { p_a: 0, p_b: 0 },
  receipts: [receipt({ total: 1000, personId: 'p_a', splitMode: 'shared' })],
} as AppState);
assert.equal(zeros.transfers.length, 1, 'all-zero ratios still settle via equal split');
assert.equal(zeros.transfers[0].amount, 500);

// --- roundZeroSum keeps integer totals exact ---
const rounded = roundZeroSum([0.4, 0.4, -0.3]);
assert.equal(rounded.reduce((a, b) => a + b, 0), Math.round(0.5));
assert.ok(rounded.every((v) => Number.isInteger(v)));

// --- sharePercents sums to 100 and matches settlement's missing-key rule ---
const percents = sharePercents(['p_a', 'p_b', 'p_c'], { p_a: 50, p_b: 50 });
assert.equal(percents.reduce((a, b) => a + b, 0), 100);
assert.deepEqual(percents, [34, 33, 33], 'unset person takes the mean of positive ratios (50) → equal thirds, remainder to first');
const legacy = sharePercents(['p_a', 'p_b'], { p_a: 1, p_b: 1 });
assert.deepEqual(legacy, [50, 50]);

console.log('domain-currency-math: all assertions passed');
