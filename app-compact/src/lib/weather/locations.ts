import type { ItineraryDay } from '../types';
import { countryHintFor, GEO_DICTIONARY, geoDistanceKm } from '../geo';
import { weatherRequest } from './http';
import { weatherNumber, weatherTimezone, type WeatherCoord } from './types';

const COUNTRY_ALIASES: Record<string, string[]> = {
  JP: ['Japan', '日本', 'JPN'], HK: ['Hong Kong', '香港', 'Hong Kong SAR'],
  KR: ['South Korea', 'Korea', 'Republic of Korea', '韓國', '韩国'],
  TW: ['Taiwan', '台灣', '臺灣', '台湾'], SG: ['Singapore', '新加坡', '星加坡'],
  US: ['United States', 'United States of America', 'USA', 'U.S.', '美國', '美国'],
  CA: ['Canada', '加拿大'], GB: ['United Kingdom', 'UK', 'England', 'Scotland', 'Wales', '英國', '英国'],
  NO: ['Norway', '挪威'], SE: ['Sweden', '瑞典'], FI: ['Finland', '芬蘭'], DK: ['Denmark', '丹麥'],
  IS: ['Iceland', '冰島'], DE: ['Germany', '德國', '德国'], FR: ['France', '法國', '法国'],
  AU: ['Australia', '澳洲', '澳大利亞'], NZ: ['New Zealand', '紐西蘭'],
  CN: ['China', '中國', '中国'], TH: ['Thailand', '泰國'], MY: ['Malaysia', '馬來西亞'],
  VN: ['Vietnam', '越南'], PH: ['Philippines', '菲律賓'], IT: ['Italy', '意大利', '義大利'],
  ES: ['Spain', '西班牙'], PT: ['Portugal', '葡萄牙'], NL: ['Netherlands', '荷蘭'],
  CH: ['Switzerland', '瑞士'], AT: ['Austria', '奧地利'], BE: ['Belgium', '比利時'],
};

export function weatherCountryCode(value?: string): string | undefined {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return undefined;
  if (/^[a-z]{2}$/.test(text)) return text === 'uk' ? 'GB' : text.toUpperCase();
  return Object.entries(COUNTRY_ALIASES).find(([, names]) => names.some((name) => name.toLowerCase() === text))?.[0];
}

const ZONE_COUNTRY: Record<string, string> = {
  'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Hong_Kong': 'HK', 'Asia/Taipei': 'TW',
  'Asia/Singapore': 'SG', 'Europe/London': 'GB', 'Europe/Oslo': 'NO',
};

