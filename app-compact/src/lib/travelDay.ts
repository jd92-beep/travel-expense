import { activeTrip, scopedReceiptsForTrip } from '../domain/trip/normalize';
import { displayStore, getReceiptTripAmount, getResolvedTripCurrency, getScheduleSpots, isPendingReceipt, safePhotoUrl } from './domain';
import type { AppState, ItineraryDay, ItinerarySpot, Receipt } from './types';

export type TravelDayWidgetKind = 'transit' | 'receipt' | 'weather' | 'booking';
export type DayReadinessTone = 'ready' | 'watch' | 'review' | 'risk';
export type WeatherPackingTone = 'ready' | 'watch' | 'review' | 'risk';

export interface TravelDayWidget {
  kind: TravelDayWidgetKind;
  label: string;
  value: string;
  detail: string;
}

export interface DayReadinessScore {
  date: string;
  day: number;
  region: string;
  score: number;
  tone: DayReadinessTone;
  label: string;
  detail: string;
  issues: string[];
}

export interface WeatherPackingRisk {
  date: string;
  day: number;
  region: string;
  tone: WeatherPackingTone;
  label: string;
  detail: string;
  items: string[];
}

export type ItineraryReceiptTone = 'ok' | 'missing' | 'gap' | 'high' | 'outside';

export interface ItineraryReceiptDay {
  date: string;
  day: number;
  region: string;
  spotCount: number;
  receiptCount: number;
  amount: number;
  tone: ItineraryReceiptTone;
  label: string;
  detail: string;
}

export interface ItineraryReceiptReconciliation {
  currency: string;
  totalDays: number;
  missingDays: number;
  gapDays: number;
  highCountDays: number;
  outsideDays: number;
  reviewCount: number;
  days: ItineraryReceiptDay[];
  outside: ItineraryReceiptDay[];
}

type ScheduleSpot = ItinerarySpot & { _spotIdx: number; receiptId?: string };

const ROUTE_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const WEATHER_STALE_MS = 2 * 60 * 60 * 1000;
const BOOKING_STALE_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_REASONABLE_TIMESTAMP = new Date('2020-01-01T00:00:00Z').getTime();
const LARGE_PHOTO_BYTES = 600_000;

export function buildTravelDayWidgets(state: AppState, itinerary: ItineraryDay[], nowMs = Date.now()): TravelDayWidget[] {
  const day = resolveTravelDay(itinerary, nowMs);
  if (!day) {
    return [
      { kind: 'transit', label: 'Transit countdown', value: '--', detail: '匯入行程後顯示下一段交通' },
      { kind: 'receipt', label: 'Receipt reminder', value: '0 stops done · 0 receipts', detail: '未有今日行程' },
      { kind: 'weather', label: 'Weather alert', value: 'Refresh weather', detail: '未有目的地天氣 context' },
      { kind: 'booking', label: 'Booking note', value: 'No booking yet', detail: '未有下一個 booking reference' },
    ];
  }

  const zone = normalizeTravelTimezone(day.timezone);
  const current = datePartsForZone(nowMs, zone);
  const nowMinutes = current?.date === day.date ? current.minutes : current && current.date > day.date ? 24 * 60 : 0;
  const spots = getScheduleSpots(state, day);
  const tripReceipts = scopedReceiptsForTrip(state, activeTrip(state)).filter((receipt) => receipt.date === day.date);
  const receiptsUntilNow = tripReceipts.filter((receipt) => minutesForTime(receipt.time) <= nowMinutes);
  const completedSpots = spots.filter((spot) => minutesForTime(spot.time) <= nowMinutes);
  const nextTransport = spots.find((spot) => minutesForTime(spot.time) > nowMinutes && spot.type === 'transport');
  const nextSpot = spots.find((spot) => minutesForTime(spot.time) > nowMinutes);
  const transitTarget = nextTransport || nextSpot;
  const minutesToTransit = transitTarget ? Math.max(0, minutesForTime(transitTarget.time) - nowMinutes) : null;
  const missingSpot = completedSpots.find((spot) => !hasMatchingReceipt(spot, receiptsUntilNow));
  const booking = nextBookingNote(tripReceipts, spots, day, nowMinutes, nowMs);
  const routeFreshness = routeStaleSignal(state, nowMs);
  const weather = weatherAlert(state, day, nowMs);

  return [
    {
      kind: 'transit',
      label: 'Transit countdown',
      value: routeFreshness?.value || (minutesToTransit == null ? 'Done' : formatCountdown(minutesToTransit)),
      detail: routeFreshness
        ? `${routeFreshness.detail}${transitTarget ? ` · ${transitTarget.name} · ${transitTarget.time || '--:--'}` : ''}`
        : transitTarget ? `${transitTarget.name} · ${transitTarget.time || '--:--'}` : '今日已無下一站',
    },
    {
      kind: 'receipt',
      label: 'Receipt reminder',
      value: `${completedSpots.length} stops done · ${receiptsUntilNow.length} receipt${receiptsUntilNow.length === 1 ? '' : 's'}`,
      detail: missingSpot ? `補記 ${missingSpot.name}` : '今日已完成景點都有紀錄',
    },
    {
      kind: 'weather',
      label: 'Weather alert',
      value: weather.value,
      detail: weather.detail,
    },
    {
      kind: 'booking',
      label: 'Booking note',
      value: booking.value,
      detail: booking.detail,
    },
  ];
}

