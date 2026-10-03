import { geoDistanceKm } from '../geo';
import { weatherRequest } from './http';
import { weatherCodeFromText, weatherLocalTime, weatherNumber as number, weatherTimezone, type WeatherBulletin, type WeatherCoord, type WeatherDay, type WeatherHour, type WeatherSource } from './types';

export const OFFICIAL_WEATHER_SERVICES: Record<string, { name: string; url: string; direct?: boolean; note?: string }> = {
  HK: { name: '香港天文台 HKO', url: 'https://www.hko.gov.hk/tc/', direct: true },
  JP: { name: '日本氣象廳 JMA', url: 'https://www.jma.go.jp/bosai/forecast/', direct: true },
  SG: { name: '新加坡 NEA / MSS', url: 'https://www.weather.gov.sg/', direct: true },
  US: { name: '美國 NWS', url: 'https://www.weather.gov/', direct: true },
  CA: { name: '加拿大 ECCC / MSC', url: 'https://weather.gc.ca/', direct: true },
  TW: { name: '中央氣象署 CWA', url: 'https://www.cwa.gov.tw/', note: 'CWA API 需要伺服器授權碼；目前未連接。' },
  KR: { name: '韓國氣象廳 KMA', url: 'https://www.weather.go.kr/', note: 'KMA 直連需要伺服器授權碼；逐時資料使用經 Open-Meteo 提供的模型。' },
  GB: { name: '英國 Met Office', url: 'https://weather.metoffice.gov.uk/', note: '未連接 Met Office 授權 API；逐時資料使用經 Open-Meteo 提供的模型。' },
  NO: { name: '挪威 MET Norway', url: 'https://www.met.no/', note: 'MET Norway 直連需配置正式快取代理；目前使用 Open-Meteo。' },
  DE: { name: '德國 DWD', url: 'https://www.dwd.de/', note: 'DWD 模型由 Open-Meteo 提供，並非官方警報。' },
  FR: { name: '法國 Météo-France', url: 'https://meteofrance.com/', note: 'Météo-France 模型由 Open-Meteo 提供，並非官方警報。' },
  AU: { name: '澳洲 BOM', url: 'https://www.bom.gov.au/', note: '未連接 BOM 官方預報 API；目前使用 Open-Meteo。' },
};

function source(country: string, issuedAt?: string): WeatherSource {
  const service = OFFICIAL_WEATHER_SERVICES[country];
  return { name: service.name, url: service.url, official: true, issuedAt };
}

function hkoCode(icon: unknown): number | undefined {
  const code = number(icon);
  if (code == null) return undefined;
  if ([50, 70, 71, 72, 73, 74, 75, 76, 77, 90, 91].includes(code)) return 0;
  if (code === 51) return 1;
  if (code === 52) return 2;
  if ([53, 54, 62, 63, 64].includes(code)) return 61;
  if (code === 65) return 95;
  if ([83, 84, 85].includes(code)) return 45;
  if ([60, 61, 80, 81, 82, 92, 93].includes(code)) return 3;
  return undefined;
}

type HkoDaily = { forecastDate?: string; forecastMaxtemp?: { value?: unknown }; forecastMintemp?: { value?: unknown }; ForecastIcon?: unknown; forecastWeather?: string; forecastWind?: string; PSR?: string };
type HkoCurrent = { updateTime?: string; temperature?: { recordTime?: string; data?: Array<{ place?: string; value?: unknown }> }; humidity?: { data?: Array<{ place?: string; value?: unknown }> }; icon?: unknown[] };

