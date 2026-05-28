const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

const sampleBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAJYAAACWCAIAAACzY+a1AAABkklEQVR4nO3TsQmDYBRGUQ3uZZEiW1hnJFexyFYOkB3yB+TiOf2DDy5vPtdtouxx9QBGSZgnYZ6EeRLmSZgnYZ6EeRLmSZgnYZ6EeRLmSZgnYZ6EeRLmSZgnYd4ycvx67v9bcnfH5/3boS/MkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBPwjwJ8yTMkzBvPtft6g0M8YV5EuZJmCdhnoR5EuZJmCdhnoR5EuZJmCdhnoR5EuZJmCdhnoR5Ek51XxcyB08Wv0o/AAAAAElFTkSuQmCC'; // 一個真正的 150x150 彩色 PNG base64 碼

const receipts = [
  {
    id: 'smoke_receipt_1',
    store: 'Test Camera Receipt',
    total: 888,
    date: '2026-04-20',
    time: '12:00',
    category: 'food',
    payment: 'cash',
    personId: 'p_boss',
    splitMode: 'shared',
    photoThumb: 'data:image/png;base64,' + sampleBase64, // 測試用的 base64
    createdAt: Date.now(),
  }
];

test('Click camera icon in record tab and display receipt image modal', async ({ page }) => {
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
      credentialSession: 'smoke-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({ lastTab: 'history', receipts: seedReceipts, autoSync: false }));
  }, receipts);

  await page.goto('http://localhost:8902/travel-expense/react/');
  
  // 驗證紀錄中心 (Record Tab) 正常渲染
  await expect(page.getByText('紀錄中心')).toBeVisible();
  
  // 驗證「Test Camera Receipt」呢個 expense record 正常顯示
  await expect(page.getByText('Test Camera Receipt')).toBeVisible();

  // 點擊相機 icon 📷
  const cameraBtn = page.locator('.receipt-row').filter({ hasText: 'Test Camera Receipt' }).locator('button');
  await expect(cameraBtn).toBeVisible();
  await cameraBtn.click();

  // 驗證 Modal 浮現，並且圖片能夠正常加載出來！
  const modalImg = page.locator('.modal-backdrop img');
  await expect(modalImg).toBeVisible();
  
  // 驗證圖片的 src 屬性確實是我們處理過嘅 base64 (帶有正確的 PNG 前綴)
  const src = await modalImg.getAttribute('src');
  expect(src).toContain('data:image/png;base64,');
  
  // 稍微等待 1000ms 確保 Modal 的 fade-in 動畫徹底播放完畢、且瀏覽器完成圖片二進制渲染！
  await page.waitForTimeout(1000);
  
  // 影張相（截圖）作為 smoke test 成功嘅鐵證！
  await page.screenshot({ path: '/Users/tommy/.gemini/antigravity/brain/ab0eafa7-8cf5-461d-b30f-d2a653d32ede/receipt_modal_smoke_success.png' });
  console.log('Smoke test screenshot captured successfully with real visual photo!');
});
