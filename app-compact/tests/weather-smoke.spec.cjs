const { test, expect } = require('@playwright/test');

const APP_ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://localhost:8903';
const TODAY = '2026-10-03';
const TOMORROW = '2026-10-04';
const NOW = '2026-10-03T02:30:00Z';

test.use({ viewport: { width: 390, height: 844 } });

function day(region = '香港', country = 'HK', timezone = 'Asia/Hong_Kong', date = TODAY, spots = []) {
  return { day: 1, date, region, country, timezone, spots };
}

function trip(id, name, itinerary) {
  return {
    id, name, destinationSummary: itinerary.map((entry) => entry.region).join(' / '),
    startDate: itinerary[0].date, endDate: itinerary.at(-1).date,
    homeCurrency: 'HKD', currencies: ['HKD'], timezones: [...new Set(itinerary.map((entry) => entry.timezone))],
    version: 1, active: true, archived: false, budget: 10000, itinerary,
    createdAt: 1, updatedAt: 1, sourceId: `trip_${id}`,
  };
}

async function seed(page, itinerary = [day()], options = {}) {
  await page.clock.setFixedTime(new Date(NOW));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const trips = options.trips || [trip('weather_test', 'Weather Test', itinerary)];
  const active = trips.find((item) => item.id === options.activeTripId) || trips[0];
  const state = {
    schemaVersion: 4, lastTab: 'weather', autoSync: false, receipts: [],
    activeTripId: active.id, trips, tripName: active.name,
    tripDateRange: { start: active.startDate, end: active.endDate },
    tripCurrency: 'HKD', customItinerary: active.itinerary,
  };
  await page.addInitScript((payload) => {
    window.__disable_supabase_configured = true;
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
    if (sessionStorage.getItem('weather-smoke-seeded')) return;
    sessionStorage.setItem('weather-smoke-seeded', '1');
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify(payload));
  }, state);
  // Unmocked requests fail locally, including any accidental account or backend call.
  await page.route('**/*', (route) => new URL(route.request().url()).origin === APP_ORIGIN
    ? route.continue() : route.fulfill({ status: 503, json: { error: 'No fixture for external request' } }));
}

async function openWeather(page) {
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#weather`);
  await expect(page.getByRole('heading', { name: '旅程氣象站' })).toBeVisible();
}

function modelFixture({ dates = [TODAY, TOMORROW], timezone = 'Asia/Hong_Kong', temp = 19, hours = [8, 13, 18] } = {}) {
  const time = dates.flatMap((date) => hours.map((hour) => `${date}T${String(hour).padStart(2, '0')}:00`));
  return {
    timezone,
    hourly: {
      time,
      temperature_2m: time.map((_, index) => temp + index),
      apparent_temperature: time.map((_, index) => index % hours.length === 0 ? null : temp + index - 2),
      weather_code: time.map(() => 2),
      precipitation_probability: time.map((_, index) => index % hours.length === 0 ? null : 42),
      precipitation: time.map(() => null),
      relative_humidity_2m: time.map(() => 62),
      wind_speed_10m: time.map(() => 13),
      wind_direction_10m: time.map(() => 240),
      wind_gusts_10m: time.map(() => null),
      cloud_cover: time.map(() => 35),
      uv_index: time.map(() => 2),
    },
    daily: { time: dates, temperature_2m_min: dates.map(() => 16), temperature_2m_max: dates.map(() => 24), weather_code: dates.map(() => 2) },
  };
}

async function routeModel(page, payload = modelFixture()) {
  const calls = [];
  await page.route('https://api.open-meteo.com/**', async (route) => {
    calls.push(route.request());
    const data = typeof payload === 'function' ? payload(new URL(route.request().url()), calls.length) : payload;
    if (!data) return route.fulfill({ status: 503, json: { error: 'Model unavailable' } });
    return route.fulfill({ json: data });
  });
  return calls;
}

