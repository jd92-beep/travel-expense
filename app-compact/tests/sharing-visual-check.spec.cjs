const { test, expect } = require('@playwright/test');

const APP_ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://127.0.0.1:8903';

test('shared trip: foreign-owned receipt badge + read-only editor', async ({ page }) => {
  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'history',
      autoSync: false,
      receipts: [
        {
          id: 'r_mine', sourceId: 'src_mine', store: '我嘅拉麵', total: 1200, currency: 'JPY',
          date: '2026-09-02', category: 'food', payment: 'cash', personId: 'p1', splitMode: 'shared',
          ownerId: 'user_me', createdByLabel: 'You', supabaseId: '11111111-1111-4111-8111-111111111111',
          createdAt: 1770000000000, updatedAt: 1770000000000,
        },
        {
          id: 'r_friend', sourceId: 'src_friend', store: '旅伴嘅壽司', total: 5600, currency: 'JPY',
          date: '2026-09-02', category: 'food', payment: 'credit', personId: 'p2', splitMode: 'shared',
          ownerId: 'user_friend', createdByLabel: 'Natalie', supabaseId: '22222222-2222-4222-8222-222222222222',
          createdAt: 1770000100000, updatedAt: 1770000100000,
        },
      ],
      persons: [{ id: 'p1', name: '我', emoji: '🧑', color: '#1E4D6B' }, { id: 'p2', name: 'Natalie', emoji: '👩', color: '#8B4A6B' }],
    }));
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#history`);
  await expect(page.locator('.compact-mobile-title-art')).toHaveAttribute('data-title', '紀錄中心');

  // Badge on the friend's row
  const friendRow = page.locator('.history-ledger-row').filter({ hasText: '旅伴嘅壽司' });
  await expect(friendRow).toContainText('Natalie');
  await page.screenshot({ path: 'test-results/sharing-history-badge.png', fullPage: false });

  // Open friend's receipt → read-only editor
  await friendRow.click();
  const dialog = page.getByRole('dialog', { name: '旅伴紀錄' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('由 Natalie 記錄');
  await expect(dialog.getByRole('button', { name: '儲存' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '刪除' })).toHaveCount(0);
  await expect(page.getByLabel('店名 / 項目')).toBeDisabled();
  await page.screenshot({ path: 'test-results/sharing-editor-readonly.png' });
  await dialog.getByRole('button', { name: '取消' }).click();

  // Own receipt → editable editor
  await page.locator('.history-ledger-row').filter({ hasText: '我嘅拉麵' }).click();
  const ownDialog = page.getByRole('dialog', { name: '編輯紀錄' });
  await expect(ownDialog).toBeVisible();
  await expect(ownDialog.getByRole('button', { name: '儲存' })).toBeVisible();
  await expect(page.getByLabel('店名 / 項目')).toBeEnabled();
  await page.screenshot({ path: 'test-results/sharing-editor-own.png' });
});
