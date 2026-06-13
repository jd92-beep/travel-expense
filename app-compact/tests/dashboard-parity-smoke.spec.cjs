const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

async function openDashboard(page, statsIncludeTransportLodging, extraState = {}) {
  await page.clock.install({ time: new Date('2026-05-08T10:00:00+08:00') });
  await page.addInitScript(({ includeToggle, extraState: extra }) => {
    window.__disable_supabase_configured = true;
    const fixedNow = new Date('2026-05-08T10:00:00+08:00').valueOf();
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    if (extra.credentialSession) {
      localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
        credentialSession: extra.credentialSession,
        credentialSessionExpiresAt: extra.credentialSessionExpiresAt || fixedNow + 60_000,
      }));
    }
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      schemaVersion: 3,
      lastTab: 'dashboard',
      budget: 20000,
      rate: 20,
      activeTripId: 'dash_trip',
      tripName: 'Dashboard Test',
      tripDateRange: { start: '2026-05-08', end: '2026-05-08' },
      customItinerary: [{ date: '2026-05-08', day: 1, region: 'Dashboard Test', spots: [{ time: '10:00', name: 'Dashboard Food', type: 'food' }] }],
      trips: [{
        id: 'dash_trip',
        name: 'Dashboard Test',
        destinationSummary: 'Dashboard Test',
        startDate: '2026-05-08',
        endDate: '2026-05-08',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Hong_Kong'],
        version: 1,
        active: true,
        itinerary: [{ date: '2026-05-08', day: 1, region: 'Dashboard Test', spots: [{ time: '10:00', name: 'Dashboard Food', type: 'food' }] }],
        createdAt: 1,
        updatedAt: 1,
      }],
      statsIncludeTransportLodging: includeToggle,
      receipts: [
        { id: 'dash_food', store: 'Dashboard Food', total: 1000, date: '2026-05-08', category: 'food', payment: 'cash', personId: 'p_boss', splitMode: 'shared', createdAt: 1 },
        { id: 'dash_flight', store: 'Dashboard Flight', total: 9000, date: '2026-05-08', category: 'flight', payment: 'credit', personId: 'p_boss', splitMode: 'shared', createdAt: 2 },
      ],
      ...extra,
    }));
  }, { includeToggle: statsIncludeTransportLodging, extraState });
  await page.goto('http://localhost:8903/travel-expense/compact/#dashboard');
  await expect(page.getByLabel('旅程總覽')).toBeVisible();
  await expect(page.locator('.today-itinerary-card').getByText('今日行程')).toHaveCount(1);
  await expect(page.getByText('Budget Settings')).toHaveCount(0);
  await expect(page.getByText('Notifications')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '更多操作' })).toHaveCount(0);
  await expect(page.locator('.compact-mobile-action.has-alert')).toHaveCount(0);
  await expect(page.getByText('預算控制')).toHaveCount(0);
  await expect(page.getByText('預算提醒')).toHaveCount(0);
  await expect(page.locator('.washi-budget-card')).toBeVisible();
  await expect(page.locator('.washi-today-stats-card .preview-dashboard-today-grid > div')).toHaveCount(3);
  await expect(page.locator('.washi-today-stats-card .preview-dashboard-today-chart')).toBeVisible();
}

test('Dashboard spending toggle matches legacy semantics for today stats but budget is consistent', async ({ browser }) => {
  const defaultContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const defaultPage = await defaultContext.newPage();
  await openDashboard(defaultPage, false);
  await expect(defaultPage.locator('.washi-today-stats-card').filter({ hasText: '今日支出' })).toContainText(/HK\$ (48|49|50)/);
  await expect(defaultPage.locator('.washi-budget-card').filter({ hasText: '已使用' })).toContainText('HK$ 500');
  await defaultContext.close();

  const flippedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const flippedPage = await flippedContext.newPage();
  await openDashboard(flippedPage, true);
  await expect(flippedPage.locator('.washi-today-stats-card').filter({ hasText: '今日支出' })).toContainText(/HK\$ (48\d|490|500)/);
  await expect(flippedPage.locator('.washi-budget-card').filter({ hasText: '已使用' })).toContainText('HK$ 500');
  await flippedContext.close();
});

