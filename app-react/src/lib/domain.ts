import { CATEGORIES, ITINERARY, PAYMENTS } from './constants';
import { activeTrip, normalizeItinerary, normalizeZone, scopedReceiptsForTrip } from '../domain/trip/normalize';
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
  if (state.customItinerary && state.customItinerary.length) return normalizeItinerary(state.customItinerary, state.activeTripId || 'trip_default', state.tripCurrency);
  // Fallback: always normalize the constant ITINERARY to ensure stable dayId/spotId
  return normalizeItinerary(ITINERARY, state.activeTripId || 'trip_default', state.tripCurrency || 'JPY');
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
          mapUrl: s.mapUrl ? String(s.mapUrl) : '',
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

export function getResolvedTripCurrency(state: AppState, trip: any): string {
  if (trip.currencies && trip.currencies.length > 0) {
    const cur = trip.currencies.find((c: string) => c !== 'HKD');
    if (cur) return cur;
  }
  const intelligentCurrency = String(trip.intelligence?.primaryCurrency || '').toUpperCase();
  if (intelligentCurrency && intelligentCurrency !== 'HKD') return intelligentCurrency;
  return state.tripCurrency || 'JPY';
}

export function getReceiptHkdAmount(r: Receipt, state: AppState): number {
  const cur = r.currency || 'JPY';
  if (cur === 'HKD') {
    return Number(r.total) || 0;
  }
  const rate = Math.max(
    0.1,
    Number(r.exchangeRate) ||
    Number(state.rateTable?.[cur]?.perHkd) ||
    (cur === 'JPY' ? Number(state.rate) : undefined) ||
    20.36
  );

  // Self-Healing validation: check if hkdAmount is clean
  let isHkdAmountValid = false;
  if (typeof r.hkdAmount === 'number' && r.hkdAmount > 0) {
    const ratio = (Number(r.total) || 0) / r.hkdAmount;
    const percentDiff = Math.abs(ratio - rate) / rate;
    if (percentDiff < 0.4) {
      isHkdAmountValid = true;
    }
  }

  if (isHkdAmountValid && typeof r.hkdAmount === 'number') {
    return r.hkdAmount;
  }

  return Math.round((Number(r.total) || 0) / rate);
}

export function getReceiptTripAmount(r: Receipt, state: AppState, resolvedTripCurrency: string): number {
  const cur = r.currency || 'JPY';
  if (cur === resolvedTripCurrency) {
    return Number(r.total) || 0;
  }
  const hkdAmt = getReceiptHkdAmount(r, state);
  const activeRate = Math.max(
    0.1,
    Number(state.rateTable?.[resolvedTripCurrency]?.perHkd) ||
    (resolvedTripCurrency === 'JPY' ? Number(state.rate) : undefined) ||
    20.36
  );
  return Math.round(hkdAmt * activeRate);
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

export function dayLooseReceipts(state: AppState, day: ItineraryDay): Receipt[] {
  const trip = activeTrip(state);
  const spotIds = new Set(getScheduleSpots(state, day).map((s) => s.receiptId).filter(Boolean));
  return scopedReceiptsForTrip(state, trip).filter((r) => r.date === day.date && !spotIds.has(r.id));
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
  let raw = String(value || '').trim();
  if (!raw) {
    return fallback ? safePhotoUrl(fallback) : '';
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
    return fallback ? safePhotoUrl(fallback) : '';
  }

  return fallback ? safePhotoUrl(fallback) : '';
}

export function computeSettlements(state: AppState): SettlementSnapshot {
  const persons = getPersons(state);
  const empty: SettlementSnapshot = { transfers: [], balances: [], sharedTotal: 0, sharedByPayer: [], privateByOwner: [], crossPrivate: [] };
  if (persons.length < 2) return empty;

  const trip = activeTrip(state);
  const resolvedTripCurrency = getResolvedTripCurrency(state, trip);

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
    const amount = getReceiptTripAmount(r, state, resolvedTripCurrency);
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
  a.download = `${(currentTrip.name || 'travel-expense').replace(/[^\w\u4e00-\u9fff-]+/g, '-')}-receipts-${todayYmd()}.csv`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1500);
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
        const dataUrl = c.toDataURL('image/jpeg', 0.65);
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
