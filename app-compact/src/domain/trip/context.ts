import type { TripIntelligence, TripThemeKey } from '../../lib/types';

export const TRIP_INTELLIGENCE_SCHEMA_VERSION = 1;

export const TRIP_THEME_KEYS: TripThemeKey[] = [
  'japan_washi',
  'korea_editorial',
  'taiwan_nightmarket',
  'europe_rail',
  'global_journal',
];

type DestinationContext = Pick<TripIntelligence, 'countryCode' | 'countryName' | 'primaryCurrency' | 'themeKey' | 'locale'> & {
  timezone: string;
  weatherRegion: string;
  pattern: RegExp;
};

const DESTINATION_CONTEXTS: DestinationContext[] = [
  {
    countryCode: 'JP',
    countryName: 'Japan',
    primaryCurrency: 'JPY',
    themeKey: 'japan_washi',
    locale: 'ja-JP',
    timezone: 'Asia/Tokyo',
    weatherRegion: 'Japan',
    pattern: /日本|東京|东京|大阪|名古屋|京都|札幌|沖繩|冲绳|japan|tokyo|osaka|nagoya|kyoto|sapporo|okinawa|jpy/i,
  },
  {
    countryCode: 'KR',
    countryName: 'Korea',
    primaryCurrency: 'KRW',
    themeKey: 'korea_editorial',
    locale: 'ko-KR',
    timezone: 'Asia/Seoul',
    weatherRegion: 'South Korea',
    pattern: /韓國|韩国|首爾|首尔|釜山|濟州|济州|korea|seoul|busan|jeju|krw/i,
  },
  {
    countryCode: 'TW',
    countryName: 'Taiwan',
    primaryCurrency: 'TWD',
    themeKey: 'taiwan_nightmarket',
    locale: 'zh-TW',
    timezone: 'Asia/Taipei',
    weatherRegion: 'Taiwan',
    pattern: /台灣|台湾|台北|台中|台南|高雄|taiwan|taipei|taichung|tainan|kaohsiung|twd/i,
  },
  {
    countryCode: 'GB',
    countryName: 'United Kingdom',
    primaryCurrency: 'GBP',
    themeKey: 'europe_rail',
    locale: 'en-GB',
    timezone: 'Europe/London',
    weatherRegion: 'United Kingdom',
    pattern: /英國|英国|倫敦|伦敦|\buk\b|london|gbp/i,
  },
  {
    countryCode: 'EU',
    countryName: 'Europe',
    primaryCurrency: 'EUR',
    themeKey: 'europe_rail',
    locale: 'en-GB',
    timezone: 'Europe/Paris',
    weatherRegion: 'Europe',
    pattern: /歐洲|欧洲|歐元|法国|法國|巴黎|德國|德国|意大利|italy|france|paris|germany|europe|eur/i,
  },
  {
    countryCode: 'HK',
    countryName: 'Hong Kong',
    primaryCurrency: 'HKD',
    themeKey: 'global_journal',
    locale: 'zh-HK',
    timezone: 'Asia/Hong_Kong',
    weatherRegion: 'Hong Kong',
    pattern: /香港|hong\s*kong|\bhk\b|hkd/i,
  },
  {
    countryCode: 'CN',
    countryName: 'China',
    primaryCurrency: 'CNY',
    themeKey: 'global_journal',
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai',
    weatherRegion: 'China',
    pattern: /中國|中国|上海|北京|深圳|廣州|广州|china|shanghai|beijing|shenzhen|guangzhou|cny/i,
  },
  {
    countryCode: 'SG',
    countryName: 'Singapore',
    primaryCurrency: 'SGD',
    themeKey: 'global_journal',
    locale: 'en-SG',
    timezone: 'Asia/Singapore',
    weatherRegion: 'Singapore',
    pattern: /新加坡|singapore|sgd/i,
  },
  {
    countryCode: 'TH',
    countryName: 'Thailand',
    primaryCurrency: 'THB',
    themeKey: 'global_journal',
    locale: 'th-TH',
    timezone: 'Asia/Bangkok',
    weatherRegion: 'Thailand',
    pattern: /泰國|泰国|曼谷|清邁|清迈|thailand|bangkok|chiang\s*mai|thb/i,
  },
  {
    countryCode: 'MY',
    countryName: 'Malaysia',
    primaryCurrency: 'MYR',
    themeKey: 'global_journal',
    locale: 'ms-MY',
    timezone: 'Asia/Kuala_Lumpur',
    weatherRegion: 'Malaysia',
    pattern: /馬來西亞|马来西亚|吉隆坡|malaysia|kuala\s*lumpur|myr/i,
  },
  {
    countryCode: 'VN',
    countryName: 'Vietnam',
    primaryCurrency: 'VND',
    themeKey: 'global_journal',
    locale: 'vi-VN',
    timezone: 'Asia/Ho_Chi_Minh',
    weatherRegion: 'Vietnam',
    pattern: /越南|河內|河内|胡志明|vietnam|hanoi|ho\s*chi\s*minh|vnd/i,
  },
  {
    countryCode: 'PH',
    countryName: 'Philippines',
    primaryCurrency: 'PHP',
    themeKey: 'global_journal',
    locale: 'en-PH',
    timezone: 'Asia/Manila',
    weatherRegion: 'Philippines',
    pattern: /菲律賓|菲律宾|馬尼拉|马尼拉|philippines|manila|php/i,
  },
  {
    countryCode: 'AU',
    countryName: 'Australia',
    primaryCurrency: 'AUD',
    themeKey: 'global_journal',
    locale: 'en-AU',
    timezone: 'Australia/Sydney',
    weatherRegion: 'Australia',
    pattern: /澳洲|悉尼|雪梨|墨爾本|墨尔本|australia|sydney|melbourne|aud/i,
  },
  {
    countryCode: 'NZ',
    countryName: 'New Zealand',
    primaryCurrency: 'NZD',
    themeKey: 'global_journal',
    locale: 'en-NZ',
    timezone: 'Pacific/Auckland',
    weatherRegion: 'New Zealand',
    pattern: /紐西蘭|新西蘭|奧克蘭|奥克兰|new\s*zealand|auckland|nzd/i,
  },
  {
    countryCode: 'US',
    countryName: 'United States',
    primaryCurrency: 'USD',
    themeKey: 'global_journal',
    locale: 'en-US',
    timezone: 'America/New_York',
    weatherRegion: 'United States',
    pattern: /美國|美国|紐約|纽约|洛杉磯|洛杉矶|usa|america|new\s*york|los\s*angeles|usd/i,
  },
];

