const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

test.use({ channel: 'chrome', viewport: { width: 390, height: 844 } });

async function setAccordion(page, title, expanded = true) {
  const button = page.getByRole('button', { name: new RegExp(title) });
  if ((await button.getAttribute('aria-expanded')) !== String(expanded)) await button.click();
}

test('Settings expandable cards, safe broker actions, backup, restore, and trust clear work', async ({ page }) => {
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
    receipts: [{
      id: 'm10_restore_receipt',
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
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'settings',
      budget: 101800,
      rate: 20.36,
      receipts: [],
      statsIncludeTransportLodging: false,
      top10IncludeBigItems: true,
    }));
  });

  await page.goto('http://localhost:8902/travel-expense/react/');
  await expect(page.getByText('設定控制中心')).toBeVisible();

  const summaries = page.locator('.accordion-summary');
  await expect(summaries).toHaveCount(9);
  for (let i = 0; i < 9; i += 1) {
    const card = summaries.nth(i);
    const before = await card.getAttribute('aria-expanded');
    await card.click();
    await expect(card).toHaveAttribute('aria-expanded', before === 'true' ? 'false' : 'true');
    await card.click();
    await expect(card).toHaveAttribute('aria-expanded', before || 'false');
  }

  await setAccordion(page, '旅程設定');
  const tripNameInput = page.getByRole('textbox', { name: '旅程名' });
  await tripNameInput.fill('M10 Trip Updated');
  await page.getByLabel('預算 JPY').fill('123456');
  await page.getByLabel('預算 HKD').fill('6000');
  await page.getByLabel(/反轉首頁統計/).check();
  await expect(tripNameInput).toHaveValue('M10 Trip Updated');

  await setAccordion(page, '行程更新卡片');
  await page.getByPlaceholder(/下次/).fill('2026-07-10 to 2026-07-12 Seoul, arrive Hongdae 18:00, stay near Hongdae.');
  await page.getByRole('button', { name: /用 Kimi 分析/ }).click();
  await expect(page.getByText(/已產生 preview|AI 暫時未能完整分析/).first()).toBeVisible();

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
  await expect(page.getByText(/Rotate (credential 已安全暫停|notion失敗).*Credential Broker session 未連線/)).toBeVisible();
  await expect(page.getByLabel('New credential')).toHaveValue('');
  await expect(page.getByLabel('Admin maintenance passphrase')).toHaveValue('');
  const storageAfterRotate = await page.evaluate(() => JSON.stringify(localStorage));
  expect(storageAfterRotate).not.toContain('rotate-placeholder');
  expect(storageAfterRotate).not.toContain('admin-placeholder');

  await setAccordion(page, 'AI 模型選擇');
  const modelOptions = await page.locator('#settings-ai-models-panel option').allTextContents();
  expect(modelOptions.join(' ')).toContain('Kimi / kimi-code');
  expect(modelOptions.join(' ')).toContain('Google Gemini 2.5 Flash backup');
  expect(modelOptions.join(' ')).not.toMatch(/MiniMax|OpenRouter|GLM|ZAI/);

  await setAccordion(page, 'Notion Sync');
  await page.getByRole('button', { name: 'Save Local Settings' }).click();
  await expect(page.getByText(/本機設定已保存/)).toBeVisible();
  await page.getByRole('button', { name: 'Save & Push Settings' }).click();
  await expect(page.getByText(/Save & Push Settings 已安全暫停/)).toBeVisible();
  await page.getByRole('button', { name: '測試' }).click();
  await expect(page.getByText(/測試 Notion 已安全暫停/)).toBeVisible();

  await setAccordion(page, '資料管理');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /匯出 Backup JSON/ }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  const backupText = fs.readFileSync(backupPath, 'utf8');
  expect(backupText).not.toContain('credentialSession');
  expect(backupText).not.toContain('rotate-placeholder');
  expect(backupText).not.toContain('admin-placeholder');

  await page.locator('#settings-data-panel input[type="file"]').setInputFiles(restorePath);
  await expect(page.getByText(/已匯入 backup/)).toBeVisible();
  const storageAfterRestore = await page.evaluate(() => JSON.stringify(localStorage));
  expect(storageAfterRestore).not.toContain('evil.example');
  expect(storageAfterRestore).not.toContain('restore-session-should-not-survive');
  expect(storageAfterRestore).not.toContain('restore-notion-token-should-not-survive');
  expect(storageAfterRestore).not.toContain('restore-api-key-should-not-survive');
  expect(storageAfterRestore).not.toContain('restore-kimi-key-should-not-survive');
  expect(storageAfterRestore).not.toContain('restore-google-key-should-not-survive');

  await setAccordion(page, 'Email');
  await page.getByRole('button', { name: /Pull pending email/ }).click();
  await expect(page.getByText(/Pull pending email 已安全暫停/)).toBeVisible();
  await page.getByRole('button', { name: /複製 Shortcut URL/ }).click();
  await expect(page.getByText(/shortcuts:\/\/|已複製 Shortcut URL/)).toBeVisible();

  await setAccordion(page, '資料管理');
  await page.locator('#settings-data-panel').getByRole('button', { name: /清除裝置信任/ }).click();
  await expect(page.getByText(/已清除此裝置信任/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('travel-expense-react:device-trust:v1'))).toBeNull();
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
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:react-credentials', JSON.stringify({ credentialBrokerUrl: 'https://evil.example/broker' }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'settings',
      activeTripId: 'trip_active_guard',
      tripName: 'Active Guard Trip',
      tripDateRange: { start: '2026-05-08', end: '2026-05-08' },
      trips: seedTrips,
      receipts: [],
    }));
  }, trips);

  await page.goto('http://localhost:8902/travel-expense/react/');
  await expect(page.getByText('設定控制中心')).toBeVisible();

  await setAccordion(page, 'Credentials & Connection');
  const brokerInput = page.getByLabel('Credential Broker URL');
  await expect(brokerInput).toHaveValue(defaultBroker);
  await expect(brokerInput).toHaveAttribute('readonly', '');
  const storedCredentials = await page.evaluate(() => localStorage.getItem('boss-japan-tracker:react-credentials') || '');
  expect(storedCredentials).not.toContain('evil.example');
  expect(storedCredentials).toContain(defaultBroker);

  await setAccordion(page, '旅程設定');
  await expect(page.getByRole('textbox', { name: '旅程名' })).toHaveValue('Active Guard Trip');
  await page.getByRole('button', { name: '旅程狀態' }).click();
  await expect(page.getByRole('textbox', { name: '旅程名' })).toHaveValue('Next Guard Trip');
  await expect(page.getByLabel('切換旅程')).toHaveValue('trip_next_guard');

  await page.getByLabel('切換旅程').selectOption('trip_active_guard');
  await expect(page.getByRole('textbox', { name: '旅程名' })).toHaveValue('Active Guard Trip');
  await expect(page.getByLabel('切換旅程')).toHaveValue('trip_active_guard');
});
