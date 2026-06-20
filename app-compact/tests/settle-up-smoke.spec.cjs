const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));
});

const persons = [
  { id: 'p_boss', name: 'User 1 Cheung', emoji: 'T', color: '#cc2929' },
  { id: 'p_xinxin', name: 'Xinxin Wong', emoji: 'X', color: '#2d5a8e' },
];

// Same seed as stats-smoke -> outstanding transfer is "Xinxin Wong -> User 1 Cheung ¥2,850".
const receipts = [
  { id: 's_shared_boss', store: 'M9 Sushi', total: 1000, date: '2026-04-20', category: 'food', payment: 'cash', personId: 'p_boss', splitMode: 'shared', createdAt: 1 },
  { id: 's_shared_xin', store: 'M9 Museum', total: 200, date: '2026-04-20', category: 'ticket', payment: 'credit', personId: 'p_xinxin', splitMode: 'shared', createdAt: 2 },
  { id: 's_private_cross', store: 'M9 Gift', total: 300, date: '2026-04-21', category: 'shopping', payment: 'paypay', personId: 'p_boss', splitMode: 'private', beneficiaryId: 'p_xinxin', createdAt: 3 },
  { id: 's_private_self', store: 'M9 Medicine', total: 150, date: '2026-04-21', category: 'medicine', payment: 'cash', personId: 'p_xinxin', splitMode: 'private', createdAt: 4 },
  { id: 's_lodging', store: 'M9 Hotel', total: 5000, date: '2026-04-22', category: 'lodging', payment: 'credit', personId: 'p_boss', splitMode: 'shared', createdAt: 5 },
  { id: 's_transport', store: 'M9 Train', total: 700, date: '2026-04-22', category: 'transport', payment: 'suica', personId: 'p_xinxin', splitMode: 'shared', createdAt: 6 },
];

const firstPercent = async (locator) => {
  const text = await locator.innerText();
  return (text.match(/\d+%/) || ['n/a'])[0];
};

test('Balances consume explicit splits and multiple payers', async ({ page }) => {
  await page.addInitScript((payload) => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify(payload));
  }, {
    lastTab: 'stats',
    persons,
    shareRatios: { p_boss: 1, p_xinxin: 1 },
    receipts: [
      { id: 'legacy_equal', store: 'Legacy meal', total: 100, date: '2026-04-20', category: 'food', payment: 'cash', personId: 'p_boss', splitMode: 'shared', createdAt: 1 },
      {
        id: 'exact_multi_payer',
        store: 'Exact split meal',
        total: 100,
        date: '2026-04-20',
        category: 'food',
        payment: 'cash',
        splitMode: 'shared',
        splitType: 'exact',
        splits: [{ personId: 'p_boss', amount: 25 }, { personId: 'p_xinxin', amount: 75 }],
        payers: [{ personId: 'p_boss', amount: 60 }, { personId: 'p_xinxin', amount: 40 }],
        createdAt: 2,
      },
    ],
    budget: 2400,
    statsIncludeTransportLodging: false,
    top10IncludeBigItems: true,
    schemaVersion: 3,
  });

  await page.goto('http://localhost:8903/travel-expense/compact/#stats');
  await expect(page.locator('.transfer-modern')).toHaveCount(1);
  await expect(page.locator('.transfer-modern')).toContainText('¥85');
});

test('Settle up records a payment that zeroes the balance without touching spending', async ({ page }) => {
  await page.addInitScript((payload) => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify(payload));
  }, {
    lastTab: 'stats',
    persons,
    shareRatios: { p_boss: 1, p_xinxin: 1 },
    receipts,
    budget: 2400,
    statsIncludeTransportLodging: false,
    top10IncludeBigItems: true,
    schemaVersion: 3,
  });

  await page.goto('http://localhost:8903/travel-expense/compact/#stats');

  // Outstanding transfer + spending baseline before settling.
  await expect(page.locator('.transfer-modern')).toContainText('¥2,850');
  const compass = page.locator('.spending-compass');
  await expect(compass).toBeVisible();
  const usageBefore = await firstPercent(compass);
  expect(usageBefore).toMatch(/\d+%/);

  // Record the settlement: Xinxin pays User 1 the full ¥2,850.
  await page.getByRole('button', { name: '結清' }).first().click();
  const modal = page.getByRole('dialog', { name: '記錄結算' });
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('Xinxin Wong');
  await expect(modal).toContainText('User 1 Cheung');
  await expect(modal.locator('input[type="number"]')).toHaveValue('2850');
  await modal.getByRole('button', { name: '確認結算' }).click();

  // Balance is now settled: the transfer is gone and a settlement record appears.
  await expect(page.locator('.transfer-modern')).toHaveCount(0);
  await expect(page.getByText('暫時唔需要互相轉帳')).toBeVisible();
  const records = page.locator('.settlement-records');
  await expect(records).toBeVisible();
  await expect(records).toContainText('已結算記錄');
  await expect(records).toContainText('User 1 Cheung'); // receiver (to)
  await expect(records).toContainText('¥2,850');

  // The settlement is NOT spending: budget usage returns to the same value (auto-retries past
  // the compass count-up animation).
  await expect(compass).toContainText(usageBefore);

  // Undo the settlement -> the outstanding transfer comes back.
  await page.locator('.settlement-records button[aria-label="刪除結算記錄"]').first().click();
  await expect(page.locator('.transfer-modern')).toContainText('¥2,850');
});
