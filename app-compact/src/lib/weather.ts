import type { ItineraryDay } from './types';
import { brokerWeatherForecast } from './credentialBroker';
import type { AppState } from './types';
import { GEO_DICTIONARY } from './geo';

export const WEATHER_SLOTS = [9, 12, 16, 21];

const ROWS_CACHE_TTL = 60 * 60 * 1000;
let _weatherRowsCache: { data: Record<string, DayWeather[]>; ts: number } | null = null;

export function getCachedWeatherRows(): Record<string, DayWeather[]> | null {
  if (_weatherRowsCache && Date.now() - _weatherRowsCache.ts < ROWS_CACHE_TTL) {
    return _weatherRowsCache.data;
  }
  return null;
}

export function setCachedWeatherRows(data: Record<string, DayWeather[]>): void {
  _weatherRowsCache = { data, ts: Date.now() };
}

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

type WeatherData = {
  hourly?: Record<string, unknown[]>;
  current?: Record<string, unknown>;
};

type WeatherFetchResult = {
  data: WeatherData;
  source: string;
  provider: string;
  cached: boolean;
  fetchedAt: number;
  fallbackReason?: string;
};

export type OfficialWeatherProviderId = 'jma' | 'nea-sg' | 'nws-us' | 'msc-ca';

export type OfficialWeatherContext = {
  country?: string;
  region?: string;
  city?: string;
};

type JmaLocationProfile = {
  label: string;
  matcher: RegExp;
  officeCode: string;
  stationCode: string;
  lat: number;
  lon: number;
};

const JMA_LOCATION_PROFILES: JmaLocationProfile[] = [
  { label: '名古屋', matcher: /名古屋|Nagoya|常滑|Tokoname|中部国際|Chubu/i, officeCode: '230000', stationCode: '51106', lat: 35.1667, lon: 136.965 },
  { label: '高山', matcher: /高山|Takayama|白川|Shirakawa|Gifu/i, officeCode: '210000', stationCode: '52146', lat: 36.155, lon: 137.2533 },
  { label: '長野', matcher: /長野|Nagano|上高地|Kamikochi|松本|Matsumoto/i, officeCode: '200000', stationCode: '48156', lat: 36.6617, lon: 138.1917 },
  { label: '立山', matcher: /立山|Tateyama|黒部|Kurobe|Toyama|富山/i, officeCode: '160000', stationCode: '55102', lat: 36.7083, lon: 137.2033 },
  { label: '金澤', matcher: /金沢|金澤|Kanazawa|Ishikawa|石川/i, officeCode: '170000', stationCode: '56227', lat: 36.5883, lon: 136.6333 },
  { label: '東京', matcher: /東京|Tokyo/i, officeCode: '130000', stationCode: '44132', lat: 35.6917, lon: 139.75 },
  { label: '京都', matcher: /京都|Kyoto/i, officeCode: '260000', stationCode: '61286', lat: 35.0133, lon: 135.7317 },
  { label: '大阪', matcher: /大阪|Osaka/i, officeCode: '270000', stationCode: '62078', lat: 34.6817, lon: 135.5183 },
];

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

const OFFICIAL_PROVIDER_SOURCE: Record<OfficialWeatherProviderId, string> = {
  jma: 'JMA official',
  'nea-sg': 'NEA official',
  'nws-us': 'NWS official',
  'msc-ca': 'MSC official',
};

export function resolveOfficialWeatherProvider(coord: WeatherCoord, context: OfficialWeatherContext = {}): OfficialWeatherProviderId | null {
  const country = String(context.country || '').trim();
  if (country) {
    if (/日本|Japan|JP|JPN/i.test(country)) return 'jma';
    if (/Singapore|SG|新加坡|星加坡|Singapura/i.test(country)) return 'nea-sg';
    if (/United States|USA|U\.S\.|US\b|美國|美国/i.test(country)) return 'nws-us';
    if (/Canada|CA\b|加拿大/i.test(country)) return 'msc-ca';
    return null;
  }
  const hay = [context.region, context.city, coord.label, coord.query].map((part) => String(part || '')).join(' ');
  if (/日本|Japan|JP|JPN|名古屋|金澤|金沢|長野|高山|白川|常滑|上高地|立山|東京|京都|大阪/i.test(hay)) return 'jma';
  if (/Singapore|SG|新加坡|星加坡|Singapura/i.test(hay)) return 'nea-sg';
  if (/United States|USA|U\.S\.|US\b|美國|美国/i.test(hay)) return 'nws-us';
  if (/Canada|CA\b|加拿大/i.test(hay)) return 'msc-ca';
  if (coord.lat >= 24 && coord.lat <= 46 && coord.lon >= 122 && coord.lon <= 146) return 'jma';
  if (coord.lat >= 1.13 && coord.lat <= 1.48 && coord.lon >= 103.55 && coord.lon <= 104.15) return 'nea-sg';
  if (coord.lat >= 41 && coord.lat <= 84 && coord.lon >= -141 && coord.lon <= -52) return 'msc-ca';
  if (coord.lat >= 18 && coord.lat <= 72 && coord.lon >= -170 && coord.lon <= -60) return 'nws-us';
  return null;
}

