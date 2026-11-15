const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

const APP_ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://localhost:8903';

async function stubLocalSecrets(page) {
  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));
}

test.beforeEach(async ({ page }) => {
  await stubLocalSecrets(page);
});

test('Timeline edit, reset, maps, and loose receipt flows', async ({ page }) => {
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
  });

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/`);
  const nav = page.getByLabel('主要分頁');
  await nav.getByRole('button', { name: '行程' }).click();
  await expect(page.getByRole('group', {name:'選擇行程日子'})).toBeVisible();
  const firstMap = page.getByRole('link', { name: '地圖' }).first();
  await expect(firstMap).toBeVisible();
  await expect(firstMap).toHaveAttribute('href', /maps|maps\.apple/);

  const firstEditableEvent = page.locator('.timeline-event').filter({ has: page.getByRole('button', { name: '編輯' }) }).first();
  const stableSpotKey = await firstEditableEvent.getAttribute('data-spot-key');
  expect(stableSpotKey).toBeTruthy();
  await firstEditableEvent.getByRole('button', { name: '編輯' }).click();
  await expect(page.getByText('編輯行程點')).toBeVisible();
  await page.getByLabel('開始時間').fill('09:15');
  await page.getByLabel('結束時間').fill('10:45');
  await page.getByLabel('名稱').fill('M6 Edited Spot');
  await page.getByRole('button', { name: '儲存' }).click();
  const editedEvent = page.locator('.timeline-event').filter({ hasText: 'M6 Edited Spot' });
  await expect(editedEvent).toBeVisible();
  await expect(editedEvent.locator('.timeline-time')).toContainText('09:15');
  await expect(editedEvent.locator('.schedule-time-detail')).toContainText('10:45');
  await expect(editedEvent).toHaveAttribute('data-spot-key', stableSpotKey || '');
  await page.reload();
  const reloadedEditedEvent = page.locator('.timeline-event').filter({ hasText: 'M6 Edited Spot' });
  await expect(reloadedEditedEvent).toBeVisible();
  await expect(reloadedEditedEvent.locator('.timeline-time')).toContainText('09:15');
  await expect(reloadedEditedEvent.locator('.schedule-time-detail')).toContainText('10:45');
  await expect(reloadedEditedEvent).toHaveAttribute('data-spot-key', stableSpotKey || '');
  await reloadedEditedEvent.getByRole('button', { name: '編輯' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '刪除' }).click();
  await expect(page.getByText('M6 Edited Spot')).toBeHidden();

  await nav.getByRole('button', { name: '記帳' }).click();
  await page.getByRole('button', { name: '手動', exact: true }).click();
  await page.getByLabel('店名 / 項目').fill('M6 Loose Receipt');
  await page.getByLabel('日期').fill('2026-04-20');
  await page.getByLabel('金額', { exact: true }).fill('321');
  await page.getByRole('button', { name: '儲存' }).click();
  await nav.getByRole('button', { name: '行程' }).click();
  await expect(page.getByText('鬆散紀錄')).toHaveCount(0);
  await page.locator('.timeline-day').first().getByRole('button', { name: /筆消費/ }).click();
  await expect(page.getByText('M6 Loose Receipt')).toBeVisible();
  await page.locator('.receipt-row').filter({ hasText: 'M6 Loose Receipt' }).click();
  await page.getByRole('button', { name: '刪除' }).click();
  await page.getByRole('button', { name: '確認刪除' }).click();
  await expect(page.locator('.receipt-row').filter({ hasText: 'M6 Loose Receipt' })).toBeHidden();
});

test('Timeline map links reject unsafe imported URLs and use Android intent fallback', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/125 Mobile Safari/537.36',
  });
  const page = await context.newPage();
  await stubLocalSecrets(page);
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
      localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'timeline',
      customItinerary: [{
        date: '2026-05-08',
        day: 1,
        region: 'Security City',
        spots: [
          { time: '10:00', name: 'Unsafe Map Spot', type: 'other', mapUrl: 'javascript:alert(1)' },
          { time: '11:00', name: 'Unsafe Https Spot', type: 'other', mapUrl: 'https://evil.example/maps' },
          { time: '12:00', name: 'Unsafe Relative Spot', type: 'other', mapUrl: '//evil.example/maps' },
        ],
      }],
      tripDateRange: { start: '2026-05-08', end: '2026-05-08' },
      receipts: [],
    }));
  });
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#timeline`);
  await expect(page.getByRole('group', {name:'選擇行程日子'})).toBeVisible();
  const hrefs = await page.locator('.timeline-route-actions').getByRole('link', { name: '地圖', exact:true }).evaluateAll((links) => links.map((link) => link.getAttribute('href') || ''));
  expect(hrefs.join(' ')).not.toMatch(/javascript:|evil\.example/i);
  expect(hrefs).toHaveLength(3);
  for (const href of hrefs) expect(href).toMatch(/^intent:\/\/www\.google\.com\/maps\/search\//);
  await context.close();
});

