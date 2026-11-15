const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });
const APP_ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://localhost:8903';

// In-place itinerary editing (v0.11.0): Timeline day editor, day swap, and per-spot
// edits must write into trip.itinerary (version bump + sync queue), NOT the legacy
// personal itineraryOverrides layer.

const TRIP_ID = 'it_edit_trip';

async function openTimeline(page) {
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    const day = (date, dayNum, region, spots) => ({ date, day: dayNum, region, timezone: 'Asia/Tokyo', currency: 'JPY', spots });
    const itinerary = [
      day('2026-04-20', 1, '名古屋站', [
        { time: '10:00', name: '早餐咖啡店', type: 'food' },
        { time: '14:00', name: '名古屋城', type: 'sightseeing' },
      ]),
      day('2026-04-21', 2, '白川鄉', [
        { time: '09:00', name: '合掌村', type: 'sightseeing' },
      ]),
    ];
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      schemaVersion: 3,
      lastTab: 'timeline',
      budget: 100000,
      rate: 20.36,
      tripCurrency: 'JPY',
      activeTripId: 'it_edit_trip',
      tripName: '編輯測試',
      tripDateRange: { start: '2026-04-20', end: '2026-04-21' },
      customItinerary: itinerary,
      trips: [{
        id: 'it_edit_trip', name: '編輯測試', destinationSummary: '名古屋', startDate: '2026-04-20', endDate: '2026-04-21',
        homeCurrency: 'HKD', currencies: ['HKD', 'JPY'], timezones: ['Asia/Tokyo'], version: 3, active: true,
        itinerary, createdAt: 1, updatedAt: 1,
      }],
      persons: [{ id: 'p_boss', name: 'Boss', emoji: '👤', color: '#CC2929' }],
      receipts: [],
    }));
  });
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#timeline`);
  await expect(page.locator('.timeline-day').first()).toBeVisible();
  await page.getByRole('button', { name: '顯示全部日子', exact: true }).click();
}

function storedTrip(page) {
  return page.evaluate((tripId) => {
    const s = JSON.parse(localStorage.getItem('boss-japan-tracker') || '{}');
    const trip = (s.trips || []).find((t) => t.id === tripId);
    return {
      version: trip?.version,
      itinerary: (trip?.itinerary || []).map((d) => ({ date: d.date, region: d.region, spots: (d.spots || []).map((sp) => sp.name) })),
      overrides: Object.keys(s.itineraryOverrides || {}).length,
      queuedTripPush: (s.syncQueue || []).some((q) => q.type === 'trip' && q.entityId === tripId),
    };
  }, TRIP_ID);
}

test('day editor remains in the viewport when opened from a scrolled animated timeline', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openTimeline(page);
  await page.getByRole('button', { name: '編輯 Day 2 行程' }).click();
  await expect(page.locator('.timeline-day-editor')).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: info.outputPath('timeline-day-contained.png'), animations: 'disabled' });
});

test('day editor edits region + spot and persists into trip.itinerary', async ({ page }) => {
  await openTimeline(page);
  await page.getByRole('button', { name: '編輯 Day 1 行程' }).click();
  const editor = page.locator('.timeline-day-editor');
  await expect(editor.getByRole('heading', { name: '編輯 Day 1 行程' })).toBeVisible();
  await editor.getByLabel('名稱').first().fill('改名咖啡店');
  await editor.getByRole('button', { name: '新增行程點' }).click();
  await editor.getByLabel('名稱').last().fill('新加嘅景點');
  await editor.getByRole('button', { name: '儲存', exact: true }).click();
  await expect(page.locator('.timeline-title').filter({ hasText: '改名咖啡店' })).toBeVisible();
  await expect(page.locator('.timeline-title').filter({ hasText: '新加嘅景點' })).toBeVisible();
  await expect.poll(() => storedTrip(page)).toMatchObject({
    version: 4,
    queuedTripPush: true,
    overrides: 0,
  });
  const persisted = await storedTrip(page);
  expect(persisted.itinerary[0].spots).toContain('改名咖啡店');
  expect(persisted.itinerary[0].spots).toContain('新加嘅景點');
});

