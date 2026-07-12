import assert from 'node:assert/strict';
import { filterSupersededTripQueue, mergePulledReceipts, mergePulledTrips } from '../src/lib/syncMerge.ts';
import type { AppState, ItineraryDay, Receipt, TripProfile } from '../src/lib/types.ts';

const tripId = 'nagoya-2026';
const startDate = '2026-04-20';
const endDate = '2026-04-25';
const staleSpot = { id: 'stale-spot', spotId: 'stale-spot', name: 'STALE SPOT', time: '10:00' };

function day(date: string, number: number, spots = [staleSpot]): ItineraryDay {
  return { date, day: number, region: `Day ${number}`, timezone: 'Asia/Tokyo', currency: 'JPY', spots };
}

function trip(version: number, updatedAt: number, itinerary: ItineraryDay[]): TripProfile {
  return {
    id: tripId,
    name: 'Nagoya 2026',
    destinationSummary: 'Nagoya',
    startDate,
    endDate,
    homeCurrency: 'HKD',
    currencies: ['JPY'],
    timezones: ['Asia/Tokyo'],
    version,
    itineraryVersion: version,
    active: true,
    itinerary,
    createdAt: 1,
    updatedAt,
  };
}

function state(localTrip: TripProfile): AppState {
  return { trips: [localTrip], activeTripId: tripId } as unknown as AppState;
}

const local = trip(1, 100, [
  day('2026-04-20', 1),
  day('2026-04-21', 2),
  day('2026-04-22', 3),
  day('2026-04-23', 4),
  day('2026-04-24', 5),
  day('2026-04-25', 6),
]);
const newerRemote = trip(2, 200, [day('2026-04-20', 1, [])]);
const authoritative = mergePulledTrips(state(local), [newerRemote]).trips[0];
assert.equal(authoritative.itinerary.length, 6, 'newer remote payload is expanded to the inclusive trip range');
assert.deepEqual(authoritative.itinerary[0].spots, [], 'explicit empty remote spots delete stale local scenery');
assert.ok(authoritative.itinerary.slice(1).every((item) => item.spots[0]?.name === 'STALE SPOT'), 'a partial remote payload preserves every untransmitted day');
const staleTripQueue = [{ id: 'stale-trip-write', type: 'trip', entityId: tripId, op: 'update', status: 'queued', attempts: 0, createdAt: 1, updatedAt: 1 }];
assert.deepEqual(
  filterSupersededTripQueue(staleTripQueue as never[], [local], [newerRemote]),
  [],
  'a newer server itinerary removes the stale local trip write queue item',
);

const equalVersionRemote = trip(1, 200, [day('2026-04-20', 1, [])]);
const equalVersion = mergePulledTrips(state(local), [equalVersionRemote]).trips[0];
assert.deepEqual(equalVersion.itinerary[0].spots, [], 'an explicit remote day remains authoritative at equal version');
assert.equal(equalVersion.itinerary[1].spots[0].name, 'STALE SPOT', 'an equal-version partial payload preserves untransmitted days');

const newerLocal = trip(3, 300, [day('2026-04-20', 1, [{ ...staleSpot, name: 'LOCAL NEWER' }])]);
const olderRemote = trip(2, 400, [day('2026-04-20', 1, [])]);
const preserved = mergePulledTrips(state(newerLocal), [olderRemote]).trips[0];
assert.equal(preserved.itinerary[0].spots[0].name, 'LOCAL NEWER', 'older remote itinerary cannot overwrite a newer local version');

const newerVersionOlderClock = trip(4, 250, [day('2026-04-20', 1, [{ ...staleSpot, name: 'SERVER VERSION WINS' }])]);
const versionAuthoritative = mergePulledTrips(state(newerLocal), [newerVersionOlderClock]).trips[0];
assert.equal(versionAuthoritative.itineraryVersion, 4, 'itinerary version wins even when device clocks disagree');
assert.equal(versionAuthoritative.itinerary[0].spots[0].name, 'SERVER VERSION WINS', 'newer server itinerary replaces the transmitted day');
assert.equal(versionAuthoritative.itinerary[1].spots.length, 0, 'new dates missing on both sides remain visible as blank days');

const tripA = { ...local, id: 'trip-a', name: 'Trip A' };
const tripB = { ...local, id: 'trip-b', name: 'Trip B' };
const localReceipt = {
  id: 'local-a', sourceId: 'shared-source', tripId: 'trip-a', store: 'Trip A store', total: 100,
  date: startDate, category: 'food', payment: 'cash', createdAt: 100, updatedAt: 100,
} as Receipt;
const remoteOtherTrip = {
  ...localReceipt, id: 'remote-b', supabaseId: '00000000-0000-4000-8000-000000000002',
  tripId: 'trip-b', store: 'Trip B store', total: 200, updatedAt: 200,
} as Receipt;
const crossTripState = {
  ...state(tripA), trips: [tripA, tripB], receipts: [localReceipt],
  tripDateRange: { start: startDate, end: endDate }, tripCurrency: 'JPY',
} as AppState;
const crossTripReceipts = mergePulledReceipts(crossTripState, [remoteOtherTrip]);
assert.equal(crossTripReceipts.length, 2, 'the same SourceID in another trip creates a separate receipt');
assert.equal(crossTripReceipts.find((receipt) => receipt.tripId === 'trip-a')?.total, 100, 'a remote receipt cannot overwrite another trip');
assert.equal(crossTripReceipts.find((receipt) => receipt.tripId === 'trip-b')?.total, 200, 'the remote receipt stays in its canonical trip');

console.log('itinerary-sync-merge: authority, deletion, and range assertions passed');
