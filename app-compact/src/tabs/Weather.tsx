import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, CalendarDays, Check, CloudSun, Droplets, LocateFixed, MapPin, RefreshCw, ShieldCheck, Thermometer, Umbrella, Wind } from 'lucide-react';
import { WeatherIcon } from '../components/WeatherIcon';
import { activeTrip } from '../domain/trip/normalize';
import { getItinerary } from '../lib/domain';
import type { AppState, ItineraryDay } from '../lib/types';
import { OFFICIAL_WEATHER_SERVICES, resolveCoordsForDay, uniqueWeatherLocations, weatherLabel, weatherLocalTime, weatherLocationKey, weatherTimezone, type WeatherCoord, type WeatherHour, type WeatherReport, type WeatherSource } from '../lib/weather';
import { useWeatherReport } from '../lib/weather/useWeatherReport';
import { requestCurrentWeatherLocation, type CurrentWeatherLocation } from '../lib/weather/currentLocation';
import '../styles/weather.css';

const value = (number?: number, suffix = '') => number == null || !Number.isFinite(number) ? '—' : `${Math.round(number)}${suffix}`;

function dayLabel(date: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat('zh-HK', { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(parsed) : date;
}

function timestamp(at: string | number | undefined, zone: string): string {
  return at ? weatherLocalTime(at, zone).replace('T', ' ') || '時間未提供' : '時間未提供';
}

function SourceLink({ source }: { source: WeatherSource }) {
  return <a className="wx-source-link" href={source.url} target="_blank" rel="noopener noreferrer">
    {source.official ? <ShieldCheck size={14} aria-hidden="true" /> : <CloudSun size={14} aria-hidden="true" />}
    {source.name}<ArrowUpRight size={13} aria-hidden="true" /><span className="sr-only">（新分頁）</span>
  </a>;
}

function WeatherTrend({ hours }: { hours: WeatherHour[] }) {
  const temperatures = hours.flatMap((hour) => hour.temp == null ? [] : [hour.temp]);
  if (temperatures.length < 2) return null;
  const min = Math.floor(Math.min(...temperatures) - 2);
  const max = Math.ceil(Math.max(...temperatures) + 2);
  const points = hours.map((hour, i) => ({ x: 24 + i * (672 / Math.max(1, hours.length - 1)), y: hour.temp == null ? null : 112 - ((hour.temp - min) / (max - min)) * 80 }));
  const segments: string[] = [];
  points.forEach((point, i) => {
    if (point.y == null) return;
    segments.push(`${i === 0 || points[i - 1].y == null ? 'M' : 'L'}${point.x},${point.y}`);
  });
  return <svg className="wx-trend" viewBox="0 0 720 140" role="img" aria-label={`所選日期逐時溫度走勢，${value(Math.min(...temperatures))} 至 ${value(Math.max(...temperatures))} 攝氏度；詳細數值見下方時段。`}>
    {[32, 72, 112].map((y) => <line key={y} x1="24" x2="696" y1={y} y2={y} className="wx-trend-grid" />)}
    <path d={segments.join(' ')} fill="none" className="wx-trend-line" />
    {points.filter((_, i) => i % Math.max(1, Math.floor(hours.length / 6)) === 0).map((point) => point.y == null ? null : <circle key={point.x} cx={point.x} cy={point.y} r="3" className="wx-trend-dot" />)}
  </svg>;
}

function Forecast({ report, selectedHour, onHour }: { report: WeatherReport; selectedHour: string; onHour: (hour: string) => void }) {
  const hours = report.hourly;
  const selected = hours.find((hour) => hour.time === selectedHour) || hours[0];
  return <section className="wx-forecast" aria-labelledby="wx-forecast-heading">
    <div className="wx-section-heading"><div><span className="wx-eyebrow">THE DAY AHEAD</span><h2 id="wx-forecast-heading">逐時看天氣</h2></div><span className="wx-unit">°C · km/h</span></div>
    {report.hourlySource && <div className="wx-forecast-credit"><SourceLink source={report.hourlySource} /><span>預報時間為目的地當地時間</span></div>}
    {!hours.length ? <p className="wx-empty-copy">此來源未提供所選日期的逐時預報。可查看官方每日摘要，或稍後重新整理。</p> : <>
      <WeatherTrend hours={hours} />
      <div className="wx-hours" role="group" aria-label="選擇預報時段" tabIndex={0}>
        {hours.map((hour) => <button type="button" key={hour.time} aria-pressed={selected?.time === hour.time} onClick={() => onHour(hour.time)} className="wx-hour" aria-label={`${hour.time.slice(11)} 預報 ${value(hour.temp, ' 度')} ${weatherLabel(hour.code)}`}>
          <time dateTime={hour.time}>{hour.time.slice(11)}</time><WeatherIcon code={hour.code} size={28} hour={Number(hour.time.slice(11, 13))} />
          <strong>{value(hour.temp, '°')}</strong><span><Droplets size={11} aria-hidden="true" />{value(hour.rain, '%')}</span>
        </button>)}
      </div>
      {selected && <div className="wx-hour-detail" aria-live="polite">
        <div className="wx-detail-title"><time dateTime={selected.time}>{selected.time.slice(11)}</time><span>{weatherLabel(selected.code)}</span></div>
        <dl className="wx-metrics">
          <div><dt><Thermometer size={15} aria-hidden="true" />體感</dt><dd>{value(selected.feelsLike, '°')}</dd></div>
          <div><dt><Umbrella size={15} aria-hidden="true" />降雨機率</dt><dd>{value(selected.rain, '%')}</dd></div>
          <div><dt><Wind size={15} aria-hidden="true" />風速</dt><dd>{value(selected.windSpeed)}<small> km/h</small></dd></div>
          <div><dt><Droplets size={15} aria-hidden="true" />濕度</dt><dd>{value(selected.humidity, '%')}</dd></div>
        </dl>
        <div className="wx-extra-readings"><span>雨量 {value(selected.precipMm, ' mm')}</span><span>陣風 {value(selected.windGust, ' km/h')}</span><span>紫外線 {value(selected.uvIndex)}</span><span>雲量 {value(selected.cloudCover, '%')}</span></div>
      </div>}
    </>}
  </section>;
}

export function Weather({ state }: { state: AppState }) {
  const trip = activeTrip(state);
  const itinerary = useMemo(() => getItinerary(state), [state.trips, state.activeTripId, state.customItinerary, state.tripDateRange, state.tripName, state.tripCurrency]);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 60_000); return () => window.clearInterval(timer); }, []);
  const tripZone = weatherTimezone(trip.timezones?.[0] || itinerary[0]?.timezone);
  const today = weatherLocalTime(clock, tripZone).slice(0, 10);
  const [selection, setSelection] = useState({ tripId: trip.id, date: 'today', location: '' });
  const [deviceLocation, setDeviceLocation] = useState<(CurrentWeatherLocation & { tripId: string })>();
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const locationRequest = useRef(0);
  useEffect(() => {
    locationRequest.current += 1;
    setLocating(false);
    setLocationError('');
    return () => { locationRequest.current += 1; };
  }, [trip.id]);
  const dateChoice = selection.tripId === trip.id ? selection.date : 'today';
  const selectedDay = itinerary.find((day) => day.date === dateChoice);
  const locationDays = dateChoice === 'today' ? itinerary.filter((day) => day.date === today) : selectedDay ? [selectedDay] : [];
  const days = locationDays.length ? locationDays : dateChoice === 'today' ? itinerary : [];
  const daysKey = JSON.stringify(days);
  const known = useMemo(() => uniqueWeatherLocations(days), [daysKey]);
  const [resolved, setResolved] = useState<{ key: string; coords: WeatherCoord[]; error?: string }>({ key: '', coords: [] });
  useEffect(() => {
    if (!known.some((coord) => coord.missing)) return;
    let active = true;
    // Resolve only missing named destinations, independently of forecast requests.
    void Promise.all(days.map(async (day) => {
      try { return await resolveCoordsForDay(day); } catch { return uniqueWeatherLocations([day]); }
    })).then((groups) => {
      if (!active) return;
      const coords = [...new Map(groups.flat().map((coord) => [coord.missing ? `missing:${coord.label}:${coord.countryCode}` : weatherLocationKey(coord), coord])).values()];
      setResolved({ key: daysKey, coords });
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysKey]);
  const tripCoords = resolved.key === daysKey ? resolved.coords : known;
  const currentLocation = deviceLocation?.tripId === trip.id ? deviceLocation : undefined;
  const coords = currentLocation ? [currentLocation.coord, ...tripCoords] : tripCoords;
  const coord = coords.find((item) => selection.tripId === trip.id && weatherLocationKey(item) === selection.location) || tripCoords[0] || currentLocation?.coord;
  const zone = weatherTimezone(coord?.timezone || selectedDay?.timezone || tripZone);
  const date = dateChoice === 'today' ? weatherLocalTime(clock, zone).slice(0, 10) : dateChoice;
  const locationNeedsZone = coord?.origin === 'device-location' && !coord.timezone;
  const { report, busy, error, refresh } = useWeatherReport(locationNeedsZone ? undefined : coord, date, state);
  const [hourChoice, setHourChoice] = useState('');
  const localNow = weatherLocalTime(clock, report?.timezone || zone);
  const defaultHour = report?.hourly.find((hour) => hour.time >= localNow)?.time || report?.hourly[0]?.time || '';
  const selectedHour = report?.hourly.some((hour) => hour.time === hourChoice) ? hourChoice : defaultHour;
  const daily = report?.daily;
  const observation = report?.observation;
  const observationAge = observation ? clock - Date.parse(observation.observedAt) : Infinity;
  const observationFresh = !!observation && observationAge >= -5 * 60_000 && observationAge <= 3 * 60 * 60_000 && !report?.stale;
  const headline = observation?.temp;
  const currentHour = report?.hourly.find((hour) => hour.time === selectedHour);
  const service = OFFICIAL_WEATHER_SERVICES[coord?.countryCode || ''];
  const geocoding = known.some((item) => item.missing) && resolved.key !== daysKey;
  const selectDate = (next: string) => { setSelection({ tripId: trip.id, date: next, location: next === 'today' ? selection.location : '' }); setHourChoice(''); };
  const selectLocation = (next: WeatherCoord) => { setSelection({ tripId: trip.id, date: dateChoice, location: weatherLocationKey(next) }); setHourChoice(''); };
  const locate = async () => {
    const request = ++locationRequest.current;
    setLocating(true);
    setLocationError('');
    try {
      const location = await requestCurrentWeatherLocation();
      if (request !== locationRequest.current) return;
      setDeviceLocation({ ...location, tripId: trip.id });
      setSelection({ tripId: trip.id, date: 'today', location: weatherLocationKey(location.coord) });
      setHourChoice('');
    } catch (error) {
      if (request === locationRequest.current) setLocationError(error instanceof Error ? error.message : '定位暫時不可用，仍可選擇行程地點。');
    } finally {
      if (request === locationRequest.current) setLocating(false);
    }
  };

  return <div className="wx-station" aria-label="旅程氣象站">
    <header className="wx-masthead"><div><span className="wx-eyebrow">WEATHER / FIELD NOTES</span><h1>旅程氣象站<span aria-hidden="true">.</span></h1><p>天氣有依據，出發有準備。</p></div><button className="wx-refresh" type="button" onClick={refresh} disabled={busy || !coord || coord.missing} aria-label="重新整理天氣"><RefreshCw size={18} className={busy ? 'wx-spinning' : ''} /><span>{busy ? '更新中' : '更新'}</span></button></header>

    <div className="wx-planner">
      <div className="wx-location-controls"><button type="button" className="wx-locate" onClick={locate} disabled={locating}><LocateFixed size={17} aria-hidden="true" />{locating ? '定位中…' : '使用目前位置'}</button><details className="wx-location-privacy"><summary>定位如何使用</summary><p>只會在按下按鈕後要求定位權限。座標會傳送至 <a href="https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api" target="_blank" rel="noopener noreferrer">BigDataCloud</a> 辨識國家及時區，再向氣象服務查詢；該服務會使用匿名 GPS／IP 配對改善定位。本 app 不儲存位置紀錄。</p></details></div>
      {locationError && <p className="wx-location-message" role="alert">{locationError}</p>}
      {currentLocation && coord === currentLocation.coord && <div className="wx-location-message" role="status"><p>目前位置 · 定位精度約 ±{currentLocation.accuracyMeters < 1000 ? `${Math.round(currentLocation.accuracyMeters)} m` : `${(currentLocation.accuracyMeters / 1000).toFixed(1)} km`} · {coord.countryCode || '國家未確認'}</p>{currentLocation.notices.map((notice) => <p key={notice}>{notice}</p>)}</div>}
      <div className="wx-trip-label"><CalendarDays size={16} aria-hidden="true" /><span>{trip.name || '我的旅程'}</span><span>{itinerary.length} 日行程</span></div>
      <div className="wx-date-rail" role="group" aria-label="選擇天氣日期" tabIndex={0}>
        <button type="button" className="wx-date" aria-pressed={dateChoice === 'today'} onClick={() => selectDate('today')}><span>所選地點</span><strong>今日</strong><small>當地日期</small></button>
        {itinerary.map((day: ItineraryDay) => <button type="button" className="wx-date" key={day.dayId || day.date} aria-pressed={dateChoice === day.date} onClick={() => selectDate(day.date)} aria-label={`Day ${day.day} ${day.date}`}><span>Day {day.day}</span><strong>{day.date.slice(5).replace('-', '/')}</strong><small>{day.date < today ? '已過日期' : dayLabel(day.date).split('（')[1]?.replace('）', '') || day.region}</small></button>)}
      </div>
      <div className="wx-places" role="group" aria-label="選擇預報地點">
        {coords.map((place, index) => <button type="button" key={`${weatherLocationKey(place)}:${index}`} aria-pressed={place === coord} onClick={() => selectLocation(place)}><MapPin size={14} aria-hidden="true" />{place.label}{place === coord && <Check size={14} aria-hidden="true" />}</button>)}
      </div>
    </div>

    {!coord ? <div className="wx-state"><MapPin size={32} aria-hidden="true" /><h2>先加入旅程地點</h2><p>在行程設定城市、國家或景點座標，就可以查看對應天氣。</p></div>
      : locationNeedsZone ? <div className="wx-state" role="status"><MapPin size={32} aria-hidden="true" /><h2>未能確認當地時區</h2><p>請重新定位或選擇行程地點，以取得正確日期的預報。</p></div>
      : geocoding && coord.missing ? <div className="wx-state" role="status"><MapPin size={32} aria-hidden="true" /><h2>確認目的地中…</h2></div>
      : coord.missing ? <div className="wx-state" role="status"><MapPin size={32} aria-hidden="true" /><h2>未能確認「{coord.label}」的位置</h2><p>請在行程加入城市及國家，或有效的經緯度；未確認地點前不會顯示其他城市天氣。</p></div>
      : error ? <div className="wx-state" role="status"><CloudSun size={32} aria-hidden="true" /><h2>此日期暫無預報</h2><p>{error}</p><button type="button" onClick={dateChoice === 'today' ? refresh : () => selectDate('today')}>{dateChoice === 'today' ? '重試連線' : '查看目的地今日天氣'}</button></div>
      : !report ? <div className="wx-state wx-loading" role="status"><CloudSun size={36} aria-hidden="true" /><h2>正在接收氣象資料</h2><p>{coord.label} · {dayLabel(date)}</p></div>
      : <>
        <section className="wx-overview" aria-labelledby="wx-place-heading">
          <div className="wx-overview-top"><span>{dayLabel(date)}</span><span>{report.stale ? '上次資料 · 更新失敗' : report.cached ? '已儲存資料' : '資料已更新'}</span></div>
          <h2 id="wx-place-heading">{coord.label}</h2><div className="wx-zone"><MapPin size={13} aria-hidden="true" />{report.timezone} <span>·</span> {localNow.slice(11)}</div>
          <div className="wx-condition"><div><span className="wx-reading-label">{observation ? observationFresh ? '測站最新觀測' : '測站上次觀測' : '所選時段預報'}</span><strong className="wx-temperature">{value(observation ? headline : currentHour?.temp)}<sup>°</sup></strong><p>{weatherLabel(observation ? observation.code : currentHour?.code ?? daily?.code)}</p></div><div className="wx-weather-illustration"><WeatherIcon code={observation ? observation.code : currentHour?.code ?? daily?.code} size={132} hour={Number((observation ? weatherLocalTime(observation.observedAt, zone) : currentHour?.time || localNow).slice(11, 13))} /></div></div>
          <div className="wx-temperature-range"><span><ArrowDown size={15} />最低 <b>{value(daily?.min, '°')}</b></span><span><ArrowUp size={15} />最高 <b>{value(daily?.max, '°')}</b></span><small>{daily?.source.official ? '官方每日預報' : daily ? '每日模型預報' : '未提供每日高低溫'}</small></div>
          <div className="wx-overview-foot">{observation ? <><SourceLink source={observation.source} /><span>{observation.station} · {timestamp(observation.observedAt, report.timezone)}</span></> : <><span>{currentHour ? `${currentHour.time.slice(11)} 預報 · 非實測` : '未有測站觀測'}</span>{report.hourlySource && <SourceLink source={report.hourlySource} />}</>}</div>
        </section>

        {daily && <section className="wx-bulletin" aria-label="每日氣象摘要"><div className="wx-bulletin-heading"><ShieldCheck size={19} aria-hidden="true" /><h2>{daily.source.official ? '官方氣象摘要' : '每日預報摘要'}</h2></div><p>{daily.text || weatherLabel(daily.code)}</p>{daily.wind && <p className="wx-bulletin-wind"><Wind size={15} aria-hidden="true" />{daily.wind}</p>}{daily.significantRain && <p>顯著降雨概率：{daily.significantRain}</p>}<SourceLink source={daily.source} />{daily.source.issuedAt && <small>發布：{timestamp(daily.source.issuedAt, report.timezone)}</small>}</section>}

        <Forecast report={report} selectedHour={selectedHour} onHour={setHourChoice} />

        <section className="wx-provenance" aria-label="天氣資料來源與有效時間"><div className="wx-section-heading"><h2>每個數字，都有出處</h2><ShieldCheck size={19} aria-hidden="true" /></div><p>擷取時間 {timestamp(report.fetchedAt, report.timezone)} · 所有時段以目的地時區顯示。</p>{report.notices.map((notice) => <p key={notice}>{notice}</p>)}<p>「—」代表來源未提供；觀測、每日及逐時預報各自保留來源。最新警報請以當地官方公布為準。</p>{service && <a href={service.url} target="_blank" rel="noopener noreferrer">查看 {service.name} 官方天氣及警報 <ArrowUpRight size={15} aria-hidden="true" /><span className="sr-only">（新分頁）</span></a>}<a href="https://open-meteo.com/en/licence" target="_blank" rel="noopener noreferrer" className="wx-license">Open-Meteo / GeoNames 資料及授權</a></section>
      </>}
  </div>;
}
