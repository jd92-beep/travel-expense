const { test, expect } = require('@playwright/test');
const ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://127.0.0.1:8903';
const APP = `${ORIGIN}/travel-expense/compact/`;
const STATE = 'boss-japan-tracker';
const otherReceipt = { id: 'osaka-dinner', sourceId: 'osaka-source', tripId: 'entry-osaka', store: '大阪晚餐', date: '2026-11-02', total: 3600, currency: 'JPY', originalCurrency: 'JPY', originalAmount: 3600, exchangeRate: 20, hkdAmount: 180, category: 'food', payment: 'cash', personId: 'p_boss', createdAt: 1 };
const savedCafe = { id: 'tokyo-cafe', sourceId: 'cafe-source', supabaseId: '11111111-1111-4111-8111-111111111111', tripId: 'entry-tokyo', store: '東京咖啡', date: '2026-10-20', total: 680, originalAmount: 680, currency: 'JPY', originalCurrency: 'JPY', exchangeRate: 10, hkdAmount: 68, category: 'food', payment: 'cash', personId: 'p_boss', createdAt: 2 };
test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', timezoneId: 'Asia/Hong_Kong' });

async function seed(page, receipts = [], statePatch = {}) {
  await page.route('**/*', route => new URL(route.request().url()).origin === ORIGIN ? route.continue() : route.abort());
  await page.clock.setFixedTime(new Date('2026-10-20T04:00:00Z'));
  await page.addInitScript(({ receipts, otherReceipt, statePatch }) => {
    window.__disable_supabase_configured = true;
    if (localStorage.getItem('entry-seeded')) return;
    localStorage.setItem('entry-seeded', '1');
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 86400000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({ credentialSession: 'disposable-entry-session', credentialSessionExpiresAt: Date.now() + 86400000 }));
    const trip = (id, name, date, active) => ({ id, name, active, startDate: date, endDate: date, version: 1, itineraryVersion: 1, currencies: ['JPY'], timezones: ['Asia/Tokyo'], itinerary: [{ date, day: 1, currency: 'JPY', region: '東京', timezone: 'Asia/Tokyo', spots: [] }] });
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      autoSync: false, lastTab: 'scan', activeTripId: 'entry-tokyo', tripName: '東京 · 記帳測試', tripCurrency: 'JPY', rate: 20, rateMode: 'fixed',
      rateTable: { JPY: { currency: 'JPY', perHkd: 20, source: 'manual', fetchedAt: Date.now() }, USD: { currency: 'USD', perHkd: 0.128, source: 'manual', fetchedAt: Date.now() } },
      trips: [trip('entry-tokyo', '東京 · 記帳測試', '2026-10-20', true), trip('entry-osaka', '大阪 · 隔離測試', '2026-11-02', false)],
      receipts: [...receipts, otherReceipt],
      ...statePatch,
    }));
  }, { receipts, otherReceipt, statePatch });
  await page.goto(`${APP}#scan`);
  await expect(page.getByRole('button', { name: '手動', exact: true })).toBeVisible();
}
async function manual(page) {
  await page.getByRole('button', { name: '手動', exact: true }).click();
  return page.getByRole('dialog', { name: '手動記一筆' });
}
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), STATE);
async function openReceipt(page, name) {
  await page.getByLabel('主要分頁').getByRole('button', { name: '紀錄', exact: true }).click();
  await page.locator('.receipt-row').filter({ hasText: name }).first().click();
  return page.getByRole('dialog', { name: '編輯紀錄' });
}

test('partially saved batches retain selected incomplete rows for correction', async ({ page }) => {
  await seed(page);
  await page.route('**/openrouter/json', route => route.fulfill({ status: 200, json: { ok: true, data: [
    { store: '完成午餐', date: '2026-10-20', total: 1000, currency: 'JPY', category: 'food', payment: 'cash' },
    { store: '待補日期咖啡', date: '', total: 500, currency: 'JPY', category: 'food', payment: 'cash' },
  ] } }));
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await page.getByPlaceholder('貼 booking confirmation / email 文字').fill('午餐及咖啡收據');
  await page.getByRole('button', { name: '解析文字' }).click();
  await expect(page.locator('.batch-item')).toHaveCount(2);
  await page.getByRole('button', { name: /全部儲存/ }).click();
  await expect(page.locator('.batch-item')).toHaveCount(1);
  const remaining = page.locator('.batch-item');
  await expect(remaining.getByLabel('店名', { exact: true })).toHaveValue('⏳ 待補日期咖啡');
  await remaining.getByLabel('日期', { exact: true }).fill('2026-10-20');
  await page.getByRole('button', { name: /全部儲存/ }).click();
  await expect(page.locator('.batch-item')).toHaveCount(0);
  expect((await saved(page)).receipts.filter(r => r.store.includes('完成午餐'))).toHaveLength(1);
  expect((await saved(page)).receipts.filter(r => r.store.includes('待補日期咖啡'))).toHaveLength(1);
});