export function normalizeZone(value?: unknown): string {
  const zone = String(value || '').trim();
  if (zone === 'JST') return 'Asia/Tokyo';
  if (zone === 'HKT') return 'Asia/Hong_Kong';
  if (zone === 'KST') return 'Asia/Seoul';
  if (zone === 'CST') return 'Asia/Shanghai';
  return zone;
}

function validThemeKey(value: unknown): TripThemeKey | undefined {
  const key = String(value || '').trim();
  return TRIP_THEME_KEYS.includes(key as TripThemeKey) ? key as TripThemeKey : undefined;
}

function validTripStyle(value: unknown): TripIntelligence['tripStyle'] | undefined {
  const key = String(value || '').trim();
  return ['balanced', 'food', 'shopping', 'culture', 'nature', 'family', 'business'].includes(key)
    ? key as TripIntelligence['tripStyle']
    : undefined;
}

function validWeatherPreference(value: unknown): TripIntelligence['weatherPreference'] | undefined {
  const key = String(value || '').trim();
  return ['balanced', 'rain', 'heat', 'cold', 'wind', 'uv'].includes(key)
    ? key as TripIntelligence['weatherPreference']
    : undefined;
}

export function resolveTripContext(destination = '', currency = 'JPY', countryCode = ''): Omit<DestinationContext, 'pattern'> {
  const haystack = `${destination} ${currency} ${countryCode}`.toLowerCase();
  const code = String(countryCode || '').trim().toUpperCase();
  const matched = DESTINATION_CONTEXTS.find((ctx) => ctx.countryCode === code)
    || DESTINATION_CONTEXTS.find((ctx) => ctx.pattern.test(haystack));
  if (matched) {
    const { pattern: _pattern, ...context } = matched;
    return context;
  }
  return {
    countryCode: code || 'GLOBAL',
    countryName: code || 'Global',
    primaryCurrency: String(currency || 'JPY').toUpperCase(),
    themeKey: 'global_journal',
    locale: 'zh-HK',
    timezone: 'Asia/Hong_Kong',
    weatherRegion: destination || 'Global',
  };
}

export function timezoneForDestination(destination = '', fallback = 'Asia/Tokyo'): string {
  return resolveTripContext(destination).timezone || normalizeZone(fallback) || 'Asia/Tokyo';
}

