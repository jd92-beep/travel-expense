const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

function trustAndState(state) {
  const itinerary = Array.isArray(state.customItinerary) ? state.customItinerary : [];
  // Empty fixture = the default Nagoya trip. getItinerary only falls back to the built-in
  // ITINERARY constant when the trip IS the default Nagoya trip (name + 04-20..04-25 range).
  const isBareFixture = !itinerary.length && !state.tripName && !(Array.isArray(state.trips) && state.trips.length);
  const startDate = state.tripDateRange?.start || itinerary[0]?.date || '2026-04-20';
  const endDate = state.tripDateRange?.end || itinerary[itinerary.length - 1]?.date || (isBareFixture ? '2026-04-25' : startDate);
  const tripCurrency = state.tripCurrency || itinerary[0]?.currency || 'JPY';
  const tripId = state.activeTripId || `weather_trip_${String(state.tripName || state.customItinerary?.[0]?.region || 'fixture').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
  const trips = Array.isArray(state.trips) && state.trips.length ? state.trips : [{
    id: tripId,
    name: state.tripName || (isBareFixture ? '名古屋 2026' : 'Weather Test'),
    destinationSummary: itinerary.map((day) => day.region).filter(Boolean).slice(0, 4).join(' / ') || state.tripName || 'Weather Test',
    startDate,
    endDate,
    homeCurrency: 'HKD',
    currencies: Array.from(new Set(['HKD', tripCurrency])),
    timezones: Array.from(new Set(itinerary.map((day) => day.timezone).filter(Boolean).concat('Asia/Tokyo'))),
    version: 1,
    active: true,
    archived: false,
    budget: state.budget || 150000,
    itinerary,
    createdAt: 1,
    updatedAt: 1,
    sourceId: `trip_${tripId}`,
  }];
  return {
    ...state,
    schemaVersion: 3,
    lastTab: state.lastTab || 'weather',
    activeTripId: tripId,
    customItinerary: itinerary,
    trips,
  };
}

function weatherFixture(options = {}) {
  const dates = options.dates || ['2026-04-20', '2026-04-21', '2026-04-22', '2026-04-23', '2026-04-24', '2026-04-25'];
  const temp = options.temp ?? 21;
  const feels = options.feels ?? 20;
  const hours = [9, 12, 16, 21];
  const hourlyTemps = options.hourlyTemps || {};
  const hourlyFeels = options.hourlyFeels || {};
  const time = [];
  const temperature_2m = [];
  const apparent_temperature = [];
  const weather_code = [];
  const precipitation_probability = [];
  const precipitation = [];
  const relative_humidity_2m = [];
  const wind_speed_10m = [];
  const wind_direction_10m = [];
  const wind_gusts_10m = [];
  const cloud_cover = [];
  const uv_index = [];
  for (const date of dates) {
    for (const hour of hours) {
      time.push(`${date}T${String(hour).padStart(2, '0')}:00`);
      temperature_2m.push(hourlyTemps[hour] ?? temp);
      apparent_temperature.push(hourlyFeels[hour] ?? feels);
      weather_code.push(1);
      precipitation_probability.push(18);
      precipitation.push(0.2);
      relative_humidity_2m.push(62);
      wind_speed_10m.push(13);
      wind_direction_10m.push(240);
      wind_gusts_10m.push(24);
      cloud_cover.push(35);
      uv_index.push(hour === 12 ? 6 : 2);
    }
  }
  return { hourly: { time, temperature_2m, apparent_temperature, weather_code, precipitation_probability, precipitation, relative_humidity_2m, wind_speed_10m, wind_direction_10m, wind_gusts_10m, cloud_cover, uv_index } };
}

function jmaForecastFixture(options = {}) {
  const date = options.date || '2026-04-20';
  const temp = String(options.temp ?? 21);
  const rain = String(options.rain ?? 18);
  const code = String(options.code ?? 101);
  return [{
    publishingOffice: '名古屋地方気象台',
    reportDatetime: `${date}T11:00:00+09:00`,
    timeSeries: [
      {
        timeDefines: [`${date}T11:00:00+09:00`, '2026-04-21T00:00:00+09:00', '2026-04-22T00:00:00+09:00'],
        areas: [{ area: { name: '西部', code: '230010' }, weatherCodes: [code, code, code] }],
      },
      {
        timeDefines: [`${date}T00:00:00+09:00`, `${date}T06:00:00+09:00`, `${date}T12:00:00+09:00`, `${date}T18:00:00+09:00`],
        areas: [{ area: { name: '西部', code: '230010' }, pops: [rain, rain, rain, rain] }],
      },
      {
        timeDefines: [`${date}T09:00:00+09:00`, `${date}T00:00:00+09:00`, '2026-04-21T00:00:00+09:00', '2026-04-21T09:00:00+09:00'],
        areas: [{ area: { name: '名古屋', code: '51106' }, temps: [temp, temp, String(Number(temp) - 4), String(Number(temp) + 2)] }],
      },
    ],
  }];
}

async function routeJmaOfficial(page, options = {}) {
  const calls = [];
  await page.route('https://www.jma.go.jp/bosai/forecast/data/forecast/**', async (route) => {
    calls.push(route.request().url());
    if (options.failForecast) {
      await route.fulfill({ status: 503, body: 'JMA official unavailable' });
      return;
    }
    await route.fulfill({ json: jmaForecastFixture(options) });
  });
  await page.route('https://www.jma.go.jp/bosai/amedas/data/latest_time.txt', async (route) => {
    calls.push(route.request().url());
    await route.fulfill({ contentType: 'text/plain', body: `${options.date || '2026-04-20'}T10:00:00+09:00` });
  });
  await page.route('https://www.jma.go.jp/bosai/amedas/data/map/**', async (route) => {
    calls.push(route.request().url());
    await route.fulfill({
      json: {
        '51106': {
          temp: [options.temp ?? 21, 0],
          humidity: [options.humidity ?? 62, 0],
          precipitation1h: [options.precipitation ?? 0.2, 0],
          windDirection: [13, 0],
          wind: [3.6, 0],
        },
      },
    });
  });
  return calls;
}

async function routeNwsOfficial(page, options = {}) {
  const calls = [];
  const date = options.date || '2026-04-20';
  await page.route('https://api.weather.gov/points/**', async (route) => {
    calls.push(route.request().url());
    if (options.fail) {
      await route.fulfill({ status: 503, body: 'NWS unavailable' });
      return;
    }
    await route.fulfill({
      json: {
        properties: {
          forecastHourly: 'https://api.weather.gov/gridpoints/MTR/85,105/forecast/hourly',
          timeZone: 'America/Los_Angeles',
        },
      },
    });
  });
  await page.route('https://api.weather.gov/gridpoints/**/forecast/hourly', async (route) => {
    calls.push(route.request().url());
    await route.fulfill({
      json: {
        properties: {
          periods: [9, 12, 16, 21].map((hour) => ({
            startTime: `${date}T${String(hour).padStart(2, '0')}:00:00-07:00`,
            temperature: options.tempF?.[hour] ?? 68,
            temperatureUnit: 'F',
            shortForecast: hour === 12 ? 'Sunny' : 'Mostly Cloudy',
            probabilityOfPrecipitation: { value: hour === 21 ? 30 : 10 },
            relativeHumidity: { value: 64 },
            windSpeed: '8 mph',
          })),
        },
      },
    });
  });
  return calls;
}

async function routeSingaporeOfficial(page, options = {}) {
  const calls = [];
  await page.route('https://api-open.data.gov.sg/v2/real-time/api/**', async (route) => {
    const url = route.request().url();
    calls.push(url);
    const endpoint = url.split('/').pop();
    if (endpoint === 'two-hr-forecast') {
      await route.fulfill({
        json: {
          code: 0,
          data: {
            area_metadata: [{ name: 'City', label_location: { latitude: 1.292, longitude: 103.844 } }],
            items: [{ forecasts: [{ area: 'City', forecast: options.forecast || 'Cloudy' }] }],
          },
        },
      });
      return;
    }
    const values = {
      'air-temperature': options.temp ?? 30,
      'relative-humidity': options.humidity ?? 74,
      rainfall: options.rain ?? 0.4,
      'wind-speed': options.wind ?? 12,
      'wind-direction': options.windDirection ?? 180,
    };
    await route.fulfill({
      json: {
        code: 0,
        data: {
          stations: [{ id: 'S111', name: 'Scotts Road', location: { latitude: 1.3106, longitude: 103.8365 } }],
          readings: [{ timestamp: '2026-04-20T10:00:00+08:00', data: [{ stationId: 'S111', value: values[endpoint] ?? 0 }] }],
        },
        errorMsg: '',
      },
    });
  });
  return calls;
}

async function routeMscOfficial(page, options = {}) {
  const calls = [];
  await page.route('https://api.weather.gc.ca/collections/citypageweather-realtime/items**', async (route) => {
    calls.push(route.request().url());
    if (options.fail) {
      await route.fulfill({ status: 503, body: 'MSC unavailable' });
      return;
    }
    await route.fulfill({
      json: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          id: 'bc-74',
          geometry: { type: 'Point', coordinates: [-123.12, 49.28] },
          properties: {
            name: { en: 'Vancouver', fr: 'Vancouver' },
            currentConditions: {
              temperature: { value: { en: options.temp ?? 14 } },
              humidex: { value: { en: options.feels ?? 16 } },
              relativeHumidity: { value: { en: options.humidity ?? 82 } },
              condition: { en: options.condition || 'Cloudy' },
              wind: {
                speed: { value: { en: 10 } },
                gust: { value: { en: 20 } },
                bearing: { value: { en: 270 } },
              },
            },
          },
        }],
      },
    });
  });
  return calls;
}

async function installState(page, state) {
  await page.addInitScript((payload) => {
    window.__disable_supabase_configured = true;
    Object.defineProperty(window, 'indexedDB', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    if (payload.credentialSession) {
      localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
        credentialSession: payload.credentialSession,
        credentialSessionExpiresAt: payload.credentialSessionExpiresAt,
      }));
    }
    for (const [key, value] of Object.entries(payload.weatherCache || {})) {
      localStorage.setItem(key, JSON.stringify(value));
    }
    localStorage.setItem('boss-japan-tracker', JSON.stringify(payload));
  }, trustAndState(state));
}

test('Weather tab auto-jumps from Scan to the current live day slot', async ({ page }) => {
  const fixed = new Date('2026-06-14T14:20:00+09:00').valueOf();
  await page.addInitScript((fixedNow) => {
    window.__disable_supabase_configured = true;
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    window.Date = MockDate;
  }, fixed);
  await page.route('https://api.open-meteo.com/**', async (route) => {
    await route.fulfill({
      json: weatherFixture({
        dates: ['2026-06-14', '2026-06-15'],
        hourlyTemps: { 9: 22, 12: 27, 16: 25, 21: 23 },
        hourlyFeels: { 9: 24, 12: 30, 16: 28, 21: 25 },
      }),
    });
  });
  await installState(page, {
    lastTab: 'scan',
    tripName: '濟州2026',
    tripCurrency: 'KRW',
    tripDateRange: { start: '2026-06-13', end: '2026-06-15' },
    customItinerary: [
      {
        date: '2026-06-13',
        day: 1,
        region: '西歸浦',
        city: 'Seogwipo',
        country: 'South Korea',
        timezone: 'Asia/Seoul',
        currency: 'KRW',
        spots: [
          { time: '09:45', name: '道頭洞彩虹海岸道路', type: 'ticket', lat: 33.5152, lon: 126.4924 },
          { time: '14:00', name: 'Osulloc Tea Museum', type: 'ticket', lat: 33.3059, lon: 126.2895 },
        ],
      },
      {
        date: '2026-06-14',
        day: 2,
        region: '南部花景＋西歸浦',
        city: 'Seogwipo',
        country: 'South Korea',
        timezone: 'Asia/Seoul',
        currency: 'KRW',
        spots: [
          { time: '09:15', name: 'Cafe Gyulkkot Darak 橘子咖啡廳', type: 'food', lat: 33.2887, lon: 126.4059 },
          { time: '10:30', name: 'Camellia Hill 山茶花之丘', type: 'ticket', lat: 33.2899, lon: 126.3691 },
          { time: '12:30', name: '風爐 西歸浦黑豬肉', type: 'food', lat: 33.2524, lon: 126.5618 },
          { time: '15:15', name: '休愛里自然公園', type: 'ticket', lat: 33.3088, lon: 126.6358 },
          { time: '18:15', name: '西歸浦每日偶來市場', type: 'food', lat: 33.2496, lon: 126.5638 },
        ],
      },
      {
        date: '2026-06-15',
        day: 3,
        region: '牛島＋城山日出峰',
        city: 'Jeju',
        country: 'South Korea',
        timezone: 'Asia/Seoul',
        currency: 'KRW',
        spots: [
          { time: '10:00', name: 'BLANC ROCHER', type: 'food', lat: 33.5001, lon: 126.9513 },
          { time: '17:00', name: '城山日出峰', type: 'ticket', lat: 33.4591, lon: 126.9405 },
        ],
      },
    ],
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.getByRole('main').getByRole('heading', { name: /掃描收據/ })).toBeVisible();
  await page.getByLabel('主要分頁').getByRole('button', { name: '天氣', exact: true }).click();
  const liveSlot = page.locator('[data-weather-day="2026-06-14"] [data-weather-live="true"]').first();
  await expect(liveSlot).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  const metrics = await liveSlot.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      scrollY: window.scrollY,
      top: rect.top,
      bottom: rect.bottom,
      center: rect.top + rect.height / 2,
      viewport: window.innerHeight,
      activeDay: node.closest('[data-weather-day]')?.getAttribute('data-weather-day') || '',
      text: node.textContent || '',
    };
  });
  expect(metrics.activeDay, JSON.stringify(metrics, null, 2)).toBe('2026-06-14');
  expect(metrics.text, JSON.stringify(metrics, null, 2)).toContain('LIVE');
  expect(metrics.scrollY, JSON.stringify(metrics, null, 2)).toBeGreaterThan(240);
  expect(metrics.center, JSON.stringify(metrics, null, 2)).toBeGreaterThan(110);
  expect(metrics.center, JSON.stringify(metrics, null, 2)).toBeLessThan(metrics.viewport - 110);
});

test('Japan weather uses JMA official first and renders slots', async ({ page }) => {
  const fixed = new Date('2026-04-20T10:00:00+09:00').valueOf();
  await page.addInitScript((fixedNow) => {
    window.__disable_supabase_configured = true;
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    window.Date = MockDate;
  }, fixed);
  const urls = [];
  const jmaCalls = await routeJmaOfficial(page);
  await page.route('https://api.open-meteo.com/**', async (route) => {
    urls.push(route.request().url());
    await route.fulfill({ json: weatherFixture() });
  });
  await installState(page, {});
  await page.goto('http://localhost:8903/travel-expense/compact/#weather');
  await expect(page.getByRole('main').getByRole('heading', { name: '天氣預報' })).toBeVisible();
  await expect(page.getByText(/Day 1 · JMA official/)).toBeVisible();
  const command = page.locator('.weather-command-fancy');
  await expect(command.locator('.weather-target-pill .status-pill')).toHaveCount(1);
  await expect(command.locator('.weather-target-pill')).toContainText('Today');
  await expect(command).not.toContainText('刷新');
  await expect(command.getByLabel('刷新天氣')).toBeVisible();
  await expect(page.locator('.preview-weather-source-strip')).toContainText('Provider · JMA official');
  await expect(page.locator('.preview-weather-source-strip')).toContainText(/Live ·|Cache ·/);
  await expect(page.locator('.preview-weather-source-strip')).toContainText('Target · trip city');
  await expect(page.locator('.preview-weather-place')).toContainText('名古屋');
  const commandMetrics = await command.evaluate((node) => {
    const card = node.getBoundingClientRect();
    const title = node.querySelector('.weather-command-row h2')?.getBoundingClientRect();
    const pill = node.querySelector('.weather-target-pill')?.getBoundingClientRect();
    const button = node.querySelector('.weather-refresh-icon')?.getBoundingClientRect();
    return {
      height: card.height,
      scrollWidth: document.documentElement.scrollWidth,
      titleRight: title?.right || 0,
      pillLeft: pill?.left || 0,
      buttonLeft: button?.left || 0,
      pillRight: pill?.right || 0,
    };
  });
  expect(commandMetrics.height, JSON.stringify(commandMetrics, null, 2)).toBeLessThanOrEqual(92);
  expect(commandMetrics.scrollWidth, JSON.stringify(commandMetrics, null, 2)).toBeLessThanOrEqual(390);
  expect(commandMetrics.pillLeft, JSON.stringify(commandMetrics, null, 2)).toBeGreaterThan(commandMetrics.titleRight);
  expect(commandMetrics.buttonLeft, JSON.stringify(commandMetrics, null, 2)).toBeGreaterThanOrEqual(commandMetrics.pillRight);
  const currentCardMetrics = await page.locator('.preview-weather-current-card').evaluate((node) => {
    const card = node.getBoundingClientRect();
    const selectors = [
      '.preview-weather-source-strip',
      '.preview-weather-hero-icon',
      '.preview-weather-temp',
      '.preview-weather-facts',
      '.preview-weather-hourly-rail',
    ];
    return {
      scrollWidth: document.documentElement.scrollWidth,
      cardHeight: card.height,
      children: selectors.map((selector) => {
        const rect = node.querySelector(selector)?.getBoundingClientRect();
        return {
          selector,
          found: Boolean(rect),
          top: rect?.top || 0,
          left: rect?.left || 0,
          right: rect?.right || 0,
          bottom: rect?.bottom || 0,
        };
      }),
      card: { top: card.top, left: card.left, right: card.right, bottom: card.bottom },
    };
  });
  expect(currentCardMetrics.scrollWidth, JSON.stringify(currentCardMetrics, null, 2)).toBeLessThanOrEqual(390);
  expect(currentCardMetrics.cardHeight, JSON.stringify(currentCardMetrics, null, 2)).toBeGreaterThan(210);
  for (const child of currentCardMetrics.children) {
    expect(child.found, JSON.stringify(currentCardMetrics, null, 2)).toBe(true);
    expect(child.left, JSON.stringify(currentCardMetrics, null, 2)).toBeGreaterThanOrEqual(currentCardMetrics.card.left - 1);
    expect(child.right, JSON.stringify(currentCardMetrics, null, 2)).toBeLessThanOrEqual(currentCardMetrics.card.right + 1);
    expect(child.bottom, JSON.stringify(currentCardMetrics, null, 2)).toBeLessThanOrEqual(currentCardMetrics.card.bottom + 1);
  }
  const weatherAtmosphere = await page.locator('.weather-command-fancy').evaluate((node) => getComputedStyle(node).backgroundImage);
  const weatherDrift = await page.locator('.weather-slot-detailed').first().evaluate((node) => getComputedStyle(node, '::after').animationName);
  expect(weatherAtmosphere).toContain('travel-ai-atlas');
  expect(weatherDrift).toContain('weather-sky-drift');
  await expect(page.getByText('21°C').first()).toBeVisible();
  await expect(page.locator('.temp-num').first()).not.toHaveCSS('-webkit-text-fill-color', 'rgba(0, 0, 0, 0)');
  await expect(page.getByText('09:00').first()).toBeVisible();
  await expect(page.getByText('12:00').first()).toBeVisible();
  await expect(page.getByText('16:00').first()).toBeVisible();
  await expect(page.getByText('21:00').first()).toBeVisible();
  await expect(page.locator('[aria-label="體感 20°C"]').first()).toBeVisible();
  // 濕度 deliberately removed from slot cards (Boss spec, v0.12.0).
  await expect(page.getByText(/濕度/)).toHaveCount(0);
  await expect(page.getByText(/UV 6|UV 2/).first()).toBeVisible();
  expect(jmaCalls.some((url) => url.includes('/forecast/data/forecast/230000.json'))).toBe(true);
  expect(urls.some((url) => url.includes('models=jma_seamless'))).toBe(true);
});

test('Japan weather shows fallback reason when JMA official fails and Open-Meteo succeeds', async ({ page }) => {
  const fixed = new Date('2026-04-20T10:00:00+09:00').valueOf();
  await page.addInitScript((fixedNow) => {
    window.__disable_supabase_configured = true;
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    window.Date = MockDate;
  }, fixed);
  await routeJmaOfficial(page, { failForecast: true });
  await page.route('https://api.open-meteo.com/**', async (route) => {
    if (route.request().url().includes('models=jma_seamless')) {
      await route.fulfill({ status: 503, body: 'JMA unavailable' });
      return;
    }
    await route.fulfill({ json: weatherFixture({ temp: 23, feels: 24 }) });
  });
  await installState(page, {});
  await page.goto('http://localhost:8903/travel-expense/compact/#weather');
  await expect(page.getByText(/Day 1 · Open-Meteo/)).toBeVisible();
  await expect(page.locator('.preview-weather-source-strip')).toContainText('Provider · Open-Meteo');
  await expect(page.locator('.weather-fallback-chip').first()).toContainText('Fallback ·');
  await expect(page.locator('.weather-fallback-chip').first()).toContainText('JMA official unavailable');
  await expect(page.getByText('23°C').first()).toBeVisible();
});

test('JMA official stays preferred when broker session is active', async ({ page }) => {
  const fixed = new Date('2026-04-20T13:30:00+09:00').valueOf();
  await page.addInitScript((fixedNow) => {
    window.__disable_supabase_configured = true;
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    window.Date = MockDate;
  }, fixed);
  let brokerCalls = 0;
  let openMeteoCalls = 0;
  const brokerPayloads = [];
  await routeJmaOfficial(page, { temp: 21, humidity: 62 });
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/weather/forecast', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:8903',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Travel-Session, X-Supabase-Auth',
        },
      });
      return;
    }
    brokerCalls += 1;
    const payload = route.request().postDataJSON();
    brokerPayloads.push(payload);
    await route.fulfill({
      headers: { 'Access-Control-Allow-Origin': 'http://localhost:8903' },
      json: { ok: true, data: { ...weatherFixture({ hourlyTemps: { 9: 22, 12: 27, 16: 24, 21: 23 }, hourlyFeels: { 9: 25, 12: 30, 16: 27, 21: 24 } }), source: 'WeatherAPI.com' } },
    });
  });
  await page.route('https://api.open-meteo.com/**', async (route) => {
    openMeteoCalls += 1;
    await route.fulfill({ json: weatherFixture() });
  });
  await installState(page, {
    credentialSession: 'test.session.token',
    credentialSessionExpiresAt: fixed + 60_000,
  });
  await page.goto('http://localhost:8903/travel-expense/compact/#weather');
  await expect(page.getByText(/Day 1 · JMA official/)).toBeVisible();
  await expect(page.locator('.preview-weather-source-strip')).toContainText('Provider · JMA official');
  await expect(page.locator('.weather-screen')).not.toContainText('WeatherAPI.com');
  await expect(page.locator('.preview-weather-source-strip')).toContainText('Target · trip city');
  await expect(page.locator('.preview-weather-temp strong')).toHaveText('21°C');
  await expect(page.locator('.preview-weather-temp small')).toContainText('體感 30°C');
  await expect(page.locator('.weather-slot-detailed .weather-temp-block').first().locator('.temp-num')).toContainText('21');
  await expect(page.locator('.weather-slot-detailed .weather-metrics .sun-tag').first()).toContainText(/UV \d+ · 雲\d+%/);
  const uvMetricFits = await page.locator('.weather-slot-detailed .sun-tag .metric-val').first().evaluate((node) => ({
    text: node.textContent,
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
  }));
  expect(uvMetricFits.scrollWidth, JSON.stringify(uvMetricFits, null, 2)).toBeLessThanOrEqual(uvMetricFits.clientWidth + 1);
  const liveMetricFits = await page.locator('.weather-slot-detailed .metric-val').evaluateAll((nodes) => nodes.map((node) => ({
    text: node.textContent,
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
  })));
  for (const metric of liveMetricFits) {
    expect(metric.scrollWidth, JSON.stringify(metric, null, 2)).toBeLessThanOrEqual(metric.clientWidth + 1);
  }
  const accentLineMetrics = await page.locator('.weather-slot-detailed').first().evaluate((node) => {
    const card = node.getBoundingClientRect();
    const header = node.querySelector('.weather-slot-header')?.getBoundingClientRect();
    const before = getComputedStyle(node, '::before');
    const lineTop = card.top + Number.parseFloat(before.top || '0');
    const lineBottom = lineTop + Number.parseFloat(before.height || '0');
    return {
      lineTop,
      lineBottom,
      headerTop: header?.top || 0,
      headerBottom: header?.bottom || 0,
      overlapsHeader: Boolean(header && lineBottom > header.top && lineTop < header.bottom),
    };
  });
  expect(accentLineMetrics.overlapsHeader, JSON.stringify(accentLineMetrics, null, 2)).toBe(false);
  expect(brokerCalls).toBeGreaterThan(0);
  expect(brokerPayloads.some((payload) => Math.abs(payload.lat - 35.1815) < 0.0001 && Math.abs(payload.lon - 136.9066) < 0.0001)).toBe(true);
  expect(openMeteoCalls).toBe(0);
});

test('Ended trip ignores stale same-coordinate cache and shows current forecast', async ({ page }) => {
  const fixed = new Date('2026-05-30T10:00:00+09:00').valueOf();
  let forecastCalls = 0;
  await page.addInitScript((fixedNow) => {
    window.__disable_supabase_configured = true;
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    window.Date = MockDate;
  }, fixed);
  await page.route('https://api.open-meteo.com/**', async (route) => {
    forecastCalls += 1;
    await route.fulfill({ json: weatherFixture({ dates: ['2026-05-30', '2026-05-31'], temp: 25, feels: 27 }) });
  });
  await installState(page, {
    tripName: 'Nagoya 2026',
    tripCurrency: 'JPY',
    tripDateRange: { start: '2026-04-20', end: '2026-04-25' },
    customItinerary: [{
      date: '2026-04-20',
      day: 1,
      region: '名古屋',
      city: 'Nagoya',
      country: 'Japan',
      timezone: 'Asia/Tokyo',
      spots: [{ time: '09:00', name: '名古屋站', type: 'transport', lat: 35.1815, lon: 136.9066 }],
    }],
    weatherCache: {
      'wx_react_v3_35.181_136.907': {
        ts: fixed,
        data: weatherFixture({ dates: ['2026-04-20'], temp: 19, feels: 18 }),
        source: 'JMA',
      },
    },
  });
  await routeJmaOfficial(page, { failForecast: true });

  await page.goto('http://localhost:8903/travel-expense/compact/#weather');
  await expect(page.getByRole('main').getByRole('heading', { name: '天氣預報' })).toBeVisible();
  await expect(page.getByText('旅程日期超出目前預報範圍')).toHaveCount(0);
  await expect(page.getByText('25°C').first()).toBeVisible();
  await expect(page.locator('[aria-label="體感 27°C"]').first()).toBeVisible();
  expect(forecastCalls).toBeGreaterThan(0);
});

test('Ended trip shows current weather for every itinerary day location', async ({ page }) => {
  const fixed = new Date('2026-05-30T10:00:00+09:00').valueOf();
  const forecastUrls = [];
  await page.addInitScript((fixedNow) => {
    window.__disable_supabase_configured = true;
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    window.Date = MockDate;
  }, fixed);
  await page.route('https://api.open-meteo.com/**', async (route) => {
    forecastUrls.push(route.request().url());
    await route.fulfill({ json: weatherFixture({ dates: ['2026-05-30', '2026-05-31'], temp: 26, feels: 28 }) });
  });
  await routeJmaOfficial(page, { failForecast: true });
  await installState(page, {});
  await page.goto('http://localhost:8903/travel-expense/compact/#weather');
  await expect(page.getByText('旅程日期超出目前預報範圍')).toHaveCount(0);
  await expect(page.getByText(/Day 1 · JMA/)).toBeVisible();
  await expect(page.getByText(/Day 6 · JMA/)).toBeVisible();
  await expect(page.locator('.weather-location h3').filter({ hasText: '名古屋' }).first()).toBeVisible();
  await expect(page.locator('.weather-location h3').filter({ hasText: '高山' }).first()).toBeVisible();
  await expect(page.locator('.weather-location h3').filter({ hasText: '金澤' }).first()).toBeVisible();
  await expect(page.locator('.weather-location h3').filter({ hasText: '香港' }).first()).toBeVisible();
  await expect(page.locator('.weather-location h3')).toHaveCount(12);
  await expect(page.locator('.preview-weather-place')).not.toHaveText('目前地點');
  await expect(page.locator('[aria-label^="體感"]').first()).toBeVisible();
  expect(forecastUrls.length).toBeGreaterThanOrEqual(10);
  expect(forecastUrls.some((url) => url.includes('models=jma_seamless'))).toBe(true);
});

test('US trip uses NWS official before Open-Meteo fallback fill', async ({ page }) => {
  const fixed = new Date('2026-04-20T10:00:00-07:00').valueOf();
  await page.addInitScript((fixedNow) => {
    window.__disable_supabase_configured = true;
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    window.Date = MockDate;
  }, fixed);
  const urls = [];
  const nwsCalls = await routeNwsOfficial(page, { tempF: { 9: 66, 12: 70, 16: 64, 21: 60 } });
  await page.route('https://api.open-meteo.com/**', async (route) => {
    urls.push(route.request().url());
    await route.fulfill({ json: weatherFixture({ hourlyTemps: { 9: 18, 12: 21, 16: 19, 21: 16 }, hourlyFeels: { 9: 17, 12: 20, 16: 18, 21: 15 } }) });
  });
  await routeJmaOfficial(page, { failForecast: true });
  await installState(page, {
    tripName: 'US 2026',
    tripCurrency: 'USD',
    tripDateRange: { start: '2026-04-20', end: '2026-04-20' },
    customItinerary: [{
      date: '2026-04-20',
      day: 1,
      region: 'San Francisco',
      city: 'San Francisco',
      country: 'US',
      timezone: 'America/Los_Angeles',
      currency: 'USD',
      spots: [{ time: '09:00', name: 'Ferry Building', type: 'other', lat: 37.7955, lon: -122.3937 }],
    }],
  });
  await page.goto('http://localhost:8903/travel-expense/compact/#weather');
  await expect(page.getByText('San Francisco').first()).toBeVisible();
  await expect(page.getByText('Day 1 · NWS official')).toBeVisible();
  await expect(page.locator('.preview-weather-source-strip')).toContainText('Provider · NWS official');
  await expect(page.locator('.weather-fallback-chip').first()).toContainText('NWS official missing some hourly fields');
  await expect(page.getByText('21°C').first()).toBeVisible();
  expect(nwsCalls.some((url) => url.includes('api.weather.gov/points/'))).toBe(true);
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.every((url) => !url.includes('models=jma_seamless'))).toBe(true);
});

test('Singapore trip uses NEA official live data with fallback fill', async ({ page }) => {
  const fixed = new Date('2026-04-20T10:30:00+08:00').valueOf();
  await page.addInitScript((fixedNow) => {
    window.__disable_supabase_configured = true;
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    window.Date = MockDate;
  }, fixed);
  const neaCalls = await routeSingaporeOfficial(page, { temp: 30, humidity: 74, forecast: 'Cloudy' });
  await page.route('https://api.open-meteo.com/**', async (route) => {
    await route.fulfill({ json: weatherFixture({ hourlyTemps: { 9: 29, 12: 31, 16: 30, 21: 28 }, hourlyFeels: { 9: 33, 12: 35, 16: 34, 21: 32 } }) });
  });
  await installState(page, {
    tripName: 'Singapore 2026',
    tripCurrency: 'SGD',
    tripDateRange: { start: '2026-04-20', end: '2026-04-20' },
    customItinerary: [{
      date: '2026-04-20',
      day: 1,
      region: 'Singapore City',
      city: 'Singapore',
      country: 'Singapore',
      timezone: 'Asia/Singapore',
      currency: 'SGD',
      spots: [{ time: '09:00', name: 'Marina Bay', type: 'ticket', lat: 1.283, lon: 103.86 }],
    }],
  });
  await page.goto('http://localhost:8903/travel-expense/compact/#weather');
  await expect(page.getByText(/Day 1 · NEA official/)).toBeVisible();
  await expect(page.locator('.preview-weather-source-strip')).toContainText('Provider · NEA official');
  await expect(page.getByText('30°C').first()).toBeVisible();
  expect(neaCalls.some((url) => url.includes('two-hr-forecast'))).toBe(true);
  expect(neaCalls.some((url) => url.includes('air-temperature'))).toBe(true);
});

test('Canada trip uses MSC official current conditions with fallback fill', async ({ page }) => {
  const fixed = new Date('2026-04-20T10:30:00-07:00').valueOf();
  await page.addInitScript((fixedNow) => {
    window.__disable_supabase_configured = true;
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    window.Date = MockDate;
  }, fixed);
  const mscCalls = await routeMscOfficial(page, { temp: 14, feels: 16, condition: 'Cloudy' });
  await page.route('https://api.open-meteo.com/**', async (route) => {
    await route.fulfill({ json: weatherFixture({ hourlyTemps: { 9: 13, 12: 15, 16: 16, 21: 12 }, hourlyFeels: { 9: 12, 12: 14, 16: 15, 21: 11 } }) });
  });
  await installState(page, {
    tripName: 'Canada 2026',
    tripCurrency: 'CAD',
    tripDateRange: { start: '2026-04-20', end: '2026-04-20' },
    customItinerary: [{
      date: '2026-04-20',
      day: 1,
      region: 'Vancouver',
      city: 'Vancouver',
      country: 'Canada',
      timezone: 'America/Vancouver',
      currency: 'CAD',
      spots: [{ time: '09:00', name: 'Canada Place', type: 'other', lat: 49.2888, lon: -123.1111 }],
    }],
  });
  await page.goto('http://localhost:8903/travel-expense/compact/#weather');
  await expect(page.getByText(/Day 1 · MSC official/)).toBeVisible();
  await expect(page.locator('.preview-weather-source-strip')).toContainText('Provider · MSC official');
  await expect(page.getByText('14°C').first()).toBeVisible();
  expect(mscCalls.some((url) => url.includes('citypageweather-realtime'))).toBe(true);
});

test('Missing coordinates show warning and do not crash', async ({ page }) => {
  let requestCount = 0;
  await page.route('https://geocoding-api.open-meteo.com/**', async (route) => {
    await route.fulfill({ json: { results: [] } });
  });
  await page.route('https://api.open-meteo.com/**', async (route) => {
    requestCount += 1;
    await route.fulfill({ json: weatherFixture() });
  });
  await installState(page, {
    tripName: 'No Coords',
    tripDateRange: { start: '2026-04-20', end: '2026-04-20' },
    customItinerary: [{
      date: '2026-04-20',
      day: 1,
      region: 'Unknown City',
      city: 'Unknown City',
      country: 'US',
      timezone: 'America/New_York',
      spots: [{ time: '09:00', name: 'Mystery Stop', type: 'other' }],
    }],
  });
  await page.goto('http://localhost:8903/travel-expense/compact/#weather');
  await expect(page.getByText('未有座標')).toBeVisible();
  expect(requestCount).toBe(0);
});

test('City and country names resolve a weather target when itinerary has no coordinates', async ({ page }) => {
  const fixed = new Date('2026-04-20T10:00:00+02:00').valueOf();
  const geocodeUrls = [];
  const forecastUrls = [];
  await page.addInitScript((fixedNow) => {
    window.__disable_supabase_configured = true;
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    window.Date = MockDate;
  }, fixed);
  await page.route('https://geocoding-api.open-meteo.com/**', async (route) => {
    geocodeUrls.push(route.request().url());
    await route.fulfill({
      json: {
        results: [{
          name: 'Paris',
          latitude: 48.8566,
          longitude: 2.3522,
          country: 'France',
          country_code: 'FR',
          timezone: 'Europe/Paris',
          population: 2148000,
        }],
      },
    });
  });
  await page.route('https://api.open-meteo.com/**', async (route) => {
    forecastUrls.push(route.request().url());
    await route.fulfill({ json: weatherFixture() });
  });
  await installState(page, {
    tripName: 'France 2026',
    tripCurrency: 'EUR',
    tripDateRange: { start: '2026-04-20', end: '2026-04-20' },
    customItinerary: [{
      date: '2026-04-20',
      day: 1,
      region: 'Paris',
      city: 'Paris',
      country: 'France',
      timezone: 'Europe/Paris',
      currency: 'EUR',
      spots: [{ time: '09:00', name: 'Louvre Museum', type: 'ticket' }],
    }],
  });
  await page.goto('http://localhost:8903/travel-expense/compact/#weather');
  await expect(page.getByText('Paris').first()).toBeVisible();
  await expect(page.getByText('Day 1 · Open-Meteo')).toBeVisible();
  await expect(page.getByText('21°C').first()).toBeVisible();
  expect(forecastUrls.length).toBeGreaterThan(0);
  expect(forecastUrls.every((url) => !url.includes('undefined'))).toBe(true);
  expect(geocodeUrls.every((url) => !url.includes('undefined'))).toBe(true);
});

test('Jeju Korea city fallback uses the South Korea weather target', async ({ page }) => {
  const fixed = new Date('2026-04-20T10:00:00+09:00').valueOf();
  const geocodeUrls = [];
  const forecastUrls = [];
  await page.addInitScript((fixedNow) => {
    window.__disable_supabase_configured = true;
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    window.Date = MockDate;
  }, fixed);
  await page.route('https://geocoding-api.open-meteo.com/**', async (route) => {
    const url = route.request().url();
    geocodeUrls.push(url);
    if (url.includes('name=Jeju%20South%20Korea')) {
      await route.fulfill({ json: { results: [] } });
      return;
    }
    await route.fulfill({
      json: {
        results: [
          { name: 'Jeju', latitude: 8.41667, longitude: 39.63333, country: 'Ethiopia', country_code: 'ET', timezone: 'Africa/Addis_Ababa' },
          { name: 'Jeju', latitude: -4.21679, longitude: -45.22522, country: 'Brazil', country_code: 'BR', timezone: 'America/Fortaleza' },
          { name: 'Jeju City', latitude: 33.50972, longitude: 126.52194, country: 'South Korea', country_code: 'KR', timezone: 'Asia/Seoul' },
        ],
      },
    });
  });
  await page.route('https://api.open-meteo.com/**', async (route) => {
    forecastUrls.push(route.request().url());
    await route.fulfill({ json: weatherFixture() });
  });
  await installState(page, {
    tripName: 'Korea 2026',
    tripCurrency: 'KRW',
    tripDateRange: { start: '2026-04-20', end: '2026-04-20' },
    customItinerary: [{
      date: '2026-04-20',
      day: 1,
      region: 'Jeju',
      city: 'Jeju',
      country: 'South Korea',
      timezone: 'Asia/Seoul',
      currency: 'KRW',
      spots: [{ time: '09:00', name: 'Seongsan Ilchulbong', type: 'ticket' }],
    }],
  });
  await page.goto('http://localhost:8903/travel-expense/compact/#weather');
  await expect(page.getByText('Day 1 · Open-Meteo')).toBeVisible();
  await expect(page.locator('.weather-location h3').filter({ hasText: '濟州' }).first()).toBeVisible();
  await expect(page.locator('.weather-location h3').filter({ hasText: 'Jeju City' })).toHaveCount(0);
  await expect(page.getByText('21°C').first()).toBeVisible();
  expect(geocodeUrls.every((url) => !url.includes('Ethiopia') && !url.includes('Brazil'))).toBe(true);
  expect(forecastUrls.some((url) => /latitude=33\./.test(url) && /longitude=126\./.test(url))).toBe(true);
});

// Regression: Boss's real Nagoya trip had 中部國際機場 stamped with Jeju-airport coords by an old
// unscoped geo lookup, so Day 1 rendered 濟州 weather. normalizeItinerary must self-heal stored
// coords that sit >150km from the name's dictionary entry.
test('Stale wrong-country spot coords self-heal and never show the wrong city', async ({ page }) => {
  const fixed = new Date('2026-04-20T10:00:00+09:00').valueOf();
  const forecastUrls = [];
  await page.addInitScript((fixedNow) => {
    window.__disable_supabase_configured = true;
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    window.Date = MockDate;
  }, fixed);
  await routeJmaOfficial(page);
  await page.route('https://api.open-meteo.com/**', async (route) => {
    forecastUrls.push(route.request().url());
    await route.fulfill({ json: weatherFixture() });
  });
  const poisonedItinerary = [{
    date: '2026-04-20',
    day: 1,
    region: '名古屋',
    timezone: 'Asia/Tokyo',
    currency: 'JPY',
    spots: [
      // Jeju airport coords baked in by the old bug — must be healed to Centrair (34.8584, 136.8124).
      { time: '10:00', name: '中部國際機場', type: 'transport', lat: 33.5113, lon: 126.493 },
      { time: '12:00', name: '名古屋城', type: 'sightseeing', lat: 35.1856, lon: 136.8995 },
    ],
  }];
  await installState(page, {
    tripName: '名古屋 2026',
    activeTripId: 'trip_2026_04_nagoya',
    tripDateRange: { start: '2026-04-20', end: '2026-04-20' },
    customItinerary: poisonedItinerary,
    trips: [{
      id: 'trip_2026_04_nagoya',
      name: '名古屋 2026',
      destinationSummary: '名古屋',
      startDate: '2026-04-20',
      endDate: '2026-04-20',
      homeCurrency: 'HKD',
      currencies: ['HKD', 'JPY'],
      timezones: ['Asia/Tokyo'],
      version: 1,
      active: true,
      archived: false,
      budget: 150000,
      itinerary: poisonedItinerary,
      createdAt: 1,
      updatedAt: 1,
      sourceId: 'trip_trip_2026_04_nagoya',
    }],
  });
  await page.goto('http://localhost:8903/travel-expense/compact/#weather');
  await expect(page.getByRole('main').getByRole('heading', { name: '天氣預報' })).toBeVisible();
  await expect(page.locator('.weather-location h3').first()).toBeVisible();
  await expect(page.locator('.weather-screen')).not.toContainText('濟州');
  await expect(page.locator('.weather-location h3').filter({ hasText: '名古屋' }).first()).toBeVisible();
  await expect.poll(() => forecastUrls.length).toBeGreaterThan(0);
  expect(forecastUrls.every((url) => !/latitude=33\.5/.test(url))).toBe(true);
});

test('Multi-city day renders two forecast locations and live slot', async ({ page }) => {
  const fixed = new Date('2026-04-21T10:30:00+09:00').valueOf();
  const urls = [];
  await page.addInitScript((fixedNow) => {
    window.__disable_supabase_configured = true;
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args) {
        super(...(args.length ? args : [fixedNow]));
      }
      static now() {
        return fixedNow;
      }
    }
    window.Date = MockDate;
  }, fixed);
  await routeJmaOfficial(page, { date: '2026-04-21' });
  await page.route('https://api.open-meteo.com/**', async (route) => {
    urls.push(route.request().url());
    await route.fulfill({ json: weatherFixture() });
  });
  const multiCityItinerary = [{
    date: '2026-04-21',
    day: 1,
    region: '飛驒高山/白川鄉 → 長野',
    country: 'JP',
    timezone: 'Asia/Tokyo',
    spots: [
      { time: '10:00', name: '高山陣屋', type: 'ticket' },
      { time: '14:30', name: '白川鄉 合掌村', type: 'ticket' },
      { time: '20:00', name: '長野溫泉酒店', type: 'lodging' },
    ],
  }];
  const multiCityState = {
    schemaVersion: 3,
    activeTripId: 'weather_multi_city_trip',
    tripName: 'Multi City',
    tripCurrency: 'JPY',
    tripDateRange: { start: '2026-04-21', end: '2026-04-21' },
    customItinerary: multiCityItinerary,
    trips: [{
      id: 'weather_multi_city_trip',
      name: 'Multi City',
      destinationSummary: '飛驒高山/白川鄉 → 長野',
      startDate: '2026-04-21',
      endDate: '2026-04-21',
      homeCurrency: 'HKD',
      currencies: ['HKD', 'JPY'],
      timezones: ['Asia/Tokyo'],
      version: 1,
      active: true,
      archived: false,
      budget: 150000,
      itinerary: multiCityItinerary,
      createdAt: 1,
      updatedAt: 1,
      sourceId: 'trip_weather_multi_city_trip',
    }],
  };
  await installState(page, multiCityState);
  await page.goto('http://localhost:8903/travel-expense/compact/#weather');
  await expect(page.getByRole('main').getByRole('heading', { name: '天氣預報' })).toBeVisible();
  await expect(page.locator('.weather-location h3')).toHaveText(['高山', '白川鄉', '長野']);
  await expect(page.locator('.live-badge')).toHaveCount(3);
  expect(urls.length).toBeGreaterThanOrEqual(3);
});
