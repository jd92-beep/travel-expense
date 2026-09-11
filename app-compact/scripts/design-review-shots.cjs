// Design review screenshot capture: desktop rail + mobile dock, all tabs.
// Usage: COMPACT_SHOTS_OUT=<dir> node scripts/design-review-shots.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const outDir = process.env.COMPACT_SHOTS_OUT || path.join(__dirname, '..', '.impeccable', 'review');
fs.mkdirSync(outDir, { recursive: true });

const baseUrl = process.env.COMPACT_SHOTS_URL || 'http://127.0.0.1:8903/travel-expense/compact/';
const tabs = ['主頁', '紀錄', '行程', '記帳', '天氣', '統計', '設定'];
const tabIds = ['dashboard', 'history', 'timeline', 'scan', 'weather', 'stats', 'settings'];

async function seedDeviceTrust(page) {
  // Block external network (fake Supabase host would hang DNS); the app must
  // render in offline/safe mode for deterministic captures.
  await page.context().route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    return route.abort();
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  // Avoid stale service-worker caches between capture runs.
  await page.evaluate(async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      regs?.forEach((r) => r.unregister());
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch { /* ignore */ }
  });
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 365;
  await page.evaluate((exp) => {
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp }));
  }, exp);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(4000);
  // Neuter the app's smooth jump-to-today so captures stay pinned to the top.
  await page.evaluate(() => {
    window.scrollTo = () => {};
    Element.prototype.scrollIntoView = () => {};
  });
}

async function prepareTab(page, label, railSelector) {
  await page.locator(`${railSelector} button`, { hasText: label }).first().click();
  // Wait for the lazy tab screen to render, then pin scroll to top instantly
  // (tabs auto-jump to "today" with a smooth scroll which blanks captures).
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    document.querySelectorAll('.weather-screen, .timeline-screen').forEach((el) => { el.scrollTop = 0; });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
  await page.waitForTimeout(250);
}

async function shoot(name, page) {
  await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
  console.log(`captured ${name}.png`);
}

(async () => {
  const browser = await chromium.launch();

  // Desktop pass
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const dpage = await desktop.newPage();
  await seedDeviceTrust(dpage);
  for (let i = 0; i < tabs.length; i++) {
    try {
      await prepareTab(dpage, tabs[i], '.compact-desktop-rail');
      await shoot(`desktop-${tabIds[i]}`, dpage);
    } catch (e) { console.log(`desktop ${tabs[i]} error: ${e.message}`); }
  }
  await desktop.close();

  // Mobile pass
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mpage = await mobile.newPage();
  await seedDeviceTrust(mpage);
  for (let i = 0; i < tabs.length; i++) {
    try {
      await prepareTab(mpage, tabs[i], '.fixed-tab-bar');
      await shoot(`mobile-${tabIds[i]}`, mpage);
    } catch (e) { console.log(`mobile ${tabs[i]} error: ${e.message}`); }
  }
  await mobile.close();

  await browser.close();
  console.log(`done -> ${outDir}`);
})();
