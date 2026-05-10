import { APP_SCHEMA_VERSION, DEFAULT_STATE, ITINERARY } from '../../lib/constants';
import type { AppState, ItineraryDay, ItinerarySpot, Receipt, TripProfile } from '../../lib/types';

const slug = (value: string) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 48);

export function stableDayId(tripId: string, date: string): string {
  return `${tripId}_day_${date.replace(/-/g, '')}`;
}

export function stableSpotId(tripId: string, date: string, idx: number, spot: Pick<ItinerarySpot, 'name' | 'time'>): string {
  return `${stableDayId(tripId, date)}_spot_${String(idx + 1).padStart(2, '0')}_${slug(`${spot.time}_${spot.name}`) || 'item'}`;
}

export function normalizeZone(value?: string): string {
  const zone = String(value || '').trim();
  if (zone === 'JST') return 'Asia/Tokyo';
  if (zone === 'HKT') return 'Asia/Hong_Kong';
  return zone;
}

export function normalizeItinerary(itinerary: ItineraryDay[], tripId: string, fallbackCurrency = 'JPY'): ItineraryDay[] {
  return itinerary.map((day, dayIdx) => {
    const dayId = day.dayId || day.id || stableDayId(tripId, day.date);
    return {
      ...day,
      id: dayId,
      dayId,
      day: Number(day.day) || dayIdx + 1,
      timezone: normalizeZone(day.timezone || day.spots?.find((spot) => spot.timezone)?.timezone) || 'Asia/Tokyo',
      currency: day.currency || fallbackCurrency,
      spots: (day.spots || []).map((spot, spotIdx) => ({
        ...spot,
        id: spot.spotId || spot.id || stableSpotId(tripId, day.date, spotIdx, spot),
        spotId: spot.spotId || spot.id || stableSpotId(tripId, day.date, spotIdx, spot),
        mapUrl: spot.mapUrl || '',
      })),
    };
  });
}

export function tripFromLegacyState(input: Partial<AppState>): TripProfile {
  const tripId = input.activeTripId || DEFAULT_STATE.activeTripId || 'trip_default';
  const itinerary = normalizeItinerary(
    Array.isArray(input.customItinerary) && input.customItinerary.length ? input.customItinerary : ITINERARY,
    tripId,
    input.tripCurrency || DEFAULT_STATE.tripCurrency,
  );
  const startDate = input.tripDateRange?.start || itinerary[0]?.date || DEFAULT_STATE.tripDateRange.start;
  const endDate = input.tripDateRange?.end || itinerary[itinerary.length - 1]?.date || DEFAULT_STATE.tripDateRange.end;
  return {
    id: tripId,
    name: input.tripName || DEFAULT_STATE.tripName,
    destinationSummary: itinerary.map((day) => day.region).filter(Boolean).slice(0, 6).join(' / ') || '未設定目的地',
    startDate,
    endDate,
    homeCurrency: 'HKD',
    currencies: Array.from(new Set(['HKD', input.tripCurrency || DEFAULT_STATE.tripCurrency])),
    timezones: Array.from(new Set(itinerary.map((day) => day.timezone || 'Asia/Tokyo'))),
    version: 1,
    active: true,
    itinerary,
    sourceId: `trip_${tripId}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function activeTrip(state: AppState): TripProfile {
  const trips = Array.isArray(state.trips) && state.trips.length ? state.trips : [tripFromLegacyState(state)];
  return trips.find((trip) => trip.id === state.activeTripId && !trip.archived)
    || trips.find((trip) => trip.active && !trip.archived)
    || trips.find((trip) => !trip.archived)
    || trips[0];
}

export function stampReceiptForTrip(state: AppState, receipt: Receipt, options: { preserveUpdatedAt?: boolean } = {}): Receipt {
  const trip = activeTrip(state);
  const day = trip.itinerary.find((item) => item.date === receipt.date);
  const region = receipt.regionSnapshot || receipt.region || day?.region || '';
  const currency = receipt.currency || receipt.originalCurrency || day?.currency || state.tripCurrency || 'JPY';
  const rate = Math.max(0.1, Number(receipt.exchangeRate || state.rate) || 20.36);
  return {
    ...receipt,
    tripId: receipt.tripId || trip.id,
    tripVersion: receipt.tripVersion || trip.version,
    tripDayId: receipt.tripDayId || day?.dayId || day?.id,
    currency,
    originalCurrency: receipt.originalCurrency || currency,
    originalAmount: Number(receipt.originalAmount ?? receipt.total) || 0,
    exchangeRate: rate,
    hkdAmount: Number(receipt.hkdAmount) || Math.round((Number(receipt.total) || 0) / rate),
    regionSnapshot: region,
    mapUrl: receipt.mapUrl || '',
    updatedAt: options.preserveUpdatedAt ? receipt.updatedAt : Date.now(),
  };
}

export function migrateAppState(input: unknown): AppState {
  const parsed = input && typeof input === 'object' ? input as Partial<AppState> : {};
  const trip = Array.isArray(parsed.trips) && parsed.trips.length
    ? { ...parsed.trips[0], itinerary: normalizeItinerary(parsed.trips[0].itinerary || [], parsed.trips[0].id, parsed.tripCurrency || 'JPY') }
    : tripFromLegacyState(parsed);
  const rawTrips = Array.isArray(parsed.trips) && parsed.trips.length ? parsed.trips : [trip];
  const preferredActiveId = parsed.activeTripId || trip.id;
  const nextActiveId = rawTrips.find((item) => item.id === preferredActiveId && !item.archived)?.id
    || rawTrips.find((item) => item.active && !item.archived)?.id
    || rawTrips.find((item) => !item.archived)?.id
    || preferredActiveId;
  const trips = Array.isArray(parsed.trips) && parsed.trips.length
    ? parsed.trips.map((item, idx) => ({
        ...item,
        active: item.id === nextActiveId && !item.archived || (!nextActiveId && !parsed.activeTripId && idx === 0),
        itinerary: normalizeItinerary(item.itinerary || [], item.id, parsed.tripCurrency || 'JPY'),
        timezones: Array.isArray(item.timezones)
          ? Array.from(new Set(item.timezones.map(normalizeZone).filter(Boolean)))
          : trip.timezones,
      }))
    : [trip];
  const base = {
    ...DEFAULT_STATE,
    ...parsed,
    schemaVersion: APP_SCHEMA_VERSION,
    activeTripId: nextActiveId,
    trips,
    tripName: parsed.tripName || trip.name,
    tripDateRange: {
      start: parsed.tripDateRange?.start || trip.startDate,
      end: parsed.tripDateRange?.end || trip.endDate,
    },
    customItinerary: parsed.customItinerary || null,
    syncQueue: Array.isArray(parsed.syncQueue) ? parsed.syncQueue : [],
    lastSyncedAt: Number(parsed.lastSyncedAt) || 0,
    globalSyncStatus: parsed.globalSyncStatus || 'idle',
    syncError: typeof parsed.syncError === 'string' ? parsed.syncError : '',
    settingsPulledAt: Number(parsed.settingsPulledAt) || 0,
  } as AppState;
  base.receipts = (Array.isArray(parsed.receipts) ? parsed.receipts : [])
    .filter((r): r is Receipt => !!(r && r.id && r.store !== undefined))
    .filter((r) => !(typeof r.id === 'string' && r.id.startsWith('__meta_')))
    .map((receipt) => stampReceiptForTrip(base, receipt, { preserveUpdatedAt: true }));
  return base;
}
