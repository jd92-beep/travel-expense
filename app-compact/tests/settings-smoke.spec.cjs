const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

test.use({ viewport: { width: 390, height: 844 } });

async function setAccordion(page, title, expanded = true) {
  const button = page.locator('.accordion-summary', { hasText: new RegExp(title) }).first();
  if ((await button.getAttribute('aria-expanded')) !== String(expanded)) await button.click();
}

async function expectSettingsReady(page) {
  await expect(page.locator('.compact-mobile-title-art')).toHaveAttribute('data-title', '設定控制中心');
  await expect(page.locator('.settings-preview-controls')).toBeVisible();
  await expect(page.locator('.settings-preview-controls button')).toHaveCount(3);
}

test('Settings expandable cards, safe broker actions, backup, restore, and trust clear work', async ({ page }) => {
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/kimi/json', async (route) => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: 'test kimi unavailable' }),
  }));
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/trip/intelligence', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      data: {
        trip: {
          name: 'Settings Seoul Trip',
          destinationSummary: 'Seoul',
          startDate: '2026-07-10',
          endDate: '2026-07-12',
          homeCurrency: 'HKD',
          currencies: ['HKD', 'KRW'],
          itinerary: [{
            date: '2026-07-10',
            day: 1,
            region: 'Seoul',
            city: 'Seoul',
            country: 'South Korea',
            timezone: 'Asia/Seoul',
            currency: 'KRW',
            highlight: 'Arrival and Hongdae dinner',
            lodging: { name: 'Hongdae Stay' },
            spots: [
              { time: '18:00', name: 'Hongdae Street', type: 'sightseeing' },
              { time: '19:30', name: 'Seoul BBQ', type: 'food' },
            ],
          }],
        },
        summary: 'Settings smoke parsed the trip update.',
        extractionReport: {
          daysExtracted: 1,
          spotsExtracted: 2,
          hotelsExtracted: 1,
          restaurantsExtracted: 1,
          transportsExtracted: 0,
          importantDetailsExtracted: 3,
          sourceQuality: 'high',
          missingCriticalFields: ['Hongdae Stay address/mapUrl'],
          assumptions: ['Hongdae arrival time was treated as Day 1 evening'],
          warnings: [],
        },
        warnings: [],
        changes: ['Detected new Seoul trip.'],
      },
    }),
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
    window.__copiedTripShare = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__copiedTripShare = text;
        },
      },
    });
    localStorage.clear();
    localStorage.setItem('__stress_panel_unlocked', 'true');
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

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expectSettingsReady(page);

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
  const tripConfirm = page.getByRole('dialog', { name: '確認 AI 行程更新' });
  await expect(tripConfirm).toBeVisible();
  await expect(tripConfirm).toContainText('Settings Seoul Trip');
  await expect(tripConfirm).toContainText('Hongdae Stay');
  await expect(tripConfirm).toContainText('Seoul BBQ');
  await expect(tripConfirm).toContainText('未確認：Hongdae Stay address/mapUrl');
  await expect(tripConfirm).toContainText('模型假設：Hongdae arrival time was treated as Day 1 evening');
  await tripConfirm.getByRole('button', { name: '返回修改文字' }).click();
  await expect(page.getByRole('heading', { name: 'Settings Seoul Trip' })).toBeVisible();

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
  await page.getByRole('button', { name: '測試', exact: true }).click();
  await expect(page.getByText(/連線正常/)).toBeVisible();

  await setAccordion(page, '資料管理');
  const backupSafety = page.getByLabel('Backup safety scope');
  await expect(backupSafety).toContainText('CSV / Backup JSON 只包含目前旅程');
  await expect(backupSafety).toContainText('Backup 不包含 API key');
  await expect(backupSafety).toContainText('匯入 Backup 時會丟棄外部 cloud IDs');
  const deployRecovery = page.getByLabel('Maintainer deploy recovery note');
  await expect(deployRecovery).toBeVisible();
  await expect(deployRecovery).toContainText('Maintainer deploy recovery');
  await expect(deployRecovery).toContainText('Quota-safe');
  await deployRecovery.locator('summary').click();
  await expect(deployRecovery).toContainText('origin/main first');
  await expect(deployRecovery).toContainText('smoke:deploy-live');
  await expect(deployRecovery).toContainText('api-deployments-free-per-day');
  await expect(deployRecovery).toContainText('npx vercel deploy --prod --scope ftjdfr-7940s-projects --yes');
  await expect(deployRecovery).toContainText('npm run smoke:deploy-live');
  const deployRecoveryText = await deployRecovery.textContent();
  expect(deployRecoveryText || '').not.toMatch(/sk-[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{12,}|ntn_[A-Za-z0-9]{12,}|Bearer\s+[A-Za-z0-9._-]+|credentialSession|settings-session/i);
  const csvDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /匯出 CSV/ }).click();
  const csvDownload = await csvDownloadPromise;
  const csvPath = await csvDownload.path();
  const csvText = fs.readFileSync(csvPath, 'utf8');
  expect(csvText).toContain('M10 Export Cafe');
  expect(csvText).not.toContain('M10 Other Trip Cafe');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出 Backup', exact: true }).click();
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

  await page.getByRole('button', { name: /Preview trip share/ }).click();
  const tripSharePreview = page.getByLabel('Private trip-share preview');
  await expect(tripSharePreview).toBeVisible();
  await expect(tripSharePreview).toContainText('Private trip-share preview');
  await expect(tripSharePreview).toContainText('M10 Export Trip');
  await expect(tripSharePreview).toContainText('M10 Export Cafe');
  await expect(tripSharePreview).toContainText('current trip only');
  await expect(tripSharePreview).toContainText('Notion/Supabase IDs');
  await expect(tripSharePreview).not.toContainText('M10 Other Export Trip');
  await expect(tripSharePreview).not.toContainText('M10 Other Trip Cafe');
  await expect(tripSharePreview).not.toContainText('export-personal-db-should-not-survive');
  await expect(tripSharePreview).not.toContainText('export-trip-page-should-not-survive');
  await expect(tripSharePreview).not.toContainText('export-receipt-page-should-not-survive');
  await expect(tripSharePreview).not.toContainText('export-sync-queue-should-not-survive');

  await tripSharePreview.getByRole('button', { name: /Copy summary/ }).click();
  const copiedTripShare = await page.evaluate(() => window.__copiedTripShare);
  expect(copiedTripShare).toContain('M10 Export Trip');
  expect(copiedTripShare).toContain('M10 Export Cafe');
  expect(copiedTripShare).toContain('current trip only');
  expect(copiedTripShare).not.toContain('M10 Other Trip Cafe');
  expect(copiedTripShare).not.toContain('export-trip-page-should-not-survive');
  expect(copiedTripShare).not.toContain('export-receipt-page-should-not-survive');
  expect(copiedTripShare).not.toContain('export-sync-queue-should-not-survive');

  const shareDownloadPromise = page.waitForEvent('download');
  await tripSharePreview.getByRole('button', { name: /Download safe JSON/ }).click();
  const shareDownload = await shareDownloadPromise;
  const sharePath = await shareDownload.path();
  const shareText = fs.readFileSync(sharePath, 'utf8');
  const shareJson = JSON.parse(shareText);
  expect(shareJson.exportType).toBe('private-trip-share');
  expect(shareJson.trip.name).toBe('M10 Export Trip');
  expect(shareJson.trip.id).toBeUndefined();
  expect(shareJson.receipts).toHaveLength(1);
  expect(shareJson.receipts[0].store).toBe('M10 Export Cafe');
  expect(shareJson.receipts[0].id).toBeUndefined();
  expect(shareText).not.toContain('M10 Other Export Trip');
  expect(shareText).not.toContain('M10 Other Trip Cafe');
  expect(shareText).not.toContain('credentialSession');
  expect(shareText).not.toContain('export-personal-db-should-not-survive');
  expect(shareText).not.toContain('export-trip-db-should-not-survive');
  expect(shareText).not.toContain('export-trip-page-should-not-survive');
  expect(shareText).not.toContain('export-trip-source-should-not-survive');
  expect(shareText).not.toContain('export-receipt-page-should-not-survive');
  expect(shareText).not.toContain('export-file-upload-should-not-survive');
  expect(shareText).not.toContain('export-receipt-source-should-not-survive');
  expect(shareText).not.toContain('export-photo-should-not-survive');
  expect(shareText).not.toContain('export-sync-queue-should-not-survive');
  expect(shareText).not.toContain('export-deleted-page-should-not-survive');
  expect(shareText).not.toContain('99999999-9999-4999-8999-999999999999');
  expect(shareText).not.toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  expect(shareText).not.toContain('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

  await page.getByRole('button', { name: /Preview diagnostics/ }).click();
  const diagnosticsPreview = page.getByLabel('Public diagnostics preview');
  await expect(diagnosticsPreview).toBeVisible();
  await expect(diagnosticsPreview).toContainText('Public diagnostics preview');
  await expect(diagnosticsPreview).toContainText('public diagnostics');
  await expect(diagnosticsPreview).toContainText('Safe export');
  await expect(diagnosticsPreview).toContainText('Notion/Supabase IDs');
  await expect(diagnosticsPreview).toContainText('receipt IDs and SourceID');
  await expect(diagnosticsPreview).not.toContainText('M10 Export Trip');
  await expect(diagnosticsPreview).not.toContainText('M10 Export Cafe');
  await expect(diagnosticsPreview).not.toContainText('M10 Other Trip Cafe');
  await expect(diagnosticsPreview).not.toContainText('settings-session');
  await expect(diagnosticsPreview).not.toContainText('export-personal-db-should-not-survive');
  await expect(diagnosticsPreview).not.toContainText('export-trip-page-should-not-survive');
  await expect(diagnosticsPreview).not.toContainText('export-receipt-page-should-not-survive');
  await expect(diagnosticsPreview).not.toContainText('export-sync-queue-should-not-survive');
  await expect(diagnosticsPreview).not.toContainText('export-photo-should-not-survive');

  await diagnosticsPreview.getByRole('button', { name: /Copy diagnostics/ }).click();
  const copiedDiagnostics = await page.evaluate(() => window.__copiedTripShare);
  expect(copiedDiagnostics).toContain('Travel Expense Compact · public diagnostics');
  expect(copiedDiagnostics).toContain('Safe export');
  expect(copiedDiagnostics).not.toContain('M10 Export Trip');
  expect(copiedDiagnostics).not.toContain('M10 Export Cafe');
  expect(copiedDiagnostics).not.toContain('settings-session');
  expect(copiedDiagnostics).not.toContain('export-trip-page-should-not-survive');
  expect(copiedDiagnostics).not.toContain('export-receipt-page-should-not-survive');
  expect(copiedDiagnostics).not.toContain('export-sync-queue-should-not-survive');

  const diagnosticsDownloadPromise = page.waitForEvent('download');
  await diagnosticsPreview.getByRole('button', { name: /Download diagnostics JSON/ }).click();
  const diagnosticsDownload = await diagnosticsDownloadPromise;
  const diagnosticsPath = await diagnosticsDownload.path();
  const diagnosticsText = fs.readFileSync(diagnosticsPath, 'utf8');
  const diagnosticsJson = JSON.parse(diagnosticsText);
  expect(diagnosticsJson.exportType).toBe('public-safe-diagnostics');
  expect(diagnosticsJson.app.surface).toBe('compact');
  expect(diagnosticsJson.receipts.currentTrip).toBe(1);
  expect(diagnosticsJson.receipts.allTrips).toBe(2);
  expect(diagnosticsJson.trip.hasActiveTrip).toBe(true);
  expect(diagnosticsJson.trip.id).toBeUndefined();
  expect(diagnosticsJson.receipts.raw).toBeUndefined();
  expect(diagnosticsJson.sync.rawQueue).toBeUndefined();
  expect(diagnosticsText).not.toContain('M10 Export Trip');
  expect(diagnosticsText).not.toContain('M10 Export Cafe');
  expect(diagnosticsText).not.toContain('M10 Other Trip Cafe');
  expect(diagnosticsText).not.toContain('credentialSession');
  expect(diagnosticsText).not.toContain('settings-session');
  expect(diagnosticsText).not.toContain('export-personal-db-should-not-survive');
  expect(diagnosticsText).not.toContain('export-trip-db-should-not-survive');
  expect(diagnosticsText).not.toContain('export-trip-page-should-not-survive');
  expect(diagnosticsText).not.toContain('export-trip-source-should-not-survive');
  expect(diagnosticsText).not.toContain('export-receipt-page-should-not-survive');
  expect(diagnosticsText).not.toContain('export-file-upload-should-not-survive');
  expect(diagnosticsText).not.toContain('export-receipt-source-should-not-survive');
  expect(diagnosticsText).not.toContain('export-photo-should-not-survive');
  expect(diagnosticsText).not.toContain('export-sync-queue-should-not-survive');
  expect(diagnosticsText).not.toContain('export-deleted-page-should-not-survive');
  expect(diagnosticsText).not.toContain('99999999-9999-4999-8999-999999999999');
  expect(diagnosticsText).not.toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  expect(diagnosticsText).not.toContain('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

  await page.locator('#settings-data-panel input[type="file"]').setInputFiles(restorePath);
  const restorePreview = page.getByLabel('Backup restore preview');
  await expect(restorePreview).toBeVisible();
  await expect(restorePreview).toContainText('Restore preview');
  await expect(restorePreview).toContainText('1 receipt');
  await expect(restorePreview).toContainText('Secrets stripped');
  await restorePreview.getByRole('button', { name: /Apply backup/ }).click();
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

  await page.locator('#settings-data-panel').getByRole('button', { name: /清除本地資料/ }).click();
  const clearLocalPreview = page.getByLabel('Clear local data preview');
  await expect(clearLocalPreview).toBeVisible();
  await expect(clearLocalPreview).toContainText('清除本地資料前預覽');
  await expect(clearLocalPreview).toContainText('M10 Export Trip');
  await expect(clearLocalPreview).toContainText('Local receipts');
  await expect(clearLocalPreview).toContainText('1');
  await expect(clearLocalPreview).toContainText('Cloud data');
  await expect(clearLocalPreview).toContainText('Not deleted');
  await expect(clearLocalPreview).toContainText('Backup JSON');
  await clearLocalPreview.getByRole('button', { name: /Cancel clear/ }).click();
  await expect(clearLocalPreview).toBeHidden();
  const storageAfterClearCancel = await page.evaluate(() => localStorage.getItem('boss-japan-tracker') || '');
  expect(storageAfterClearCancel).toContain('M10 Restore Cafe');
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

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expectSettingsReady(page);

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

test('Settings Trip Doctor summarizes compact data quality and opens repair panels', async ({ page }) => {
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('__stress_panel_unlocked', 'true');
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'settings',
      budget: 80000,
      rate: 20,
      autoSync: true,
      activeTripId: 'trip_doctor',
      persons: [
        { id: 'p_boss', name: 'Boss' },
        { id: 'p_friend', name: 'Friend' },
      ],
      shareRatios: { p_boss: 1 },
      syncQueue: [
        { id: 'sync_doctor_1', type: 'receipt', entityId: 'doctor_pending_ocr', op: 'update', status: 'queued', attempts: 0, createdAt: 1, updatedAt: 1 },
        { id: 'sync_doctor_2', type: 'receipt', entityId: 'doctor_missing_person', op: 'update', status: 'error', attempts: 2, createdAt: 2, updatedAt: 2, lastError: 'network down' },
      ],
      trips: [{
        id: 'trip_doctor',
        name: 'Doctor Korea Trip',
        destinationSummary: 'Jeju, Korea',
        startDate: '2026-07-01',
        endDate: '2026-07-03',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'KRW'],
        timezones: ['Asia/Seoul'],
        version: 1,
        active: true,
        itinerary: [{ date: '2026-07-01', day: 1, region: 'Jeju', spots: [{ time: '10:00', name: 'Airport', type: 'transport' }] }],
        createdAt: 1,
        updatedAt: 1,
      }],
      receipts: [
        {
          id: 'doctor_pending_ocr',
          store: '⏳ Pending OCR',
          total: 1000,
          date: '2026-07-01',
          category: 'food',
          payment: 'cash',
          personId: 'p_boss',
          splitMode: 'shared',
          tripId: 'trip_doctor',
          syncStatus: 'pending',
          createdAt: 1,
        },
        {
          id: 'doctor_missing_person',
          store: 'Missing Person Cafe',
          total: 2000,
          date: '2026-07-01',
          category: 'food',
          payment: 'cash',
          splitMode: 'shared',
          tripId: 'trip_doctor',
          syncStatus: 'error',
          createdAt: 2,
        },
      ],
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expectSettingsReady(page);

  const doctor = page.getByLabel('Compact Trip Doctor');
  await expect(doctor).toBeVisible();
  await expect(doctor).toContainText('Compact Trip Doctor');
  await expect(doctor).toContainText('Data quality');
  await expect(doctor).toContainText('2 issues');
  await expect(doctor).toContainText('Pending OCR');
  await expect(doctor).toContainText('Missing payer');
  await expect(doctor).toContainText('Sync queue');
  await expect(doctor).toContainText('2 pending');
  await expect(doctor).toContainText('1 failed');
  await expect(doctor).toContainText('Trip completeness');
  await expect(doctor).toContainText('1/3 days');
  await expect(doctor).toContainText('Backup safety');
  await expect(doctor).toContainText('Current-trip only');

  await doctor.getByRole('button', { name: /Review records/ }).click();
  await expect(page.locator('.compact-mobile-title-art')).toHaveAttribute('data-title', '紀錄中心');
  await page.getByRole('button', { name: /設定/ }).click();
  await expectSettingsReady(page);

  await page.getByLabel('Compact Trip Doctor').getByRole('button', { name: /Data safety/ }).click();
  await expect(page.locator('[aria-controls="settings-data-panel"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#settings-data-panel')).toBeVisible();
});

test('Settings post-trip archive checklist separates backup, share, settlement, and cleanup', async ({ page }) => {
  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));

  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('__stress_panel_unlocked', 'true');
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'settings',
      budget: 120000,
      rate: 20,
      activeTripId: 'trip_post_archive',
      persons: [
        { id: 'p_boss', name: 'Boss' },
        { id: 'p_friend', name: 'Friend' },
      ],
      shareRatios: { p_boss: 1, p_friend: 1 },
      trips: [{
        id: 'trip_post_archive',
        name: 'Post Archive Trip',
        destinationSummary: 'Jeju, Korea',
        startDate: '2026-04-20',
        endDate: '2026-04-21',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'KRW'],
        timezones: ['Asia/Seoul'],
        version: 1,
        active: true,
        itinerary: [
          { date: '2026-04-20', day: 1, region: 'Jeju', spots: [{ time: '10:00', name: 'Airport', type: 'transport' }] },
          { date: '2026-04-21', day: 2, region: 'Jeju', spots: [{ time: '11:00', name: 'Market', type: 'shopping' }] },
        ],
        createdAt: 1,
        updatedAt: 1,
      }, {
        id: 'trip_other_archive',
        name: 'Other Archive Trip',
        destinationSummary: 'Other City',
        startDate: '2026-05-01',
        endDate: '2026-05-02',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        active: false,
        itinerary: [{ date: '2026-05-01', day: 1, region: 'Other', spots: [] }],
        createdAt: 2,
        updatedAt: 2,
      }],
      receipts: [{
        id: 'post_archive_shared',
        store: 'Archive Shared Dinner',
        total: 2000,
        date: '2026-04-20',
        category: 'food',
        payment: 'cash',
        personId: 'p_boss',
        splitMode: 'shared',
        tripId: 'trip_post_archive',
        createdAt: 1,
      }, {
        id: 'post_archive_private',
        store: 'Archive Private Snack',
        total: 500,
        date: '2026-04-21',
        category: 'food',
        payment: 'cash',
        personId: 'p_friend',
        splitMode: 'private',
        tripId: 'trip_post_archive',
        createdAt: 2,
      }, {
        id: 'other_archive_receipt',
        store: 'Other Archive Cafe',
        total: 999,
        date: '2026-05-01',
        category: 'food',
        payment: 'cash',
        tripId: 'trip_other_archive',
        createdAt: 3,
      }],
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expectSettingsReady(page);

  const archive = page.getByLabel('Post-trip archive checklist');
  await expect(archive).toBeVisible();
  await expect(archive).toContainText('Post-trip Archive');
  await expect(archive).toContainText('Archive ready');
  await expect(archive).toContainText('Final backup');
  await expect(archive).toContainText('2 receipts');
  await expect(archive).toContainText('Share export');
  await expect(archive).toContainText('2 days');
  await expect(archive).toContainText('Settlement check');
  await expect(archive).toContainText('1 transfer');
  await expect(archive).toContainText('Safe cleanup');
  await expect(archive).toContainText('Cloud data not deleted');

  const backupPromise = page.waitForEvent('download');
  await archive.getByRole('button', { name: /Final backup/ }).click();
  const backupDownload = await backupPromise;
  const backupPath = await backupDownload.path();
  const backupText = fs.readFileSync(backupPath, 'utf8');
  const backupJson = JSON.parse(backupText);
  expect(backupJson.activeTripId).toBe('trip_post_archive');
  expect(backupJson.trips).toHaveLength(1);
  expect(backupJson.receipts).toHaveLength(2);
  expect(backupText).toContain('Archive Shared Dinner');
  expect(backupText).not.toContain('Other Archive Cafe');

  await archive.getByRole('button', { name: /Private share/ }).click();
  await expect(page.locator('[aria-controls="settings-data-panel"]')).toHaveAttribute('aria-expanded', 'true');
  const sharePreview = page.getByLabel('Private trip-share preview');
  await expect(sharePreview).toBeVisible();
  await expect(sharePreview).toContainText('Post Archive Trip');
  await expect(sharePreview).toContainText('Archive Shared Dinner');
  await expect(sharePreview).not.toContainText('Other Archive Cafe');

  await archive.getByRole('button', { name: /Settlement check/ }).click();
  await expect(page).toHaveURL(/#stats/);
  await expect(page.locator('.compact-mobile-title-art')).toHaveAttribute('data-title', '預算使用分析');
  await page.getByRole('button', { name: /設定/ }).click();
  await expectSettingsReady(page);

  await page.getByLabel('Post-trip archive checklist').getByRole('button', { name: /Safe cleanup/ }).click();
  const clearLocalPreview = page.getByLabel('Clear local data preview');
  await expect(clearLocalPreview).toBeVisible();
  await expect(clearLocalPreview).toContainText('Post Archive Trip');
  await expect(clearLocalPreview).toContainText('Cloud data');
  await clearLocalPreview.getByRole('button', { name: /Cancel clear/ }).click();
  await expect(clearLocalPreview).toBeHidden();
  const storageAfterCancel = await page.evaluate(() => localStorage.getItem('boss-japan-tracker') || '');
  expect(storageAfterCancel).toContain('Post Archive Trip');
  expect(storageAfterCancel).toContain('Archive Shared Dinner');
});