async function hko(date: string, force: boolean): Promise<WeatherBulletin> {
  const [forecast, current] = await Promise.allSettled([
    weatherRequest<{ updateTime?: string; weatherForecast?: HkoDaily[] }>('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=fnd&lang=tc', { force }),
    weatherRequest<HkoCurrent>('https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc', { force }),
  ]);
  const result: WeatherBulletin = { hourly: [], notices: [], timezone: 'Asia/Hong_Kong' };
  if (forecast.status === 'fulfilled') {
    const day = forecast.value.weatherForecast?.find((day) => day.forecastDate === date.replace(/-/g, ''));
    if (day) result.daily = {
      date, min: number(day.forecastMintemp?.value, -90, 60), max: number(day.forecastMaxtemp?.value, -90, 60),
      code: hkoCode(day.ForecastIcon), text: day.forecastWeather, wind: day.forecastWind,
      significantRain: day.PSR, source: source('HK', forecast.value.updateTime),
    };
  }
  if (current.status === 'fulfilled') {
    const report = current.value;
    const station = report.temperature?.data?.find((item) => /^(香港天文台|Hong Kong Observatory)$/.test(item.place || ''));
    const at = report.temperature?.recordTime || report.updateTime;
    if (station && at && weatherLocalTime(at, 'Asia/Hong_Kong').startsWith(date)) result.observation = {
      temp: number(station.value, -90, 60), code: hkoCode(report.icon?.[0]),
      humidity: number(report.humidity?.data?.find((item) => /^(香港天文台|Hong Kong Observatory)$/.test(item.place || ''))?.value, 0, 100),
      observedAt: at, station: station.place || '香港天文台', source: source('HK', report.updateTime),
    };
  }
  if (!result.daily && !result.observation) throw new Error('天文台未有此日期的預報或觀測');
  result.notices.push('天文台提供全港每日預報；觀測數值來自標示的測站。逐時預報另列來源。');
  return result;
}

// Explicit forecast regions, not an unbounded nearest-city guess. Outside these
// areas JMA's nearest AMeDAS station is still available; daily forecast stays absent.
const JMA_REGIONS = [
  { lat: 35.18, lon: 136.91, office: '230000', area: '230010', station: '51106', radius: 40 },
  { lat: 36.14, lon: 137.25, office: '210000', area: '210020', station: '52146', radius: 25 },
  { lat: 36.26, lon: 136.91, office: '210000', area: '210020', station: '52146', radius: 15 },
  { lat: 36.65, lon: 138.19, office: '200000', area: '200010', station: '48156', radius: 25 },
  { lat: 36.56, lon: 136.66, office: '170000', area: '170010', station: '56227', radius: 25 },
  { lat: 36.58, lon: 137.61, office: '160000', area: '160010', station: '55102', radius: 20 },
  { lat: 36.25, lon: 137.63, office: '200000', area: '200020', station: '48256', radius: 15 },
  { lat: 35.68, lon: 139.65, office: '130000', area: '130010', station: '44132', radius: 30 },
  { lat: 35.01, lon: 135.77, office: '260000', area: '260010', station: '61286', radius: 18 },
  { lat: 34.69, lon: 135.50, office: '270000', area: '270000', station: '62078', radius: 20 },
  { lat: 43.06, lon: 141.35, office: '016000', area: '016010', station: '14163', radius: 30 },
  { lat: 33.59, lon: 130.40, office: '400000', area: '400010', station: '82182', radius: 20 },
  { lat: 26.21, lon: 127.68, office: '471000', area: '471010', station: '91197', radius: 20 },
];
type JmaArea = { area?: { code?: string; name?: string }; weatherCodes?: string[]; weathers?: string[]; winds?: string[]; temps?: string[]; tempsMin?: string[]; tempsMax?: string[] };
type JmaForecast = Array<{ reportDatetime?: string; timeSeries?: Array<{ timeDefines?: string[]; areas?: JmaArea[] }> }>;
type AmedasStation = { lat?: number[]; lon?: number[]; kjName?: string; elems?: string };

function amedasNumber(record: Record<string, unknown>, key: string): number | undefined {
  const reading = record[key];
  if (!Array.isArray(reading) || reading[1] !== 0) return undefined;
  return number(reading[0]);
}

