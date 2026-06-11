import { APP_SCHEMA_VERSION, DEFAULT_STATE, ITINERARY } from '../../lib/constants';
import type { AppState, CategoryId, ItineraryDay, ItinerarySpot, Receipt, TripIntelligence, TripProfile } from '../../lib/types';
import { normalizeTripIntelligence, normalizeZone, timezoneForDestination } from './context';

export { normalizeTripIntelligence, normalizeZone, timezoneForDestination } from './context';

const slug = (value: string) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 48);

function localYmd(now = Date.now()): string {
  const date = new Date(now);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function inclusiveDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 1;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

export function stableDayId(tripId: string, date: string): string {
  return `${tripId}_day_${date.replace(/-/g, '')}`;
}

export function stableSpotId(tripId: string, date: string, idx: number, spot: Pick<ItinerarySpot, 'name' | 'time'>): string {
  return `${stableDayId(tripId, date)}_spot_${String(idx + 1).padStart(2, '0')}_${slug(`${spot.time}_${spot.name}`) || 'item'}`;
}

export function normalizeItinerary(itinerary: ItineraryDay[], tripId: string, fallbackCurrency = 'JPY'): ItineraryDay[] {
  return itinerary.map((day, dayIdx) => {
    // Coerce non-standard date formats (e.g. "4/20", "2026/04/20") to YYYY-MM-DD
    const rawDate = String(day.date || '');
    const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
      ? rawDate
      : (() => {
          const parsed = new Date(rawDate);
          if (!Number.isNaN(parsed.getTime())) {
            const yyyy = parsed.getFullYear();
            const mm = String(parsed.getMonth() + 1).padStart(2, '0');
            const dd = String(parsed.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
          }
          return rawDate; // keep original if unparsable
        })();
    const dayId = day.dayId || day.id || stableDayId(tripId, safeDate);
    return {
      ...day,
      date: safeDate,
      id: dayId,
      dayId,
      day: Number(day.day) || dayIdx + 1,
      region: day.region || day.city || `Day ${dayIdx + 1}`,
      timezone: normalizeZone(day.timezone || day.spots?.find((spot) => spot.timezone)?.timezone) || 'Asia/Tokyo',
      currency: day.currency || fallbackCurrency,
      spots: (day.spots || []).map((spot, spotIdx) => {
        const rawLat = Number(spot.lat);
        const rawLon = Number(spot.lon);
        return {
          ...spot,
          name: String(spot.name || '').trim() || `Spot ${spotIdx + 1}`,
          id: spot.spotId || spot.id || stableSpotId(tripId, safeDate, spotIdx, spot),
          spotId: spot.spotId || spot.id || stableSpotId(tripId, safeDate, spotIdx, spot),
          mapUrl: spot.mapUrl || '',
          lat: Number.isFinite(rawLat) ? rawLat : undefined,
          lon: Number.isFinite(rawLon) ? rawLon : undefined,
        };
      }),
    };
  });
}

export function createTripProfile(input: {
  name: string;
  destinationSummary?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  currency?: string;
  intelligence?: Partial<TripIntelligence>;
  now?: number;
}): TripProfile {
  const now = input.now || Date.now();
  const startDate = input.startDate || localYmd(now);
  const endDate = input.endDate && input.endDate >= startDate ? input.endDate : startDate;
  const destinationSummary = input.destinationSummary?.trim() || 'Japan';
  const currency = String(input.currency || 'JPY').toUpperCase();
  const timezone = timezoneForDestination(destinationSummary);
  const intelligence = normalizeTripIntelligence(input.intelligence, destinationSummary, currency, timezone);
  const id = `trip_${startDate.replace(/-/g, '')}_${slug(`${destinationSummary}_${now.toString(36)}`) || now.toString(36)}`;
  const itinerary = normalizeItinerary(
    Array.from({ length: inclusiveDays(startDate, endDate) }, (_, idx) => {
      const date = localYmd(new Date(`${startDate}T00:00:00`).getTime() + idx * 86_400_000);
      return {
        day: idx + 1,
        date,
        region: destinationSummary,
        timezone,
        currency,
        spots: [],
      };
    }),
    id,
    currency,
  );
  return {
    id,
    name: input.name.trim() || '新旅程',
    destinationSummary,
    startDate,
    endDate,
    budget: Math.max(0, Number(input.budget) || 0),
    intelligence,
    homeCurrency: 'HKD',
    currencies: Array.from(new Set(['HKD', currency])),
    timezones: Array.from(new Set(itinerary.map((day) => day.timezone || timezone))),
    active: true,
    archived: false,
    itinerary,
    version: 1,
    sourceId: `trip_${id}`,
    createdAt: now,
    updatedAt: now,
  };
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
    budget: Math.max(0, typeof input.budget === 'number' && !Number.isNaN(input.budget) ? input.budget : (DEFAULT_STATE.budget || 0)),
    homeCurrency: 'HKD',
    currencies: Array.from(new Set(['HKD', input.tripCurrency || DEFAULT_STATE.tripCurrency])),
    timezones: Array.from(new Set(itinerary.map((day) => day.timezone || 'Asia/Tokyo'))),
    version: 1,
    active: true,
    itinerary,
    sourceId: `trip_${tripId}`,
    notionDb: input.notionDb || DEFAULT_STATE.notionDb,
    intelligence: normalizeTripIntelligence(undefined, itinerary.map((day) => day.region).filter(Boolean).slice(0, 6).join(' / ') || '未設定目的地', input.tripCurrency || DEFAULT_STATE.tripCurrency),
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

export function scopedReceiptsForTrip(state: AppState, trip: TripProfile = activeTrip(state)): Receipt[] {
  const receipts = Array.isArray(state.receipts) ? state.receipts : [];
  const hasMultipleTrips = (state.trips || []).length > 1;
  return receipts.filter((receipt) => receipt.tripId === trip.id || (!hasMultipleTrips && !receipt.tripId));
}

function normalizedReceiptCategory(receipt: Receipt): CategoryId {
  const category = receipt.category || 'other';
  if (category !== 'transport' && category !== 'other') return category;
  const text = [
    receipt.store,
    receipt.note,
    receipt.itemsText,
    receipt.bookingRef,
    receipt.sourceId,
  ].filter(Boolean).join(' ');
  if (/\bhk\s*express\b|hkexpress|香港快運|香港快运|\bUO\s?\d{2,4}\b/i.test(text)) return 'flight';
  return category;
}

export function stampReceiptForTrip(state: AppState, receipt: Receipt, options: { preserveUpdatedAt?: boolean } = {}): Receipt {
  const trips = Array.isArray(state.trips) && state.trips.length ? state.trips : [];
  const originalTripId = receipt.tripId;
  let tripLinkSource: Receipt['tripLinkSource'] = receipt.tripLinkSource || (originalTripId ? 'explicit' : 'fallback-auto');
  
  // 智能配對重校對：
  // 優先看日期是否能完美落入某個 active 旅程中。
  // 這樣能保證 Notion 拉回的無 TripId 數據、或歷史 default 數據，
  // 100% 能根據日期歸位到 Boss 嘅名古屋之旅！
  let trip: TripProfile | undefined;
  if (receipt.date) {
    trip = trips.find((t) => receipt.date >= t.startDate && receipt.date <= t.endDate && !t.archived);
    if (trip && !originalTripId) tripLinkSource = 'date-auto';
  }
  
  // 增加 Prep-phase 大額預付項目智能歸位邏輯（升級版：覆蓋所有行前預付類別）：
  if (!trip) {
    const active = activeTrip(state);
    const isBeforeTripEnd = active && receipt.date && receipt.date <= active.endDate;
    const isDefaultOrEmptyTripId = !receipt.tripId || receipt.tripId === 'trip_default' || receipt.tripId === 'default' || !trips.some(t => t.id === receipt.tripId && !t.archived);
    if (isBeforeTripEnd && isDefaultOrEmptyTripId && active) {
      trip = active;
      if (!originalTripId || originalTripId === 'trip_default' || originalTripId === 'default') tripLinkSource = 'prep-auto';
    }
  }

  // 如果日期沒配上，才去看 receipt.tripId
  if (!trip && receipt.tripId) {
    trip = trips.find((t) => t.id === receipt.tripId && !t.archived);
    if (trip && !receipt.tripLinkSource) tripLinkSource = 'explicit';
  }

  // 還是找不到就 fallback 到 activeTrip
  if (!trip) {
    trip = activeTrip(state);
  }

  const day = trip.itinerary?.find((item) => item.date === receipt.date);
  const region = receipt.regionSnapshot || receipt.region || day?.region || '';
  const currency = receipt.currency || receipt.originalCurrency || day?.currency || state.tripCurrency || 'JPY';
  const rate = Math.max(
    0.1,
    Number(receipt.exchangeRate)
      || Number(state.rateTable?.[currency]?.perHkd)
      || Number(state.rate)
      || 20.36,
  );

  // 增加強大嘅港幣折算自我修復 (Self-Healing) 校驗
  let hkdAmt = Number(receipt.hkdAmount) || 0;
  let isHkdAmountValid = false;
  if (hkdAmt > 0 && receipt.total) {
    const ratio = Number(receipt.total) / hkdAmt;
    const percentDiff = Math.abs(ratio - rate) / rate;
    if (percentDiff < 0.4) {
      isHkdAmountValid = true;
    }
  }
  if (!isHkdAmountValid || hkdAmt <= 0) {
    hkdAmt = Math.round((Number(receipt.total) || 0) / rate);
  }

  return {
    ...receipt,
    category: normalizedReceiptCategory(receipt),
    tripId: trip.id,
    tripLinkSource,
    tripVersion: receipt.tripVersion || trip.version,
    tripDayId: day?.dayId || day?.id || receipt.tripDayId,
    currency,
    originalCurrency: receipt.originalCurrency || currency,
    originalAmount: Number(receipt.originalAmount ?? receipt.total) || 0,
    exchangeRate: rate,
    hkdAmount: hkdAmt,
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
        notionDb: item.notionDb || (item.id === 'trip_2026_04_nagoya' ? (parsed.notionDb || DEFAULT_STATE.notionDb) : undefined),
        budget: Math.max(0, typeof item.budget === 'number' && !Number.isNaN(item.budget)
          ? item.budget
          : (item.id === trip.id ? (Number(parsed.budget) || DEFAULT_STATE.budget || 0) : DEFAULT_STATE.budget || 0)),
        itinerary: normalizeItinerary(
          item.itinerary?.length ? item.itinerary : Array.isArray(parsed.customItinerary) ? parsed.customItinerary : [],
          item.id,
          parsed.tripCurrency || 'JPY',
        ),
        timezones: Array.isArray(item.timezones)
          ? Array.from(new Set(item.timezones.map(normalizeZone).filter(Boolean)))
          : trip.timezones,
        intelligence: normalizeTripIntelligence(
          item.intelligence,
          item.destinationSummary || trip.destinationSummary,
          item.currencies?.find((currency) => currency !== 'HKD') || parsed.tripCurrency || 'JPY',
          Array.isArray(item.timezones) ? item.timezones[0] : trip.timezones[0],
        ),
      }))
    : [trip];

  const currentActiveTrip = trips.find((t) => t.id === nextActiveId) || trips.find((t) => t.active) || trips[0];
  const resolvedBudget = (parsed.budget !== undefined && parsed.budget !== null && !Number.isNaN(Number(parsed.budget)))
    ? Math.max(0, Number(parsed.budget))
    : (currentActiveTrip ? (Number(currentActiveTrip.budget) || DEFAULT_STATE.budget || 0) : DEFAULT_STATE.budget || 0);

  const finalTrips = trips.map((t) =>
    (t.id === nextActiveId || t.active)
      ? { ...t, budget: resolvedBudget }
      : t
  );

  const isOldSchema = !parsed.schemaVersion || Number(parsed.schemaVersion) < 3;
  const statsIncludeTransportLodging = isOldSchema
    ? true
    : (parsed.statsIncludeTransportLodging !== undefined ? parsed.statsIncludeTransportLodging : true);

  const base = {
    ...DEFAULT_STATE,
    ...parsed,
    schemaVersion: APP_SCHEMA_VERSION,
    activeTripId: nextActiveId,
    trips: finalTrips,
    budget: resolvedBudget,
    tripName: parsed.tripName || trip.name,
    tripDateRange: {
      start: parsed.tripDateRange?.start || trip.startDate,
      end: parsed.tripDateRange?.end || trip.endDate,
    },
    customItinerary: parsed.customItinerary || null,
    statsIncludeTransportLodging,
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
