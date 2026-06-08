import type { ItineraryDay } from './types';
import { brokerWeatherForecast } from './credentialBroker';
import type { AppState } from './types';

export const WEATHER_SLOTS = [9, 12, 16, 21];

export interface WeatherCoord {
  label: string;
  lat: number;
  lon: number;
  timezone?: string;
  missing?: boolean;
  origin?: 'spot-coordinate' | 'known-region' | 'city-geocode' | 'missing';
  query?: string;
}

export interface WeatherSlot {
  hour: number;
  temp?: number;
  feelsLike?: number;
  code?: number;
  rain?: number;
  precipMm?: number;
  humidity?: number;
  windSpeed?: number;
  windDirection?: number;
  windGust?: number;
  cloudCover?: number;
  uvIndex?: number;
}

export interface DayWeather {
  coord: WeatherCoord;
  source: string;
  slots: WeatherSlot[];
  provider?: string;
  cached?: boolean;
  fetchedAt?: number;
  fallbackReason?: string;
}

const REGION_COORDS: Record<string, WeatherCoord> = {
  名古屋: { label: '名古屋', lat: 35.1815, lon: 136.9066 },
  白川: { label: '白川鄉', lat: 36.2583, lon: 136.9063 },
  高山: { label: '高山', lat: 36.1429, lon: 137.2538 },
  立山: { label: '立山黑部', lat: 36.5776, lon: 137.6064 },
  上高地: { label: '上高地', lat: 36.2497, lon: 137.6343 },
  金澤: { label: '金澤', lat: 36.5613, lon: 136.6562 },
  長野: { label: '長野', lat: 36.6485, lon: 138.1943 },
  常滑: { label: '常滑', lat: 34.8871, lon: 136.8356 },
  東京: { label: '東京', lat: 35.6762, lon: 139.6503 },
  京都: { label: '京都', lat: 35.0116, lon: 135.7681 },
  大阪: { label: '大阪', lat: 34.6937, lon: 135.5023 },
  首爾: { label: '首爾', lat: 37.5665, lon: 126.9780 },
  台北: { label: '台北', lat: 25.0330, lon: 121.5654 },
  香港: { label: '香港', lat: 22.3193, lon: 114.1694 },
  SanFrancisco: { label: 'San Francisco', lat: 37.7749, lon: -122.4194 },
};