async function routeHko(page, { temperature = 28, unavailable = () => false } = {}) {
  const calls = [];
  await page.route('https://data.weather.gov.hk/**', async (route) => {
    calls.push(route.request());
    if (unavailable()) return route.abort('internetdisconnected');
    const current = new URL(route.request().url()).searchParams.get('dataType') === 'rhrread';
    await route.fulfill({ json: current ? {
      updateTime: `${TODAY}T10:00:00+08:00`, icon: [50],
      temperature: { recordTime: `${TODAY}T10:00:00+08:00`, data: [{ place: '香港天文台', value: temperature }, { place: '打鼓嶺', value: 99 }] },
      humidity: { data: [{ place: '香港天文台', value: 81 }] },
    } : {
      updateTime: `${TODAY}T08:00:00+08:00`,
      weatherForecast: [TODAY, TOMORROW].map((date) => ({ forecastDate: date.replaceAll('-', ''), forecastMintemp: { value: 23 }, forecastMaxtemp: { value: 31 }, ForecastIcon: 52, forecastWeather: '部分時間有陽光。', forecastWind: '吹東風 3 至 4 級。', PSR: '高' })),
    } });
  });
  return calls;
}

async function routeJma(page, { observations = true, unavailable = () => false } = {}) {
  const calls = [];
  await page.route('https://www.jma.go.jp/bosai/**', async (route) => {
    const url = route.request().url();
    calls.push(url);
    if (unavailable()) return route.abort('internetdisconnected');
    if (url.includes('/forecast/')) {
      const nagano = url.endsWith('/200000.json');
      const areaCode = nagano ? '200010' : '230010';
      const station = nagano ? '48156' : '51106';
      return route.fulfill({ json: [{ reportDatetime: `${TODAY}T05:00:00+09:00`, timeSeries: [
        { timeDefines: [TODAY, TOMORROW].map((date) => `${date}T00:00:00+09:00`), areas: [
          { area: { code: 'unrelated' }, weatherCodes: ['300', '300'], weathers: ['WRONG REGION', 'WRONG REGION'] },
          { area: { code: areaCode }, weatherCodes: ['101', '101'], weathers: [nagano ? '長野は晴れ' : '名古屋は晴れ', nagano ? '長野はくもり' : '名古屋はくもり'], winds: ['北の風', '東の風'] },
        ] },
        { timeDefines: [TODAY, TOMORROW].map((date) => `${date}T00:00:00+09:00`), areas: [
          { area: { code: 'wrong-station' }, tempsMin: ['-30', '-30'], tempsMax: ['59', '59'] },
          { area: { code: station }, tempsMin: ['13', '14'], tempsMax: ['25', '26'] },
        ] },
      ] }] });
    }
    if (!observations) return route.fulfill({ status: 503, json: {} });
    if (url.endsWith('/amedastable.json')) return route.fulfill({ json: {
      '51106': { lat: [35, 10.8], lon: [136, 54.6], kjName: '名古屋測站' },
      '48156': { lat: [36, 39], lon: [138, 11.4], kjName: '長野測站' },
    } });
    if (url.endsWith('/latest_time.txt')) return route.fulfill({ contentType: 'text/plain', body: `${TODAY}T11:00:00+09:00` });
    return route.fulfill({ json: {
      '51106': { temp: [27, 0], humidity: [68, 0], wind: [3, 0], windDirection: [4, 0] },
      '48156': { temp: [17, 0], humidity: [77, 0], wind: [4, 0], windDirection: [8, 0] },
    } });
  });
  return calls;
}