test('swap exchanges day contents but keeps dates', async ({ page }) => {
  await openTimeline(page);
  await page.getByRole('button', { name: 'Day 1 與其他日子對調' }).click();
  await page.locator('.timeline-swap-option').first().click();
  await page.getByRole('button', { name: '確認對調' }).click();
  await expect.poll(async () => (await storedTrip(page)).itinerary).toEqual([
    { date: '2026-04-20', region: '白川鄉', spots: ['合掌村'] },
    { date: '2026-04-21', region: '名古屋站', spots: ['早餐咖啡店', '名古屋城'] },
  ]);
  await expect(page.locator('.timeline-day').first().getByRole('heading', { name: '白川鄉' })).toBeVisible();
});

test('per-spot edit writes trip.itinerary directly and can move spot to another day', async ({ page }) => {
  await openTimeline(page);
  const firstDay = page.locator('.timeline-day').first();
  await firstDay.getByRole('button', { name: '編輯', exact: true }).first().click();
  const sheet = page.locator('.timeline-edit-sheet');
  await sheet.getByLabel('名稱').fill('晏晝先去嘅咖啡店');
  await sheet.getByLabel('移至日子').selectOption('2026-04-21');
  await sheet.getByRole('button', { name: '儲存', exact: true }).click();
  await expect.poll(async () => (await storedTrip(page)).itinerary).toEqual([
    { date: '2026-04-20', region: '名古屋站', spots: ['名古屋城'] },
    { date: '2026-04-21', region: '白川鄉', spots: ['合掌村', '晏晝先去嘅咖啡店'] },
  ]);
  const persisted = await storedTrip(page);
  expect(persisted.overrides).toBe(0);
  expect(persisted.queuedTripPush).toBe(true);
});

test('day editor traps focus and Escape respects unsaved changes', async ({ page }) => {
  await openTimeline(page);
  const opener = page.getByRole('button', { name: '編輯 Day 1 行程', exact: true });
  await opener.click();
  const editor = page.locator('.timeline-day-editor');
  const close = editor.locator('.modal-head button');
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(editor.getByRole('button', { name: '儲存', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await editor.getByLabel('名稱').first().fill('保留未儲存行程');
  let confirms = 0;
  const dismiss = (dialog) => { confirms += 1; void dialog.dismiss(); };
  page.on('dialog', dismiss);
  await page.keyboard.press('Escape');
  await expect(editor).toBeVisible();
  expect(confirms).toBe(1);
  await expect(editor.getByLabel('名稱').first()).toHaveValue('保留未儲存行程');
  page.off('dialog', dismiss);
  page.once('dialog', dialog => void dialog.accept());
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect((await storedTrip(page)).itinerary[0].spots[0]).toBe('早餐咖啡店');
});

test('nested spot detail preserves the day draft and only persists after saving the day', async ({ page }) => {
  await openTimeline(page);
  await page.getByRole('button', { name: '編輯 Day 1 行程' }).click();
  const editor = page.locator('.timeline-day-editor');
  await editor.getByLabel('名稱').first().fill('未儲存日程草稿');
  await editor.getByRole('button', { name: '詳情', exact: true }).first().click();
  const sheet = page.locator('.timeline-edit-sheet');
  await expect(editor).toBeHidden();
  await expect(sheet.locator('.modal-head button')).toBeFocused();
  await sheet.getByLabel('名稱').fill('未儲存景點詳情');
  const dismiss = (dialog) => void dialog.dismiss();
  page.on('dialog', dismiss);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeVisible();
  await expect(editor).toBeAttached();
  await expect(sheet.getByLabel('名稱')).toHaveValue('未儲存景點詳情');
  page.off('dialog', dismiss);
  await sheet.getByRole('button', { name: '儲存', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('名稱').first()).toHaveValue('未儲存景點詳情');
  expect((await storedTrip(page)).itinerary[0].spots[0]).toBe('早餐咖啡店');
  await editor.getByRole('button', { name: '儲存', exact: true }).click();
  await expect.poll(async () => (await storedTrip(page)).itinerary[0].spots[0]).toBe('未儲存景點詳情');
});

test('Escape from day swap confirmation returns to the focused day picker', async ({ page }) => {
  await openTimeline(page);
  const opener = page.getByRole('button', { name: 'Day 1 與其他日子對調' });
  await opener.click();
  const picker = page.locator('.timeline-swap-sheet');
  await picker.locator('.timeline-swap-option').first().click();
  const confirm = page.locator('.timeline-swap-confirm-sheet');
  await expect(picker).toBeHidden();
  await expect(confirm.locator('.modal-head button')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirm).toHaveCount(0);
  await expect(picker).toBeVisible();
  expect(await picker.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(opener).toBeFocused();
});