type KnownPlace = WeatherCoord & { aliases: string[] };
const PLACES: KnownPlace[] = [
  { label: '名古屋', lat: 35.1815, lon: 136.9066, countryCode: 'JP', timezone: 'Asia/Tokyo', aliases: ['名古屋', 'Nagoya'] },
  { label: '白川鄉', lat: 36.2583, lon: 136.9063, countryCode: 'JP', timezone: 'Asia/Tokyo', aliases: ['白川', 'Shirakawa'] },
  { label: '高山', lat: 36.1429, lon: 137.2538, countryCode: 'JP', timezone: 'Asia/Tokyo', aliases: ['高山', 'Takayama'] },
  { label: '立山黑部', lat: 36.5776, lon: 137.6064, countryCode: 'JP', timezone: 'Asia/Tokyo', aliases: ['立山', 'Tateyama'] },
  { label: '上高地', lat: 36.2497, lon: 137.6343, countryCode: 'JP', timezone: 'Asia/Tokyo', aliases: ['上高地', 'Kamikochi'] },
  { label: '金澤', lat: 36.5613, lon: 136.6562, countryCode: 'JP', timezone: 'Asia/Tokyo', aliases: ['金澤', '金沢', 'Kanazawa'] },
  { label: '長野', lat: 36.6485, lon: 138.1943, countryCode: 'JP', timezone: 'Asia/Tokyo', aliases: ['長野', 'Nagano'] },
  { label: '常滑', lat: 34.8871, lon: 136.8356, countryCode: 'JP', timezone: 'Asia/Tokyo', aliases: ['常滑', 'Tokoname', '中部國際', '中部国際', 'Centrair'] },
  { label: '東京', lat: 35.6762, lon: 139.6503, countryCode: 'JP', timezone: 'Asia/Tokyo', aliases: ['東京', 'Tokyo'] },
  { label: '京都', lat: 35.0116, lon: 135.7681, countryCode: 'JP', timezone: 'Asia/Tokyo', aliases: ['京都', 'Kyoto'] },
  { label: '大阪', lat: 34.6937, lon: 135.5023, countryCode: 'JP', timezone: 'Asia/Tokyo', aliases: ['大阪', 'Osaka'] },
  { label: '札幌', lat: 43.0618, lon: 141.3545, countryCode: 'JP', timezone: 'Asia/Tokyo', aliases: ['札幌', 'Sapporo'] },
  { label: '福岡', lat: 33.5902, lon: 130.4017, countryCode: 'JP', timezone: 'Asia/Tokyo', aliases: ['福岡', 'Fukuoka'] },
  { label: '那霸', lat: 26.2124, lon: 127.6809, countryCode: 'JP', timezone: 'Asia/Tokyo', aliases: ['那霸', '那覇', 'Naha'] },
  { label: '首爾', lat: 37.5665, lon: 126.978, countryCode: 'KR', timezone: 'Asia/Seoul', aliases: ['首爾', 'Seoul'] },
  { label: '濟州', lat: 33.5097, lon: 126.522, countryCode: 'KR', timezone: 'Asia/Seoul', aliases: ['濟州', 'Jeju'] },
  { label: '西歸浦', lat: 33.2541, lon: 126.56, countryCode: 'KR', timezone: 'Asia/Seoul', aliases: ['西歸浦', 'Seogwipo'] },
  { label: '台北', lat: 25.033, lon: 121.5654, countryCode: 'TW', timezone: 'Asia/Taipei', aliases: ['台北', '臺北', 'Taipei'] },
  { label: '香港', lat: 22.302, lon: 114.1743, countryCode: 'HK', timezone: 'Asia/Hong_Kong', aliases: ['香港', 'Hong Kong'] },
  { label: '新加坡', lat: 1.292, lon: 103.844, countryCode: 'SG', timezone: 'Asia/Singapore', aliases: ['新加坡', 'Singapore'] },
];

export function validWeatherCoord(coord: Pick<WeatherCoord, 'lat' | 'lon'>): boolean {
  return typeof coord.lat === 'number' && typeof coord.lon === 'number'
    && Number.isFinite(coord.lat) && Math.abs(coord.lat) <= 90
    && Number.isFinite(coord.lon) && Math.abs(coord.lon) <= 180;
}

export function weatherLocationKey(coord: WeatherCoord): string {
  return `${coord.countryCode || ''}:${coord.lat}:${coord.lon}:${coord.timezone || ''}`;
}

function nearestKnown(coord: WeatherCoord): KnownPlace | undefined {
  return PLACES.filter((place) => (!coord.countryCode || place.countryCode === coord.countryCode) && geoDistanceKm(place, coord) < 25)
    .sort((a, b) => geoDistanceKm(a, coord) - geoDistanceKm(b, coord))[0];
}