export function buildDayReadinessScores(state: AppState, itinerary: ItineraryDay[], nowMs = Date.now()): DayReadinessScore[] {
  if (!itinerary.length) {
    return [{
      date: '',
      day: 0,
      region: 'No itinerary',
      score: 40,
      tone: 'review',
      label: 'Plan needed',
      detail: '匯入行程後顯示每日準備度',
      issues: ['No itinerary'],
    }];
  }

  const trip = activeTrip(state);
  const receipts = scopedReceiptsForTrip(state, trip);
  const sourceIdCounts = countReceiptSourceIds(receipts);
  const routeFreshness = routeStaleSignal(state, nowMs);
  const weather = bestWeatherSignal((state as AppState & { weatherCache?: unknown }).weatherCache);

  return itinerary.map((day) => {
    const spots = getScheduleSpots(state, day);
    const dayReceipts = receipts.filter((receipt) => receipt.date === day.date);
    const issues: string[] = [];
    let penalty = 0;

    const addIssue = (label: string, value: number) => {
      if (!issues.includes(label)) issues.push(label);
      penalty += value;
    };

    if (!spots.length) addIssue('No itinerary', 30);
    if (routeFreshness) addIssue('Route stale', 10);

    if (isReasonableTimestamp(weather.fetchedAt)) {
      const ageMs = nowMs - weather.fetchedAt;
      if (ageMs > WEATHER_STALE_MS) addIssue('Weather stale', 15);
      else if (weather.rain >= 50 || weather.windSpeed >= 30) addIssue('Weather risk', 5);
    } else {
      addIssue('Weather missing', 10);
    }

    if (dayReceipts.some((receipt) => isBookingStale(receipt, nowMs))) addIssue('Booking stale', 15);

    const nowForDay = minutesForReadinessDay(day, nowMs);
    if (nowForDay > 0) {
      const receiptsUntilNow = dayReceipts.filter((receipt) => minutesForTime(receipt.time) <= nowForDay);
      const missingReceiptCount = spots
        .filter((spot) => minutesForTime(spot.time) <= nowForDay)
        .filter((spot) => !hasMatchingReceipt(spot, receiptsUntilNow))
        .length;
      if (missingReceiptCount) addIssue('Receipt gap', Math.min(16, missingReceiptCount * 8));
    }

    const cleanupPenalty = dayCleanupPenalty(dayReceipts, sourceIdCounts);
    if (cleanupPenalty) addIssue('Cleanup', cleanupPenalty);

    const score = Math.max(20, Math.min(100, 100 - penalty));
    const tone = readinessTone(score);
    const label = readinessLabel(tone);
    return {
      date: day.date,
      day: day.day || 0,
      region: day.city || day.region || day.country || 'Travel day',
      score,
      tone,
      label,
      detail: issues.length ? issues.slice(0, 4).join(' · ') : 'All key signals ready',
      issues: issues.length ? issues : ['Ready'],
    };
  });
}

