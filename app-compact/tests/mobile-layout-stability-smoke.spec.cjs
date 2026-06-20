const { test, expect } = require('@playwright/test');

const longReceiptName = 'Very Long Mobile Width Receipt Name - Shinkansen Platform Bento And Souvenir Bundle';
const longSpotName = 'Very Long Itinerary Stop Name - Nagoya Station Underground Shopping Street With Extra Details';

async function seedMobileStressState(page, lastTab = 'history') {
  await page.addInitScript(({ receiptName, spotName, tab }) => {
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify({
      access_token: 'fake-access-token',
      refresh_token: 'fake-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: '11111111-1111-4111-8111-111111111111',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'vc06456@gmail.com',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'mobile-layout-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));

    const stateData = {
      lastTab: tab,
      autoSync: false,
      tripDateRange: { start: '2026-05-08', end: '2026-05-08' },
      customItinerary: [{
        date: '2026-05-08',
        day: 1,
        region: 'Mobile Stability City With Long Region Name',
        timezone: 'Asia/Tokyo',
        spots: [
          {
            time: '09:30',
            name: spotName,
            type: 'transport',
            address: 'A very long station address that should wrap instead of making the timeline wider than the viewport',
            note: 'Repeated mobile tab switching should not create horizontal overflow or visual instability.',
          },
          { time: '13:00', name: 'Lunch Stop', type: 'food' },
        ],
      }],
      receipts: [
        {
          id: 'mobile_layout_long_receipt',
          sourceId: 'email_mobile_layout_' + 'x'.repeat(64),
          store: receiptName,
          note: 'This note contains averyveryverylongunbrokenwordthatmustnotpushthecardpasttheviewport',
          total: 98765,
          date: '2026-05-08',
          time: '10:45',
          category: 'transport',
          payment: 'credit',
          personId: 'p_boss',
          splitMode: 'shared',
          createdAt: 1,
        },
        {
          id: 'mobile_layout_pending',
          sourceId: 'pending_mobile_layout_' + 'y'.repeat(64),
          store: '⏳ Pending Imported Email Receipt With Long Name',
          total: 1234,
          date: '2026-05-08',
          category: 'food',
          payment: 'cash',
          personId: 'p_boss',
          splitMode: 'shared',
          createdAt: 2,
        },
      ],
    };

    localStorage.setItem('boss-japan-tracker', JSON.stringify(stateData));
    localStorage.setItem('boss-japan-tracker:state:supabase:11111111-1111-4111-8111-111111111111', JSON.stringify(stateData));
  }, { receiptName: longReceiptName, spotName: longSpotName, tab: lastTab });
}

async function assertNoHorizontalOverflow(page) {
  const metrics = await page.evaluate(() => {
    const viewport = window.innerWidth;
    const doc = document.documentElement;
    const body = document.body;
    const selectors = [
      '.app-shell',
      '.mobile-viewport',
      '.history-screen',
      '.timeline-screen',
      '.history-command',
      '.timeline-command',
      '.receipt-row',
      '.timeline-day',
      '.timeline-event',
      '.compact-pwa-readiness',
      '.pwa-chip',
      '.app-floating-dock-mobile',
      '.tabbar',
      '.bottom-dock',
    ];
    const overflowing = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)).map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        selector,
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      };
    })).filter((item) => item.right > viewport + 1 || item.left < -1);
    return {
      viewport,
      docScrollWidth: doc.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      overflowing,
    };
  });

  expect(metrics.docScrollWidth, JSON.stringify(metrics, null, 2)).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.bodyScrollWidth, JSON.stringify(metrics, null, 2)).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.overflowing, JSON.stringify(metrics.overflowing, null, 2)).toHaveLength(0);
}

test('Mobile Records cards and Itinerary timeline stay within the viewport during tab switching', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 360, height: 780 },
    reducedMotion: 'reduce',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/125 Mobile Safari/537.36',
  });
  const page = await context.newPage();
  const consoleProblems = [];
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) consoleProblems.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (error) => consoleProblems.push(`pageerror: ${error.message}`));
  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/notion/request', async (route) => {
    const payload = route.request().postDataJSON();
    const data = String(payload.path || '').endsWith('/query')
      ? { results: [], has_more: false }
      : { properties: {} };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data }),
    });
  });
  await page.route(/https:\/\/[^/]+\.supabase\.co\/.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await seedMobileStressState(page);
  await page.goto('http://localhost:8903/travel-expense/compact/#history');
  await expect(page.locator('.compact-mobile-title-art')).toHaveAttribute('data-title', '紀錄中心');
  await expect(page.locator('.receipt-row').filter({ hasText: longReceiptName })).toBeVisible();
  await assertNoHorizontalOverflow(page);

  const nav = page.getByLabel('主要分頁');
  for (let i = 0; i < 3; i += 1) {
    await nav.getByRole('button', { name: '行程', exact: true }).click();
    await expect(page.locator('.timeline-event').filter({ hasText: longSpotName })).toBeVisible();
    await page.waitForTimeout(120);
    await assertNoHorizontalOverflow(page);

    await nav.getByRole('button', { name: '紀錄', exact: true }).click();
    await expect(page.locator('.compact-mobile-title-art')).toHaveAttribute('data-title', '紀錄中心');
    await page.waitForTimeout(120);
    await assertNoHorizontalOverflow(page);
  }

  expect(consoleProblems.filter((entry) => (
    !entry.includes('NO_COLOR') &&
    !entry.includes('Reduced Motion enabled')
  ))).toHaveLength(0);
  await context.close();
});