test('Dashboard keeps Home simple without travel-day diagnostic cards', async ({ page }) => {
  await openDashboard(page, false);
  await expect(page.getByLabel('Travel day widgets')).toHaveCount(0);
  await expect(page.getByLabel('Itinerary receipt reconciliation')).toHaveCount(0);
  await expect(page.getByLabel('Trip snapshot')).toHaveCount(0);
  await expect(page.getByLabel('Departure checklist')).toHaveCount(0);
  await expect(page.getByLabel('Day-end closeout')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /旅程提醒/ })).toHaveCount(0);
  await expect(page.getByText('預算分析')).toHaveCount(0);
  await expect(page.getByText('行程時間線')).toHaveCount(0);
  await expect(page.locator('.dashboard-ai-coach')).toHaveCount(0);
  await expect(page.getByText('Local AI Coach')).toHaveCount(0);
  await expect(page.getByLabel('Broker AI assistant')).toHaveCount(0);
  await expect(page.locator('.today-itinerary-card')).toBeVisible();
});

test('Dashboard budget currency toggle follows active Korea trip currency', async ({ page }) => {
  await openDashboard(page, false, {
    budget: 1750000,
    tripCurrency: 'KRW',
    displayCurrency: 'JPY',
    activeTripId: 'dash_jeju_trip',
    tripName: '濟州2026',
    tripDateRange: { start: '2026-05-08', end: '2026-05-08' },
    customItinerary: [{
      date: '2026-05-08',
      day: 1,
      region: 'Jeju City',
      city: 'Jeju',
      country: 'South Korea',
      timezone: 'Asia/Seoul',
      currency: 'KRW',
      spots: [{ time: '10:00', name: 'Dongmun Market', type: 'food' }],
    }],
    trips: [{
      id: 'dash_jeju_trip',
      name: '濟州2026',
      destinationSummary: 'Jeju, South Korea',
      startDate: '2026-05-08',
      endDate: '2026-05-08',
      homeCurrency: 'HKD',
      currencies: ['HKD', 'KRW'],
      timezones: ['Asia/Seoul'],
      version: 1,
      active: true,
      itinerary: [{
        date: '2026-05-08',
        day: 1,
        region: 'Jeju City',
        city: 'Jeju',
        country: 'South Korea',
        timezone: 'Asia/Seoul',
        currency: 'KRW',
        spots: [{ time: '10:00', name: 'Dongmun Market', type: 'food' }],
      }],
      intelligence: { countryCode: 'KR', countryName: 'South Korea', primaryCurrency: 'KRW', themeKey: 'korea_editorial', timezone: 'Asia/Seoul', weatherRegion: 'Jeju' },
      createdAt: 1,
      updatedAt: 1,
    }],
    receipts: [
      { id: 'dash_krw_food', store: 'Dongmun Market', total: 175000, currency: 'KRW', originalCurrency: 'KRW', date: '2026-05-08', category: 'food', payment: 'cash', personId: 'p_boss', splitMode: 'shared', createdAt: 1 },
    ],
  });

  const budgetCard = page.locator('.washi-budget-card');
  await expect(budgetCard.locator('.preview-dashboard-currency')).toContainText('HKD');
  await expect(budgetCard.locator('.preview-dashboard-currency')).toContainText('KRW');
  await expect(budgetCard.locator('.preview-dashboard-currency')).not.toContainText('JPY');
  await expect(budgetCard).toContainText('₩ 175,000');
  const todayCard = page.locator('.washi-today-stats-card');
  await expect(todayCard.locator('.preview-dashboard-today-currency')).toContainText('HKD');
  await expect(todayCard.locator('.preview-dashboard-today-currency')).toContainText('KRW');
  await expect(todayCard).toContainText('₩ 175,000');
  await expect(todayCard).toContainText('HK$ 1,000');
  await expect(todayCard.locator('.preview-dashboard-today-chart')).toContainText('10%');
  await budgetCard.getByText('HKD').click();
  await expect(budgetCard).toContainText('HK$ 1,000');
  await expect(todayCard).toContainText('HK$ 1,000');
  await page.getByRole('button', { name: 'Add Expense' }).click();
  await expect(page.getByText('手動記一筆')).toBeVisible();
  await expect(page.getByLabel('原貨幣')).toHaveValue('KRW');
});

