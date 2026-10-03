export interface WeatherCoord {
  label: string;
  lat: number;
  lon: number;
  timezone?: string;
  countryCode?: string;
  missing?: boolean;
  origin?: 'spot-coordinate' | 'known-region' | 'city-geocode' | 'device-location' | 'missing';
  accuracyMeters?: number;
  query?: string;
  spotNames?: string[];
}

export interface WeatherReading {
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

export interface WeatherSource {
  name: string;
  url: string;
  official: boolean;
  issuedAt?: string;
}

export interface WeatherHour extends WeatherReading {
  /** Wall-clock time at the destination. Never the device's timezone. */
  time: string;
}

export interface WeatherObservation extends WeatherReading {
  observedAt: string;
  station: string;
  source: WeatherSource;
}

export interface WeatherDay {
  date: string;
  min?: number;
  max?: number;
  code?: number;
  text?: string;
  wind?: string;
  /** HKO's categorical probability of significant rain, not hourly rain %. */
  significantRain?: string;
  source: WeatherSource;
}

export interface WeatherBulletin {
  observation?: WeatherObservation;
  daily?: WeatherDay;
  hourly: WeatherHour[];
  hourlySource?: WeatherSource;
  timezone?: string;
  notices: string[];
}

export interface WeatherReport extends WeatherBulletin {
  coord: WeatherCoord;
  date: string;
  timezone: string;
  fetchedAt: number;
  cached: boolean;
  stale: boolean;
}

/** Missing/null/empty readings are unknown, never zero. */
export function weatherNumber(value: unknown, min = -Infinity, max = Infinity): number | undefined {
  if ((typeof value !== 'number' && typeof value !== 'string') || value === '' || (typeof value === 'string' && !value.trim())) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}

export function weatherTimezone(zone?: string): string {
  const aliases: Record<string, string> = { JST: 'Asia/Tokyo', HKT: 'Asia/Hong_Kong', KST: 'Asia/Seoul', SGT: 'Asia/Singapore', UTC: 'UTC' };
  const candidate = aliases[zone || ''] || zone || '';
  try {
    if (candidate) new Intl.DateTimeFormat('en', { timeZone: candidate }).format(0);
    return candidate || 'UTC';
  } catch { return 'UTC'; }
}

export function weatherLocalTime(at: string | number, timezone: string): string {
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: weatherTimezone(timezone), year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const p = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}`;
}

export function weatherLabel(code?: number): string {
  if (code == null) return '未有天氣狀況';
  if (code === 0) return '天晴';
  if (code === 1) return '大致天晴';
  if (code === 2) return '局部多雲';
  if (code === 3) return '多雲';
  if ([45, 48].includes(code)) return '有霧';
  if (code >= 51 && code <= 57) return '毛毛雨';
  if (code >= 61 && code <= 67) return '有雨';
  if (code >= 80 && code <= 82) return '驟雨';
  if (code >= 71 && code <= 86) return '降雪';
  if (code >= 95 && code <= 99) return '雷雨';
  return '未有天氣狀況';
}

export function weatherCodeFromText(text: unknown): number | undefined {
  if (typeof text !== 'string' || !text.trim()) return undefined;
  if (/thunder|雷/i.test(text)) return 95;
  if (/snow|sleet|雪/i.test(text)) return 71;
  if (/shower|rain|drizzle|雨/i.test(text)) return 61;
  if (/fog|mist|haze|霧|雾/i.test(text)) return 45;
  if (/partly|mix of|few clouds|晴れ.*くもり/i.test(text)) return 2;
  if (/cloud|overcast|雲|云|くもり/i.test(text)) return 3;
  if (/sun|clear|fair|晴/i.test(text)) return 0;
  return undefined;
}
