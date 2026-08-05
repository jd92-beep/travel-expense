const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const APP_ORIGIN = (process.env.REACT_TEST_ORIGIN || 'http://localhost:8902').replace(/\/+$/, '');
const APP_URL = `${APP_ORIGIN}/travel-expense/react/`;

test.use({ viewport: { width: 390, height: 844 } });

async function setAccordion(page, title, expanded = true) {
  const button = page.getByRole('button', { name: new RegExp(title) });
  if ((await button.getAttribute('aria-expanded')) !== String(expanded)) await button.click();
}

function tripState(tripId = 'settings_sync_trip') {
  return {
    schemaVersion: 3,
    lastTab: 'settings',
    tripName: 'Settings Sync Trip',
    tripDateRange: { start: '2026-06-08', end: '2026-06-10' },
    activeTripId: tripId,
    trips: [{
      id: tripId,
      name: 'Settings Sync Trip',
      destinationSummary: 'Sync City',
      startDate: '2026-06-08',
      endDate: '2026-06-10',
      homeCurrency: 'HKD',
      currencies: ['HKD', 'JPY'],
      timezones: ['Asia/Tokyo'],
      version: 1,
      active: true,
      itinerary: [{ date: '2026-06-08', day: 1, region: 'Sync City', spots: [] }],
      createdAt: 1,
      updatedAt: 1,
    }],
    receipts: [{
      id: 'settings_sync_receipt',
      store: 'Sync Cafe',
      total: 100,
      date: '2026-06-08',
      category: 'food',
      payment: 'cash',
      tripId,
      createdAt: 1,
      updatedAt: 1,
    }],
  };
}