export function coordsForDay(day: ItineraryDay, limit = 2): WeatherCoord[] {
  const coords: WeatherCoord[] = [];
  const seen = new Set<string>();
  const add = (coord: WeatherCoord) => {
    const key = `${coord.lat.toFixed(3)}:${coord.lon.toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    coords.push(coord);
  };

  for (const spot of day.spots) {
    if (Number.isFinite(spot.lat) && Number.isFinite(spot.lon) && spot.lat != null && spot.lon != null) {
      add({ label: spot.name || day.city || day.region, lat: spot.lat, lon: spot.lon, timezone: spot.timezone || day.timezone, origin: 'spot-coordinate' });
    }
  }
  const hay = `${day.region} ${day.spots.map((s) => `${s.name} ${s.address || ''} ${s.note || ''}`).join(' ')}`;
  const compactHay = hay.replace(/\s+/g, '');
  const matchedKeys = Object.keys(REGION_COORDS)
    .map((key) => ({ key, idx: Math.min(...[hay.indexOf(key), compactHay.indexOf(key)].filter((idx) => idx >= 0)) }))
    .filter((item) => Number.isFinite(item.idx))
    .sort((a, b) => a.idx - b.idx);
  for (const { key } of matchedKeys) {
    add({ ...REGION_COORDS[key], timezone: day.timezone, origin: 'known-region' });
    if (coords.length >= limit) break;
  }
  if (coords.length) return coords.slice(0, limit);
  return [{ label: weatherLocationLabel(day), lat: Number.NaN, lon: Number.NaN, timezone: day.timezone, missing: true, origin: 'missing' }];
}

export function coordForDay(day: ItineraryDay): WeatherCoord {
  return coordsForDay(day, 1)[0];
}

export async function resolveCoordsForDay(day: ItineraryDay, limit = 2): Promise<WeatherCoord[]> {
  const coords = coordsForDay(day, limit);
  if (coords.some((coord) => !coord.missing)) return coords;
  const queries = weatherLocationQueries(day);
  if (!queries.length) return coords;
  const geocoded = await geocodeWeatherLocations(queries, day.country, limit);
  return geocoded.length ? geocoded : coords;
}

function weatherCacheKey(coord: WeatherCoord) {
  if (!Number.isFinite(coord.lat) || !Number.isFinite(coord.lon)) return null;
  return `wx_react_v3_${coord.lat.toFixed(3)}_${coord.lon.toFixed(3)}`;
}

function weatherDataIncludesDate(data: unknown, targetDate?: string): boolean {
  if (!targetDate) return true;
  const time = (data as { hourly?: { time?: unknown } } | null)?.hourly?.time;
  return Array.isArray(time) && time.some((value) => String(value).startsWith(`${targetDate}T`));
}

function weatherLocationLabel(day: ItineraryDay): string {
  return [day.city, day.region, day.country].map((part) => String(part || '').trim()).find(Boolean) || '未設定座標';
}

function weatherLocationQueries(day: ItineraryDay): string[] {
  const city = String(day.city || '').trim();
  const region = String(day.region || '').trim();
  const country = String(day.country || '').trim();
  const candidates = [
    [city, country].filter(Boolean).join(' '),
    [region, country].filter(Boolean).join(' '),
    city,
    region,
  ].filter(Boolean);
  return Array.from(new Set(candidates));
}

function geocodeCacheKey(query: string, country?: string) {
  const scopedQuery = [query, country].map((part) => String(part || '').trim()).filter(Boolean).join('_');
  return `wx_geocode_v1_${scopedQuery.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 72)}`;
}

function countryMatches(result: Record<string, unknown>, country?: string): boolean {
  const wanted = String(country || '').trim().toLowerCase();
  if (!wanted) return true;
  const code = String(result.country_code || '').toLowerCase();
  const name = String(result.country || '').toLowerCase();
  return code === wanted || name === wanted || name.includes(wanted) || wanted.includes(name);
}

async function geocodeWeatherLocations(queries: string[], country?: string, limit = 2): Promise<WeatherCoord[]> {
  for (const query of queries) {
    const coords = await geocodeWeatherLocation(query, country, limit);
    if (coords.length) return coords;
  }
  return [];
}

async function geocodeWeatherLocation(query: string, country?: string, limit = 2): Promise<WeatherCoord[]> {
  const cacheKey = geocodeCacheKey(query, country);
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (cached && Date.now() - cached.ts < 7 * 24 * 60 * 60 * 1000 && Array.isArray(cached.coords)) return cached.coords;
  } catch {
    // Ignore corrupt cache.
  }
  const searchCount = String(country || '').trim() ? 10 : Math.max(1, Math.min(10, limit));
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=${searchCount}&language=en&format=json`;
  const data = await fetchJson(url);
  const results = Array.isArray(data?.results) ? data.results as Record<string, unknown>[] : [];
  const validResults = results.filter((result) => Number.isFinite(Number(result.latitude)) && Number.isFinite(Number(result.longitude)));
  const scopedResults = String(country || '').trim() ? validResults.filter((result) => countryMatches(result, country)) : validResults;
  const coords = scopedResults
    .slice(0, limit)
    .map((result) => ({
      label: String(result.name || query),
      lat: Number(result.latitude),
      lon: Number(result.longitude),
      timezone: typeof result.timezone === 'string' ? result.timezone : undefined,
      origin: 'city-geocode' as const,
      query,
    }));
  localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), coords }));
  return coords;
}

function normalizeWeatherTimezone(value?: string): string {
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

async function fetchJson(url: string, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } finally {
    window.clearTimeout(timer);
  }
}

type WeatherBrokerState = Pick<AppState, 'credentialBrokerUrl' | 'credentialSession' | 'credentialSessionExpiresAt'>;

