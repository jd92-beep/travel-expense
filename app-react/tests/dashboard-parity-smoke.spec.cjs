const { test, expect } = require('@playwright/test');

test.use({ channel: 'chrome', viewport: { width: 390, height: 844 } });

async function openDashboard(page, statsIncludeTransportLodging) {
  await page.addInitScript((includeToggle) => {
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'dashboard',
      budget: 20000,
      rate: 20,
      statsIncludeTransportLodging: includeToggle,
      receipts: [
        { id: 'dash_food', store: 'Dashboard Food', total: 1000, date: '2026-05-08', category: 'food', payment: 'cash', personId: 'p_boss', splitMode: 'shared', createdAt: 1 },
        { id: 'dash_flight', store: 'Dashboard Flight', total: 9000, date: '2026-05-08', category: 'flight', payment: 'credit', personId: 'p_boss', splitMode: 'shared', createdAt: 2 },
      ],
    }));
  }, statsIncludeTransportLodging);
  await page.goto('http://localhost:8902/travel-expense/react/');
  await expect(page.getByText('預算進度')).toBeVisible();
}

test('Dashboard spending toggle matches legacy total/daily semantics', async ({ browser }) => {
  const defaultContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const defaultPage = await defaultContext.newPage();
  await openDashboard(defaultPage, false);
  await expect(defaultPage.locator('.metric-card').filter({ hasText: '今日' })).toContainText('¥1,000');
  await expect(defaultPage.locator('.metric-card').filter({ hasText: '總消費' })).toContainText('¥10,000');
  await defaultContext.close();

  const flippedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const flippedPage = await flippedContext.newPage();
  await openDashboard(flippedPage, true);
  await expect(flippedPage.locator('.metric-card').filter({ hasText: '今日' })).toContainText('¥10,000');
  await expect(flippedPage.locator('.metric-card').filter({ hasText: '總消費' })).toContainText('¥1,000');
  await flippedContext.close();
});
