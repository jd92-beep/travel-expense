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

test('Dashboard travel reminders expose useful actions', async ({ page }) => {
  await openDashboard(page, false);
  await page.getByRole('button', { name: /旅程提醒/ }).click();
  await expect(page.getByText('今日記帳狀態')).toBeVisible();
  await expect(page.getByText('今日已有 2 筆紀錄')).toBeVisible();
  await page.getByRole('button', { name: '立即記帳' }).click();
  await expect(page.getByText('手動記一筆')).toBeVisible();
  await page.getByRole('button', { name: '取消' }).click();
  await page.getByRole('button', { name: '查看紀錄' }).click();
  await expect(page).toHaveURL(/#history/);
});

test('Dashboard local AI coach shows burn forecast, next-day warning, and weather reminder', async ({ page }) => {
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
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      schemaVersion: 3,
      lastTab: 'dashboard',
      budget: 10000,
      rate: 20,
      activeTripId: 'coach_trip',
      tripName: 'Coach Test',
      tripDateRange: { start: '2026-05-08', end: '2026-05-10' },
      customItinerary: [
        { date: '2026-05-08', day: 1, region: 'Nagoya', timezone: 'Asia/Hong_Kong', spots: [{ time: '10:00', name: 'Nagoya Food', type: 'food' }] },
        { date: '2026-05-09', day: 2, region: 'Inuyama', timezone: 'Asia/Hong_Kong', spots: [{ time: '09:00', name: 'Inuyama Castle', type: 'ticket' }] },
        { date: '2026-05-10', day: 3, region: 'Outdoor Mountain', timezone: 'Asia/Hong_Kong', spots: [{ time: '08:30', name: 'Mountain trail', type: 'ticket', note: 'outdoor walking' }] },
      ],
      trips: [{
        id: 'coach_trip',
        name: 'Coach Test',
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
        { id: 'coach_day1', store: 'Nagoya Food', total: 4000, date: '2026-05-08', category: 'food', payment: 'cash', personId: 'p_boss', splitMode: 'shared', createdAt: 1 },
        { id: 'coach_day2', store: 'Inuyama Ticket', total: 4000, date: '2026-05-09', category: 'ticket', payment: 'credit', personId: 'p_boss', splitMode: 'shared', createdAt: 2 },
      ],
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  const coach = page.locator('.dashboard-ai-coach');
  await expect(coach).toBeVisible();
  await expect(coach).toContainText('Local AI Coach');
  await expect(coach).toContainText('本地推算 · no API');
  await expect(coach).toContainText('Daily burn');
  await expect(coach).toContainText('HK$ 200');
  await expect(coach).toContainText('Overspend forecast');
  await expect(coach).toContainText('可能超支 HK$ 111');
  await expect(coach).toContainText('Next-day warning');
  await expect(coach).toContainText('明日 Outdoor Mountain');
  await expect(coach).toContainText('Weather Reminder');
  await expect(coach).toContainText('Check rain / wind');
  await coach.getByRole('button', { name: /天氣/ }).click();
  await expect(page).toHaveURL(/#weather/);
  await page.getByLabel('主要分頁').getByRole('button', { name: '主頁', exact: true }).click();
  await coach.getByRole('button', { name: /預算/ }).click();
  await expect(page).toHaveURL(/#stats/);
});
