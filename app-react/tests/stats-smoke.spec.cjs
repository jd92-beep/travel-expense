const { test, expect } = require('@playwright/test');

test.use({ channel: 'chrome', viewport: { width: 390, height: 844 } });

const persons = [
  { id: 'p_boss', name: 'Tony', emoji: 'T', color: '#cc2929' },
  { id: 'p_xinxin', name: 'Xinxin', emoji: 'X', color: '#2d5a8e' },
];

const receipts = [
  { id: 'm9_shared_boss', store: 'M9 Sushi', total: 1000, date: '2026-04-20', category: 'food', payment: 'cash', personId: 'p_boss', splitMode: 'shared', createdAt: 1 },
  { id: 'm9_shared_xin', store: 'M9 Museum', total: 200, date: '2026-04-20', category: 'ticket', payment: 'credit', personId: 'p_xinxin', splitMode: 'shared', createdAt: 2 },
  { id: 'm9_private_cross', store: 'M9 Gift', total: 300, date: '2026-04-21', category: 'shopping', payment: 'paypay', personId: 'p_boss', splitMode: 'private', beneficiaryId: 'p_xinxin', createdAt: 3 },
  { id: 'm9_private_self', store: 'M9 Medicine', total: 150, date: '2026-04-21', category: 'medicine', payment: 'cash', personId: 'p_xinxin', splitMode: 'private', createdAt: 4 },
  { id: 'm9_lodging', store: 'M9 Hotel', total: 5000, date: '2026-04-22', category: 'lodging', payment: 'credit', personId: 'p_boss', splitMode: 'shared', createdAt: 5 },
  { id: 'm9_transport', store: 'M9 Train', total: 700, date: '2026-04-22', category: 'transport', payment: 'suica', personId: 'p_xinxin', splitMode: 'shared', createdAt: 6 },
];

test('Stats settlement, filters, top expenses, and trend are usable', async ({ page }) => {
  await page.addInitScript((payload) => {
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify(payload));
  }, {
    lastTab: 'stats',
    persons,
    shareRatios: { p_boss: 1, p_xinxin: 1 },
    receipts,
    statsIncludeTransportLodging: false,
    top10IncludeBigItems: true,
  });

  await page.goto('http://localhost:8902/travel-expense/react/');
  await expect(page.getByText('分帳統計中心')).toBeVisible();
  await expect(page.getByText('6 筆紀錄')).toBeVisible();
  await expect(page.getByText('X Xinxin').first()).toBeVisible();
  await expect(page.getByText('T Tony').first()).toBeVisible();
  await expect(page.locator('.transfer-modern')).toContainText('¥2,850');
  await expect(page.getByText('代付：Tony 代 Xinxin 付 ¥300 · M9 Gift')).toBeVisible();

  await expect(page.getByText('M9 Hotel')).toBeVisible();
  await expect(page.getByText('日常支出')).toBeVisible();
  await expect(page.getByText('🏨 住宿')).toHaveCount(0);
  await page.getByLabel('包括交通/住宿於統計圖表').check();
  await expect(page.getByText('🏨 住宿')).toBeVisible();
  await expect(page.locator('.bar-row').filter({ hasText: '🏨 住宿' })).toHaveAttribute('title', /住宿: ¥5,000/);
  await expect(page.getByText('Suica')).toBeVisible();

  await page.getByLabel('TOP 10 包括交通/住宿').uncheck();
  await expect(page.getByText('M9 Hotel')).toHaveCount(0);
  await expect(page.getByText('M9 Sushi')).toBeVisible();

  await expect(page.getByText('2026-04-20')).toBeVisible();
  await expect(page.getByText('2026-04-21')).toBeVisible();
  await expect(page.getByText('2026-04-22')).toBeVisible();
});
