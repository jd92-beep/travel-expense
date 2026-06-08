import { activeTrip, scopedReceiptsForTrip } from '../domain/trip/normalize';
import { displayStore, getScheduleSpots } from './domain';
import type { AppState, ItineraryDay, ItinerarySpot, Receipt } from './types';

export type TravelDayWidgetKind = 'transit' | 'receipt' | 'weather' | 'booking';

export interface TravelDayWidget {
  kind: TravelDayWidgetKind;
  label: string;
  value: string;
  detail: string;
}

type ScheduleSpot = ItinerarySpot & { _spotIdx: number; receiptId?: string };

const ROUTE_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const WEATHER_STALE_MS = 2 * 60 * 60 * 1000;
const BOOKING_STALE_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_REASONABLE_TIMESTAMP = new Date('2020-01-01T00:00:00Z').getTime();

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

function routeStaleSignal(state: AppState, nowMs: number): { value: string; detail: string } | null {
  const updatedAt = Number(activeTrip(state).updatedAt);
  if (!isReasonableTimestamp(updatedAt)) return null;
  const ageMs = nowMs - updatedAt;
  if (ageMs <= ROUTE_STALE_MS) return null;
  return { value: 'Route stale', detail: `${formatFreshnessAge(ageMs)} old` };
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