test('HKO daily and observation retain their sources while real model hours remain separate and accessible', async ({ page }) => {
  await seed(page);
  await routeHko(page);
  await routeModel(page);
  await openWeather(page);
  await expect(page.locator('.wx-temperature')).toHaveText('28°');
  await expect(page.locator('.wx-temperature-range')).toContainText('最低 23°');
  await expect(page.locator('.wx-temperature-range')).toContainText('最高 31°');
  await expect(page.getByRole('region', { name: '每日氣象摘要' })).toContainText('顯著降雨概率：高');
  await expect(page.locator('.wx-bulletin').getByRole('link', { name: /香港天文台 HKO/ })).toHaveAttribute('href', 'https://www.hko.gov.hk/tc/');
  await expect(page.locator('.wx-forecast-credit')).toContainText('Open-Meteo');
  await expect(page.locator('.wx-hours time')).toHaveText(['08:00', '13:00', '18:00']);
  await expect(page.getByRole('img', { name: /所選日期逐時溫度走勢/ })).toBeVisible();
  const morning = page.getByRole('button', { name: /^08:00 預報/ });
  await morning.focus();
  await page.keyboard.press('Enter');
  await expect(morning).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.wx-hour-detail')).toContainText('08:00');
  await expect(page.locator('.wx-metrics > div').filter({ hasText: '降雨機率' }).locator('dd')).toHaveText('—');
  await expect(page.locator('.wx-extra-readings')).toContainText('雨量 —');
  await expect(page.locator('.wx-temperature')).toHaveText('28°');
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole('button', { name: /^18:00 預報/ }).click();
  await expect(page.locator('.wx-detail-title time')).toHaveText('18:00');
  const layout = await page.locator('.wx-station').evaluate((station) => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    shortButtons: [...station.querySelectorAll('button')].filter((button) => button.getBoundingClientRect().height < 44).map((button) => button.textContent),
  }));
  expect(layout).toEqual({ overflow: 0, shortButtons: [] });
  expect(await page.locator('#wx-place-heading').evaluate(node => getComputedStyle(node).color)).toBe('rgb(244, 251, 255)');
  expect(await page.locator('.compact-mobile-title-art').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  if (process.env.COMPACT_CAPTURE_DIR) {
    const path = require('node:path');
    require('node:fs').mkdirSync(process.env.COMPACT_CAPTURE_DIR, { recursive: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(process.env.COMPACT_CAPTURE_DIR, 'weather-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(process.env.COMPACT_CAPTURE_DIR, 'weather-desktop.png'), fullPage: true });
  }
});

test('Japan place and date selections use the matching JMA office and nearest real station', async ({ page }) => {
  const itinerary = [day('名古屋 → 長野', 'JP', 'Asia/Tokyo'), { ...day('長野', 'JP', 'Asia/Tokyo', TOMORROW), day: 2 }];
  await seed(page, itinerary);
  const jmaCalls = await routeJma(page);
  const modelCalls = await routeModel(page, modelFixture({ timezone: 'Asia/Tokyo' }));
  await openWeather(page);
  await expect(page.locator('.wx-temperature')).toHaveText('27°');
  await expect(page.locator('.wx-bulletin')).toContainText('名古屋は晴れ');
  await expect(page.locator('.wx-overview-foot')).toContainText('名古屋測站');
  await expect(page.locator('.wx-forecast-credit')).toContainText('JMA 模型 · Open-Meteo');
  await page.getByRole('group', { name: '選擇預報地點' }).getByRole('button', { name: '長野' }).click();
  await expect(page.locator('#wx-place-heading')).toHaveText('長野');
  await expect(page.locator('.wx-temperature')).toHaveText('17°');
  await expect(page.locator('.wx-bulletin')).toContainText('長野は晴れ');
  await expect(page.locator('.wx-overview-foot')).toContainText('長野測站');
  await expect(page.locator('.wx-temperature-range')).toContainText('最高 25°');
  await expect(page.locator('.wx-station')).not.toContainText('WRONG REGION');
  await page.getByRole('button', { name: `Day 2 ${TOMORROW}` }).click();
  await expect(page.locator('.wx-bulletin')).toContainText('長野はくもり');
  await expect(page.locator('.wx-reading-label')).toHaveText('所選時段預報');
  await expect(page.locator('.wx-hours time').first()).toHaveAttribute('datetime', `${TOMORROW}T08:00`);
  expect(jmaCalls.some((url) => url.endsWith('/230000.json'))).toBe(true);
  expect(jmaCalls.some((url) => url.endsWith('/200000.json'))).toBe(true);
  expect(modelCalls.every((request) => new URL(request.url()).searchParams.get('models') === 'jma_seamless')).toBe(true);
});

test('JMA daily-only bulletin never invents hourly temperatures or rain percentages', async ({ page }) => {
  await seed(page, [day('名古屋', 'JP', 'Asia/Tokyo')]);
  await routeJma(page, { observations: false });
  await routeModel(page, null);
  await openWeather(page);
  await expect(page.locator('.wx-bulletin')).toContainText('名古屋は晴れ');
  await expect(page.locator('.wx-temperature-range')).toContainText('最高 25°');
  await expect(page.locator('.wx-temperature')).toHaveText('—°');
  await expect(page.locator('.wx-forecast')).toContainText('此來源未提供所選日期的逐時預報');
  await expect(page.locator('.wx-hour')).toHaveCount(0);
  await expect(page.locator('.wx-trend')).toHaveCount(0);
  await expect(page.locator('.wx-station')).not.toContainText('0%');
});

test('US keeps native NWS hours, Fahrenheit conversion and destination-local dates', async ({ page }) => {
  const localDate = '2026-10-02';
  await seed(page, [day('San Francisco', 'US', 'America/Los_Angeles', localDate, [{ time: '09:00', name: 'San Francisco', lat: 37.7749, lon: -122.4194 }])]);
  const modelCalls = await routeModel(page);
  await page.route('https://api.weather.gov/points/**', (route) => route.fulfill({ json: { properties: { forecastHourly: 'https://api.weather.gov/gridpoints/MTR/85,105/forecast/hourly', timeZone: 'America/Los_Angeles' } } }));
  await page.route('https://api.weather.gov/gridpoints/**', (route) => route.fulfill({ json: { properties: {
    updateTime: `${localDate}T18:00:00-07:00`,
    periods: [18, 19, 20].map((hour, index) => ({ startTime: `${localDate}T${hour}:00:00-07:00`, temperature: [68, 71.6, 77][index], temperatureUnit: 'F', shortForecast: 'Sunny', probabilityOfPrecipitation: { value: index === 0 ? null : 10 }, relativeHumidity: { value: 64 }, windSpeed: '8 mph' })),
  } } }));
  await openWeather(page);
  await expect(page.locator('.wx-hours time')).toHaveText(['18:00', '19:00', '20:00']);
  await expect(page.locator('.wx-hours strong')).toHaveText(['20°', '22°', '25°']);
  await expect(page.locator('.wx-forecast-credit')).toContainText('美國 NWS');
  await expect(page.locator('.wx-zone')).toContainText('America/Los_Angeles');
  await expect(page.locator('.wx-hours time').first()).toHaveAttribute('datetime', `${localDate}T18:00`);
  await expect(page.locator('.wx-reading-label')).toHaveText('所選時段預報');
  await page.getByRole('button', { name: /^18:00 預報/ }).click();
  await expect(page.locator('.wx-metrics > div').filter({ hasText: '降雨機率' }).locator('dd')).toHaveText('—');
  await expect(page.locator('.wx-metrics > div').filter({ hasText: '風速' }).locator('dd')).toHaveText('13 km/h');
  expect(modelCalls).toHaveLength(0);
});

test('Singapore observation and current two-hour notice do not become invented model hours', async ({ page }) => {
  await seed(page, [day('新加坡', 'SG', 'Asia/Singapore')]);
  await routeModel(page, modelFixture({ timezone: 'Asia/Singapore' }));
  await page.route('https://api-open.data.gov.sg/**', (route) => route.fulfill({ json: route.request().url().endsWith('air-temperature') ? {
    data: { stations: [{ id: 'S1', name: 'City station', location: { latitude: 1.292, longitude: 103.844 } }], readings: [{ timestamp: `${TODAY}T10:00:00+08:00`, data: [{ stationId: 'S1', value: 30 }] }] },
  } : {
    data: { area_metadata: [{ name: 'City', label_location: { latitude: 1.292, longitude: 103.844 } }], items: [{ valid_period: { start: `${TODAY}T10:00:00+08:00`, end: `${TODAY}T12:00:00+08:00` }, forecasts: [{ area: 'City', forecast: 'Cloudy' }] }] },
  } }));
  await openWeather(page);
  await expect(page.locator('.wx-temperature')).toHaveText('30°');
  await expect(page.locator('.wx-overview-foot')).toContainText('新加坡 NEA / MSS');
  await expect(page.locator('.wx-provenance')).toContainText('NEA City 兩小時預報 10:00–12:00：Cloudy');
  await expect(page.locator('.wx-hours time')).toHaveText(['08:00', '13:00', '18:00']);
  await expect(page.locator('.wx-forecast-credit')).toContainText('Open-Meteo');
});

test('Canada uses native MSC hours and a dated nearby station observation', async ({ page }) => {
  const localDate = '2026-10-02';
  await seed(page, [day('Vancouver', 'CA', 'America/Vancouver', localDate, [{ time: '09:00', name: 'Vancouver', lat: 49.28, lon: -123.12 }])]);
  const modelCalls = await routeModel(page);
  await page.route('https://api.weather.gc.ca/**', (route) => route.fulfill({ json: { features: [{ geometry: { coordinates: [-123.12, 49.28] }, properties: {
    name: { en: 'Vancouver' }, currentConditions: { timestamp: { en: `${localDate}T19:00:00-07:00` }, temperature: { value: { en: 14 } }, station: { value: { en: 'Vancouver Harbour' } }, condition: { en: 'Cloudy' } },
    hourlyForecastGroup: { timestamp: { en: `${localDate}T18:00:00-07:00` }, hourlyForecasts: [19, 20].map((hour) => ({ timestamp: `${localDate}T${hour}:00:00-07:00`, temperature: { value: { en: hour - 4 } }, condition: { en: 'Cloudy' }, lop: { value: { en: 40 } } })) },
  } }] } }));
  await openWeather(page);
  await expect(page.locator('.wx-temperature')).toHaveText('14°');
  await expect(page.locator('.wx-overview-foot')).toContainText('Vancouver Harbour');
  await expect(page.locator('.wx-hours time')).toHaveText(['19:00', '20:00']);
  await expect(page.locator('.wx-forecast-credit')).toContainText('加拿大 ECCC / MSC');
  expect(modelCalls).toHaveLength(0);
});

test('offline refresh retains saved official and model provenance with a stale-data notice', async ({ page, context }) => {
  await seed(page, [day('名古屋', 'JP', 'Asia/Tokyo')]);
  let offline = false;
  await routeJma(page, { unavailable: () => offline });
  await routeModel(page, () => offline ? null : modelFixture({ timezone: 'Asia/Tokyo' }));
  await openWeather(page);
  await expect(page.locator('.wx-temperature')).toHaveText('27°');
  const before = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('wx_compact_v5:'))));
  expect(Object.keys(before)).toHaveLength(1);
  await page.reload();
  await expect(page.locator('.wx-overview-top')).toContainText('已儲存資料');
  offline = true;
  await context.setOffline(true);
  await page.getByRole('button', { name: '重新整理天氣' }).click();
  await expect(page.locator('.wx-overview-top')).toContainText('上次資料 · 更新失敗');
  await expect(page.locator('.wx-bulletin')).toContainText('日本氣象廳 JMA');
  await expect(page.locator('.wx-forecast-credit')).toContainText('JMA 模型 · Open-Meteo');
  await expect(page.locator('.wx-provenance')).toContainText('更新失敗，顯示上次資料');
  await expect(page.locator('.wx-temperature')).toHaveText('27°');
  const after = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('wx_compact_v5:'))));
  expect(after).toEqual(before);
});

