const { test, expect } = require('@playwright/test');
const ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://localhost:8903';
const FX = 'https://open.er-api.com/v6/latest/HKD';
test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

async function openScan(page) {
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 3600000 }));
    localStorage.setItem('boss-japan-tracker:react-currency', JSON.stringify({ base: 'HKD', rates: { JPY: 10, HKD: 1 }, fetchedAt: Date.now(), source: 'old-fixture' }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'scan', rateMode: 'fixed', rate: 20, tripCurrency: 'JPY', receipts: [],
      rateTable: { JPY: { currency: 'JPY', perHkd: 20, source: 'manual', fetchedAt: Date.now() } },
    }));
  });
  await page.goto(`${ORIGIN}/travel-expense/compact/#scan`);
  await expect(page.getByRole('button', { name: /貨幣計數機/ })).toBeVisible();
}
const persisted = page => page.evaluate(() => {
  const state = JSON.parse(localStorage.getItem('boss-japan-tracker'));
  return { mode: state.rateMode, rate: state.rateTable.JPY.perHkd };
});

test('calculator preserves signed results, operator precedence, decimals and keyboard focus', async ({ page }) => {
  await openScan(page);
  const opener = page.getByRole('button', { name: /貨幣計數機/ });
  await opener.click();
  const calc = page.getByRole('dialog', { name: '貨幣計數機' });
  const result = calc.locator('.calc-line.is-result');
  await page.keyboard.type('1-2=');
  await expect(calc.locator('output')).toHaveText('−1');
  await expect(result).toContainText('HK$ -0.05');
  await page.keyboard.type('+3=');
  await expect(calc.locator('output')).toHaveText('2');
  await expect(result).toContainText('HK$ 0.1');
  await calc.getByRole('button', { name: '清除', exact: true }).click();
  await page.keyboard.type('2+3*4=');
  await expect(calc.locator('output')).toHaveText('14');
  await calc.getByRole('button', { name: '清除', exact: true }).click();
  await page.keyboard.type('1.25+0.75=');
  await expect(calc.locator('output')).toHaveText('2');
  await calc.getByRole('button', { name: '清除', exact: true }).click();
  await page.keyboard.type('1/0=');
  await expect(calc.locator('output')).toHaveText('1÷0');
  await expect(result).toContainText('—');
  await calc.getByRole('button', { name: '關閉', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(calc.getByRole('button', { name: '.', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(calc.getByRole('button', { name: '關閉', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(calc).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(await persisted(page)).toEqual({ mode: 'fixed', rate: 20 });
});

test('Scan rate confirmation ignores cancelled live requests and keeps fixed rates on failure', async ({ page }) => {
  await openScan(page);
  let release;
  let requested;
  const requestSeen = new Promise(resolve => { requested = resolve; });
  await page.route(FX, async route => {
    requested();
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ json: { result: 'success', rates: { JPY: 30, HKD: 1 }, provider: 'smoke-fixture' } });
  });
  await page.getByRole('button', { name: '匯率 Exchange Rate', exact: true }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('tab', { name: '即時匯率', exact: true }).click();
  await requestSeen;
  await sheet.getByRole('tab', { name: '固定匯率', exact: true }).click();
  await sheet.getByLabel('固定匯率（1 HKD = JPY）').fill('25');
  await sheet.getByRole('button', { name: '更新', exact: true }).click();
  const responseSeen = page.waitForResponse(FX);
  release();
  await responseSeen;
  await expect(sheet.getByRole('status')).toContainText('已採用固定匯率');
  await expect.poll(() => persisted(page)).toEqual({ mode: 'fixed', rate: 25 });
  await page.unroute(FX);
  await page.route(FX, route => route.fulfill({ status: 503, body: 'offline fixture' }));
  await sheet.getByRole('tab', { name: '即時匯率', exact: true }).click();
  await expect(sheet.getByRole('alert')).toContainText('保留固定匯率');
  expect(await persisted(page)).toEqual({ mode: 'fixed', rate: 25 });
  await page.unroute(FX);
  await page.route(FX, route => route.fulfill({ json: { result: 'success', rates: { JPY: 30, HKD: 1 } } }));
  await sheet.getByRole('tab', { name: '即時匯率', exact: true }).click();
  await expect(sheet.getByRole('status')).toContainText('已轉用即時匯率');
  await expect.poll(() => persisted(page)).toEqual({ mode: 'live', rate: 30 });
  await sheet.getByLabel('金額', { exact: true }).fill('300');
  await expect(sheet.locator('.scan-fx-result strong')).toHaveText('10 HKD');
});

test('closing a rate sheet invalidates its pending confirmation', async ({ page }) => {
  await openScan(page);
  let release;
  let requested;
  const seen = new Promise(resolve => { requested = resolve; });
  await page.route(FX, async route => {
    requested();
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ json: { result: 'success', rates: { JPY: 99, HKD: 1 } } });
  });
  await page.getByRole('button', { name: '匯率 Exchange Rate', exact: true }).click();
  await page.getByRole('dialog').getByRole('tab', { name: '即時匯率', exact: true }).click();
  await seen;
  await page.getByRole('dialog').getByRole('button', { name: '關閉', exact: true }).click();
  const response = page.waitForResponse(FX);
  release();
  await response;
  await page.getByRole('button', { name: '匯率 Exchange Rate', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveAccessibleName('固定匯率');
  expect(await persisted(page)).toEqual({ mode: 'fixed', rate: 20 });
});
