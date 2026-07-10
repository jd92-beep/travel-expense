import { Cloud, CloudLightning, CloudRain, CloudSun, Snowflake, Sun } from 'lucide-react';
import { getEffectsTier } from '../lib/performance';
// Meteocons by Bas Milius (MIT) — vendored animated SVGs (see src/assets/meteocons/LICENSE).
// SMIL/CSS animation runs inside <img>, so these cost zero JS and stay off the main thread.
import clearDay from '../assets/meteocons/clear-day.svg';
import clearNight from '../assets/meteocons/clear-night.svg';
import partlyCloudyDay from '../assets/meteocons/partly-cloudy-day.svg';
import partlyCloudyNight from '../assets/meteocons/partly-cloudy-night.svg';
import cloudy from '../assets/meteocons/cloudy.svg';
import overcast from '../assets/meteocons/overcast.svg';
import fog from '../assets/meteocons/fog.svg';
import drizzle from '../assets/meteocons/drizzle.svg';
import rain from '../assets/meteocons/rain.svg';
import sleet from '../assets/meteocons/sleet.svg';
import snow from '../assets/meteocons/snow.svg';
import thunderstorms from '../assets/meteocons/thunderstorms.svg';
import thunderstormsRain from '../assets/meteocons/thunderstorms-rain.svg';

function meteoconFor(code: number, night: boolean): string {
  if (code === 0) return night ? clearNight : clearDay;
  if (code === 1 || code === 2) return night ? partlyCloudyNight : partlyCloudyDay;
  if (code === 3) return overcast;
  if (code === 45 || code === 48) return fog;
  if (code >= 51 && code <= 57) return drizzle;
  if (code === 66 || code === 67) return sleet;
  if (code >= 61 && code <= 65) return rain;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return snow;
  if (code >= 80 && code <= 82) return rain;
  if (code === 96 || code === 99) return thunderstormsRain;
  if (code >= 95) return thunderstorms;
  return cloudy;
}

// Static lucide fallback: lite tier only (SMIL inside <img> can't honor
// prefers-reduced-motion, so constrained/reduced-motion devices keep still glyphs).
function LucideWeatherIcon({ code, size }: { code?: number; size: number }) {
  if (code == null) return <CloudSun size={size} />;
  if (code === 0) return <Sun size={size} />;
  if ([1, 2, 3].includes(code)) return <CloudSun size={size} />;
  if ([45, 48].includes(code)) return <Cloud size={size} />;
  if (code >= 51 && code <= 67) return <CloudRain size={size} />;
  if (code >= 80 && code <= 82) return <CloudRain size={size} />;
  if (code >= 71 && code <= 86) return <Snowflake size={size} />;
  if (code >= 95) return <CloudLightning size={size} />;
  return <CloudSun size={size} />;
}

/**
 * Animated weather condition icon. `hour` (0-23, local to the forecast slot) picks the
 * day/night variant for clear/partly-cloudy skies. The adjacent text label carries the
 * semantics, so the image itself is decorative.
 */
export function WeatherIcon({ code, size = 18, hour }: { code?: number; size?: number; hour?: number }) {
  if (getEffectsTier() === 'lite' || code == null) {
    return <LucideWeatherIcon code={code} size={size} />;
  }
  const night = hour != null && (hour < 6 || hour >= 18);
  // Meteocons have generous internal padding — render slightly larger than the lucide
  // glyph they replace so the visible artwork matches the old optical size.
  const rendered = Math.round(size * 1.35);
  return (
    <img
      src={meteoconFor(code, night)}
      alt=""
      aria-hidden="true"
      width={rendered}
      height={rendered}
      className="weather-meteocon"
      style={{ width: rendered, height: rendered, margin: Math.round((size - rendered) / 2) }}
      draggable={false}
    />
  );
}