export function buildWeatherPackingRisks(state: AppState, itinerary: ItineraryDay[], nowMs = Date.now()): WeatherPackingRisk[] {
  const best = bestWeatherSignal((state as AppState & { weatherCache?: unknown }).weatherCache);
  const hasWeather = isReasonableTimestamp(best.fetchedAt);
  const ageMs = hasWeather ? nowMs - best.fetchedAt : Number.POSITIVE_INFINITY;
  const weatherIsStale = !hasWeather || ageMs > WEATHER_STALE_MS;
  const intelligence = activeTrip(state).intelligence;

  return itinerary.map((day) => {
    const spots = getScheduleSpots(state, day);
    const outdoorSpot = spots.find(isOutdoorSpot);
    const transportSpot = spots.find((spot) => spot.type === 'transport');
    const location = day.city || day.region || day.country || 'Travel day';
    let tone: WeatherPackingTone = 'ready';
    let label = 'Light pack';
    let detail = `${location} · weather ready`;
    const items = new Set<string>(['Water', 'Receipts']);

    if (weatherIsStale) {
      tone = 'review';
      label = 'Refresh first';
      detail = hasWeather ? `${formatFreshnessAge(ageMs)} old · refresh before leaving` : `${location} · weather missing`;
      items.add('Update weather');
      items.add(outdoorSpot ? 'Outdoor layer' : 'Light bag');
    } else if (best.rain >= 50) {
      tone = 'risk';
      label = '雨具 / Umbrella';
      detail = `Rain ${Math.round(best.rain)}% · ${fmtMm(best.precipMm)}${outdoorSpot ? ` · ${outdoorSpot.name}` : ''}`;
      items.add('Umbrella');
      items.add('Waterproof bag');
      if (outdoorSpot) items.add('Outdoor layer');
    } else if (best.windSpeed >= 30) {
      tone = 'watch';
      label = 'Wind layer';
      detail = `Wind ${Math.round(best.windSpeed)} km/h${transportSpot ? ` · ${transportSpot.name}` : ''}`;
      items.add('Wind layer');
      if (transportSpot) items.add('Transit buffer');
    } else if (outdoorSpot || intelligence?.weatherPreference === 'rain') {
      tone = 'watch';
      label = 'Outdoor layer';
      detail = outdoorSpot ? `${outdoorSpot.name} · rain check` : `${location} · rain preference`;
      items.add('Light shell');
      items.add('Comfort shoes');
    } else if (transportSpot) {
      label = 'Transit buffer';
      detail = `${transportSpot.name} · ${transportSpot.time || '--:--'}`;
      items.add('IC card');
      items.add('Time buffer');
    } else {
      items.add('Light bag');
    }

    return {
      date: day.date,
      day: day.day || 0,
      region: location,
      tone,
      label,
      detail,
      items: Array.from(items).slice(0, 4),
    };
  });
}

export function buildItineraryReceiptReconciliation(state: AppState, itinerary: ItineraryDay[]): ItineraryReceiptReconciliation {
  const trip = activeTrip(state);
  const receipts = scopedReceiptsForTrip(state, trip);
  const currency = getResolvedTripCurrency(state, trip);
  const itineraryDates = new Set(itinerary.map((day) => day.date).filter(Boolean));
  const receiptsByDate = groupReceiptsByDate(receipts);

  const days = itinerary.map<ItineraryReceiptDay>((day) => {
    const spots = getScheduleSpots(state, day);
    const dayReceipts = receiptsByDate.get(day.date) || [];
    const missingSpots = spots.filter((spot) => !hasMatchingReceipt(spot, dayReceipts));
    const amount = receiptAmount(dayReceipts, state, currency);
    const highCountThreshold = Math.max(4, spots.length + 2);
    let tone: ItineraryReceiptTone = 'ok';
    let label = 'Matched';

    if (spots.length > 0 && dayReceipts.length === 0) {
      tone = 'missing';
      label = 'No receipts';
    } else if (missingSpots.length > 0 && dayReceipts.length > 0) {
      tone = 'gap';
      label = 'Spot gaps';
    } else if (dayReceipts.length > highCountThreshold) {
      tone = 'high';
      label = 'High receipt count';
    } else if (!spots.length && dayReceipts.length > 0) {
      tone = 'outside';
      label = 'Spending no plan';
    }

    const missingDetail = missingSpots.slice(0, 2).map((spot) => spot.name).join(' · ');
    return {
      date: day.date,
      day: day.day || 0,
      region: day.city || day.region || day.country || 'Travel day',
      spotCount: spots.length,
      receiptCount: dayReceipts.length,
      amount,
      tone,
      label,
      detail: missingDetail || `${spots.length} stops · ${dayReceipts.length} receipts`,
    };
  });

  const outside = Array.from(receiptsByDate.entries())
    .filter(([date]) => date && !itineraryDates.has(date))
    .sort(([a], [b]) => a.localeCompare(b))
    .map<ItineraryReceiptDay>(([date, dateReceipts]) => ({
      date,
      day: 0,
      region: date < (itinerary[0]?.date || date) ? 'Before itinerary' : 'Outside itinerary',
      spotCount: 0,
      receiptCount: dateReceipts.length,
      amount: receiptAmount(dateReceipts, state, currency),
      tone: 'outside',
      label: 'Outside itinerary',
      detail: `${dateReceipts.length} receipt${dateReceipts.length === 1 ? '' : 's'} on ${date}`,
    }));

  const needsReview = [...days, ...outside].filter((item) => item.tone !== 'ok');
  return {
    currency,
    totalDays: days.length,
    missingDays: days.filter((item) => item.tone === 'missing').length,
    gapDays: days.filter((item) => item.tone === 'gap').length,
    highCountDays: days.filter((item) => item.tone === 'high').length,
    outsideDays: outside.length + days.filter((item) => item.tone === 'outside').length,
    reviewCount: needsReview.length,
    days,
    outside,
  };
}