test('Timeline highlights live, passed, and future itinerary spots', async ({ page }) => {
  const fixed = new Date('2026-05-08T12:30:00+09:00').valueOf();
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
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: fixedNow + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'timeline',
      tripDateRange: { start: '2026-05-08', end: '2026-05-08' },
      customItinerary: [{
        date: '2026-05-08',
        day: 1,
        region: 'Live Rail City',
        timezone: 'Asia/Tokyo',
        spots: [
          { time: '09:00', name: 'Breakfast Stop', type: 'food' },
          { time: '12:00', name: 'Lunch Stop', type: 'food' },
          { time: '18:00', name: 'Dinner Stop', type: 'food' },
          { time: '', name: 'Untimed Stop', type: 'other' },
        ],
      }],
      receipts: [],
    }));
  }, fixed);
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#timeline`);
  await expect(page.getByRole('group', {name:'選擇行程日子'})).toBeVisible();
  await expect(page.locator('.timeline-event.is-passed')).toContainText('Breakfast Stop');
  await expect(page.locator('.timeline-event.is-passed')).toContainText('完成');
  await expect(page.locator('.timeline-event.is-untimed')).toContainText('Untimed Stop');
  await expect(page.locator('.timeline-event.is-live')).toContainText('Lunch Stop');
  await expect(page.locator('.timeline-event.is-live')).toContainText('Now');
  await expect(page.locator('.timeline-event.is-future')).toContainText('Dinner Stop');
  await expect(page.locator('.timeline-event.is-future')).toContainText('即將');
  await expect(page.getByRole('region', {name:'目前行程'})).toContainText('12:30');
  await expect(page.getByRole('region', {name:'目前行程'})).toContainText('Lunch Stop');
  await expect(page.getByRole('region', {name:'目前行程'})).toContainText('Next · 18:00 Dinner Stop');
  await expect(page.locator('.timeline-route-actions').first()).toBeVisible();
  await expect(page.locator('.timeline-route-actions').first().getByRole('link', { name: '地圖' })).toBeVisible();
  await expect(page.locator('.timeline-event.is-live .schedule-stop-node')).toBeVisible();
});

