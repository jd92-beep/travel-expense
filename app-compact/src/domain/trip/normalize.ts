import { APP_SCHEMA_VERSION, DEFAULT_STATE, ITINERARY } from '../../lib/constants';
import type { AppState, ItineraryDay, ItinerarySpot, Receipt, TripProfile } from '../../lib/types';

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

export function timezoneForDestination(destination = '', fallback = 'Asia/Tokyo'): string {
  const value = destination.toLowerCase();
  if (/香港|hong\s*kong|\bhk\b/.test(value)) return 'Asia/Hong_Kong';
  if (/韓國|韩国|首爾|首尔|釜山|korea|seoul|busan/.test(value)) return 'Asia/Seoul';
  if (/台灣|台湾|台北|taiwan|taipei/.test(value)) return 'Asia/Taipei';
  if (/中國|中国|上海|北京|深圳|廣州|广州|china|shanghai|beijing|shenzhen|guangzhou/.test(value)) return 'Asia/Shanghai';
  if (/新加坡|singapore/.test(value)) return 'Asia/Singapore';
  if (/泰國|泰国|曼谷|thailand|bangkok/.test(value)) return 'Asia/Bangkok';
  if (/越南|河內|河内|胡志明|vietnam|hanoi|ho\s*chi\s*minh/.test(value)) return 'Asia/Ho_Chi_Minh';
  if (/馬來西亞|马来西亚|吉隆坡|malaysia|kuala\s*lumpur/.test(value)) return 'Asia/Kuala_Lumpur';
  if (/菲律賓|菲律宾|馬尼拉|马尼拉|philippines|manila/.test(value)) return 'Asia/Manila';
  if (/澳洲|悉尼|雪梨|墨爾本|墨尔本|australia|sydney|melbourne/.test(value)) return 'Australia/Sydney';
  if (/紐西蘭|新西蘭|奥克兰|奧克蘭|new\s*zealand|auckland/.test(value)) return 'Pacific/Auckland';
  if (/英國|英国|倫敦|伦敦|uk|london/.test(value)) return 'Europe/London';
  if (/法國|法国|巴黎|france|paris/.test(value)) return 'Europe/Paris';
  if (/美國|美国|紐約|纽约|new\s*york|usa|america/.test(value)) return 'America/New_York';
  if (/日本|東京|东京|大阪|名古屋|京都|札幌|沖繩|冲绳|japan|tokyo|osaka|nagoya|kyoto|sapporo|okinawa/.test(value)) return 'Asia/Tokyo';
  return normalizeZone(fallback) || 'Asia/Tokyo';
}

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

export function createTripProfile(input: {
  name: string;
  destinationSummary?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  currency?: string;
  now?: number;
}): TripProfile {
  const now = input.now || Date.now();
  const startDate = input.startDate || localYmd(now);
  const endDate = input.endDate && input.endDate >= startDate ? input.endDate : startDate;
  const destinationSummary = input.destinationSummary?.trim() || 'Japan';
  const currency = String(input.currency || 'JPY').toUpperCase();
  const timezone = timezoneForDestination(destinationSummary);
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

export function stampReceiptForTrip(state: AppState, receipt: Receipt, options: { preserveUpdatedAt?: boolean } = {}): Receipt {
  const trips = Array.isArray(state.trips) && state.trips.length ? state.trips : [];
  // 優先看 receipt 是否已有對應 tripId，有的話直接找該 trip
  let trip = receipt.tripId ? trips.find((t) => t.id === receipt.tripId) : undefined;

  // 如果沒有 tripId，或者找不到，則根據日期範圍智能配對
  if (!trip && receipt.date) {
    trip = trips.find((t) => receipt.date >= t.startDate && receipt.date <= t.endDate && !t.archived);
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
