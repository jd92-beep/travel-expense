import { Cloud, CloudLightning, CloudRain, CloudSun, LocateFixed, RefreshCw, Snowflake, Sun, Wind } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlassCard, LoadingState, Reveal, StatusPill, Toast } from '../components/ui';
import { WeatherFX } from '../components/WeatherFX';
import { Meteors } from '../components/ui/meteors';
import { ProgressiveBlur } from '../components/ui/progressive-blur';
import { getItinerary, todayYmd } from '../lib/domain';
import { activeTrip } from '../domain/trip/normalize';
import { coordForDay, coordsForDay, fetchWeather, getCachedWeatherRows, groupedCoordsForDay, resolveCoordsForDay, resolveOfficialWeatherProvider, setCachedWeatherRows, slotsForDate, WEATHER_SLOTS, weatherLabel, type DayWeather, type GroupedWeatherLocation, type WeatherCoord, type WeatherSlot } from '../lib/weather';
import type { AppState, ItineraryDay } from '../lib/types';
import travelAiAtlas from '../assets/atmosphere/travel-ai-atlas.webp';


function WeatherIcon({ code, size = 18 }: { code?: number; size?: number }) {
  if (code == null) return <CloudSun size={size} />;
  if (code === 0) return <Sun size={size} />;
  if ([1, 2, 3].includes(code)) return <CloudSun size={size} />;
  if ([45, 48].includes(code)) return <Cloud size={size} />;
  if (code >= 51 && code <= 67) return <CloudRain size={size} />;
  if (code >= 80 && code <= 82) return <CloudRain size={size} />;
  if (code >= 71 && code <= 86) return <Snowflake size={size} />;
  if (code >= 95) return <CloudLightning size={size} />;
  return <CloudSun size={size} />;
}

const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'] as const;
function formatWeatherDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  const wd = WEEKDAY_ZH[dt.getDay()];
  return `${m}月${d}日 (${wd})`;
}

