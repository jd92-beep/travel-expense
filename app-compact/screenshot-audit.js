import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const outDir = process.env.COMPACT_SCREENSHOT_AUDIT_OUT || '/tmp/compact-screenshot-audit';
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  const baseUrl = 'http://127.0.0.1:8903/travel-expense/compact/';

  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);

  await page.screenshot({ path: path.join(outDir, 'audit-dashboard.png'), fullPage: false });

  // Scroll down to see more
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, 'audit-dashboard-scroll.png'), fullPage: false });

  // Try to navigate to history tab
  try {
    await page.click('nav button:has-text("紀錄")');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outDir, 'audit-history.png'), fullPage: false });
  } catch(e) { console.log('history tab error', e.message); }

  // Try stats tab
  try {
    await page.click('nav button:has-text("統計")');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outDir, 'audit-stats.png'), fullPage: false });
  } catch(e) { console.log('stats tab error', e.message); }

  // Try settings tab
  try {
    await page.click('nav button:has-text("設定")');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outDir, 'audit-settings.png'), fullPage: false });
  } catch(e) { console.log('settings tab error', e.message); }

  await browser.close();
  console.log(`Compact screenshots captured in ${outDir}`);
})();
