const { test, expect } = require('@playwright/test');
const { openTab, expectCurrentTab } = require('./helpers/journey-navigation.cjs');
const fs = require('node:fs/promises');
const APP_ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://localhost:8903';
test.use({ viewport: { width: 375, height: 667 }, reducedMotion: 'reduce' });

async function install(page, theme = 'auto', viewer = false) {
  await page.route('**/secrets.local.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.DEV_SECRETS = {};' }));
  await page.addInitScript(({ theme, viewer }) => {
    window.__disable_supabase_configured = true;
    if (sessionStorage.getItem('journey-fixture')) return;
    sessionStorage.setItem('journey-fixture', '1');
    localStorage.clear();
    const itinerary = [
      { date: '2026-12-03', day: 1, region: '名古屋市區', timezone: 'Asia/Tokyo', currency: 'JPY', lodging: { name: 'Example Garden Stay', address: 'Nagoya Station', checkIn: '15:00', checkOut: '11:00', bookingRef: 'EXAMPLE-STAY' }, spots: [
        { id: 'spot-flight', name: '示例航班 香港 → 名古屋', type: 'flight', time: '08:30', timeEnd: '11:50', timezone: 'Asia/Tokyo', address: 'Chubu Centrair', note: '示例資料' },
        { id: 'spot-lunch', name: '午餐', type: 'food', time: '13:30', address: 'Nagoya Station' },
      ] },
      { date: '2026-12-04', day: 2, region: '京都', timezone: 'Asia/Tokyo', currency: 'JPY', spots: [{ id: 'spot-temple', name: '清水寺', type: 'sightseeing', time: '10:00' }] },
    ];
    const trip = { id: 'journey-one', name: '名古屋・京都慢遊', destinationSummary: '名古屋 / 京都', startDate: '2026-12-03', endDate: '2026-12-04', budget: 50000, homeCurrency: 'HKD', currencies: ['JPY','HKD'], timezones: ['Asia/Tokyo'], itinerary, version: 1, active: true, createdAt: 1, updatedAt: 1, ...(viewer ? { sharing: { role: 'viewer' } } : {}) };
    const other = { ...trip, id: 'journey-two', name: '第二趟旅程', active: false };
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now()+31536000000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({ schemaVersion: 4, autoSync: false, themePreference: theme, activeTripId: trip.id, trips: [trip, other], customItinerary: itinerary, tripDateRange: { start: trip.startDate, end: trip.endDate }, budget: 50000, rate: 20.5, tripCurrency: 'JPY', persons: [{ id: 'p-one', name: 'Boss', emoji: 'B', color: '#286774' }], receipts: [{ id: 'receipt-one', sourceId: 'fixture-source-one', tripId: trip.id, store: 'Example Lunch', total: 2000, date: '2026-12-03', time: '13:30', category: 'food', payment: 'cash', personId: 'p-one', createdAt: 1 }] }));
  }, { theme, viewer });
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#timeline`);
  await expect(page.getByLabel('行程工具', { exact: true })).toBeVisible();
}
async function planner(page, name) {
  if (['航班', '住宿', '清單', '小遊戲'].includes(name)) {
    await page.getByRole('button', { name: '旅程工具', exact: true }).click();
    await page.getByRole('dialog', { name: '旅程工具面板' }).getByRole('button', { name, exact: true }).click();
  } else await page.getByLabel('行程工具', { exact: true }).getByRole('button', { name: name === '日曆' ? '多日' : name === '路線' ? '地圖' : name, exact: true }).click();
}
async function readDownload(download) { return fs.readFile(await download.path(), 'utf8'); }

