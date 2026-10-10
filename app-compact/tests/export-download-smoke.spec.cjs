const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { unzipSync, strFromU8 } = require('fflate');

const APP_ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://localhost:8903';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZKAAAAAASUVORK5CYII=', 'base64');
test.use({ viewport: { width: 390, height: 844 } });

async function openExport(page, overrides = {}) {
  await page.route('**/secrets.local.js', (route) => route.fulfill({ contentType: 'application/javascript', body: 'window.DEV_SECRETS = {};' }));
  const trip = { id: 'trip_export_zip', name: '日本／旅程 #1', destinationSummary: '東京', startDate: '2026-10-01', endDate: '2026-10-02', homeCurrency: 'HKD', currencies: ['HKD', 'JPY'], timezones: ['Asia/Tokyo'], version: 1, active: true, createdAt: 1, updatedAt: 1,
    itinerary: [{ date: '2026-10-01', day: 1, region: '東京', timezone: 'Asia/Tokyo', highlight: '第一日', lodging: { name: '東京旅館', bookingRef: 'HOTEL-123' }, spots: [{ time: '10:00', name: '上野公園', type: 'sightseeing', note: '行程備註', bookingRef: 'BOOK-456' }] }],
  };
  const receipt = (id, store, extra = {}) => ({ id, store, tripId: trip.id, date: '2026-10-01', total: 2000, currency: 'JPY', originalAmount: 2000, originalCurrency: 'JPY', exchangeRate: 20, exchangeRatePinned: true, hkdAmount: 100, category: 'food', payment: 'cash', personId: 'p1', createdAt: 1, updatedAt: 1, ...extra });
  const payload = { lastTab: 'settings', autoSync: false, rate: 20, rateMode: 'fixed', tripCurrency: 'JPY', budget: 10000, activeTripId: trip.id, trips: [trip, { ...trip, id: 'trip_foreign', name: '另一旅程不應匯出', active: false, itinerary: [{ date: '2027-01-01', day: 1, region: '外地', spots: [{ name: '不可匯出行程', time: '12:00', type: 'food' }] }] }],
    persons: [{ id: 'p1', name: '小明', emoji: '👤', color: '#CC2929' }, { id: 'p2', name: '阿美', emoji: '🧳', color: '#059669' }], shareRatios: { p1: 1, p2: 1 },
    storeTranslations: { '未匯出外地店': { t: '不可匯出翻譯', at: 1 } },
    itineraryOverrides: { unrelated: { note: '不可匯出覆寫' } },
    receipts: [
      receipt('r1', '=SUM(1,2)', { photoUrl: 'https://export-photos.example/original?token=fixture-url-secret', supabaseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', sourceId: 'cloud-source-secret', note: '<script>window.badExport=true</script>\n第二行 "引號",逗號', itemsText: '咖啡\n蛋糕', lineItems: [{ id: 'item1', desc: '咖啡', amount: 2000, qty: 2 }], payers: [{ personId: 'p1', amount: 1000 }, { personId: 'p2', amount: 1000 }], splitType: 'percent', splits: [{ personId: 'p1', pct: 40 }, { personId: 'p2', pct: 60 }] }),
      receipt('r2', '縮圖商店#2', { photoUrl: 'https://export-photos.example/expired', photoThumb: `data:image/png;base64,${PNG.toString('base64')}` }),
      receipt('r3', '文字記錄', { total: 50, currency: 'HKD', originalAmount: 50, originalCurrency: 'HKD', hkdAmount: 50, photoUrl: undefined }),
      receipt('r4', '遺失圖片', { photoUrl: 'https://export-photos.example/missing', source: 'react-ocr' }),
      receipt('r5', '假圖片', { photoUrl: 'https://export-photos.example/html', source: 'react-ocr' }),
      receipt('r6', '退款', { total: -200, originalAmount: -200, hkdAmount: -10 }),
      receipt('r7', '還款', { total: 30, originalAmount: 30, currency: 'HKD', originalCurrency: 'HKD', hkdAmount: 30, recordKind: 'settlement', isSettlement: true }),
      receipt('foreign', '不可匯出收據', { tripId: 'trip_foreign', photoUrl: 'https://export-photos.example/foreign' }),
    ], ...overrides,
  };
  await page.addInitScript((data) => {
    window.__disable_supabase_configured = true;
    window.DEV_SECRETS = {};
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({ credentialSession: 'export-session-must-not-leak', credentialSessionExpiresAt: Date.now() + 60_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify(data));
  }, payload);
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#settings`);
  const accordion = page.locator('.accordion-summary', { hasText: '資料管理' });
  await expect(accordion).toBeVisible();
  await expect(accordion).toHaveAttribute('aria-expanded', 'false');
  await accordion.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('region', { name: '下載旅程資料' });
  await expect(panel).toBeVisible();
  return panel;
}

async function archiveDownload(page, panel, testInfo, images = false) {
  const choice = panel.getByRole('checkbox', { name: /連同收據圖片下載/ });
  if (images) await choice.check();
  else await expect(choice).not.toBeChecked();
  const promise = page.waitForEvent('download');
  await panel.getByRole('button', { name: images ? '下載資料及收據圖片 ZIP' : '下載資料 ZIP', exact: true }).click();
  const download = await promise;
  expect(download.suggestedFilename()).toMatch(images ? /-with-receipts\.zip$/ : /-data-only\.zip$/);
  expect(download.suggestedFilename()).not.toMatch(/[\/\\]/);
  const target = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(target);
  const bytes = fs.readFileSync(target);
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  return unzipSync(bytes);
}

function checkTextFiles(files) {
  const backupText = strFromU8(files['backup.json']);
  const backup = JSON.parse(backupText);
  expect(backup.receipts).toHaveLength(7);
  expect(backup.trips).toHaveLength(1);
  expect(backup.activeTripId).toBe('trip_export_zip');
  const allText = Object.entries(files).filter(([name]) => !name.startsWith('receipts/')).map(([, bytes]) => strFromU8(bytes)).join('\n');
  for (const excluded of ['另一旅程不應匯出', '不可匯出收據', '不可匯出行程', '不可匯出翻譯', '不可匯出覆寫', 'fixture-url-secret', 'cloud-source-secret', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'credentialSession', 'export-session-must-not-leak', 'photoThumb', 'photoUrl', 'supabasePhotoPath']) expect(allText).not.toContain(excluded);
  const csvBytes = files['data/receipts.csv'];
  expect([...csvBytes.subarray(0, 3)]).toEqual([239, 187, 191]);
  const csv = strFromU8(csvBytes);
  expect(csv).toContain("\"'=SUM(1,2)\"");
  expect(csv).toContain('第二行 ""引號"",逗號');
  expect(csv).toContain('咖啡\n蛋糕');
  expect(csv).toContain('"-200"');
  expect(csv).toContain('匯率(每 HKD)');
  expect(csv).toContain('小明 (1000 JPY); 阿美 (1000 JPY)');
  expect(strFromU8(files['data/line-items.csv'])).toContain('"咖啡","2","2000","JPY"');
  expect(strFromU8(files['data/allocations.csv'])).toContain('"阿美","1000","JPY"');
  expect(strFromU8(files['data/allocations.csv'])).toContain('"60"');
  expect(strFromU8(files['data/people.csv'])).toContain('小明');
  expect(strFromU8(files['data/itinerary.csv'])).toContain('HOTEL-123');
  expect(strFromU8(files['summary.html'])).toContain('&lt;script&gt;');
  expect(strFromU8(files['summary.html'])).not.toContain('<script>');
  expect(strFromU8(files['summary.html'])).toContain('HKD 440');
  return backup;
}

test('data-only ZIP contains organized current-trip files, no image requests, and restorable JSON', async ({ page }, testInfo) => {
  const requests = [];
  await page.route('https://export-photos.example/**', (route) => { requests.push(route.request().url()); return route.abort(); });
  const panel = await openExport(page);
  const files = await archiveDownload(page, panel, testInfo);
  expect(Object.keys(files)).toHaveLength(11);
  expect(Object.keys(files).some((name) => name.startsWith('receipts/'))).toBe(false);
  expect(requests).toEqual([]);
  const backup = checkTextFiles(files);
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  expect(manifest.includeImages).toBe(false);
  expect(manifest.photos.every((photo) => photo.status === 'omitted' && !photo.file)).toBe(true);
  await expect(panel.getByRole('status')).toContainText('不含收據圖片');
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await panel.screenshot({ path: testInfo.outputPath('export-mobile.png') });
  await page.locator('input[type=file][accept="application/json,.json"]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByLabel('Backup restore preview').getByRole('button', { name: /Apply backup/ }).click();
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('boss-japan-tracker')));
  expect(restored.receipts).toHaveLength(7);
  expect(restored.receipts.find((r) => r.id === 'r1').lineItems[0].desc).toBe('咖啡');
  expect(restored.receipts.every((r) => !r.photoUrl && !r.photoThumb && !r.supabaseId)).toBe(true);
});

test('ZIP downloads actual receipt bytes, marks thumbnail/missing/invalid images, and report links work offline', async ({ page }, testInfo) => {
  const requests = [];
  await page.route('https://export-photos.example/**', async (route) => {
    const name = new URL(route.request().url()).pathname;
    requests.push(name);
    if (name === '/original') return route.fulfill({ contentType: 'image/png', body: PNG });
    if (name === '/html') return route.fulfill({ contentType: 'image/png', body: '<html>wrong file</html>' });
    return route.fulfill({ status: 403, body: 'unavailable' });
  });
  const panel = await openExport(page);
  const files = await archiveDownload(page, panel, testInfo, true);
  checkTextFiles(files);
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  expect(manifest.includeImages).toBe(true);
  const original = manifest.photos.find((photo) => photo.receiptId === 'r1');
  const thumbnail = manifest.photos.find((photo) => photo.receiptId === 'r2');
  expect(original.status).toBe('downloaded');
  expect(thumbnail.status).toBe('thumbnail');
  expect(Buffer.from(files[original.file])).toEqual(PNG);
  expect(Buffer.from(files[thumbnail.file])).toEqual(PNG);
  expect(manifest.photos.find((photo) => photo.receiptId === 'r3').status).toBe('none');
  expect(manifest.photos.filter((photo) => photo.status === 'missing').map((photo) => photo.receiptId)).toEqual(['r4', 'r5']);
  expect(requests).not.toContain('/foreign');
  await expect(panel.getByRole('status')).toContainText('2 張未能下載');
  await expect(panel.getByRole('status')).toContainText('1 張只有縮圖');
  const extractPath = testInfo.outputPath('extracted');
  for (const [name, bytes] of Object.entries(files)) {
    expect(name).not.toMatch(/(^|\/)\.\.(\/|$)|^\//);
    const output = path.join(extractPath, name);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, bytes);
  }
  const offlineReport = await page.context().newPage();
  await offlineReport.goto(`file://${path.join(extractPath, 'summary.html')}`);
  await expect(offlineReport.getByRole('heading', { name: '日本／旅程 #1', exact: true })).toBeVisible();
  expect(await offlineReport.evaluate(() => window.badExport)).toBeUndefined();
  await offlineReport.getByRole('link', { name: '只有本地縮圖', exact: true }).click();
  expect(offlineReport.url()).toContain(encodeURIComponent('#'));
  await expect(offlineReport.locator('img')).toBeVisible();
  await expect.poll(() => offlineReport.locator('img').evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  await offlineReport.close();
});

test('cancel a slow image export without starting a download; data-only export can recover', async ({ page }, testInfo) => {
  let photoStarted;
  const started = new Promise((resolve) => { photoStarted = resolve; });
  await page.route('https://export-photos.example/**', async (route) => {
    photoStarted();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.fulfill({ contentType: 'image/png', body: PNG }).catch(() => undefined);
  });
  const panel = await openExport(page);
  await panel.getByRole('checkbox').check();
  let downloads = 0;
  page.on('download', () => { downloads++; });
  await panel.getByRole('button', { name: '下載資料及收據圖片 ZIP', exact: true }).click();
  await started;
  await panel.getByRole('button', { name: '取消匯出', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('已取消匯出');
  expect(downloads).toBe(0);
  await panel.getByRole('checkbox').uncheck();
  await archiveDownload(page, panel, testInfo);
  expect(downloads).toBe(1);
});

test('desktop export controls fit and an empty trip still downloads valid CSV/JSON/report', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const panel = await openExport(page, { receipts: [] });
  const files = await archiveDownload(page, panel, testInfo);
  expect(JSON.parse(strFromU8(files['backup.json'])).receipts).toEqual([]);
  expect(JSON.parse(strFromU8(files['manifest.json'])).receiptCount).toBe(0);
  expect(strFromU8(files['data/receipts.csv'])).toContain('日期');
  await expect(panel.getByRole('status')).toContainText('0 筆紀錄');
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true);
  await panel.screenshot({ path: testInfo.outputPath('export-desktop.png') });
});