test('explicit refresh bypasses report and HTTP caches', async ({ page }) => {
  await seed(page, [day('台北', 'TW', 'Asia/Taipei')]);
  const requests = await routeModel(page, (_url, count) => modelFixture({ timezone: 'Asia/Taipei', temp: count === 1 ? 19 : 29 }));
  await openWeather(page);
  await expect(page.locator('.wx-hours strong').first()).toHaveText('19°');
  expect(requests).toHaveLength(1);
  await page.getByRole('button', { name: '重新整理天氣' }).click();
  await expect(page.locator('.wx-hours strong').first()).toHaveText('29°');
  expect(requests).toHaveLength(2);
});

test('past and beyond-range dates show actionable bounds without fetching substitute forecasts', async ({ page }) => {
  const itinerary = [day('台北', 'TW', 'Asia/Taipei', '2026-10-02'), { ...day('台北', 'TW', 'Asia/Taipei', '2026-10-20'), day: 2 }];
  await seed(page, itinerary);
  const calls = await routeModel(page, modelFixture({ timezone: 'Asia/Taipei' }));
  await openWeather(page);
  await expect(page.locator('.wx-hours')).toBeVisible();
  await page.getByRole('button', { name: 'Day 1 2026-10-02' }).click();
  await expect(page.getByRole('status')).toContainText('此日期已過');
  await expect(page.locator('.wx-hours')).toHaveCount(0);
  await page.getByRole('button', { name: 'Day 19 2026-10-20' }).click();
  await expect(page.getByRole('status')).toContainText('尚未進入預報範圍');
  expect(calls).toHaveLength(1);
  await page.getByRole('button', { name: '查看目的地今日天氣' }).click();
  await expect(page.locator('.wx-hours')).toBeVisible();
  expect(calls).toHaveLength(1);
});

