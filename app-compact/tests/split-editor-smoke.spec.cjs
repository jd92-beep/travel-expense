const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(60_000);

test.beforeEach(async ({ page }) => {
  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));
});

const persons = [
  { id: 'p_boss', name: 'Boss', emoji: 'B', color: '#cc2929' },
  { id: 'p_friend', name: 'Friend', emoji: 'F', color: '#2d5a8e' },
];

async function addManualReceipt(page, nav, config) {
  await nav.getByRole('button', { name: '記帳', exact: true }).click();
  await page.getByRole('button', { name: '手動', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '手動記一筆' });
  await expect(dialog).toBeVisible();
  await page.getByLabel('店名 / 項目').fill(config.store);
  await page.getByLabel('日期').fill('2026-04-20');
  await page.getByLabel('金額', { exact: true }).fill(String(config.total));
  if (config.payerId) {
    await dialog.locator('label').filter({ hasText: '付款人' }).locator('select').selectOption(config.payerId);
  }

  await dialog.locator('summary').filter({ hasText: '進階拆數' }).click();
  await expect(dialog.getByRole('tab', { name: '均分' })).toHaveAttribute('aria-selected', 'true');
  if (config.mode && config.mode !== '均分') await dialog.getByRole('tab', { name: config.mode }).click();
  for (const [label, value] of Object.entries(config.values || {})) {
    await dialog.getByLabel(label).fill(String(value));
  }
  if (config.payers) {
    await dialog.locator('label').filter({ hasText: '多人付款' }).locator('input').check();
    for (const [label, value] of Object.entries(config.payers)) {
      await dialog.getByLabel(label).fill(String(value));
    }
  }
  if ((config.mode && config.mode !== '均分') || config.payers) {
    await expect(dialog.getByText('已對數').last()).toBeVisible();
  }
  await page.getByRole('button', { name: '儲存' }).click();
  await expect(dialog).toHaveCount(0);
}

test('Split editor modes and multiple payers update balances', async ({ page }) => {
  await page.addInitScript((payload) => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify(payload));
  }, {
    lastTab: 'scan',
    persons,
    shareRatios: { p_boss: 1, p_friend: 1 },
    receipts: [],
    budget: 2400,
    statsIncludeTransportLodging: false,
    top10IncludeBigItems: true,
    schemaVersion: 3,
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  const nav = page.getByLabel('主要分頁');

  await addManualReceipt(page, nav, { store: 'Split Equal', total: 100, mode: '均分' });
  await addManualReceipt(page, nav, {
    store: 'Split Shares',
    total: 120,
    mode: '份數',
    values: { 'Boss 份數': 1, 'Friend 份數': 3 },
  });
  await addManualReceipt(page, nav, {
    store: 'Split Exact',
    total: 100,
    mode: '實額',
    payerId: 'p_friend',
    values: { 'Boss 實額': 20, 'Friend 實額': 80 },
  });
  await addManualReceipt(page, nav, {
    store: 'Split Percent',
    total: 200,
    mode: '百分比',
    values: { 'Boss 百分比': 25, 'Friend 百分比': 75 },
  });
  await addManualReceipt(page, nav, {
    store: 'Split Multi Payer',
    total: 100,
    mode: '加減',
    values: { 'Boss 加減': 20, 'Friend 加減': 0 },
    payers: { 'Boss 付款': 60, 'Friend 付款': 40 },
  });

  await expect.poll(async () => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('boss-japan-tracker') || '{}');
    return (state.receipts || []).length;
  })).toBe(5);

  const receipts = await page.evaluate(() => JSON.parse(localStorage.getItem('boss-japan-tracker') || '{}').receipts || []);
  const byStore = Object.fromEntries(receipts.map((receipt) => [receipt.store, receipt]));
  expect(byStore['Split Equal'].splitType).toBeUndefined();
  expect(byStore['Split Shares'].splitType).toBe('shares');
  expect(byStore['Split Exact'].splitType).toBe('exact');
  expect(byStore['Split Percent'].splitType).toBe('percent');
  expect(byStore['Split Multi Payer'].splitType).toBe('adjustment');
  expect(byStore['Split Multi Payer'].payers).toEqual([
    { personId: 'p_boss', amount: 60 },
    { personId: 'p_friend', amount: 40 },
  ]);

  await page.goto('http://localhost:8903/travel-expense/compact/#stats');
  await expect(page.locator('.transfer-modern')).toHaveCount(1);
  await expect(page.locator('.transfer-modern')).toContainText('Friend');
  await expect(page.locator('.transfer-modern')).toContainText('Boss');
  await expect(page.locator('.transfer-modern')).toContainText('¥270');
});
