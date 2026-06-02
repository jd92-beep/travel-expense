const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

const seededState = {
  schemaVersion: 3,
  lastTab: 'dashboard',
  budget: 1500000,
  rate: 170,
  activeTripId: 'trip_seoul_editorial',
  tripName: 'Seoul Editorial Test',
  tripDateRange: { start: '2026-06-10', end: '2026-06-14' },
  customItinerary: [{ date: '2026-06-10', day: 1, region: 'Seoul', spots: [{ time: '11:00', name: 'Seoul Cafe', type: 'food' }] }],
  trips: [{
    id: 'trip_seoul_editorial',
    name: 'Seoul Editorial Test',
    destinationSummary: 'Seoul Korea',
    startDate: '2026-06-10',
    endDate: '2026-06-14',
    homeCurrency: 'HKD',
    currencies: ['HKD', 'KRW'],
    timezones: ['Asia/Seoul'],
    version: 1,
    active: true,
    itinerary: [{ date: '2026-06-10', day: 1, region: 'Seoul', spots: [{ time: '11:00', name: 'Seoul Cafe', type: 'food' }] }],
    intelligence: {
      countryCode: 'KR',
      countryName: 'Korea',
      primaryCurrency: 'KRW',
      themeKey: 'korea_editorial',
      locale: 'ko-KR',
      timezone: 'Asia/Seoul',
      weatherRegion: 'Seoul',
      confidence: 'high',
      source: 'ai',
      updatedAt: 1,
    },
    createdAt: 1,
    updatedAt: 1,
  }],
  receipts: [
    { id: 'seoul_food', store: 'Seoul Cafe', total: 12000, date: '2026-06-10', category: 'food', payment: 'cash', personId: 'p_boss', splitMode: 'shared', createdAt: 1 },
  ],
};

test('Trip intelligence drives the shared destination theme contract', async ({ page }) => {
  await page.addInitScript((payload) => {
    window.__disable_supabase_configured = true;
    Object.defineProperty(window, 'indexedDB', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify(payload));
  }, seededState);

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.getByLabel('旅程總覽')).toBeVisible();

  const theme = await page.evaluate(() => ({
    tripTheme: document.documentElement.dataset.tripTheme,
    tripCountry: document.documentElement.dataset.tripCountry,
    label: document.documentElement.style.getPropertyValue('--trip-theme-label').trim(),
    red: document.documentElement.style.getPropertyValue('--red').trim(),
    blue: document.documentElement.style.getPropertyValue('--blue').trim(),
    bodyFont: document.documentElement.style.getPropertyValue('--trip-font-body').trim(),
  }));

  expect(theme).toMatchObject({
    tripTheme: 'korea_editorial',
    tripCountry: 'KR',
    label: '"Korea Editorial"',
    red: '#D85B73',
    blue: '#526DAE',
  });
  expect(theme.bodyFont).toContain('Noto Sans KR');
});
