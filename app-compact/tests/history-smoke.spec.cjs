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
  {
    id: 'm7_photo_missing',
    store: 'M7 Photo Missing',
    total: 444,
    date: '2026-04-22',
    category: 'food',
    payment: 'cash',
    personId: 'p_boss',
    splitMode: 'shared',
    source: 'react-ocr-manual',
    createdAt: 4,
  },
  {
    id: 'm7_duplicate_a',
    sourceId: 'm7_duplicate_source',
    store: 'M7 Duplicate A',
    total: 555,
    date: '2026-04-23',
    category: 'shopping',
    payment: 'credit',
    personId: 'p_boss',
    splitMode: 'shared',
    createdAt: 5,
  },
  {
    id: 'm7_duplicate_b',
    sourceId: 'm7_duplicate_source',
    store: 'M7 Duplicate B',
    total: 556,
    date: '2026-04-23',
    category: 'shopping',
    payment: 'credit',
    personId: 'p_boss',
    splitMode: 'shared',
    createdAt: 6,
  },
  {
    id: 'm7_sync_failed',
    sourceId: 'm7_sync_failed_source',
    store: 'M7 Sync Failed',
    total: 666,
    date: '2026-04-24',
    category: 'ticket',
    payment: 'cash',
    personId: 'p_boss',
    splitMode: 'shared',
    syncStatus: 'failed',
    createdAt: 7,
  },
  {
    id: 'm7_cloud_only',
    supabaseId: '77777777-7777-4777-8777-777777777777',
    store: 'M7 Cloud Only',
    total: 777,
    date: '2026-04-24',
    category: 'other',
    payment: 'cash',
    personId: 'p_boss',
    splitMode: 'shared',
    createdAt: 8,
  },
  {
    id: 'm7_missing_payer',
    store: 'M7 Missing Payer',
    total: 888,
    date: '2026-04-25',
    category: 'food',
    payment: 'cash',
    splitMode: 'shared',
    createdAt: 9,
  },
];

const conflictReceipts = [
  {
    id: 'conflict_local',
    sourceId: 'conflict_source_local',
    supabaseId: '11111111-1111-4111-8111-111111111111',
    store: 'Offline Noodles',
    total: 1234,
    date: '2026-04-26',
    time: '19:10',
    category: 'food',
    payment: 'credit',
    personId: 'p_boss',
    splitMode: 'shared',
    syncStatus: 'failed',
    updatedAt: 1_776_000_000_000,
    createdAt: 10,
  },
  {
    id: 'conflict_cloud',
    sourceId: 'conflict_source_cloud',
    supabaseId: '22222222-2222-4222-8222-222222222222',
    store: 'Cloud Taxi',
    total: 4321,
    date: '2026-04-26',
    time: '21:30',
    category: 'transport',
    payment: 'cash',
    personId: 'p_boss',
    splitMode: 'shared',
    syncStatus: 'error',
    updatedAt: 1_776_000_100_000,
    createdAt: 11,
  },
];

const attachmentReceipts = [
  {
    id: 'photo_large',
    store: 'Large Photo Bento',
    total: 1200,
    date: '2026-04-27',
    time: '12:10',
    category: 'food',
    payment: 'cash',
    personId: 'p_boss',
    splitMode: 'shared',
    source: 'react-ocr-manual',
    photoThumb: 'data:image/jpeg;base64,' + 'a'.repeat(900_000),
    syncStatus: 'local',
    createdAt: 12,
  },
  {
    id: 'photo_missing_attachment',
    store: 'Missing Attachment Ticket',
    total: 2200,
    date: '2026-04-27',
    category: 'ticket',
    payment: 'credit',
    personId: 'p_boss',
    splitMode: 'shared',
    source: 'react-email-image',
    note: '掃描 receipt should have attachment',
    createdAt: 13,
  },
  {
    id: 'photo_unsynced',
    store: 'Unsynced Photo Taxi',
    total: 3300,
    date: '2026-04-28',
    category: 'transport',
    payment: 'cash',
    personId: 'p_boss',
    splitMode: 'shared',
    source: 'react-ocr-manual',
    photoThumb: 'data:image/jpeg;base64,' + 'b'.repeat(120_000),
    syncStatus: 'queued',
    createdAt: 14,
  },
];

