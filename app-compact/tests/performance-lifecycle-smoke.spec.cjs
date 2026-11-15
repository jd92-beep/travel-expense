const { openTab } = require('./helpers/journey-navigation.cjs');
const { test, expect } = require('@playwright/test');

const ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://127.0.0.1:8903';
const APP = `${ORIGIN}/travel-expense/compact/`;
const EMAIL_DRAFT = '東京咖啡 680 JPY；午餐 2480 JPY';
const START = new Date('2026-10-24T04:00:00Z');

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });

async function prepare(page) {
  await page.route('**/*', route => new URL(route.request().url()).origin === ORIGIN ? route.continue() : route.abort());
  await page.clock.setFixedTime(START);
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 86_400_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      autoSync: false, rateMode: 'fixed', rate: 20, tripCurrency: 'JPY', receipts: [],
    }));
  });
}

test('changing effects tier keeps a focused expense draft and open calculator intact', async ({ page }, info) => {
  await prepare(page);
  await page.goto(`${APP}#scan`);
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  const draft = page.getByRole('textbox', { name: 'Email 文字', exact: true });
  await draft.fill(EMAIL_DRAFT);
  await expect(page.locator('html')).toHaveClass(/fx-balanced/);

  // Changing an OS preference must not reset the ongoing task, in either direction.
  for (const reducedMotion of ['reduce', 'no-preference']) {
    await page.emulateMedia({ reducedMotion });
    await expect(page.locator('html')).toHaveClass(reducedMotion === 'reduce' ? /fx-lite/ : /fx-balanced/);
    await expect(draft).toHaveValue(EMAIL_DRAFT);
    await expect(draft).toBeFocused();
  }
  await page.getByRole('button', { name: /貨幣計數機/ }).click();
  const calculator = page.getByRole('dialog', { name: '貨幣計數機' });
  await page.keyboard.type('680+2480=');
  await expect(calculator.locator('output')).toHaveText('3160');
  await expect(calculator.locator('.calc-line.is-result')).toContainText('HK$ 158');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(calculator).toBeVisible();
  await expect(calculator.locator('output')).toHaveText('3160');
  await page.keyboard.press('Escape');
  await expect(draft).toHaveValue(EMAIL_DRAFT);
  await draft.evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await expect(draft).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath('mobile-draft-survives-motion-change.png') });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('html')).toHaveClass(/fx-full/);
  await expect(draft).toHaveValue(EMAIL_DRAFT);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(draft).toHaveValue(EMAIL_DRAFT);
  await openTab(page, '設定');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-active-tab', 'settings');
  await expect(page.getByRole('heading', { name: '設定控制中心', exact: true })).toBeVisible();
  await openTab(page, '記帳');
  await expect(page.getByRole('button', { name: 'Email', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('boss-japan-tracker')).receipts)).toEqual([]);
});

test('advisory deployment discovery has one request budget across boot, focus and visibility events', async ({ page }) => {
  await prepare(page);
  let checks = 0;
  let latestScript = '';
  await page.route('**/*__compact_deploy_check*', route => {
    checks += 1;
    return latestScript
      ? route.fulfill({ contentType: 'text/html', body: `<script type="module" src="${latestScript}"></script>` })
      : route.continue();
  });
  await page.goto(`${APP}#scan`);
  await expect(page.getByRole('button', { name: '手動', exact: true })).toBeVisible();
  await expect.poll(() => checks).toBe(1);
  for (let i = 0; i < 5; i += 1) {
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
  }
  await page.clock.setFixedTime(new Date(START.getTime() + 299_999));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect(checks).toBe(1);

  await page.clock.setFixedTime(new Date(START.getTime() + 300_000));
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(checks).toBe(1);
  await page.context().setOffline(true);
  await page.evaluate(() => {
    delete document.hidden;
    window.dispatchEvent(new Event('focus'));
  });
  expect(checks).toBe(1);
  await page.context().setOffline(false);
  latestScript = `${APP}assets/disposable-new-release.js`;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => checks).toBe(2);
  await openTab(page, '設定');
  await expect(page.getByLabel('Compact release notes')).toBeVisible();
});

for (const width of [390, 1280]) {
  test(`deep Settings navigation opens visible Home content immediately with reduced motion at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await prepare(page);
    await page.addInitScript(() => {
      // A reduced-motion visit must not wait for visibility-observer delivery or its timeout.
      window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      window.__firstDashboardPaint = [];
      new MutationObserver(() => {
        if (window.__firstDashboardPaint.length) return;
        const reveals = [...document.querySelectorAll('.dashboard-reveal')];
        if (reveals.length) window.__firstDashboardPaint = reveals.map(node => getComputedStyle(node).opacity);
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto(`${APP}#settings`);
    await page.locator('[aria-controls="settings-theme-panel"]').click();
    const radio = page.locator('input[name="app-theme"][value="korea_dancheong"]');
    await page.locator('label.theme-option').filter({ has: radio }).click();
    await expect(radio).toBeChecked();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);

    await openTab(page, '主頁');
    await expect(page.locator('.journey-hero-heading')).toBeInViewport();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    const firstPaint = await page.evaluate(() => window.__firstDashboardPaint);
    expect(firstPaint.length).toBeGreaterThan(0);
    expect(firstPaint.every(opacity => opacity === '1'), JSON.stringify(firstPaint)).toBe(true);
    await page.screenshot({ path: info.outputPath(`home-after-deep-settings-${width}.png`) });
  });
}
