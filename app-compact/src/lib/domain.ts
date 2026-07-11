import { CATEGORIES, ITINERARY, PAYMENTS } from './constants';
import { hkdToCurrency, perHkdForCurrency } from './currency';
import { activeTrip, normalizeItinerary, normalizeZone, scopedReceiptsForTrip } from '../domain/trip/normalize';
import { canonicalizeItineraryRange, isNagoyaCanonicalRange } from '../domain/trip/itineraryContract';
import { computeShares, roundZeroSum, sharePercents, simplifyDebts } from './splitEngine';
export { roundZeroSum, sharePercents } from './splitEngine';
import type { AppState, CategoryId, ItineraryDay, ItinerarySpot, PaymentId, Person, Receipt, ReceiptPayer, RecurringRule, SettlementSnapshot, SyncQueueItem, TripPhase, TripProfile } from './types';

export const fmt = (n: number | string | undefined) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(n) || 0);

export const categoryById = (id: CategoryId | string | undefined) =>
  CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

export const paymentById = (id: PaymentId | string | undefined) =>
  PAYMENTS.find((p) => p.id === id) || PAYMENTS[0];

function itineraryRangeForTrip(state: AppState, trip: TripProfile): { start: string; end: string } | null {
  const start = trip.startDate || state.tripDateRange?.start;
  const end = trip.endDate || state.tripDateRange?.end;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '') || end < start) return null;
  return { start, end };
}

function repairItineraryForTrip(state: AppState, trip: TripProfile, source: ItineraryDay[], currency: string): ItineraryDay[] {
  const range = itineraryRangeForTrip(state, trip);
  const normalized = normalizeItinerary(source, trip.id, currency);
  if (!range) return normalized;
  const isNagoya = isNagoyaCanonicalRange({
    id: trip.id,
    name: `${trip.name} ${state.tripName || ''}`,
    destinationSummary: trip.destinationSummary,
    startDate: range.start,
    endDate: range.end,
  });
  return canonicalizeItineraryRange({
    tripId: trip.id,
    startDate: range.start,
    endDate: range.end,
    itinerary: normalized,
    fallbackItinerary: [
      ...(state.customItinerary || []),
      ...(isNagoya ? ITINERARY : []),
    ],
    fallbackCurrency: currency,
    fallbackRegion: trip.destinationSummary || trip.name,
    fallbackTimezone: trip.timezones?.[0],
  }).itinerary;
}

export function getItinerary(state: AppState): ItineraryDay[] {
  const trip = activeTrip(state);
  const currency = getResolvedTripCurrency(state, trip);
  // Must match getResolvedTripCurrency: currencies[] order is not guaranteed (default trip is ['JPY','HKD']).
  if (trip?.itinerary?.length) return repairItineraryForTrip(state, trip, trip.itinerary, currency);
  if (state.customItinerary && state.customItinerary.length) return repairItineraryForTrip(state, trip, state.customItinerary, currency);
  // Fallback: always normalize the constant ITINERARY to ensure stable dayId/spotId
  const isNagoya = isNagoyaCanonicalRange({
    id: trip.id,
    name: `${trip.name} ${state.tripName || ''}`,
    destinationSummary: trip.destinationSummary,
    startDate: trip.startDate,
    endDate: trip.endDate,
  });
  return repairItineraryForTrip(state, trip, isNagoya ? ITINERARY : [], currency || state.tripCurrency || 'JPY');
}

export function validateItinerary(input: unknown): { ok: true; itinerary: ItineraryDay[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'JSON 必須係 itinerary array' };
  if (input.length === 0) return { ok: false, error: 'Itinerary 不可為空' };
  const days: ItineraryDay[] = [];
  for (const [idx, item] of input.entries()) {
    if (!item || typeof item !== 'object') return { ok: false, error: `Day ${idx + 1}: 格式錯誤` };
    const d = item as Partial<ItineraryDay>;
    if (!d.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(d.date))) return { ok: false, error: `Day ${idx + 1}: date 必須係 YYYY-MM-DD` };
    if (!Array.isArray(d.spots)) return { ok: false, error: `Day ${idx + 1}: spots 必須係 array` };
    days.push({
      date: String(d.date),
      day: Number(d.day) || idx + 1,
      region: String(d.region || `Day ${idx + 1}`),
      city: d.city ? String(d.city) : '',
      country: d.country ? String(d.country) : '',
      timezone: d.timezone ? normalizeZone(d.timezone) : '',
      currency: d.currency ? String(d.currency) : '',
      highlight: d.highlight ? String(d.highlight) : '',
      lodging: d.lodging && typeof d.lodging === 'object' ? {
        name: String(d.lodging.name || ''),
        address: d.lodging.address ? String(d.lodging.address) : '',
        mapUrl: d.lodging.mapUrl ? String(d.lodging.mapUrl) : '',
        checkIn: d.lodging.checkIn ? String(d.lodging.checkIn) : '',
        checkOut: d.lodging.checkOut ? String(d.lodging.checkOut) : '',
        bookingRef: d.lodging.bookingRef ? String(d.lodging.bookingRef) : '',
        lat: Number.isFinite(Number(d.lodging.lat)) ? Number(d.lodging.lat) : undefined,
        lon: Number.isFinite(Number(d.lodging.lon)) ? Number(d.lodging.lon) : undefined,
        sourceText: d.lodging.sourceText ? String(d.lodging.sourceText) : '',
        confidence: d.lodging.confidence === 'high' || d.lodging.confidence === 'medium' || d.lodging.confidence === 'low' ? d.lodging.confidence : undefined,
      } : undefined,
      spots: d.spots.map((spot, spotIdx) => {
        const s = spot && typeof spot === 'object' ? spot as Partial<ItinerarySpot> : {};
        return {
          time: String(s.time || '00:00'),
          timeEnd: s.timeEnd ? String(s.timeEnd) : '',
          name: String(s.name || `Spot ${spotIdx + 1}`),
          type: (s.type || 'other') as ItinerarySpot['type'],
          note: s.note ? String(s.note) : '',
          address: s.address ? String(s.address) : '',
          timezone: s.timezone ? normalizeZone(s.timezone) : '',
          mapUrl: s.mapUrl ? String(s.mapUrl) : '',
          lat: Number.isFinite(Number(s.lat)) ? Number(s.lat) : undefined,
          lon: Number.isFinite(Number(s.lon)) ? Number(s.lon) : undefined,
          bookingRef: s.bookingRef ? String(s.bookingRef) : '',
          sourceText: s.sourceText ? String(s.sourceText) : '',
          confidence: s.confidence === 'high' || s.confidence === 'medium' || s.confidence === 'low' ? s.confidence : undefined,
        };
      }),
    });
  }
  return { ok: true, itinerary: days };
}