export async function fetchWeather(coord: WeatherCoord, timezone = 'auto', useJma = false, state?: WeatherBrokerState, targetDate?: string) {
  if (!Number.isFinite(coord.lat) || !Number.isFinite(coord.lon)) throw new Error(`${coord.label} 缺少 lat/lon，請喺行程 spot 加座標或用 Kimi 更新行程。`);
  const cacheKey = weatherCacheKey(coord);
  const safeTimezone = normalizeWeatherTimezone(timezone);
  try {
    const cached = cacheKey ? JSON.parse(localStorage.getItem(cacheKey) || 'null') : null;
    if (cached && Date.now() - cached.ts < 60 * 60 * 1000 && weatherDataIncludesDate(cached.data, targetDate)) {
      return { data: cached.data, source: `${cached.source} cache`, provider: String(cached.source || 'Weather'), cached: true, fetchedAt: Number(cached.ts) || Date.now() };
    }
  } catch {
    // Ignore corrupt cache.
  }

  let brokerFallbackReason = '';
  if (state) {
    try {
      const data = await brokerWeatherForecast(state, { lat: coord.lat, lon: coord.lon, days: 3 });
      if (data && typeof data === 'object') {
        if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data, source: 'WeatherAPI.com' }));
        return { data, source: 'WeatherAPI.com', provider: 'WeatherAPI.com', cached: false, fetchedAt: Date.now() };
      }
    } catch (error) {
      brokerFallbackReason = `WeatherAPI.com unavailable: ${weatherErrorLabel(error)}`;
      // WeatherAPI.com is a private broker-backed enhancement; fall back to public providers if unavailable.
    }
  }

  const hourly = [
    'temperature_2m',
    'apparent_temperature',
    'weather_code',
    'precipitation_probability',
    'precipitation',
    'relative_humidity_2m',
    'wind_speed_10m',
    'wind_direction_10m',
    'wind_gusts_10m',
    'cloud_cover',
    'uv_index',
  ].join(',');
  const base = `https://api.open-meteo.com/v1/forecast?latitude=${coord.lat}&longitude=${coord.lon}&hourly=${hourly}&current=temperature_2m,weather_code&timezone=${encodeURIComponent(safeTimezone)}&forecast_days=7`;
  const candidates = [
    ...(useJma ? [{ url: `${base}&models=jma_seamless`, source: 'JMA' }] : []),
    { url: base, source: 'Open-Meteo' },
  ];
  let lastError: unknown;
  let providerFallbackReason = brokerFallbackReason;
  for (const c of candidates) {
    try {
      const data = await fetchJson(c.url);
      if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data, source: c.source }));
      return { data, source: c.source, provider: c.source, cached: false, fetchedAt: Date.now(), fallbackReason: providerFallbackReason || undefined };
    } catch (error) {
      lastError = error;
      if (c.source === 'JMA') providerFallbackReason = [providerFallbackReason, `JMA unavailable: ${weatherErrorLabel(error)}`].filter(Boolean).join(' · ');
    }
  }
  throw lastError instanceof Error ? lastError : new Error('天氣拉取失敗');
}

function weatherErrorLabel(error: unknown): string {
  if (error instanceof Error) return error.message.replace(/\s+/g, ' ').slice(0, 80);
  return String(error || 'unknown').replace(/\s+/g, ' ').slice(0, 80);
}

export function slotsForDate(data: { hourly?: {
  time?: string[];
  temperature_2m?: number[];
  apparent_temperature?: number[];
  weather_code?: number[];
  precipitation_probability?: number[];
  precipitation?: number[];
  relative_humidity_2m?: number[];
  wind_speed_10m?: number[];
  wind_direction_10m?: number[];
  wind_gusts_10m?: number[];
  cloud_cover?: number[];
  uv_index?: number[];
} }, date: string): WeatherSlot[] {
  const time = data.hourly?.time || [];
  return WEATHER_SLOTS.map((hour) => {
    const idx = time.indexOf(`${date}T${String(hour).padStart(2, '0')}:00`);
    return {
      hour,
      temp: idx >= 0 ? data.hourly?.temperature_2m?.[idx] : undefined,
      feelsLike: idx >= 0 ? data.hourly?.apparent_temperature?.[idx] : undefined,
      code: idx >= 0 ? data.hourly?.weather_code?.[idx] : undefined,
      rain: idx >= 0 ? data.hourly?.precipitation_probability?.[idx] : undefined,
      precipMm: idx >= 0 ? data.hourly?.precipitation?.[idx] : undefined,
      humidity: idx >= 0 ? data.hourly?.relative_humidity_2m?.[idx] : undefined,
      windSpeed: idx >= 0 ? data.hourly?.wind_speed_10m?.[idx] : undefined,
      windDirection: idx >= 0 ? data.hourly?.wind_direction_10m?.[idx] : undefined,
      windGust: idx >= 0 ? data.hourly?.wind_gusts_10m?.[idx] : undefined,
      cloudCover: idx >= 0 ? data.hourly?.cloud_cover?.[idx] : undefined,
      uvIndex: idx >= 0 ? data.hourly?.uv_index?.[idx] : undefined,
    };
  });
}

export function weatherLabel(code?: number) {
  if (code == null) return '—';
  if (code === 0) return '晴';
  if ([1, 2, 3].includes(code)) return '多雲';
  if ([45, 48].includes(code)) return '霧';
  if (code >= 51 && code <= 67) return '雨';
  if (code >= 80 && code <= 82) return '陣雨';
  if (code >= 71 && code <= 86) return '雪';
  if (code >= 95) return '雷雨';
  return '天氣';
}
