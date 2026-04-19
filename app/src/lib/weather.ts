import { DEFAULT_LAT, DEFAULT_LON, LOCATIONS, WEATHER_CODE_MAP, WEATHER_SLOT_HOURS } from './constants';
import { ITINERARY } from './itinerary';
import type { WeatherDay, WeatherSlot } from './types';

const codeInfo = (code: number) => WEATHER_CODE_MAP[code] ?? { label: '多雲', icon: '☁️' };

async function fetchOneLocation(
  start: string, end: string, lat: number, lon: number, locationName: string,
): Promise<WeatherDay[]> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
  url.searchParams.set('hourly', 'temperature_2m,weather_code');
  url.searchParams.set('timezone', 'Asia/Tokyo');
  url.searchParams.set('models', 'jma_seamless');
  url.searchParams.set('start_date', start);
  url.searchParams.set('end_date', end);
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
  const data = await r.json();
  const d = data.daily, h = data.hourly;
  const out: WeatherDay[] = [];
  if (!d?.time) return out;
  for (let i = 0; i < d.time.length; i++) {
    const date = d.time[i];
    const code = d.weather_code?.[i] ?? 0;
    const info = codeInfo(code);
    const slots: WeatherSlot[] = WEATHER_SLOT_HOURS.map((hr) => {
      const stamp = `${date}T${String(hr).padStart(2, '0')}:00`;
      const j = h?.time?.findIndex((t: string) => t === stamp) ?? -1;
      if (j < 0) return null;
      const hc = h.weather_code?.[j] ?? code;
      const hi = codeInfo(hc);
      return { hour: hr, temp: Math.round(h.temperature_2m?.[j] ?? 0), code: hc, icon: hi.icon, label: hi.label };
    }).filter((s): s is WeatherSlot => s !== null);
    out.push({
      date,
      tmax: Math.round(d.temperature_2m_max?.[i] ?? 0),
      tmin: Math.round(d.temperature_2m_min?.[i] ?? 0),
      code, label: info.label, icon: info.icon,
      slots, locationName, lat, lon,
    });
  }
  return out;
}

export async function fetchTripWeather(): Promise<WeatherDay[]> {
  const byLoc = new Map<string, { lat: number; lon: number; name: string; dates: string[] }>();
  for (const d of ITINERARY) {
    const loc = LOCATIONS[d.region] || { name: d.region, lat: DEFAULT_LAT, lon: DEFAULT_LON };
    const key = `${loc.lat}_${loc.lon}`;
    const entry = byLoc.get(key) || { lat: loc.lat, lon: loc.lon, name: loc.name, dates: [] };
    entry.dates.push(d.date);
    byLoc.set(key, entry);
  }
  const results: WeatherDay[] = [];
  await Promise.all([...byLoc.values()].map(async (e) => {
    try {
      const days = await fetchOneLocation(e.dates[0], e.dates[e.dates.length - 1], e.lat, e.lon, e.name);
      for (const d of days) if (e.dates.includes(d.date)) results.push(d);
    } catch (err) { console.warn('[weather]', e.name, err); }
  }));
  results.sort((a, b) => (a.date < b.date ? -1 : 1));
  return results;
}
