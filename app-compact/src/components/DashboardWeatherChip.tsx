import { useEffect, useMemo, useState } from 'react';
import { WeatherIcon } from './WeatherIcon';
import { getItinerary } from '../lib/domain';
import { activeTrip } from '../domain/trip/normalize';
import { coordsForDay, resolveCoordsForDay, weatherLabel, weatherLocalTime, weatherTimezone, type WeatherCoord } from '../lib/weather';
import { useWeatherReport } from '../lib/weather/useWeatherReport';
import type { AppState } from '../lib/types';

export function DashboardWeatherChip({ state, variant = 'mini' }: { state: AppState; variant?: 'mini' | 'badge' }) {
  const trip = activeTrip(state);
  const itinerary = useMemo(() => getItinerary(state), [state.trips, state.activeTripId, state.customItinerary, state.tripDateRange, state.tripName, state.tripCurrency]);
  const zone = weatherTimezone(trip.timezones?.[0] || itinerary[0]?.timezone);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  const today = weatherLocalTime(clock, zone).slice(0, 10);
  const day = itinerary.find((day) => day.date === today) || itinerary.find((day) => day.date > today) || itinerary.at(-1);
  const dayKey = `${trip.id}:${JSON.stringify(day)}`;
  const known = day ? coordsForDay(day, 1)[0] : undefined;
  const [resolved, setResolved] = useState<{ key: string; coord?: WeatherCoord }>({ key: '' });
  useEffect(() => {
    if (!day || !known?.missing) return;
    let active = true;
    void resolveCoordsForDay(day, 1).then((coords) => {
      if (active) setResolved({ key: dayKey, coord: coords.find((coord) => !coord.missing) });
    }).catch(() => {});
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey]);
  const coord = known?.missing ? resolved.key === dayKey ? resolved.coord : undefined : known;
  const date = weatherLocalTime(clock, coord?.timezone || zone).slice(0, 10);
  const { report } = useWeatherReport(coord, date, state);
  const local = weatherLocalTime(clock, report?.timezone || coord?.timezone || zone);
  const observed = report?.observation;
  const freshObserved = observed && clock - Date.parse(observed.observedAt) <= 3 * 60 * 60_000 && Date.parse(observed.observedAt) <= clock + 5 * 60_000 ? observed : undefined;
  const hour = report?.hourly.find((item) => item.time.slice(0, 13) === local.slice(0, 13));
  const reading = freshObserved || hour;
  const temp = report?.stale ? undefined : reading?.temp;
  const label = weatherLabel(reading?.code);
  const title = `${coord?.label || '目的地'} · ${freshObserved ? '測站觀測' : '當地逐時預報'}${report?.stale ? ' · 資料待更新' : ''}`;

  if (variant === 'badge') return <div title={title} className="flex items-center gap-1 px-3 py-1 bg-amber-50 border border-amber-200/60 rounded-full text-[11px] font-bold text-amber-700">
    <WeatherIcon code={reading?.code} size={14} hour={Number(local.slice(11, 13))} />
    <span>{temp != null ? `${Math.round(temp)}°${reading?.code == null ? '' : ` ${label}`}` : '天氣 --'}</span>
  </div>;
  return <div title={title} className="preview-dashboard-weather-mini" aria-label="今日天氣摘要">
    <WeatherIcon code={reading?.code} size={22} hour={Number(local.slice(11, 13))} />
    {temp != null ? `${Math.round(temp)}°` : '天氣'}<small>{temp != null && reading?.code != null ? label : '--'}</small>
  </div>;
}
