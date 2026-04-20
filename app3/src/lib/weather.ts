export interface WeatherData {
  temp: number;
  tempMin: number;
  tempMax: number;
  weatherCode: number;
  description: string;
  icon: string;
}

const WMO_CODES: Record<number, { desc: string; icon: string }> = {
  0: { desc: '晴天', icon: '☀️' },
  1: { desc: '晴間多雲', icon: '🌤️' },
  2: { desc: '部分多雲', icon: '⛅' },
  3: { desc: '陰天', icon: '☁️' },
  45: { desc: '霧', icon: '🌫️' },
  48: { desc: '凍霧', icon: '🌫️' },
  51: { desc: '毛毛雨', icon: '🌦️' },
  53: { desc: '毛毛雨', icon: '🌦️' },
  55: { desc: '毛毛雨', icon: '🌧️' },
  61: { desc: '小雨', icon: '🌧️' },
  63: { desc: '中雨', icon: '🌧️' },
  65: { desc: '大雨', icon: '🌧️' },
  71: { desc: '小雪', icon: '🌨️' },
  73: { desc: '中雪', icon: '❄️' },
  75: { desc: '大雪', icon: '❄️' },
  80: { desc: '陣雨', icon: '🌦️' },
  81: { desc: '陣雨', icon: '🌧️' },
  82: { desc: '大陣雨', icon: '⛈️' },
  95: { desc: '雷暴', icon: '⛈️' },
  96: { desc: '雷暴夾雹', icon: '⛈️' },
  99: { desc: '大雷暴', icon: '⛈️' },
};

// Nagoya coordinates
const LAT = 35.1815;
const LON = 136.9066;

export async function fetchWeather(date: string): Promise<WeatherData | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=Asia%2FTokyo&start_date=${date}&end_date=${date}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as {
      daily?: {
        weathercode?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
      };
    };
    const code = data.daily?.weathercode?.[0] ?? 0;
    const max = data.daily?.temperature_2m_max?.[0] ?? 0;
    const min = data.daily?.temperature_2m_min?.[0] ?? 0;
    const info = WMO_CODES[code] ?? { desc: '未知', icon: '🌡️' };
    return {
      temp: Math.round((max + min) / 2),
      tempMin: Math.round(min),
      tempMax: Math.round(max),
      weatherCode: code,
      description: info.desc,
      icon: info.icon,
    };
  } catch {
    return null;
  }
}