async function jma(coord: WeatherCoord, date: string, force: boolean): Promise<WeatherBulletin> {
  const result: WeatherBulletin = { hourly: [], notices: [], timezone: 'Asia/Tokyo' };
  const region = JMA_REGIONS.filter((area) => geoDistanceKm(area, coord) <= area.radius)
    .sort((a, b) => geoDistanceKm(a, coord) - geoDistanceKm(b, coord))[0];
  const today = weatherLocalTime(Date.now(), 'Asia/Tokyo').slice(0, 10);
  await Promise.allSettled([
    (async () => {
      if (!region) return;
      const forecasts = await weatherRequest<JmaForecast>(`https://www.jma.go.jp/bosai/forecast/data/forecast/${region.office}.json`, { force });
      // Short-range bulletin owns the regional weather; weekly temperatures are
      // daily minima/maxima, and never assigned to invented hourly slots.
      for (const forecast of forecasts) for (const series of forecast.timeSeries || []) {
        const i = series.timeDefines?.findIndex((time) => time.startsWith(date)) ?? -1;
        if (i < 0) continue;
        const area = series.areas?.find((item) => item.area?.code === region.area)
          || series.areas?.find((item) => item.area?.code === region.office);
        if (area?.weatherCodes?.[i] && !result.daily) {
          result.daily = { date, text: area.weathers?.[i], wind: area.winds?.[i], source: { ...source('JP', forecast.reportDatetime), name: `日本氣象廳 JMA · ${area.area?.name || region.area}` } };
          // Text remains authoritative: JMA's compound codes are not WMO codes.
          result.daily.code = weatherCodeFromText(area.weathers?.[i]);
        }
        const station = series.areas?.find((item) => item.area?.code === region.station);
        if (station && result.daily) {
          const coverage = `每日高低溫：${station.area?.name || region.station}預報點；並非所選景點的實測溫度。`;
          if (!result.notices.includes(coverage)) result.notices.push(coverage);
          result.daily.min ??= number(station.tempsMin?.[i], -90, 60);
          result.daily.max ??= number(station.tempsMax?.[i], -90, 60);
          (series.timeDefines || []).forEach((time, index) => {
            if (!time.startsWith(date)) return;
            if (time.slice(11, 16) === '00:00') result.daily!.min ??= number(station.temps?.[index], -90, 60);
            if (time.slice(11, 16) === '09:00') result.daily!.max ??= number(station.temps?.[index], -90, 60);
          });
        }
      }
    })(),
    (async () => {
      if (date !== today) return;
      const [stations, latest] = await Promise.all([
        weatherRequest<Record<string, AmedasStation>>('https://www.jma.go.jp/bosai/amedas/const/amedastable.json', { ttl: 24 * 60 * 60_000 }),
        weatherRequest<string>('https://www.jma.go.jp/bosai/amedas/data/latest_time.txt', { text: true, force }),
      ]);
      const at = latest.trim();
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(at) || !weatherLocalTime(at, 'Asia/Tokyo').startsWith(date)) return;
      const stamp = at.slice(0, 19).replace(/[-T:]/g, '');
      const readings = await weatherRequest<Record<string, Record<string, unknown>>>(`https://www.jma.go.jp/bosai/amedas/data/map/${stamp}.json`, { force });
      const candidates = Object.entries(stations).flatMap(([id, station]) => {
        if (!station.lat || !station.lon || !readings[id]) return [];
        const position = { lat: station.lat[0] + station.lat[1] / 60, lon: station.lon[0] + station.lon[1] / 60 };
        const temp = amedasNumber(readings[id], 'temp');
        const distance = geoDistanceKm(position, coord);
        return temp != null && distance <= 30 ? [{ id, station, temp, distance }] : [];
      }).sort((a, b) => a.distance - b.distance);
      const nearest = candidates[0];
      if (!nearest) return;
      const record = readings[nearest.id];
      const wind = amedasNumber(record, 'wind');
      const direction = amedasNumber(record, 'windDirection');
      result.observation = {
        temp: nearest.temp, humidity: amedasNumber(record, 'humidity'),
        windSpeed: wind == null ? undefined : wind * 3.6,
        windDirection: direction != null && direction > 0 ? (direction * 22.5) % 360 : undefined,
        observedAt: at, station: `${nearest.station.kjName || nearest.id} · ${nearest.distance.toFixed(1)} km`, source: source('JP', at),
      };
    })(),
  ]);
  if (!result.daily && !result.observation) throw new Error('JMA 未有此地點／日期的可用資料');
  result.notices.push('JMA 每日預報及 AMeDAS 測站觀測分開列出；山區與鄰近測站可能有溫差。');
  return result;
}

type SingaporeReading = { data?: { readingUnit?: string; stations?: Array<{ id?: string; name?: string; location?: { latitude?: number; longitude?: number } }>; readings?: Array<{ timestamp?: string; data?: Array<{ stationId?: string; value?: unknown }> }> } };

