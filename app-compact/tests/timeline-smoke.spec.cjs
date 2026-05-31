const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

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
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  const nav = page.getByLabel('主要分頁');
  await nav.getByRole('button', { name: '行程' }).click();
  await expect(page.getByText('行程時間線')).toBeVisible();
  const firstMap = page.getByRole('link', { name: '地圖' }).first();
  await expect(firstMap).toBeVisible();
  await expect(firstMap).toHaveAttribute('href', /maps|maps\.apple/);

  const firstEditableEvent = page.locator('.timeline-event').filter({ has: page.getByRole('button', { name: '編輯' }) }).first();
  const stableSpotKey = await firstEditableEvent.getAttribute('data-spot-key');
  expect(stableSpotKey).toBeTruthy();
  await firstEditableEvent.getByRole('button', { name: '編輯' }).click();
  await expect(page.getByText('編輯行程點')).toBeVisible();
  await page.getByLabel('名稱').fill('M6 Edited Spot');
  await page.getByRole('button', { name: '儲存' }).click();
  const editedEvent = page.locator('.timeline-event').filter({ hasText: 'M6 Edited Spot' });
  await expect(editedEvent).toBeVisible();
  await expect(editedEvent).toHaveAttribute('data-spot-key', stableSpotKey || '');
  await page.reload();
  const reloadedEditedEvent = page.locator('.timeline-event').filter({ hasText: 'M6 Edited Spot' });
  await expect(reloadedEditedEvent).toBeVisible();
  await expect(reloadedEditedEvent).toHaveAttribute('data-spot-key', stableSpotKey || '');
  await reloadedEditedEvent.getByRole('button', { name: '編輯' }).click();
  await page.getByRole('button', { name: '還原' }).click();
  await expect(page.getByText('M6 Edited Spot')).toBeHidden();

  await nav.getByRole('button', { name: '記帳' }).click();
  await page.getByRole('button', { name: '手動', exact: true }).click();
  await page.getByLabel('店名 / 項目').fill('M6 Loose Receipt');
  await page.getByLabel('日期').fill('2026-04-20');
  await page.getByLabel('金額（legacy total）').fill('321');
  await page.getByRole('button', { name: '儲存' }).click();
  await nav.getByRole('button', { name: '行程' }).click();
  await page.locator('.timeline-day').first().getByRole('button', { name: /筆消費/ }).click();
  await expect(page.getByText('M6 Loose Receipt')).toBeVisible();
  await page.locator('.receipt-row').filter({ hasText: 'M6 Loose Receipt' }).click();
  await page.getByRole('button', { name: '刪除' }).click();
  await expect(page.getByText('M6 Loose Receipt')).toBeHidden();
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
  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.getByText('行程時間線')).toBeVisible();
  const hrefs = await page.getByRole('link', { name: '地圖' }).evaluateAll((links) => links.map((link) => link.getAttribute('href') || ''));
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
        ],
      }],
      receipts: [],
    }));
  }, fixed);
  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.getByText('行程時間線')).toBeVisible();
  await expect(page.locator('.timeline-event.is-passed')).toContainText('Breakfast Stop');
  await expect(page.locator('.timeline-event.is-live')).toContainText('Lunch Stop');
  await expect(page.locator('.timeline-event.is-live')).toContainText('Now');
  await expect(page.locator('.timeline-event.is-future')).toContainText('Dinner Stop');
  const liveGlint = await page.locator('.timeline-event.is-live').evaluate((node) => getComputedStyle(node, '::after').animationName);
  expect(liveGlint).toContain('route-glint');
});

test('Timeline command card stays compact and day header shows one date', async ({ page }) => {
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

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.getByText('行程時間線')).toBeVisible();
  const command = page.locator('.timeline-command');
  await expect(command).not.toContainText('📍');
  await expect(page.locator('.timeline-command-title-row')).toBeVisible();
  await expect(page.locator('.timeline-trip-days')).toHaveText('6日');
  const commandAtmosphere = await command.evaluate((node) => getComputedStyle(node).backgroundImage);
  expect(commandAtmosphere).toContain('travel-ai-atlas');
  const commandMetrics = await page.evaluate(() => {
    const card = document.querySelector('.timeline-command')?.getBoundingClientRect();
    const firstDay = document.querySelector('.timeline-day')?.getBoundingClientRect();
    const screen = document.querySelector('.timeline-screen')?.getBoundingClientRect();
    const title = document.querySelector('.timeline-command-title')?.getBoundingClientRect();
    const days = document.querySelector('.timeline-trip-days')?.getBoundingClientRect();
    return {
      height: card?.height || 0,
      topGap: card && screen ? card.top - screen.top : 0,
      lowerGap: card && firstDay ? firstDay.top - card.bottom : 0,
      firstDayTop: firstDay?.top || 0,
      titleCenter: title ? title.top + title.height / 2 : 0,
      daysCenter: days ? days.top + days.height / 2 : 0,
      titleRight: title?.right || 0,
      daysLeft: days?.left || 0,
    };
  });
  expect(commandMetrics.height, JSON.stringify(commandMetrics, null, 2)).toBeLessThanOrEqual(130);
  expect(commandMetrics.topGap, JSON.stringify(commandMetrics, null, 2)).toBeLessThanOrEqual(18);
  expect(commandMetrics.lowerGap, JSON.stringify(commandMetrics, null, 2)).toBeLessThanOrEqual(16);
  expect(commandMetrics.firstDayTop, JSON.stringify(commandMetrics, null, 2)).toBeLessThanOrEqual(320);
  expect(Math.abs(commandMetrics.titleCenter - commandMetrics.daysCenter), JSON.stringify(commandMetrics, null, 2)).toBeLessThanOrEqual(7);
  expect(commandMetrics.daysLeft, JSON.stringify(commandMetrics, null, 2)).toBeGreaterThan(commandMetrics.titleRight);

  const firstDay = page.locator('.timeline-day').first();
  await expect(firstDay.locator('.timeline-day-date-primary')).toHaveCount(1);
  await expect(firstDay.locator('.timeline-day-status .status-pill')).toHaveCount(0);
  await expect(firstDay.locator('.timeline-day-status')).not.toContainText('2026-05-08');
});

