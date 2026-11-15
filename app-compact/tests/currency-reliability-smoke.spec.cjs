const { test, expect } = require('@playwright/test');
const ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://localhost:8903';
const FX = 'https://open.er-api.com/v6/latest/HKD';
const CACHE = 'boss-japan-tracker:react-currency';
const published = Math.floor(Date.now() / 1000) - 1800;
const response = (patch = {}) => ({ result: 'success', base_code: 'HKD', rates: { JPY: 30, USD: 0.125, HKD: 1 }, time_last_update_unix: published, time_next_update_unix: published + 86400, ...patch });

test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
async function openScan(page, overrides = {}) {
  await page.addInitScript(overrides => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 3600000 }));
    localStorage.setItem('boss-japan-tracker:react-currency', JSON.stringify({ base: 'HKD', rates: { JPY: 10, HKD: 1 }, fetchedAt: Date.now() - 90 * 86400000, source: 'ninety-days-old-fixture' }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'scan', rateMode: 'fixed', rate: 20, tripCurrency: 'JPY', autoSync: false,
      receipts: [{ id: 'historical-fx', sourceId: 'historical-fx', store: 'Fixture ramen', total: 2480, currency: 'JPY', exchangeRate: 20, hkdAmount: 124, date: '2026-10-24', category: 'food', payment: 'cash', personId: 'p_boss' }],
      rateTable: { JPY: { currency: 'JPY', perHkd: 20, source: 'manual', fetchedAt: Date.now() } }, ...overrides,
    }));
  }, overrides);
  await page.goto(`${ORIGIN}/travel-expense/compact/#scan`);
  await expect(page.getByRole('button', { name: /貨幣計數機/ })).toBeVisible();
}
async function saved(page) {
  return page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('boss-japan-tracker'));
    const receipt = state.receipts.find(r => r.id === 'historical-fx');
    return { mode: state.rateMode, rate: state.rate, table: state.rateTable.JPY.perHkd, receipt: { id: receipt.id, total: receipt.total, hkd: receipt.hkdAmount, rate: receipt.exchangeRate } };
  });
}

test('stale calculator cache is not live: loading, current source timestamps, independent conversion and references', async ({ page }, testInfo) => {
  await openScan(page);
  const before = await saved(page);
  let release;
  let requests = 0;
  await page.route(FX, async route => {
    requests++;
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ json: response() });
  });
  await page.getByRole('button', { name: /貨幣計數機/ }).click();
  const calc = page.getByRole('dialog', { name: '貨幣計數機' });
  await calc.getByRole('tab', { name: '即時匯率', exact: true }).click();
  await expect(calc.getByRole('status').filter({ hasText: '取得參考匯率' })).toBeVisible();
  await page.keyboard.type('300=');
  await expect(calc.locator('.calc-line.is-result strong')).toHaveText('—');
  await expect.poll(() => requests).toBe(1);
  release();
  await expect(calc.locator('.calc-line.is-result strong')).toHaveText('HK$ 10'); // 300 JPY / 30 JPY per HKD
  await expect(calc.locator('.rate-reference')).toContainText('每日參考匯率，非即時成交價');
  await expect(calc.locator('time').first()).toHaveAttribute('datetime', new Date(published * 1000).toISOString());
  await calc.locator('summary').click();
  await expect(calc.getByRole('link', { name: 'Visa 官方換算器' })).toHaveAttribute('href', 'https://www.visa.co.uk/support/consumer/travel-support/exchange-rate-calculator.html');
  await expect(calc.getByRole('link', { name: 'Mastercard 官方換算器' })).toBeVisible();
  await expect(calc.getByRole('link', { name: '歐洲央行參考匯率' })).toBeVisible();
  await calc.locator('summary').click();
  await calc.locator('.calc-modal').evaluate(el => { el.scrollTop = 0; });
  expect(await saved(page)).toEqual(before); // calculator rate never changes accounting / historical records
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('calculator-after-390.png'), fullPage: true });
});