test('Timeline can jump to the live spot on request', async ({ page }) => {
  const fixed = new Date('2026-05-09T14:10:00+09:00').valueOf();
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
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: fixedNow + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'scan',
      tripDateRange: { start: '2026-05-08', end: '2026-05-09' },
      customItinerary: [
        {
          date: '2026-05-08',
          day: 1,
          region: 'Yesterday Route',
          timezone: 'Asia/Tokyo',
          spots: Array.from({ length: 8 }, (_, idx) => ({ time: `${String(9 + idx).padStart(2, '0')}:00`, name: `Past Stop ${idx + 1}`, type: 'ticket' })),
        },
        {
          date: '2026-05-09',
          day: 2,
          region: 'Current Route',
          timezone: 'Asia/Tokyo',
          spots: [
            { time: '08:00', name: 'Morning Pier', type: 'transport' },
            { time: '10:00', name: 'Old Market', type: 'shopping' },
            { time: '14:00', name: 'Live Garden Spot', type: 'ticket' },
            { time: '17:00', name: 'Sunset Cafe', type: 'food' },
          ],
        },
      ],
      receipts: [],
    }));
  }, fixed);

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/`);
  await expect(page.getByRole('heading', { name: '收據掃描' })).toBeVisible();
  await page.locator('.app-floating-dock-mobile').getByRole('button', { name: '行程' }).click();
  const liveSpot = page.locator('.timeline-event.is-live').filter({ hasText: 'Live Garden Spot' });
  await expect(liveSpot).toBeVisible();
  await page.getByRole('button', { name:'查看目前行程' }).click();
  await expect(liveSpot).toBeInViewport();
  await page.waitForTimeout(500);

  const metrics = await liveSpot.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      center: rect.top + rect.height / 2,
      viewportHeight: window.innerHeight,
      scrollY: window.scrollY,
    };
  });

  expect(metrics.scrollY, JSON.stringify(metrics, null, 2)).toBeGreaterThan(240);
  expect(metrics.center, JSON.stringify(metrics, null, 2)).toBeGreaterThan(160);
  expect(metrics.center, JSON.stringify(metrics, null, 2)).toBeLessThan(metrics.viewportHeight - 160);
});

test('Timeline command card stays compact and day header shows one date', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'timeline',
      tripDateRange: { start: '2026-05-08', end: '2026-05-13' },
      customItinerary: [
        {
          date: '2026-05-08',
          day: 1,
          region: '名古屋市區',
          timezone: 'Asia/Tokyo',
          spots: [
            { time: '09:00', name: '名古屋站', type: 'transport' },
            { time: '12:00', name: '午餐', type: 'food' },
          ],
        },
        { date: '2026-05-09', day: 2, region: '犬山', timezone: 'Asia/Tokyo', spots: [{ time: '10:00', name: '犬山城', type: 'ticket' }] },
        { date: '2026-05-10', day: 3, region: '高山', timezone: 'Asia/Tokyo', spots: [{ time: '10:00', name: '古い町並', type: 'ticket' }] },
        { date: '2026-05-11', day: 4, region: '白川鄉', timezone: 'Asia/Tokyo', spots: [{ time: '10:00', name: '合掌村', type: 'ticket' }] },
        { date: '2026-05-12', day: 5, region: '金澤', timezone: 'Asia/Tokyo', spots: [{ time: '10:00', name: '兼六園', type: 'ticket' }] },
        { date: '2026-05-13', day: 6, region: '名古屋機場', timezone: 'Asia/Tokyo', spots: [{ time: '10:00', name: '中部國際機場', type: 'transport' }] },
      ],
      receipts: [],
    }));
  });

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#timeline`);
  await expect(page.getByRole('group', {name:'選擇行程日子'})).toBeVisible();
  const dates = page.getByRole('group', { name: '選擇行程日子' });
  await expect(dates.getByRole('button')).toHaveCount(6);
  expect((await dates.boundingBox()).height).toBeLessThanOrEqual(130);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByLabel('Travel day widgets')).toHaveCount(0);
  await expect(page.getByLabel('Day readiness scores')).toHaveCount(0);

  const firstDay = page.locator('.timeline-day').first();
  await expect(firstDay.locator('.timeline-day-date-primary')).toHaveCount(1);
  await expect(firstDay.locator('.timeline-day-status .status-pill')).toHaveCount(0);
  await expect(firstDay.locator('.timeline-day-status')).not.toContainText('2026-05-08');
});

