import type { ItineraryDay, ItinerarySpot } from '../../lib/types';
import { normalizeItinerary } from './normalize';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type CanonicalItineraryResult = {
  itinerary: ItineraryDay[];
  missingDates: string[];
  duplicateDates: string[];
  outOfRangeDates: string[];
  outOfRangeSpotCount: number;
};

type CanonicalItineraryInput = {
  tripId: string;
  startDate: string;
  endDate: string;
  itinerary: ItineraryDay[];
  fallbackItinerary?: ItineraryDay[];
  fallbackCurrency?: string;
  fallbackRegion?: string;
  fallbackTimezone?: string;
};

function inclusiveDateSeries(startDate: string, endDate: string): string[] {
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate) || endDate < startDate) return [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const last = new Date(`${endDate}T00:00:00Z`);
  const dates: string[] = [];
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function spotIdentity(spot: ItinerarySpot, index: number): string {
  return String(spot.spotId || spot.id || `${spot.time || ''}\u0000${spot.name || ''}\u0000${index}`);
}

function mergeDuplicateDay(primary: ItineraryDay, duplicate: ItineraryDay): ItineraryDay {
  const seen = new Set(primary.spots.map(spotIdentity));
  const extraSpots = duplicate.spots.filter((spot, index) => !seen.has(spotIdentity(spot, index)));
  return {
    ...duplicate,
    ...primary,
    region: primary.region || duplicate.region,
    city: primary.city || duplicate.city,
    country: primary.country || duplicate.country,
    timezone: primary.timezone || duplicate.timezone,
    currency: primary.currency || duplicate.currency,
    highlight: primary.highlight || duplicate.highlight,
    note: primary.note || duplicate.note,
    lodging: primary.lodging?.name ? primary.lodging : duplicate.lodging,
    spots: [...primary.spots, ...extraSpots],
  };
}

function mergeWithFallback(
  primary: ItineraryDay | undefined,
  fallback: ItineraryDay | undefined,
  date: string,
  dayIndex: number,
  input: CanonicalItineraryInput,
): ItineraryDay {
  const selected = primary || fallback;
  return {
    ...selected,
    date,
    day: dayIndex + 1,
    region: primary?.region || fallback?.region || input.fallbackRegion || `Day ${dayIndex + 1}`,
    city: primary?.city || fallback?.city,
    country: primary?.country || fallback?.country,
    timezone: primary?.timezone || fallback?.timezone || input.fallbackTimezone || 'Asia/Tokyo',
    currency: primary?.currency || fallback?.currency || input.fallbackCurrency || 'JPY',
    highlight: primary?.highlight || fallback?.highlight,
    note: primary?.note || fallback?.note,
    lodging: primary?.lodging?.name ? primary.lodging : fallback?.lodging,
    // A present primary day is authoritative, including an explicit empty list.
    spots: primary ? primary.spots || [] : fallback?.spots || [],
  };
}

export function isNagoyaCanonicalRange(input: {
  id?: string;
  name?: string;
  destinationSummary?: string;
  startDate: string;
  endDate: string;
}): boolean {
  if (input.startDate !== '2026-04-20' || input.endDate !== '2026-04-25') return false;
  return /nagoya|名古屋/i.test(`${input.id || ''} ${input.name || ''} ${input.destinationSummary || ''}`);
}

export function canonicalizeItineraryRange(input: CanonicalItineraryInput): CanonicalItineraryResult {
  const dates = inclusiveDateSeries(input.startDate, input.endDate);
  const normalized = normalizeItinerary(input.itinerary || [], input.tripId, input.fallbackCurrency || 'JPY');
  if (!dates.length) {
    return {
      itinerary: normalized,
      missingDates: [],
      duplicateDates: [],
      outOfRangeDates: [],
      outOfRangeSpotCount: 0,
    };
  }

  const dateSet = new Set(dates);
  const byDate = new Map<string, ItineraryDay>();
  const duplicateDates = new Set<string>();
  const outOfRangeDates: string[] = [];
  let outOfRangeSpotCount = 0;

  for (const day of normalized) {
    if (!dateSet.has(day.date)) {
      outOfRangeDates.push(day.date);
      outOfRangeSpotCount += day.spots.length;
      continue;
    }
    const existing = byDate.get(day.date);
    if (existing) {
      duplicateDates.add(day.date);
      byDate.set(day.date, mergeDuplicateDay(existing, day));
    } else {
      byDate.set(day.date, day);
    }
  }

  const fallbackByDate = new Map<string, ItineraryDay>();
  for (const day of normalizeItinerary(input.fallbackItinerary || [], input.tripId, input.fallbackCurrency || 'JPY')) {
    if (dateSet.has(day.date) && !fallbackByDate.has(day.date)) fallbackByDate.set(day.date, day);
  }

  const missingDates = dates.filter((date) => !byDate.has(date));
  const itinerary = normalizeItinerary(
    dates.map((date, index) => mergeWithFallback(byDate.get(date), fallbackByDate.get(date), date, index, input)),
    input.tripId,
    input.fallbackCurrency || 'JPY',
  );

  return {
    itinerary,
    missingDates,
    duplicateDates: [...duplicateDates],
    outOfRangeDates,
    outOfRangeSpotCount,
  };
}