test('parallel rate refreshes share one request and retain publication metadata', async ({ page }) => {
  await openScan(page);
  let requests = 0;
  await page.route(FX, async route => {
    requests++;
    await new Promise(resolve => setTimeout(resolve, 100));
    await route.fulfill({ json: response() });
  });
  const result = await page.evaluate(async () => {
    const c = await import('/travel-expense/compact/src/lib/currency.ts');
    const [a, b] = await Promise.all([c.fetchLiveCurrencySnapshot(), c.fetchLiveCurrencySnapshot()]);
    return { a, b, cached: c.loadCurrencySnapshot() };
  });
  expect(requests).toBe(1);
  expect(result.a).toEqual(result.b);
  expect(result.cached).toMatchObject({ updatedAt: published * 1000, nextUpdateAt: (published + 86400) * 1000, source: 'https://www.exchangerate-api.com' });
});

test('a hung rate request times out, preserves accounting and can be retried', async ({ page }) => {
  await openScan(page);
  const before = await saved(page);
  await page.route(FX, () => {});
  await page.getByRole('button', { name: /貨幣計數機/ }).click();
  const calc = page.getByRole('dialog');
  await calc.getByRole('tab', { name: '即時匯率', exact: true }).click();
  await expect(calc.getByRole('alert')).toContainText('逾時', { timeout: 12000 });
  await expect(calc.getByRole('button', { name: '更新即時匯率' })).toBeEnabled();
  await expect(calc.locator('.calc-line.is-result strong')).toHaveText('—');
  expect(await saved(page)).toEqual(before);
  await page.unroute(FX);
  await page.route(FX, route => route.fulfill({ json: response() }));
  await calc.getByRole('button', { name: '更新即時匯率' }).click();
  await expect(calc.getByRole('alert')).toHaveCount(0);
  await page.keyboard.type('300=');
  await expect(calc.locator('.calc-line.is-result strong')).toHaveText('HK$ 10');
  expect(await saved(page)).toEqual(before);
});

test('invalid or expired provider responses cannot replace confirmed fixed rate', async ({ page }) => {
  await openScan(page);
  const before = await saved(page);
  let payload = response({ base_code: 'USD' });
  await page.route(FX, route => route.fulfill({ json: payload }));
  await page.getByRole('button', { name: '匯率 Exchange Rate', exact: true }).click();
  const sheet = page.getByRole('dialog');
  for (const bad of [response({ base_code: 'USD' }), response({ rates: { JPY: -30, HKD: 1 } }), response({ time_last_update_unix: published - 10 * 86400 })]) {
    payload = bad;
    await sheet.getByRole('tab', { name: '即時匯率', exact: true }).click();
    await expect(sheet.getByRole('alert')).toContainText('保留固定匯率');
    expect(await saved(page)).toEqual(before);
  }
  payload = response();
  await sheet.getByRole('tab', { name: '即時匯率', exact: true }).click();
  await expect(sheet.getByRole('status')).toContainText('已轉用即時匯率');
  await expect.poll(async () => (await saved(page)).table).toBe(30);
  expect((await saved(page)).receipt).toEqual(before.receipt);
});

