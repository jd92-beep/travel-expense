import assert from 'node:assert/strict';
import { stampReceiptForTrip, switchTrip } from '../src/domain/trip/normalize.ts';
import type { AppState, Receipt, TripProfile } from '../src/lib/types.ts';

function trip(id: string, archived: boolean, overrides: Partial<TripProfile> = {}): TripProfile {
  return {
    id,
    name: id,
    destinationSummary: id,
    startDate: '2026-04-20',
    endDate: '2026-04-25',
    homeCurrency: 'HKD',
    currencies: ['JPY'],
    timezones: ['Asia/Tokyo'],
    version: 1,
    itineraryVersion: 1,
    active: !archived,
    archived,
    itinerary: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: 'r1',
    store: 'Test',
    total: 1000,
    date: '2026-04-21',
    time: '12:00',
    category: 'food',
    payment: 'cash',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as Receipt;
}

const state = {
  trips: [trip('trip_old', true), trip('trip_active', false)],
  activeTripId: 'trip_active',
  budget: 100000,
  tripCurrency: 'JPY',
  rate: 20.36,
  rateTable: {},
  receipts: [],
} as unknown as AppState;

// P0: archived trip receipts must keep their tripId (not be stolen by activeTrip).
const archivedReceipt = stampReceiptForTrip(state, receipt({
  tripId: 'trip_old',
  tripLinkSource: 'explicit',
  hkdAmount: 50,
  exchangeRate: 20,
}));
assert.equal(archivedReceipt.tripId, 'trip_old', 'archived trip receipts stay on the archived trip');
assert.equal(archivedReceipt.tripLinkSource, 'explicit', 'explicit link source is preserved');

// Truly unknown IDs still re-home to the active trip.
const orphan = stampReceiptForTrip(state, receipt({ tripId: 'trip_gone', date: '2026-04-21' }));
assert.equal(orphan.tripId, 'trip_active', 'unknown trip ids still re-home');

// Missing / default ids still re-home.
const missing = stampReceiptForTrip(state, receipt({ tripId: 'trip_default', date: '2026-04-21' }));
assert.equal(missing.tripId, 'trip_active', 'default trip ids still re-home');

// P2: stored positive hkdAmount is not rewritten by live-rate drift.
const historical = stampReceiptForTrip(state, receipt({
  tripId: 'trip_old',
  total: 1000,
  hkdAmount: 50,
  exchangeRate: 20,
  exchangeRatePinned: true,
}));
assert.equal(historical.hkdAmount, 50, 'pinned historical hkdAmount is preserved');

// P3: switching to a budget-less trip must not inherit the previous trip's budget.
const switched = switchTrip(
  {
    ...state,
    budget: 123456,
    trips: [trip('trip_old', true, { budget: 999 }), trip('trip_active', false, { budget: undefined })],
  } as unknown as AppState,
  'trip_active',
);
assert.equal(switched?.budget, 0, 'budget-less trip does not inherit another trip budget');

console.log('archived-trip-rehome tests passed');