function routeStaleSignal(state: AppState, nowMs: number): { value: string; detail: string } | null {
  const updatedAt = Number(activeTrip(state).updatedAt);
  if (!isReasonableTimestamp(updatedAt)) return null;
  const ageMs = nowMs - updatedAt;
  if (ageMs <= ROUTE_STALE_MS) return null;
  return { value: 'Route stale', detail: `${formatFreshnessAge(ageMs)} old` };
}

function isBookingStale(receipt: Receipt, nowMs: number): boolean {
  if (!receipt.bookingRef) return false;
  const updatedAt = Number(receipt.updatedAt);
  return isReasonableTimestamp(updatedAt) && nowMs - updatedAt > BOOKING_STALE_MS;
}

function resolveTravelDay(itinerary: ItineraryDay[], nowMs: number): ItineraryDay | null {
  if (!itinerary.length) return null;
  const today = itinerary.find((day) => datePartsForZone(nowMs, normalizeTravelTimezone(day.timezone))?.date === day.date);
  if (today) return today;
  const first = itinerary[0];
  const reference = datePartsForZone(nowMs, normalizeTravelTimezone(first.timezone));
  if (!reference) return first;
  if (reference.date < first.date) return first;
  return itinerary.find((day) => day.date >= reference.date) || itinerary[itinerary.length - 1];
}

function countReceiptSourceIds(receipts: Receipt[]): Record<string, number> {
  return receipts.reduce<Record<string, number>>((counts, receipt) => {
    const sourceId = String(receipt.sourceId || '').trim();
    if (!sourceId) return counts;
    counts[sourceId] = (counts[sourceId] || 0) + 1;
    return counts;
  }, {});
}

function dayCleanupPenalty(receipts: Receipt[], sourceIdCounts: Record<string, number>): number {
  const issueCount = receipts.reduce((count, receipt) => {
    let next = count;
    if (isPendingReceipt(receipt)) next += 1;
    if (receipt.sourceId && sourceIdCounts[receipt.sourceId] > 1) next += 1;
    if (isReceiptPhotoExpected(receipt) && !safePhotoUrl(receipt.photoUrl, receipt.photoThumb)) next += 1;
    if (receiptHasLargePhoto(receipt)) next += 1;
    if (receiptPhotoNeedsSync(receipt)) next += 1;
    if (receipt.syncStatus === 'error' || receipt.syncStatus === 'failed') next += 1;
    if (!receipt.personId) next += 1;
    return next;
  }, 0);
  return Math.min(40, issueCount * 10);
}

function isReceiptPhotoExpected(receipt: Receipt): boolean {
  const source = String(receipt.source || '');
  return source === 'react-ocr'
    || source === 'react-ocr-manual'
    || source === 'react-email-image'
    || /OCR|截圖|掃描/i.test(String(receipt.note || ''));
}

function groupReceiptsByDate(receipts: Receipt[]): Map<string, Receipt[]> {
  return receipts.reduce<Map<string, Receipt[]>>((groups, receipt) => {
    const date = String(receipt.date || '').slice(0, 10);
    if (!date) return groups;
    const current = groups.get(date) || [];
    current.push(receipt);
    groups.set(date, current);
    return groups;
  }, new Map());
}

function receiptAmount(receipts: Receipt[], state: AppState, currency: string): number {
  return Math.round(receipts.reduce((sum, receipt) => sum + getReceiptTripAmount(receipt, state, currency), 0));
}