export function coordsForDay(day: ItineraryDay, limit = 2): WeatherCoord[] {
  const coords: WeatherCoord[] = [];
  const seen = new Set<string>();
  const add = (coord: WeatherCoord) => {
    const key = `${coord.lat.toFixed(3)}:${coord.lon.toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    coords.push(coord);
  };

  const spots = day.spots || [];
  for (const spot of spots) {
    if (Number.isFinite(spot.lat) && Number.isFinite(spot.lon) && spot.lat != null && spot.lon != null) {
      add({ label: spot.name || day.city || day.region, lat: spot.lat, lon: spot.lon, timezone: spot.timezone || day.timezone, origin: 'spot-coordinate' });
    }
  }
  const hay = `${day.region} ${spots.map((s) => `${s.name} ${s.address || ''} ${s.note || ''}`).join(' ')}`;
  const compactHay = hay.replace(/\s+/g, '');
  const matchedKeys = Object.keys(REGION_COORDS)
    .map((key) => ({ key, idx: Math.min(...[hay.indexOf(key), compactHay.indexOf(key)].filter((idx) => idx >= 0)) }))
    .filter((item) => Number.isFinite(item.idx))
    .sort((a, b) => a.idx - b.idx);
  for (const { key } of matchedKeys) {
    add({ ...REGION_COORDS[key], timezone: day.timezone, origin: 'known-region' });
    if (coords.length >= limit) break;
  }
  if (!coords.length) {
    for (const entry of GEO_DICTIONARY) {
      if (entry.pattern.test(hay)) {
        add({ label: entry.geo.city, lat: entry.geo.lat, lon: entry.geo.lon, timezone: day.timezone, origin: 'known-region' });
        if (coords.length >= limit) break;
      }
    }
  }
  if (coords.length) return coords.slice(0, limit);
  return [{ label: weatherLocationLabel(day), lat: Number.NaN, lon: Number.NaN, timezone: day.timezone, missing: true, origin: 'missing' }];
}

export function coordForDay(day: ItineraryDay): WeatherCoord {
  return coordsForDay(day, 1)[0];
}

export interface GroupedWeatherLocation {
  label: string;
  lat: number;
  lon: number;
  spotNames: string[];
  timezone?: string;
  missing?: boolean;
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

const GROUP_RADIUS_KM = 30;

function buildCityAnchors(): { label: string; lat: number; lon: number }[] {
  const anchors = new Map<string, { label: string; lat: number; lon: number }>();
  for (const entry of Object.values(REGION_COORDS)) {
    anchors.set(entry.label, { label: entry.label, lat: entry.lat, lon: entry.lon });
  }
  for (const entry of GEO_DICTIONARY) {
    const city = entry.geo.city;
    if (!anchors.has(city)) {
      anchors.set(city, { label: city, lat: entry.geo.lat, lon: entry.geo.lon });
    }
  }
  return Array.from(anchors.values());
}

let _cityAnchorsCache: { label: string; lat: number; lon: number }[] | null = null;
function getCityAnchors() {
  if (!_cityAnchorsCache) _cityAnchorsCache = buildCityAnchors();
  return _cityAnchorsCache;
}

export function groupedCoordsForDay(day: ItineraryDay): GroupedWeatherLocation[] {
  const rawCoords = coordsForDay(day, 99);
  if (rawCoords.length === 0 || (rawCoords.length === 1 && rawCoords[0].missing)) {
    return [{ label: weatherLocationLabel(day), lat: Number.NaN, lon: Number.NaN, spotNames: [], missing: true, timezone: day.timezone }];
  }

  const cityAnchors = getCityAnchors();
  const groups = new Map<string, { label: string; lat: number; lon: number; spotNames: string[]; timezone?: string }>();

  for (const coord of rawCoords) {
    if (coord.missing) continue;
    let matched = false;
    for (const city of cityAnchors) {
      if (haversineKm(coord, city) <= GROUP_RADIUS_KM) {
        const key = city.label;
        if (!groups.has(key)) groups.set(key, { label: city.label, lat: city.lat, lon: city.lon, spotNames: [], timezone: coord.timezone });
        groups.get(key)!.spotNames.push(coord.label);
        matched = true;
        break;
      }
    }
    if (!matched) {
      const key = `${coord.lat.toFixed(2)}_${coord.lon.toFixed(2)}`;
      if (!groups.has(key)) groups.set(key, { label: coord.label, lat: coord.lat, lon: coord.lon, spotNames: [], timezone: coord.timezone });
      groups.get(key)!.spotNames.push(coord.label);
    }
  }

  if (groups.size === 0) {
    return [{ label: weatherLocationLabel(day), lat: Number.NaN, lon: Number.NaN, spotNames: [], missing: true, timezone: day.timezone }];
  }

  return Array.from(groups.values());
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

async function fetchText(url: string, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  } finally {
    window.clearTimeout(timer);
  }
}

function resolveJmaLocationProfile(coord: WeatherCoord): JmaLocationProfile | null {
  const hay = `${coord.label || ''} ${coord.query || ''}`;
  const textMatch = JMA_LOCATION_PROFILES.find((profile) => profile.matcher.test(hay));
  if (textMatch) return textMatch;
  if (!Number.isFinite(coord.lat) || !Number.isFinite(coord.lon)) return null;
  const inJapanBounds = coord.lat >= 24 && coord.lat <= 46 && coord.lon >= 122 && coord.lon <= 146;
  if (!inJapanBounds) return null;
  return JMA_LOCATION_PROFILES
    .map((profile) => ({ profile, distance: distanceKm(coord.lat, coord.lon, profile.lat, profile.lon) }))
    .sort((a, b) => a.distance - b.distance)[0]?.profile || null;
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function emptyWeatherDataForDate(date: string): WeatherData {
  return {
    hourly: {
      time: WEATHER_SLOTS.map((hour) => `${date}T${String(hour).padStart(2, '0')}:00`),
      temperature_2m: WEATHER_SLOTS.map(() => undefined),
      apparent_temperature: WEATHER_SLOTS.map(() => undefined),
      weather_code: WEATHER_SLOTS.map(() => undefined),
      precipitation_probability: WEATHER_SLOTS.map(() => undefined),
      precipitation: WEATHER_SLOTS.map(() => undefined),
      relative_humidity_2m: WEATHER_SLOTS.map(() => undefined),
      wind_speed_10m: WEATHER_SLOTS.map(() => undefined),
      wind_direction_10m: WEATHER_SLOTS.map(() => undefined),
      wind_gusts_10m: WEATHER_SLOTS.map(() => undefined),
      cloud_cover: WEATHER_SLOTS.map(() => undefined),
      uv_index: WEATHER_SLOTS.map(() => undefined),
    },
  };
}

function slotIndexForIso(iso: string, targetDate: string): number {
  if (!iso.startsWith(targetDate)) return -1;
  const hour = Number(iso.slice(11, 13));
  if (!Number.isFinite(hour)) return -1;
  let bestIndex = 0;
  let bestDistance = Infinity;
  WEATHER_SLOTS.forEach((slot, index) => {
    const distance = Math.abs(slot - hour);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestDistance <= 4 ? bestIndex : -1;
}

function setHourlyValue(data: WeatherData, field: string, index: number, value: unknown) {
  if (index < 0 || value == null || value === '') return;
  const hourly = data.hourly || {};
  const arr = hourly[field] as unknown[] | undefined;
  if (!Array.isArray(arr)) return;
  const numeric = Number(value);
  arr[index] = Number.isFinite(numeric) ? numeric : value;
}

function jmaWeatherCodeToWmo(code: unknown): number | undefined {
  const value = String(code || '').trim();
  if (!value) return undefined;
  const first = value[0];
  if (first === '1') return value.includes('3') ? 61 : value.includes('2') ? 2 : 1;
  if (first === '2') return value.includes('3') ? 61 : 3;
  if (first === '3') return 61;
  if (first === '4') return 71;
  return undefined;
}

function jmaForecastArea(forecast: unknown, seriesIndex: number, preferredAreaCode?: string): Record<string, unknown> | null {
  const timeSeries = (forecast as { timeSeries?: unknown[] }[] | null)?.[0]?.timeSeries;
  const series = Array.isArray(timeSeries) ? timeSeries[seriesIndex] as { areas?: unknown[] } : null;
  const areas = Array.isArray(series?.areas) ? series.areas as Record<string, unknown>[] : [];
  return areas.find((area) => String((area.area as { code?: unknown } | undefined)?.code || '') === preferredAreaCode) || areas[0] || null;
}

function applyJmaForecast(data: WeatherData, forecast: unknown, profile: JmaLocationProfile, targetDate: string) {
  const timeSeries = (forecast as { timeSeries?: unknown[] }[] | null)?.[0]?.timeSeries;
  if (!Array.isArray(timeSeries)) return;

  const weatherSeries = timeSeries[0] as { timeDefines?: string[] } | undefined;
  const weatherArea = jmaForecastArea(forecast, 0);
  const weatherCodes = Array.isArray(weatherArea?.weatherCodes) ? weatherArea.weatherCodes : [];
  (weatherSeries?.timeDefines || []).forEach((iso, index) => {
    const slot = slotIndexForIso(String(iso), targetDate);
    const code = jmaWeatherCodeToWmo(weatherCodes[index]);
    if (slot >= 0 && code != null) setHourlyValue(data, 'weather_code', slot, code);
  });

  const popSeries = timeSeries[1] as { timeDefines?: string[] } | undefined;
  const popArea = jmaForecastArea(forecast, 1);
  const pops = Array.isArray(popArea?.pops) ? popArea.pops : [];
  (popSeries?.timeDefines || []).forEach((iso, index) => {
    setHourlyValue(data, 'precipitation_probability', slotIndexForIso(String(iso), targetDate), pops[index]);
  });

  const tempSeries = timeSeries[2] as { timeDefines?: string[] } | undefined;
  const tempArea = jmaForecastArea(forecast, 2, profile.stationCode);
  const temps = Array.isArray(tempArea?.temps) ? tempArea.temps : [];
  (tempSeries?.timeDefines || []).forEach((iso, index) => {
    setHourlyValue(data, 'temperature_2m', slotIndexForIso(String(iso), targetDate), temps[index]);
  });
}

function currentYmdInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function liveSlotIndexForDate(targetDate: string, timezone: string): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  if (today !== targetDate) return -1;
  const hour = Number(part('hour'));
  const slot = WEATHER_SLOTS.slice().reverse().find((candidate) => hour >= candidate) || WEATHER_SLOTS[0];
  return WEATHER_SLOTS.indexOf(slot);
}

function formatJmaAmedasMapTime(latestTime: string): string {
  const match = latestTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) throw new Error('JMA latest time format changed');
  return `${match[1]}${match[2]}${match[3]}${match[4]}${match[5]}00`;
}

function firstAmedasValue(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const raw = record?.[key];
  const value = Array.isArray(raw) ? Number(raw[0]) : Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

async function applyJmaAmedasObservation(data: WeatherData, profile: JmaLocationProfile, targetDate: string, timezone: string) {
  if (currentYmdInTimezone(timezone) !== targetDate) return;
  const slotIndex = liveSlotIndexForDate(targetDate, timezone);
  if (slotIndex < 0) return;
  const latestTime = (await fetchText('https://www.jma.go.jp/bosai/amedas/data/latest_time.txt')).trim();
  const mapTime = formatJmaAmedasMapTime(latestTime);
  const map = await fetchJson(`https://www.jma.go.jp/bosai/amedas/data/map/${mapTime}.json`) as Record<string, Record<string, unknown>>;
  const record = map?.[profile.stationCode];
  setHourlyValue(data, 'temperature_2m', slotIndex, firstAmedasValue(record, 'temp'));
  setHourlyValue(data, 'relative_humidity_2m', slotIndex, firstAmedasValue(record, 'humidity'));
  const windMs = firstAmedasValue(record, 'wind');
  if (windMs != null) setHourlyValue(data, 'wind_speed_10m', slotIndex, windMs * 3.6);
  setHourlyValue(data, 'wind_direction_10m', slotIndex, firstAmedasValue(record, 'windDirection'));
  setHourlyValue(data, 'precipitation', slotIndex, firstAmedasValue(record, 'precipitation1h'));
}

function hasMeaningfulWeatherData(data: WeatherData): boolean {
  const hourly = data.hourly || {};
  return ['temperature_2m', 'weather_code', 'precipitation_probability', 'relative_humidity_2m']
    .some((field) => Array.isArray(hourly[field]) && hourly[field].some((value) => value != null && value !== ''));
}

async function fetchJmaOfficialWeather(coord: WeatherCoord, timezone: string, targetDate?: string): Promise<WeatherFetchResult> {
  const date = targetDate || currentYmdInTimezone(timezone === 'auto' ? 'Asia/Tokyo' : timezone);
  const profile = resolveJmaLocationProfile(coord);
  if (!profile) throw new Error('No matching JMA office/station');
  const data = emptyWeatherDataForDate(date);
  const forecast = await fetchJson(`https://www.jma.go.jp/bosai/forecast/data/forecast/${profile.officeCode}.json`);
  applyJmaForecast(data, forecast, profile, date);
  try {
    await applyJmaAmedasObservation(data, profile, date, timezone === 'auto' ? 'Asia/Tokyo' : timezone);
  } catch {
    // AMeDAS is live-only. Forecast data remains useful if observations miss.
  }
  if (!hasMeaningfulWeatherData(data)) throw new Error('JMA official returned no matching weather values');
  return { data, source: 'JMA official', provider: 'JMA official', cached: false, fetchedAt: Date.now() };
}

function weatherTextToWmo(text: unknown): number | undefined {
  const value = String(text || '').toLowerCase();
  if (!value) return undefined;
  if (/thunder|storm|雷/.test(value)) return 95;
  if (/snow|sleet|雪/.test(value)) return 71;
  if (/shower|rain|drizzle|wet|雨/.test(value)) return 61;
  if (/fog|mist|haze|霧|雾/.test(value)) return 45;
  if (/overcast|cloudy|雲|云|cloud/.test(value)) return /part|fair|少/.test(value) ? 2 : 3;
  if (/sunny|clear|晴|fair/.test(value)) return 0;
  return 2;
}

function nearestByDistance<T>(items: T[], coord: WeatherCoord, latOf: (item: T) => number, lonOf: (item: T) => number): T | undefined {
  return items
    .filter((item) => Number.isFinite(latOf(item)) && Number.isFinite(lonOf(item)))
    .map((item) => ({ item, distance: distanceKm(coord.lat, coord.lon, latOf(item), lonOf(item)) }))
    .sort((a, b) => a.distance - b.distance)[0]?.item;
}

async function fetchSingaporeReading(endpoint: string, coord: WeatherCoord): Promise<number | undefined> {
  const json = await fetchJson(`https://api-open.data.gov.sg/v2/real-time/api/${endpoint}`) as {
    data?: {
      stations?: Array<{ id?: string; location?: { latitude?: number; longitude?: number } }>;
      readings?: Array<{ data?: Array<{ stationId?: string; value?: number }> }>;
    };
  };
  const stations = json.data?.stations || [];
  const nearest = nearestByDistance(stations, coord, (station) => Number(station.location?.latitude), (station) => Number(station.location?.longitude));
  const reading = json.data?.readings?.[0]?.data?.find((item) => item.stationId === nearest?.id);
  const value = Number(reading?.value);
  return Number.isFinite(value) ? value : undefined;
}

async function fetchSingaporeForecastCode(coord: WeatherCoord): Promise<number | undefined> {
  const json = await fetchJson('https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast') as {
    data?: {
      area_metadata?: Array<{ name?: string; label_location?: { latitude?: number; longitude?: number } }>;
      items?: Array<{ forecasts?: Array<{ area?: string; forecast?: string }> }>;
    };
  };
  const areas = json.data?.area_metadata || [];
  const nearest = nearestByDistance(areas, coord, (area) => Number(area.label_location?.latitude), (area) => Number(area.label_location?.longitude));
  const forecast = json.data?.items?.[0]?.forecasts?.find((item) => item.area === nearest?.name);
  return weatherTextToWmo(forecast?.forecast);
}

async function fetchSingaporeOfficialWeather(coord: WeatherCoord, timezone: string, targetDate?: string): Promise<WeatherFetchResult> {
  const safeTimezone = timezone === 'auto' ? 'Asia/Singapore' : timezone;
  const date = targetDate || currentYmdInTimezone(safeTimezone);
  if (date !== currentYmdInTimezone(safeTimezone)) throw new Error('NEA official live data is outside target date');
  const data = emptyWeatherDataForDate(date);
  const slotIndex = liveSlotIndexForDate(date, safeTimezone);
  if (slotIndex < 0) throw new Error('NEA official live slot unavailable');
  const [temp, humidity, rainMm, windSpeed, windDirection, code] = await Promise.all([
    fetchSingaporeReading('air-temperature', coord),
    fetchSingaporeReading('relative-humidity', coord),
    fetchSingaporeReading('rainfall', coord),
    fetchSingaporeReading('wind-speed', coord),
    fetchSingaporeReading('wind-direction', coord),
    fetchSingaporeForecastCode(coord),
  ]);
  setHourlyValue(data, 'temperature_2m', slotIndex, temp);
  setHourlyValue(data, 'relative_humidity_2m', slotIndex, humidity);
  setHourlyValue(data, 'precipitation', slotIndex, rainMm);
  setHourlyValue(data, 'wind_speed_10m', slotIndex, windSpeed);
  setHourlyValue(data, 'wind_direction_10m', slotIndex, windDirection);
  setHourlyValue(data, 'weather_code', slotIndex, code);
  if (!hasMeaningfulWeatherData(data)) throw new Error('NEA official returned no matching weather values');
  return { data, source: 'NEA official', provider: 'NEA official', cached: false, fetchedAt: Date.now() };
}

function fahrenheitToCelsius(value: unknown): number | undefined {
  const f = Number(value);
  if (!Number.isFinite(f)) return undefined;
  return (f - 32) * 5 / 9;
}

function parseNwsWindKmh(value: unknown): number | undefined {
  const text = String(value || '');
  const match = text.match(/(\d+(?:\.\d+)?)/);
  const mph = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(mph) ? mph * 1.60934 : undefined;
}

async function fetchNwsOfficialWeather(coord: WeatherCoord, targetDate?: string): Promise<WeatherFetchResult> {
  const points = await fetchJson(`https://api.weather.gov/points/${coord.lat.toFixed(4)},${coord.lon.toFixed(4)}`) as {
    properties?: { forecastHourly?: string; timeZone?: string };
  };
  const forecastHourly = points.properties?.forecastHourly;
  if (!forecastHourly) throw new Error('NWS official hourly forecast URL missing');
  const date = targetDate || currentYmdInTimezone(points.properties?.timeZone || 'America/New_York');
  const forecast = await fetchJson(forecastHourly) as {
    properties?: {
      periods?: Array<{
        startTime?: string;
        temperature?: number;
        temperatureUnit?: string;
        probabilityOfPrecipitation?: { value?: number };
        relativeHumidity?: { value?: number };
        windSpeed?: string;
        shortForecast?: string;
      }>;
    };
  };
  const data = emptyWeatherDataForDate(date);
  for (const period of forecast.properties?.periods || []) {
    const slot = slotIndexForIso(String(period.startTime || ''), date);
    const temp = period.temperatureUnit === 'F' ? fahrenheitToCelsius(period.temperature) : Number(period.temperature);
    setHourlyValue(data, 'temperature_2m', slot, temp);
    setHourlyValue(data, 'weather_code', slot, weatherTextToWmo(period.shortForecast));
    setHourlyValue(data, 'precipitation_probability', slot, period.probabilityOfPrecipitation?.value);
    setHourlyValue(data, 'relative_humidity_2m', slot, period.relativeHumidity?.value);
    setHourlyValue(data, 'wind_speed_10m', slot, parseNwsWindKmh(period.windSpeed));
  }
  if (!hasMeaningfulWeatherData(data)) throw new Error('NWS official returned no matching weather values');
  return { data, source: 'NWS official', provider: 'NWS official', cached: false, fetchedAt: Date.now() };
}

function localizedNumber(value: unknown): number | undefined {
  const raw = (value as { en?: unknown } | undefined)?.en ?? value;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : undefined;
}

async function fetchMscOfficialWeather(coord: WeatherCoord, timezone: string, targetDate?: string): Promise<WeatherFetchResult> {
  const safeTimezone = timezone === 'auto' ? 'America/Toronto' : timezone;
  const date = targetDate || currentYmdInTimezone(safeTimezone);
  if (date !== currentYmdInTimezone(safeTimezone)) throw new Error('MSC official current conditions are outside target date');
  const pad = 1.5;
  const bbox = [coord.lon - pad, coord.lat - pad, coord.lon + pad, coord.lat + pad].map((value) => value.toFixed(3)).join(',');
  const json = await fetchJson(`https://api.weather.gc.ca/collections/citypageweather-realtime/items?f=json&limit=50&bbox=${bbox}`) as {
    features?: Array<{
      geometry?: { coordinates?: number[] };
      properties?: {
        currentConditions?: {
          temperature?: { value?: unknown };
          humidex?: { value?: unknown };
          windChill?: { value?: unknown };
          relativeHumidity?: { value?: unknown };
          condition?: { en?: string };
          wind?: { speed?: { value?: unknown }; gust?: { value?: unknown }; bearing?: { value?: unknown } };
        };
      };
    }>;
  };
  const feature = nearestByDistance(json.features || [], coord, (item) => Number(item.geometry?.coordinates?.[1]), (item) => Number(item.geometry?.coordinates?.[0]));
  const conditions = feature?.properties?.currentConditions;
  const data = emptyWeatherDataForDate(date);
  const slotIndex = liveSlotIndexForDate(date, safeTimezone);
  if (slotIndex < 0) throw new Error('MSC official live slot unavailable');
  const temp = localizedNumber(conditions?.temperature?.value);
  const humidex = localizedNumber(conditions?.humidex?.value);
  const windChill = localizedNumber(conditions?.windChill?.value);
  setHourlyValue(data, 'temperature_2m', slotIndex, temp);
  setHourlyValue(data, 'apparent_temperature', slotIndex, humidex ?? windChill ?? temp);
  setHourlyValue(data, 'relative_humidity_2m', slotIndex, localizedNumber(conditions?.relativeHumidity?.value));
  setHourlyValue(data, 'weather_code', slotIndex, weatherTextToWmo(conditions?.condition?.en));
  setHourlyValue(data, 'wind_speed_10m', slotIndex, localizedNumber(conditions?.wind?.speed?.value));
  setHourlyValue(data, 'wind_gusts_10m', slotIndex, localizedNumber(conditions?.wind?.gust?.value));
  setHourlyValue(data, 'wind_direction_10m', slotIndex, localizedNumber(conditions?.wind?.bearing?.value));
  if (!hasMeaningfulWeatherData(data)) throw new Error('MSC official returned no matching weather values');
  return { data, source: 'MSC official', provider: 'MSC official', cached: false, fetchedAt: Date.now() };
}

function officialProviderSource(provider: OfficialWeatherProviderId): string {
  return OFFICIAL_PROVIDER_SOURCE[provider];
}

async function fetchOfficialWeather(provider: OfficialWeatherProviderId, coord: WeatherCoord, timezone: string, targetDate?: string): Promise<WeatherFetchResult> {
  if (provider === 'jma') return fetchJmaOfficialWeather(coord, timezone, targetDate);
  if (provider === 'nea-sg') return fetchSingaporeOfficialWeather(coord, timezone, targetDate);
  if (provider === 'nws-us') return fetchNwsOfficialWeather(coord, targetDate);
  if (provider === 'msc-ca') return fetchMscOfficialWeather(coord, timezone, targetDate);
  throw new Error(`Unsupported official provider: ${provider}`);
}

const MERGEABLE_WEATHER_FIELDS = [
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
];

function valueForTime(data: WeatherData, field: string, time: string): unknown {
  const times = data.hourly?.time;
  const values = data.hourly?.[field];
  if (!Array.isArray(times) || !Array.isArray(values)) return undefined;
  const idx = times.findIndex((entry) => String(entry) === time);
  return idx >= 0 ? values[idx] : undefined;
}

function mergeWeatherData(primary: WeatherData, fallback?: WeatherData): WeatherData {
  if (!fallback?.hourly) return primary;
  const times = Array.isArray(primary.hourly?.time) ? primary.hourly.time.map(String) : [];
  const merged: WeatherData = { hourly: { time: times }, current: primary.current || fallback.current };
  for (const field of MERGEABLE_WEATHER_FIELDS) {
    merged.hourly![field] = times.map((time) => {
      const primaryValue = valueForTime(primary, field, time);
      return primaryValue != null && primaryValue !== '' ? primaryValue : valueForTime(fallback, field, time);
    });
  }
  return merged;
}

function weatherDataHasGaps(data: WeatherData): boolean {
  const times = data.hourly?.time;
  if (!Array.isArray(times) || !times.length) return true;
  return ['temperature_2m', 'apparent_temperature', 'uv_index', 'cloud_cover', 'wind_gusts_10m']
    .some((field) => !Array.isArray(data.hourly?.[field]) || data.hourly?.[field].some((value) => value == null || value === ''));
}

type WeatherBrokerState = Pick<AppState, 'credentialBrokerUrl' | 'credentialSession' | 'credentialSessionExpiresAt'>;

function normalizeOfficialProvider(value: OfficialWeatherProviderId | boolean | null | undefined): OfficialWeatherProviderId | null {
  if (value === true) return 'jma';
  if (value === false || value == null) return null;
  return value;
}

export async function fetchWeather(coord: WeatherCoord, timezone = 'auto', officialProviderInput: OfficialWeatherProviderId | boolean | null = null, state?: WeatherBrokerState, targetDate?: string): Promise<WeatherFetchResult> {
  if (!Number.isFinite(coord.lat) || !Number.isFinite(coord.lon)) throw new Error(`${coord.label} 缺少 lat/lon，請喺行程 spot 加座標或用 Kimi 更新行程。`);
  const officialProvider = normalizeOfficialProvider(officialProviderInput);
  const officialSource = officialProvider ? officialProviderSource(officialProvider) : '';
  const cacheKey = weatherCacheKey(coord);
  const safeTimezone = normalizeWeatherTimezone(timezone);
  try {
    const cached = cacheKey ? JSON.parse(localStorage.getItem(cacheKey) || 'null') : null;
    const cachedSource = String(cached?.source || '');
    const officialCacheAllowed = !officialProvider || cachedSource === officialSource;
    if (cached && officialCacheAllowed && Date.now() - cached.ts < 60 * 60 * 1000 && weatherDataIncludesDate(cached.data, targetDate)) {
      return { data: cached.data as WeatherData, source: `${cached.source} cache`, provider: String(cached.source || 'Weather'), cached: true, fetchedAt: Number(cached.ts) || Date.now() };
    }
  } catch {
    // Ignore corrupt cache.
  }

  let officialResult: WeatherFetchResult | null = null;
  let officialFallbackReason = '';
  if (officialProvider) {
    try {
      officialResult = await fetchOfficialWeather(officialProvider, coord, safeTimezone, targetDate);
      if (!weatherDataHasGaps(officialResult.data)) {
        if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: officialResult.data, source: officialResult.source }));
        return officialResult;
      }
    } catch (error) {
      officialFallbackReason = `${officialSource} unavailable: ${weatherErrorLabel(error)}`;
    }
  }

  if (officialResult) {
    try {
      const fallbackResult = await fetchFallbackWeather(coord, safeTimezone, officialProvider, state, targetDate, officialFallbackReason);
      const data = mergeWeatherData(officialResult.data, fallbackResult.data);
      const reason = fallbackResult.provider
        ? `${officialResult.provider} missing some hourly fields; filled by ${fallbackResult.provider}`
        : undefined;
      if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data, source: officialResult.source }));
      return {
        data,
        source: officialResult.source,
        provider: officialResult.provider,
        cached: false,
        fetchedAt: Date.now(),
        fallbackReason: reason,
      };
    } catch (error) {
      if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: officialResult.data, source: officialResult.source }));
      return {
        ...officialResult,
        fallbackReason: `${officialResult.provider} served; fallback supplement unavailable: ${weatherErrorLabel(error)}`,
      };
    }
  }
  const fallbackResult = await fetchFallbackWeather(coord, safeTimezone, officialProvider, state, targetDate, officialFallbackReason);
  if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: fallbackResult.data, source: fallbackResult.source }));
  return fallbackResult;
}

async function fetchFallbackWeather(coord: WeatherCoord, safeTimezone: string, officialProvider: OfficialWeatherProviderId | null, state?: WeatherBrokerState, targetDate?: string, priorReason = ''): Promise<WeatherFetchResult> {
  let brokerFallbackReason = '';
  if (state) {
    try {
      const data = await brokerWeatherForecast(state, { lat: coord.lat, lon: coord.lon, days: 3 });
      if (data && typeof data === 'object') {
        if (!targetDate || weatherDataIncludesDate(data, targetDate)) {
          return { data: data as WeatherData, source: 'WeatherAPI.com', provider: 'WeatherAPI.com', cached: false, fetchedAt: Date.now(), fallbackReason: priorReason || undefined };
        }
        brokerFallbackReason = `WeatherAPI.com has no ${targetDate} forecast; using public fallback`;
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
    ...(officialProvider === 'jma' ? [{ url: `${base}&models=jma_seamless`, source: 'JMA' }] : []),
    { url: base, source: 'Open-Meteo' },
  ];
  let lastError: unknown;
  let providerFallbackReason = [priorReason, brokerFallbackReason].filter(Boolean).join(' · ');
  for (const c of candidates) {
    try {
      const data = await fetchJson(c.url) as WeatherData;
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
