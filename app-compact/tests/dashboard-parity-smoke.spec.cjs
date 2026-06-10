const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

async function openDashboard(page, statsIncludeTransportLodging) {
  await page.addInitScript((includeToggle) => {
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
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
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
    }));
  }, statsIncludeTransportLodging);
  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.getByLabel('旅程總覽')).toBeVisible();
  await expect(page.locator('.today-itinerary-card').getByText('今日行程')).toHaveCount(1);
  await expect(page.getByText('Budget Settings')).toHaveCount(0);
  await expect(page.getByText('Notifications')).toHaveCount(0);
  await expect(page.getByText('預算控制')).toHaveCount(0);
  await expect(page.locator('.washi-budget-card')).toBeVisible();
  await expect(page.locator('.washi-today-stats-card .preview-dashboard-today-grid > div')).toHaveCount(3);
}

test('Dashboard spending toggle matches legacy semantics for today stats but budget is consistent', async ({ browser }) => {
  const defaultContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const defaultPage = await defaultContext.newPage();
  await openDashboard(defaultPage, false);
  await expect(defaultPage.locator('.washi-today-stats-card').filter({ hasText: '今日支出' })).toContainText('HK$ 49');
  await expect(defaultPage.locator('.washi-budget-card').filter({ hasText: '已使用' })).toContainText('HK$ 500');
  await defaultContext.close();

  const flippedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const flippedPage = await flippedContext.newPage();
  await openDashboard(flippedPage, true);
  await expect(flippedPage.locator('.washi-today-stats-card').filter({ hasText: '今日支出' })).toContainText('HK$ 489');
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
  await expect(page.getByLabel('Broker AI assistant')).toBeVisible();
  await expect(page.locator('.today-itinerary-card')).toBeVisible();
});

test('Dashboard new trip wizard lets users choose trip days on step two', async ({ page }) => {
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

  await openDashboard(page, false);
  await page.locator('.compact-mobile-header').getByRole('button', { name: /Dashboard Test/ }).click();
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

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.locator('.dashboard-compact-itinerary-row')).toHaveCount(4);
  await expect(page.locator('.dashboard-compact-itinerary-row').first()).toContainText('09:00');
  await expect(page.locator('.dashboard-compact-itinerary-row').first()).toContainText('Station Coffee');
  await expect(page.locator('.dashboard-compact-itinerary-row').first()).toContainText('Breakfast before train');
  await expect(page.locator('.dashboard-compact-itinerary-row').first()).toContainText('¥600');
  await expect(page.locator('.dashboard-compact-recent-row')).toHaveCount(6);
  await expect(page.locator('.dashboard-compact-recent-row').first()).toContainText('Hotel Water');
  await expect(page.locator('.dashboard-compact-recent-row').last()).toContainText('Station Coffee');
});