async function singapore(coord: WeatherCoord, date: string, force: boolean): Promise<WeatherBulletin> {
  if (date !== weatherLocalTime(Date.now(), 'Asia/Singapore').slice(0, 10)) throw new Error('NEA 即時觀測只適用於當地今日');
  const result: WeatherBulletin = { hourly: [], notices: [], timezone: 'Asia/Singapore' };
  const data = await weatherRequest<SingaporeReading>('https://api-open.data.gov.sg/v2/real-time/api/air-temperature', { force });
  const reading = data.data?.readings?.[0];
  const candidates = (data.data?.stations || []).filter((station) => station.location?.latitude != null && station.location.longitude != null)
    .map((station) => ({ station, distance: geoDistanceKm(coord, { lat: station.location!.latitude!, lon: station.location!.longitude! }), value: number(reading?.data?.find((item) => item.stationId === station.id)?.value, -90, 60) }))
    .filter((item) => item.value != null && item.distance <= 30).sort((a, b) => a.distance - b.distance);
  const match = candidates[0];
  if (match && reading?.timestamp && weatherLocalTime(reading.timestamp, 'Asia/Singapore').startsWith(date)) result.observation = {
    temp: match.value, station: `${match.station.name || match.station.id} · ${match.distance.toFixed(1)} km`,
    observedAt: reading.timestamp, source: source('SG', reading.timestamp),
  };
  try {
    const forecast = await weatherRequest<{ data?: { area_metadata?: Array<{ name?: string; label_location?: { latitude?: number; longitude?: number } }>; items?: Array<{ update_timestamp?: string; valid_period?: { start?: string; end?: string }; forecasts?: Array<{ area?: string; forecast?: string }> }> } }>('https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast', { force });
    const item = forecast.data?.items?.[0];
    const areas = (forecast.data?.area_metadata || []).filter((area) => area.label_location?.latitude != null && area.label_location.longitude != null)
      .sort((a, b) => geoDistanceKm(coord, { lat: a.label_location!.latitude!, lon: a.label_location!.longitude! }) - geoDistanceKm(coord, { lat: b.label_location!.latitude!, lon: b.label_location!.longitude! }));
    const text = item?.forecasts?.find((entry) => entry.area === areas[0]?.name)?.forecast;
    const start = item?.valid_period?.start;
    const end = item?.valid_period?.end;
    if (text && start && end && Date.parse(end) > Date.now() && Date.parse(start) <= Date.now()) {
      result.notices.push(`NEA ${areas[0]?.name} 兩小時預報 ${weatherLocalTime(start, 'Asia/Singapore').slice(11)}–${weatherLocalTime(end, 'Asia/Singapore').slice(11)}：${text}`);
    }
  } catch { result.notices.push('NEA 兩小時預報暫時未能取得。'); }
  if (!result.observation) throw new Error('NEA 未有此地點的有效觀測');
  return result;
}

function nwsWind(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const numbers = value.match(/\d+(?:\.\d+)?/g)?.map(Number);
  if (!numbers?.length) return undefined;
  return Math.max(...numbers) * (/km\/h/i.test(value) ? 1 : 1.609344);
}

async function nws(coord: WeatherCoord, date: string, force: boolean): Promise<WeatherBulletin> {
  const point = await weatherRequest<{ properties?: { forecastHourly?: string; timeZone?: string } }>(`https://api.weather.gov/points/${coord.lat.toFixed(4)},${coord.lon.toFixed(4)}`, { force, ttl: 24 * 60 * 60_000 });
  const url = new URL(point.properties?.forecastHourly || 'https://invalid.example/');
  if (url.origin !== 'https://api.weather.gov' || !url.pathname.startsWith('/gridpoints/')) throw new Error('NWS 未提供有效逐時預報連結');
  const zone = weatherTimezone(point.properties?.timeZone || coord.timezone);
  const data = await weatherRequest<{ properties?: { updateTime?: string; generatedAt?: string; periods?: Array<{ startTime?: string; temperature?: unknown; temperatureUnit?: string; shortForecast?: string; probabilityOfPrecipitation?: { value?: unknown }; relativeHumidity?: { value?: unknown }; windSpeed?: string }> } }>(url.href, { force });
  const hours: WeatherHour[] = (data.properties?.periods || []).flatMap((period) => {
    const time = weatherLocalTime(period.startTime || '', zone);
    if (!time.startsWith(`${date}T`)) return [];
    const temp = number(period.temperature);
    return [{ time, temp: temp == null ? undefined : period.temperatureUnit === 'F' ? (temp - 32) * 5 / 9 : period.temperatureUnit === 'C' ? temp : undefined,
      code: weatherCodeFromText(period.shortForecast), rain: number(period.probabilityOfPrecipitation?.value, 0, 100),
      humidity: number(period.relativeHumidity?.value, 0, 100), windSpeed: nwsWind(period.windSpeed) }];
  });
  if (!hours.length) throw new Error('NWS 預報尚未涵蓋此日期');
  return { hourly: hours, hourlySource: source('US', data.properties?.updateTime || data.properties?.generatedAt), timezone: zone, notices: [] };
}

