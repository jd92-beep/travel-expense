const { test, expect } = require('@playwright/test');
const origin = process.env.COMPACT_TEST_ORIGIN || 'http://127.0.0.1:8903';
test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

async function openReview(page) {
  const itinerary = [{ date: '2026-11-02', day: 1, region: 'Seoul', timezone: 'Asia/Seoul', currency: 'KRW', spots: [{ time: '12:00', name: 'Lunch', type: 'food' }] }];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.pathname === '/openrouter/json') return route.fulfill({ status: 200, json: { ok: true, data: {
      organizedItinerary: 'Day 1 2026-11-02 Seoul\n12:00 Lunch', summary: 'Seoul day plan', warnings: [], assumptions: [],
      trip: { name: 'Review trip', destinationSummary: 'Seoul', startDate: '2026-11-02', endDate: '2026-11-02', homeCurrency: 'HKD', currencies: ['HKD', 'KRW'], itinerary },
    } } });
    return route.fulfill({ status: 200, json: { ok: true, data: {} } });
  });
  await page.addInitScript((itinerary) => {
    window.__disable_supabase_configured = true;
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 600000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({ credentialSession: 'synthetic-review-session', credentialSessionExpiresAt: Date.now() + 600000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      autoSync: false, lastTab: 'settings', rateMode: 'fixed', tripUpdateModel: 'openrouter/nvidia/nemotron-3-super-120b-a12b:free',
      activeTripId: 'review-trip', tripName: 'Review trip', tripCurrency: 'KRW', tripDateRange: { start: '2026-11-02', end: '2026-11-02' },
      trips: [{ id: 'review-trip', name: 'Review trip', destinationSummary: 'Seoul', startDate: '2026-11-02', endDate: '2026-11-02', active: true, version: 1, itinerary, currencies: ['HKD', 'KRW'], timezones: ['Asia/Seoul'] }],
      customItinerary: itinerary, receipts: [],
    }));
  }, itinerary);
  await page.goto(`${origin}/travel-expense/compact/#settings`);
  await page.locator('.accordion-summary', { hasText: 'AI 行程更新' }).click();
  await page.getByPlaceholder(/下次/).fill('2026-11-02 Seoul Day 1 12:00 Lunch');
  await page.getByRole('button', { name: '用已選模型分析' }).click();
  const modal = page.getByRole('dialog', { name: '確認 AI 行程更新' });
  await expect(modal).toBeVisible();
  return modal;
}

test('trip review dismissal preserves edits until discard is confirmed', async ({ page }) => {
  const modal = await openReview(page);
  await modal.getByLabel('地點 / 活動').first().fill('Unsaved review change');
  let confirms = 0;
  const dismiss = (dialog) => { confirms += 1; void dialog.dismiss(); };
  page.on('dialog', dismiss);
  await modal.getByRole('button', { name: '關閉行程確認' }).click();
  await expect(modal).toBeVisible();
  expect(confirms).toBe(1);
  await page.keyboard.press('Escape');
  await expect(modal).toBeVisible();
  expect(confirms).toBe(2);
  await page.locator('.trip-confirm-backdrop').click({ position: { x: 2, y: 2 } });
  await expect(modal).toBeVisible();
  expect(confirms).toBe(3);
  await modal.getByRole('button', { name: '返回修改文字' }).click();
  await expect(modal.getByLabel('地點 / 活動').first()).toHaveValue('Unsaved review change');
  expect(confirms).toBe(4);
  page.off('dialog', dismiss);
  page.once('dialog', dialog => void dialog.accept());
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await page.getByRole('button', { name: '開啟確認視窗' }).click();
  await expect(modal.getByLabel('地點 / 活動').first()).toHaveValue('Lunch');
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('button', { name: '開啟確認視窗' })).toBeFocused();
});

test('trip review keyboard focus stays inside and applying keeps edited details', async ({ page }) => {
  const modal = await openReview(page);
  const close = modal.getByRole('button', { name: '關閉行程確認' });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(modal.getByRole('button', { name: '確認並更新行程' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await modal.getByLabel('地點 / 活動').first().fill('Confirmed review change');
  await modal.getByRole('button', { name: '確認並更新行程' }).click();
  await expect(modal).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('boss-japan-tracker')).trips.find(trip => trip.active).itinerary[0].spots[0].name)).toBe('Confirmed review change');
});

for (const reducedMotion of ['reduce', 'no-preference']) {
  test(`trip review stays inside the viewport after opening from scrolled Settings (${reducedMotion})`, async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion });
    const modal = await openReview(page);
    await expect(modal).toBeInViewport({ ratio: 1 });
    await expect(modal.getByRole('button', { name: '關閉行程確認' })).toBeInViewport({ ratio: 1 });
    await expect(modal.getByRole('button', { name: '確認並更新行程' })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: info.outputPath('review-contained.png'), animations: 'disabled' });
  });
}