for (const switchTrip of [false, true]) {
  test(`delayed OCR ${switchTrip ? 'cannot populate another trip' : 'still completes after same-trip tab navigation'}`, async ({ page }) => {
    await seed(page);
    let release;
    let requested;
    const requestSeen = new Promise(resolve => { requested = resolve; });
    await page.route('**/openrouter/json', async route => {
      requested();
      await new Promise(resolve => { release = resolve; });
      await route.fulfill({ status: 200, json: { ok: true, data: { store: '延遲東京收據', date: '2026-10-20', total: 1000, currency: 'JPY', category: 'food', payment: 'cash' } } });
    });
    await page.locator('#scan-camera-input').setInputFiles({ name: 'delayed.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64') });
    await requestSeen;
    await page.getByLabel('主要分頁').getByRole('button', { name: '紀錄', exact: true }).click();
    if (switchTrip) {
      await page.locator('.journey-trip-trigger:visible').click();
      await page.getByRole('button', { name: /大阪 · 隔離測試/ }).click();
    }
    const response = page.waitForResponse('**/openrouter/json');
    release();
    await response;
    await expect(page.locator('.global-ocr-floating-badge')).toHaveCount(0);
    if (switchTrip) {
      await expect(page.getByRole('dialog', { name: '編輯紀錄' })).toHaveCount(0);
      expect((await saved(page)).receipts.filter(r => r.store === '延遲東京收據')).toHaveLength(0);
    } else {
      const editor = page.getByRole('dialog', { name: '編輯紀錄' });
      await expect(editor.getByLabel('店名 / 項目')).toHaveValue('延遲東京收據');
      await editor.getByRole('button', { name: '儲存', exact: true }).click();
      expect((await saved(page)).receipts.find(r => r.store === '延遲東京收據')).toMatchObject({ tripId: 'entry-tokyo', total: 1000, hkdAmount: 50 });
    }
  });
}

test('batch imports stay in selected trip when another trip has the same dates', async ({ page }) => {
  const trip = (id, name, active) => ({ id, name, active, startDate: '2026-10-20', endDate: '2026-10-20', version: 1, currencies: ['JPY'], timezones: ['Asia/Tokyo'], itinerary: [{ date: '2026-10-20', day: 1, currency: 'JPY', spots: [] }] });
  await seed(page, [], { activeTripId: 'entry-osaka', tripName: '大阪 · 隔離測試', trips: [trip('entry-tokyo', '東京 · 記帳測試', false), trip('entry-osaka', '大阪 · 隔離測試', true)] });
  await page.route('**/openrouter/json', route => route.fulfill({ status: 200, json: { ok: true, data: [{ store: '大阪批次午餐', date: '2026-10-20', total: 1000, currency: 'JPY', category: 'food', payment: 'cash' }] } }));
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await page.getByPlaceholder('貼 booking confirmation / email 文字').fill('大阪批次午餐收據');
  await page.getByRole('button', { name: '解析文字' }).click();
  await expect(page.locator('.batch-item')).toHaveCount(1);
  await page.getByRole('button', { name: /全部儲存/ }).click();
  await expect(page.locator('.batch-item')).toHaveCount(0);
  await expect.poll(async () => (await saved(page)).receipts.find(r => r.store.includes('大阪批次午餐'))).toMatchObject({ tripId: 'entry-osaka', tripLinkSource: 'explicit', total: 1000 });
});

test('Scan rate sheet remains in the viewport with normal tab animations', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await seed(page);
  await page.getByRole('button', { name: '匯率 Exchange Rate', exact: true }).click();
  const sheet = page.getByRole('dialog').locator('.modal');
  await expect(sheet).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: info.outputPath('scan-rate-contained.png'), animations: 'disabled' });
});