test('Dashboard new trip wizard lets users choose trip days on step two', async ({ page }) => {
  const tripIntelligenceCalls = [];
  await page.route('https://zh.wikivoyage.org/w/api.php**', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      query: {
        search: [
          { title: '城山日出峰', snippet: '濟州島著名火山口日出景點' },
          { title: '牛島', snippet: '濟州近海小島，適合踩單車和海岸線行程' },
        ],
      },
    }),
  }));
  await page.route('https://en.wikivoyage.org/w/api.php**', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ query: { search: [] } }),
  }));
  await page.route('**/kimi/json', async (route) => {
    const body = route.request().postDataJSON();
    tripIntelligenceCalls.push(body);
    const isStage1 = String(body.prompt || '').includes('stage 1 of a two-stage');
    if (isStage1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            organizedItinerary: `Day 1 (2026-05-08): Nagoya to Jeju.
Day 2 (2026-05-09): Jeju City.`,
          },
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            trip: {
              name: '濟州2026',
              destinationSummary: 'Jeju, South Korea',
              startDate: '2026-05-08',
              endDate: '2026-05-17',
              homeCurrency: 'HKD',
              currencies: ['HKD', 'KRW'],
              intelligence: {
                countryCode: 'KR',
                countryName: 'South Korea',
                primaryCurrency: 'KRW',
                themeKey: 'korea_editorial',
                locale: 'ko-KR',
                timezone: 'Asia/Seoul',
                weatherRegion: 'Jeju',
                confidence: 'high',
              },
              itinerary: [
                {
                  date: '2026-05-08',
                  day: 1,
                  region: '濟州東部',
                  city: 'Jeju',
                  country: 'South Korea',
                  timezone: 'Asia/Seoul',
                  currency: 'KRW',
                  highlight: '火山口與海岸',
                  spots: [
                    { time: '09:00', name: '城山日出峰', type: 'sightseeing', lat: 33.4580, lon: 126.9425, timezone: 'Asia/Seoul', note: '日出火山口' },
                    { time: '13:00', name: '牛島', type: 'localtour', lat: 33.5066, lon: 126.9534, timezone: 'Asia/Seoul', note: '海岸線' },
                  ],
                },
              ],
            },
            summary: 'Created Jeju day-by-day itinerary',
            warnings: [],
            changes: ['Generated Jeju itinerary from wizard details.'],
          },
        }),
      });
    }
  });

  await openDashboard(page, false, {
    credentialSession: 'wizard-trip-session',
    credentialSessionExpiresAt: new Date('2026-05-08T10:00:00+08:00').valueOf() + 60_000,
  });
  await page.getByRole('banner', { name: /Dashboard Test header/ }).locator('button').first().click();
  await page.getByRole('button', { name: /建立新旅程/ }).click();
  await expect(page.getByText('Step 1 of 4')).toBeVisible();

  await page.getByPlaceholder('例如：名古屋櫻花祭 2026').fill('Seoul Spring Trip');
  await page.getByPlaceholder('例如：濟州、首爾、名古屋、東京').fill('濟州');
  await expect(page.getByText('網上景點建議')).toBeVisible();
  await expect(page.getByRole('button', { name: '城山日出峰' }).first()).toBeVisible();
  await page.getByRole('button', { name: '城山日出峰' }).first().click();
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByText('Step 2 of 4')).toBeVisible();

  const dateInputs = page.locator('input[type="date"]');
  await expect(dateInputs.nth(0)).toHaveValue('2026-05-08');
  await expect(dateInputs.nth(1)).toHaveValue('2026-05-14');

  const daySelect = page.getByLabel('選擇旅程日數');
  await expect(daySelect).toHaveValue('7');
  await daySelect.selectOption('10');
  await expect(daySelect).toHaveValue('10');
  await expect(dateInputs.nth(1)).toHaveValue('2026-05-17');
  await expect(page.getByText('10 天').last()).toBeVisible();

  await page.getByRole('button', { name: '增加旅程日數' }).click();
  await expect(daySelect).toHaveValue('11');
  await expect(dateInputs.nth(1)).toHaveValue('2026-05-18');

  await page.getByRole('button', { name: '減少旅程日數' }).click();
  await expect(daySelect).toHaveValue('10');
  await expect(dateInputs.nth(1)).toHaveValue('2026-05-17');

  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByText('Step 3 of 4')).toBeVisible();
  await expect(page.getByLabel('主結算幣種')).toHaveValue('KRW');

  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.getByText('Step 4 of 4')).toBeVisible();
  await expect(page.getByText('濟州 景點靈感')).toBeVisible();
  await expect(page.locator('textarea')).toContainText('城山日出峰');
  await page.getByRole('button', { name: /完成創建/ }).click();
  await expect(page.getByText('Step 4 of 4')).toHaveCount(0);

  expect(tripIntelligenceCalls.length).toBe(2);
  expect(tripIntelligenceCalls[0].prompt).toContain('濟州');
  expect(tripIntelligenceCalls[0].model).toBe('kimi-code');

  const created = await page.evaluate(() => {
    const raw = localStorage.getItem('boss-japan-tracker');
    const state = raw ? JSON.parse(raw) : {};
    const trip = state.trips?.find((item) => item.id === state.activeTripId);
    return {
      activeTripId: state.activeTripId,
      tripName: state.tripName,
      tripCurrency: state.tripCurrency,
      itinerary: trip?.itinerary,
      customItinerary: state.customItinerary,
      syncQueue: state.syncQueue,
      countryCode: trip?.intelligence?.countryCode,
    };
  });
  expect(created.tripName).toBe('濟州2026');
  expect(created.tripCurrency).toBe('KRW');
  expect(created.countryCode).toBe('KR');
  expect(created.itinerary).toHaveLength(10);
  expect(created.itinerary[0].spots[0]).toMatchObject({ name: '城山日出峰', lat: 33.458, lon: 126.9425 });
  expect(created.customItinerary[0].spots[0].name).toBe('城山日出峰');
  expect(created.syncQueue.some((item) => item.type === 'trip' && item.op === 'create' && item.entityId === created.activeTripId && item.payload?.tripId === created.activeTripId)).toBe(true);

  await page.getByLabel('主要分頁').getByRole('button', { name: '行程', exact: true }).click();
  await expect(page.getByText('城山日出峰').first()).toBeVisible();
  await page.getByLabel('主要分頁').getByRole('button', { name: '天氣', exact: true }).click();
  await expect(page.getByText(/城山日出峰|濟州東部|Jeju/).first()).toBeVisible();
});

