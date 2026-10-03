import { brokerWeatherForecast, hasCredentialBrokerSession } from './credentialBroker';
import type { AppState } from './types';
import { fetchModelWeather, fetchOfficialWeather, OFFICIAL_WEATHER_SERVICES, parseHourlyForecast, type HourlyPayload } from './weather/providers';
import { validWeatherCoord, weatherLocationKey } from './weather/locations';
import { weatherLocalTime, weatherTimezone, type WeatherBulletin, type WeatherCoord, type WeatherReport, type WeatherSource } from './weather/types';

export * from './weather/types';
export * from './weather/locations';
export { OFFICIAL_WEATHER_SERVICES } from './weather/providers';

const CACHE_PREFIX = 'wx_compact_v5:';
const CACHE_TTL = 20 * 60_000;
const STALE_TTL = 6 * 60 * 60_000;
const MAX_CACHE_ENTRIES = 24;
const pending = new Map<string, Promise<WeatherReport>>();
type BrokerState = Pick<AppState, 'credentialBrokerUrl' | 'credentialSession' | 'credentialSessionExpiresAt'>;

export function weatherReportKey(coord: WeatherCoord, date: string): string {
  return `${CACHE_PREFIX}${weatherLocationKey(coord)}:${date}`;
}

function validSource(value: unknown): value is WeatherSource {
  const source = value as WeatherSource | null;
  if (!source || typeof source.name !== 'string' || typeof source.official !== 'boolean') return false;
  return ['https://open-meteo.com/', 'https://www.weatherapi.com/', ...Object.values(OFFICIAL_WEATHER_SERVICES).map((entry) => entry.url)].includes(source.url);
}

export function cachedWeatherReport(coord: WeatherCoord, date: string): WeatherReport | null {
  if (coord.origin === 'device-location') return null;
  try {
    const report = JSON.parse(localStorage.getItem(weatherReportKey(coord, date)) || 'null') as WeatherReport | null;
    if (!report || report.date !== date || !Number.isFinite(report.fetchedAt) || report.fetchedAt > Date.now()
      || Date.now() - report.fetchedAt > STALE_TTL || !Array.isArray(report.hourly) || !Array.isArray(report.notices)
      || report.notices.some((notice) => typeof notice !== 'string') || typeof report.timezone !== 'string') return null;
    if (report.hourly.some((hour) => !hour || typeof hour.time !== 'string' || !hour.time.startsWith(`${date}T`)
      || Object.entries(hour).some(([key, value]) => key !== 'time' && value != null && (typeof value !== 'number' || !Number.isFinite(value))))) return null;
    if (report.hourlySource && !validSource(report.hourlySource)) return null;
    if (report.daily && (!validSource(report.daily.source) || report.daily.date !== date)) return null;
    if (report.observation && (!validSource(report.observation.source) || typeof report.observation.observedAt !== 'string' || typeof report.observation.station !== 'string')) return null;
    return { ...report, coord, cached: true, stale: Date.now() - report.fetchedAt >= CACHE_TTL };
  } catch { return null; }
}

function saveReport(key: string, report: WeatherReport): void {
  try {
    const owned = Object.keys(localStorage).filter((key) => key.startsWith(CACHE_PREFIX));
    if (owned.length >= MAX_CACHE_ENTRIES && !owned.includes(key)) {
      const oldest = owned.sort((a, b) => {
        try { return (JSON.parse(localStorage.getItem(a) || '{}').fetchedAt || 0) - (JSON.parse(localStorage.getItem(b) || '{}').fetchedAt || 0); }
        catch { return 0; }
      })[0];
      localStorage.removeItem(oldest);
    }
    localStorage.setItem(key, JSON.stringify(report));
  } catch { /* Quota/private mode must not turn successful weather into an error. */ }
}

function usable(bulletin: WeatherBulletin): boolean {
  return !!(bulletin.observation || bulletin.daily || bulletin.hourly.length);
}