export function normalizeTripIntelligence(
  input: unknown,
  destinationSummary = '',
  currency = 'JPY',
  timezone = timezoneForDestination(destinationSummary),
): TripIntelligence {
  const raw = input && typeof input === 'object' ? input as Partial<TripIntelligence> : {};
  const aliases = raw as Partial<TripIntelligence> & Record<string, unknown>;
  const rawCountryCode = String(raw.countryCode || aliases.country_code || '').toUpperCase();
  const rawCurrency = String(raw.primaryCurrency || aliases.primary_currency || currency || '').toUpperCase();
  const inferred = resolveTripContext(destinationSummary, rawCurrency, rawCountryCode);
  const primaryCurrency = String(raw.primaryCurrency || aliases.primary_currency || inferred.primaryCurrency || currency || 'JPY').toUpperCase();
  const refined = resolveTripContext(destinationSummary, primaryCurrency, rawCountryCode || inferred.countryCode);
  const themeKey = validThemeKey(raw.themeKey || aliases.theme_key) || refined.themeKey;
  return {
    countryCode: String(raw.countryCode || aliases.country_code || refined.countryCode).toUpperCase(),
    countryName: String(raw.countryName || aliases.country_name || refined.countryName || ''),
    primaryCurrency,
    themeKey,
    locale: String(raw.locale || refined.locale || 'zh-HK'),
    timezone: normalizeZone(raw.timezone || timezone || refined.timezone) || refined.timezone,
    weatherRegion: String(raw.weatherRegion || aliases.weather_region || refined.weatherRegion || destinationSummary || refined.countryName || ''),
    tripStyle: validTripStyle(raw.tripStyle || aliases.trip_style) || 'balanced',
    homeCity: String(raw.homeCity || aliases.home_city || '').trim(),
    weatherPreference: validWeatherPreference(raw.weatherPreference || aliases.weather_preference) || 'balanced',
    confidence: raw.confidence === 'high' || raw.confidence === 'medium' || raw.confidence === 'low' ? raw.confidence : 'medium',
    source: raw.source === 'ai' || raw.source === 'manual' || raw.source === 'heuristic' ? raw.source : 'heuristic',
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

export function tripIntelligenceColumns(intelligence: TripIntelligence) {
  return {
    country_code: intelligence.countryCode || null,
    theme_key: intelligence.themeKey || null,
    locale: intelligence.locale || null,
    weather_region: intelligence.weatherRegion || null,
    trip_intelligence: {
      schemaVersion: TRIP_INTELLIGENCE_SCHEMA_VERSION,
      ...intelligence,
    },
  };
}

export function tripIntelligencePromptContract(): string {
  return [
    'Return strict JSON only.',
    'Use a four-stage itinerary workflow: (1) read and understand the full user text, (2) reorganize it into your own clean canonical itinerary, (3) extract app data only from that canonical itinerary, and (4) use the extracted data as the trip backbone.',
    'The JSON response must include organizedItinerary as a concise human-readable canonical itinerary written by the model before the structured trip object.',
    'Trip intelligence must include countryCode, countryName, primaryCurrency, themeKey, locale, timezone, weatherRegion, confidence.',
    'Supported countryCode values include JP, KR, TW, GB, EU, HK, CN, SG, TH, MY, VN, PH, AU, NZ, US, GLOBAL.',
    `themeKey must be one of: ${TRIP_THEME_KEYS.join(', ')}.`,
    'Use country/day itinerary context to set currency and weather location. Do not invent secrets or API keys.',
    'Accept messy travel text: Markdown headings, pipe tables, pasted HTML <br> line breaks, Chinese dates like 6月13日, English dates like Jun 13, 2026, and plain timetable rows.',
    'For pipe tables, treat columns such as time/category/place/action as itinerary rows; extract each row as a spot, not as prose.',
    'For each Day section, extract the day number, date, lodging/hotel line, every timed activity, transport, flight, restaurant, shop, attraction, note, and optional/skip condition when present.',
    'Never copy the current itinerary as a successful extraction unless the user text explicitly contains those same days/spots.',
    'For every extracted place, include city, country, timezone, address/mapUrl when present, and lat/lon only when reasonably inferable; otherwise omit lat/lon and add a warning.',
    'Mark uncertain fields with confidence low and list assumptions/missingCriticalFields in extractionReport.',
  ].join(' ');
}
