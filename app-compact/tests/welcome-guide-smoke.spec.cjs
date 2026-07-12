const { test, expect } = require('@playwright/test');

const APP_ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://localhost:8903';

test.use({ viewport: { width: 390, height: 844 } });

const userId = '33333333-3333-4333-8333-333333333333';
const scopedStorageKey = `boss-japan-tracker:state:supabase:${userId}`;

test('New Supabase account guide captures trip members and split ratios', async ({ page }) => {
  await page.route('https://test-travel-expense.supabase.co/**', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'offline onboarding smoke' }),
    });
  });

  await page.addInitScript(({ userId }) => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    indexedDB.deleteDatabase('travel-expense-react');
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify({
      access_token: 'fake-guide-access-token',
      refresh_token: 'fake-guide-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'new-guide-user@example.com',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }));
  }, { userId });

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/`);

  await expect(page.getByText('旅伴與分帳比例')).toBeVisible();
  await expect(page.getByRole('button', { name: '增加人數' })).toBeVisible();
  await expect(page.getByLabel('你嘅顯示名稱')).toBeVisible();
  await expect(page.getByLabel('First-run personalization')).toBeVisible();

  await page.getByRole('button', { name: '增加人數' }).click();
  await page.getByRole('button', { name: '增加人數' }).click();
  await expect(page.getByLabel('旅伴 3 名稱')).toBeVisible();
  await page.getByLabel('你嘅顯示名稱').fill('User 1');
  await page.getByLabel('旅伴 2 名稱').fill('May');
  await page.getByLabel('旅伴 3 名稱').fill('Sam');
  await page.getByLabel('旅行風格').selectOption('food');
  await page.getByLabel('Home city').fill('Hong Kong');
  await page.getByLabel('天氣偏好').selectOption('rain');
  await page.getByLabel('偏好貨幣').selectOption('KRW');

  const ratioInputs = page.locator('.welcome-guide-modal input[type="number"]');
  await ratioInputs.nth(0).fill('50');
  await ratioInputs.nth(1).fill('30');
  await expect(ratioInputs.nth(2)).toHaveValue('20');

  await page.getByRole('button', { name: /手動輸入旅行細節/ }).click();
  await page.getByLabel('旅行名稱').fill('Guide Smoke Trip');
  await page.getByLabel('目的地國家/城市').fill('Seoul Korea');
  await page.getByRole('button', { name: /建立並進入 App/ }).click();

  await expect(page.getByLabel('旅程總覽')).toBeVisible();
  await expect.poll(async () => page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, scopedStorageKey), { timeout: 10000 }).toMatchObject({
    persons: [
      expect.objectContaining({ id: 'p_boss', name: 'User 1' }),
      expect.objectContaining({ id: 'p_trip_2', name: 'May' }),
      expect.objectContaining({ id: 'p_trip_3', name: 'Sam' }),
    ],
    shareRatios: {
      p_boss: 50,
      p_trip_2: 30,
      p_trip_3: 20,
    },
    tripCurrency: 'KRW',
    trips: [expect.objectContaining({
      name: 'Guide Smoke Trip',
      currencies: expect.arrayContaining(['HKD', 'KRW']),
      intelligence: expect.objectContaining({
        primaryCurrency: 'KRW',
        tripStyle: 'food',
        homeCity: 'Hong Kong',
        weatherPreference: 'rain',
        source: 'manual',
      }),
    })],
  });

  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), scopedStorageKey);
  expect(stored.trips.map((trip) => trip.id)).not.toContain('trip_2026_04_nagoya');
  expect(stored.trips.map((trip) => trip.id)).not.toContain('trip_default');
  expect(stored.receipts || []).toHaveLength(0);

});
