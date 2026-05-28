const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

test('Timeline edit, reset, maps, and loose receipt flows', async ({ page }) => {
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
  });

  await page.goto('http://localhost:8902/travel-expense/react/');
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
  await page.goto('http://localhost:8902/travel-expense/react/');
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
  await page.goto('http://localhost:8902/travel-expense/react/');
  await expect(page.getByText('行程時間線')).toBeVisible();
  await expect(page.locator('.timeline-event.is-passed')).toContainText('Breakfast Stop');
  await expect(page.locator('.timeline-event.is-live')).toContainText('Lunch Stop');
  await expect(page.locator('.timeline-event.is-live')).toContainText('Now');
  await expect(page.locator('.timeline-event.is-future')).toContainText('Dinner Stop');
});