function estimatePhotoBytes(value: unknown): number {
  const raw = String(value || '').trim().replace(/[\r\n\s]/g, '');
  if (!raw || /^https?:\/\//i.test(raw)) return 0;
  const base64 = raw.includes(',') ? raw.split(',').pop() || '' : raw;
  if (!/^[a-z0-9+/=]+$/i.test(base64)) return 0;
  const padding = base64.match(/=+$/)?.[0].length || 0;
  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding);
}

function receiptHasLargePhoto(receipt: Receipt): boolean {
  return Math.max(estimatePhotoBytes(receipt.photoThumb), estimatePhotoBytes(receipt.photoUrl)) > LARGE_PHOTO_BYTES;
}

function receiptPhotoNeedsSync(receipt: Receipt): boolean {
  const hasLocalPhoto = estimatePhotoBytes(receipt.photoThumb) > 0 || (!!receipt.photoUrl && !/^https?:\/\//i.test(String(receipt.photoUrl)));
  if (!hasLocalPhoto) return false;
  if (receipt._photoSyncedToNotion || receipt.notionFileUploadId || /^https?:\/\//i.test(String(receipt.photoUrl || ''))) return false;
  return receipt.syncStatus !== 'synced' || !receipt.photoUrl;
}

function minutesForReadinessDay(day: ItineraryDay, nowMs: number): number {
  const current = datePartsForZone(nowMs, normalizeTravelTimezone(day.timezone));
  if (!current) return 0;
  if (current.date === day.date) return current.minutes;
  return current.date > day.date ? 24 * 60 : 0;
}

function readinessTone(score: number): DayReadinessTone {
  if (score >= 85) return 'ready';
  if (score >= 65) return 'watch';
  if (score >= 45) return 'review';
  return 'risk';
}

function readinessLabel(tone: DayReadinessTone): string {
  if (tone === 'ready') return 'Ready';
  if (tone === 'watch') return 'Watch';
  if (tone === 'review') return 'Review';
  return 'Risk';
}

function hasMatchingReceipt(spot: ScheduleSpot, receipts: Receipt[]): boolean {
  if (spot.receiptId && receipts.some((receipt) => receipt.id === spot.receiptId)) return true;
  const spotName = normalizeText(spot.name);
  if (!spotName) return false;
  return receipts.some((receipt) => {
    const store = normalizeText(displayStore(receipt));
    return store.includes(spotName) || spotName.includes(store);
  });
}

function nextBookingNote(receipts: Receipt[], spots: ScheduleSpot[], day: ItineraryDay, nowMinutes: number, nowMs: number): { value: string; detail: string } {
  const upcomingReceipt = receipts
    .filter((receipt) => receipt.bookingRef && minutesForTime(receipt.time) >= nowMinutes)
    .sort((a, b) => minutesForTime(a.time) - minutesForTime(b.time))[0];
  if (upcomingReceipt?.bookingRef) {
    const updatedAt = Number(upcomingReceipt.updatedAt);
    if (isReasonableTimestamp(updatedAt) && nowMs - updatedAt > BOOKING_STALE_MS) {
      return {
        value: 'Booking stale',
        detail: `${formatFreshnessAge(nowMs - updatedAt)} old · ${upcomingReceipt.bookingRef} · ${displayStore(upcomingReceipt)} · ${upcomingReceipt.time || '--:--'}`,
      };
    }
    return {
      value: upcomingReceipt.bookingRef,
      detail: `${displayStore(upcomingReceipt)} · ${upcomingReceipt.time || '--:--'}`,
    };
  }

  const bookingSpot = spots.find((spot) => minutesForTime(spot.time) >= nowMinutes && extractBookingRef(`${spot.note || ''} ${spot.name || ''}`));
  const bookingRef = bookingSpot ? extractBookingRef(`${bookingSpot.note || ''} ${bookingSpot.name || ''}`) : '';
  if (bookingSpot && bookingRef) {
    return { value: bookingRef, detail: `${bookingSpot.name} · ${bookingSpot.time || '--:--'}` };
  }

  if (day.lodging?.name) {
    return {
      value: day.lodging.checkIn ? `Check-in ${day.lodging.checkIn}` : 'Hotel ready',
      detail: day.lodging.name,
    };
  }

  return { value: 'No booking yet', detail: '下一個 booking reference 未設定' };
}

function weatherAlert(state: AppState, day: ItineraryDay, nowMs: number): { value: string; detail: string } {
  const best = bestWeatherSignal((state as AppState & { weatherCache?: unknown }).weatherCache);
  if (isReasonableTimestamp(best.fetchedAt)) {
    const ageMs = nowMs - best.fetchedAt;
    if (ageMs > WEATHER_STALE_MS) return { value: 'Weather stale', detail: `${formatFreshnessAge(ageMs)} old · 出門前刷新` };
  }
  if (best.rain >= 50) return { value: `Rain ${Math.round(best.rain)}%`, detail: `${fmtMm(best.precipMm)} · wind ${Math.round(best.windSpeed || 0)} km/h` };
  if (best.windSpeed >= 30) return { value: `Wind ${Math.round(best.windSpeed)} km/h`, detail: '交通/戶外點要預鬆時間' };
  const intelligence = activeTrip(state).intelligence;
  const outdoor = (day.spots || []).some((spot) => /ticket|localtour|transport|sightseeing|other/i.test(spot.type) || /outdoor|park|garden|temple|shrine|山|海|戶外|寺|神社/i.test(`${spot.name} ${spot.note || ''} ${spot.address || ''}`));
  if (intelligence?.weatherPreference === 'rain' || outdoor) return { value: 'Rain check', detail: `${day.city || day.region} 出門前刷新天氣` };
  return { value: 'Refresh weather', detail: `${day.city || day.region} freshness 未確認` };
}

function isOutdoorSpot(spot: ItinerarySpot): boolean {
  return /ticket|localtour|transport|sightseeing|other/i.test(String(spot.type || ''))
    || /outdoor|park|garden|temple|shrine|castle|beach|trail|walk|山|海|湖|公園|花園|戶外|寺|神社|城|散步/i.test(`${spot.name || ''} ${spot.note || ''} ${spot.address || ''}`);
}

function bestWeatherSignal(cache: unknown): { rain: number; precipMm: number; windSpeed: number; fetchedAt: number } {
  const stack = [cache];
  let rain = 0;
  let precipMm = 0;
  let windSpeed = 0;
  let fetchedAt = 0;
  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (Array.isArray(record.slots)) stack.push(...record.slots);
    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') stack.push(value);
    }
    rain = Math.max(rain, Number(record.rain) || 0);
    precipMm = Math.max(precipMm, Number(record.precipMm) || Number(record.precipitation) || 0);
    windSpeed = Math.max(windSpeed, Number(record.windSpeed) || Number(record.wind_speed_10m) || 0);
    fetchedAt = Math.max(fetchedAt, Number(record.fetchedAt) || Number(record.ts) || 0);
  }
  return { rain, precipMm, windSpeed, fetchedAt };
}