const reconciliationItinerary = [
  { date: '2026-05-08', day: 1, region: 'Nagoya Missing Day', city: 'Nagoya', spots: [{ time: '09:00', name: 'Nagoya Breakfast', type: 'food' }] },
  { date: '2026-05-09', day: 2, region: 'Kyoto Busy Day', city: 'Kyoto', spots: [{ time: '10:00', name: 'Kyoto Market', type: 'shopping' }] },
  { date: '2026-05-10', day: 3, region: 'Nara Ready Day', city: 'Nara', spots: [{ time: '12:00', name: 'Nara Lunch', type: 'food' }] },
];

const reconciliationReceipts = [
  ...Array.from({ length: 5 }, (_, idx) => ({
    id: `review_kyoto_${idx}`,
    store: idx === 0 ? 'Kyoto Market' : `Kyoto Busy Receipt ${idx + 1}`,
    total: 1000 + idx,
    date: '2026-05-09',
    category: idx % 2 ? 'food' : 'shopping',
    payment: 'cash',
    personId: 'p_boss',
    splitMode: 'shared',
    createdAt: 100 + idx,
  })),
  {
    id: 'review_nara_lunch',
    store: 'Nara Lunch',
    total: 1800,
    date: '2026-05-10',
    category: 'food',
    payment: 'credit',
    personId: 'p_boss',
    splitMode: 'shared',
    createdAt: 111,
  },
  {
    id: 'review_outside',
    store: 'Outside Itinerary Taxi',
    total: 2200,
    date: '2026-05-11',
    category: 'transport',
    payment: 'cash',
    personId: 'p_boss',
    splitMode: 'shared',
    createdAt: 112,
  },
];