for (const width of [320, 390]) test(`FX sheet respects grouping, empty, zero and invalid input at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 844 });
  await openScan(page);
  const before = await saved(page);
  await page.getByRole('button', { name: '匯率 Exchange Rate', exact: true }).click();
  const sheet = page.getByRole('dialog');
  const amount = sheet.getByLabel('金額', { exact: true });
  const result = sheet.locator('.scan-fx-result strong');
  await amount.fill('2,480');
  await expect(result).toHaveText('124 HKD'); // receipt amount / confirmed 20, no provider required
  await amount.fill('24,80');
  await expect(amount).toHaveAttribute('aria-invalid', 'true');
  await expect(result).toHaveText('請修正金額');
  await expect(sheet.getByRole('alert')).toContainText('請輸入完整數值');
  await amount.fill('');
  await expect(result).toHaveText('輸入金額以計算');
  await amount.fill('0');
  await expect(result).toHaveText('0 HKD');
  await amount.fill('2,480');
  await sheet.locator('summary').click();
  await expect(sheet.getByRole('link', { name: 'Visa 官方換算器' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await saved(page)).toEqual(before);
  await sheet.locator('summary').click();
  await sheet.locator('.scan-fx-modal').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath(`rate-sheet-after-${width}.png`), fullPage: true });
});

test('cross-currency fixed choices preserve JPY fallback, decimal money and rates below previous floor', async ({ page }) => {
  await openScan(page);
  const result = await page.evaluate(async () => {
    const currency = await import('/travel-expense/compact/src/lib/currency.ts');
    const mode = await import('/travel-expense/compact/src/lib/rateMode.ts');
    const base = { rateMode: 'fixed', rate: 20, rateTable: {} };
    const changed = { ...base, ...mode.fixedRatePatch(base, 'USD', 0.125) };
    const low = { ...base, rateTable: { GBP: { perHkd: 0.005 } } };
    return {
      yenHkd: currency.amountToHkd(2480, 'JPY', changed), usdHkd: currency.amountToHkd(12.5, 'USD', changed), legacyYen: changed.rate,
      hkdFormat: currency.formatCurrencyAmount(12.75, 'HKD'), twdFormat: currency.formatCurrencyAmount(12.75, 'TWD'),
      jpyFormat: currency.formatCurrencyAmount(2480, 'JPY'), tinyRateHkd: currency.amountToHkd(5, 'GBP', low), tinyRateBack: currency.hkdToCurrency(1000, 'GBP', low),
      fixedTinyValid: mode.isValidFixedRate(0.005), badFixed: [0, -1, NaN, Infinity, 1e-310].map(mode.isValidFixedRate),
    };
  });
  expect(result).toEqual({ yenHkd: 124, usdHkd: 100, legacyYen: 20, hkdFormat: 'HK$ 12.75', twdFormat: 'NT$ 12.75', jpyFormat: '¥ 2,480', tinyRateHkd: 1000, tinyRateBack: 5, fixedTinyValid: true, badFixed: [false, false, false, false, false] });
});


test('malformed legacy retrieval dates cannot crash rate references', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(FX, route => route.abort());
  await openScan(page, { rateMode: 'live', rateTable: { JPY: { currency: 'JPY', perHkd: 20, source: 'legacy', fetchedAt: 9e15 } } });
  await page.getByRole('button', { name: '匯率 Exchange Rate', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.locator('summary').click();
  await expect(sheet.locator('.rate-reference')).toContainText('尚未取得最新資料');
  await expect(sheet.getByRole('link', { name: 'Visa 官方換算器' })).toBeVisible();
  expect(errors).toEqual([]);
});


test('fractional fixed rate stays accurate in Scan summaries and conversion', async ({ page }) => {
  await openScan(page, {
    activeTripId: 'london-fixture', tripCurrency: 'GBP',
    trips: [{ id: 'london-fixture', name: 'London autumn', destinationSummary: 'London, UK', startDate: '2026-10-24', endDate: '2026-10-27', currencies: ['HKD', 'GBP'], timezones: ['Europe/London'], active: true }],
    rateTable: { JPY: { currency: 'JPY', perHkd: 20, source: 'manual', fetchedAt: Date.now() }, GBP: { currency: 'GBP', perHkd: 0.095, source: 'manual', fetchedAt: Date.now() } },
  });
  await expect(page.getByRole('button', { name: '匯率 Exchange Rate', exact: true })).toContainText('0.095 GBP');
  await expect(page.getByRole('button', { name: /貨幣計數機/ })).toContainText('固定 0.095');
  await page.getByRole('button', { name: '匯率 Exchange Rate', exact: true }).click();
  await page.getByRole('dialog').getByLabel('金額', { exact: true }).fill('95');
  await expect(page.getByRole('dialog').locator('.scan-fx-result strong')).toHaveText('1,000 HKD'); // 95 / 0.095
});
