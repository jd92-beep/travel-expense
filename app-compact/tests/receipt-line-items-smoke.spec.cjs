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

test('removing the last line item stays removed after save and reopen', async ({ page }) => {
  await seed(page, [{ ...savedCafe, itemsText: '- 咖啡: ¥680', lineItems: [{ id: 'cafe-item', desc: '咖啡', amount: 680 }] }]);
  const editor = await openReceipt(page, '東京咖啡');
  await editor.getByRole('button', { name: '刪除品項 1', exact: true }).click();
  await editor.getByRole('button', { name: '儲存', exact: true }).click();
  const receipt = (await saved(page)).receipts.find(r => r.id === savedCafe.id);
  expect(receipt.itemsText || '').toBe('');
  expect(receipt.lineItems || []).toEqual([]);
  const reopened = await openReceipt(page, '東京咖啡');
  await expect(reopened.getByLabel('品項 1', { exact: true })).toHaveCount(0);
});

test('Enter commits an edited item before submitting the receipt', async ({ page }) => {
  await seed(page, [{ ...savedCafe, itemsText: '- 咖啡: ¥680', lineItems: [{ id: 'cafe-item', desc: '咖啡', amount: 680 }] }]);
  const editor = await openReceipt(page, '東京咖啡');
  const item = editor.getByLabel('品項 1', { exact: true });
  await item.fill('午餐   ¥780   HK$68');
  await item.press('Enter');
  await expect(editor).toHaveCount(0);
  expect((await saved(page)).receipts.find(r => r.id === savedCafe.id).lineItems[0]).toMatchObject({ desc: '午餐', amount: 780 });
});

test('HKD line-item editing recognizes the first amount even when both labels are HKD', async ({ page }) => {
  await seed(page, [{ ...savedCafe, currency: 'HKD', originalCurrency: 'HKD', total: 68, originalAmount: 68, exchangeRate: 1, lineItems: [{ id: 'cafe-item', desc: '咖啡', amount: 68 }] }]);
  const editor = await openReceipt(page, '東京咖啡');
  await editor.getByLabel('品項 1', { exact: true }).fill('咖啡   HK$78.50   HK$68');
  await editor.getByRole('button', { name: '儲存', exact: true }).click();
  expect((await saved(page)).receipts.find(r => r.id === savedCafe.id).lineItems[0]).toMatchObject({ desc: '咖啡', amount: 78.5 });
});

test('converted historical receipts label the editable total with its stored currency', async ({ page }) => {
  await seed(page, [{ ...savedCafe, originalCurrency: 'USD', originalAmount: 4.25 }]);
  const editor = await openReceipt(page, '東京咖啡');
  await expect(editor.getByLabel('貨幣', { exact: true })).toHaveValue('JPY');
  await editor.getByLabel('金額', { exact: true }).fill('1000');
  await editor.getByRole('button', { name: '儲存', exact: true }).click();
  expect((await saved(page)).receipts.find(r => r.id === savedCafe.id)).toMatchObject({ total: 1000, currency: 'JPY', originalCurrency: 'USD', originalAmount: 4.25, hkdAmount: 100 });
});

test('line-item quantities can be added and removed without being silently retained or dropped', async ({ page }) => {
  await seed(page, [{ ...savedCafe, lineItems: [{ id: 'cafe-item', desc: '咖啡', qty: 2, amount: 680 }] }]);
  const editor = await openReceipt(page, '東京咖啡');
  await editor.getByLabel('品項 1', { exact: true }).fill('咖啡   ¥680   HK$68');
  await editor.getByLabel('新品項', { exact: true }).fill('飯糰 x 3   ¥300   HK$30');
  await editor.getByRole('button', { name: '儲存', exact: true }).click();
  const items = (await saved(page)).receipts.find(r => r.id === savedCafe.id).lineItems;
  expect(items[0].qty).toBeUndefined();
  expect(items[1]).toMatchObject({ desc: '飯糰', qty: 3, amount: 300 });
});