test('Dashboard new trip wizard tries LLM fallbacks before default scenery spots', async ({ page }) => {
  const calls = [];
  await page.route('https://zh.wikivoyage.org/w/api.php**', async (route) => route.fulfill({ json: { query: { search: [] } } }));
  await page.route('https://en.wikivoyage.org/w/api.php**', async (route) => route.fulfill({ json: { query: { search: [] } } }));

  await page.route('**/kimi/json', async (route) => {
    const body = route.request().postDataJSON();
    calls.push({ path: 'kimi', model: body.model });
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'kimi model unavailable' }),
    });
  });
  await page.route('**/google/json', async (route) => {
    const body = route.request().postDataJSON();
    calls.push({ path: 'google', model: body.model });
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'google fast trip fallback unavailable' }),
    });
  });
  await page.route('**/mimo/json', async (route) => {
    const body = route.request().postDataJSON();
    calls.push({ path: 'mimo', model: body.model });
    const isStage1 = String(body.prompt || '').includes('stage 1 of a two-stage');
    if (isStage1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            organizedItinerary: `Day 1 (2026-05-08): Nagoya to Jeju.
Day 2 (2026-05-09): Jeju City.`,
          },
        }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: {
            trip: {
              name: '濟州2026',
              destinationSummary: 'Jeju, South Korea',
              startDate: '2026-05-08',
              endDate: '2026-05-10',
              homeCurrency: 'HKD',
              currencies: ['HKD', 'KRW'],
              intelligence: {
                countryCode: 'KR',
                countryName: 'South Korea',
                primaryCurrency: 'KRW',
                themeKey: 'korea_editorial',
                locale: 'ko-KR',
                timezone: 'Asia/Seoul',
                weatherRegion: 'Jeju',
                confidence: 'medium',
              },
              itinerary: [{
                date: '2026-05-08',
                day: 1,
                region: 'LLM Jeju',
                city: 'Jeju',
                country: 'South Korea',
                timezone: 'Asia/Seoul',
                currency: 'KRW',
                spots: [{ time: '10:00', name: 'Mimo Jeju Observatory', type: 'sightseeing', lat: 33.4996, lon: 126.5312, timezone: 'Asia/Seoul' }],
              }],
            },
            summary: 'Mimo fallback created Jeju itinerary',
            warnings: [],
            changes: ['Used fallback LLM after primary failure.'],
          },
        }),
      });
    }
  });

  await openDashboard(page, false, {
    credentialSession: 'wizard-fallback-session',
    credentialSessionExpiresAt: new Date('2026-05-08T10:00:00+08:00').valueOf() + 60_000,
  });
  await page.getByRole('banner', { name: /Dashboard Test header/ }).locator('button').first().click();
  await page.getByRole('button', { name: /建立新旅程/ }).click();
  await page.getByPlaceholder('例如：名古屋櫻花祭 2026').fill('濟州2026');
  await page.getByPlaceholder('例如：濟州、首爾、名古屋、東京').fill('濟州');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByLabel('選擇旅程日數').selectOption('3');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('textarea').fill('想去濟州自然景點同咖啡店，請安排每日行程。');
  await page.getByRole('button', { name: /完成創建/ }).click();
  await expect(page.getByText('Step 4 of 4')).toHaveCount(0);

  expect(calls.map((call) => call.path)).toEqual(['mimo', 'mimo']);
  expect(calls.every((call) => call.model)).toBe(true);
  const created = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('boss-japan-tracker') || '{}');
    const trip = state.trips?.find((item) => item.id === state.activeTripId);
    return {
      tripCurrency: state.tripCurrency,
      firstSpot: trip?.itinerary?.[0]?.spots?.[0]?.name,
      syncQueued: state.syncQueue?.some((item) => item.type === 'trip' && item.op === 'create' && item.entityId === state.activeTripId),
    };
  });
  expect(created.tripCurrency).toBe('KRW');
  expect(created.firstSpot).toBe('Mimo Jeju Observatory');
  expect(created.syncQueued).toBe(true);
});