test('History search, filter, pending, edit, delete, and safe pull', async ({ page }) => {
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

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.locator('.compact-mobile-title-art')).toHaveAttribute('data-title', '紀錄中心');
  const mobileHistoryHeader = page.getByLabel('紀錄中心 header');
  await expect(mobileHistoryHeader).not.toContainText('local ready');
  await expect(mobileHistoryHeader.locator('.history-trip-button')).toBeVisible();
  await expect(page.getByRole('button', { name: /✈️/ })).toHaveCount(0);
  const refreshButton = mobileHistoryHeader.getByRole('button', { name: '重新同步' });
  await expect(refreshButton).toBeVisible();
  await expect(refreshButton).not.toContainText(/Pull Cloud/i);
  await expect(page.getByLabel('Receipt health markers for M7 Coffee')).toContainText('local-only');
  await expect(page.getByLabel('Receipt health markers for M7 Photo Missing')).toContainText('photo missing');
  await expect(page.getByLabel('Receipt health markers for M7 Duplicate A')).toContainText('duplicate');
  await expect(page.getByLabel('Receipt health markers for M7 Duplicate B')).toContainText('duplicate');
  await expect(page.getByLabel('Receipt health markers for M7 Sync Failed')).toContainText('sync conflict');
  await expect(page.getByLabel('Receipt health markers for M7 Cloud Only')).toContainText('cloud-only');
  await expect(page.getByLabel('Receipt health markers for M7 Pending')).toContainText('pending');
  const commandMetrics = await page.evaluate(() => {
    const card = document.querySelector('[aria-label="紀錄中心 header"]')?.getBoundingClientRect();
    const actions = document.querySelector('.compact-mobile-action-history')?.getBoundingClientRect();
    const trip = document.querySelector('.compact-mobile-action-history .history-trip-button')?.getBoundingClientRect();
    const refresh = document.querySelector('.compact-mobile-action-history .history-refresh-button')?.getBoundingClientRect();
    return {
      card: card && { height: card.height, width: card.width },
      actions: actions && { top: actions.top, left: actions.left, height: actions.height },
      trip: trip && { top: trip.top, height: trip.height },
      refresh: refresh && { top: refresh.top, height: refresh.height },
    };
  });
  expect(commandMetrics.card.height).toBeLessThanOrEqual(86);
  expect(commandMetrics.card.width).toBeLessThanOrEqual(390);
  expect(Math.abs(commandMetrics.trip.top - commandMetrics.refresh.top)).toBeLessThanOrEqual(6);
  expect(Math.abs((commandMetrics.trip.top + commandMetrics.trip.height / 2) - (commandMetrics.actions.top + commandMetrics.actions.height / 2))).toBeLessThanOrEqual(4);

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
  expect(Math.abs(filterMetrics.search.top - filterMetrics.select.top)).toBeLessThanOrEqual(8);
  expect(filterMetrics.search.width).toBeGreaterThan(filterMetrics.select.width);
  expect(filterMetrics.select.width).toBeGreaterThanOrEqual(80);

  await refreshButton.click();
  await expect.poll(() => notionRequests).toBeGreaterThan(0);

  await page.getByPlaceholder('搜尋店家、類別、標籤、金額...').fill('Coffee');
  await expect(page.locator('.receipt-row').filter({ hasText: 'M7 Coffee' })).toHaveCount(1);
  await expect(page.locator('.receipt-row').filter({ hasText: 'M7 Train' })).toHaveCount(0);
  await page.getByPlaceholder('搜尋店家、類別、標籤、金額...').fill('');

  await page.locator('.history-filters select').selectOption('food');
  await expect(page.locator('.receipt-row').filter({ hasText: 'M7 Coffee' })).toHaveCount(1);
  await expect(page.locator('.receipt-row').filter({ hasText: 'M7 Train' })).toHaveCount(0);
  await page.locator('.history-filters select').selectOption('all');

  await page.getByRole('button', { name: '查看並確認', exact: true }).click();
  await expect(page.locator('.history-pending-banner')).toBeHidden();
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
  await expect(page.locator('.receipt-row').filter({ hasText: 'M7 Coffee' })).toContainText(/(?:¥|JPY)444/);

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

test('History desktop shell title uses current record-center copy', async ({ page }) => {
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

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.getByRole('heading', { name: '紀錄中心' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Expense Archive' })).toHaveCount(0);
});

test('History guided cleanup suggestions open the right receipt for repair', async ({ page }) => {
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

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.locator('.compact-mobile-title-art')).toHaveAttribute('data-title', '紀錄中心');

  const cleanup = page.getByLabel('Receipt cleanup suggestions');
  await expect(cleanup).toBeVisible();
  await expect(cleanup).toContainText('Cleanup Coach');
  await expect(cleanup).toContainText('Pending OCR');
  await expect(cleanup).toContainText('1');
  await expect(cleanup).toContainText('Duplicate SourceID');
  await expect(cleanup).toContainText('2');
  await expect(cleanup).toContainText('Missing photo');
  await expect(cleanup).toContainText('1');
  await expect(cleanup).toContainText('Missing payer');
  await expect(cleanup).toContainText('1');

  await cleanup.getByRole('button', { name: /Open missing payer/ }).click();
  await expect(page.getByRole('dialog', { name: '編輯紀錄' })).toBeVisible();
  await expect(page.getByLabel('店名 / 項目')).toHaveValue('M7 Missing Payer');
});

test('History itinerary review queue filters receipt gaps by travel day', async ({ page }) => {
  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));

  await page.addInitScript(({ seedReceipts, itinerary }) => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'history',
      receipts: seedReceipts,
      customItinerary: itinerary,
      tripDateRange: { start: '2026-05-08', end: '2026-05-10' },
      autoSync: false,
    }));
  }, { seedReceipts: reconciliationReceipts, itinerary: reconciliationItinerary });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.locator('.compact-mobile-title-art')).toHaveAttribute('data-title', '紀錄中心');

  const queue = page.getByLabel('Itinerary receipt review queue');
  await expect(queue).toBeVisible();
  await expect(queue).toContainText('Itinerary Review Queue');
  await expect(queue).toContainText('3 days need receipt review');
  await expect(queue).toContainText('No receipts');
  await expect(queue).toContainText('Nagoya Breakfast');
  await expect(queue).toContainText('High receipt count');
  await expect(queue).toContainText('2026-05-09 · Kyoto');
  await expect(queue).toContainText('Outside itinerary');
  await expect(queue).toContainText('2026-05-11');
  await expect(page.locator('body')).not.toContainText(/secret_|providerToken|FAKE_/i);

  const metrics = await queue.evaluate((node) => {
    const card = node.getBoundingClientRect();
    const items = Array.from(node.querySelectorAll('.history-review-item')).map((item) => {
      const rect = item.getBoundingClientRect();
      return { width: Math.round(rect.width), top: Math.round(rect.top) };
    });
    return {
      scrollWidth: document.documentElement.scrollWidth,
      cardWidth: Math.round(card.width),
      items,
    };
  });
  expect(metrics.scrollWidth).toBe(390);
  expect(metrics.cardWidth).toBeLessThanOrEqual(390);
  expect(metrics.items).toHaveLength(3);
  expect(metrics.items[0].top).toBe(metrics.items[1].top);

  await queue.locator('.history-review-item').filter({ hasText: 'High receipt count' }).getByRole('button', { name: 'Show receipts' }).click();
  await expect(page.getByLabel('Active itinerary review filter')).toContainText('2026-05-09');
  await expect(page.locator('.receipt-row')).toHaveCount(5);
  await expect(page.locator('.receipt-row').filter({ hasText: 'Kyoto Market' })).toBeVisible();
  await expect(page.locator('.receipt-row').filter({ hasText: 'Outside Itinerary Taxi' })).toHaveCount(0);

  await queue.locator('.history-review-item').filter({ hasText: 'No receipts' }).getByRole('button', { name: 'Show empty day' }).click();
  await expect(page.getByLabel('Active itinerary review filter')).toContainText('2026-05-08');
  await expect(page.locator('.receipt-row')).toHaveCount(0);
  await expect(page.getByText('2026-05-08 未有紀錄，請新增或修正當日 receipt。')).toBeVisible();

  await page.getByRole('button', { name: 'All records' }).click();
  await expect(page.getByLabel('Active itinerary review filter')).toHaveCount(0);
  await expect(page.locator('.receipt-row')).toHaveCount(7);
});

