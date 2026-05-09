const { test, expect } = require('@playwright/test');

test.use({ channel: 'chrome', viewport: { width: 390, height: 844 } });

test('Scan tab manual, voice, email, currency, and cleanup flows', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
  });

  await page.goto('http://localhost:8902/travel-expense/react/');
  await page.getByRole('button', { name: '記帳' }).click();
  await expect(page.getByText('快速記帳')).toBeVisible();
  await expect(page.getByRole('button', { name: '相機' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '相簿' }).first()).toBeVisible();
  await expect(page.locator('#scan-camera-input')).toHaveAttribute('capture', 'environment');
  await page.locator('#scan-camera-input').setInputFiles({
    name: 'm5-camera-receipt.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  await expect(page.getByText('編輯紀錄')).toBeVisible();
  await expect(page.getByLabel('店名 / 項目')).toHaveValue('m5-camera-receipt');
  await page.getByRole('button', { name: '取消' }).click();

  await page.getByRole('button', { name: '手動記一筆' }).click();
  await page.getByLabel('店名 / 項目').fill('M5 手動測試');
  await page.getByLabel('金額（legacy total）').fill('456');
  await page.getByLabel('時間').fill('10:10');
  await page.getByRole('button', { name: '儲存' }).click();
  await page.getByRole('button', { name: '主頁' }).click();
  await expect(page.locator('.receipt-row').filter({ hasText: 'M5 手動測試' }).first()).toBeVisible();
  await page.locator('.receipt-row').filter({ hasText: 'M5 手動測試' }).first().click();
  await page.getByLabel('金額（legacy total）').fill('789');
  await page.getByRole('button', { name: '儲存' }).click();
  await expect(page.locator('.receipt-row').filter({ hasText: 'M5 手動測試' }).first()).toContainText('¥789');
  await page.locator('.receipt-row').filter({ hasText: 'M5 手動測試' }).first().click();
  await page.getByRole('button', { name: '刪除' }).click();
  await expect(page.locator('.receipt-row').filter({ hasText: 'M5 手動測試' })).toHaveCount(0);

  await page.getByRole('button', { name: '記帳' }).click();
  await page.getByRole('tab', { name: '語音' }).click();
  await page.getByPlaceholder('例：喺全家買飯糰同飲品 580 yen，用 Suica').fill('2026-05-08 喺 M5 Voice Cafe 1234 yen，用 Suica，09:30');
  await page.getByRole('button', { name: '解析' }).click();
  await expect(page.getByText('編輯紀錄')).toBeVisible();
  await expect(page.getByLabel('金額（legacy total）')).toHaveValue('1234');
  await page.getByRole('button', { name: '取消' }).click();
  await page.getByRole('tab', { name: '掃描' }).click();
  await page.getByRole('button', { name: '重開上次草稿' }).click();
  await expect(page.getByText('編輯紀錄')).toBeVisible();
  await page.getByRole('button', { name: '取消' }).click();

  await page.getByRole('tab', { name: 'Email' }).click();
  await page.getByRole('button', { name: '複製 Gmail' }).click();
  await expect(page.getByText('ftjdfr+expense@gmail.com')).toBeVisible();
  await page.getByPlaceholder('貼 booking confirmation / email 文字').fill('2026-05-08 at M5 Email Lunch 888 yen booking REF55555');
  await page.getByRole('button', { name: '解析成待確認紀錄' }).click();
  await expect(page.getByRole('heading', { name: 'Batch Confirm' })).toBeVisible();
  await page.getByRole('button', { name: /全部儲存/ }).click();
  await expect(page.getByText('已儲存 1 筆 email 待確認紀錄。')).toBeVisible();

  await page.getByRole('tab', { name: '匯率' }).click();
  await page.getByRole('textbox').first().fill('2000');
  await expect(page.getByText(/2000 JPY =/)).toBeVisible();

  await page.getByRole('button', { name: '紀錄' }).click();
  await page.getByPlaceholder('搜尋店名 / 備註 / 地區').fill('M5 Email');
  await page.locator('.receipt-row').filter({ hasText: 'M5 Email' }).first().click();
  await page.getByRole('button', { name: '刪除' }).click();
  await expect(page.getByText('M5 Email')).toBeHidden();
});
