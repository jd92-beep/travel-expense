const { test, expect } = require('@playwright/test');

const APP_ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://127.0.0.1:8903';

test('stats: shared-trip member attribution block', async ({ page }) => {
  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'stats',
      autoSync: false,
      activeTripId: 'trip_shared',
      trips: [{
        id: 'trip_shared',
        name: '東京共享之旅',
        startDate: '2026-09-01',
        endDate: '2026-09-05',
        active: true,
        currencies: ['JPY', 'HKD'],
        timezones: ['Asia/Tokyo'],
        itinerary: [
          { id: 'd1', dayId: 'd1', date: '2026-09-02', day: 1, region: '東京', timezone: 'Asia/Tokyo', currency: 'JPY', spots: [] },
        ],
        sharing: { isShared: true, role: 'owner', memberCount: 2, pendingInviteCount: 0, members: [], invites: [] },
        createdAt: 1770000000000,
        updatedAt: 1770000000000,
      }],
      tripDateRange: { start: '2026-09-01', end: '2026-09-05' },
      tripCurrency: 'JPY',
      customItinerary: [
        { id: 'd1', dayId: 'd1', date: '2026-09-02', day: 1, region: '東京', timezone: 'Asia/Tokyo', currency: 'JPY', spots: [] },
      ],
      receipts: [
        {
          id: 'r_mine', sourceId: 'src_mine', tripId: 'trip_shared', store: '我嘅拉麵', total: 1200, currency: 'JPY',
          date: '2026-09-02', category: 'food', payment: 'cash', personId: 'p1', splitMode: 'shared',
          ownerId: 'user_me', createdByLabel: 'You', supabaseId: '11111111-1111-4111-8111-111111111111',
          createdAt: 1770000000000, updatedAt: 1770000000000,
        },
        {
          id: 'r_friend', sourceId: 'src_friend', tripId: 'trip_shared', store: '旅伴嘅壽司', total: 5600, currency: 'JPY',
          date: '2026-09-02', category: 'food', payment: 'credit', personId: 'p2', splitMode: 'shared',
          ownerId: 'user_friend', createdByLabel: 'Natalie', supabaseId: '22222222-2222-4222-8222-222222222222',
          createdAt: 1770000100000, updatedAt: 1770000100000,
        },
        {
          id: 'r_friend2', sourceId: 'src_friend2', tripId: 'trip_shared', store: '旅伴嘅門票', total: 2200, currency: 'JPY',
          date: '2026-09-03', category: 'ticket', payment: 'credit', personId: 'p2', splitMode: 'shared',
          ownerId: 'user_friend', createdByLabel: 'Natalie', supabaseId: '33333333-3333-4333-8333-333333333333',
          createdAt: 1770000200000, updatedAt: 1770000200000,
        },
      ],
      persons: [{ id: 'p1', name: '我', emoji: '🧑', color: '#1E4D6B' }, { id: 'p2', name: 'Natalie', emoji: '👩', color: '#8B4A6B' }],
      peopleByTripId: { trip_shared: [{ id: 'p1', name: '我', emoji: '🧑', color: '#1E4D6B' }, { id: 'p2', name: 'Natalie', emoji: '👩', color: '#8B4A6B' }] },
    }));
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#stats`);

  const payerPanel = page.locator('.payer-panel');
  await expect(payerPanel).toBeVisible();
  const contrib = payerPanel.locator('.member-contrib-block');
  await expect(contrib).toBeVisible();
  await expect(contrib).toContainText('共享成員記帳');
  await expect(contrib).toContainText('Natalie · 2 筆');
  await expect(contrib).toContainText('你 · 1 筆');
  await payerPanel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/stats-member-attribution.png' });
});
