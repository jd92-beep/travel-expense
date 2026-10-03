import { weatherRequest } from './http';
import { validWeatherCoord } from './locations';
import type { WeatherCoord } from './types';

export interface CurrentWeatherLocation {
  coord: WeatherCoord;
  accuracyMeters: number;
  notices: string[];
}

type ReverseLocation = {
  lookupSource?: string;
  countryCode?: string;
  countryName?: string;
  city?: string;
  locality?: string;
  localityInfo?: { informative?: Array<{ name?: string; description?: string }> };
};

function validTimezone(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
    return value;
  } catch { return undefined; }
}

/** Invoke from an explicit location action only; never persist this result. */
export async function requestCurrentWeatherLocation(): Promise<CurrentWeatherLocation> {
  if (globalThis.isSecureContext === false) throw new Error('定位需要 HTTPS 安全連線，請使用網站嘅 HTTPS 網址。');
  if (typeof navigator === 'undefined' || !navigator.geolocation) throw new Error('呢個瀏覽器唔支援定位，請改用支援定位嘅瀏覽器。');

  let deadline: ReturnType<typeof setTimeout> | undefined;
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    // The native timeout excludes time spent waiting for permission.
    deadline = setTimeout(() => reject({ code: 3 }), 20_000);
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, timeout: 15_000, maximumAge: 0,
    });
  }).catch((error: { code?: number } | null) => {
    if (error?.code === 1) throw new Error('定位權限已被拒絕，請喺瀏覽器網站設定允許定位後再試。');
    if (error?.code === 3) throw new Error('定位逾時，請確認已開啟定位服務，然後再試。');
    throw new Error('暫時未能取得位置，請開啟裝置定位服務，再移到訊號較好嘅地方重試。');
  }).finally(() => clearTimeout(deadline));

  const { latitude: lat, longitude: lon, accuracy: accuracyMeters } = position.coords;
  if (!validWeatherCoord({ lat, lon }) || !Number.isFinite(accuracyMeters) || accuracyMeters < 0) {
    throw new Error('裝置傳回嘅位置無效，請重新定位。');
  }
  const result: CurrentWeatherLocation = {
    coord: { label: '當前位置（國家／地區未能確認）', lat, lon, origin: 'device-location', accuracyMeters },
    accuracyMeters,
    notices: accuracyMeters > 1_000 ? [`裝置定位誤差約 ${(accuracyMeters / 1_000).toFixed(1)} 公里；天氣可能未能反映你所在嘅街區。`] : [],
  };

  try {
    // This free endpoint permits only consented, current device coordinates.
    // https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api
    const params = new URLSearchParams({ latitude: String(lat), longitude: String(lon), localityLanguage: 'en' });
    const data = await weatherRequest<ReverseLocation>(`https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`, { cache: false });
    const countryCode = typeof data?.countryCode === 'string' ? data.countryCode.trim().toUpperCase() : '';
    if (!['coordinates', 'reverseGeocoding'].includes(data?.lookupSource || '') || !/^[A-Z]{2}$/.test(countryCode)) {
      throw new Error('Unconfirmed country');
    }
    const place = [data.city, data.locality, data.countryName].find((value) => typeof value === 'string' && value.trim());
    result.coord.label = `當前位置 · ${place?.trim() || countryCode}`;
    result.coord.countryCode = countryCode;
    const informative = data.localityInfo?.informative;
    result.coord.timezone = validTimezone(Array.isArray(informative) ? informative.find((item) => item?.description === 'time zone')?.name : undefined);
  } catch {
    result.notices.push('已取得裝置位置，但未能確認國家／地區；暫用 Open-Meteo 天氣資料。');
  }
  if (!result.coord.timezone) {
    try {
      // Resolve the local date before requesting a forecast; do not use the trip/device zone.
      const params = new URLSearchParams({ latitude: String(lat), longitude: String(lon), timezone: 'auto', forecast_days: '1' });
      const data = await weatherRequest<{ timezone?: unknown }>(`https://api.open-meteo.com/v1/forecast?${params}`, { cache: false });
      result.coord.timezone = validTimezone(data?.timezone);
    } catch { /* Preserve the coordinate, but callers must not guess the local date. */ }
    if (!result.coord.timezone) result.notices.push('未能判定目前位置嘅時區，請稍後重新定位。');
  }
  return result;
}