test('Settings expandable cards, safe broker actions, backup, restore, and trust clear work', async ({ page }) => {
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/kimi/json', async (route) => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: 'test kimi unavailable' }),
  }));
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/credentials/rotate', async (route) => route.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: 'Credential test failed' }),
  }));
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/notion/request', async (route) => {
    const payload = route.request().postDataJSON();
    const data = String(payload.path || '').endsWith('/query')
      ? { results: [], has_more: false }
      : { id: 'settings-test', properties: {} };
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

  const restorePath = path.join('/tmp', 'travel-expense-m10-restore.json');
  fs.writeFileSync(restorePath, JSON.stringify({
    tripName: 'M10 Restored',
    credentialBrokerUrl: 'https://evil.example/broker',
    credentialSession: 'restore-session-should-not-survive',
    credentialSessionExpiresAt: Date.now() + 60_000,
    notionToken: 'restore-notion-token-should-not-survive',
    apiKey: 'restore-api-key-should-not-survive',
    kimiKey: 'restore-kimi-key-should-not-survive',
    googleKey: 'restore-google-key-should-not-survive',
    notionDb: 'restore-shared-notion-db-should-not-survive',
    syncQueue: [{
      id: 'restore-sync-queue-should-not-survive',
      type: 'receipt',
      entityId: 'other-account-receipt',
      op: 'update',
      status: 'queued',
      attempts: 0,
      createdAt: 1,
      updatedAt: 1,
      payload: {
        notionPageId: 'other-account-page',
        supabaseId: '77777777-7777-4777-8777-777777777777',
        sourceId: 'other-account-source',
      },
    }],
    notionDeletedIds: ['other-account-deleted-page'],
    notionDeletedSourceIds: ['other-account-trip::other-account-source'],
    receipts: [{
      id: 'm10_restore_receipt',
      supabaseId: '88888888-8888-4888-8888-888888888888',
      notionPageId: 'other-account-page',
      notionDb: 'other-account-db',
      tripId: 'foreign_restore_trip',
      tripVersion: 99,
      tripDayId: 'foreign_day',
      store: 'M10 Restore Cafe',
      total: 321,
      date: '2026-04-20',
      category: 'food',
      payment: 'cash',
      personId: 'p_boss',
      splitMode: 'shared',
      createdAt: 10,
    }],
  }));

  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'settings-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'settings',
      budget: 101800,
      rate: 20.36,
      notionDb: 'export-personal-db-should-not-survive',
      personalNotionConnected: true,
      syncQueue: [{
        id: 'export-sync-queue-should-not-survive',
        type: 'receipt',
        entityId: 'export_receipt',
        op: 'update',
        status: 'queued',
        attempts: 0,
        createdAt: 1,
        updatedAt: 1,
        payload: {
          notionPageId: 'export-page-should-not-survive',
          supabaseId: '99999999-9999-4999-8999-999999999999',
          sourceId: 'export-source-should-not-survive',
        },
      }],
      notionDeletedIds: ['export-deleted-page-should-not-survive'],
      notionDeletedSourceIds: ['export-trip::export-source-should-not-survive'],
      trips: [{
        id: 'trip_export',
        supabaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        notionPageId: 'export-trip-page-should-not-survive',
        notionDb: 'export-trip-db-should-not-survive',
        sourceId: 'export-trip-source-should-not-survive',
        name: 'M10 Export Trip',
        destinationSummary: 'Export City',
        startDate: '2026-04-20',
        endDate: '2026-04-21',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Tokyo'],
        version: 1,
        active: true,
        itinerary: [{ date: '2026-04-20', day: 1, region: 'Export City', spots: [] }],
        createdAt: 1,
        updatedAt: 1,
      }, {
        id: 'trip_other_export',
        name: 'M10 Other Export Trip',
        destinationSummary: 'Other City',
        startDate: '2026-05-20',
        endDate: '2026-05-21',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Tokyo'],
        version: 1,
        active: false,
        itinerary: [{ date: '2026-05-20', day: 1, region: 'Other City', spots: [] }],
        createdAt: 2,
        updatedAt: 2,
      }],
      activeTripId: 'trip_export',
      receipts: [{
        id: 'export_receipt',
        supabaseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        notionPageId: 'export-receipt-page-should-not-survive',
        notionFileUploadId: 'export-file-upload-should-not-survive',
        sourceId: 'export-receipt-source-should-not-survive',
        syncStatus: 'synced',
        photoUrl: 'https://notion.example/export-photo-should-not-survive.jpg',
        store: 'M10 Export Cafe',
        total: 123,
        date: '2026-04-20',
        category: 'food',
        payment: 'cash',
        tripId: 'trip_export',
        createdAt: 1,
        updatedAt: 1,
      }, {
        id: 'other_export_receipt',
        store: 'M10 Other Trip Cafe',
        total: 456,
        date: '2026-05-20',
        category: 'food',
        payment: 'cash',
        tripId: 'trip_other_export',
        createdAt: 2,
        updatedAt: 2,
      }],
      statsIncludeTransportLodging: false,
      top10IncludeBigItems: true,
    }));
  });

  await page.goto(`${APP_URL}#settings`);
  await expect(page.getByText('設定控制中心')).toBeVisible();
  await expect(page.getByText('同步信心中心')).toBeVisible();
  await expect(page.locator('.settings-sync-confidence')).toContainText('Pending Queue');
  await expect(page.locator('.settings-sync-confidence')).toContainText('已連接個人 notebook');
  await expect(page.locator('.settings-sync-confidence')).toContainText(/Status:|Local device cache|Supabase scoped cache/);
  const syncConfidenceMetrics = await page.locator('.settings-sync-confidence').evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      scrollWidth: document.documentElement.scrollWidth,
      tiles: node.querySelectorAll('.settings-sync-confidence-grid > div').length,
    };
  });
  expect(syncConfidenceMetrics.tiles).toBe(4);
  expect(syncConfidenceMetrics.scrollWidth, JSON.stringify(syncConfidenceMetrics, null, 2)).toBeLessThanOrEqual(390);

  const summaries = page.locator('.accordion-summary');
  await expect(summaries).toHaveCount(10);
  for (let i = 0; i < 10; i += 1) {
    const card = summaries.nth(i);
    const before = await card.getAttribute('aria-expanded');
    await card.click();
    await expect(card).toHaveAttribute('aria-expanded', before === 'true' ? 'false' : 'true');
    await card.click();
    await expect(card).toHaveAttribute('aria-expanded', before || 'false');
  }

  await setAccordion(page, '旅程管理器');
  const tripNameInput = page.getByRole('textbox', { name: '旅程名', exact: true });
  await tripNameInput.fill('M10 Trip Updated');
  await page.getByLabel('預算 (目的地貨幣)').fill('123456');
  await page.getByLabel('預算 (HKD)').fill('6000');
  await page.getByLabel(/反轉首頁統計/).check();
  await expect(tripNameInput).toHaveValue('M10 Trip Updated');

  await setAccordion(page, 'AI 行程更新');
  await page.getByPlaceholder(/下次/).fill('2026-07-10 to 2026-07-12 Seoul, arrive Hongdae 18:00, stay near Hongdae.');
  await page.getByRole('button', { name: /用已選模型分析/ }).click();
  await expect(page.getByText(/已產生 preview|分析行程失敗/).first()).toBeVisible();

  await setAccordion(page, '旅伴');
  await page.getByPlaceholder('旅伴名字').fill('M10 Friend');
  await page.getByRole('button', { name: /新增/ }).click();
  await expect(page.getByText(/已新增旅伴|M10 Friend/).first()).toBeVisible();
  await expect(page.getByText(/比例總和/)).toBeVisible();
  await page.getByRole('button', { name: '重設為均分' }).click();
  await expect(page.getByText('已重設為均分比例')).toBeVisible();

  await setAccordion(page, 'Credentials & Connection');
  await page.getByLabel('New credential').fill('rotate-placeholder');
  await page.getByLabel('Admin maintenance passphrase').fill('admin-placeholder');
  await page.getByRole('button', { name: /Rotate safely/ }).click();
  await expect(page.getByText(/Rotate notion失敗：Credential test failed/)).toBeVisible();
  await expect(page.getByLabel('New credential')).toHaveValue('');
  await expect(page.getByLabel('Admin maintenance passphrase')).toHaveValue('');
  const storageAfterRotate = await page.evaluate(() => JSON.stringify(localStorage));
  expect(storageAfterRotate).not.toContain('rotate-placeholder');
  expect(storageAfterRotate).not.toContain('admin-placeholder');

  await setAccordion(page, 'AI 模型選擇');
  const modelOptions = await page.locator('#settings-ai-models-panel option').allTextContents();
  expect(modelOptions.join(' ')).toContain('Kimi (kimi-code)');
  expect(modelOptions.join(' ')).toContain('Google Gemini 2.5 Flash');
  expect(modelOptions.join(' ')).toContain('Mimo v2.5 Pro');
  expect(modelOptions.join(' ')).not.toMatch(/MiniMax|OpenRouter|GLM|ZAI/);

  await setAccordion(page, 'Notion Sync');
  await page.getByRole('button', { name: 'Save Local Settings' }).click();
  await expect(page.getByText(/本機設定已保存/)).toBeVisible();
  await page.getByRole('button', { name: 'Save & Push Settings' }).click();
  await expect(page.getByText(/已推送 non-secret settings meta/)).toBeVisible();
  await page.getByRole('button', { name: '測試' }).click();
  await expect(page.getByText(/連線正常/)).toBeVisible();

  await setAccordion(page, '資料管理');
  const dataSafety = page.locator('.settings-backup-safety');
  await expect(dataSafety).toContainText('CSV / Backup JSON 只包含目前旅程');
  await expect(dataSafety).toContainText('Backup 不包含 API key、Notion token、broker session 或解鎖 secret');
  await expect(dataSafety).toContainText('匯入 Backup 時會丟棄外部 cloud IDs、sync queue、舊 Trip links 同 credential 欄位');
  const csvDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /匯出 CSV/ }).click();
  const csvDownload = await csvDownloadPromise;
  const csvPath = await csvDownload.path();
  const csvText = fs.readFileSync(csvPath, 'utf8');
  expect(csvText).toContain('M10 Export Cafe');
  expect(csvText).not.toContain('M10 Other Trip Cafe');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /匯出 Backup JSON/ }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  const backupText = fs.readFileSync(backupPath, 'utf8');
  const backupJson = JSON.parse(backupText);
  expect(backupJson.activeTripId).toBe('trip_export');
  expect(backupJson.trips).toHaveLength(1);
  expect(backupJson.trips[0].id).toBe('trip_export');
  expect(backupJson.receipts).toHaveLength(1);
  expect(backupJson.receipts[0].id).toBe('export_receipt');
  expect(backupText).not.toContain('credentialSession');
  expect(backupText).not.toContain('rotate-placeholder');
  expect(backupText).not.toContain('admin-placeholder');
  expect(backupText).not.toContain('M10 Other Export Trip');
  expect(backupText).not.toContain('M10 Other Trip Cafe');
  expect(backupText).not.toContain('export-personal-db-should-not-survive');
  expect(backupText).not.toContain('export-trip-db-should-not-survive');
  expect(backupText).not.toContain('export-trip-page-should-not-survive');
  expect(backupText).not.toContain('export-trip-source-should-not-survive');
  expect(backupText).not.toContain('export-receipt-page-should-not-survive');
  expect(backupText).not.toContain('export-file-upload-should-not-survive');
  expect(backupText).not.toContain('export-receipt-source-should-not-survive');
  expect(backupText).not.toContain('export-photo-should-not-survive');
  expect(backupText).not.toContain('export-sync-queue-should-not-survive');
  expect(backupText).not.toContain('export-deleted-page-should-not-survive');
  expect(backupText).not.toContain('99999999-9999-4999-8999-999999999999');
  expect(backupText).not.toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  expect(backupText).not.toContain('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

  await page.locator('#settings-data-panel input[type="file"]').setInputFiles(restorePath);
  await expect(page.getByText(/已匯入 backup/)).toBeVisible();
  const storageAfterRestore = await page.evaluate(() => JSON.stringify(localStorage));
  expect(storageAfterRestore).not.toContain('evil.example');
  expect(storageAfterRestore).not.toContain('restore-session-should-not-survive');
  expect(storageAfterRestore).not.toContain('restore-notion-token-should-not-survive');
  expect(storageAfterRestore).not.toContain('restore-api-key-should-not-survive');
  expect(storageAfterRestore).not.toContain('restore-kimi-key-should-not-survive');
  expect(storageAfterRestore).not.toContain('restore-google-key-should-not-survive');
  expect(storageAfterRestore).not.toContain('restore-shared-notion-db-should-not-survive');
  expect(storageAfterRestore).not.toContain('restore-sync-queue-should-not-survive');
  expect(storageAfterRestore).not.toContain('other-account-page');
  expect(storageAfterRestore).not.toContain('other-account-db');
  expect(storageAfterRestore).not.toContain('other-account-deleted-page');
  expect(storageAfterRestore).not.toContain('other-account-source');
  expect(storageAfterRestore).not.toContain('88888888-8888-4888-8888-888888888888');
  expect(storageAfterRestore).not.toContain('foreign_restore_trip');
  const restoredReceipt = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('boss-japan-tracker') || '{}');
    return (state.receipts || []).find((receipt) => receipt.id === 'm10_restore_receipt');
  });
  expect(restoredReceipt.tripId).toBe('trip_export');
  expect(restoredReceipt.tripVersion).not.toBe(99);
  expect(restoredReceipt.tripDayId).not.toBe('foreign_day');

  await setAccordion(page, 'Email');
  await page.getByRole('button', { name: /Pull pending email/ }).click();
  await expect(page.getByText(/已同步檢查 .*暫時無待確認 email/)).toBeVisible();
  await page.getByRole('button', { name: /複製 Shortcut URL/ }).click();
  await expect(page.getByText(/shortcuts:\/\/|已複製 Shortcut URL/)).toBeVisible();

  await setAccordion(page, '資料管理');
  await page.locator('#settings-data-panel').getByRole('button', { name: /清除裝置信任/ }).click();
  await expect(page.getByText(/已清除此裝置信任/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('travel-expense-react:device-trust:v1'))).toBeNull();
});