async function seedBrokerAssistantDashboard(page) {
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    const fixedNow = new Date('2026-05-09T10:00:00+08:00').valueOf();
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
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'assistant-session',
      credentialSessionExpiresAt: fixedNow + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      schemaVersion: 3,
      lastTab: 'dashboard',
      budget: 10000,
      rate: 20,
      credentialSession: 'assistant-session',
      credentialSessionExpiresAt: fixedNow + 60_000,
      activeTripId: 'assistant_trip',
      tripName: 'Assistant Test',
      tripDateRange: { start: '2026-05-08', end: '2026-05-10' },
      customItinerary: [
        { date: '2026-05-08', day: 1, region: 'Nagoya', timezone: 'Asia/Hong_Kong', spots: [{ time: '10:00', name: 'Nagoya Food', type: 'food' }] },
        { date: '2026-05-09', day: 2, region: 'Inuyama', timezone: 'Asia/Hong_Kong', spots: [{ time: '09:00', name: 'Inuyama Castle', type: 'ticket' }] },
        { date: '2026-05-10', day: 3, region: 'Outdoor Mountain', timezone: 'Asia/Hong_Kong', spots: [{ time: '08:30', name: 'Mountain trail', type: 'ticket', note: 'outdoor walking' }] },
      ],
      trips: [{
        id: 'assistant_trip',
        name: 'Assistant Test',
        destinationSummary: 'Nagoya / Inuyama / Outdoor Mountain',
        startDate: '2026-05-08',
        endDate: '2026-05-10',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Hong_Kong'],
        version: 1,
        active: true,
        itinerary: [
          { date: '2026-05-08', day: 1, region: 'Nagoya', timezone: 'Asia/Hong_Kong', spots: [{ time: '10:00', name: 'Nagoya Food', type: 'food' }] },
          { date: '2026-05-09', day: 2, region: 'Inuyama', timezone: 'Asia/Hong_Kong', spots: [{ time: '09:00', name: 'Inuyama Castle', type: 'ticket' }] },
          { date: '2026-05-10', day: 3, region: 'Outdoor Mountain', timezone: 'Asia/Hong_Kong', spots: [{ time: '08:30', name: 'Mountain trail', type: 'ticket', note: 'outdoor walking' }] },
        ],
        createdAt: 1,
        updatedAt: 1,
      }],
      receipts: [
        { id: 'assistant_food', store: 'Nagoya Food', total: 4000, date: '2026-05-08', category: 'food', payment: 'cash', personId: 'p_boss', splitMode: 'shared', createdAt: 1 },
        { id: 'assistant_ticket', store: 'Inuyama Ticket', total: 4000, date: '2026-05-09', category: 'ticket', payment: 'credit', personId: 'p_boss', splitMode: 'shared', createdAt: 2 },
      ],
    }));
  });
}

test('Dashboard broker AI assistant shows primary model, quota policy, and broker answer', async ({ page }) => {
  const calls = [];
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/kimi/json', async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          summary: '今日控制預算：先保留交通同晚餐 buffer。',
          risk: 'watch',
          recommendation: 'Shopping 先限 HK$100，晚餐前再補記收據。',
          nextAction: '先記低 Inuyama Ticket，再去統計頁睇分類。',
        },
      }),
    });
  });
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/google/json', async (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'google should not be called' }) }));
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/mimo/json', async (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'mimo should not be called' }) }));

  await seedBrokerAssistantDashboard(page);
  await page.goto('http://localhost:8903/travel-expense/compact/');
  const assistant = page.getByLabel('Broker AI assistant');
  await expect(assistant).toBeVisible();
  await expect(assistant).toContainText('Broker AI Assistant');
  await expect(assistant).toContainText('Primary · kimi/kimi-code');
  await expect(assistant).toContainText('Quota · broker metered');
  await expect(assistant).toContainText('No fallback on 429');
  await assistant.getByLabel('AI assistant question').fill('今日 shopping budget 應該點？');
  await assistant.getByRole('button', { name: '問 AI' }).click();
  await expect(assistant).toContainText('今日控制預算');
  await expect(assistant).toContainText('Risk · watch');
  await expect(assistant).toContainText('Shopping 先限 HK$100');
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ kind: 'trip', model: 'kimi-code' });
  expect(String(calls[0].prompt)).toContain('Return JSON only');
});

test('Dashboard broker AI assistant hard-stops on quota without fallback', async ({ page }) => {
  const calls = { kimi: 0, google: 0, mimo: 0 };
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/kimi/json', async (route) => {
    calls.kimi += 1;
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'Supabase AI daily quota exceeded' }),
    });
  });
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/google/json', async (route) => {
    calls.google += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: {} }) });
  });
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/mimo/json', async (route) => {
    calls.mimo += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: {} }) });
  });

  await seedBrokerAssistantDashboard(page);
  await page.goto('http://localhost:8903/travel-expense/compact/');
  const assistant = page.getByLabel('Broker AI assistant');
  await assistant.getByRole('button', { name: '問 AI' }).click();
  await expect(assistant).toContainText('Quota hard stop');
  await expect(assistant).toContainText('No fallback was attempted');
  await expect(assistant).toContainText('Supabase AI daily quota exceeded');
  expect(calls).toEqual({ kimi: 1, google: 0, mimo: 0 });
});
