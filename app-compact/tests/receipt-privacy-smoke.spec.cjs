const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

const PERSONS = [
  { id: 'p_boss', name: 'A', emoji: '👤', color: '#CC2929' },
  { id: 'p2', name: 'B', emoji: '🧳', color: '#1E4D6B' },
];

function seed(page, state) {
  return page.addInitScript((payload) => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify(payload));
  }, {
    budget: 100000, rate: 20.36, tripCurrency: 'JPY', persons: PERSONS,
    shareRatios: { p_boss: 50, p2: 50 },
    ...state,
  });
}

const splitSelect = (page) => page.getByLabel('分帳', { exact: true });
const visibilitySelect = (page) => page.getByLabel('可見度', { exact: true });
const beneficiarySelect = (page) => page.getByLabel('受惠人', { exact: true });

test('可見度 gating: only personal 私人 records can be 🔒, saved + marked + persisted', async ({ page }) => {
  await seed(page, {
    lastTab: 'history',
    receipts: [{
      id: 'r_pub', store: '團體晚餐', total: 1000, currency: 'JPY', originalCurrency: 'JPY',
      date: '2026-04-21', category: 'food', payment: 'cash',
      personId: 'p_boss', splitMode: 'shared', createdAt: Date.now(), updatedAt: Date.now(),
    }],
  });
  await page.goto('http://localhost:8903/travel-expense/compact/#history');
  await page.getByText('團體晚餐').first().click();
  await expect(page.getByRole('heading', { name: '編輯紀錄' })).toBeVisible();

  // Shared split → visibility locked to 全團可見.
  await expect(visibilitySelect(page)).toBeDisabled();
  await expect(visibilitySelect(page)).toHaveValue('trip');

  // 私人 split with self beneficiary (default) → eligible.
  await splitSelect(page).selectOption('private');
  await expect(visibilitySelect(page)).toBeEnabled();
  await visibilitySelect(page).selectOption('private');

  // Cross-person 代付 → privacy revoked (a hidden record must not charge someone else).
  await beneficiarySelect(page).selectOption('p2');
  await expect(visibilitySelect(page)).toBeDisabled();
  await expect(visibilitySelect(page)).toHaveValue('trip');

  // Back to self → eligible again; pick 🔒 and save.
  await beneficiarySelect(page).selectOption('p_boss');
  await expect(visibilitySelect(page)).toBeEnabled();
  await visibilitySelect(page).selectOption('private');
  await page.getByRole('button', { name: '儲存' }).click();

  // 🔒 marker renders in the ledger and visibility persisted to localStorage.
  await expect(page.locator('.history-private-mini').first()).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('boss-japan-tracker') || '{}'));
  const saved = (stored.receipts || []).find((r) => r.id === 'r_pub');
  expect(saved?.visibility).toBe('private');
  expect(saved?.splitMode).toBe('private');
});

test('normalize strips illegal private visibility (shared split / cross 代付)', async ({ page }) => {
  await seed(page, {
    lastTab: 'history',
    receipts: [
      {
        id: 'r_bad_shared', store: '違規共享單', total: 500, currency: 'JPY', originalCurrency: 'JPY',
        date: '2026-04-21', category: 'food', payment: 'cash',
        personId: 'p_boss', splitMode: 'shared', visibility: 'private', createdAt: Date.now(), updatedAt: Date.now(),
      },
      {
        id: 'r_bad_daifu', store: '違規代付單', total: 600, currency: 'JPY', originalCurrency: 'JPY',
        date: '2026-04-21', category: 'food', payment: 'cash',
        personId: 'p_boss', splitMode: 'private', beneficiaryId: 'p2', visibility: 'private', createdAt: Date.now(), updatedAt: Date.now(),
      },
      {
        id: 'r_ok', store: '合法私人單', total: 700, currency: 'JPY', originalCurrency: 'JPY',
        date: '2026-04-21', category: 'shopping', payment: 'cash',
        personId: 'p_boss', splitMode: 'private', visibility: 'private', createdAt: Date.now(), updatedAt: Date.now(),
      },
    ],
  });
  await page.goto('http://localhost:8903/travel-expense/compact/#history');
  await expect(page.getByText('合法私人單')).toBeVisible();
  // Only the legal personal record keeps its 🔒 after normalizeState.
  await expect(page.locator('.history-private-mini')).toHaveCount(1);
  const row = page.locator('.receipt-main', { hasText: '合法私人單' });
  await expect(row.locator('.history-private-mini')).toHaveCount(1);
});

test('settlement is identical with and without a 🔒 private record', async ({ page }) => {
  const base = {
    lastTab: 'settings',
    receipts: [
      {
        id: 'r_shared', store: '團體晚餐', total: 1000, currency: 'JPY', originalCurrency: 'JPY',
        date: '2026-04-21', category: 'food', payment: 'cash',
        personId: 'p_boss', splitMode: 'shared', createdAt: Date.now(), updatedAt: Date.now(),
      },
      {
        id: 'r_secret', store: '秘密血拼', total: 800, currency: 'JPY', originalCurrency: 'JPY',
        date: '2026-04-21', category: 'shopping', payment: 'cash',
        personId: 'p_boss', splitMode: 'private', visibility: 'private', createdAt: Date.now(), updatedAt: Date.now(),
      },
    ],
  };
  await seed(page, base);
  await page.goto('http://localhost:8903/travel-expense/compact/#settings');
  const shareAccordion = page.getByRole('button', { name: /旅伴/ });
  if ((await shareAccordion.getAttribute('aria-expanded')) !== 'true') await shareAccordion.click();
  const miniList = page.locator('.mini-list').first();
  await expect(miniList).toBeVisible();
  const text = await miniList.innerText();
  console.log('settlement with private record:\n', text);
  // ¥1000 shared 50/50 → each owes 500; B transfers 500 to A. The ¥800 private record must not
  // appear in shared math (it lands in the owner's 私人 bucket only).
  const shouldPays = [...text.matchAll(/應付\s*¥([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, '')));
  expect(shouldPays).toEqual([500, 500]);
  await expect(page.getByText(/B\s*→\s*A\s*¥?500/)).toBeVisible();
  expect(text).not.toContain('1,800');
});