test('Settings sync confidence center shows queued and failed local health states', async ({ page }) => {
  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));

  await page.addInitScript((seed) => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      ...seed,
      autoSync: false,
      personalNotionConnected: false,
      globalSyncStatus: 'offline',
      syncError: 'offline smoke failure',
      lastSyncedAt: Date.now() - 2 * 60 * 60 * 1000,
      syncQueue: [{
        id: 'settings-queued-item',
        type: 'receipt',
        entityId: 'settings_sync_receipt',
        op: 'update',
        status: 'queued',
        attempts: 0,
        createdAt: 1,
        updatedAt: 1,
      }, {
        id: 'settings-failed-item',
        type: 'receipt',
        entityId: 'settings_failed_receipt',
        op: 'update',
        status: 'error',
        attempts: 3,
        error: 'network unavailable',
        createdAt: 2,
        updatedAt: 2,
      }],
    }));
  }, tripState());

  await page.goto(`${APP_URL}#settings`);
  const center = page.locator('.settings-sync-confidence');
  await expect(center).toBeVisible();
  await expect(center).toContainText('Needs attention');
  await expect(center).toContainText('未登入');
  await expect(center).toContainText('Pending Queue');
  await expect(center).toContainText('2 項');
  await expect(center).toContainText('1 項需要重試');
  await expect(center).toContainText('offline smoke failure');
  await expect(center).toContainText('Status: offline');
  expect(await center.locator('.settings-sync-confidence-grid > div').count()).toBe(4);
});