test('mobile navigation, day selection, route and calendar download use the active itinerary', async ({ page }) => {
  await install(page);
  await openTab(page, '主頁');
  await expectCurrentTab(page, 'dashboard');
  const first = page.locator('.journey-next-stops li').first();
  const firstBox = await first.boundingBox();
  const dockBox = await page.locator('.journey-mobile-nav').boundingBox();
  expect(firstBox.y + firstBox.height).toBeLessThanOrEqual(dockBox.y + 2);
  for (const [name, id] of [['紀錄','history'],['記帳','scan'],['統計','stats'],['設定','settings'],['行程','timeline']]) {
    await openTab(page, name); await expectCurrentTab(page, id);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByLabel('選擇行程日子').getByRole('button', { name: /Day 2/ }).click();
  await expect(page.locator('.timeline-day')).toHaveCount(1);
  await expect(page.locator('.timeline-day')).toContainText('清水寺');
  await planner(page, '日曆');
  await expect(page.locator('.journey-calendar-day')).toHaveCount(2);
  await page.getByRole('button', { name: '旅程工具', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出日曆', exact: true }).click();
  const calendar = await readDownload(await downloadPromise);
  expect(calendar).toContain('BEGIN:VCALENDAR');
  expect(calendar).toContain('DTSTART:20261202T233000Z');
  expect(calendar).toContain('SUMMARY:清水寺');
  await page.getByRole('button', { name: '關閉旅程工具', exact: true }).click();
  await planner(page, '路線');
  await expect(page.getByLabel('當日路線預覽')).toContainText('清水寺');
  const map = page.getByRole('link', { name: /在地圖開啟/ });
  await expect(map).toHaveAttribute('href', /google|maps/);
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByLabel('選擇行程日子').getByRole('button', { name: /Day 1/ }).click();
  await expect(page.getByLabel('當日路線預覽')).toContainText('示例航班');
  await expect(page.getByRole('link', { name: /全日路線/ })).toHaveAttribute('href', /maps\/dir/);
});

test('booking create, edit and reload preserve existing itinerary and lodging details', async ({ page }) => {
  await install(page);
  await planner(page, '航班');
  await page.getByRole('button', { name: '新增航班', exact: true }).click();
  const form = page.getByRole('form', { name: '航班資料' });
  await form.getByLabel('航班名稱及路線').fill('返程示例航班');
  await form.getByLabel('日期', { exact: true }).fill('2026-12-04');
  await form.getByLabel('起飛時間').fill('17:00');
  await form.getByLabel('抵達時間').fill('19:00');
  await form.getByLabel('訂位編號').fill('EXAMPLE-RETURN');
  await form.getByRole('button', { name: '儲存預訂' }).click();
  await expect(page.locator('.journey-flight-ticket')).toHaveCount(2);
  await planner(page, '住宿');
  await page.locator('.journey-stay-card').getByRole('button', { name: '編輯', exact: true }).click();
  await page.getByLabel('住宿名稱', { exact: true }).fill('Updated Garden Stay');
  await page.getByRole('button', { name: '儲存預訂' }).click();
  await expect(page.locator('.journey-stay-card')).toContainText('Updated Garden Stay');
  await page.reload();
  await planner(page, '航班');
  await expect(page.locator('.journey-flight-ticket')).toHaveCount(2);
  await expect(page.locator('.journey-flight-ticket').filter({ hasText: '返程示例航班' })).toContainText('EXAMPLE-RETURN');
  await planner(page, '住宿');
  await expect(page.locator('.journey-stay-card')).toContainText('Updated Garden Stay');
  await expect(page.locator('.journey-stay-card')).toContainText('EXAMPLE-STAY');
});

test('checklist survives reload, supports undo and safe imports, and is isolated by trip', async ({ page }) => {
  await install(page);
  await planner(page, '清單');
  await page.getByLabel('護照及旅遊證件', { exact: true }).check();
  await page.getByLabel('新增清單項目').fill('測試相機');
  await page.getByRole('button', { name: '加入清單', exact: true }).click();
  await page.getByRole('button', { name: '編輯 測試相機', exact: true }).click();
  const edit = page.getByRole('form', { name: '編輯清單項目' });
  await edit.getByLabel('備註').fill('兩顆電池');
  await edit.getByRole('button', { name: '儲存項目' }).click();
  await page.getByRole('button', { name: '刪除 測試相機', exact: true }).click();
  await page.getByRole('button', { name: '復原', exact: true }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出清單', exact: true }).click();
  const exported = JSON.parse(await readDownload(await dl));
  expect(exported.items).toHaveLength(10);
  expect(exported.items.find(i => i.label === '測試相機').note).toBe('兩顆電池');
  await page.getByLabel('匯入清單檔案').setInputFiles({ name: 'checklist.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await expect(page.getByRole('status')).toContainText('已加入 0 項');
  await page.reload(); await planner(page, '清單');
  await expect(page.getByLabel('護照及旅遊證件', { exact: true })).toBeChecked();
  await expect(page.locator('.journey-check-row').filter({ hasText: '測試相機' })).toContainText('兩顆電池');
  await page.locator('.journey-trip-trigger').click();
  await page.locator('.journey-trip-menu').getByRole('button', { name: /第二趟旅程/ }).click();
  await planner(page, '清單');
  await expect(page.locator('.journey-check-row').filter({ hasText: '測試相機' })).toHaveCount(0);
  await expect(page.getByLabel('護照及旅遊證件', { exact: true })).not.toBeChecked();
  await page.getByLabel('匯入清單檔案').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":2,"items":[]}') });
  await expect(page.getByRole('alert')).toContainText('清單格式不正確');
  await expect(page.locator('.journey-check-row')).toHaveCount(9);
});

test('a pending checklist import preserves edits made while the file is loading', async ({page}) => {
  await install(page);
  await planner(page, '清單');
  await page.evaluate(() => {
    const readText = File.prototype.text;
    File.prototype.text = function () {
      return new Promise(resolve => { window.finishReading = () => resolve(readText.call(this)); });
    };
  });
  const item = { id:'imported-camera', group:'行李', label:'備用相機', note:'', done:false };
  await page.getByLabel('匯入清單檔案').setInputFiles({
    name:'items.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify({version:1,items:[item]})),
  });
  const passport = page.getByRole('checkbox', {name:'護照及旅遊證件',exact:true});
  await passport.check();
  await page.evaluate(() => window.finishReading());
  await expect(page.getByRole('checkbox', {name:'備用相機',exact:true})).toBeVisible();
  await expect(passport).toBeChecked();
});

test('offline game reveals cards and resets its score', async ({ page }) => {
  await install(page); await planner(page, '小遊戲');
  await page.getByRole('button', { name: '翻開第 1 張卡', exact: true }).click();
  await expect(page.locator('.journey-game-card.is-open')).toHaveCount(1);
  await page.getByRole('button', { name: '翻開第 2 張卡', exact: true }).click();
  await expect(page.locator('.journey-game-score')).toContainText('1 步');
  await page.getByRole('button', { name: '重新開始', exact: true }).click();
  await expect(page.locator('.journey-game-score')).toContainText('0 步');
  await expect(page.locator('.journey-game-card.is-open')).toHaveCount(0);
});

test('dark palette retains readable controls and a non-overlapping search field', async ({ page }) => {
  await install(page, 'night_ledger');
  await openTab(page, '紀錄');
  const input = page.locator('.search-field input');
  await input.fill('Example');
  const inputBox = await input.boundingBox();
  const iconBox = await page.locator('.search-field > svg').boundingBox();
  expect(inputBox.x).toBeGreaterThanOrEqual(iconBox.x + iconBox.width);
  expect(Math.abs(inputBox.y + inputBox.height / 2 - iconBox.y - iconBox.height / 2)).toBeLessThanOrEqual(2);
  const contrast = async (selector) => page.locator(selector).first().evaluate(el => {
    const c = getComputedStyle(el);
    const rgb = value => value.match(/[\d.]+/g).slice(0,3).map(Number);
    const lum = value => rgb(value).map(n => { n/=255; return n<=.04045?n/12.92:((n+.055)/1.055)**2.4; }).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0);
    let bg = c.backgroundColor, node = el;
    while (bg === 'rgba(0, 0, 0, 0)' && node.parentElement) { node=node.parentElement; bg=getComputedStyle(node).backgroundColor; }
    const a=lum(c.color), b=lum(bg); return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  });
  await openTab(page, '統計');
  expect(await contrast('.preview-budget-total button')).toBeGreaterThanOrEqual(4.5);
  await openTab(page, '設定');
  expect(await contrast('.settings-tab .pill')).toBeGreaterThanOrEqual(4.5);
});


test('manual regional palettes retain their colors on the new structure', async ({ page }) => {
  await install(page, 'europe_rail');
  await expect(page.locator('html')).toHaveAttribute('data-theme-source', 'manual');
  const palette = await page.evaluate(() => { const s = getComputedStyle(document.documentElement); return { accent: s.getPropertyValue('--journey-accent').trim().toLowerCase(), ground: s.getPropertyValue('--journey-ground').trim().toLowerCase() }; });
  expect(palette).toEqual({ accent: '#a8323a', ground: '#eef1ec' });
});

test('More tools traps keyboard focus and shared viewers cannot add bookings', async ({ page }) => {
  await install(page, 'auto', true);
  await planner(page, '航班');
  await expect(page.getByRole('button', { name: '新增航班', exact: true })).toHaveCount(0);
  await planner(page, '住宿');
  await expect(page.getByRole('button', { name: '新增住宿', exact: true })).toHaveCount(0);
  await expect(page.locator('.journey-stay-card').getByRole('button', { name: '編輯', exact: true })).toHaveCount(0);
  const more = page.getByRole('button', { name: '更多', exact: true });
  await more.click();
  const dialog = page.getByRole('dialog', { name: '更多旅程工具' });
  const first = dialog.getByRole('button', { name: '關閉更多工具' });
  await expect(first).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '建立新旅程', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(more).toBeFocused();
});

test('checklist remains separate when the authenticated account changes', async ({ page }) => {
  await install(page); await planner(page, '清單');
  await page.getByLabel('護照及旅遊證件', { exact: true }).check();
  await page.evaluate(() => {
    const id = '22222222-2222-4222-8222-222222222222';
    const snapshot = localStorage.getItem('boss-japan-tracker');
    localStorage.setItem(`boss-japan-tracker:state:supabase:${id}`, snapshot);
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify({ access_token: 'fixture-access-token', refresh_token: 'fixture-refresh-token', token_type: 'bearer', expires_at: Math.floor(Date.now()/1000)+3600, user: { id, email: 'fixture@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: new Date().toISOString() } }));
  });
  await page.reload(); await planner(page, '清單');
  await expect(page.getByLabel('護照及旅遊證件', { exact: true })).not.toBeChecked();
  await page.getByLabel('新增清單項目').fill('帳號專屬項目');
  await page.getByRole('button', { name: '加入清單', exact: true }).click();
  const separation = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter(key => key.startsWith('travel-ledger:checklist:v1:'));
    return { local: JSON.parse(localStorage.getItem(keys.find(key => key.includes(':local:')))), account: JSON.parse(localStorage.getItem(keys.find(key => key.includes('supabase%3A')))) };
  });
  expect(separation.local.items.find(i=>i.label === '護照及旅遊證件').done).toBe(true);
  expect(separation.local.items.some(i=>i.label === '帳號專屬項目')).toBe(false);
  expect(separation.account.items.find(i=>i.label === '護照及旅遊證件').done).toBe(false);
  expect(separation.account.items.some(i=>i.label === '帳號專屬項目')).toBe(true);
});

test('checklist storage failure stays visible and does not pretend the edit was saved', async ({ page }) => {
  await install(page); await planner(page, '清單');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('travel-ledger:checklist:')) throw new DOMException('Fixture quota failure', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.getByLabel('護照及旅遊證件', { exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('剛才的修改未有儲存');
  await expect(page.getByLabel('護照及旅遊證件', { exact: true })).not.toBeChecked();
  await expect(page.getByRole('button', { name: '匯出清單', exact: true })).toBeEnabled();
});

test('selected itinerary and calendar activities share the map, navigation and day context', async ({ page }) => {
  await install(page);
  await page.getByRole('button', { name: '在行程地圖查看 午餐', exact: true }).click();
  const map = page.getByLabel('當日路線預覽');
  await expect(map.getByRole('heading', { name: '午餐', exact: true })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await map.getByLabel('導航方式').selectOption('walking');
  const nav = map.getByRole('link', { name: '導航到這裡', exact: true });
  const url = new URL(await nav.getAttribute('href'));
  expect(url.searchParams.get('destination')).toBe('Nagoya Station');
  expect(url.searchParams.get('travelmode')).toBe('walking');
  await page.route('https://maps.google.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Disposable map fixture</p>' }));
  await map.getByRole('button', { name: '載入 Google 地圖預覽', exact: false }).click();
  await expect(page.locator('iframe')).toHaveAttribute('title', '午餐 Google 地圖預覽');
  await planner(page, '日曆');
  await page.getByRole('button', { name: /2026-12-04 10:00 清水寺/ }).click();
  await expect(map.getByRole('heading', { name: '清水寺', exact: true })).toBeVisible();
  await expect(page.locator('iframe')).toHaveAttribute('title', '清水寺 Google 地圖預覽');
  await planner(page, '日程');
  await expect(page.locator('.timeline-day')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '在行程地圖查看 清水寺', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('tools stay above the dock, trap focus and download only the active trip', async ({ page }) => {
  await install(page);
  const handle = page.getByRole('button', { name: '旅程工具', exact: true });
  const handleBox = await handle.boundingBox(), dock = await page.locator('.journey-mobile-nav').boundingBox();
  expect(handleBox.y).toBeGreaterThan(0);
  expect(handleBox.y + handleBox.height).toBeLessThanOrEqual(dock.y);
  await handle.click();
  const sheet = page.getByRole('dialog', { name: '旅程工具面板' });
  const close = sheet.getByRole('button', { name: '關閉旅程工具', exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(sheet.getByRole('button', { name: /Google Maps/ })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  await expect(sheet).toContainText('自動同步已關閉');
  const file = page.waitForEvent('download');
  await sheet.getByRole('button', { name: /匯出旅程備份/ }).click();
  const backup = JSON.parse(await readDownload(await file));
  expect(backup.trips).toHaveLength(1);
  expect(backup.trips[0].id).toBe('journey-one');
  expect(backup.receipts).toHaveLength(1);
  expect(JSON.stringify(backup)).not.toContain('credentialSession');
  await page.keyboard.press('Escape'); await expect(sheet).toHaveCount(0); await expect(handle).toBeFocused();
  await handle.click();
  await page.getByRole('dialog', { name: '旅程工具面板' }).getByRole('button', { name: /匯入行程/ }).click();
  await expectCurrentTab(page, 'settings');
  await expect(page.locator('[aria-controls="settings-trip-update-panel"]')).toHaveAttribute('aria-expanded', 'true');
});

test('calendar shows activities immediately and handles overlaps and untimed plans', async ({ page }) => {
  await install(page);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('boss-japan-tracker'));
    const trip = state.trips.find(t => t.id === state.activeTripId);
    trip.itinerary[0].spots.push(
      { id: 'overlap', name: '重疊測試', type: 'other', time: '09:00', timeEnd: '09:05' },
      { id: 'untimed', name: '待安排測試', type: 'other', time: '' },
      { id: 'overnight', name: '跨夜測試', type: 'transport', time: '23:30', timeEnd: '00:15' },
    );
    state.customItinerary = trip.itinerary; localStorage.setItem('boss-japan-tracker', JSON.stringify(state));
  });
  await page.reload(); await planner(page, '日曆');
  await expect(page.getByRole('button', { name: /2026-12-03 08:30 示例航班/ })).toBeInViewport();
  const blocks = page.locator('.journey-calendar-day').first().locator('.planner-time-block');
  const a = await blocks.nth(0).boundingBox(), b = await blocks.nth(1).boundingBox();
  expect(a.x + a.width).toBeLessThanOrEqual(b.x);
  await expect(page.locator('.planner-untimed').first()).toContainText('待安排測試');
  await expect(page.getByRole('button', { name: /跨夜測試，45 分鐘/ })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('checklist search and pending filter preserve saved items', async ({ page }) => {
  await install(page); await planner(page, '清單');
  await page.getByLabel('護照及旅遊證件', { exact: true }).check();
  await page.getByLabel('只看未完成', { exact: true }).check();
  await expect(page.getByLabel('護照及旅遊證件', { exact: true })).toHaveCount(0);
  await page.getByLabel('搜尋用品', { exact: true }).fill('充電器');
  await expect(page.locator('.journey-check-row')).toHaveCount(1);
  await expect(page.locator('.journey-check-group')).toHaveCount(1);
  await page.getByLabel('搜尋用品').fill('no such item');
  await page.getByRole('button', {name: '顯示全部用品'}).click();
  await expect(page.getByLabel('只看未完成')).not.toBeChecked();
  await page.getByLabel('搜尋用品', { exact: true }).fill('');
  await page.getByLabel('只看未完成', { exact: true }).uncheck();
  await expect(page.getByLabel('護照及旅遊證件', { exact: true })).toBeChecked();
});

test('Scan retains capture inputs and reveals the selected mode with reduced motion', async ({ page }) => {
  await install(page); await openTab(page, '記帳');
  await expect(page.locator('#scan-camera-input')).toHaveAttribute('capture', 'environment');
  for (const [button, input] of [['語音', '語音文字'], ['Email', 'Email 文字']]) {
    await page.getByRole('button', { name: button, exact: true }).click();
    const field = page.getByRole('textbox', { name: input });
    await expect(field).toBeFocused();
    await expect(field).toBeInViewport();
  }
  await page.getByRole('button', { name: '手動', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('multi-day calendar exposes the entire trip and pages through the last activity', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await install(page);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('boss-japan-tracker'));
    const trip = state.trips.find(t => t.id === state.activeTripId);
    trip.endDate = '2026-12-10';
    trip.itinerary.push({ day: 8, date: trip.endDate, region: '大阪', spots: [
      { id: 'return', name: '回程航班', time: '09:00', timeEnd: '11:00', type: 'flight' },
    ] });
    state.customItinerary = trip.itinerary;
    state.tripDateRange.end = trip.endDate;
    localStorage.setItem('boss-japan-tracker', JSON.stringify(state));
  });
  await page.reload();
  await planner(page, '日曆');
  const grid = page.locator('.planner-grid-scroll');
  const dayHeaders = grid.locator('article header');
  const lastDay = page.getByLabel('選擇行程日子').getByRole('button', { name: /Day 8 / });
  const previous = page.getByRole('button', { name: '上一組日子' });
  const next = page.getByRole('button', { name: '下一組日子' });
  await expect(lastDay).toBeInViewport({ ratio: 1 });
  await expect(dayHeaders).toHaveCount(8);
  await expect(dayHeaders.nth(2)).toBeInViewport({ ratio: .98 });
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(dayHeaders.nth(3)).toBeInViewport({ ratio: .98 });
  await expect(dayHeaders.nth(3)).toContainText('未有活動');
  await page.getByLabel('選擇行程日子').getByRole('button', { name: /Day 1 / }).click();
  await expect(previous).toBeDisabled();
  await next.click();
  await next.click();
  await expect(next).toBeDisabled();
  await expect(dayHeaders.last()).toBeInViewport({ ratio: .98 });
  await previous.click();
  await expect(dayHeaders.last()).not.toBeInViewport();
  await lastDay.click();
  const flight = grid.getByRole('button', { name: /09:00 回程航班/ });
  await expect(flight).toBeInViewport({ ratio: .98 });
  await flight.click();
  await expect(page.getByLabel('當日路線預覽').getByRole('heading', { name: '回程航班' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
