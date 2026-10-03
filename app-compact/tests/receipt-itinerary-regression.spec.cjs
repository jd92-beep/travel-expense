const { test, expect } = require('@playwright/test');
const origin = process.env.COMPACT_TEST_ORIGIN || 'http://127.0.0.1:8903';
test.use({ viewport: { width: 390, height: 844 } });
async function seed(page, date) {
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.fulfill({ status: 200, json: {} }));
  await page.addInitScript(date => {
    window.__disable_supabase_configured = true;
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 60_000 }));
    const itinerary = ['2026-10-02', '2026-10-03'].map((date, i) => ({ date, day: i + 1, region: '香港', timezone: 'Asia/Hong_Kong', spots: [{ name: `Original ${i}`, time: '09:00', type: 'food' }] }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      autoSync: false, lastTab: 'history', activeTripId: 't1', tripName: 'Receipt dates',
      tripDateRange: { start: itinerary[0].date, end: itinerary[1].date }, customItinerary: itinerary,
      trips: [{ id: 't1', name: 'Receipt dates', startDate: itinerary[0].date, endDate: itinerary[1].date, active: true, version: 1, itineraryVersion: 1, itinerary, currencies: ['HKD'], timezones: ['Asia/Hong_Kong'] }],
      receipts: [{ id: 'r1', tripId: 't1', store: 'Exact day receipt', date, time: '12:00', total: 12, currency: 'HKD', category: 'food', payment: 'cash', createdAt: 1 }],
    }));
  }, date);
  await page.goto(`${origin}/travel-expense/compact/#history`);
  await page.locator('.history-ledger-row').filter({ hasText: 'Exact day receipt' }).click();
}
test('adding a receipt preserves the full itinerary, uses its exact date and versions the edit', async ({ page }) => {
  await seed(page, '2026-10-03');
  await page.getByRole('button', { name: '加入行程', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('boss-japan-tracker')).trips[0].itineraryVersion)).toBe(2);
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('boss-japan-tracker')));
  expect(state.trips[0].itinerary[0].spots.map(s => s.name)).toEqual(['Original 0']);
  expect(state.trips[0].itinerary[1].spots.map(s => s.name)).toEqual(['Original 1', 'Exact day receipt']);
  expect(state.syncQueue.map(q => q.type).sort()).toEqual(['settings', 'trip']);
});
test('out-of-trip receipt date is explained without silently inserting into day one', async ({ page }) => {
  await seed(page, '2026-10-05');
  const dialog = page.waitForEvent('dialog');
  const click = page.getByRole('button', { name: '加入行程', exact: true }).click();
  const alert = await dialog;
  expect(alert.message()).toContain('收據日期不在目前行程內');
  await alert.accept(); await click;
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('boss-japan-tracker')).trips[0].itineraryVersion)).toBe(1);
  await expect(page.getByRole('dialog', { name: '編輯紀錄' })).toBeVisible();
});