test('switching trips never displays the previous trip report or legacy itinerary', async ({ page }) => {
  const hongKong = trip('weather_hk', 'Hong Kong trip', [day()]);
  const nagoya = trip('weather_jp', 'Nagoya trip', [day('名古屋', 'JP', 'Asia/Tokyo')]);
  await seed(page, [], { trips: [hongKong, nagoya] });
  await routeHko(page);
  await routeJma(page);
  await routeModel(page, (url) => modelFixture({ timezone: url.searchParams.get('timezone') }));
  await openWeather(page);
  await expect(page.locator('#wx-place-heading')).toHaveText('香港');
  await expect(page.locator('.wx-temperature')).toHaveText('28°');
  await page.getByRole('button', { name: '紀錄', exact: true }).click();
  await page.getByRole('button', { name: '選擇旅程 (Select Trip)', exact: true }).click();
  await page.getByRole('button', { name: /Nagoya trip.*名古屋/ }).click();
  await page.getByRole('button', { name: '天氣', exact: true }).click();
  await expect(page.locator('#wx-place-heading')).toHaveText('名古屋');
  await expect(page.locator('.wx-temperature')).toHaveText('27°');
  await expect(page.locator('.wx-station')).not.toContainText('香港天文台');
  await expect(page.getByRole('group', { name: '選擇預報地點' })).not.toContainText('香港');
});

