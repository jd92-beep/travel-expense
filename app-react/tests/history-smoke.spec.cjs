const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

const receipts = [
  {
    id: 'm7_food',
    store: 'M7 Coffee',
    total: 111,
    date: '2026-04-20',
    time: '08:15',
    category: 'food',
    payment: 'cash',
    personId: 'p_boss',
    splitMode: 'shared',
    createdAt: 1,
  },
  {
    id: 'm7_train',
    store: 'M7 Train',
    total: 222,
    date: '2026-04-21',
    category: 'transport',
    payment: 'suica',
    personId: 'p_boss',
    splitMode: 'shared',
    createdAt: 2,
  },
  {
    id: 'm7_pending',
    sourceId: 'email_m7_pending',
    store: '⏳ M7 Pending',
    total: 333,
    date: '2026-04-22',
    category: 'food',
    payment: 'credit',
    personId: 'p_boss',
    splitMode: 'shared',
    createdAt: 3,
  },
];

test('History search, filter, pending, edit, delete, and safe pull', async ({ page }) => {
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/notion/request', async (route) => {
    const payload = route.request().postDataJSON();
    const data = String(payload.path || '').endsWith('/query')
      ? { results: [], has_more: false }
      : { properties: {} };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data }),
    });
  });

  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));

  await page.addInitScript((seedReceipts) => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'history-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({ lastTab: 'history', receipts: seedReceipts, autoSync: false }));
  }, receipts);

  await page.goto('http://localhost:8902/travel-expense/react/');
  await expect(page.getByText('紀錄中心')).toBeVisible();
  await page.getByRole('button', { name: 'Pull Cloud' }).click();
  await expect(page.getByText(/已從雲端同步/)).toBeVisible();

  await page.getByPlaceholder('搜尋店名 / 備註 / 地區').fill('Coffee');
  await expect(page.locator('.receipt-row').filter({ hasText: 'M7 Coffee' })).toHaveCount(1);
  await expect(page.locator('.receipt-row').filter({ hasText: 'M7 Train' })).toHaveCount(0);
  await page.getByPlaceholder('搜尋店名 / 備註 / 地區').fill('');

  await page.locator('.history-filters select').selectOption('food');
  await expect(page.locator('.receipt-row').filter({ hasText: 'M7 Coffee' })).toHaveCount(1);
  await expect(page.locator('.receipt-row').filter({ hasText: 'M7 Train' })).toHaveCount(0);
  await page.locator('.history-filters select').selectOption('all');

  await page.getByRole('button', { name: '確認', exact: true }).click();
  await expect(page.getByText('Email 待確認')).toBeHidden();
  await expect(page.locator('.receipt-row').filter({ hasText: 'M7 Pending' })).toHaveCount(1);

  await page.locator('.receipt-row').filter({ hasText: 'M7 Coffee' }).click();
  await page.getByLabel('金額（legacy total）').fill('444');
  await page.getByRole('button', { name: '儲存' }).click();
  await expect(page.locator('.receipt-row').filter({ hasText: 'M7 Coffee' })).toContainText('¥444');

  await page.locator('.receipt-row').filter({ hasText: 'M7 Train' }).click();
  await page.getByRole('button', { name: '刪除' }).click();
  await expect(page.locator('.receipt-row').filter({ hasText: 'M7 Train' })).toHaveCount(0);
});

test('History manual pull routes through global sync engine when broker session exists', async ({ page }) => {
  let notionRequests = 0;
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/notion/request', async (route) => {
    notionRequests += 1;
    const payload = route.request().postDataJSON();
    const data = String(payload.path || '').endsWith('/query')
      ? { results: [], has_more: false }
      : { properties: {} };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data }),
    });
  });

  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'test-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({ lastTab: 'history', receipts: [] }));
  });

  await page.goto('http://localhost:8902/travel-expense/react/');
  await expect(page.getByText('紀錄中心')).toBeVisible();
  await page.getByRole('button', { name: 'Pull Cloud' }).click();
  await expect(page.getByText(/已從雲端同步/)).toBeVisible();
  await expect.poll(() => notionRequests).toBeGreaterThan(0);
});

test('History relies on the single global boot pull instead of auto-pulling again on mount', async ({ page }) => {
  let notionRequests = 0;
  const notionPaths = [];
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/notion/request', async (route) => {
    notionRequests += 1;
    const payload = route.request().postDataJSON();
    notionPaths.push(String(payload.path || ''));
    const data = String(payload.path || '').endsWith('/query')
      ? { results: [], has_more: false }
      : { properties: {} };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data }),
    });
  });

  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'boot-pull-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({ lastTab: 'history', receipts: [] }));
  });

  await page.goto('http://localhost:8902/travel-expense/react/');
  await expect(page.getByText('紀錄中心')).toBeVisible();
  await expect.poll(() => notionPaths.filter((path) => path.endsWith('/query')).length, { timeout: 10000 }).toBe(3);
  await page.waitForTimeout(1200);
  expect(notionPaths.filter((path) => path.endsWith('/query'))).toHaveLength(3);
  expect(notionRequests).toBeLessThanOrEqual(4);
});
