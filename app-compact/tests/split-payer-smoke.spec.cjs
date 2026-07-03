const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

test('manual entry validates multiple payers', async ({ page }) => {
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'split-payer-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'scan',
      autoSync: false,
      tripDateRange: { start: '2026-05-08', end: '2026-05-08' },
      persons: [
        { id: 'p_boss', name: 'Boss', emoji: '👦', color: '#CC2929' },
        { id: 'p_friend', name: 'Friend', emoji: '🧑', color: '#2D6E48' },
      ],
      shareRatios: { p_boss: 1, p_friend: 1 },
      receipts: [],
      customItinerary: [],
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  const nav = page.getByLabel('主要分頁');
  await nav.getByRole('button', { name: '記帳', exact: true }).click();
  await page.getByRole('button', { name: '手動', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: '手動記一筆' });
  await page.getByLabel('店名 / 項目').fill('多人付款測試');
  await page.getByLabel('金額', { exact: true }).fill('100');
  await dialog.locator('summary').filter({ hasText: '進階拆數' }).click();
  await dialog.getByLabel('多人付款').check();
  await expect(dialog.getByText('至少兩位付款')).toBeVisible();
  await expect(dialog.getByLabel('Boss 付款')).toHaveValue('100');
  await expect(dialog.getByLabel('Friend 付款')).toHaveValue('0');

  await dialog.getByLabel('Boss 付款').fill('60');
  await dialog.getByLabel('Friend 付款').fill('30');
  await expect(dialog.getByText('差 ¥10')).toBeVisible();
  await dialog.getByLabel('Friend 付款').fill('40');
  await expect(dialog.getByText('已對數')).toBeVisible();
  await page.getByRole('button', { name: '儲存' }).click();

  await nav.getByRole('button', { name: '紀錄', exact: true }).click();
  await expect(page.locator('.receipt-row').filter({ hasText: '多人付款測試' })).toContainText('100');
});
