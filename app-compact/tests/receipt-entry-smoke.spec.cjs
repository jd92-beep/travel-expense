const { test, expect } = require('@playwright/test');
const ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://127.0.0.1:8903';
const APP = `${ORIGIN}/travel-expense/compact/`;
const STATE = 'boss-japan-tracker';
const otherReceipt = { id: 'osaka-dinner', sourceId: 'osaka-source', tripId: 'entry-osaka', store: '大阪晚餐', date: '2026-11-02', total: 3600, currency: 'JPY', originalCurrency: 'JPY', originalAmount: 3600, exchangeRate: 20, hkdAmount: 180, category: 'food', payment: 'cash', personId: 'p_boss', createdAt: 1 };
const savedCafe = { id: 'tokyo-cafe', sourceId: 'cafe-source', supabaseId: '11111111-1111-4111-8111-111111111111', tripId: 'entry-tokyo', store: '東京咖啡', date: '2026-10-20', total: 680, originalAmount: 680, currency: 'JPY', originalCurrency: 'JPY', exchangeRate: 10, hkdAmount: 68, category: 'food', payment: 'cash', personId: 'p_boss', createdAt: 2 };
test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', timezoneId: 'Asia/Hong_Kong' });

async function seed(page, receipts = [], statePatch = {}) {
  await page.route('**/*', route => new URL(route.request().url()).origin === ORIGIN ? route.continue() : route.abort());
  await page.clock.setFixedTime(new Date('2026-10-20T04:00:00Z'));
  await page.addInitScript(({ receipts, otherReceipt, statePatch }) => {
    window.__disable_supabase_configured = true;
    if (localStorage.getItem('entry-seeded')) return;
    localStorage.setItem('entry-seeded', '1');
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 86400000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({ credentialSession: 'disposable-entry-session', credentialSessionExpiresAt: Date.now() + 86400000 }));
    const trip = (id, name, date, active) => ({ id, name, active, startDate: date, endDate: date, version: 1, itineraryVersion: 1, currencies: ['JPY'], timezones: ['Asia/Tokyo'], itinerary: [{ date, day: 1, currency: 'JPY', region: '東京', timezone: 'Asia/Tokyo', spots: [] }] });
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      autoSync: false, lastTab: 'scan', activeTripId: 'entry-tokyo', tripName: '東京 · 記帳測試', tripCurrency: 'JPY', rate: 20, rateMode: 'fixed',
      rateTable: { JPY: { currency: 'JPY', perHkd: 20, source: 'manual', fetchedAt: Date.now() }, USD: { currency: 'USD', perHkd: 0.128, source: 'manual', fetchedAt: Date.now() } },
      trips: [trip('entry-tokyo', '東京 · 記帳測試', '2026-10-20', true), trip('entry-osaka', '大阪 · 隔離測試', '2026-11-02', false)],
      receipts: [...receipts, otherReceipt],
      ...statePatch,
    }));
  }, { receipts, otherReceipt, statePatch });
  await page.goto(`${APP}#scan`);
  await expect(page.getByRole('button', { name: '手動', exact: true })).toBeVisible();
}
async function manual(page) {
  await page.getByRole('button', { name: '手動', exact: true }).click();
  return page.getByRole('dialog', { name: '手動記一筆' });
}
const saved = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), STATE);
async function openReceipt(page, name) {
  await page.getByLabel('主要分頁').getByRole('button', { name: '紀錄', exact: true }).click();
  await page.locator('.receipt-row').filter({ hasText: name }).first().click();
  return page.getByRole('dialog', { name: '編輯紀錄' });
}

