const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  
  const baseUrl = 'http://127.0.0.1:8904/travel-expense/react/';
  
  // Navigate to app first to set localStorage with correct key
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 15000 });
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 365;
  await page.evaluate((exp) => {
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp }));
  }, exp);
  await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);
  
  // Take screenshot of dashboard
  await page.screenshot({ path: '/Users/tommy/Documents/New project/travel-expense/app-react/test-results/audit-dashboard.png', fullPage: false });
  
  // Scroll down
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/Users/tommy/Documents/New project/travel-expense/app-react/test-results/audit-dashboard-scroll.png', fullPage: false });
  
  // Navigate through tabs using mobile nav only
  const tabs = ['紀錄', '統計', '設定'];
  for (const tab of tabs) {
    try {
      // Mobile nav is the one with md:hidden
      const locator = page.locator('nav.md\\:hidden button', { hasText: tab });
      await locator.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `/Users/tommy/Documents/New project/travel-expense/app-react/test-results/audit-${tab}.png`, fullPage: false });
      console.log(`Screenshot ${tab} done`);
    } catch(e) { console.log(tab + ' tab error: ' + e.message); }
  }
  
  await browser.close();
  console.log('Screenshots captured');
})();