test('Timeline mobile rail shines independently without covering compact itinerary cards', async ({ page }) => {
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

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.getByText('行程時間線')).toBeVisible();
  await expect(page.locator('.timeline-rail-beam')).toBeVisible();

  const geometry = await page.evaluate(() => {
    const railBeam = document.querySelector('.timeline-rail-beam')?.getBoundingClientRect();
    const marker = document.querySelector('.timeline-now-marker')?.getBoundingClientRect();
    const firstEvent = document.querySelector('.timeline-event')?.getBoundingClientRect();
    const firstMain = document.querySelector('.timeline-main')?.getBoundingClientRect();
    const eventHeights = Array.from(document.querySelectorAll('.timeline-event')).map((node) => Math.round(node.getBoundingClientRect().height));
    return {
      railBeam: railBeam && { right: railBeam.right },
      marker: marker && { right: marker.right },
      firstEvent: firstEvent && { left: firstEvent.left },
      firstMain: firstMain && { left: firstMain.left },
      eventHeights,
    };
  });

  expect(geometry.railBeam).toBeTruthy();
  expect(geometry.marker).toBeTruthy();
  expect(geometry.firstEvent).toBeTruthy();
  expect(geometry.firstMain).toBeTruthy();
  expect(geometry.railBeam.right).toBeLessThanOrEqual(geometry.firstEvent.left - 8);
  expect(geometry.marker.right).toBeLessThanOrEqual(geometry.firstEvent.left - 4);
  expect(geometry.firstMain.left).toBeGreaterThan(geometry.firstEvent.left + 74);
  expect(Math.max(...geometry.eventHeights), JSON.stringify(geometry, null, 2)).toBeLessThanOrEqual(116);
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

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.getByRole('heading', { name: 'Current Day' })).toBeVisible();
  const todayRail = page.locator('.timeline-rail.is-today');
  await expect(todayRail.locator('.timeline-now-marker')).toContainText('09:30');
  await expect(page.locator('.timeline-event.is-live')).toContainText('Temple Gate');

  const railMetrics = await todayRail.evaluate((rail) => {
    const style = getComputedStyle(rail);
    const marker = rail.querySelector('.timeline-now-marker')?.getBoundingClientRect();
    const events = Array.from(rail.querySelectorAll('.timeline-event')).map((node) => node.getBoundingClientRect());
    const live = rail.querySelector('.timeline-event.is-live')?.getBoundingClientRect();
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

test('Timeline rail uses a lighter inactive colour when today is outside the trip dates', async ({ page }) => {
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

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.getByText('Past Day Two')).toBeVisible();
  await expect(page.locator('.timeline-rail.is-today')).toHaveCount(0);
  await expect(page.locator('.timeline-now-marker')).toHaveCount(0);
  await expect(page.locator('.timeline-rail.is-outside-trip')).toHaveCount(2);

  const inactiveRail = await page.locator('.timeline-rail.is-outside-trip').first().evaluate((rail) => {
    const fill = rail.querySelector('.timeline-rail-fill');
    const track = rail.querySelector('.timeline-rail-track');
    const sweep = rail.querySelector('.timeline-rail-sweep');
    return {
      progress: Number(getComputedStyle(rail).getPropertyValue('--timeline-progress')),
      fillBackground: fill ? getComputedStyle(fill).backgroundImage : '',
      fillOpacity: fill ? Number(getComputedStyle(fill).opacity) : 1,
      trackBackground: track ? getComputedStyle(track).backgroundImage : '',
      sweepOpacity: sweep ? Number(getComputedStyle(sweep).opacity) : 1,
    };
  });

  expect(inactiveRail.progress).toBe(1);
  expect(inactiveRail.fillBackground).toMatch(/194,\s*59,\s*94/);
  expect(inactiveRail.fillBackground).toMatch(/212,\s*168,\s*67/);
  expect(inactiveRail.fillBackground).toMatch(/45,\s*110,\s*72/);
  expect(inactiveRail.trackBackground).toMatch(/194,\s*59,\s*94/);
  expect(inactiveRail.fillOpacity).toBeLessThan(0.4);
  expect(inactiveRail.sweepOpacity).toBeLessThan(0.2);
});
