import { CloudSun, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { GlassCard, LoadingState, StatusPill, Toast } from '../components/ui';
import { getItinerary } from '../lib/domain';
import { coordForDay, coordsForDay, fetchWeather, slotsForDate, WEATHER_SLOTS, weatherLabel, type DayWeather } from '../lib/weather';
import type { AppState } from '../lib/types';

export function Weather({ state }: { state: AppState }) {
  const [rows, setRows] = useState<Record<string, DayWeather[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const itinerary = useMemo(() => getItinerary(state), [state]);
  const itineraryKey = itinerary.map((day) => {
    const coords = coordsForDay(day).map((coord) => `${coord.label}:${coord.lat}:${coord.lon}`).join(',');
    return `${day.date}:${day.region}:${day.country || ''}:${coords}`;
  }).join('|');

  async function load() {
    setBusy(true);
    setError('');
    try {
      const next: Record<string, DayWeather[]> = {};
      for (const day of itinerary) {
        next[day.date] = [];
        for (const coord of coordsForDay(day)) {
          try {
            const isJapan = /日本|Japan|JP|名古屋|金澤|長野|高山|白川|常滑|上高地|立山|東京|京都|大阪/.test(`${day.country || ''} ${day.region || ''} ${coord.label}`);
            const { data, source } = await fetchWeather(coord, normalizedTimezone(day.timezone) || 'auto', isJapan);
            next[day.date].push({ coord, source, slots: slotsForDate(data, day.date) });
          } catch {
            next[day.date].push({ coord, source: '缺少座標', slots: [] });
          }
        }
      }
      setRows(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itineraryKey]);

  return (
    <section className="stack">
      <GlassCard className="weather-command">
        <div className="section-head">
          <div>
            <p className="eyebrow">JMA / Open-Meteo</p>
            <h2>天氣預報</h2>
            <p className="muted">跟 active trip 每日地點同座標更新；非日本地點不使用 JMA fallback。</p>
          </div>
          <button className="secondary" type="button" disabled={busy} onClick={load}>
            <RefreshCw size={18} className={busy ? 'spin' : ''} /> 刷新
          </button>
        </div>
        <div className="weather-targets">
          {itinerary.flatMap((day) => coordsForDay(day).map((coord) => (
            <StatusPill key={`${day.date}-${coord.label}`} tone={coord.missing ? 'warning' : 'info'}>{day.day}. {coord.label}</StatusPill>
          )))}
        </div>
        {busy && <LoadingState label="更新天氣中" />}
        {error && <Toast tone="warning">天氣拉取失敗：{error}</Toast>}
      </GlassCard>
      {itinerary.map((day) => {
        const dayRows = rows[day.date] || [];
        const missingAll = dayRows.length > 0 && dayRows.every((weather) => !weather.slots?.length);
        return (
          <GlassCard className="weather-day" key={day.date}>
            <div className="section-head">
              <div><p className="eyebrow">Day {day.day} · {dayRows.map((weather) => weather.source).filter(Boolean).join(' / ') || '載入中'}</p><h2>{day.region}</h2></div>
              <StatusPill tone={missingAll ? 'warning' : 'info'} icon={<CloudSun size={14} />}>{coordsForDay(day).map((coord) => coord.label).join(' / ') || coordForDay(day).label}</StatusPill>
            </div>
            {missingAll && <p className="notice">未有座標。可喺 Settings 貼新行程，或喺 trip JSON 補 lat/lon。</p>}
            {dayRows.map((weather) => {
              const emptyForecast = weather.slots?.length && weather.slots.every((slot) => slot.temp == null && slot.rain == null);
              const liveHour = liveSlotHour(day.date, normalizedTimezone(day.timezone) || 'Asia/Tokyo');
              return (
                <div className="weather-location" key={`${day.date}-${weather.coord.label}`}>
                  {dayRows.length > 1 && <h3>{weather.coord.label}</h3>}
                  {emptyForecast && <p className="notice">旅程日期超出目前預報範圍，會顯示佔位資料；稍後刷新會自動更新。</p>}
                  <div className="weather-grid">
                    {(weather.slots || []).map((slot) => {
                      const live = liveHour === slot.hour;
                      return (
                        <div className={`weather-slot ${live ? 'is-live' : ''}`} key={slot.hour}>
                          <span>{slot.hour}:00 {live && <b className="live-badge">LIVE</b>}</span>
                          <strong>{slot.temp == null ? '—' : `${Math.round(slot.temp)}°C`}</strong>
                          <small>{weatherLabel(slot.code)} · {slot.rain == null ? '—' : `${slot.rain}%`}</small>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </GlassCard>
        );
      })}
    </section>
  );
}

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
    const today = `${value('year')}-${value('month')}-${value('day')}`;
    if (today !== date) return null;
    const hour = Number(value('hour'));
    return WEATHER_SLOTS.slice().reverse().find((slot) => hour >= slot) || WEATHER_SLOTS[0];
  } catch {
    return null;
  }
}

function normalizedTimezone(value?: string): string {
  const zone = String(value || '').trim();
  if (zone === 'JST') return 'Asia/Tokyo';
  if (zone === 'HKT') return 'Asia/Hong_Kong';
  return zone;
}
