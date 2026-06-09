import { activeTrip } from '../domain/trip/normalize';
import { getScheduleSpots } from './domain';
import type { AppState, ItineraryDay, ItinerarySpot } from './types';

export type WeatherPackingTone = 'ready' | 'watch' | 'review' | 'risk';

export interface WeatherPackingRisk {
  date: string;
  day: number;
  region: string;
  tone: WeatherPackingTone;
  label: string;
  detail: string;
  items: string[];
}

const WEATHER_STALE_MS = 2 * 60 * 60 * 1000;
const MIN_REASONABLE_TIMESTAMP = new Date('2020-01-01T00:00:00Z').getTime();

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
