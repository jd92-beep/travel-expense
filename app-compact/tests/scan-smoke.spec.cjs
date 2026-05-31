const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

test('Scan tab manual, voice, email, currency, and cleanup flows', async ({ page }) => {
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'scan-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  const nav = page.getByLabel('主要分頁');
  await nav.getByRole('button', { name: '記帳', exact: true }).click();
  await expect(page.getByText('掃描收據')).toBeVisible();
  await expect(page.getByRole('button', { name: '相機' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '相簿' }).first()).toBeVisible();
  await expect(page.locator('.scan-card-copy').first()).toHaveText(['相機', 'Camera'].join(''));
  await expect(page.locator('.scan-card-copy').nth(1)).toHaveText(['相簿', 'Gallery'].join(''));
  await expect(page.locator('.scan-card-copy').nth(2)).toHaveText(['手動記帳', 'Manual Entry'].join(''));
  await expect(page.locator('.scan-card-copy').nth(3)).toHaveText(['語音', 'Voice'].join(''));
  await expect(page.locator('.scan-card-copy').nth(4)).toHaveText(['Email', 'Email'].join(''));
  await expect(page.locator('.scan-card-copy').nth(5)).toHaveText(['匯率', 'Exchange Rate'].join(''));
  await expect(page.locator('.scan-hero-card')).not.toContainText('智能辨識');
  await expect(page.locator('.scan-hero-card')).not.toContainText('從手機相簿選取');
  await expect(page.locator('.scan-function-art')).toHaveCount(6);
  await expect(page.locator('.scan-function-art svg, .scan-function-art img')).toHaveCount(0);
  const heroCard = await page.locator('.scan-hero-card').boundingBox();
  const heroButton = await page.locator('.scan-hero-button').boundingBox();
  const galleryButton = await page.locator('.scan-secondary-button').boundingBox();
  const heroCopy = await page.locator('.scan-hero-copy').boundingBox();
  const heroVisual = await page.locator('.scan-banana-visual').boundingBox();
  expect(heroCard).toBeTruthy();
  expect(heroButton).toBeTruthy();
  expect(galleryButton).toBeTruthy();
  expect(heroCopy).toBeTruthy();
  expect(heroVisual).toBeTruthy();
  expect(await page.locator('.scan-hero-copy').evaluate((node) => getComputedStyle(node).textAlign)).toBe('center');
  expect(heroCard.width).toBeGreaterThanOrEqual(356);
  expect(heroButton.width).toBeGreaterThanOrEqual(150);
  expect(galleryButton.width).toBeGreaterThanOrEqual(150);
  expect(Math.abs(heroButton.width - galleryButton.width)).toBeLessThanOrEqual(24);
  const heroBackground = await page.locator('.scan-hero-button').evaluate((node) => getComputedStyle(node).backgroundImage);
  const galleryBackground = await page.locator('.scan-secondary-button').evaluate((node) => getComputedStyle(node).backgroundImage);
  expect(heroBackground).toContain('rgb(221, 48, 43)');
  expect(galleryBackground).toContain('rgb(61, 122, 82)');
  const overlapX = Math.max(0, Math.min(heroCopy.x + heroCopy.width, heroVisual.x + heroVisual.width) - Math.max(heroCopy.x, heroVisual.x));
  const overlapY = Math.max(0, Math.min(heroCopy.y + heroCopy.height, heroVisual.y + heroVisual.height) - Math.max(heroCopy.y, heroVisual.y));
  expect(overlapX * overlapY).toBe(0);
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

  await page.getByRole('button', { name: '手動', exact: true }).click();
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

  await nav.getByRole('button', { name: '記帳', exact: true }).click();
  await page.getByRole('button', { name: '語音' }).click();
  await page.getByPlaceholder('例：喺全家買飯糰同飲品 580 yen，用 Suica').fill('2026-05-08 喺 M5 Voice Cafe 1234 yen，用 Suica，09:30');
  await page.getByRole('button', { name: '解析' }).click();
  await expect(page.getByText('編輯紀錄')).toBeVisible();
  await expect(page.getByLabel('金額（legacy total）')).toHaveValue('1234');
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
  await page.getByPlaceholder('貼 booking confirmation / email 文字').fill('2026-05-08 at M5 Email Lunch 888 yen booking REF55555');
  await page.getByRole('button', { name: '解析文字' }).click();
  await expect(page.getByRole('heading', { name: 'Batch Confirm' })).toBeVisible();
  await page.getByRole('button', { name: /全部儲存/ }).click();
  await expect(page.getByText('已儲存 1 筆 email 待確認紀錄。')).toBeVisible();

  await page.getByRole('button', { name: '匯率' }).click();
  await page.getByRole('textbox').first().fill('2000');
  await expect(page.getByText(/2000 JPY =/)).toBeVisible();

  await nav.getByRole('button', { name: '紀錄', exact: true }).click();
  await page.getByPlaceholder(/搜尋店名|搜尋店家/).fill('M5 Email');
  await page.locator('.receipt-row').filter({ hasText: 'M5 Email' }).first().click();
  await page.getByRole('button', { name: '刪除' }).click();
  await expect(page.getByText('M5 Email')).toBeHidden();
});