test('city geocoding rejects a same-name result from a different country', async ({ page }) => {
  await seed(page, [{ ...day('Springfield', 'CA', 'America/Toronto'), city: 'Springfield' }]);
  const modelCalls = await routeModel(page);
  const lookups = [];
  await page.route('https://geocoding-api.open-meteo.com/**', (route) => {
    lookups.push(new URL(route.request().url()));
    return route.fulfill({ json: { results: [{ name: 'Springfield', latitude: 39.8, longitude: -89.6, country_code: 'US', country: 'United States', timezone: 'America/Chicago' }] } });
  });
  await openWeather(page);
  await expect(page.getByRole('heading', { name: '未能確認「Springfield」的位置' })).toBeVisible();
  expect(lookups).toHaveLength(1);
  expect(lookups[0].searchParams.get('countryCode')).toBe('CA');
  expect(modelCalls).toHaveLength(0);
  await expect(page.locator('.wx-temperature')).toHaveCount(0);
});

test('a regional model without the selected date falls back with honest attribution', async ({ page }) => {
  await seed(page, [day('首爾', 'KR', 'Asia/Seoul')]);
  const calls = await routeModel(page, (url) => modelFixture({ timezone: 'Asia/Seoul', dates: url.searchParams.has('models') ? ['2026-10-02'] : [TODAY] }));
  await openWeather(page);
  await expect(page.locator('.wx-hours')).toBeVisible();
  await expect(page.locator('.wx-forecast-credit').getByRole('link')).toHaveText('Open-Meteo（新分頁）');
  await expect(page.locator('.wx-provenance')).toContainText('KMA 模型 暫無此日期的可用預報');
  expect(calls.map((request) => new URL(request.url()).searchParams.get('models'))).toEqual(['kma_seamless', null]);
});

