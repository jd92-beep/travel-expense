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
    photoThumb: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
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
  await expect(page.locator('.history-command')).not.toContainText('local ready');
  await expect(page.getByRole('button', { name: /^切換旅程$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /✈️/ })).toHaveCount(0);
  const refreshButton = page.getByRole('button', { name: '重新同步' });
  await expect(refreshButton).toBeVisible();
  await expect(refreshButton).not.toContainText(/Pull Cloud/i);
  const commandMetrics = await page.evaluate(() => {
    const card = document.querySelector('.history-command')?.getBoundingClientRect();
    const title = document.querySelector('.history-title-button')?.getBoundingClientRect();
    const actions = document.querySelector('.history-command-actions')?.getBoundingClientRect();
    const trip = document.querySelector('.history-trip-button')?.getBoundingClientRect();
    const refresh = document.querySelector('.history-refresh-button')?.getBoundingClientRect();
    return {
      card: card && { height: card.height },
      title: title && { top: title.top, right: title.right, height: title.height },
      actions: actions && { top: actions.top, left: actions.left, height: actions.height },
      trip: trip && { top: trip.top, height: trip.height },
      refresh: refresh && { top: refresh.top, height: refresh.height },
    };
  });
  expect(commandMetrics.card.height).toBeLessThanOrEqual(82);
  expect(Math.abs(commandMetrics.title.top - commandMetrics.trip.top)).toBeLessThanOrEqual(6);
  expect(Math.abs(commandMetrics.title.top - commandMetrics.refresh.top)).toBeLessThanOrEqual(6);
  expect(Math.abs((commandMetrics.title.top + commandMetrics.title.height / 2) - (commandMetrics.actions.top + commandMetrics.actions.height / 2))).toBeLessThanOrEqual(4);
  expect(commandMetrics.actions.left).toBeGreaterThan(commandMetrics.title.right - 8);

  const filterMetrics = await page.evaluate(() => {
    const filters = document.querySelector('.history-filters')?.getBoundingClientRect();
    const search = document.querySelector('.history-filters .search-field')?.getBoundingClientRect();
    const select = document.querySelector('.history-filters select')?.getBoundingClientRect();
    return {
      filters: filters && { width: filters.width },
      search: search && { top: search.top, width: search.width },
      select: select && { top: select.top, width: select.width },
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  expect(filterMetrics.scrollWidth).toBe(390);
  expect(filterMetrics.search).toBeTruthy();
  expect(filterMetrics.select).toBeTruthy();
  expect(Math.abs(filterMetrics.search.top - filterMetrics.select.top)).toBeLessThanOrEqual(4);
  expect(filterMetrics.search.width).toBeGreaterThan(filterMetrics.select.width);
  expect(filterMetrics.select.width).toBeGreaterThanOrEqual(96);

  await refreshButton.click();
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
  const coffeeEditorMetrics = await page.evaluate(() => {
    const footerButtons = Array.from(document.querySelectorAll('.receipt-editor-actions button')).map((button) => ({
      text: button.textContent?.trim(),
      left: button.getBoundingClientRect().left,
      right: button.getBoundingClientRect().right,
    }));
    const photoButtons = Array.from(document.querySelectorAll('.photo-tools button')).map((button) => ({
      text: button.textContent?.trim(),
      left: button.getBoundingClientRect().left,
    }));
    return { footerButtons, photoButtons, scrollWidth: document.documentElement.scrollWidth };
  });
  const deleteButton = coffeeEditorMetrics.footerButtons.find((button) => button.text === '刪除');
  const saveButton = coffeeEditorMetrics.footerButtons.find((button) => button.text === '儲存');
  const cancelButton = coffeeEditorMetrics.footerButtons.find((button) => button.text === '取消');
  expect(deleteButton.left).toBeLessThan(saveButton.left);
  expect(saveButton.left).toBeLessThan(cancelButton.left);
  expect(cancelButton.right).toBeGreaterThan(saveButton.right);
  const deletePhotoButton = coffeeEditorMetrics.photoButtons.find((button) => button.text === '刪除相片');
  const itineraryButton = coffeeEditorMetrics.photoButtons.find((button) => button.text === '加入行程');
  expect(deletePhotoButton.left).toBeLessThan(itineraryButton.left);
  expect(coffeeEditorMetrics.scrollWidth).toBe(390);
  await page.getByLabel('金額（legacy total）').fill('444');
  await page.getByRole('button', { name: '儲存' }).click();
  await expect(page.locator('.receipt-row').filter({ hasText: 'M7 Coffee' })).toContainText('¥444');

  await page.locator('.receipt-row').filter({ hasText: 'M7 Train' }).click();
  await page.getByRole('button', { name: '刪除' }).click();
  await expect(page.getByRole('alertdialog', { name: '確認刪除紀錄' })).toBeVisible();
  await page.getByRole('alertdialog', { name: '確認刪除紀錄' }).getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('alertdialog', { name: '確認刪除紀錄' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '編輯紀錄' })).toBeVisible();
  await expect(page.locator('.receipt-row').filter({ hasText: 'M7 Train' })).toHaveCount(1);
  await page.getByRole('button', { name: '刪除' }).click();
  await page.getByRole('alertdialog', { name: '確認刪除紀錄' }).getByRole('button', { name: '確認刪除' }).click();
  await expect(page.locator('.receipt-row').filter({ hasText: 'M7 Train' })).toHaveCount(0);
});

test('History desktop shell title uses Expense Record copy', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));
  await page.addInitScript((seedReceipts) => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({ lastTab: 'history', receipts: seedReceipts, autoSync: false }));
  }, receipts);

  await page.goto('http://localhost:8902/travel-expense/react/');
  await expect(page.getByRole('heading', { name: 'Expense Record' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Expense Archive' })).toHaveCount(0);
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
  await page.getByRole('button', { name: '重新同步' }).click();
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