test('Dashboard new trip wizard tries model fallbacks after quota before destination fallback', async ({ page }) => {
  const calls = { kimi: 0, mimo: 0, google: 0 };
  await page.route('https://zh.wikivoyage.org/w/api.php**', async (route) => route.fulfill({ json: { query: { search: [] } } }));
  await page.route('https://en.wikivoyage.org/w/api.php**', async (route) => route.fulfill({ json: { query: { search: [] } } }));

  await page.route('**/kimi/json', async (route) => {
    calls.kimi += 1;
    await route.fulfill({ json: { ok: true, data: {} } });
  });
  await page.route('**/mimo/json', async (route) => {
    calls.mimo += 1;
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'mimo unavailable' }) });
  });
  await page.route('**/google/json', async (route) => {
    calls.google += 1;
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'google unavailable' }) });
  });

  await openDashboard(page, false, {
    credentialSession: 'wizard-quota-session',
    credentialSessionExpiresAt: new Date('2026-05-08T10:00:00+08:00').valueOf() + 60_000,
  });
  await page.getByRole('banner', { name: /Dashboard Test header/ }).locator('button').first().click();
  await page.getByRole('button', { name: /建立新旅程/ }).click();
  await page.getByPlaceholder('例如：名古屋櫻花祭 2026').fill('濟州2026');
  await page.getByPlaceholder('例如：濟州、首爾、名古屋、東京').fill('濟州');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('textarea').fill('濟州行程需要 AI 安排。');
  await page.getByRole('button', { name: /完成創建/ }).click();

  await expect(page.getByText('Step 4 of 4')).toHaveCount(0);
  expect(calls.kimi).toBeGreaterThanOrEqual(1);
  expect(calls.mimo).toBeGreaterThanOrEqual(1);
  expect(calls.google).toBeGreaterThanOrEqual(1);
  const created = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('boss-japan-tracker') || '{}');
    const trip = state.trips?.find((item) => item.id === state.activeTripId);
    return {
      tripName: state.tripName,
      tripCurrency: state.tripCurrency,
      firstSpot: trip?.itinerary?.[0]?.spots?.[0]?.name,
      hasTripCreate: state.syncQueue?.some((item) => item.type === 'trip' && item.op === 'create'),
    };
  });
  expect(created.tripName).toBe('濟州2026');
  expect(created.tripCurrency).toBe('KRW');
  expect(created.firstSpot).toBeTruthy();
  expect(created.hasTripCreate).toBe(true);
});

