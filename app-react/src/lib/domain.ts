import { CATEGORIES, ITINERARY, PAYMENTS } from './constants';
import { activeTrip, normalizeItinerary, normalizeZone } from '../domain/trip/normalize';
import type { AppState, CategoryId, ItineraryDay, ItinerarySpot, PaymentId, Person, Receipt, SettlementSnapshot, TripPhase } from './types';

export const fmt = (n: number | string | undefined) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(n) || 0);

export const categoryById = (id: CategoryId | string | undefined) =>
  CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

export const paymentById = (id: PaymentId | string | undefined) =>
  PAYMENTS.find((p) => p.id === id) || PAYMENTS[0];

export function getItinerary(state: AppState): ItineraryDay[] {
  const trip = activeTrip(state);
  if (trip?.itinerary?.length) return normalizeItinerary(trip.itinerary, trip.id, trip.currencies?.[1] || state.tripCurrency || 'JPY');
  return state.customItinerary && state.customItinerary.length ? normalizeItinerary(state.customItinerary, state.activeTripId || 'trip_default', state.tripCurrency) : ITINERARY;
}

export function validateItinerary(input: unknown): { ok: true; itinerary: ItineraryDay[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: 'JSON 必須係 itinerary array' };
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
      highlight: d.highlight ? String(d.highlight) : '',
      spots: d.spots.map((spot, spotIdx) => {
        const s = spot && typeof spot === 'object' ? spot as Partial<ItinerarySpot> : {};
        return {
          time: String(s.time || '00:00'),
          name: String(s.name || `Spot ${spotIdx + 1}`),
          type: (s.type || 'other') as ItinerarySpot['type'],
          note: s.note ? String(s.note) : '',
          address: s.address ? String(s.address) : '',
          timezone: s.timezone ? String(s.timezone) : '',
        };
      }),
    });
  }
  return { ok: true, itinerary: days };
}

export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1500);
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
  return state.persons && state.persons.length ? state.persons : [
    { id: 'p_boss', name: 'Tony', emoji: '👦', color: '#CC2929' },
    { id: 'p_xinxin', name: '欣欣', emoji: '👧', color: '#FF91A4' },
  ];
}

export function displayStore(receipt: Receipt): string {
  return receipt.store?.startsWith('⏳ ') ? receipt.store.slice(2) : receipt.store || '';
}

export function isPendingReceipt(receipt: Receipt): boolean {
  return receipt.store?.startsWith('⏳ ') || false;
}

export function hkd(jpy: number, state: AppState): number {
  const rate = Math.max(0.1, Number(state.rate) || 20.36);
  return Math.round((Number(jpy) || 0) / rate);
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

export function getScheduleSpots(state: AppState, day: ItineraryDay): Array<ItinerarySpot & { _spotIdx: number; receiptId?: string }> {
  const trip = activeTrip(state);
  const tripReceipts = state.receipts.filter((r) => !r.tripId || r.tripId === trip.id);
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

export function dayLooseReceipts(state: AppState, day: ItineraryDay): Receipt[] {
  const trip = activeTrip(state);
  const spotIds = new Set(getScheduleSpots(state, day).map((s) => s.receiptId).filter(Boolean));
  return (state.receipts || []).filter((r) => (!r.tripId || r.tripId === trip.id) && r.date === day.date && !spotIds.has(r.id));
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

export function safePhotoUrl(value: unknown, fallback = ''): string {
  const raw = String(value || '').trim();
  if (!raw) return fallback ? safePhotoUrl(fallback) : '';
  if (raw.length <= 1_200_000 && /^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(raw)) return raw;
  try {
    const url = new URL(raw, window.location.origin);
    const host = url.hostname.toLowerCase();
    if (url.protocol === 'https:' && (host === 'secure.notion-static.com' || host.endsWith('.amazonaws.com'))) return url.href;
  } catch {
    return fallback;
  }
  return fallback;
}

export function computeSettlements(state: AppState): SettlementSnapshot {
  const persons = getPersons(state);
  const empty: SettlementSnapshot = { transfers: [], balances: [], sharedTotal: 0, sharedByPayer: [], privateByOwner: [], crossPrivate: [] };
  if (persons.length < 2) return empty;

  const ratios = persons.map((p) => {
    const v = Number(state.shareRatios?.[p.id]);
    return Number.isFinite(v) && v >= 0 ? v : 1;
  });
  const sumRatio = ratios.reduce((a, b) => a + b, 0);
  const firstId = persons[0].id;
  const idxOf = (id?: string) => persons.findIndex((p) => p.id === id);
  const sharedByPayer = persons.map(() => 0);
  const privateByOwner = persons.map(() => 0);
  const crossPrivate: SettlementSnapshot['crossPrivate'] = [];
  let sharedTotal = 0;

  for (const r of state.receipts) {
    const amount = Number(r.total) || 0;
    if (amount <= 0) continue;
    const payerIdx = idxOf(r.personId || firstId);
    if (payerIdx < 0) continue;
    if (r.splitMode === 'private') {
      const benIdx = idxOf(r.beneficiaryId || r.personId || firstId);
      if (benIdx < 0 || benIdx === payerIdx) privateByOwner[payerIdx] += amount;
      else {
        privateByOwner[benIdx] += amount;
        crossPrivate.push({ payerIdx, benIdx, amount, payer: persons[payerIdx], beneficiary: persons[benIdx], store: r.store, date: r.date, id: r.id });
      }
    } else {
      sharedByPayer[payerIdx] += amount;
      sharedTotal += amount;
    }
  }

  const balances = persons.map((p, i) => {
    const shouldPayShared = sumRatio > 0 ? sharedTotal * (ratios[i] / sumRatio) : 0;
    let balance = sharedByPayer[i] - shouldPayShared;
    for (const cp of crossPrivate) {
      if (cp.payerIdx === i) balance += cp.amount;
      if (cp.benIdx === i) balance -= cp.amount;
    }
    return { ...p, balance, paidShared: sharedByPayer[i], shouldPayShared };
  });

  const work = balances.map((b) => ({ ...b }));
  const transfers: SettlementSnapshot['transfers'] = [];
  for (let safety = 0; safety < 100; safety++) {
    work.sort((a, b) => a.balance - b.balance);
    const debtor = work[0];
    const creditor = work[work.length - 1];
    if (!debtor || !creditor || debtor.balance >= -0.5 || creditor.balance <= 0.5) break;
    const amount = Math.min(-debtor.balance, creditor.balance);
    debtor.balance += amount;
    creditor.balance -= amount;
    transfers.push({ from: debtor, to: creditor, amount: Math.round(amount) });
  }

  return { transfers, balances, sharedTotal, sharedByPayer, privateByOwner, crossPrivate };
}

export function exportCsv(state: AppState): void {
  const rows = [['日期', '時間', '旅程', '店名', '類別', '支付', '原金額', '貨幣', '金額(legacy)', 'HKD', '付款人', '地區', '地址', 'Booking Ref', '備註', '品項']];
  const persons = getPersons(state);
  const firstId = persons[0].id;
  const trips = state.trips || [];
  for (const r of state.receipts) {
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
      String(r.hkdAmount ?? hkd(r.total, state)),
      person ? `${person.emoji} ${person.name}` : '',
      receiptRegion(state, r),
      r.address || '',
      r.bookingRef || '',
      r.note || '',
      (r.itemsText || '').replace(/\n/g, '; '),
    ]);
  }
  const csv = '\uFEFF' + rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(activeTrip(state).name || 'travel-expense').replace(/[^\w\u4e00-\u9fff-]+/g, '-')}-receipts-${todayYmd()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