type Localized = { en?: unknown };
type MscMetric = { value?: Localized; units?: Localized };
type MscConditions = { timestamp?: Localized; station?: { value?: Localized }; temperature?: MscMetric; relativeHumidity?: MscMetric; condition?: Localized; wind?: { speed?: MscMetric; gust?: MscMetric; bearing?: MscMetric } };
type MscFeature = { geometry?: { coordinates?: number[] }; properties?: { name?: Localized; lastUpdated?: string; currentConditions?: MscConditions; hourlyForecastGroup?: { timestamp?: Localized; hourlyForecasts?: Array<{ timestamp?: string; temperature?: MscMetric; condition?: Localized; lop?: MscMetric; wind?: { speed?: MscMetric }; uv?: { index?: MscMetric } }> } } };

async function msc(coord: WeatherCoord, date: string, force: boolean): Promise<WeatherBulletin> {
  const box = [coord.lon - 0.6, coord.lat - 0.6, coord.lon + 0.6, coord.lat + 0.6].map((v) => v.toFixed(4)).join(',');
  const data = await weatherRequest<{ features?: MscFeature[] }>(`https://api.weather.gc.ca/collections/citypageweather-realtime/items?f=json&limit=100&bbox=${box}`, { force });
  const candidates = (data.features || []).flatMap((feature) => {
    const [lon, lat] = feature.geometry?.coordinates || [];
    if (number(lat, -90, 90) == null || number(lon, -180, 180) == null) return [];
    return [{ feature, distance: geoDistanceKm(coord, { lat, lon }) }];
  }).filter((item) => item.distance <= 50).sort((a, b) => a.distance - b.distance);
  const feature = candidates[0]?.feature;
  if (!feature) throw new Error('MSC 附近 50 km 未有可用城市預報');
  const zone = weatherTimezone(coord.timezone);
  const properties = feature.properties;
  const result: WeatherBulletin = { hourly: [], notices: [], timezone: zone };
  const conditions = properties?.currentConditions;
  const at = typeof conditions?.timestamp?.en === 'string' ? conditions.timestamp.en : '';
  if (at && weatherLocalTime(at, zone).startsWith(date)) result.observation = {
    observedAt: at, station: String(conditions?.station?.value?.en || properties?.name?.en || 'MSC 測站'), source: source('CA', at),
    temp: number(conditions?.temperature?.value?.en, -90, 60), humidity: number(conditions?.relativeHumidity?.value?.en, 0, 100),
    code: weatherCodeFromText(conditions?.condition?.en), windSpeed: number(conditions?.wind?.speed?.value?.en, 0),
    windGust: number(conditions?.wind?.gust?.value?.en, 0), windDirection: number(conditions?.wind?.bearing?.value?.en, 0, 360),
  };
  result.hourly = (properties?.hourlyForecastGroup?.hourlyForecasts || []).flatMap((period) => {
    const time = weatherLocalTime(period.timestamp || '', zone);
    return time.startsWith(`${date}T`) ? [{ time, temp: number(period.temperature?.value?.en, -90, 60),
      code: weatherCodeFromText(period.condition?.en), rain: number(period.lop?.value?.en, 0, 100),
      windSpeed: number(period.wind?.speed?.value?.en, 0), uvIndex: number(period.uv?.index?.value?.en, 0, 30) }] : [];
  });
  if (result.hourly.length) result.hourlySource = source('CA', String(properties?.hourlyForecastGroup?.timestamp?.en || properties?.lastUpdated || ''));
  if (!result.hourly.length && !result.observation) throw new Error('MSC 未有此日期的資料');
  return result;
}

