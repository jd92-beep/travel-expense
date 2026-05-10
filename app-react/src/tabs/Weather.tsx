import { Cloud, CloudLightning, CloudRain, CloudSun, RefreshCw, Snowflake, Sun, Umbrella, Wind } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { GlassCard, LoadingState, StatusPill, Toast } from '../components/ui';
import { getItinerary, todayYmd } from '../lib/domain';
import { activeTrip } from '../domain/trip/normalize';
import { coordForDay, coordsForDay, fetchWeather, slotsForDate, WEATHER_SLOTS, weatherLabel, type DayWeather } from '../lib/weather';
import type { AppState, ItineraryDay } from '../lib/types';

function WeatherIcon({ code, size = 18 }: { code?: number; size?: number }) {
  if (code == null) return <CloudSun size={size} />;
  if (code === 0) return <Sun size={size} />;
  if ([1, 2, 3].includes(code)) return <CloudSun size={size} />;
  if ([45, 48].includes(code)) return <Cloud size={size} />;
  if (code >= 51 && code <= 67) return <CloudRain size={size} />;
  if (code >= 71 && code <= 86) return <Snowflake size={size} />;
  if (code >= 95) return <CloudLightning size={size} />;
  return <CloudSun size={size} />;
}

export function Weather({ state }: { state: AppState }) {
  const [rows, setRows] = useState<Record<string, DayWeather[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const trip = activeTrip(state);
  const itinerary = useMemo(() => getItinerary(state), [state]);
  const today = todayYmd(normalizedTimezone(trip.timezones?.[0]) || 'Asia/Hong_Kong');
  const hasEnded = trip.endDate ? today > trip.endDate : false;

  const displayItinerary = useMemo<ItineraryDay[]>(() => {
    if (!hasEnded) return itinerary;
    const allCoords = itinerary.flatMap((day) => coordsForDay(day, 2));
    const seen = new Set<string>();
    const uniqueCoords = allCoords.filter((c) => {
      const key = `${c.lat.toFixed(3)}:${c.lon.toFixed(3)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return [{
      date: today,
      day: 0,
      region: trip.name || '目前位置',
      city: '',
      country: '',
      timezone: trip.timezones?.[0] || 'Asia/Hong_Kong',
      spots: uniqueCoords.map((c) => ({
        name: c.label,
        time: '',
        type: 'other' as const,
        lat: c.lat,
        lon: c.lon,
      })),
    }];
  }, [itinerary, hasEnded, today, trip]);

  const itineraryKey = displayItinerary.map((day) => {
    const coords = coordsForDay(day).map((coord) => `${coord.label}:${coord.lat}:${coord.lon}`).join(',');
    return `${day.date}:${day.region}:${day.country || ''}:${coords}`;
  }).join('|');

  async function load() {
    setBusy(true);
    setError('');
    try {
      const next: Record<string, DayWeather[]> = {};
      for (const day of displayItinerary) {
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
            <p className="eyebrow">Open-Meteo · 全球天氣</p>
            <h2>天氣預報</h2>
            <p className="muted">{hasEnded ? '旅程已結束，顯示今日天氣。' : '跟 active trip 每日地點同座標更新；日本地點使用 JMA fallback。'}</p>
          </div>
          <button className="secondary" type="button" disabled={busy} onClick={load}>
            <RefreshCw size={18} className={busy ? 'spin' : ''} /> 刷新
          </button>
        </div>
        <div className="weather-targets">
          {displayItinerary.flatMap((day) => coordsForDay(day).map((coord) => (
            <StatusPill key={`${day.date}-${coord.label}`} tone={coord.missing ? 'warning' : 'info'}>{day.day > 0 ? `Day ${day.day}` : 'Today'}. {coord.label}</StatusPill>
          )))}
        </div>
        {busy && <LoadingState label="更新天氣中" />}
        {error && <Toast tone="warning">天氣拉取失敗：{error}</Toast>}
      </GlassCard>
      {displayItinerary.map((day) => {
        const dayRows = rows[day.date] || [];
        const missingAll = dayRows.length > 0 && dayRows.every((weather) => !weather.slots?.length);
        return (
          <GlassCard className="weather-day" key={day.date}>
            <div className="section-head">
              <div><p className="eyebrow">{hasEnded ? `Today · ${today}` : `Day ${day.day}`} · {dayRows.map((weather) => weather.source).filter(Boolean).join(' / ') || '載入中'}</p><h2>{day.region}</h2></div>
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
                  <div className="weather-grid weather-grid-detailed">
                    {(weather.slots || []).map((slot) => {
                      const live = liveHour === slot.hour;
                      return (
                        <div className={`weather-slot weather-slot-detailed ${live ? 'is-live' : ''}`} key={slot.hour}>
                          <div className="weather-slot-top">
                            <span>{formatHour(slot.hour)} {live && <b className="live-badge">LIVE</b>}</span>
                            <span className="inline-flex items-center gap-1"><WeatherIcon code={slot.code} size={14} /> <b>{weatherLabel(slot.code)}</b></span>
                          </div>
                          <strong>{slot.temp == null ? '—' : `${Math.round(slot.temp)}°C`}</strong>
                          <small>體感 {slot.feelsLike == null ? '—' : `${Math.round(slot.feelsLike)}°C`}</small>
                          <div className="weather-metrics">
                            <span><CloudRain size={14} /> {slot.rain == null ? '—' : `${slot.rain}%`} · {formatNumber(slot.precipMm, 'mm')}</span>
                            <span><Wind size={14} /> {formatNumber(slot.windSpeed, 'km/h')} · 陣 {formatNumber(slot.windGust, 'km/h')}</span>
                            <span><Umbrella size={14} /> 濕度 {formatNumber(slot.humidity, '%')}</span>
                            <span><Sun size={14} /> UV {formatNumber(slot.uvIndex, '')} · 雲 {formatNumber(slot.cloudCover, '%')}</span>
                          </div>
                          <p className="weather-hint">{weatherHint(slot)}</p>
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

function formatNumber(value?: number, suffix = ''): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const n = suffix === 'mm' ? Number(value.toFixed(1)) : Math.round(value);
  return `${n}${suffix}`;
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function weatherHint(slot: { rain?: number; precipMm?: number; windSpeed?: number; windGust?: number; uvIndex?: number; temp?: number; feelsLike?: number }) {
  if ((slot.rain || 0) >= 60 || (slot.precipMm || 0) >= 1) return '帶遮，行程之間預多少少轉場時間。';
  if ((slot.windGust || 0) >= 35 || (slot.windSpeed || 0) >= 25) return '風勢較強，留意戶外景點同交通。';
  if ((slot.uvIndex || 0) >= 6) return 'UV 偏高，防曬同補水要跟身。';
  if ((slot.feelsLike ?? slot.temp ?? 99) <= 12) return '體感偏涼，晚上活動加件外套會舒服啲。';
  return '天氣條件穩定，適合按原定行程走。';
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
