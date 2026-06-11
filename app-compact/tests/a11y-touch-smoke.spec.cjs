const { test, expect } = require('@playwright/test');

const APP_URL = 'http://localhost:8903/travel-expense/compact/';

async function seedCompactA11yState(page) {
  await page.route('**/secrets.local.js', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/notion/request', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, data: { results: [], has_more: false } }),
  }));
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'a11y-touch-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'dashboard',
      autoSync: false,
      budget: 50_000,
      tripDateRange: { start: '2026-05-08', end: '2026-05-13' },
      trips: [{
        id: 'a11y_trip',
        name: '名古屋 2026',
        destinationSummary: '名古屋 / 京都',
        startDate: '2026-05-08',
        endDate: '2026-05-13',
        budget: 50_000,
        active: true,
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Tokyo'],
      }],
      activeTripId: 'a11y_trip',
      customItinerary: [{
        date: '2026-05-08',
        day: 1,
        region: '名古屋市區',
        timezone: 'Asia/Tokyo',
        spots: [
          { time: '09:30', name: '名古屋站', type: 'transport', address: 'Nagoya Station' },
          { time: '12:30', name: '午餐', type: 'food' },
        ],
      }],
      receipts: [{
        id: 'a11y_receipt',
        sourceId: 'a11y_receipt_source',
        store: 'Nagoya Cafe',
        total: 1200,
        date: '2026-05-08',
        category: 'food',
        payment: 'cash',
        personId: 'p_boss',
        splitMode: 'shared',
        createdAt: Date.now(),
      }],
      schemaVersion: 3,
    }));
  });
}

async function expectTouchTarget(locator, label, minSize = 44) {
  await expect(locator, label).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} should have a bounding box`).toBeTruthy();
  expect(Math.round(box.width), `${label} width`).toBeGreaterThanOrEqual(minSize);
  expect(Math.round(box.height), `${label} height`).toBeGreaterThanOrEqual(minSize);
}

async function visibleButtonNames(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('button')).filter((button) => {
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }).map((button) => ({
    text: (button.getAttribute('aria-label') || button.textContent || '').replace(/\s+/g, ' ').trim(),
    disabled: button.disabled,
  })));
}

test('Compact main controls keep accessible names, touch targets, reduced motion, and keyboard focus', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/125 Mobile Safari/537.36',
  });
  const page = await context.newPage();
  const consoleProblems = [];
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type()) && !msg.text().includes('Reduced Motion enabled')) {
      consoleProblems.push(`${msg.type()}: ${msg.text()}`);
    }
  });
  page.on('pageerror', (error) => consoleProblems.push(`pageerror: ${error.message}`));

  await seedCompactA11yState(page);
  await page.goto(APP_URL);

  await expect(page.getByLabel('Compact travel readiness')).toHaveCount(0);
  await expectTouchTarget(page.getByRole('button', { name: '更多操作' }), 'mobile header action', 40);
  await expectTouchTarget(page.getByRole('button', { name: 'Add Expense' }), 'add expense primary action');
  await expectTouchTarget(page.getByRole('button', { name: /查看完整行程/ }), 'view full itinerary action');
  await expectTouchTarget(page.getByRole('button', { name: 'View all' }), 'view all records action');

  const nav = page.locator('.app-floating-dock-mobile[aria-label="主要分頁"]');
  for (const name of ['主頁', '紀錄', '行程', '記帳', '天氣', '統計', '設定']) {
    await expectTouchTarget(nav.getByRole('button', { name, exact: true }), `bottom dock ${name}`);
  }

  await nav.getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.getByLabel('Compact travel readiness')).toContainText('Motion · reduced');

  await nav.getByRole('button', { name: '記帳', exact: true }).click();
  await expect(page.getByText('掃描收據').first()).toBeVisible();
  await expectTouchTarget(page.getByRole('button', { name: /相機/ }).first(), 'scan camera card', 80);
  await expectTouchTarget(page.getByRole('button', { name: /相簿/ }).first(), 'scan gallery card', 80);
  for (const name of ['手動', '語音', 'Email', '匯率']) {
    await expectTouchTarget(page.getByRole('button', { name, exact: true }), `scan utility ${name}`, 64);
  }

  await nav.getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.locator('.compact-mobile-title-art')).toHaveAttribute('data-title', '設定控制中心');
  const quickControls = page.locator('.settings-preview-controls button');
  await expect(quickControls).toHaveCount(3);
  for (let i = 0; i < 3; i += 1) {
    await expectTouchTarget(quickControls.nth(i), `settings quick control ${i + 1}`, 56);
  }

  const names = await visibleButtonNames(page);
  const unnamedEnabled = names.filter((item) => !item.disabled && !item.text);
  expect(unnamedEnabled, JSON.stringify(names, null, 2)).toHaveLength(0);

  const focusedNames = [];
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Tab');
    focusedNames.push(await page.evaluate(() => {
      const active = document.activeElement;
      return active ? (active.getAttribute('aria-label') || active.textContent || active.tagName).replace(/\s+/g, ' ').trim() : '';
    }));
  }
  expect(new Set(focusedNames.filter(Boolean)).size, focusedNames.join(' | ')).toBeGreaterThanOrEqual(3);
  expect(consoleProblems).toHaveLength(0);
  await context.close();
});