function extractBookingRef(value: string): string {
  const match = value.match(/\b(?:booking|ref|reservation|order)?[-\s:#]*([A-Z0-9][A-Z0-9-]{4,20})\b/i);
  return match?.[1]?.toUpperCase() || '';
}

function formatCountdown(minutes: number): string {
  if (minutes < 120) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

function fmtMm(value: number): string {
  return `${Math.round(value || 0)}mm`;
}

function isReasonableTimestamp(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_REASONABLE_TIMESTAMP;
}

function formatFreshnessAge(ageMs: number): string {
  if (ageMs < 60 * 60 * 1000) return '<1h';
  if (ageMs < 48 * 60 * 60 * 1000) return `${Math.round(ageMs / (60 * 60 * 1000))}h`;
  return `${Math.round(ageMs / (24 * 60 * 60 * 1000))}d`;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '');
}

function minutesForTime(value?: string): number {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return Number.POSITIVE_INFINITY;
  return Math.min(23, Number(match[1]) || 0) * 60 + Math.min(59, Number(match[2]) || 0);
}

function normalizeTravelTimezone(value?: string): string {
  const zone = String(value || '').trim();
  if (zone === 'JST') return 'Asia/Tokyo';
  if (zone === 'HKT') return 'Asia/Hong_Kong';
  return zone || 'Asia/Hong_Kong';
}

function datePartsForZone(nowMs: number, timezone: string): { date: string; minutes: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(nowMs));
    const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
    return {
      date: `${value('year')}-${value('month')}-${value('day')}`,
      minutes: (Number(value('hour')) || 0) * 60 + (Number(value('minute')) || 0),
    };
  } catch {
    return null;
  }
}