export async function fetchOfficialWeather(coord: WeatherCoord, date: string, force: boolean): Promise<WeatherBulletin> {
  switch (coord.countryCode) {
    case 'HK': return hko(date, force);
    case 'JP': return jma(coord, date, force);
    case 'SG': return singapore(coord, date, force);
    case 'US': return nws(coord, date, force);
    case 'CA': return msc(coord, date, force);
    default: return { hourly: [], notices: [OFFICIAL_WEATHER_SERVICES[coord.countryCode || '']?.note || '此地區未連接官方直連資料；以下會標示可用的預報來源。'] };
  }
}

export type HourlyPayload = { timezone?: string; hourly?: Record<string, unknown[]>; daily?: Record<string, unknown[]> };
const FIELDS = {
  temp: ['temperature_2m', -90, 60], feelsLike: ['apparent_temperature', -110, 80], code: ['weather_code', 0, 99],
  rain: ['precipitation_probability', 0, 100], precipMm: ['precipitation', 0, Infinity], humidity: ['relative_humidity_2m', 0, 100],
  windSpeed: ['wind_speed_10m', 0, Infinity], windDirection: ['wind_direction_10m', 0, 360], windGust: ['wind_gusts_10m', 0, Infinity],
  cloudCover: ['cloud_cover', 0, 100], uvIndex: ['uv_index', 0, 30],
} as const;

export function parseHourlyForecast(data: HourlyPayload, date: string): WeatherHour[] {
  const times = data?.hourly?.time;
  if (!Array.isArray(times)) return [];
  return times.flatMap((time, i) => {
    if (typeof time !== 'string' || !new RegExp(`^${date}T(?:[01]\\d|2[0-3]):[0-5]\\d$`).test(time)) return [];
    const values = Object.fromEntries(Object.entries(FIELDS).map(([key, [field, min, max]]) => [key, number(data.hourly?.[field]?.[i], min, max)]));
    if (!Object.values(values).some((value) => value != null)) return [];
    return [{ time, ...values }];
  }).sort((a, b) => a.time.localeCompare(b.time));
}

const REGIONAL_MODELS: Record<string, { model: string; name: string }> = {
  JP: { model: 'jma_seamless', name: 'JMA 模型' }, KR: { model: 'kma_seamless', name: 'KMA 模型' },
  GB: { model: 'ukmo_seamless', name: 'Met Office 模型' }, DE: { model: 'icon_seamless', name: 'DWD ICON 模型' },
  FR: { model: 'meteofrance_seamless', name: 'Météo-France 模型' },
};

export async function fetchModelWeather(coord: WeatherCoord, date: string, force: boolean): Promise<WeatherBulletin> {
  const params = new URLSearchParams({ latitude: String(coord.lat), longitude: String(coord.lon),
    hourly: Object.values(FIELDS).map(([field]) => field).join(','),
    daily: 'temperature_2m_max,temperature_2m_min,weather_code',
    timezone: coord.timezone ? weatherTimezone(coord.timezone) : 'auto', forecast_days: '16', wind_speed_unit: 'kmh',
  });
  const regional = REGIONAL_MODELS[coord.countryCode || ''];
  const models = regional ? [regional, undefined] : [undefined];
  for (const model of models) {
    if (model) params.set('models', model.model); else params.delete('models');
    try {
      const data = await weatherRequest<HourlyPayload>(`https://api.open-meteo.com/v1/forecast?${params}`, { force });
      const hours = parseHourlyForecast(data, date);
      if (!hours.length) throw new Error('預報尚未涵蓋所選日期');
      const dataSource: WeatherSource = { name: model ? `${model.name} · Open-Meteo` : 'Open-Meteo', url: 'https://open-meteo.com/', official: false };
      const i = data.daily?.time?.indexOf(date) ?? -1;
      const daily: WeatherDay | undefined = i < 0 ? undefined : {
        date, min: number(data.daily?.temperature_2m_min?.[i], -90, 60), max: number(data.daily?.temperature_2m_max?.[i], -90, 60), code: number(data.daily?.weather_code?.[i], 0, 99), source: dataSource,
      };
      return { hourly: hours, hourlySource: dataSource, daily, timezone: weatherTimezone(data.timezone || coord.timezone), notices: regional && !model ? [`${regional.name} 暫無此日期的可用預報，已使用 Open-Meteo 自動模型。`] : [] };
    } catch (error) { if (!model) throw error; }
  }
  throw new Error('未能取得逐時預報');
}
