import { APP_SCHEMA_VERSION, DEFAULT_STATE, ITINERARY } from '../../lib/constants';
import { perHkdForCurrency } from '../../lib/currency';
import type { AppState, CategoryId, ItineraryDay, ItinerarySpot, Receipt, TripIntelligence, TripProfile } from '../../lib/types';
import { normalizeTripIntelligence, normalizeZone, timezoneForDestination } from './context';
import { resolveGeoCoordinate, resolveCategory } from '../../lib/geo';

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

function pad2(value: string | number): string {
  return String(value).padStart(2, '0');
}

function isValidMonthDay(month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function inferItineraryYear(itinerary: ItineraryDay[], tripId: string): number {
  const datedDay = itinerary.find((day) => /^\d{4}[-/.年]/.test(String(day.date || '')));
  const source = datedDay ? String(datedDay.date || '') : tripId;
  const match = source.match(/\b(19\d{2}|20\d{2})\b/) || source.match(/(19\d{2}|20\d{2})/);
  return match ? Number(match[1]) : new Date().getFullYear();
}

function normalizeItineraryDate(rawDate: unknown, fallbackYear: number): string {
  const raw = String(rawDate || '').trim();
  if (!raw) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const full = raw.match(/^(\d{4})[年\/.-](\d{1,2})[月\/.-](\d{1,2})日?$/);
  if (full) {
    const month = Number(full[2]);
    const day = Number(full[3]);
    if (isValidMonthDay(month, day)) return `${full[1]}-${pad2(month)}-${pad2(day)}`;
  }

  const monthDay = raw.match(/^(\d{1,2})[月\/.-](\d{1,2})日?$/);
  if (monthDay) {
    const month = Number(monthDay[1]);
    const day = Number(monthDay[2]);
    if (isValidMonthDay(month, day)) return `${fallbackYear}-${pad2(month)}-${pad2(day)}`;
  }

  const parsed = new Date(raw + (raw.includes('T') ? '' : 'T00:00:00'));
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getUTCFullYear()}-${pad2(parsed.getUTCMonth() + 1)}-${pad2(parsed.getUTCDate())}`;
  }
  return raw;
}

export function normalizeItinerary(itinerary: ItineraryDay[], tripId: string, fallbackCurrency = 'JPY'): ItineraryDay[] {
  const fallbackYear = inferItineraryYear(itinerary, tripId);
  return itinerary.map((day, dayIdx) => {
    const safeDate = normalizeItineraryDate(day.date, fallbackYear);
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
        const name = String(spot.name || '').trim() || `Spot ${spotIdx + 1}`;
        const geo = resolveGeoCoordinate(name);
        const rawLat = Number(spot.lat);
        const rawLon = Number(spot.lon);
        return {
          ...spot,
          name,
          type: spot.type || resolveCategory(name),
          id: spot.spotId || spot.id || stableSpotId(tripId, safeDate, spotIdx, spot),
          spotId: spot.spotId || spot.id || stableSpotId(tripId, safeDate, spotIdx, spot),
          mapUrl: spot.mapUrl || '',
          lat: Number.isFinite(rawLat) ? rawLat : geo?.lat,
          lon: Number.isFinite(rawLon) ? rawLon : geo?.lon,
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

export function switchTrip(state: AppState, tripId: string): Partial<AppState> | null {
  const target = state.trips?.find((t) => t.id === tripId && !t.archived);
  if (!target) return null;
  return {
    activeTripId: tripId,
    trips: (state.trips || []).map((item) => ({ ...item, active: item.id === tripId && !item.archived })),
    tripName: target.name,
    budget: target.budget ?? state.budget,
    tripCurrency: target.currencies?.find((c) => c !== 'HKD') || state.tripCurrency,
    customItinerary: target.itinerary || [],
    tripDateRange: { start: target.startDate, end: target.endDate },
  };
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

  // 一張收據如果已經有「明確且有效」嘅 tripId（例如用戶喺 editor 入面建立/編輯過），
  // 就必須尊重佢 — 改其他欄位（例如日期）唔可以靜靜雞將佢搬去另一個旅程。
  // 只有當 tripId 缺失 / 係 default / 失效（Notion 拉回、歷史數據）先做智能歸位。
  const isDefaultOrEmptyTripId = !originalTripId
    || originalTripId === 'trip_default'
    || originalTripId === 'default'
    || !trips.some((t) => t.id === originalTripId && !t.archived);

  let trip: TripProfile | undefined;

  // 1) 尊重明確且有效嘅 tripId（最高優先）
  if (!isDefaultOrEmptyTripId) {
    trip = trips.find((t) => t.id === originalTripId && !t.archived);
    if (trip) tripLinkSource = receipt.tripLinkSource || 'explicit';
  }

  // 2) 冇明確 tripId 先按日期歸位（Notion 拉回的無 TripId 數據、或歷史 default 數據）
  if (!trip && receipt.date) {
    trip = trips.find((t) => receipt.date >= t.startDate && receipt.date <= t.endDate && !t.archived);
    if (trip) tripLinkSource = 'date-auto';
  }

  // 3) Prep-phase 大額預付項目智能歸位（行前 30 日窗口）
  if (!trip) {
    const active = activeTrip(state);
    const PREP_WINDOW_DAYS = 30;
    const prepStartDate = active?.startDate
      ? localYmd(new Date(`${active.startDate}T00:00:00`).getTime() - PREP_WINDOW_DAYS * 86_400_000)
      : '';
    const isWithinPrepWindow = active && active.startDate && receipt.date && receipt.date >= prepStartDate && receipt.date <= active.endDate;
    if (isWithinPrepWindow && isDefaultOrEmptyTripId && active) {
      trip = active;
      tripLinkSource = 'prep-auto';
    }
  }

  // 4) 還是找不到就 fallback 到 activeTrip
  if (!trip) {
    trip = activeTrip(state);
  }

  const day = trip.itinerary?.find((item) => item.date === receipt.date);
  const region = receipt.regionSnapshot || receipt.region || day?.region || '';
  const currency = receipt.currency || receipt.originalCurrency || day?.currency || state.tripCurrency || 'JPY';
  const rate = Math.max(
    0.1,
    Number(receipt.exchangeRate)
      || perHkdForCurrency(state, currency),
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
    // Stamp a stable, unique sourceId once so identity never shifts across edits/pulls.
    // Two receipts with the same store/photo keep distinct ids → distinct source_ids →
    // both persist as separate rows (Supabase unique key is (trip_id, source_id)).
    sourceId: receipt.sourceId || receipt.id,
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
