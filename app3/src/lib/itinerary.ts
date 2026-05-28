import { ITINERARY } from './constants';
import type { ItineraryDay } from './types';

export function todayHKT(): string {
  // Get current date in HKT (UTC+8)
  const now = new Date();
  const hkt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return hkt.toISOString().slice(0, 10);
}

export function getCurrentDay(): ItineraryDay | null {
  const today = todayHKT();
  return ITINERARY.find(d => d.date === today) ?? null;
}

export function getDayForDate(date: string): ItineraryDay | null {
  return ITINERARY.find(d => d.date === date) ?? null;
}
