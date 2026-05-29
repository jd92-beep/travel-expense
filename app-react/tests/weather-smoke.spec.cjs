const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

function trustAndState(state) {
  return {
    lastTab: 'weather',
    ...state,
  };
}

function weatherFixture() {
  const dates = ['2026-04-20', '2026-04-21', '2026-04-22', '2026-04-23', '2026-04-24', '2026-04-25'];
  const hours = [9, 12, 16, 21];
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
      temperature_2m.push(21);
      apparent_temperature.push(20);
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

async function installState(page, state) {
  await page.addInitScript((payload) => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    if (payload.credentialSession) {
      localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
        credentialSession: payload.credentialSession,
        credentialSessionExpiresAt: payload.credentialSessionExpiresAt,
      }));
    }
    localStorage.setItem('boss-japan-tracker', JSON.stringify(payload));
  }, trustAndState(state));
}

test('Japan weather uses JMA candidate and renders slots', async ({ page }) => {
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
  await page.route('https://api.open-meteo.com/**', async (route) => {
    urls.push(route.request().url());
    await route.fulfill({ json: weatherFixture() });
  });
  await installState(page, {});
  await page.goto('http://localhost:8902/travel-expense/react/');
  await expect(page.getByText('天氣預報')).toBeVisible();
  await expect(page.getByText(/Day 1 · JMA/)).toBeVisible();
  await expect(page.getByText('21°C').first()).toBeVisible();
  await expect(page.locator('.temp-num').first()).not.toHaveCSS('-webkit-text-fill-color', 'rgba(0, 0, 0, 0)');
  await expect(page.getByText('09:00').first()).toBeVisible();
  await expect(page.getByText('12:00').first()).toBeVisible();
  await expect(page.getByText('16:00').first()).toBeVisible();
  await expect(page.getByText('21:00').first()).toBeVisible();
  await expect(page.locator('[aria-label="體感 20°C"]').first()).toBeVisible();
  await expect(page.getByText(/濕度 62%/).first()).toBeVisible();
  await expect(page.getByText(/UV 6|UV 2/).first()).toBeVisible();
  expect(urls.some((url) => url.includes('models=jma_seamless'))).toBe(true);
});

test('WeatherAPI broker forecast is preferred when broker session is active', async ({ page }) => {
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
  let brokerCalls = 0;
  let openMeteoCalls = 0;
  const brokerPayloads = [];
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/weather/forecast', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:8902',
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
      headers: { 'Access-Control-Allow-Origin': 'http://localhost:8902' },
      json: { ok: true, data: { ...weatherFixture(), source: 'WeatherAPI.com' } },
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
  await page.goto('http://localhost:8902/travel-expense/react/');
  await expect(page.getByText(/Day 1 · WeatherAPI.com/)).toBeVisible();
  await expect(page.getByText('21°C').first()).toBeVisible();
  expect(brokerCalls).toBeGreaterThan(0);
  expect(brokerPayloads.some((payload) => Math.abs(payload.lat - 35.1815) < 0.0001 && Math.abs(payload.lon - 136.9066) < 0.0001)).toBe(true);
  expect(openMeteoCalls).toBe(0);
});

test('Non-Japan trip uses Open-Meteo without JMA', async ({ page }) => {
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
  await page.route('https://api.open-meteo.com/**', async (route) => {
    urls.push(route.request().url());
    await route.fulfill({ json: weatherFixture() });
  });
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
  await page.goto('http://localhost:8902/travel-expense/react/');
  await expect(page.getByText('San Francisco').first()).toBeVisible();
  await expect(page.getByText('Day 1 · Open-Meteo')).toBeVisible();
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.every((url) => !url.includes('models=jma_seamless'))).toBe(true);
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
  await page.goto('http://localhost:8902/travel-expense/react/');
  await expect(page.getByText('未有座標')).toBeVisible();
  expect(requestCount).toBe(0);
});

test('City and country names are geocoded when itinerary has no coordinates', async ({ page }) => {
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
  await page.goto('http://localhost:8902/travel-expense/react/');
  await expect(page.getByText('Paris').first()).toBeVisible();
  await expect(page.getByText('Day 1 · Open-Meteo')).toBeVisible();
  await expect(page.getByText('21°C').first()).toBeVisible();
  expect(geocodeUrls.some((url) => url.includes('name=Paris%20France'))).toBe(true);
  expect(forecastUrls.some((url) => url.includes('latitude=48.8566') && url.includes('longitude=2.3522'))).toBe(true);
});

test('Jeju Korea city fallback chooses the South Korea geocoding result', async ({ page }) => {
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
  await page.goto('http://localhost:8902/travel-expense/react/');
  await expect(page.getByText('Day 1 · Open-Meteo')).toBeVisible();
  await expect(page.getByText('21°C').first()).toBeVisible();
  expect(geocodeUrls.some((url) => url.includes('name=Jeju%20South%20Korea'))).toBe(true);
  expect(geocodeUrls.some((url) => url.includes('name=Jeju') && url.includes('count=10'))).toBe(true);
  expect(forecastUrls.some((url) => url.includes('latitude=33.50972') && url.includes('longitude=126.52194'))).toBe(true);
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
  await page.route('https://api.open-meteo.com/**', async (route) => {
    urls.push(route.request().url());
    await route.fulfill({ json: weatherFixture() });
  });
  await installState(page, {
    tripName: 'Multi City',
    tripDateRange: { start: '2026-04-21', end: '2026-04-21' },
    customItinerary: [{
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
    }],
  });
  await page.goto('http://localhost:8902/travel-expense/react/');
  await expect(page.getByText('天氣預報')).toBeVisible();
  await expect(page.locator('.weather-location h3')).toHaveText(['高山', '白川鄉']);
  await expect(page.locator('.live-badge')).toHaveCount(2);
  expect(urls.length).toBeGreaterThanOrEqual(2);
});