// Serialize native exports through a single chain: doSaveFile's rmdir-then-write-then-share would
// otherwise race if two exports fire close together (double-tap, or two export buttons in quick
// succession) — the second call's rmdir can delete the first call's file between its write and its
// Share.share(), handing the OS share sheet a URI to a file that no longer exists.
let saveFileChain: Promise<void> = Promise.resolve();

// Save a text file. On a Capacitor native shell the browser blob+anchor download is a silent
// no-op, so write to the app cache and open the OS share sheet instead. Web path is unchanged.
export function saveFile(filename: string, mimeType: string, content: string): Promise<void> {
  const run = saveFileChain.then(() => doSaveFile(filename, mimeType, content));
  saveFileChain = run.catch(() => {}); // keep the chain alive even if one export throws
  return run;
}

async function doSaveFile(filename: string, mimeType: string, content: string): Promise<void> {
  // Centralized filename hardening at the single choke point: Filesystem.writeFile treats the name
  // as a path, so a trip name with "/" or ":" (e.g. "Osaka/Kyoto", "名古屋/中部") would write to a
  // non-existent subdir and silently fail on native. Sanitize here so every caller is safe — not
  // just exportCsv, which had its own ad-hoc sanitizer that the backup/itinerary exports forgot.
  const safeName = (filename || 'export')
    .replace(/[/\\:*?"<>|\x00-\x1f]+/g, '-')
    .replace(/^\.+/, '')
    .trim() || 'export';
  const cap = (typeof window !== 'undefined'
    ? (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    : undefined);
  if (cap?.isNativePlatform?.()) {
    try {
      const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
      ]);
      // Sweep the *previous* export before writing a new one. Deleting right after Share.share()
      // races the receiving app still reading the content URI, so instead we clear last time's file
      // at the start of the next export. ponytail: at most one stale export lingers in cache, and it
      // never ships the full expense ledger to cloud backup (cache dir is backup-excluded).
      await Filesystem.rmdir({ path: 'exports', directory: Directory.Cache, recursive: true }).catch(() => {});
      const exportPath = `exports/${safeName}`;
      await Filesystem.writeFile({ path: exportPath, data: content, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true });
      const { uri } = await Filesystem.getUri({ path: exportPath, directory: Directory.Cache });
      await Share.share({ title: safeName, url: uri });
      return;
    } catch (err) {
      console.error('[saveFile] native save/share failed:', err);
      return; // don't fall through to a blob download that can't work in the WebView
    }
  }
  const blob = new Blob([content], { type: mimeType });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = safeName;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

export function downloadJson(filename: string, value: unknown): void {
  void saveFile(filename, 'application/json;charset=utf-8', JSON.stringify(value, null, 2));
}

export function todayYmd(timeZone = 'Asia/Hong_Kong'): string {
  const zone = normalizeZone(timeZone) || 'Asia/Hong_Kong';
  let safeZone = zone;
  try {
    new Intl.DateTimeFormat('en', { timeZone: safeZone }).format(new Date());
  } catch {
    safeZone = 'Asia/Hong_Kong';
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Add days to a YYYY-MM-DD string. Pure date math (no "now"), so it's timezone-safe — pair it with
// todayYmd() instead of `new Date().toISOString()` which yields yesterday before 08:00 HKT.
export function addDaysYmd(date: string, days: number): string {
  const [y, m, d] = String(date).split('-').map(Number);
  if (!y || !m || !d) return date;
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function todayForReceipts(state: AppState): string {
  const hkt = todayYmd('Asia/Hong_Kong');
  const trip = activeTrip(state);
  const start = trip.startDate || state.tripDateRange.start;
  const end = trip.endDate || state.tripDateRange.end;
  if (hkt >= start && hkt <= end) return todayYmd(trip.timezones?.[0] || getItinerary(state)[0]?.timezone || 'Asia/Hong_Kong');
  return hkt;
}

export function getTripPhase(state: AppState, date?: string): TripPhase {
  if (!date) return 'trip';
  const trip = activeTrip(state);
  const start = trip.startDate || state.tripDateRange.start;
  const end = trip.endDate || state.tripDateRange.end;
  if (date < start) return 'prep';
  if (date > end) return 'post';
  return 'trip';
}

export function getReceiptPhase(state: AppState, receipt: Receipt): TripPhase {
  if (receipt.phase === 'prep' || receipt.phase === 'trip' || receipt.phase === 'post') return receipt.phase;
  const tripStartMs = new Date(`${state.tripDateRange.start}T00:00:00+08:00`).getTime();
  if (receipt.createdAt && receipt.createdAt < tripStartMs) return 'prep';
  return getTripPhase(state, receipt.date);
}

export function getPersons(state: AppState): Person[] {
  const fallbackPersons = [
    { id: 'p_boss', name: 'User 1', emoji: '👦', color: '#CC2929' },
  ];
  const rawPersons = state.persons && state.persons.length ? state.persons : fallbackPersons;
  const seen = new Set<string>();
  const persons = rawPersons.filter((person) => {
    if (!person.id || seen.has(person.id)) return false;
    seen.add(person.id);
    return true;
  });
  return persons.length ? persons : fallbackPersons;
}

export function peopleForTrip(state: AppState, tripId?: string): Person[] {
  const id = tripId || state.activeTripId;
  if (id && state.peopleByTripId?.[id]?.length) return state.peopleByTripId[id];
  return getPersons(state);
}

export function shareRatiosForTrip(state: AppState, tripId?: string): Record<string, number> {
  const id = tripId || state.activeTripId;
  if (id && state.shareRatiosByTripId?.[id]) return state.shareRatiosByTripId[id];
  return state.shareRatios || {};
}

export function displayStore(receipt: Receipt): string {
  return receipt.store?.startsWith('⏳ ') ? receipt.store.slice(2) : receipt.store || '';
}

export function isPendingReceipt(receipt: Receipt): boolean {
  return receipt.store?.startsWith('⏳ ') || false;
}

export function hkd(jpy: number, state: AppState): number {
  const rate = Math.max(0.1, perHkdForCurrency(state, 'JPY'));
  return Math.round((Number(jpy) || 0) / rate);
}

// A settlement is a recorded cash/transfer payment between two people (Splitwise "settle up"),
// not an expense. It is stored as a private receipt (payer=debtor, beneficiary=creditor) so it
// rides the existing sync pipeline, but it must never count as spending. The category marker
// survives Supabase/Notion round-trips even if the boolean flag is dropped.
export const SETTLEMENT_CATEGORY = 'settlement';
export function isSettlementReceipt(r: Pick<Receipt, 'isSettlement' | 'category'>): boolean {
  return r.isSettlement === true || r.category === SETTLEMENT_CATEGORY;
}

export function getReceiptHkdAmount(r: Receipt, state: AppState): number {
  if (isSettlementReceipt(r)) return 0; // settlements are transfers, never spending
  const cur = r.currency || 'JPY';
  if (cur === 'HKD') {
    return Number(r.total) || 0;
  }
  const rate = Math.max(0.1, Number(r.exchangeRate) || perHkdForCurrency(state, cur));

  // 增加強大嘅自我修復 Self-Healing 校驗：
  // 如果 hkdAmount 存在，但與依匯率計算出的金額偏差超過 10% (偏離過大說明數據有污染/被寫錯了)，
  // 或者當 total > 100 且 hkdAmount <= 5 (顯然比例不對) 時，我們強制重新計算！
  let isHkdAmountValid = false;
  if (typeof r.hkdAmount === 'number' && r.hkdAmount > 0) {
    const ratio = (Number(r.total) || 0) / r.hkdAmount;
    const percentDiff = Math.abs(ratio - rate) / rate;
    if (percentDiff < 0.10) {
      isHkdAmountValid = true;
    }
  }

  if (isHkdAmountValid && typeof r.hkdAmount === 'number') {
    return r.hkdAmount;
  }

  return Math.round((Number(r.total) || 0) / rate);
}

// Unrounded HKD value (locked rate + self-heal, no final round) so getReceiptTripAmount can convert
// ONCE instead of double-rounding through an integer-HKD intermediate — the old path drifted ~2-3%
// and rounded sub-HKD foreign amounts to 0. getReceiptHkdAmount keeps its own rounded display path.
function receiptHkdUnrounded(r: Receipt, state: AppState): number {
  const cur = r.currency || 'JPY';
  if (cur === 'HKD') return Number(r.total) || 0;
  const rate = Math.max(0.1, Number(r.exchangeRate) || perHkdForCurrency(state, cur));
  if (typeof r.hkdAmount === 'number' && r.hkdAmount > 0) {
    const ratio = (Number(r.total) || 0) / r.hkdAmount;
    if (Math.abs(ratio - rate) / rate < 0.10) return r.hkdAmount;
  }
  return (Number(r.total) || 0) / rate;
}

export function getReceiptTripAmount(r: Receipt, state: AppState, resolvedTripCurrency: string): number {
  if (isSettlementReceipt(r)) return 0; // settlements are transfers, never spending
  const cur = r.currency || 'JPY';
  if (cur === resolvedTripCurrency) {
    return Number(r.total) || 0;
  }
  return Math.round(hkdToCurrency(receiptHkdUnrounded(r, state), resolvedTripCurrency, state));
}

export function getResolvedTripCurrency(state: AppState, trip: any): string {
  if (trip.currencies && trip.currencies.length > 0) {
    const cur = trip.currencies.find((c: string) => c !== 'HKD');
    if (cur) return cur;
  }
  const intelligentCurrency = String(trip.intelligence?.primaryCurrency || '').toUpperCase();
  if (intelligentCurrency && intelligentCurrency !== 'HKD') return intelligentCurrency;
  return state.tripCurrency || 'JPY';
}

export function receiptRegion(state: AppState, receipt: Receipt): string {
  if (receipt.regionSnapshot) return receipt.regionSnapshot;
  if (receipt.region) return receipt.region;
  const day = getItinerary(state).find((d) => d.date === receipt.date);
  if (day) return day.region;
  const phase = getTripPhase(state, receipt.date);
  if (phase === 'prep') return '準備階段';
  if (phase === 'post') return '返程後';
  return '—';
}

function overrideKey(date: string, idx: number) {
  return `${date}_${idx}`;
}

export function setItineraryOverride(state: AppState, date: string, idx: number, patch: Partial<ItinerarySpot> | null): AppState {
  const itineraryOverrides = { ...(state.itineraryOverrides || {}) };
  const day = getItinerary(state).find((item) => item.date === date);
  const spot = day?.spots[idx];
  const key = spot?.spotId || spot?.id || overrideKey(date, idx);
  if (patch) itineraryOverrides[key] = patch;
  else {
    delete itineraryOverrides[key];
    delete itineraryOverrides[overrideKey(date, idx)];
  }
  return { ...state, itineraryOverrides };
}

// Write an edited itinerary into the ACTIVE trip itself (version bump + trip/settings sync),
// so edits propagate to shared-trip members and other devices — unlike itineraryOverrides,
// which live in personal settings and get wiped by AI trip updates / JSON imports.
export function applyItineraryEdit(state: AppState, nextItinerary: ItineraryDay[]): AppState {
  const now = Date.now();
  const trip = activeTrip(state);
  const nextTrip: TripProfile = {
    ...trip,
    itinerary: nextItinerary,
    version: (trip.version || 0) + 1,
    itineraryVersion: (trip.itineraryVersion ?? trip.version ?? 0) + 1,
    updatedAt: now,
  };
  const baseTrips = state.trips?.length ? state.trips : [trip];
  const trips = baseTrips.some((t) => t.id === trip.id)
    ? baseTrips.map((t) => (t.id === trip.id ? nextTrip : t))
    : [...baseTrips, nextTrip];
  const stamp = (type: SyncQueueItem['type'], entityId: string, payload: SyncQueueItem['payload']): SyncQueueItem => ({
    id: `sync_${now}_${Math.random().toString(16).slice(2)}`,
    type,
    entityId,
    op: 'update',
    status: 'queued',
    attempts: 0,
    createdAt: now,
    updatedAt: now,
    payload,
  });
  return {
    ...state,
    trips,
    customItinerary: nextItinerary,
    settingsUpdatedAt: now,
    syncQueue: [
      ...(state.syncQueue || []),
      stamp('trip', trip.id, { sourceId: nextTrip.sourceId || `trip_${trip.id}`, updatedAt: now }),
      stamp('settings', 'app-settings', { updatedAt: now }),
    ].slice(-500),
  };
}

// Swap the CONTENT of two itinerary days (region/spots/lodging/…). Dates and Day numbers
// stay in place — this answers "Day 3 and Day 5 should trade places".
export function swapItineraryDays(itinerary: ItineraryDay[], dateA: string, dateB: string): ItineraryDay[] {
  const ia = itinerary.findIndex((d) => d.date === dateA);
  const ib = itinerary.findIndex((d) => d.date === dateB);
  if (ia < 0 || ib < 0 || ia === ib) return itinerary;
  const content = (d: ItineraryDay) => ({
    region: d.region,
    city: d.city,
    country: d.country,
    timezone: d.timezone,
    currency: d.currency,
    highlight: d.highlight,
    note: d.note,
    lodging: d.lodging,
    spots: d.spots,
  });
  const next = itinerary.slice();
  next[ia] = { ...itinerary[ia], ...content(itinerary[ib]) };
  next[ib] = { ...itinerary[ib], ...content(itinerary[ia]) };
  return next;
}

// One-shot migration: fold legacy per-spot overrides (personal memo layer) into the trip
// itinerary so they survive AI updates and become visible to shared-trip members.
// Returns null when there is nothing to bake.
export function bakeItineraryOverrides(state: AppState): ItineraryDay[] | null {
  const overrides = state.itineraryOverrides || {};
  if (!Object.keys(overrides).length) return null;
  const itinerary = getItinerary(state);
  if (!itinerary.length) return null;
  return itinerary.map((day) => ({
    ...day,
    spots: (day.spots || []).map((spot, idx) => ({
      ...spot,
      ...(overrides[spot.spotId || spot.id || overrideKey(day.date, idx)] || overrides[overrideKey(day.date, idx)] || {}),
    })),
  }));
}

export function getScheduleSpots(state: AppState, day: ItineraryDay): Array<ItinerarySpot & { _spotIdx: number; receiptId?: string }> {
  const trip = activeTrip(state);
  const tripReceipts = scopedReceiptsForTrip(state, trip);
  const base = (day.spots || []).map((spot, idx) => ({
    ...spot,
    ...(state.itineraryOverrides?.[spot.spotId || spot.id || overrideKey(day.date, idx)] || state.itineraryOverrides?.[overrideKey(day.date, idx)] || {}),
    _spotIdx: idx,
  }));
  const spots: Array<ItinerarySpot & { _spotIdx: number; receiptId?: string }> = [...base];

  const lodgingReceipt = tripReceipts.find((r) => r.date === day.date && r.category === 'lodging');
  if (lodgingReceipt) {
    const hotelSpot = {
      time: lodgingReceipt.time || '23:00',
      name: displayStore(lodgingReceipt),
      type: 'lodging' as const,
      note: lodgingReceipt.note || lodgingReceipt.bookingRef || '',
      address: lodgingReceipt.address || base.find((s) => s.type === 'lodging')?.address || '',
      _spotIdx: -1,
      receiptId: lodgingReceipt.id,
    };
    const idx = spots.findIndex((s) => s.type === 'lodging');
    if (idx >= 0) spots[idx] = hotelSpot;
    else spots.push(hotelSpot);
  }

  for (const r of tripReceipts.filter((item) => item.date === day.date && item.category === 'transport')) {
    if (r.bookingRef && spots.some((s) => s.receiptId === r.id)) continue;
    const time = r.time || '00:00';
    const idx = spots.findIndex((s) => s.type === 'transport' && s.time === time);
    const flightSpot = { time, name: displayStore(r), type: 'transport' as const, note: r.note || r.bookingRef || '', address: r.address || '', _spotIdx: -1, receiptId: r.id };
    if (idx >= 0) spots[idx] = { ...spots[idx], ...flightSpot, timezone: spots[idx].timezone };
    else spots.push(flightSpot);
  }

  return spots.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
}

export function dayLooseReceipts(
  state: AppState,
  day: ItineraryDay,
  precomputedSpots?: Array<ItinerarySpot & { _spotIdx: number; receiptId?: string }>,
): Receipt[] {
  const trip = activeTrip(state);
  const spots = precomputedSpots || getScheduleSpots(state, day);
  const spotIds = new Set(spots.map((s) => s.receiptId).filter(Boolean));
  return scopedReceiptsForTrip(state, trip).filter((r) => r.date === day.date && !spotIds.has(r.id) && !isSettlementReceipt(r));
}

export function mapsUrl(name: string, address?: string): string {
  const q = encodeURIComponent([name, address].filter(Boolean).join(' ') || name || address || '');
  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const google = `https://www.google.com/maps/search/?api=1&query=${q}`;
  if (isiOS) return `https://maps.apple.com/?q=${q}`;
  if (/Android/i.test(navigator.userAgent)) {
    return `intent://www.google.com/maps/search/?api=1&query=${q}#Intent;scheme=https;package=com.google.android.apps.maps;S.browser_fallback_url=${encodeURIComponent(google)};end`;
  }
  return google;
}

export function safeExternalUrl(value: unknown, fallback = ''): string {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (/^intent:\/\/www\.google\.com\/maps\/search\//i.test(raw)) return raw;
  try {
    const url = new URL(raw, window.location.origin);
    const protocol = url.protocol.toLowerCase();
    const host = url.hostname.toLowerCase();
    if (protocol === 'https:' && ['www.google.com', 'google.com', 'maps.google.com', 'maps.apple.com'].includes(host)) return url.href;
    if (['maps:', 'geo:'].includes(protocol)) return raw;
  } catch {
    return fallback;
  }
  return fallback;
}

export function safePhotoUrl(value: unknown, fallback = '', _depth = 0): string {
  let raw = String(value || '').trim();
  if (!raw) {
    return fallback && _depth < 2 ? safePhotoUrl(fallback, '', _depth + 1) : '';
  }

  // 1. Cleanup duplicate/nested data URL prefixes (e.g. data:image/jpeg;base64,data:image/jpeg;base64,...)
  raw = raw.replace(/^(?:data:image\/(?:png|jpe?g|webp|gif);base64,)+data:image\//i, 'data:image/');

  // 2. If it is a pure base64 string (no data: or http prefix, fits base64 characters), wrap it automatically
  if (/^[a-z0-9+/=\s]{30,}$/i.test(raw) && !raw.startsWith('data:') && !raw.startsWith('http')) {
    raw = `data:image/jpeg;base64,${raw}`;
  }

  // 3. Relax length limit to 5MB and trim whitespace/newlines before validating format
  const cleanRaw = raw.replace(/[\r\n\s]/g, '');
  if (cleanRaw.length <= 5_000_000 && /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(cleanRaw)) {
    return cleanRaw;
  }

  try {
    const url = new URL(raw, window.location.origin);
    if (url.protocol === 'https:') {
      return url.href;
    }
  } catch {
    return fallback && _depth < 2 ? safePhotoUrl(fallback, '', _depth + 1) : '';
  }

  return fallback && _depth < 2 ? safePhotoUrl(fallback, '', _depth + 1) : '';
}

// A receipt may be owner-only ('private' visibility) ONLY when it cannot affect anyone else's
// balance: personal split (payer bears 100%) without a cross-person beneficiary. This keeps every
// pairwise debt computable identically by both parties from the records each of them can see.
export function canBePrivateReceipt(r: Pick<Receipt, 'splitMode' | 'beneficiaryId' | 'personId'>): boolean {
  return r.splitMode === 'private' && (!r.beneficiaryId || r.beneficiaryId === r.personId);
}

export function computeSettlements(state: AppState): SettlementSnapshot {
  const persons = getPersons(state);
  const empty: SettlementSnapshot = { transfers: [], balances: [], sharedTotal: 0, sharedByPayer: [], privateByOwner: [], crossPrivate: [], settledTotal: 0 };
  if (persons.length < 2) return empty;

  const trip = activeTrip(state);
  const resolvedTripCurrency = getResolvedTripCurrency(state, trip);
  // Scope to the active trip so settlements never leak across trips. Idempotent
  // when callers already pre-scope receipts (Settings/Stats do).
  const tripReceipts = scopedReceiptsForTrip(state, trip);

  // A person with NO shareRatios entry defaults to the mean of the participating (positive) ratios,
  // NOT a hardcoded 1 — otherwise, once anyone uses percentage-scale weights (e.g. 50/50), a missing
  // person would be charged 1/(101) instead of a fair share. An explicit 0 stays 0 (opted out).
  const rawRatios = persons.map((p) => {
    const v = Number(state.shareRatios?.[p.id]);
    return Number.isFinite(v) && v >= 0 ? v : null;
  });
  const positiveRatios = rawRatios.filter((v): v is number => v !== null && v > 0);
  const meanRatio = positiveRatios.length ? positiveRatios.reduce((a, b) => a + b, 0) / positiveRatios.length : 1;
  const ratios = rawRatios.map((v) => (v === null ? meanRatio : v));
  const sumRatio = ratios.reduce((a, b) => a + b, 0);
  const firstId = persons[0].id;
  const idxOf = (id?: string) => persons.findIndex((p) => p.id === id);
  const sharedByPayer = persons.map(() => 0);
  const explicitShouldPayShared = persons.map(() => 0);
  const privateByOwner = persons.map(() => 0);
  const crossPrivate: SettlementSnapshot['crossPrivate'] = [];
  // Recorded "settle up" payments: debtor (personId) paid creditor (beneficiaryId) `total` in the
  // trip currency. They cancel out outstanding balances without being spending.
  const settleAdjust = persons.map(() => 0);
  let settledTotal = 0;
  let sharedTotal = 0;
  let ratioSharedTotal = 0;

  const addSharedPayers = (payers: ReceiptPayer[] | undefined, amount: number, receiptTotal: number, fallbackPayerIdx: number): boolean => {
    if (!payers?.length) return false;
    const valid = payers
      .map((payer) => ({ idx: idxOf(payer.personId), amount: Number(payer.amount) || 0 }))
      .filter((payer) => payer.idx >= 0 && payer.amount > 0);
    const paidTotal = valid.reduce((sum, payer) => sum + payer.amount, 0);
    // payers are entered in the receipt currency → validate against the receipt total, then credit
    // the trip-currency `amount` split by each payer's share (identity when currencies match).
    const base = receiptTotal > 0 ? receiptTotal : amount;
    if (Math.round(paidTotal) !== Math.round(base)) return false;
    const credited = computeShares(amount, 'shares', valid.map((payer) => ({ personId: String(payer.idx), weight: payer.amount })));
    for (const [key, credit] of credited) sharedByPayer[Number(key)] += credit;
    return fallbackPayerIdx >= 0 || valid.length > 0;
  };

  for (const r of tripReceipts) {
    if (isSettlementReceipt(r)) {
      const fromIdx = idxOf(r.personId || firstId);
      const toIdx = idxOf(r.beneficiaryId);
      const amt = Number(r.total) || 0;
      if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx && amt > 0) {
        settleAdjust[fromIdx] += amt; // the payer reduces what they owe
        settleAdjust[toIdx] -= amt;   // the receiver reduces what they are owed
        settledTotal += amt;
      }
      continue;
    }
    const amount = getReceiptTripAmount(r, state, resolvedTripCurrency);
    if (amount <= 0) continue;
    const payerIdx = idxOf(r.personId || firstId);
    if (payerIdx < 0) {
      console.warn(`[settlement] receipt ${r.id} payer ${r.personId} not found — excluded from settlement`);
      continue;
    }
    // 'private'-VISIBILITY receipts are always splitMode 'private' without a cross beneficiary
    // (canBePrivateReceipt, enforced on save + normalize), so they only ever add to the owner's
    // privateByOwner bucket and never produce transfers — members who can't see the record
    // compute identical transfer amounts.
    if (r.splitMode === 'private') {
      if (r.beneficiaryId && idxOf(r.beneficiaryId) < 0) {
        console.warn(`[settlement] private receipt ${r.id} beneficiary ${r.beneficiaryId} not found — attributing to payer`);
      }
      const benIdx = idxOf(r.beneficiaryId || r.personId || firstId);
      if (benIdx < 0 || benIdx === payerIdx) privateByOwner[payerIdx] += amount;
      else {
        privateByOwner[benIdx] += amount;
        crossPrivate.push({ payerIdx, benIdx, amount, payer: persons[payerIdx], beneficiary: persons[benIdx], store: r.store, date: r.date, id: r.id });
      }
    } else {
      const receiptTotal = Number(r.total) || 0;
      if (!addSharedPayers(r.payers, amount, receiptTotal, payerIdx)) sharedByPayer[payerIdx] += amount;
      if (r.splits?.length) {
        try {
          // Splits are entered in the receipt's own currency (they sum to r.total). Compute shares
          // there, then redistribute the receipt's trip-currency `amount` by those shares with
          // largest-remainder so cross-currency receipts keep their exact/% split. When the receipt
          // currency equals the trip currency, receiptTotal === amount and this is an identity.
          const receiptShares = computeShares(receiptTotal > 0 ? receiptTotal : amount, r.splitType || 'equal', r.splits);
          const sumW = [...receiptShares].reduce((acc, [, w]) => acc + w, 0);
          // If the receipt's own-currency total rounds to ~0 (sub-unit) while the converted trip
          // amount is > 0, the share weights are all 0 — fall back to ratios so the debit still
          // balances the credit instead of silently leaving the payer owed with no debtor.
          if (sumW <= 0) throw new Error('receipt total rounds to zero — using trip ratios');
          const shares = receiptTotal > 0 && receiptTotal !== amount
            ? computeShares(amount, 'shares', [...receiptShares].map(([personId, owed]) => ({ personId, weight: owed })))
            : receiptShares;
          for (const [personId, owed] of shares) {
            const idx = idxOf(personId);
            if (idx < 0) throw new Error(`split person ${personId} not found`);
            explicitShouldPayShared[idx] += owed;
          }
        } catch (error) {
          console.warn(`[settlement] receipt ${r.id} invalid splits — falling back to trip ratios`, error);
          ratioSharedTotal += amount;
        }
      } else {
        ratioSharedTotal += amount;
      }
      sharedTotal += amount;
    }
  }

  const balances = persons.map((p, i) => {
    // If every ratio is 0 (misconfigured), fall back to an equal split so shared expenses
    // still settle (payers get reimbursed) instead of silently producing zero transfers.
    const shouldPayShared = sumRatio > 0
      ? ratioSharedTotal * (ratios[i] / sumRatio)
      : ratioSharedTotal / persons.length;
    const explicitShouldPay = explicitShouldPayShared[i];
    const totalShouldPayShared = shouldPayShared + explicitShouldPay;
    let balance = sharedByPayer[i] - totalShouldPayShared + settleAdjust[i];
    for (const cp of crossPrivate) {
      if (cp.payerIdx === i) balance += cp.amount;
      if (cp.benIdx === i) balance -= cp.amount;
    }
    return { ...p, balance, paidShared: sharedByPayer[i], shouldPayShared: totalShouldPayShared };
  });

  // Round each net balance to whole units while preserving the zero-sum invariant BEFORE
  // simplifying debts. Passing raw floats made per-transfer Math.round accumulate up to ~2 units
  // of residual on the last-settled person (visible on HKD/USD trips). Integer balances settle exactly.
  const roundedBalanceVals = roundZeroSum(balances.map((b) => b.balance));
  const roundedBalances = balances.map((b, i) => ({ ...b, balance: roundedBalanceVals[i] }));
  const transfers: SettlementSnapshot['transfers'] = simplifyDebts(roundedBalances.map((b) => b.balance))
    .map((t) => ({ from: roundedBalances[t.from], to: roundedBalances[t.to], amount: t.amount }));

  return { transfers, balances: roundedBalances, sharedTotal, sharedByPayer, privateByOwner, crossPrivate, settledTotal };
}

// Build a settlement receipt: `from` pays `to` `amount` (in trip currency). It records a real
// payment that cancels outstanding debt; it is excluded from spending and labelled as a settlement.
export function createSettlementReceipt(opts: {
  from: Person;
  to: Person;
  amount: number;
  currency: string;
  hkdAmount: number;
  date: string;
  note?: string;
}): Receipt {
  const rand = Math.random().toString(36).slice(2, 8);
  return {
    id: `r_${Date.now()}_${rand}`,
    store: `結算 · ${opts.from.name} → ${opts.to.name}`,
    total: Math.round(opts.amount),
    currency: opts.currency,
    hkdAmount: Math.round(opts.hkdAmount),
    date: opts.date,
    category: SETTLEMENT_CATEGORY,
    payment: 'cash',
    personId: opts.from.id,
    beneficiaryId: opts.to.id,
    splitMode: 'private',
    isSettlement: true,
    note: opts.note?.trim() || undefined,
    createdAt: Date.now(),
  } as Receipt;
}

export function exportCsv(state: AppState): void {
  const rows = [['日期', '時間', '旅程', '店名', '類別', '支付', '原金額', '貨幣', '金額(legacy)', 'HKD', '付款人', '地區', '地址', 'Booking Ref', '備註', '品項']];
  const persons = getPersons(state);
  const firstId = persons[0].id;
  const trips = state.trips || [];
  const currentTrip = activeTrip(state);
  for (const r of scopedReceiptsForTrip(state, currentTrip)) {
    const person = persons.find((p) => p.id === (r.personId || firstId));
    const trip = trips.find((item) => item.id === r.tripId);
    rows.push([
      r.date,
      r.time || '',
      trip?.name || r.tripId || '',
      displayStore(r),
      categoryById(r.category).name,
      paymentById(r.payment).name,
      String(r.originalAmount ?? r.total ?? 0),
      r.originalCurrency || r.currency || state.tripCurrency,
      String(r.total || 0),
      String(r.hkdAmount ?? getReceiptHkdAmount(r, state)),
      person ? `${person.emoji} ${person.name}` : '',
      receiptRegion(state, r),
      r.address || '',
      r.bookingRef || '',
      r.note || '',
      (r.itemsText || '').replace(/\n/g, '; '),
    ]);
  }
  const csv = '\uFEFF' + rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const filename = `${(currentTrip.name || 'travel-expense').replace(/[^\w\u4e00-\u9fff-]+/g, '-')}-receipts-${todayYmd()}.csv`;
  void saveFile(filename, 'text/csv;charset=utf-8', csv);
}

export async function compressPhoto(base64: string, mime?: string, maxWOverride?: number): Promise<string | null> {
  if (!base64) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxW = maxWOverride || 480;
        const scale = Math.min(1, maxW / img.width);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, c.width, c.height);
        // Keep the thumbnail comfortably under sync payload limits even for large/complex
        // images by stepping quality down until the base64 fits (~1MB binary).
        const MAX_B64 = 1_400_000;
        let quality = 0.65;
        let dataUrl = c.toDataURL('image/jpeg', quality);
        while (dataUrl.length > MAX_B64 && quality > 0.3) {
          quality -= 0.15;
          dataUrl = c.toDataURL('image/jpeg', quality);
        }
        resolve(dataUrl.split(',')[1] || null);
      } catch (e) {
        console.warn('[compressPhoto] failed:', e instanceof Error ? e.message : String(e));
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = `data:${mime || 'image/jpeg'};base64,${base64}`;
  });
}

export async function prepareForOCR(base64: string, mime?: string): Promise<{ base64: string; mime: string }> {
  if (!base64) return { base64, mime: mime || 'image/jpeg' };
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const longer = Math.max(img.width, img.height);
        if (longer <= 2016) {
          resolve({ base64, mime: mime || 'image/jpeg' });
          return;
        }
        const scale = 2016 / longer;
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) {
          resolve({ base64, mime: mime || 'image/jpeg' });
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = c.toDataURL('image/jpeg', 0.85);
        const out = dataUrl.split(',')[1] || base64;
        resolve({ base64: out, mime: 'image/jpeg' });
      } catch (e) {
        console.warn('[prepareForOCR] failed, using original:', e instanceof Error ? e.message : String(e));
        resolve({ base64, mime: mime || 'image/jpeg' });
      }
    };
    img.onerror = () => resolve({ base64, mime: mime || 'image/jpeg' });
    img.src = `data:${mime || 'image/jpeg'};base64,${base64}`;
  });
}