test('Timeline restores Nagoya canonical days and hides out-of-range scenery after partial trip sync', async ({ page }) => {
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'timeline',
      activeTripId: 'trip_2026_04_nagoya',
      tripName: '名古屋 2026',
      tripCurrency: 'JPY',
      tripDateRange: { start: '2026-04-20', end: '2026-04-25' },
      customItinerary: null,
      trips: [{
        id: 'trip_2026_04_nagoya',
        name: '名古屋 2026',
        destinationSummary: '日本名古屋、飛驒高山、白川鄉、金澤、常滑',
        startDate: '2026-04-20',
        endDate: '2026-04-25',
        homeCurrency: 'HKD',
        currencies: ['JPY', 'HKD'],
        timezones: ['Asia/Tokyo'],
        version: 3,
        active: true,
        itinerary: [
          { date: '2026-04-20', day: 1, region: '名古屋市區', timezone: 'Asia/Tokyo', spots: [{ time: '09:00', name: '名古屋站', type: 'transport' }] },
          { date: '2026-04-25', day: 6, region: '常滑 → 機場', timezone: 'Asia/Tokyo', spots: [{ time: '12:00', name: '中部國際機場', type: 'transport' }] },
          { date: '2026-04-26', day: 7, region: '行程外', timezone: 'Asia/Tokyo', spots: [{ time: '10:00', name: '不存在行程以外日子的景點', type: 'sightseeing' }] },
        ],
        sourceId: 'trip_trip_2026_04_nagoya',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }],
      receipts: [],
    }));
  });

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#timeline`);
  await expect(page.getByRole('group', {name:'選擇行程日子'})).toBeVisible();
  await expect(page.getByRole('group', {name:'選擇行程日子'}).getByRole('button')).toHaveCount(6);
  await page.getByRole('button', {name:'顯示全部日子'}).click();
  await expect(page.locator('.timeline-day')).toHaveCount(6);
  await expect(page.locator('.timeline-day-date-primary')).toHaveText([
    '2026-04-20',
    '2026-04-21',
    '2026-04-22',
    '2026-04-23',
    '2026-04-24',
    '2026-04-25',
  ]);
  await expect(page.locator('.timeline-event').filter({ hasText: '白川鄉 合掌村' })).toBeVisible();
  await expect(page.locator('.timeline-event').filter({ hasText: '雪之大谷' })).toBeVisible();
  await expect(page.locator('.timeline-event').filter({ hasText: '鳥開總本家' })).toBeVisible();
  await expect(page.getByText('不存在行程以外日子的景點')).toHaveCount(0);
});

test('Timeline preserves every calendar day for an ordinary partial itinerary', async ({ page }) => {
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'timeline',
      activeTripId: 'trip_kyoto_partial',
      tripName: '京都三日遊',
      tripCurrency: 'JPY',
      tripDateRange: { start: '2026-06-01', end: '2026-06-03' },
      trips: [{
        id: 'trip_kyoto_partial',
        name: '京都三日遊',
        destinationSummary: '京都',
        startDate: '2026-06-01',
        endDate: '2026-06-03',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Tokyo'],
        version: 4,
        active: true,
        itinerary: [
          { date: '2026-06-01', day: 1, region: '京都東山', spots: [{ time: '09:00', name: '清水寺', type: 'ticket' }] },
          { date: '2026-06-04', day: 4, region: '行程外', spots: [{ time: '09:00', name: '行程外景點', type: 'sightseeing' }] },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }],
      receipts: [],
    }));
  });

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#timeline`);
  await expect(page.getByRole('group', {name:'選擇行程日子'}).getByRole('button')).toHaveCount(3);
  await page.getByRole('button', {name:'顯示全部日子'}).click();
  await expect(page.locator('.timeline-day')).toHaveCount(3);
  await expect(page.locator('.timeline-day-date-primary')).toHaveText([
    '2026-06-01',
    '2026-06-02',
    '2026-06-03',
  ]);
  await expect(page.locator('.timeline-event').filter({hasText:'清水寺'})).toBeVisible();
  await expect(page.getByText('行程外景點')).toHaveCount(0);
});

test('Timeline mobile time labels and nodes sit to the left of each activity', async ({ page }) => {
  const fixed = new Date('2026-05-08T12:30:00+09:00').valueOf();
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
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: fixedNow + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'timeline',
      tripDateRange: { start: '2026-05-08', end: '2026-05-08' },
      customItinerary: [{
        date: '2026-05-08',
        day: 1,
        region: 'Compact Rail City',
        timezone: 'Asia/Tokyo',
        spots: [
          { time: '09:00', name: 'Morning Market', type: 'food' },
          { time: '12:00', name: 'Museum Visit', type: 'ticket' },
          { time: '15:30', name: 'Coffee Stop', type: 'food' },
          { time: '18:00', name: 'Dinner', type: 'food' },
        ],
      }],
      receipts: [],
    }));
  }, fixed);

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#timeline`);
  await expect(page.getByRole('group', {name:'選擇行程日子'})).toBeVisible();
  for (const row of await page.locator('.timeline-event').all()) {
    const time = await row.locator('.timeline-time').boundingBox();
    const node = await row.locator('.schedule-stop-node').boundingBox();
    const card = await row.locator('.schedule-stop-card').boundingBox();
    expect(time.x + time.width).toBeLessThanOrEqual(node.x + 1);
    expect(node.x + node.width).toBeLessThanOrEqual(card.x + 1);
  }
});