export function coordsForDay(day: ItineraryDay, limit = Infinity): WeatherCoord[] {
  const countryCode = weatherCountryCode(day.country) || (!day.country ? ZONE_COUNTRY[day.timezone || ''] : undefined);
  const coords: WeatherCoord[] = [];
  const add = (coord: WeatherCoord) => {
    const existing = coords.find((other) => other.countryCode === coord.countryCode && geoDistanceKm(other, coord) < 12);
    if (existing) {
      existing.spotNames = [...new Set([...(existing.spotNames || []), ...(coord.spotNames || [])])];
    } else coords.push(coord);
  };
  for (const spot of day.spots || []) {
    if (spot.lat == null || spot.lon == null || !validWeatherCoord({ lat: spot.lat, lon: spot.lon })) continue;
    const coord: WeatherCoord = { label: spot.name, lat: spot.lat, lon: spot.lon, countryCode, timezone: spot.timezone || day.timezone, origin: 'spot-coordinate', spotNames: [spot.name] };
    const known = nearestKnown(coord);
    // Keep the real coordinate. Snapping mountain/coastal spots to a city gives misleading weather.
    add({ ...coord, label: known?.label || spot.name, countryCode: countryCode || known?.countryCode, timezone: known?.timezone || coord.timezone });
  }
  const hay = [day.city, day.region, ...(day.spots || []).map((spot) => `${spot.name} ${spot.address || ''}`)].filter(Boolean).join(' ').toLowerCase();
  for (const place of PLACES) {
    if (countryCode && place.countryCode !== countryCode) continue;
    if (!place.aliases.some((alias) => hay.includes(alias.toLowerCase()))) continue;
    if (coords.some((coord) => geoDistanceKm(coord, place) < 25)) continue;
    add({ label: place.label, lat: place.lat, lon: place.lon, timezone: place.timezone, countryCode: place.countryCode, origin: 'known-region' });
  }
  if (!coords.length) {
    const hint = countryHintFor(day);
    for (const entry of GEO_DICTIONARY) {
      if (hint && entry.geo.country !== hint) continue;
      if (entry.pattern.test(hay)) add({ ...entry.geo, label: entry.geo.city, countryCode: weatherCountryCode(entry.geo.country), timezone: day.timezone, origin: 'known-region' });
    }
  }
  return coords.length ? coords.slice(0, limit) : [{ label: day.city || day.region || day.country || '未設定地點', lat: NaN, lon: NaN, countryCode, timezone: day.timezone, missing: true, origin: 'missing' }];
}

export async function resolveCoordsForDay(day: ItineraryDay, limit = Infinity): Promise<WeatherCoord[]> {
  const coords = coordsForDay(day, limit);
  if (coords.some((coord) => !coord.missing)) return coords;
  const countryCode = weatherCountryCode(day.country);
  const queries = [...new Set([day.city, day.region].map((value) => String(value || '').trim()).filter(Boolean))];
  for (const query of queries) {
    const params = new URLSearchParams({ name: query, count: '10', language: 'en', format: 'json' });
    if (countryCode) params.set('countryCode', countryCode);
    const json = await weatherRequest<{ results?: Array<{ name?: string; latitude?: number; longitude?: number; timezone?: string; country_code?: string; country?: string }> }>(
      `https://geocoding-api.open-meteo.com/v1/search?${params}`, { ttl: 24 * 60 * 60_000 },
    );
    const results = Array.isArray(json?.results) ? json.results : [];
    const scoped = results.filter((result) => {
      if (weatherNumber(result.latitude, -90, 90) == null || weatherNumber(result.longitude, -180, 180) == null) return false;
      if (countryCode) return result.country_code?.toUpperCase() === countryCode;
      if (day.country) return !!result.country && result.country.toLowerCase() === day.country.trim().toLowerCase();
      return true;
    });
    // A city query names one destination, not every homonymous city in the response.
    if (scoped[0]) {
      const result = scoped[0];
      return [{ label: result.name || query, lat: Number(result.latitude), lon: Number(result.longitude), countryCode: result.country_code?.toUpperCase(), timezone: weatherTimezone(result.timezone), origin: 'city-geocode', query }];
    }
  }
  return coords;
}

export function uniqueWeatherLocations(days: ItineraryDay[]): WeatherCoord[] {
  const found = new Map<string, WeatherCoord>();
  for (const day of days) for (const coord of coordsForDay(day)) {
    const key = coord.missing ? `missing:${coord.countryCode}:${coord.label}` : weatherLocationKey(coord);
    if (!found.has(key)) found.set(key, coord);
  }
  return [...found.values()];
}