test('grouped amount, correction, reload and trip isolation preserve independent money and identity expectations', async ({ page }, info) => {
  await seed(page);
  await expect(page.getByText('今日未有入帳')).toBeVisible();
  await page.screenshot({ path: info.outputPath('empty.png') });
  const otherBefore = (await saved(page)).receipts.find(r => r.id === otherReceipt.id);
  let editor = await manual(page);
  await editor.getByLabel('店名 / 項目').fill('築地市場午餐');
  await editor.getByLabel('金額', { exact: true }).fill('2,480');
  // 2,480 JPY / 20 JPY per HKD = 124 HKD, before blur.
  await expect(editor.locator('.receipt-rate-current')).toContainText('HK$ 124');
  await page.screenshot({ path: info.outputPath('grouped-amount.png') });
  await editor.getByRole('button', { name: '儲存', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole('region', { name: '今日入帳' }).getByRole('button', { name: /築地市場午餐/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath('success.png') });
  const first = (await saved(page)).receipts.find(r => r.store === '築地市場午餐');
  expect(first).toMatchObject({ total: 2480, originalAmount: 2480, currency: 'JPY', exchangeRate: 20, hkdAmount: 124, tripId: 'entry-tokyo' });
  editor = await openReceipt(page, '築地市場午餐');
  await editor.getByLabel('金額', { exact: true }).fill('1000');
  await expect(editor.locator('.receipt-rate-current')).toContainText('HK$ 50');
  await editor.getByRole('button', { name: '儲存', exact: true }).click();
  await page.reload();
  await expect(page.locator('.receipt-row').filter({ hasText: '築地市場午餐' })).toBeVisible();
  const state = await saved(page);
  expect(state.receipts.filter(r => r.id === first.id)).toHaveLength(1);
  expect(state.receipts.find(r => r.id === first.id)).toMatchObject({ sourceId: first.sourceId, tripId: first.tripId, total: 1000, originalAmount: 1000, exchangeRate: 20, hkdAmount: 50 });
  expect(state.receipts.find(r => r.id === otherReceipt.id)).toEqual(otherBefore);
  await expect(page.locator('.receipt-row').filter({ hasText: '大阪晚餐' })).toHaveCount(0);
  await page.getByRole('button', { name: '切換旅程 (Switch Trip)', exact: true }).click();
  await page.getByRole('button', { name: /大阪 · 隔離測試/ }).click();
  await expect(page.locator('.receipt-row').filter({ hasText: '大阪晚餐' })).toBeVisible();
  await expect(page.locator('.receipt-row').filter({ hasText: '築地市場午餐' })).toHaveCount(0);
});

test('invalid amounts stay editable without writes; missing date focuses recovery; explicit zero remains valid', async ({ page }, info) => {
  await seed(page);
  const editor = await manual(page);
  const amount = editor.getByLabel('金額', { exact: true });
  await expect(amount).toHaveValue('');
  await editor.getByLabel('店名 / 項目').fill('東京咖啡');
  for (const input of ['', 'abc', '-10', '1000000001', '12abc', '1,2', '12.3.4', '1e3']) {
    await amount.fill(input);
    await editor.getByLabel('時間', { exact: true }).fill('12:35');
    await expect(amount).toHaveValue(input);
    await editor.getByRole('button', { name: '儲存', exact: true }).click();
    await expect(amount).toBeFocused();
    await expect(amount).toHaveAttribute('aria-invalid', 'true');
    await expect(editor.getByRole('alert')).toBeVisible();
    expect((await saved(page)).receipts).toHaveLength(1);
  }
  await page.screenshot({ path: info.outputPath('amount-error.png') });
  await editor.getByRole('button', { name: '加入行程', exact: true }).click();
  expect((await saved(page)).trips[0].itinerary[0].spots).toHaveLength(0);
  await amount.fill('680');
  await editor.getByLabel('日期', { exact: true }).fill('');
  await editor.getByRole('button', { name: '儲存', exact: true }).click();
  await expect(editor.getByLabel('日期', { exact: true })).toBeFocused();
  await expect(editor.getByRole('alert')).toHaveText('請選擇記帳日期，再儲存。');
  await page.screenshot({ path: info.outputPath('date-error.png') });
  await expect(amount).toHaveValue('680');
  await expect(editor.getByLabel('時間', { exact: true })).toHaveValue('12:35');
  await editor.getByLabel('日期', { exact: true }).fill('2026-10-20');
  await amount.fill('0');
  await expect(editor.getByRole('alert')).toHaveCount(0);
  await editor.getByRole('button', { name: '儲存', exact: true }).click();
  await expect(editor).toHaveCount(0);
  expect((await saved(page)).receipts.find(r => r.store === '東京咖啡')).toMatchObject({ total: 0, hkdAmount: 0 });
});

test('saved rates survive non-monetary edits, amount correction refreshes HKD, currency changes use the new currency rate', async ({ page }) => {
  await seed(page, [savedCafe]);
  let editor = await openReceipt(page, '東京咖啡');
  await expect(editor.locator('.receipt-rate-current')).toContainText('此單原有匯率');
  await expect(editor.locator('.receipt-rate-current')).toContainText('HK$ 68');
  await editor.getByLabel('備註').fill('保留當時匯率');
  await editor.getByRole('button', { name: '儲存', exact: true }).click();
  expect((await saved(page)).receipts.find(r => r.id === savedCafe.id)).toMatchObject({ exchangeRate: 10, hkdAmount: 68, sourceId: savedCafe.sourceId, supabaseId: savedCafe.supabaseId });
  editor = await openReceipt(page, '東京咖啡');
  await editor.getByLabel('金額', { exact: true }).fill('1000');
  await expect(editor.locator('.receipt-rate-current')).toContainText('HK$ 100');
  await editor.getByRole('button', { name: '儲存', exact: true }).click();
  expect((await saved(page)).receipts.find(r => r.id === savedCafe.id)).toMatchObject({ total: 1000, originalAmount: 1000, exchangeRate: 10, hkdAmount: 100 });
  editor = await openReceipt(page, '東京咖啡');
  await editor.getByLabel('貨幣', { exact: true }).selectOption('USD');
  await editor.getByLabel('金額', { exact: true }).fill('12.34');
  await editor.getByRole('button', { name: '儲存', exact: true }).click();
  // Existing HKD snapshots round to whole dollars: 12.34 / 0.128 = 96.40625 -> 96.
  expect((await saved(page)).receipts.find(r => r.id === savedCafe.id)).toMatchObject({ total: 12.34, originalAmount: 12.34, currency: 'USD', originalCurrency: 'USD', exchangeRate: 0.128, hkdAmount: 96, sourceId: savedCafe.sourceId, tripId: savedCafe.tripId });
});

for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test(`review actions and keyboard focus remain reachable at ${viewport.width}px`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await seed(page);
    const opener = page.getByRole('button', { name: '手動', exact: true });
    const editor = await manual(page);
    await expect(editor.getByLabel('店名 / 項目')).toBeFocused();
    const save = editor.getByRole('button', { name: '儲存', exact: true });
    await expect(save).toBeInViewport({ ratio: 1 });
    const box = await save.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await editor.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
    await editor.getByRole('button', { name: '取消', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(editor.getByRole('button', { name: '關閉記帳視窗' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(editor.getByRole('button', { name: '取消', exact: true })).toBeFocused();
    await editor.getByLabel('備註').fill('可捲動至最後一欄');
    await expect(save).toBeInViewport({ ratio: 1 });
    await expect(editor.getByLabel('備註')).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: info.outputPath(`footer-${viewport.width}.png`) });
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect((await saved(page)).receipts).toHaveLength(1);
  });
}

test('nested delete confirmation returns to editing without closing or writing the receipt', async ({ page }) => {
  await seed(page, [savedCafe]);
  const editor = await openReceipt(page, '東京咖啡');
  await editor.getByRole('button', { name: '刪除', exact: true }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByRole('button', { name: '取消', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(confirm.getByRole('button', { name: '確認刪除' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(editor).toBeVisible();
  expect((await saved(page)).receipts.find(r => r.id === savedCafe.id)).toMatchObject({ total: 680, hkdAmount: 68 });
});

for (const failed of [false, true]) {
  test(`mocked receipt recognition ${failed ? 'failure' : 'success'} reaches a recoverable review without an early write`, async ({ page }, info) => {
    await seed(page);
    let release;
    let requested;
    const requestSeen = new Promise(resolve => { requested = resolve; });
    let calls = 0;
    await page.route('**/openrouter/json', async route => {
      calls += 1;
      requested();
      await new Promise(resolve => { release = resolve; });
      await route.fulfill({ status: failed ? 429 : 200, json: failed
        ? { ok: false, error: 'Daily quota exceeded (disposable fixture)' }
        : { ok: true, data: { store: '築地市場午餐', total: 2480, currency: 'JPY', date: '', payment: '', category: 'food' } } });
    });
    await page.locator('#scan-camera-input').setInputFiles({ name: 'tsukiji-lunch.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64') });
    await requestSeen;
    await expect(page.locator('.scan-reading[role="status"]')).toBeVisible();
    expect((await saved(page)).receipts).toHaveLength(1);
    await page.screenshot({ path: info.outputPath('recognition-loading.png') });
    release();
    const editor = page.getByRole('dialog', { name: '編輯紀錄' });
    await expect(editor).toBeVisible();
    await expect(page.locator('.scan-reading')).toHaveCount(0);
    await expect(editor.getByLabel('日期', { exact: true })).toHaveValue('');
    if (failed) {
      await expect(editor.getByLabel('備註')).toContainText('OCR 未完成');
      await editor.getByLabel('店名 / 項目').fill('築地市場午餐');
      await editor.getByLabel('金額', { exact: true }).fill('2,480');
    } else {
      await expect(editor.getByLabel('店名 / 項目')).toHaveValue('築地市場午餐');
      await expect(editor.getByLabel('金額', { exact: true })).toHaveValue('2480');
    }
    await editor.getByRole('button', { name: '儲存', exact: true }).click();
    await expect(editor.getByLabel('日期', { exact: true })).toBeFocused();
    expect((await saved(page)).receipts).toHaveLength(1);
    await page.screenshot({ path: info.outputPath('recognition-review.png') });
    await editor.getByLabel('日期', { exact: true }).fill('2026-10-20');
    await editor.getByRole('button', { name: '儲存', exact: true }).click();
    await expect(editor).toHaveCount(0);
    expect((await saved(page)).receipts.find(r => r.store === '築地市場午餐')).toMatchObject({ total: 2480, hkdAmount: 124, currency: 'JPY', tripId: 'entry-tokyo' });
    expect(calls).toBe(1);
  });
}

test('pinned and distinct original-currency snapshots survive edits without changing identity', async ({ page }) => {
  await seed(page, [{ ...savedCafe, exchangeRatePinned: true, originalCurrency: 'USD', originalAmount: 4.25 }]);
  let editor = await openReceipt(page, '東京咖啡');
  await editor.getByLabel('金額', { exact: true }).fill('1000');
  await editor.getByRole('button', { name: '儲存', exact: true }).click();
  expect((await saved(page)).receipts.find(r => r.id === savedCafe.id)).toMatchObject({ total: 1000, currency: 'JPY', originalCurrency: 'USD', originalAmount: 4.25, exchangeRate: 10, exchangeRatePinned: true, hkdAmount: 100, sourceId: savedCafe.sourceId, supabaseId: savedCafe.supabaseId });
  editor = await openReceipt(page, '東京咖啡');
  await editor.getByLabel('鎖定匯率（1 HKD = JPY）').fill('25');
  await editor.getByRole('button', { name: '儲存', exact: true }).click();
  expect((await saved(page)).receipts.find(r => r.id === savedCafe.id)).toMatchObject({ total: 1000, originalAmount: 4.25, exchangeRate: 25, exchangeRatePinned: true, hkdAmount: 40 });
});

test('small locked rates keep their exact value; blank and malformed rates cannot silently save a fallback', async ({ page }, info) => {
  await seed(page);
  const editor = await manual(page);
  await editor.getByLabel('店名 / 項目').fill('英國午餐');
  await editor.getByLabel('貨幣', { exact: true }).selectOption('GBP');
  await editor.getByLabel('金額', { exact: true }).fill('95');
  await editor.getByRole('tab', { name: '鎖定匯率', exact: true }).click();
  const rate = editor.getByLabel('鎖定匯率（1 HKD = GBP）');
  for (const invalid of ['', '0', '-1', '12abc', '1,2', '1000001', `0.${'0'.repeat(309)}1`]) {
    await rate.fill(invalid);
    await editor.getByRole('button', { name: '儲存', exact: true }).click();
    await expect(rate).toBeFocused();
    await expect(rate).toHaveValue(invalid);
    await expect(rate).toHaveAttribute('aria-invalid', 'true');
    await expect(editor.locator('.receipt-rate-locked')).toContainText('HK$ —');
    expect((await saved(page)).receipts).toHaveLength(1);
  }
  await page.screenshot({ path: info.outputPath('locked-rate-error.png') });
  await rate.fill('0.095');
  await expect(editor.locator('.receipt-rate-locked')).toContainText('HK$ 1,000');
  await editor.getByRole('button', { name: '儲存', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.reload();
  expect((await saved(page)).receipts.find(r => r.store === '英國午餐')).toMatchObject({ total: 95, exchangeRate: 0.095, exchangeRatePinned: true, hkdAmount: 1000 });
});

for (const selectedId of ['entry-osaka', 'trip_default', 'default']) {
test(`new entries stay in selected trip ${selectedId} when another trip has the same dates`, async ({ page }) => {
  const trip = (id, name, active) => ({ id, name, active, startDate: '2026-10-20', endDate: '2026-10-22', version: 1, currencies: ['JPY'], timezones: ['Asia/Tokyo'], itinerary: [{ date: '2026-10-20', day: 1, currency: 'JPY', spots: [] }] });
  await seed(page, [], {
    activeTripId: selectedId,
    tripName: '大阪 · 隔離測試',
    trips: [trip('entry-tokyo', '東京 · 記帳測試', false), trip(selectedId, '大阪 · 隔離測試', true)],
  });
  const otherBefore = (await saved(page)).receipts.find(r => r.id === otherReceipt.id);
  const editor = await manual(page);
  await editor.getByLabel('店名 / 項目').fill('大阪重疊日期午餐');
  await editor.getByLabel('金額', { exact: true }).fill('100');
  await editor.getByRole('button', { name: '儲存', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await page.reload();
  expect((await saved(page)).receipts.find(r => r.store === '大阪重疊日期午餐')).toMatchObject({ tripId: selectedId, tripLinkSource: 'explicit', total: 100, hkdAmount: 5 });
  expect((await saved(page)).receipts.find(r => r.id === otherReceipt.id)).toEqual(otherBefore);
  await page.getByLabel('主要分頁').getByRole('button', { name: '紀錄', exact: true }).click();
  await page.getByRole('button', { name: '切換旅程 (Switch Trip)', exact: true }).click();
  await page.getByRole('button', { name: /東京 · 記帳測試/ }).click();
  await page.getByLabel('主要分頁').getByRole('button', { name: '紀錄', exact: true }).click();
  await expect(page.locator('.receipt-row').filter({ hasText: '大阪重疊日期午餐' })).toHaveCount(0);
});
}

test('photo preview closes back to the editor and read-only records keep disabled fields outside keyboard navigation', async ({ page }) => {
  const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
  await seed(page, [{ ...savedCafe, ownerId: 'another-member', createdByLabel: '旅伴', photoThumb: photo }]);
  await page.getByLabel('主要分頁').getByRole('button', { name: '紀錄', exact: true }).click();
  await page.locator('.receipt-row').filter({ hasText: '東京咖啡' }).first().click();
  const editor = page.getByRole('dialog', { name: '旅伴紀錄' });
  await expect(editor.getByLabel('金額', { exact: true })).toBeDisabled();
  await expect(editor.getByRole('button', { name: '儲存', exact: true })).toHaveCount(0);
  await editor.locator('.photo-thumb').click();
  await expect(page.locator('img[alt="Receipt"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('img[alt="Receipt"]')).toHaveCount(0);
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: '取消', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(editor.getByRole('button', { name: '關閉記帳視窗' })).toBeFocused();
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Tab');
    expect(await editor.evaluate(e => e.contains(document.activeElement) && !document.activeElement.matches(':disabled'))).toBe(true);
  }
  expect((await saved(page)).receipts.find(r => r.id === savedCafe.id)).toMatchObject({ total: 680, hkdAmount: 68, sourceId: savedCafe.sourceId });
});
