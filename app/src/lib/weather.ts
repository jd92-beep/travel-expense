import { DEFAULT_LAT, DEFAULT_LON, WEATHER_CODE_MAP } from './constants';
import type { WeatherDay } from './types';

/** Fetch daily JMA-seamless forecast from Open-Meteo (no API key needed). */
export async function fetchWeather(
  startDate: string,
  endDate: string,
  lat: number = DEFAULT_LAT,
  lon: number = DEFAULT_LON,
): Promise<WeatherDay[]> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
  url.searchParams.set('timezone', 'Asia/Tokyo');
  url.searchParams.set('models', 'jma_seamless');
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('end_date', endDate);
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
  const data = await r.json();
  const d = data.daily;
  const out: WeatherDay[] = [];
  if (!d?.time) return out;
  for (let i = 0; i < d.time.length; i++) {
    const code = d.weather_code?.[i] ?? 0;
    const info = WEATHER_CODE_MAP[code] ?? { label: '多雲', icon: '☁️' };
    out.push({
      date: d.time[i],
      tmax: Math.round(d.temperature_2m_max?.[i] ?? 0),
      tmin: Math.round(d.temperature_2m_min?.[i] ?? 0),
      code,
      label: info.label,
      icon: info.icon,
    });
  }
  return out;
}