export function Weather({ state }: { state: AppState }) {
  const [rows, setRows] = useState<Record<string, DayWeather[]>>({});
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState('');
  const trip = activeTrip(state);
  const itinerary = useMemo(() => getItinerary(state), [state]);
  const today = todayYmd(normalizedTimezone(trip.timezones?.[0]) || 'Asia/Hong_Kong');
  const hasEnded = trip.endDate ? today > trip.endDate : false;
  // Any PAST date (mid-trip or after the trip) shows the CURRENT weather at that location;
  // today/future show the forecast for that date.
  const forecastDateFor = (dayDate: string) => (dayDate && dayDate < today ? today : dayDate);
  const travelAtlasStyle = { '--travel-ai-atlas': `url(${travelAiAtlas})` } as CSSProperties;

  const displayItinerary = useMemo<ItineraryDay[]>(() =>
    itinerary.map((day, index) => ({
      ...day,
      day: day.day || index + 1,
      timezone: day.timezone || trip.timezones?.[0] || 'Asia/Hong_Kong',
    })),
  [itinerary, trip]);

  const groupedCoordsByDay = useMemo(() => {
    const map = new Map<string, GroupedWeatherLocation[]>();
    for (const day of displayItinerary) {
      map.set(day.date, groupedCoordsForDay(day));
    }
    return map;
  }, [displayItinerary]);

  const itineraryKey = displayItinerary.map((day) => {
    const groups = groupedCoordsByDay.get(day.date) || [];
    const coords = groups.map((g) => `${g.label}:${g.lat}:${g.lon}`).join(',');
    return `${day.date}:${day.region}:${day.country || ''}:${forecastDateFor(day.date)}:${coords}`;
  }).join('|');
  const targetSummary = useMemo(() => weatherTargetSummary(displayItinerary, hasEnded, today), [displayItinerary, hasEnded, today]);
  const hasMissingTarget = useMemo(
    () => displayItinerary.some((day) => (groupedCoordsByDay.get(day.date) || []).some((g) => g.missing)),
    [displayItinerary, groupedCoordsByDay],
  );
  const activeWeatherDay = useMemo(() => {
    if (!displayItinerary.length) return undefined;
    const exact = displayItinerary.find((day) => day.date === today);
    if (exact) return exact;
    const future = displayItinerary.find((day) => day.date > today);
    if (future) return future;
    return hasEnded ? displayItinerary[displayItinerary.length - 1] : displayItinerary[0];
  }, [displayItinerary, hasEnded, today]);
  const leadDay = activeWeatherDay || displayItinerary[0];
  const leadRows = leadDay ? rows[leadDay.date] || [] : [];
  const leadSource = leadRows[0];
  const leadForecastDate = leadDay ? forecastDateFor(leadDay.date) : today;
  const leadLiveHour = leadDay ? liveSlotHour(leadForecastDate, normalizedTimezone(leadDay.timezone) || trip.timezones?.[0] || 'Asia/Hong_Kong') : null;
  const leadSourceSlots = leadSource?.slots || [];
  const leadAllSlots = leadRows.flatMap((row) => row.slots || []);
  const leadSlot = (leadLiveHour != null ? leadSourceSlots.find((slot) => slot.hour === leadLiveHour && slot.temp != null) : undefined)
    || leadSourceSlots.find((slot) => slot.temp != null)
    || leadAllSlots.find((slot) => slot.temp != null)
    || leadAllSlots[0];
  // Real daily high/low from the day's hourly slots (was previously faked as temp±offset).
  const leadTemps = (leadSource?.slots || leadAllSlots).map((slot) => slot.temp).filter((t): t is number => t != null);
  const leadHigh = leadTemps.length ? Math.round(Math.max(...leadTemps)) : (leadSlot?.temp != null ? Math.round(leadSlot.temp + 2) : 24);
  const leadLow = leadTemps.length ? Math.round(Math.min(...leadTemps)) : (leadSlot?.temp != null ? Math.round(leadSlot.temp - 6) : 16);
  const previewHourlySlots = leadRows.flatMap((row) => row.slots || []).slice(0, 5);
  const previewHourlyFallback: WeatherSlot[] = WEATHER_SLOTS.slice(0, 5).map((hour) => ({ hour, code: 2 }));
  const previewHourly = previewHourlySlots.length ? previewHourlySlots : previewHourlyFallback;

  const loadRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const cached = getCachedWeatherRows();
      if (cached && cachedRowsMatchItinerary(cached, displayItinerary, groupedCoordsByDay)) {
        setRows(cached);
        setStale(true);
      } else {
        setBusy(true);
      }
      setError('');
      try {
        const dayPromises = displayItinerary.map(async (day) => {
          const forecastDate = forecastDateFor(day.date);
          let groups = groupedCoordsByDay.get(day.date) || [];
          // Dictionary miss (e.g. a trip outside Japan/HK/Korea): geocode the city/region names
          // instead of dead-ending on 缺少座標.
          if (groups.length && groups.every((g) => g.missing)) {
            try {
              const resolved = await resolveCoordsForDay(day, 2);
              const found = resolved.filter((c) => !c.missing && Number.isFinite(c.lat) && Number.isFinite(c.lon));
              if (found.length) {
                groups = found.map((c) => ({ label: c.label, lat: c.lat, lon: c.lon, spotNames: [], timezone: c.timezone || day.timezone, origin: c.origin, query: c.query }));
              }
            } catch {
              // Geocoding unavailable — keep the missing groups and show the notice.
            }
          }
          const coordPromises = groups.map(async (group) => {
            try {
              if (group.missing) {
                return { coord: group as WeatherCoord, source: '缺少座標', slots: [] };
              }
              const coord: WeatherCoord = { label: group.label, lat: group.lat, lon: group.lon, timezone: group.timezone, origin: group.origin || 'known-region', query: group.query };
              const officialProvider = resolveOfficialWeatherProvider(coord, { country: day.country, region: day.region, city: day.city });
              const result = await fetchWeather(coord, normalizedTimezone(coord.timezone || day.timezone) || 'auto', officialProvider, state, forecastDate);
              if (controller.signal.aborted) return null;
              return {
                coord,
                source: result.source,
                provider: result.provider,
                cached: result.cached,
                fetchedAt: result.fetchedAt,
                fallbackReason: result.fallbackReason,
                slots: slotsForDate(result.data as Parameters<typeof slotsForDate>[0], forecastDate),
              };
            } catch (innerErr) {
              if (controller.signal.aborted) return null;
              console.warn(`[Weather] Load failed for ${group.label}:`, innerErr);
              return { coord: { label: group.label, lat: group.lat, lon: group.lon } as WeatherCoord, source: '拉取失敗', slots: [] };
            }
          });
          const results = (await Promise.all(coordPromises)).filter((r): r is NonNullable<typeof r> => r != null);
          return { date: day.date, rows: results };
        });
        const dayResults = await Promise.all(dayPromises);
        if (controller.signal.aborted) return;
        const next: Record<string, DayWeather[]> = {};
        for (const { date, rows: dayRows } of dayResults) next[date] = dayRows;
        setRows(next);
        setCachedWeatherRows(next);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) {
          setBusy(false);
          setStale(false);
        }
      }
    }
    loadRef.current = load;
    load();
    return () => { controller.abort(); };
  }, [itineraryKey]);

  const scrollCorrectionHandlesRef = useRef<number[]>([]);

  // Jump to the active day's card (live-hour slot if rendered). The Weather tab changes height
  // while provider rows and reveal animations settle, so keep correcting briefly after entry.
  // Used by both the auto-jump effect and the manual "今日" button.
  const jumpToActiveDay = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (!leadDay) return;
    scrollCorrectionHandlesRef.current.forEach((handle) => window.clearTimeout(handle));
    scrollCorrectionHandlesRef.current = [];
    const forecastDate = forecastDateFor(leadDay.date);
    const liveHour = liveSlotHour(forecastDate, normalizedTimezone(leadDay.timezone) || trip.timezones?.[0] || 'Asia/Hong_Kong');
    const findTarget = (): Element | null => {
      const daySelector = `[data-weather-day="${leadDay.date}"]`;
      const liveMarker = document.querySelector(`${daySelector} [data-weather-live="true"]`);
      if (liveMarker) return liveMarker;
      if (liveHour != null) {
        const liveSlot = document.querySelector(`${daySelector} [data-weather-hour="${liveHour}"]`);
        if (liveSlot) return liveSlot;
      }
      return document.querySelector(daySelector);
    };
    const doScroll = (b: ScrollBehavior) => {
      const el = findTarget();
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const targetTop = Math.max(0, window.scrollY + rect.top - window.innerHeight * 0.36);
      window.scrollTo({ top: targetTop, behavior: b });
      el.scrollIntoView({ behavior: b, block: 'center', inline: 'nearest' });
    };
    doScroll(behavior);
    const correctionDelays = [90, 260, 520, 900, 1320];
    scrollCorrectionHandlesRef.current = correctionDelays.map((delay) => window.setTimeout(() => {
      const el = findTarget();
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      if (center < 112 || center > window.innerHeight - 112) doScroll('auto');
    }, delay));
    // "You are here" double-flash on the landed slot, after the scroll settles.
    scrollCorrectionHandlesRef.current.push(window.setTimeout(() => {
      const el = findTarget();
      if (!(el instanceof HTMLElement)) return;
      el.classList.remove('weather-arrive-flash');
      void el.offsetWidth;
      el.classList.add('weather-arrive-flash');
      window.setTimeout(() => el.classList.remove('weather-arrive-flash'), 2100);
    }, 560));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadDay, today, trip]);

  useEffect(() => () => {
    scrollCorrectionHandlesRef.current.forEach((handle) => window.clearTimeout(handle));
    scrollCorrectionHandlesRef.current = [];
  }, []);

  const autoJumpKeyRef = useRef('');
  useEffect(() => {
    if (!leadDay || busy) return;
    const forecastDate = forecastDateFor(leadDay.date);
    const liveHour = liveSlotHour(forecastDate, normalizedTimezone(leadDay.timezone) || trip.timezones?.[0] || 'Asia/Hong_Kong');
    const targetReady = typeof document === 'undefined'
      ? false
      : Boolean(document.querySelector(`[data-weather-day="${leadDay.date}"] ${liveHour != null ? `[data-weather-hour="${liveHour}"]` : '.weather-location'}`));
    const key = `${leadDay.date}:${forecastDate}:${liveHour ?? 'day'}:${Object.keys(rows).length > 0}:${targetReady}`;
    if (autoJumpKeyRef.current === key) return;
    autoJumpKeyRef.current = key;
    const t = window.setTimeout(() => jumpToActiveDay('smooth'), targetReady ? 180 : 360);
    return () => window.clearTimeout(t);
  }, [busy, leadDay, rows, today, jumpToActiveDay]);

  return (
    <section className="japanese-washi-bg w-full min-h-screen px-4 pb-28 pt-6 relative overflow-y-auto weather-screen" style={travelAtlasStyle}>
      <div className="japanese-sun-decor" />
      <div className="japanese-sakura-decor" />
      <div className="stack w-full relative z-10">
        <GlassCard className="weather-command weather-command-fancy">
        <Meteors number={9} minDuration={4} maxDuration={9} className="weather-meteor" />
        <ProgressiveBlur className="weather-command-blur" height="34%" position="bottom" blurLevels={[0.5, 1, 2, 4, 8, 12]} />
        <div className="weather-command-row relative z-10">
          <h2>天氣預報</h2>
          <div className="weather-command-actions">
            <span className="weather-target-pill">
              <StatusPill tone={hasMissingTarget ? 'warning' : 'info'} icon={<CloudSun size={14} />}>{targetSummary}</StatusPill>
            </span>
            <button className="secondary weather-refresh-icon" type="button" aria-label="跳去今日天氣" title="跳去今日天氣" onClick={() => jumpToActiveDay('smooth')}>
              <LocateFixed size={17} />
            </button>
            <button className="secondary weather-refresh-icon" type="button" aria-label="刷新天氣" title="刷新天氣" disabled={busy} onClick={() => loadRef.current()}>
              <RefreshCw size={17} className={busy ? 'spin' : ''} />
            </button>
          </div>
        </div>
        {busy && !stale && <LoadingState label="更新天氣中" />}
        {stale && !busy && <span className="weather-stale-hint" style={{ fontSize: '0.72rem', opacity: 0.6 }}>背景更新中</span>}
        {error && <Toast tone="warning">天氣拉取失敗：{error}</Toast>}
      </GlassCard>
      <GlassCard className="preview-weather-current-card">
        <WeatherFX code={leadSlot?.code} />
        <div className="preview-weather-source-strip" aria-label="Weather source status" style={{ position: 'relative', zIndex: 2 }}>
          <span>{weatherProviderLabel(leadSource)}</span>
          <span>{weatherFreshnessLabel(leadSource)}</span>
          <span>{weatherTargetOriginLabel(leadSource?.coord)}</span>
          {leadSource?.fallbackReason && <span className="weather-fallback-chip">{weatherFallbackLabel(leadSource.fallbackReason)}</span>}
        </div>
        <div className="preview-weather-current-layout relative z-40">
          <div className="preview-weather-hero-icon">
            <WeatherIcon code={leadSlot?.code} size={92} />
          </div>
          <div className="preview-weather-temp">
            <strong>{leadSlot?.temp != null ? Math.round(leadSlot.temp) : 22}°C</strong>
            <span>{weatherLabel(leadSlot?.code)}</span>
            <em className="preview-weather-place">{leadSource?.coord.label || leadDay?.region || '目前地點'}</em>
            <small>實際氣溫 {leadSlot?.temp != null ? Math.round(leadSlot.temp) : 22}°C · 體感 {leadSlot?.feelsLike != null ? Math.round(leadSlot.feelsLike) : 21}°C</small>
          </div>
          <div className="preview-weather-facts">
            <span>最高 <b className="hot">{leadHigh}°C</b></span>
            <span>最低 <b>{leadLow}°C</b></span>
            <span>風速 <b>{leadSlot?.windSpeed ?? 3} m/s</b></span>
          </div>
          <div className="preview-weather-hourly-rail" aria-label="今日逐時天氣">
            {previewHourly.map((slot, index) => (
              <span className="preview-weather-hourly-chip" key={`preview-hour-${slot.hour}-${index}`}>
                <b>{formatHour(slot.hour)}</b>
                <WeatherIcon code={slot.code} size={18} />
                <em>{slot.temp == null ? '—' : `${Math.round(slot.temp)}°C`}</em>
              </span>
            ))}
          </div>
        </div>
      </GlassCard>
      {displayItinerary.map((day) => {
        const dayRows = rows[day.date] || [];
        const missingAll = dayRows.length > 0 && dayRows.every((weather) => !weather.slots?.length);
        const dayCode = dayRows.flatMap((weather) => weather.slots || []).find((slot) => slot.code != null)?.code;
        return (
          <Reveal key={day.date} className="weather-day-reveal" delay={Math.min(0.14, day.day * 0.02)}>
            <div className="weather-day-anchor" data-weather-day={day.date}>
              <GlassCard className="weather-day">
                <WeatherFX code={dayCode} tintOnly />
                <div className="section-head">
                  <div>
                    <p className="weather-day-date">{formatWeatherDate(day.date)}</p>
                    <p className="eyebrow">{day.date < today ? `Current · Day ${day.day || 1}` : `Day ${day.day}`} · {dayRows.map(weatherSourceLabel).filter(Boolean).join(' / ') || '載入中'}</p>
                    <h2>{day.region}</h2>
                  </div>
                  <StatusPill tone={missingAll ? 'warning' : 'info'} icon={<CloudSun size={14} />}>{(groupedCoordsByDay.get(day.date) || []).map((g) => g.label).join(' / ') || day.region}</StatusPill>
                </div>
                {missingAll && <p className="notice">未有座標。可喺 Settings 貼新行程，或喺 trip JSON 補 lat/lon。</p>}
                {dayRows.map((weather) => {
                  const emptyForecast = weather.slots?.length && weather.slots.every((slot) => slot.temp == null && slot.rain == null);
                  const liveHour = liveSlotHour(forecastDateFor(day.date), normalizedTimezone(day.timezone) || trip.timezones?.[0] || 'Asia/Hong_Kong');
                  return (
                    <div className="weather-location" key={`${day.date}-${weather.coord.label}`}>
                      <h3>{weather.coord.label}</h3>
                      <div className="weather-location-meta" aria-label={`Weather metadata for ${weather.coord.label}`}>
                        <span>{weatherProviderLabel(weather)}</span>
                        <span>{weatherFreshnessLabel(weather)}</span>
                        <span>{weatherTargetOriginLabel(weather.coord)}</span>
                        {weather.fallbackReason && <span className="weather-fallback-chip">{weatherFallbackLabel(weather.fallbackReason)}</span>}
                      </div>
                      {emptyForecast && <p className="notice">旅程日期超出目前預報範圍，會顯示佔位資料；稍後刷新會自動更新。</p>}
                      <div className="weather-grid weather-grid-detailed">
                        {(weather.slots || []).map((slot) => {
                          const live = liveHour === slot.hour;
                          const hasRain = slot.rain != null || slot.precipMm != null;
                          const hasWind = slot.windSpeed != null || slot.windGust != null;
                          const hasSunUv = slot.uvIndex != null || slot.cloudCover != null;
                          const feels = slot.feelsLike ?? slot.temp;

                          return (
                            <div
                              className={`weather-slot weather-slot-detailed ${live ? 'is-live' : ''}`}
                              key={slot.hour}
                              data-weather-hour={slot.hour}
                              data-weather-live={live ? 'true' : undefined}
                              style={{ '--weather-accent': weatherAccent(slot) } as CSSProperties}
                            >
                          <div className="weather-slot-header">
                            <div className="weather-time">
                              <span className="time-text">{formatHour(slot.hour)}</span>
                              {live && <span className="live-badge live-pulse-badge"><span className="pulse-dot"></span>LIVE</span>}
                            </div>
                            <div className="weather-type-badge">
                              <WeatherIcon code={slot.code} size={15} />
                              <span className="type-text">{weatherLabel(slot.code)}</span>
                            </div>
                          </div>

                          <div className="weather-temp-container">
                            <div className="weather-temp-block">
                              <span className="temp-label">實溫 (Actual)</span>
                              <span className={`temp-num ${slot.temp == null ? 'temp-missing' : ''}`}>
                                {slot.temp == null ? '—' : `${Math.round(slot.temp)}`}
                                {slot.temp != null && <span className="temp-unit">°C</span>}
                              </span>
                            </div>
                            <div className="weather-temp-block" aria-label={feels == null ? '體感未有資料' : `體感 ${Math.round(feels)}°C`}>
                              <span className="temp-label">體感 (Feels)</span>
                              <span className={`temp-num feels-num ${feels == null ? 'temp-missing' : ''}`}>
                                {feels == null ? '—' : `${Math.round(feels)}`}
                                {feels != null && <span className="temp-unit">°C</span>}
                              </span>
                            </div>
                          </div>

                          <div className="weather-metrics">
                            {hasSunUv && (
                              <span className="metric-tag sun-tag">
                                <Sun size={13} className="metric-icon" />
                                <span className="metric-val">
                                  {slot.uvIndex != null ? `UV ${formatNumber(slot.uvIndex, '')}` : ''}
                                  {slot.uvIndex != null && slot.cloudCover != null ? ' · ' : ''}
                                  {slot.cloudCover != null ? `雲${formatNumber(slot.cloudCover, '%')}` : ''}
                                </span>
                              </span>
                            )}
                            {hasRain && (
                              <span className="metric-tag rain-tag">
                                <CloudRain size={13} className="metric-icon" />
                                <span className="metric-val">
                                  {slot.rain != null ? `${slot.rain}%` : ''}
                                  {slot.rain != null && slot.precipMm != null ? ' · ' : ''}
                                  {slot.precipMm != null ? formatNumber(slot.precipMm, 'mm') : ''}
                                </span>
                              </span>
                            )}
                            {hasWind && (
                              <span className="metric-tag wind-tag">
                                <Wind size={13} className="metric-icon" />
                                <span className="metric-val">
                                  {slot.windSpeed != null ? formatNumber(slot.windSpeed, 'km/h') : ''}
                                  {slot.windSpeed != null && slot.windGust != null ? ' (陣 ' : ''}
                                  {slot.windGust != null ? formatNumber(slot.windGust, 'km/h') : ''}
                                  {slot.windSpeed != null && slot.windGust != null ? ')' : ''}
                                </span>
                              </span>
                            )}
                          </div>

                          <div className="weather-hint-container">
                            <p className="weather-hint">{weatherHint(slot)}</p>
                          </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </GlassCard>
            </div>
          </Reveal>
        );
      })}
      </div>
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

function weatherTargetSummary(days: ItineraryDay[], hasEnded: boolean, today: string): string {
  const todayDay = days.find((day) => day.date === today);
  const sourceDays = hasEnded ? days : todayDay ? [todayDay] : days;
  const labels = Array.from(new Set(sourceDays.flatMap((day) => groupedCoordsForDay(day).map((g) => g.label).filter(Boolean))));
  const scope = hasEnded
    ? 'Current'
    : Boolean(todayDay) || days.every((day) => day.day <= 0)
      ? 'Today'
    : days.length === 1
      ? `Day ${days[0]?.day || 1}`
      : `${days.length}日`;
  const visible = labels.slice(0, 3).join('/') || '未設定地點';
  return `${scope} · ${visible}${labels.length > 3 ? ` +${labels.length - 3}` : ''}`;
}

function cachedRowsMatchItinerary(
  cached: Record<string, DayWeather[]> | null,
  days: ItineraryDay[],
  groupedCoordsByDay: Map<string, GroupedWeatherLocation[]>,
): cached is Record<string, DayWeather[]> {
  if (!cached || !days.length) return false;
  return days.every((day) => {
    const expectedLabels = (groupedCoordsByDay.get(day.date) || [])
      .filter((group) => !group.missing)
      .map((group) => group.label);
    if (!expectedLabels.length) return true;
    const actualLabels = (cached[day.date] || []).map((row) => row.coord?.label).filter(Boolean);
    return expectedLabels.every((label) => actualLabels.includes(label));
  });
}

function weatherProviderLabel(weather?: DayWeather): string {
  const provider = String(weather?.provider || weather?.source || '').replace(/\s+cache$/i, '').trim();
  return provider ? `Provider · ${weatherDisplayProvider(provider)}` : 'Provider · 載入中';
}

function weatherSourceLabel(weather?: DayWeather): string {
  const source = String(weather?.source || '').replace(/\s+cache$/i, '').trim();
  return source ? weatherDisplayProvider(source) : '';
}

function weatherDisplayProvider(value: string): string {
  return /weatherapi/i.test(value) ? 'Live weather' : value;
}

function weatherFreshnessLabel(weather?: DayWeather): string {
  if (!weather) return 'Freshness · loading';
  const ts = Number(weather.fetchedAt || 0);
  if (!Number.isFinite(ts) || ts <= 0) return weather.cached ? 'Freshness · cached' : 'Freshness · live';
  const ageMs = Math.max(0, Date.now() - ts);
  const minutes = Math.round(ageMs / 60000);
  const age = minutes < 1 ? 'just now' : minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
  return `${weather.cached ? 'Cache' : 'Live'} · ${age}`;
}

function weatherTargetOriginLabel(coord?: DayWeather['coord']): string {
  if (!coord) return 'Target · resolving';
  if (coord.origin === 'spot-coordinate') return `Target · spot coord · ${coord.label}`;
  if (coord.origin === 'city-geocode') return `Target · city geocode · ${coord.query || coord.label}`;
  if (coord.origin === 'known-region') return `Target · trip city · ${coord.label}`;
  return `Target · fallback needed · ${coord.label}`;
}

function weatherFallbackLabel(reason: string): string {
  const safeReason = reason.replace(/WeatherAPI\.com/gi, 'private weather provider');
  return `Fallback · ${safeReason.replace(/\s+/g, ' ').slice(0, 96)}`;
}

function weatherHint(slot: { rain?: number; precipMm?: number; windSpeed?: number; windGust?: number; uvIndex?: number; temp?: number; feelsLike?: number }) {
  if ((slot.rain || 0) >= 60 || (slot.precipMm || 0) >= 1) return '帶遮，行程之間預多少少轉場時間。';
  if ((slot.windGust || 0) >= 35 || (slot.windSpeed || 0) >= 25) return '風勢較強，留意戶外景點同交通。';
  if ((slot.uvIndex || 0) >= 6) return 'UV 偏高，防曬同補水要跟身。';
  if ((slot.feelsLike ?? slot.temp ?? 99) <= 12) return '體感偏涼，晚上活動加件外套會舒服啲。';
  return '天氣條件穩定，適合按原定行程走。';
}

// Per-slot theme color keyed on the forecast condition (Boss spec):
// 大雨 deep blue · 落雨 blue · 微雨/驟雨 light blue · 晴 orange · 多雲 grey · 霧 pale grey
// (雪 ice blue · 雷暴 purple). WMO weather codes; rain% is the fallback when code is missing.
function weatherAccent(slot: { code?: number; rain?: number; precipMm?: number }): string {
  const code = slot.code;
  if (code != null) {
    if (code >= 95) return '#7c3aed';                                        // 雷暴
    if (code === 65 || code === 67 || code === 82) return '#1e40af';         // 大雨
    if (code === 63 || code === 66 || code === 81) return '#2563eb';         // 落雨
    if ((code >= 51 && code <= 61) || code === 80) return '#4a94e8';         // 微雨/驟雨
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '#4fb2d9'; // 雪
    if (code === 45 || code === 48) return '#9aa2ae';                        // 霧
    if (code === 0 || code === 1) return '#f59e0b';                          // 晴
    if (code === 2 || code === 3) return '#77808e';                          // 多雲
  }
  if ((slot.rain || 0) >= 70 || (slot.precipMm || 0) >= 4) return '#1e40af';
  if ((slot.rain || 0) >= 40) return '#2563eb';
  if ((slot.rain || 0) >= 20) return '#4a94e8';
  return '#1e6d86';
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
  const aliases: Record<string, string> = {
    JST: 'Asia/Tokyo',
    HKT: 'Asia/Hong_Kong',
    KST: 'Asia/Seoul',
    CST: 'Asia/Shanghai',
    SGT: 'Asia/Singapore',
    PST: 'America/Los_Angeles',
    PDT: 'America/Los_Angeles',
    EST: 'America/New_York',
    EDT: 'America/New_York',
    GMT: 'Etc/GMT',
    UTC: 'UTC',
  };
  const candidate = aliases[zone] || zone || 'auto';
  if (candidate === 'auto') return candidate;
  try {
    new Intl.DateTimeFormat('en', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return 'auto';
  }
}
