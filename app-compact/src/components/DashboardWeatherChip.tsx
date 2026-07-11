import { useEffect, useRef, useState } from 'react';
import { WeatherIcon } from './WeatherIcon';
import { getItinerary, todayYmd } from '../lib/domain';
import { activeTrip } from '../domain/trip/normalize';
import {
  coordForDay,
  fetchWeather,
  getCachedWeatherRows,
  resolveCoordsForDay,
  resolveOfficialWeatherProvider,
  slotsForDate,
  weatherLabel,
  WEATHER_SLOTS,
  type DayWeather,
  type WeatherSlot,
} from '../lib/weather';
import type { AppState, ItineraryDay } from '../lib/types';

// Mirrors Weather.tsx's "which day are we showing" fallback: exact today match, else the
// next upcoming day, else (trip already ended) the last day, else the first day.
function resolveActiveWeatherDay(itinerary: ItineraryDay[], today: string, hasEnded: boolean): ItineraryDay | undefined {
  if (!itinerary.length) return undefined;
  const exact = itinerary.find((day) => day.date === today);
  if (exact) return exact;
  const future = itinerary.find((day) => day.date > today);
  if (future) return future;
  return hasEnded ? itinerary[itinerary.length - 1] : itinerary[0];
}

// Same live-hour pick as Weather.tsx's `liveSlotHour` — only meaningful when the forecast
// target date is "today" in the itinerary day's own timezone.
function liveSlotHour(date: string, timezone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
    const todayInZone = `${value('year')}-${value('month')}-${value('day')}`;
    if (todayInZone !== date) return null;
    const hour = Number(value('hour'));
    return WEATHER_SLOTS.slice().reverse().find((slot) => hour >= slot) ?? WEATHER_SLOTS[0];
  } catch {
    return null;
  }
}

function pickSlot(slots: WeatherSlot[], liveHour: number | null): WeatherSlot | undefined {
  if (!slots.length) return undefined;
  return (liveHour != null ? slots.find((slot) => slot.hour === liveHour && slot.temp != null) : undefined)
    || slots.find((slot) => slot.temp != null)
    || slots[0];
}

/**
 * Small self-contained weather pill shared by the Dashboard's "今日狀態" card and the
 * itinerary card badge. Reads whatever Weather.tsx already cached (getCachedWeatherRows);
 * only fetches once, lazily (ref-guarded), if the user never opened the Weather tab yet.
 * Never shows a bare "-- --" — falls back to a quiet "天氣 --" on missing/failed data.
 */
export function DashboardWeatherChip({ state, variant = 'mini' }: { state: AppState; variant?: 'mini' | 'badge' }) {
  const trip = activeTrip(state);
  const itinerary = getItinerary(state);
  const timezone = trip.timezones?.[0] || 'Asia/Hong_Kong';
  const today = todayYmd(timezone);
  const hasEnded = trip.endDate ? today > trip.endDate : false;
  const activeDay = resolveActiveWeatherDay(itinerary, today, hasEnded);
  const forecastDate = activeDay ? (activeDay.date < today ? today : activeDay.date) : today;

  const [slots, setSlots] = useState<WeatherSlot[] | null>(() => {
    const cached = activeDay ? getCachedWeatherRows()?.[activeDay.date] : null;
    const found = cached?.find((row: DayWeather) => row.slots?.length);
    return found?.slots || null;
  });
  const fetchedKeyRef = useRef('');

  useEffect(() => {
    if (!activeDay) return;
    const cached = getCachedWeatherRows()?.[activeDay.date];
    const cachedSlots = cached?.find((row) => row.slots?.length)?.slots;
    if (cachedSlots?.length) {
      setSlots(cachedSlots);
      return;
    }
    const key = `${activeDay.date}:${forecastDate}`;
    if (fetchedKeyRef.current === key) return;
    fetchedKeyRef.current = key;
    let cancelled = false;
    (async () => {
      try {
        let coord = coordForDay(activeDay);
        if (coord.missing) {
          const resolved = await resolveCoordsForDay(activeDay, 1);
          const found = resolved.find((c) => !c.missing && Number.isFinite(c.lat) && Number.isFinite(c.lon));
          if (!found) return;
          coord = found;
        }
        const officialProvider = resolveOfficialWeatherProvider(coord, { country: activeDay.country, region: activeDay.region, city: activeDay.city });
        const result = await fetchWeather(coord, coord.timezone || activeDay.timezone || timezone, officialProvider, state, forecastDate);
        if (cancelled) return;
        setSlots(slotsForDate(result.data as Parameters<typeof slotsForDate>[0], forecastDate));
      } catch {
        // Fetch failed — leave slots null so the quiet "天氣 --" fallback renders below.
      }
    })();
    return () => {
      // Also release the ref guard: under StrictMode's dev double-mount the first pass's
      // fetch is cancelled by this cleanup, and without the reset the second pass would be
      // blocked by the guard forever — chip stuck on the "天氣 --" fallback.
      cancelled = true;
      fetchedKeyRef.current = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDay?.date, forecastDate]);

  const liveHour = activeDay ? liveSlotHour(forecastDate, activeDay.timezone || timezone) : null;
  const slot = slots ? pickSlot(slots, liveHour) : undefined;
  const temp = slot?.temp != null ? Math.round(slot.temp) : null;
  const label = temp != null ? weatherLabel(slot?.code) : null;

  if (variant === 'badge') {
    return (
      <div className="flex items-center gap-1 px-3 py-1 bg-amber-50 border border-amber-200/60 rounded-full text-[11px] font-bold text-amber-700">
        <WeatherIcon code={slot?.code} size={14} hour={slot?.hour} />
        <span>{temp != null ? `${temp}°${label ? ` ${label}` : ''}` : '天氣 --'}</span>
      </div>
    );
  }

  return (
    <div className="preview-dashboard-weather-mini" aria-label="今日天氣摘要">
      <WeatherIcon code={slot?.code} size={22} hour={slot?.hour} />
      {temp != null ? `${temp}°` : '天氣'}
      <small>{temp != null ? (label || '') : '--'}</small>
    </div>
  );
}