test('current location requests permission only on click, shows accuracy and country, and keeps coordinates out of storage', async ({ page, context }) => {
  const latitude = 22.278391234;
  const longitude = 114.178991234;
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude, longitude, accuracy: 25 });
  await seed(page, [day('名古屋', 'JP', 'Asia/Tokyo')]);
  await page.addInitScript(() => {
    window.__weatherLocationRequests = 0;
    const getPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = (...args) => {
      window.__weatherLocationRequests += 1;
      return getPosition(...args);
    };
  });
  await routeJma(page);
  await routeHko(page);
  const modelCalls = await routeModel(page, (url) => modelFixture({ timezone: url.searchParams.get('timezone') }));
  const reverseCalls = [];
  await page.route('https://api.bigdatacloud.net/**', (route) => {
    reverseCalls.push(new URL(route.request().url()));
    return route.fulfill({ json: { lookupSource: 'coordinates', city: 'Wan Chai', countryCode: 'HK', countryName: 'Hong Kong', localityInfo: { informative: [{ name: 'Asia/Hong_Kong', description: 'time zone' }] } } });
  });
  await openWeather(page);
  await expect(page.locator('#wx-place-heading')).toHaveText('名古屋');
  expect(await page.evaluate(() => window.__weatherLocationRequests)).toBe(0);
  expect(reverseCalls).toHaveLength(0);
  await page.getByRole('button', { name: '使用目前位置' }).click();
  await expect(page.locator('#wx-place-heading')).toHaveText('當前位置 · Wan Chai');
  await expect(page.locator('.wx-location-message[role="status"]')).toContainText('定位精度約 ±25 m · HK');
  await expect(page.locator('.wx-zone')).toContainText('Asia/Hong_Kong');
  await expect(page.locator('.wx-overview-foot')).toContainText('香港天文台 HKO');
  expect(await page.evaluate(() => window.__weatherLocationRequests)).toBe(1);
  expect(reverseCalls).toHaveLength(1);
  expect(reverseCalls[0].searchParams.get('latitude')).toBe(String(latitude));
  expect(reverseCalls[0].searchParams.get('longitude')).toBe(String(longitude));
  expect(modelCalls.some((request) => new URL(request.url()).searchParams.get('latitude') === String(latitude))).toBe(true);
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(storage).not.toContain(String(latitude));
  expect(storage).not.toContain(String(longitude));
  expect(storage).not.toContain('device-location');
});

test('denied location permission explains recovery and preserves the selected destination', async ({ page }) => {
  await seed(page);
  await routeHko(page);
  await routeModel(page);
  await page.addInitScript(() => {
    window.__weatherLocationRequests = 0;
    navigator.geolocation.getCurrentPosition = (_success, failure) => {
      window.__weatherLocationRequests += 1;
      failure({ code: 1, message: 'Permission denied' });
    };
  });
  const reverseCalls = [];
  await page.route('https://api.bigdatacloud.net/**', (route) => {
    reverseCalls.push(route.request().url());
    return route.fulfill({ json: {} });
  });
  await openWeather(page);
  await expect(page.locator('.wx-temperature')).toHaveText('28°');
  expect(await page.evaluate(() => window.__weatherLocationRequests)).toBe(0);
  await page.getByRole('button', { name: '使用目前位置' }).click();
  await expect(page.getByRole('alert')).toContainText('定位權限已被拒絕');
  await expect(page.getByRole('alert')).toContainText('瀏覽器網站設定');
  await expect(page.locator('#wx-place-heading')).toHaveText('香港');
  await expect(page.locator('.wx-temperature')).toHaveText('28°');
  await expect(page.getByRole('button', { name: '使用目前位置' })).toBeEnabled();
  expect(reverseCalls).toHaveLength(0);
});