test('History offline conflict resolver reviews and resolves local/cloud receipt conflicts safely', async ({ page }) => {
  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));

  await page.addInitScript((seedReceipts) => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'history',
      receipts: seedReceipts,
      autoSync: false,
      syncQueue: [
        {
          id: 'queue_conflict_local',
          type: 'receipt',
          entityId: 'conflict_local',
          op: 'update',
          status: 'failed',
          attempts: 3,
          error: 'FAKE_QUEUE_ERROR_SHOULD_NOT_RENDER',
          createdAt: 1_776_000_000_000,
          updatedAt: 1_776_000_200_000,
          payload: {
            sourceId: 'conflict_source_local',
            supabaseId: '11111111-1111-4111-8111-111111111111',
            providerToken: 'FAKE_PROVIDER_TOKEN_SHOULD_NOT_RENDER',
          },
        },
        {
          id: 'queue_conflict_cloud',
          type: 'receipt',
          entityId: 'conflict_cloud',
          op: 'update',
          status: 'error',
          attempts: 2,
          error: 'FAKE_CLOUD_ERROR_SHOULD_NOT_RENDER',
          createdAt: 1_776_000_000_000,
          updatedAt: 1_776_000_300_000,
          payload: {
            sourceId: 'conflict_source_cloud',
            supabaseId: '22222222-2222-4222-8222-222222222222',
            notionSecret: 'FAKE_NOTION_SECRET_SHOULD_NOT_RENDER',
          },
        },
      ],
    }));
  }, conflictReceipts);

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.locator('.compact-mobile-title-art')).toHaveAttribute('data-title', '紀錄中心');

  const resolver = page.getByLabel('Offline conflict resolver');
  await expect(resolver).toBeVisible();
  await expect(resolver).toContainText('Offline Conflict Resolver');
  await expect(resolver).toContainText('2 conflicts');
  await expect(resolver).toContainText('Offline Noodles');
  await expect(resolver).toContainText('Cloud Taxi');
  await expect(page.locator('body')).not.toContainText('FAKE_PROVIDER_TOKEN_SHOULD_NOT_RENDER');
  await expect(page.locator('body')).not.toContainText('FAKE_QUEUE_ERROR_SHOULD_NOT_RENDER');
  await expect(page.locator('body')).not.toContainText('FAKE_NOTION_SECRET_SHOULD_NOT_RENDER');

  const localConflict = resolver.locator('.history-conflict-item').filter({ hasText: 'Offline Noodles' });
  await localConflict.getByRole('button', { name: 'Review conflict' }).click();
  await expect(page.getByRole('dialog', { name: '編輯紀錄' })).toBeVisible();
  await expect(page.getByLabel('店名 / 項目')).toHaveValue('Offline Noodles');
  await page.getByRole('dialog', { name: '編輯紀錄' }).getByRole('button', { name: '取消' }).click();

  await localConflict.getByRole('button', { name: 'Keep local' }).click();
  await expect(resolver).toContainText('1 conflicts');
  await expect(resolver).not.toContainText('Offline Noodles');
  const keepLocalState = await page.evaluate(() => JSON.parse(localStorage.getItem('boss-japan-tracker')));
  const keptLocalReceipt = keepLocalState.receipts.find((receipt) => receipt.id === 'conflict_local');
  const keptLocalQueue = keepLocalState.syncQueue.find((item) => item.id === 'queue_conflict_local');
  expect(keptLocalReceipt.syncStatus).toBe('queued');
  expect(keptLocalQueue.status).toBe('queued');
  expect(keptLocalQueue.attempts).toBe(0);
  expect(keptLocalQueue.error).toBeUndefined();
  expect(keptLocalQueue.payload.providerToken).toBeUndefined();

  const cloudConflict = resolver.locator('.history-conflict-item').filter({ hasText: 'Cloud Taxi' });
  await cloudConflict.getByRole('button', { name: 'Keep cloud' }).click();
  await expect(page.getByLabel('Offline conflict resolver')).toHaveCount(0);
  const keepCloudState = await page.evaluate(() => JSON.parse(localStorage.getItem('boss-japan-tracker')));
  const keptCloudReceipt = keepCloudState.receipts.find((receipt) => receipt.id === 'conflict_cloud');
  expect(keptCloudReceipt.syncStatus).toBe('synced');
  expect(keepCloudState.syncQueue.some((item) => item.id === 'queue_conflict_cloud')).toBe(false);
});