test('Settings sync confidence center labels Supabase-only cloud mode', async ({ page }) => {
  test.skip(process.env.SUPABASE_SETTINGS_SMOKE !== '1', 'Run with fake Supabase env to verify Supabase-only sync confidence state.');
  const userId = '22222222-2222-4222-8222-222222222222';
  const scope = `supabase:${userId}`;
  const scopedStorageKey = `boss-japan-tracker:state:${scope}`;

  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));
  await page.route('https://test-travel-expense.supabase.co/auth/v1/**', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({}),
  }));
  await page.route('https://test-travel-expense.supabase.co/rest/v1/**', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }));

  await page.addInitScript(({ userId, scopedStorageKey, scopedState }) => {
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem(scopedStorageKey, JSON.stringify(scopedState));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify({
      access_token: 'fake-access-token',
      refresh_token: 'fake-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'settings-sync@example.com',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }));
  }, {
    userId,
    scopedStorageKey,
    scopedState: {
      ...tripState('settings_supabase_trip'),
      autoSync: false,
      personalNotionConnected: false,
      notionDb: '',
      globalSyncStatus: 'idle',
      syncQueue: [],
    },
  });

  await page.goto(`${APP_URL}#settings`);
  const center = page.locator('.settings-sync-confidence');
  await expect(center).toBeVisible();
  await expect(center).toContainText('已登入雲端');
  await expect(center).toContainText('Supabase only');
  await expect(center).toContainText('0 項');
  await expect(center).toContainText(/Supabase scoped cache|Status:/);
});