test('Dashboard compact itinerary and recent expenses show denser Home information', async ({ page }) => {
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    const fixedNow = new Date('2026-05-08T10:00:00+08:00').valueOf();
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
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: fixedNow + 31_536_000_000 }));
    const itinerary = [{
      date: '2026-05-08',
      day: 1,
      region: 'Compact Home',
      spots: [
        { time: '09:00', name: 'Station Coffee', type: 'food', note: 'Breakfast before train', address: 'Central Station' },
        { time: '10:30', name: 'Museum Gate', type: 'ticket', note: 'Booking QR ready', address: 'Museum Road' },
        { time: '13:00', name: 'Market Lunch', type: 'food', note: 'Seafood lane', address: 'Market Street' },
        { time: '16:00', name: 'Souvenir Shop', type: 'shopping', note: 'Gifts', address: 'Old Town' },
      ],
    }];
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      schemaVersion: 3,
      lastTab: 'dashboard',
      budget: 20000,
      rate: 20,
      activeTripId: 'compact_home_trip',
      tripName: 'Compact Home Test',
      tripDateRange: { start: '2026-05-08', end: '2026-05-08' },
      customItinerary: itinerary,
      trips: [{
        id: 'compact_home_trip',
        name: 'Compact Home Test',
        destinationSummary: 'Compact Home',
        startDate: '2026-05-08',
        endDate: '2026-05-08',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Hong_Kong'],
        version: 1,
        active: true,
        itinerary,
        createdAt: 1,
        updatedAt: 1,
      }],
      receipts: [
        { id: 'recent_1', store: 'Station Coffee', total: 600, date: '2026-05-08', time: '09:05', category: 'food', payment: 'cash', personId: 'p_boss', splitMode: 'shared', createdAt: 6 },
        { id: 'recent_2', store: 'Museum Gate', total: 1200, date: '2026-05-08', time: '10:35', category: 'ticket', payment: 'credit', personId: 'p_boss', splitMode: 'shared', createdAt: 5 },
        { id: 'recent_3', store: 'Market Lunch', total: 1800, date: '2026-05-08', time: '13:10', category: 'food', payment: 'cash', personId: 'p_boss', splitMode: 'shared', createdAt: 4 },
        { id: 'recent_4', store: 'Souvenir Shop', total: 2200, date: '2026-05-08', time: '16:05', category: 'shopping', payment: 'credit', personId: 'p_boss', splitMode: 'shared', createdAt: 3 },
        { id: 'recent_5', store: 'Evening Snack', total: 500, date: '2026-05-08', time: '18:30', category: 'food', payment: 'cash', personId: 'p_boss', splitMode: 'shared', createdAt: 2 },
        { id: 'recent_6', store: 'Hotel Water', total: 300, date: '2026-05-08', time: '21:00', category: 'other', payment: 'cash', personId: 'p_boss', splitMode: 'shared', createdAt: 1 },
      ],
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/#dashboard');
  await expect(page.locator('.dashboard-compact-itinerary-row')).toHaveCount(4);
  await expect(page.locator('.dashboard-compact-itinerary-row').first()).toContainText('09:00');
  await expect(page.locator('.dashboard-compact-itinerary-row').first()).toContainText('Station Coffee');
  await expect(page.locator('.dashboard-compact-itinerary-row').first()).toContainText('Breakfast before train');
  await expect(page.locator('.dashboard-compact-itinerary-row').first()).toContainText('¥600');
  await expect(page.locator('.dashboard-compact-recent-row')).toHaveCount(6);
  await expect(page.locator('.dashboard-compact-recent-row').first()).toContainText('Hotel Water');
  await expect(page.locator('.dashboard-compact-recent-row').last()).toContainText('Station Coffee');
});