test('History attachment health surfaces large, missing, and unsynced receipt photos without overflow', async ({ page }) => {
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
  }, attachmentReceipts);

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.locator('.compact-mobile-title-art')).toHaveAttribute('data-title', '紀錄中心');

  const attachment = page.getByLabel('Receipt attachment health');
  await expect(attachment).toBeVisible();
  await expect(attachment).toContainText('Attachment Health');
  await expect(attachment).toContainText('Large photo');
  await expect(attachment).toContainText('Missing photo');
  await expect(attachment).toContainText('Unsynced photo');
  await expect(page.getByLabel('Receipt health markers for Large Photo Bento')).toContainText('photo large');
  await expect(page.getByLabel('Receipt health markers for Large Photo Bento')).toContainText('photo unsynced');
  await expect(page.getByLabel('Receipt health markers for Missing Attachment Ticket')).toContainText('photo missing');
  await expect(page.getByLabel('Receipt health markers for Unsynced Photo Taxi')).toContainText('photo unsynced');

  const metrics = await page.evaluate(() => {
    const card = document.querySelector('[aria-label="Receipt attachment health"]')?.getBoundingClientRect();
    const items = Array.from(document.querySelectorAll('.history-attachment-item')).map((node) => node.getBoundingClientRect().width);
    return {
      scrollWidth: document.documentElement.scrollWidth,
      cardWidth: card?.width || 0,
      minItemWidth: Math.min(...items),
    };
  });
  expect(metrics.scrollWidth).toBe(390);
  expect(metrics.cardWidth).toBeLessThanOrEqual(390);
  expect(metrics.minItemWidth).toBeGreaterThan(120);

  await attachment.getByRole('button', { name: 'Compress guide' }).click();
  await expect(page.getByRole('dialog', { name: '編輯紀錄' })).toBeVisible();
  await expect(page.getByLabel('店名 / 項目')).toHaveValue('Large Photo Bento');
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

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.locator('.compact-mobile-title-art')).toHaveAttribute('data-title', '紀錄中心');
  await page.getByLabel('紀錄中心 header').getByRole('button', { name: '重新同步' }).click();
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

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.locator('.compact-mobile-title-art')).toHaveAttribute('data-title', '紀錄中心');
  await expect.poll(() => notionPaths.filter((path) => path.endsWith('/query')).length, { timeout: 10000 }).toBe(3);
  await page.waitForTimeout(1200);
  expect(notionPaths.filter((path) => path.endsWith('/query'))).toHaveLength(3);
  expect(notionRequests).toBeLessThanOrEqual(4);
});