async function modelForecast(coord: WeatherCoord, date: string, force: boolean, state?: BrokerState): Promise<WeatherBulletin> {
  try { return await fetchModelWeather(coord, date, force); }
  catch (error) {
    // Existing broker enhancement remains available to a configured session. It is
    // the final provider: quota/429 errors never cause another paid request.
    if (!state || !hasCredentialBrokerSession(state)) throw error;
    const data = await brokerWeatherForecast(state, { lat: coord.lat, lon: coord.lon, days: 3 }) as HourlyPayload;
    const hourly = parseHourlyForecast(data, date);
    if (!hourly.length) throw new Error('現有預報未涵蓋此日期');
    return { hourly, hourlySource: { name: 'WeatherAPI.com', url: 'https://www.weatherapi.com/', official: false },
      timezone: weatherTimezone(data.timezone || coord.timezone), notices: ['公開逐時服務暫時不可用，已使用已連接的 WeatherAPI。'] };
  }
}

/** One service for both the tab and Dashboard. Date, place, country and timezone
 * define identity. Neither a trip id nor a date alone identifies a forecast. */
export async function fetchWeatherReport(coord: WeatherCoord, date: string, options: { force?: boolean; state?: BrokerState } = {}): Promise<WeatherReport> {
  if (!validWeatherCoord(coord) || coord.missing) throw new Error('未能確認地點，請在行程加入城市、國家或有效座標。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('無效預報日期');
  const zone = weatherTimezone(coord.timezone);
  const today = weatherLocalTime(Date.now(), zone).slice(0, 10);
  const daysAway = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  if (daysAway < 0) throw new Error('此日期已過；切換「今日」查看目的地目前天氣。');
  if (daysAway > 15) throw new Error('尚未進入預報範圍；目前最多可查未來 16 日，個別官方來源較短。');
  const key = weatherReportKey(coord, date);
  const cached = cachedWeatherReport(coord, date);
  if (!options.force && cached && !cached.stale) return cached;
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const request = (async () => {
    const notices: string[] = [];
    let official: WeatherBulletin = { hourly: [], notices: [] };
    let model: WeatherBulletin = { hourly: [], notices: [] };
    try {
      // NWS/MSC supply native hourly periods. Other sources supply observations or
      // daily bulletins, so request the separately-labelled hourly model in parallel.
      const nativeHourly = coord.countryCode === 'US' || coord.countryCode === 'CA';
      const officialPromise = fetchOfficialWeather(coord, date, !!options.force).catch(() => {
        const name = OFFICIAL_WEATHER_SERVICES[coord.countryCode || '']?.name || '當地氣象服務';
        notices.push(`${name} 暫無可用的地點／日期資料；逐時資料會標示實際來源。`);
        return { hourly: [], notices: [] } as WeatherBulletin;
      });
      const modelPromise = nativeHourly ? null : modelForecast(coord, date, !!options.force, options.state).catch(() => {
        notices.push('逐時預報暫時未能取得。');
        return { hourly: [], notices: [] } as WeatherBulletin;
      });
      official = await officialPromise;
      if (modelPromise) model = await modelPromise;
      else if (!official.hourly.length) {
        try { model = await modelForecast(coord, date, !!options.force, options.state); }
        catch { notices.push('逐時預報暫時未能取得。'); }
      }
      if (!usable(official) && !usable(model)) throw new Error('暫時無法取得此地點的天氣，請檢查網絡後重試。');
      const report: WeatherReport = {
        coord, date, timezone: official.timezone || model.timezone || zone,
        observation: official.observation, daily: official.daily || model.daily,
        hourly: official.hourly.length ? official.hourly : model.hourly,
        hourlySource: official.hourly.length ? official.hourlySource : model.hourlySource,
        notices: [...new Set([...notices, ...official.notices, ...model.notices])],
        fetchedAt: Date.now(), cached: false, stale: false,
      };
      if (coord.origin !== 'device-location') saveReport(key, report);
      return report;
    } catch (error) {
      if (cached) return { ...cached, stale: true, notices: [...cached.notices, '更新失敗，顯示上次資料；請留意擷取時間。'] };
      throw error;
    } finally { pending.delete(key); }
  })();
  pending.set(key, request);
  return request;
}