test('Timeline rail progress follows the current itinerary spot instead of the whole day clock', async ({ page }) => {
  const fixed = new Date('2026-05-09T09:30:00+09:00').valueOf();
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
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: fixedNow + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'timeline',
      tripDateRange: { start: '2026-05-08', end: '2026-05-09' },
      customItinerary: [
        {
          date: '2026-05-08',
          day: 1,
          region: 'Past Day',
          timezone: 'Asia/Tokyo',
          spots: [{ time: '10:00', name: 'Past Stop', type: 'ticket' }],
        },
        {
          date: '2026-05-09',
          day: 2,
          region: 'Current Day',
          timezone: 'Asia/Tokyo',
          spots: [
            { time: '08:00', name: 'Hotel Breakfast', type: 'food' },
            { time: '09:00', name: 'Temple Gate', type: 'ticket' },
            { time: '23:00', name: 'Night Market', type: 'shopping' },
            { time: '23:30', name: 'Hotel Return', type: 'lodging' },
          ],
        },
      ],
      receipts: [],
    }));
  }, fixed);

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#timeline`);
  await expect(page.getByRole('heading', { name: 'Current Day' })).toBeVisible();
  const todayRail = page.locator('.timeline-rail.is-today');
  await expect(page.getByRole('region', {name:'目前行程'})).toContainText('09:30');
  await expect(page.locator('.timeline-event.is-live')).toContainText('Temple Gate');

  const railMetrics = await todayRail.evaluate((rail) => {
    const style = getComputedStyle(rail);
    const marker = rail.querySelector('.timeline-event.is-live .schedule-stop-node')?.getBoundingClientRect();
    const events = Array.from(rail.querySelectorAll('.timeline-event')).map((node) => node.getBoundingClientRect());
    const live = rail.querySelector('.timeline-event.is-live .timeline-time time')?.getBoundingClientRect();
    return {
      progress: Number(style.getPropertyValue('--timeline-progress')),
      markerCenterY: marker ? marker.top + marker.height / 2 : null,
      liveCenterY: live ? live.top + live.height / 2 : null,
      eventCount: events.length,
    };
  });

  expect(railMetrics.eventCount).toBe(4);
  expect(railMetrics.progress, JSON.stringify(railMetrics, null, 2)).toBeGreaterThan(0.31);
  expect(railMetrics.progress, JSON.stringify(railMetrics, null, 2)).toBeLessThan(0.36);
  expect(Math.abs((railMetrics.markerCenterY || 0) - (railMetrics.liveCenterY || 0)), JSON.stringify(railMetrics, null, 2)).toBeLessThan(34);
});

test('Timeline rail marks past stops when today is outside the trip dates', async ({ page }) => {
  const fixed = new Date('2026-05-12T09:30:00+09:00').valueOf();
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
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: fixedNow + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'timeline',
      tripDateRange: { start: '2026-05-08', end: '2026-05-09' },
      customItinerary: [
        {
          date: '2026-05-08',
          day: 1,
          region: 'Past Day',
          timezone: 'Asia/Tokyo',
          spots: [{ time: '10:00', name: 'Past Stop', type: 'ticket' }],
        },
        {
          date: '2026-05-09',
          day: 2,
          region: 'Past Day Two',
          timezone: 'Asia/Tokyo',
          spots: [{ time: '12:00', name: 'Past Lunch', type: 'food' }],
        },
      ],
      receipts: [],
    }));
  }, fixed);

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#timeline`);
  await page.getByRole('button', {name:'顯示全部日子'}).click();
  await expect(page.getByRole('heading', { name: 'Past Day Two' })).toBeVisible();
  await expect(page.locator('.timeline-rail.is-today')).toHaveCount(0);
  await expect(page.locator('.timeline-now-marker')).toHaveCount(0);
  await expect(page.locator('.timeline-rail.is-outside-trip')).toHaveCount(2);

  await expect(page.locator('.timeline-event.is-live')).toHaveCount(0);
  await expect(page.locator('.timeline-event.is-passed .schedule-stop-node')).toHaveCount(2);
});