test('Settings protects broker URL and does not keep archived trip active', async ({ page }) => {
  const defaultBroker = 'https://travel-expense-credential-broker.ftjdfr.workers.dev';
  const trips = [
    {
      id: 'trip_active_guard',
      name: 'Active Guard Trip',
      destinationSummary: 'Security City',
      startDate: '2026-05-08',
      endDate: '2026-05-08',
      homeCurrency: 'HKD',
      currencies: ['HKD', 'JPY'],
      timezones: ['Asia/Tokyo'],
      version: 1,
      active: true,
      itinerary: [{ date: '2026-05-08', day: 1, region: 'Security City', spots: [{ time: '10:00', name: 'Safe Spot', type: 'other' }] }],
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'trip_next_guard',
      name: 'Next Guard Trip',
      destinationSummary: 'Next City',
      startDate: '2026-06-01',
      endDate: '2026-06-01',
      homeCurrency: 'HKD',
      currencies: ['HKD', 'JPY'],
      timezones: ['Asia/Tokyo'],
      version: 1,
      active: false,
      itinerary: [{ date: '2026-06-01', day: 1, region: 'Next City', spots: [{ time: '12:00', name: 'Next Spot', type: 'other' }] }],
      createdAt: 2,
      updatedAt: 2,
    },
  ];

  await page.addInitScript((seedTrips) => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'settings-guard-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker:react-credentials', JSON.stringify({ credentialBrokerUrl: 'https://evil.example/broker' }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'settings',
      autoSync: false,
      activeTripId: 'trip_active_guard',
      tripName: 'Active Guard Trip',
      tripDateRange: { start: '2026-05-08', end: '2026-05-08' },
      trips: seedTrips,
      receipts: [],
    }));
  }, trips);

  await page.goto(`${APP_URL}#settings`);
  await expect(page.getByText('設定控制中心')).toBeVisible();

  await setAccordion(page, 'Credentials & Connection');
  const brokerInput = page.getByLabel('Credential Broker URL');
  await expect(brokerInput).toHaveValue(defaultBroker);
  await expect(brokerInput).toHaveAttribute('readonly', '');
  const storedCredentials = await page.evaluate(() => localStorage.getItem('boss-japan-tracker:react-credentials') || '');
  expect(storedCredentials).not.toContain('evil.example');
  expect(storedCredentials).toContain(defaultBroker);

  await setAccordion(page, '旅程管理器');
  await expect(page.getByRole('textbox', { name: '旅程名', exact: true })).toHaveValue('Active Guard Trip');
  await page.getByLabel('旅程狀態').selectOption('archived');
  await page.getByRole('button', { name: /儲存旅程修改/ }).click();
  await expect(page.getByRole('textbox', { name: '旅程名', exact: true })).toHaveValue('Next Guard Trip');
  const tripSelect = page.locator('#settings-trip-panel select').first();
  await expect(tripSelect).toHaveValue('trip_next_guard');

  await tripSelect.selectOption('trip_active_guard');
  await expect(page.getByRole('textbox', { name: '旅程名', exact: true })).toHaveValue('Active Guard Trip');
  await expect(tripSelect).toHaveValue('trip_active_guard');
});

test('Settings can connect a broker session without leaking the password into app state', async ({ page }) => {
  let unlockCount = 0;

  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/session/unlock', async (route) => {
    unlockCount += 1;
    const body = route.request().postDataJSON();
    expect(body.password).toBe('broker-pass');
    expect(body.trustDevice).toBeFalsy();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        session: 'settings-connected-session',
        expiresAt: Date.now() + 60_000,
      }),
    });
  });

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
      lastTab: 'settings',
      autoSync: false,
      receipts: [],
    }));
  });

  await page.goto(`${APP_URL}#settings`);
  await expect(page.getByText('設定控制中心')).toBeVisible();
  await setAccordion(page, 'Credentials & Connection');

  await page.getByLabel('Broker password').fill('broker-pass');
  await page.getByRole('button', { name: /Connect Broker/ }).click();
  await expect(page.getByText(/Broker session 已連上/)).toBeVisible();
  await expect.poll(() => unlockCount).toBe(1);

  const storageSnapshot = await page.evaluate(() => JSON.stringify(localStorage));
  expect(storageSnapshot).toContain('settings-connected-session');
  expect(storageSnapshot).not.toContain('broker-pass');
  expect(await page.getByLabel('Broker password').count()).toBe(0);
});