test('Settings sync readiness dry run summarizes offline queue without provider calls', async ({ page }) => {
  let brokerCalls = 0;
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/**', async (route) => {
    brokerCalls += 1;
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'broker should not be called by dry run' }),
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
    localStorage.setItem('__stress_panel_unlocked', 'true');
    const now = Date.now();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: now + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'settings',
      autoSync: false,
      activeTripId: 'trip_sync_dry',
      lastSyncedAt: now - 5 * 86_400_000,
      trips: [{
        id: 'trip_sync_dry',
        name: 'Sync Dry Run Trip',
        destinationSummary: 'Seoul, Korea',
        startDate: '2026-06-01',
        endDate: '2026-06-03',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'KRW'],
        timezones: ['Asia/Seoul'],
        version: 1,
        active: true,
        itinerary: [{ date: '2026-06-01', day: 1, region: 'Seoul', spots: [] }],
        createdAt: 1,
        updatedAt: 1,
      }, {
        id: 'trip_sync_other',
        name: 'Other Sync Trip',
        destinationSummary: 'Other',
        startDate: '2026-07-01',
        endDate: '2026-07-02',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        active: false,
        itinerary: [],
        createdAt: 2,
        updatedAt: 2,
      }],
      receipts: [{
        id: 'sync_dry_receipt',
        store: 'Dry Run Dinner',
        total: 20000,
        date: '2026-06-01',
        category: 'food',
        payment: 'cash',
        tripId: 'trip_sync_dry',
        syncStatus: 'queued',
        createdAt: 1,
      }, {
        id: 'sync_dry_conflict',
        store: 'Dry Run Taxi',
        total: 15000,
        date: '2026-06-02',
        category: 'transport',
        payment: 'cash',
        tripId: 'trip_sync_dry',
        syncStatus: 'failed',
        createdAt: 2,
      }, {
        id: 'sync_other_receipt',
        store: 'Other Queue Cafe',
        total: 999,
        date: '2026-07-01',
        category: 'food',
        payment: 'cash',
        tripId: 'trip_sync_other',
        createdAt: 3,
      }],
      syncQueue: [{
        id: 'queue_sync_receipt',
        type: 'receipt',
        entityId: 'sync_dry_receipt',
        op: 'update',
        status: 'queued',
        attempts: 0,
        createdAt: now - 3 * 86_400_000,
        updatedAt: now - 3 * 86_400_000,
        payload: { tripId: 'trip_sync_dry', sourceId: 'safe-source-id' },
      }, {
        id: 'queue_sync_delete',
        type: 'delete-receipt',
        entityId: 'sync_dry_conflict',
        op: 'delete',
        status: 'failed',
        attempts: 3,
        error: 'provider-secret-should-not-render sk-test-should-not-render',
        createdAt: now - 2 * 86_400_000,
        updatedAt: now - 2 * 86_400_000,
        payload: {
          tripId: 'trip_sync_dry',
          sourceId: 'delete-source-id',
          notionPageId: 'page-should-not-render',
          supabaseId: '11111111-1111-4111-8111-111111111111',
        },
      }, {
        id: 'queue_sync_trip',
        type: 'trip',
        entityId: 'trip_sync_dry',
        op: 'update',
        status: 'queued',
        attempts: 1,
        createdAt: now - 90_000_000,
        updatedAt: now - 90_000_000,
        payload: { sourceId: 'trip-source-id' },
      }, {
        id: 'queue_sync_settings',
        type: 'settings',
        entityId: 'settings',
        op: 'upsert',
        status: 'queued',
        attempts: 0,
        createdAt: now - 80_000_000,
        updatedAt: now - 80_000_000,
      }, {
        id: 'queue_other_trip',
        type: 'receipt',
        entityId: 'sync_other_receipt',
        op: 'update',
        status: 'queued',
        attempts: 0,
        createdAt: now - 4 * 86_400_000,
        updatedAt: now - 4 * 86_400_000,
        payload: { tripId: 'trip_sync_other', sourceId: 'other-source-id' },
      }],
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expectSettingsReady(page);
  await setAccordion(page, 'Notion Sync');

  const dryRun = page.getByLabel('Sync readiness dry run');
  await expect(dryRun).toBeVisible();
  await expect(dryRun).toContainText('Sync dry run');
  await expect(dryRun).toContainText('Review first');
  await expect(dryRun).toContainText('4 pending');
  await expect(dryRun).toContainText('2 receipt');
  await expect(dryRun).toContainText('1 trip');
  await expect(dryRun).toContainText('1 settings');
  await expect(dryRun).toContainText('2 signals');
  await expect(dryRun).toContainText('1 failed queue item');
  await expect(dryRun).toContainText('3d old');
  await expect(dryRun).toContainText('Last sync 5d old');
  await expect(dryRun).toContainText('local');
  await expect(dryRun).toContainText('Dry run only');
  await expect(dryRun).toContainText('No provider calls');
  await expect(dryRun).toContainText('1 delete queued');
  await expect(dryRun).toContainText('Review conflicts before Push All');
  await expect(dryRun).not.toContainText('provider-secret-should-not-render');
  await expect(dryRun).not.toContainText('sk-test-should-not-render');
  await expect(dryRun).not.toContainText('page-should-not-render');
  await expect(dryRun).not.toContainText('11111111-1111-4111-8111-111111111111');
  expect(brokerCalls).toBe(0);

  await dryRun.getByRole('button', { name: /Review records/ }).click();
  await expect(page).toHaveURL(/#history/);
  await expect(page.locator('.compact-mobile-title-art')).toHaveAttribute('data-title', '紀錄中心');
  await page.getByRole('button', { name: /設定/ }).click();
  await expectSettingsReady(page);
  await setAccordion(page, 'Notion Sync');
  await page.getByLabel('Sync readiness dry run').getByRole('button', { name: /Backup first/ }).click();
  await expect(page.locator('[aria-controls="settings-data-panel"]')).toHaveAttribute('aria-expanded', 'true');
  expect(brokerCalls).toBe(0);
});

test('Settings trip scope audit flags active trip boundaries without provider calls', async ({ page }) => {
  let brokerCalls = 0;
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/**', async (route) => {
    brokerCalls += 1;
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'broker should not be called by trip scope audit' }),
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
    localStorage.setItem('__stress_panel_unlocked', 'true');
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'settings',
      activeTripId: 'trip_scope_audit',
      trips: [{
        id: 'trip_scope_audit',
        name: 'Scope Audit Trip',
        destinationSummary: 'Seoul, Korea',
        startDate: '2026-06-01',
        endDate: '2026-06-03',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'KRW'],
        timezones: ['Asia/Seoul'],
        version: 1,
        active: true,
        itinerary: [{ date: '2026-06-01', day: 1, region: 'Seoul', spots: [] }],
        createdAt: 1,
        updatedAt: 1,
      }, {
        id: 'trip_scope_other',
        name: 'Other Scope Trip',
        destinationSummary: 'Other City',
        startDate: '2026-07-01',
        endDate: '2026-07-03',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Tokyo'],
        version: 1,
        active: false,
        itinerary: [{ date: '2026-07-01', day: 1, region: 'Other', spots: [] }],
        createdAt: 2,
        updatedAt: 2,
      }],
      receipts: [{
        id: 'scope_in_range',
        store: 'Scope Lunch',
        total: 12000,
        date: '2026-06-02',
        category: 'food',
        payment: 'cash',
        tripId: 'trip_scope_audit',
        sourceId: 'scope-source-should-not-render',
        notionPageId: 'scope-page-should-not-render',
        createdAt: 1,
      }, {
        id: 'scope_out_of_range',
        store: 'Scope Early Train',
        total: 30000,
        date: '2026-05-29',
        category: 'transport',
        payment: 'cash',
        tripId: 'trip_scope_audit',
        supabaseId: '22222222-2222-4222-8222-222222222222',
        createdAt: 2,
      }, {
        id: 'scope_unlinked',
        store: 'Scope Unlinked Cafe',
        total: 9000,
        date: '2026-06-02',
        category: 'food',
        payment: 'cash',
        sourceId: 'unlinked-source-should-not-render',
        createdAt: 3,
      }, {
        id: 'scope_other_trip',
        store: 'Scope Other Hotel',
        total: 80000,
        date: '2026-07-01',
        category: 'hotel',
        payment: 'card',
        tripId: 'trip_scope_other',
        notionPageId: 'other-trip-page-should-not-render',
        createdAt: 4,
      }],
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expectSettingsReady(page);

  const audit = page.getByLabel('Trip scope audit');
  await expect(audit).toBeVisible();
  await expect(audit).toContainText('Trip Scope Audit');
  await expect(audit).toContainText('2 scope checks');
  await expect(audit).toContainText('2026-06-01 to 2026-06-03');
  await expect(audit).toContainText('Included');
  await expect(audit).toContainText('3 receipts');
  await expect(audit).toContainText('Backup/share/sync scope');
  await expect(audit).toContainText('Date window');
  await expect(audit).toContainText('1 outside');
  await expect(audit).toContainText('Unlinked');
  await expect(audit).toContainText('1 auto-linked');
  await expect(audit).toContainText('Review trip link');
  await expect(audit).toContainText('Other trips');
  await expect(audit).toContainText('1 excluded');
  await expect(audit).toContainText('Not exported here');
  await expect(audit).not.toContainText('scope-source-should-not-render');
  await expect(audit).not.toContainText('scope-page-should-not-render');
  await expect(audit).not.toContainText('22222222-2222-4222-8222-222222222222');
  await expect(audit).not.toContainText('unlinked-source-should-not-render');
  await expect(audit).not.toContainText('other-trip-page-should-not-render');
  expect(brokerCalls).toBe(0);

  await audit.getByRole('button', { name: /Repair first issue/ }).click();
  await expect(page).toHaveURL(/#history/);
  await expect(page.locator('.compact-mobile-title-art')).toHaveAttribute('data-title', '紀錄中心');
  await expect(page.getByRole('dialog', { name: '編輯紀錄' })).toBeVisible();
  await expect(page.getByLabel('店名 / 項目')).toHaveValue('Scope Early Train');
  await page.getByRole('button', { name: '×' }).click();
  await expect(page.getByRole('dialog', { name: '編輯紀錄' })).toBeHidden();
  await page.getByRole('button', { name: /設定/ }).click();
  await expectSettingsReady(page);
  await page.getByLabel('Trip scope audit').getByRole('button', { name: /Data safety/ }).click();
  await expect(page.locator('[aria-controls="settings-data-panel"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#settings-data-panel')).toBeVisible();
  expect(brokerCalls).toBe(0);
});

test('Settings backup restore preview can be cancelled before mutating local state', async ({ page }) => {
  const restorePath = path.join('/tmp', 'travel-expense-preview-cancel-restore.json');
  fs.writeFileSync(restorePath, JSON.stringify({
    credentialSession: 'preview-session-should-not-survive',
    notionToken: 'preview-notion-token-should-not-survive',
    activeTripId: 'foreign_preview_trip',
    trips: [{
      id: 'foreign_preview_trip',
      name: 'Foreign Preview Trip',
      destinationSummary: 'Preview City',
      startDate: '2026-08-01',
      endDate: '2026-08-02',
      homeCurrency: 'HKD',
      currencies: ['HKD', 'KRW'],
      timezones: ['Asia/Seoul'],
      version: 1,
      active: true,
      itinerary: [{ date: '2026-08-01', day: 1, region: 'Preview City', spots: [] }],
      createdAt: 1,
      updatedAt: 1,
    }],
    receipts: [{
      id: 'preview_restore_receipt',
      store: 'Preview Restore Cafe',
      total: 345,
      date: '2026-08-01',
      category: 'food',
      payment: 'cash',
      tripId: 'foreign_preview_trip',
      notionPageId: 'preview-page-should-not-survive',
      supabaseId: '11111111-1111-4111-8111-111111111111',
      sourceId: 'preview-source-should-not-survive',
      createdAt: 1,
    }],
  }));

  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'settings',
      activeTripId: 'trip_preview_current',
      trips: [{
        id: 'trip_preview_current',
        name: 'Current Preview Trip',
        destinationSummary: 'Current City',
        startDate: '2026-07-01',
        endDate: '2026-07-02',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Tokyo'],
        version: 1,
        active: true,
        itinerary: [{ date: '2026-07-01', day: 1, region: 'Current City', spots: [] }],
        createdAt: 1,
        updatedAt: 1,
      }],
      receipts: [{
        id: 'current_preview_receipt',
        store: 'Current Cafe',
        total: 123,
        date: '2026-07-01',
        category: 'food',
        payment: 'cash',
        tripId: 'trip_preview_current',
        createdAt: 1,
      }],
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expectSettingsReady(page);
  await setAccordion(page, '資料管理');

  await page.locator('#settings-data-panel input[type="file"]').setInputFiles(restorePath);
  const restorePreview = page.getByLabel('Backup restore preview');
  await expect(restorePreview).toBeVisible();
  await expect(restorePreview).toContainText('Restore preview');
  await expect(restorePreview).toContainText('Foreign Preview Trip');
  await expect(restorePreview).toContainText('1 receipt');
  await expect(restorePreview).toContainText('Secrets stripped');

  let stateSnapshot = await page.evaluate(() => localStorage.getItem('boss-japan-tracker') || '');
  expect(stateSnapshot).toContain('Current Cafe');
  expect(stateSnapshot).not.toContain('Preview Restore Cafe');
  expect(stateSnapshot).not.toContain('preview-session-should-not-survive');

  await restorePreview.getByRole('button', { name: /Cancel import/ }).click();
  await expect(restorePreview).toBeHidden();
  stateSnapshot = await page.evaluate(() => localStorage.getItem('boss-japan-tracker') || '');
  expect(stateSnapshot).not.toContain('Preview Restore Cafe');

  await page.locator('#settings-data-panel input[type="file"]').setInputFiles(restorePath);
  await expect(page.getByLabel('Backup restore preview')).toBeVisible();
  await page.getByLabel('Backup restore preview').getByRole('button', { name: /Apply backup/ }).click();
  await expect(page.getByText(/已匯入 backup：1 筆/)).toBeVisible();

  stateSnapshot = await page.evaluate(() => localStorage.getItem('boss-japan-tracker') || '');
  expect(stateSnapshot).toContain('Preview Restore Cafe');
  expect(stateSnapshot).not.toContain('preview-session-should-not-survive');
  expect(stateSnapshot).not.toContain('preview-page-should-not-survive');
  expect(stateSnapshot).not.toContain('11111111-1111-4111-8111-111111111111');
});

test('Trip update AI opens a day-by-day confirmation modal and applies a long Jeju itinerary', async ({ page }) => {
  const jejuItinerary = Array.from({ length: 8 }, (_, index) => {
    const day = index + 1;
    const date = `2026-06-${String(12 + day).padStart(2, '0')}`;
    const lodging = day <= 4 ? 'Hotel Fine Jeju' : day <= 7 ? 'Stanford Hotel & Resort Jeju' : undefined;
    const regions = ['Jeju West', 'Seogwipo', 'Udo / Seongsan', 'Aqua Planet', 'Aewol', 'Jeju City', 'Sinjeju', 'Airport'];
    const spotNames = [
      ['濟州機場', '道頭洞彩虹海岸道路', 'Osulloc Tea Museum'],
      ['Cafe Gyulkkot Darak', 'Camellia Hill', '偶來市場'],
      ['城山浦港', 'BLANC ROCHER', '城山日出峰'],
      ['牛沼端', 'Aqua Planet Jeju', 'Audrant'],
      ['9.81 Park Jeju', '涯月海邊咖啡街', 'Flowave'],
      ['七星路購物街', '東門市場', 'Moodjeju'],
      ['姐妹麵條', 'E-Mart Sinjeju Branch', '新羅免稅店'],
      ['Aewol The Sunset', 'Baro Pig’s Feet', '濟州機場'],
    ][index];
    return {
      date,
      day,
      region: regions[index],
      city: 'Jeju',
      country: 'South Korea',
      timezone: 'Asia/Seoul',
      currency: 'KRW',
      highlight: `${regions[index]} day plan`,
      ...(lodging ? { lodging: { name: lodging, confidence: 'high' } } : {}),
      spots: spotNames.map((name, spotIndex) => ({
        time: ['09:00', '12:30', '17:30'][spotIndex],
        name,
        type: spotIndex === 1 ? 'sightseeing' : spotIndex === 2 && /Flowave|Pig|市場|麵條/.test(name) ? 'food' : 'other',
        note: `Extracted from Day ${day}`,
        confidence: 'high',
      })),
    };
  });

  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/trip/intelligence', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      data: {
        trip: {
          name: '濟州2026',
          destinationSummary: 'Jeju, South Korea',
          startDate: '2026-06-13',
          endDate: '2026-06-20',
          homeCurrency: 'HKD',
          currencies: ['HKD', 'KRW'],
          intelligence: {
            countryCode: 'KR',
            countryName: 'South Korea',
            primaryCurrency: 'KRW',
            themeKey: 'korea_editorial',
            locale: 'ko-KR',
            timezone: 'Asia/Seoul',
            weatherRegion: 'Jeju',
            confidence: 'high',
          },
          itinerary: jejuItinerary,
        },
        extractionReport: {
          daysExtracted: 8,
          spotsExtracted: 24,
          hotelsExtracted: 2,
          restaurantsExtracted: 8,
          transportsExtracted: 4,
          importantDetailsExtracted: 24,
          sourceQuality: 'high',
          missingCriticalFields: ['Some exact addresses omitted'],
          assumptions: ['6月13日 interpreted as 2026-06-13 from trip context'],
          warnings: [],
        },
        summary: 'Extracted eight Jeju travel days from pasted itinerary.',
        warnings: [],
        changes: ['Built Jeju day-by-day itinerary.'],
      },
    }),
  }));
  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'settings-jeju-trip-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'settings',
      tripUpdateModel: 'kimi/kimi-code',
      activeTripId: 'trip_current',
      tripName: 'Current Trip',
      tripDateRange: { start: '2026-06-13', end: '2026-06-20' },
      tripCurrency: 'KRW',
      trips: [{
        id: 'trip_current',
        name: 'Current Trip',
        destinationSummary: 'Jeju',
        startDate: '2026-06-13',
        endDate: '2026-06-20',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'KRW'],
        timezones: ['Asia/Seoul'],
        version: 1,
        active: true,
        itinerary: [],
        createdAt: 1,
        updatedAt: 1,
      }],
      customItinerary: [],
      receipts: [],
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expectSettingsReady(page);
  await setAccordion(page, 'AI 行程更新');
  await page.getByPlaceholder(/下次/).fill('Day 1｜6月13日｜到步＋西線入住｜住 Hotel Fine Jeju\nDay 3｜6月15日｜牛島＋城山日出峰\nDay 8｜6月20日｜涯月慢遊＋機場回程');
  await page.getByRole('button', { name: /用已選模型分析/ }).click();

  const modal = page.getByRole('dialog', { name: '確認 AI 行程更新' });
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('濟州2026');
  await expect(modal).toContainText('Hotel Fine Jeju');
  await expect(modal).toContainText('Stanford Hotel & Resort Jeju');
  await expect(modal).toContainText('Day 3 · 2026-06-15');
  await expect(modal).toContainText('城山日出峰');
  await expect(modal).toContainText('Some exact addresses omitted');

  await modal.getByRole('button', { name: '確認並更新行程' }).click();
  await expect(page.getByText('已套用旅程：濟州2026')).toBeVisible();

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('boss-japan-tracker') || '{}'));
  expect(stored.tripName).toBe('濟州2026');
  expect(stored.tripCurrency).toBe('KRW');
  expect(stored.customItinerary).toHaveLength(8);
  expect(stored.customItinerary[2].spots.map((spot) => spot.name).join(' ')).toContain('城山日出峰');
  expect(stored.trips.find((trip) => trip.active).itinerary).toHaveLength(8);

  await page.getByLabel('主要分頁').getByRole('button', { name: '行程', exact: true }).click();
  await expect(page.locator('.timeline-trip-days')).toContainText('8日');
  await expect(page.getByText('城山日出峰')).toBeVisible();
});

test('Trip update AI falls back to local parser and still opens confirmation modal', async ({ page }) => {
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/trip/intelligence', async (route) => route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: 'trip intelligence unavailable' }),
  }));
  for (const provider of ['mimo', 'kimi', 'google']) {
    await page.route(`https://travel-expense-credential-broker.ftjdfr.workers.dev/${provider}/json`, async (route) => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: `${provider} unavailable` }),
    }));
  }
  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'settings-jeju-local-parser-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'settings',
      tripUpdateModel: 'mimo/mimo-v2.5',
      activeTripId: 'trip_current_local_parser',
      tripName: 'Current Trip',
      tripDateRange: { start: '2026-06-13', end: '2026-06-20' },
      tripCurrency: 'KRW',
      trips: [{
        id: 'trip_current_local_parser',
        name: 'Current Trip',
        destinationSummary: 'Jeju',
        startDate: '2026-06-13',
        endDate: '2026-06-20',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'KRW'],
        timezones: ['Asia/Seoul'],
        version: 1,
        active: true,
        itinerary: [],
        createdAt: 1,
        updatedAt: 1,
      }],
      customItinerary: [],
      receipts: [],
    }));
  });

  const longJeju = [
    'Day 1｜6月13日｜到步＋西線入住｜住 Hotel Fine Jeju',
    '06:30 抵達濟州機場',
    '11:15 午餐：李春玉元祖鯖魚包飯',
    '14:00 Osulloc Tea Museum',
    'Day 2｜6月14日｜南部花景＋西歸浦｜住 Hotel Fine Jeju',
    '10:30 Camellia Hill 山茶花之丘',
    '18:15 偶來市場晚餐／甜點',
    'Day 3｜6月15日｜牛島＋城山日出峰｜住 Hotel Fine Jeju',
    '09:00 城山浦港買船票',
    '17:00 城山日出峰',
    'Day 4｜6月16日｜牛沼端＋Aqua Planet｜住 Hotel Fine Jeju',
    '09:40 牛沼端 木舟及木筏',
    '13:00 Aqua Planet Jeju 入場',
    'Day 5｜6月17日｜退房＋9.81 Park＋涯月｜住 Stanford',
    '11:30 9.81 Park Jeju',
    '18:30 晚餐：Flowave',
    'Day 6｜6月18日｜舊濟州市購物＋東門市場｜住 Stanford',
    '10:45 七星路購物街',
    '12:45 東門市場午餐掃街',
    'Day 7｜6月19日｜新濟州＋蓮洞採購日｜住 Stanford',
    '10:30 E-Mart Sinjeju Branch',
    '15:15 新羅免稅店',
    'Day 8｜6月20日｜涯月慢遊＋機場回程',
    '11:00 Aewol The Sunset',
    '21:30 濟州起飛',
  ].join('\n');

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expectSettingsReady(page);
  await setAccordion(page, 'AI 行程更新');
  await expect(page.locator('#settings-trip-update-panel')).toContainText('目前 primary：Mimo v2.5');
  await page.getByPlaceholder(/下次/).fill(longJeju);
  await page.getByRole('button', { name: /用已選模型分析/ }).click();

  const modal = page.getByRole('dialog', { name: '確認 AI 行程更新' });
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('濟州2026');
  await expect(modal).toContainText('Day 8 · 2026-06-20');
  await expect(modal).toContainText('Aewol The Sunset');
  await expect(modal).toContainText('Some exact addresses/coordinates need confirmation');
  await modal.getByRole('button', { name: '確認並更新行程' }).click();
  await expect(page.getByText('已套用旅程：濟州2026')).toBeVisible();

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('boss-japan-tracker') || '{}'));
  expect(stored.tripCurrency).toBe('KRW');
  expect(stored.customItinerary).toHaveLength(8);
  expect(stored.customItinerary[7].spots.map((spot) => spot.name).join(' ')).toContain('Aewol The Sunset');
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

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expectSettingsReady(page);
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