export function openMapExternal(mapUrl: string | undefined, name: string, address?: string): void {
  let targetUrl = '';
  const raw = String(mapUrl || '').trim();
  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // 1. Resolve raw URL if it's an intent:// link
  if (raw.startsWith('intent://')) {
    // Extract browser_fallback_url
    const match = raw.match(/S\.browser_fallback_url=([^;]+)/);
    if (match && match[1]) {
      targetUrl = decodeURIComponent(match[1]);
    } else {
      // Parse query from intent
      const qMatch = raw.match(/query=([^&;#\s]+)/);
      const queryVal = qMatch ? decodeURIComponent(qMatch[1]) : '';
      if (queryVal) {
        targetUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryVal)}`;
      } else {
        // Fallback to name/address
        const q = [name, address].filter(Boolean).join(' ') || name || address || '';
        targetUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
      }
    }
  } else if (raw.startsWith('https://') || raw.startsWith('http://')) {
    targetUrl = raw;
  } else {
    // No valid URL, let's build one based on name/address
    const q = [name, address].filter(Boolean).join(' ') || name || address || '';
    targetUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }

  // 2. Adjust targetUrl according to current platform (especially iOS Apple Maps vs Google Maps)
  // ONLY use Apple Maps for iOS mobile devices. Desktop macOS Chrome should always use Google Maps.
  if (isIOS) {
    if (targetUrl.includes('google.com/maps') || targetUrl.includes('maps.google.com')) {
      const qMatch = targetUrl.match(/[?&]query=([^&]+)/) || targetUrl.match(/[?&]q=([^&]+)/);
      if (qMatch && qMatch[1]) {
        targetUrl = `https://maps.apple.com/?q=${qMatch[1]}`;
      }
    }
  } else if (isAndroid) {
    // On Android, if we have an intent URL, we can keep it, otherwise format standard URL to Android Intent
    if (!targetUrl.startsWith('intent://') && (targetUrl.includes('google.com/maps') || targetUrl.includes('maps.google.com'))) {
      const qMatch = targetUrl.match(/[?&]query=([^&]+)/) || targetUrl.match(/[?&]q=([^&]+)/);
      if (qMatch && qMatch[1]) {
        const fallback = encodeURIComponent(targetUrl);
        targetUrl = `intent://www.google.com/maps/search/?api=1&query=${qMatch[1]}#Intent;scheme=https;package=com.google.android.apps.maps;S.browser_fallback_url=${fallback};end`;
      }
    }
  }

  // Native (Capacitor): open a Custom Tab with a vetted https URL instead of navigating the WebView to
  // a raw intent:// / custom scheme. A receipt's mapUrl can come from another shared-trip member, so an
  // attacker-controlled intent:// could otherwise launch arbitrary intents or strand the user on a
  // "scheme not supported" WebView error (intent:// browser_fallback_url is a Chrome feature, not a
  // WebView one). Chrome's Custom Tab still hands off to the Maps app itself when it's installed.
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.()) {
    let httpsUrl = targetUrl;
    if (targetUrl.startsWith('intent://')) {
      const fb = targetUrl.match(/S\.browser_fallback_url=([^;]+)/);
      httpsUrl = fb && fb[1] ? decodeURIComponent(fb[1]) : '';
    }
    if (!httpsUrl.startsWith('https://')) {
      const q = [name, address].filter(Boolean).join(' ') || name || address || '';
      httpsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    }
    void import('@capacitor/browser')
      .then(({ Browser }) => Browser.open({ url: httpsUrl }))
      .catch((err) => { console.error('[openMapExternal] Browser.open failed:', err); });
    return;
  }

  // 3. Double-channel navigation to bypass popup blocker with strict page visibility fallback
  const start = Date.now();
  let opened = false;

  try {
    const a = document.createElement('a');
    a.href = targetUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    opened = true;
  } catch (err) {
    console.error('Failed to open map via anchor click fallback to location.href:', err);
  }

  // Visibility detection fallback (highly robust for standalone PWA modes and restricted webviews)
  setTimeout(() => {
    // If the browser did not go to background within 1.5s, it means the native scheme or redirect silently failed
    const duration = Date.now() - start;
    if (duration < 2500 && !document.hidden && !opened) {
      // Fallback to a standard HTTPS google maps web URL
      const cleanQ = [name, address].filter(Boolean).join(' ') || name || '';
      const fallbackUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanQ)}`;
      console.log('Detect potential launch failure, falling back to HTTPS Web Google Maps:', fallbackUrl);
      window.open(fallbackUrl, '_blank');
    }
  }, 1200);
}

function nextRunDate(current: string, frequency: RecurringRule['frequency'], anchorDay: number): string {
  const d = new Date(current + 'T00:00:00');
  if (frequency === 'daily') d.setDate(d.getDate() + 1);
  else if (frequency === 'weekly') d.setDate(d.getDate() + 7);
  else {
    // Clamp against a FIXED anchor day (the rule's originally-configured day-of-month), not the
    // previous occurrence's date. Deriving "day" from the previous run compounds permanently: once a
    // short month clamps 31→28, every later 31-day month keeps clamping to 28 too — the rule can never
    // recover its intended day. Clamping against a fixed anchor lets a 31st-of-month rule correctly
    // skip only the short months, not degrade forever.
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(anchorDay, daysInMonth));
  }
  // Local YMD — toISOString() shifts the date by the UTC offset (one day earlier in HKT),
  // which left daily rules' nextRun stuck on the same day → unbounded duplicate spawns.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function processRecurringRules(state: AppState): { receipts: Receipt[]; updatedRules: RecurringRule[] } {
  const rules = state.recurringRules || [];
  if (!rules.length) return { receipts: [], updatedRules: rules };
  const today = todayYmd();
  const now = Date.now();
  const newReceipts: Receipt[] = [];
  const updatedRules: RecurringRule[] = [];
  for (const rule of rules) {
    if (!rule.active) {
      updatedRules.push(rule);
      continue;
    }
    // Catch up every due occurrence (bounded), advancing nextRun each time so a missed-day rule
    // never re-spawns the same date on the next launch.
    let nextRun = rule.nextRun;
    let spawned = 0;
    // Anchor day is captured once per rule per call, from the rule's day-of-month at the start of
    // processing — every monthly advance within this batch clamps against the SAME anchor, so a
    // multi-month catch-up run doesn't ratchet the day down further with each iteration.
    const anchorDay = new Date(rule.nextRun + 'T00:00:00').getDate();
    while (/^\d{4}-\d{2}-\d{2}$/.test(nextRun) && nextRun <= today && spawned < 400) {
      const receiptCurrency = rule.currency || state.tripCurrency || 'JPY';
      // Stamp the FX rate at spawn time, same as every other receipt-creation path (scan/voice/email/
      // manual) — otherwise this receipt has no stored exchangeRate/hkdAmount and re-prices itself at
      // whatever the LIVE rate happens to be whenever a budget/settlement view renders, drifting from
      // its manually-entered/scanned siblings as the rate moves.
      const fxRate = receiptCurrency === 'HKD' ? undefined : perHkdForCurrency(state, receiptCurrency);
      newReceipts.push({
        id: `recurring_${rule.id}_${nextRun}_${Math.random().toString(16).slice(2)}`,
        store: rule.store,
        total: rule.total,
        date: nextRun,
        category: rule.category,
        payment: rule.payment,
        currency: receiptCurrency,
        originalCurrency: receiptCurrency,
        exchangeRate: fxRate,
        hkdAmount: fxRate ? Math.round(rule.total / Math.max(0.1, fxRate)) : undefined,
        personId: rule.personId || state.persons?.[0]?.id || '',
        splitMode: rule.splitMode || 'shared',
        tripId: state.activeTripId,
        source: 'recurring',
        createdAt: now,
        updatedAt: now,
      });
      nextRun = nextRunDate(nextRun, rule.frequency, anchorDay);
      spawned += 1;
    }
    updatedRules.push(spawned ? { ...rule, nextRun, updatedAt: now } : rule);
  }
  return { receipts: newReceipts, updatedRules };
}
