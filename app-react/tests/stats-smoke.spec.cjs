const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

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
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify(payload));
  }, {
    lastTab: 'stats',
    persons,
    shareRatios: { p_boss: 1, p_xinxin: 1 },
    receipts,
    budget: 2400,
    statsIncludeTransportLodging: false,
    top10IncludeBigItems: true,
  });

  await page.goto('http://localhost:8902/travel-expense/react/');
  await expect(page.getByText('分帳統計中心')).toBeVisible();
  await expect(page.getByText('6 筆紀錄')).toBeVisible();
  await expect(page.locator('.stats-command-title-row')).toContainText('分帳統計中心');
  await expect(page.locator('.stats-command-title-row')).not.toContainText(/筆轉帳|已平衡/);
  const commandHeaderMetrics = await page.evaluate(() => {
    const title = document.querySelector('.stats-command-title')?.getBoundingClientRect();
    const pill = document.querySelector('.stats-record-pill')?.getBoundingClientRect();
    const row = document.querySelector('.stats-command-title-row')?.getBoundingClientRect();
    if (!title || !pill || !row) throw new Error('Stats command header elements missing');
    return {
      titleCenter: title.top + title.height / 2,
      titleRight: title.right,
      pillCenter: pill.top + pill.height / 2,
      pillLeft: pill.left,
      rowHeight: row.height,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  expect(Math.abs(commandHeaderMetrics.titleCenter - commandHeaderMetrics.pillCenter)).toBeLessThanOrEqual(6);
  expect(commandHeaderMetrics.pillLeft).toBeGreaterThan(commandHeaderMetrics.titleRight);
  expect(commandHeaderMetrics.rowHeight).toBeLessThanOrEqual(44);
  expect(commandHeaderMetrics.scrollWidth).toBeLessThanOrEqual(390);
  const compass = page.locator('.spending-compass');
  await expect(compass).toBeVisible();
  await expect(compass).toContainText('支出方向盤');
  await expect(compass).toContainText('日均');
  await expect(compass).toContainText('餐飲');
  await expect(compass).toContainText('最高');
  await expect(compass.locator('.spending-compass-slice')).toHaveCount(4);
  const compassMetrics = await compass.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      width: rect.width,
      scrollWidth: document.documentElement.scrollWidth,
      ringBackground: getComputedStyle(node).getPropertyValue('--compass-ring'),
    };
  });
  expect(compassMetrics.width, JSON.stringify(compassMetrics, null, 2)).toBeLessThanOrEqual(354);
  expect(compassMetrics.scrollWidth, JSON.stringify(compassMetrics, null, 2)).toBeLessThanOrEqual(390);
  expect(compassMetrics.ringBackground).toContain('conic-gradient');
  await expect(page.getByText('Xinxin').first()).toBeVisible();
  await expect(page.getByText('Tony').first()).toBeVisible();
  await expect(page.locator('.transfer-modern')).toContainText('¥2,850');
  await expect(page.getByText('代付：Tony 代 Xinxin 付 ¥300 · M9 Gift')).toBeVisible();
  await expect(page.getByText('每日 Budget Pace')).toBeVisible();
  await expect(page.locator('.trend-panel')).toContainText('超支');
  await expect(page.locator('.budget-pace')).toContainText('預算線');
  await expect(page.locator('.budget-pace-day.over')).toHaveCount(2);

  await expect(page.getByText('M9 Hotel')).toBeVisible();
  await expect(page.getByText('日常支出')).toBeVisible();
  await expect(page.locator('.bar-row').filter({ hasText: '住宿' })).toHaveCount(0);
  await page.getByLabel('包括交通/住宿於統計圖表').check();
  await expect(page.locator('.bar-row').filter({ hasText: '住宿' })).toBeVisible();
  await expect(page.locator('.bar-row').filter({ hasText: '住宿' })).toHaveAttribute('title', /住宿: ¥5,000/);
  await expect(page.getByText('Suica')).toBeVisible();

  await page.getByLabel('TOP 10 包括交通/住宿').uncheck();
  await expect(page.getByText('M9 Hotel')).toHaveCount(0);
  await expect(page.getByText('M9 Sushi')).toBeVisible();

  await expect(page.locator('.bar-row').filter({ hasText: '2026-04-20' })).toBeVisible();
  await expect(page.locator('.bar-row').filter({ hasText: '2026-04-21' })).toBeVisible();
  await expect(page.locator('.bar-row').filter({ hasText: '2026-04-22' })).toBeVisible();
});
