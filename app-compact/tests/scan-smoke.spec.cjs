const { test, expect } = require('@playwright/test');

const APP_ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://localhost:8903';

test.use({ viewport: { width: 390, height: 844 } });

test('Scan tab manual, voice, email, currency, and cleanup flows', async ({ page }) => {
  const consoleMessages = [];
  page.on('console', (msg) => consoleMessages.push(`${msg.type()}:${msg.text()}`));
  let scanCalls = 0;
  const brokerJsonRoute = async (route) => {
    const body = route.request().postDataJSON();
    let data;
    if (body.kind === 'scan') {
      scanCalls += 1;
      const partial = scanCalls >= 4;
      data = {
        store: partial ? 'broken-email-screenshot' : 'm5-camera-receipt',
        total: partial ? 0 : 1234,
        date: '2026-05-08',
        time: '09:30',
        category: 'food',
        payment: 'suica',
        note: partial ? 'partial screenshot smoke' : '',
      };
    } else if (body.kind === 'voice') {
      data = [{
        store: 'M5 Voice Cafe',
        total: 1234,
        date: '2026-05-08',
        time: '09:30',
        category: 'food',
        payment: 'suica',
      }];
    } else {
      data = [{
        store: 'M5 Email Lunch',
        total: 888,
        date: '2026-05-08',
        time: '12:00',
        category: 'food',
        payment: 'credit',
        bookingRef: 'REF55555',
      }];
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
  };
  await page.route('**/google/json', brokerJsonRoute);
  await page.route('**/kimi/json', brokerJsonRoute);
  await page.route('**/mimo/json', brokerJsonRoute);
  await page.route('**/openrouter/json', brokerJsonRoute);
  await page.route('**/opencode/json', brokerJsonRoute);

  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'scan-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
  });

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/`);
  const nav = page.getByLabel('主要分頁');
  await nav.getByRole('button', { name: '記帳', exact: true }).click();
  await expect(page.getByText('掃描收據')).toBeVisible();
  await expect(page.getByRole('button', { name: '相機' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '相簿' }).first()).toBeVisible();
  // Passport-stamp layout: one stamp shutter, four route stamps, the visa rate button, today's ledger.
  await expect(page.locator('.scan-route')).toHaveText(['相簿', '語音', 'Email', '手動']);
  await expect(page.getByRole('button', { name: '匯率' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '今日入帳' })).toBeVisible();
  await expect(page.locator('.scan-function-art')).toHaveCount(0);
  await expect(page.getByLabel('Scan cockpit')).toHaveCount(0);
  const shutter = await page.locator('.scan-stamp-shutter').boundingBox();
  const routes = await page.locator('.scan-routes').boundingBox();
  expect(shutter).toBeTruthy();
  expect(routes).toBeTruthy();
  expect(shutter.width).toBeGreaterThanOrEqual(200);
  expect(shutter.y + shutter.height).toBeLessThanOrEqual(routes.y);
  expect(routes.width).toBeGreaterThanOrEqual(340);
  await expect(page.locator('#scan-camera-input')).toHaveAttribute('capture', 'environment');
  await page.locator('#scan-camera-input').setInputFiles({
    name: 'm5-camera-receipt.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  await expect(page.getByText('編輯紀錄')).toBeVisible();
  await expect(page.getByLabel('店名 / 項目')).toHaveValue('m5-camera-receipt');
  await page.getByRole('button', { name: '取消' }).click();
  await page.locator('#scan-camera-input').setInputFiles({
    name: 'm5-camera-receipt.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  await expect(page.getByText('編輯紀錄')).toBeVisible();
  await expect(page.getByLabel('店名 / 項目')).toHaveValue('m5-camera-receipt');
  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByLabel('Scan cockpit')).toHaveCount(0);
  await expect(page.locator('.scan-last')).toContainText('m5-camera-receipt.jpg');

  await page.getByRole('button', { name: '手動', exact: true }).click();
  await page.getByLabel('店名 / 項目').fill('M5 手動測試');
  await page.getByLabel('金額', { exact: true }).fill('456');
  await page.getByLabel('時間').fill('10:10');
  await page.getByRole('button', { name: '儲存' }).click();
  await nav.getByRole('button', { name: '紀錄', exact: true }).click();
  await expect(page.locator('.receipt-row').filter({ hasText: 'M5 手動測試' }).first()).toBeVisible();
  await page.locator('.receipt-row').filter({ hasText: 'M5 手動測試' }).first().click();
  await page.getByLabel('金額', { exact: true }).fill('789');
  await page.getByRole('button', { name: '儲存' }).click();
  await expect(page.locator('.receipt-row').filter({ hasText: 'M5 手動測試' }).first()).toContainText('789');
  await page.locator('.receipt-row').filter({ hasText: 'M5 手動測試' }).first().click();
  await page.getByRole('button', { name: '刪除' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '確認刪除' }).click();
  await expect(page.locator('.receipt-row').filter({ hasText: 'M5 手動測試' })).toHaveCount(0);

  await nav.getByRole('button', { name: '記帳', exact: true }).click();
  await page.getByRole('button', { name: '語音' }).click();
  await page.getByPlaceholder('例：喺全家買飯糰同飲品 580 yen，用 Suica').fill('2026-05-08 喺 M5 Voice Cafe 1234 yen，用 Suica，09:30');
  await page.getByRole('button', { name: '解析' }).click();
  await expect(page.getByText('編輯紀錄')).toBeVisible();
  await expect(page.getByLabel('金額', { exact: true })).toHaveValue('1234');
  await page.getByRole('button', { name: '取消' }).click();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '相機' }).first().click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'm5-camera-receipt.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  await expect(page.getByText('編輯紀錄')).toBeVisible();
  await page.getByRole('button', { name: '取消' }).click();
  await page.getByRole('button', { name: '重開上次草稿' }).click();
  await expect(page.getByText('編輯紀錄')).toBeVisible();
  await page.getByRole('button', { name: '取消' }).click();

  await page.getByRole('button', { name: 'Email' }).click();
  await page.getByRole('button', { name: '複製 Gmail' }).click();
  await expect(page.getByText('ftjdfr+expense@gmail.com')).toBeVisible();
  await page.locator('#scan-email-image-input').setInputFiles({
    name: 'broken-email-screenshot.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  await expect(page.getByRole('heading', { name: '批次確認' })).toBeVisible();
  await expect(page.getByLabel('Batch recovery summary')).toContainText('1 需補資料');
  await page.getByRole('button', { name: '只選完成' }).click();
  await expect(page.getByRole('button', { name: /全部儲存/ })).toContainText('(0)');
  await page.getByRole('button', { name: '取消' }).click();
  await page.getByPlaceholder('貼 booking confirmation / email 文字').fill('2026-05-08 at M5 Email Lunch 888 yen booking REF55555');
  await page.getByRole('button', { name: '解析文字' }).click();
  await expect(page.getByRole('heading', { name: '批次確認' })).toBeVisible();
  await expect(page.getByLabel('Batch recovery summary')).toContainText('1 已選');
  await expect(page.getByLabel('Batch recovery summary')).toContainText('0 需補資料');
  await page.getByRole('button', { name: /全部儲存/ }).click();
  await expect(page.getByText('已儲存 1 筆 email 待確認紀錄。')).toBeVisible();

  await page.getByRole('button', { name: '匯率' }).click();
  const fxDialog = page.getByRole('dialog', { name: '即時匯率' });
  await expect(fxDialog).toBeVisible();
  await fxDialog.locator('input').first().fill('2000');
  await expect(fxDialog).toContainText('2000 JPY');
  await fxDialog.getByRole('button', { name: '關閉' }).click();

  await nav.getByRole('button', { name: '紀錄', exact: true }).click();
  await page.getByPlaceholder(/搜尋店名|搜尋店家/).fill('M5 Email');
  await page.locator('.receipt-row').filter({ hasText: 'M5 Email' }).first().click();
  await page.getByRole('button', { name: '刪除' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '確認刪除' }).click();
  await expect(page.getByText('M5 Email')).toBeHidden();
  expect(consoleMessages.filter((message) => message.includes('Session invalid') || (message.includes('[AI Routing]') && message.includes('嘗試失敗')))).toHaveLength(0);
});
