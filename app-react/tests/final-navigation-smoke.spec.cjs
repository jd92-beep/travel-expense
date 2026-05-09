const { test, expect } = require('@playwright/test');

test.use({ channel: 'chrome' });

const tabs = [
  ['主頁', 'Total Budget'],
  ['記帳', '快速記帳'],
  ['行程', '行程時間線'],
  ['紀錄', '紀錄中心'],
  ['天氣', '天氣預報'],
  ['統計', '分帳統計中心'],
  ['設定', '設定控制中心'],
];

async function installTrust(page, lastTab = 'dashboard') {
  await page.addInitScript((tab) => {
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({ lastTab: tab, receipts: [] }));
  }, lastTab);
}

for (const [name, viewport] of [
  ['mobile 390x844', { width: 390, height: 844 }],
  ['mobile 360x780', { width: 360, height: 780 }],
  ['desktop 1280x900', { width: 1280, height: 900 }],
]) {
  test(`Final navigation smoke on ${name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await installTrust(page);
    await page.goto('http://localhost:8902/travel-expense/react/');
    const nav = page.getByLabel('主要分頁');
    for (const [tabLabel, expectedText] of tabs) {
      await nav.getByRole('button', { name: tabLabel, exact: true }).click();
      await expect(page.getByText(expectedText).first()).toBeVisible();
    }
    await context.close();
  });
}

test('Final lock gate smoke without trusted device', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('http://localhost:8902/travel-expense/react/');
  await expect(page.getByText('先解鎖再使用')).toBeVisible();
});
