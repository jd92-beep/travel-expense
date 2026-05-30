const { test, expect } = require('@playwright/test');



const tabs = [
  ['主頁', 'Total Budget'],
  ['記帳', '掃描收據'],
  ['行程', '行程時間線'],
  ['紀錄', '紀錄中心'],
  ['天氣', '天氣預報'],
  ['統計', '分帳統計中心'],
  ['設定', '設定控制中心'],
];

async function installTrust(page, lastTab = 'dashboard') {
  await page.addInitScript((tab) => {
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'nav-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({ lastTab: tab, receipts: [], autoSync: false }));
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
  }, lastTab);
}

for (const [name, viewport] of [
  ['mobile 390x844', { width: 390, height: 844 }],
  ['mobile 360x780', { width: 360, height: 780 }],
  ['desktop 1280x900', { width: 1280, height: 900 }],
]) {
  test(`Final navigation smoke on ${name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await installTrust(page);
    await page.goto('http://localhost:8902/travel-expense/react/');
    if (viewport.width <= 390) {
      await expect(page.locator('.hyperframe-layer')).toHaveCount(2);
      await expect(page.locator('canvas')).toHaveCount(0);
    }
    const nav = page.getByLabel('主要分頁');
    for (const [tabLabel, expectedText] of tabs) {
      await nav.getByRole('button', { name: tabLabel, exact: true }).click();
      await expect(page.getByText(expectedText).first()).toBeVisible();
    }
    await context.close();
  });
}

test('Final lock gate smoke without trusted device', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
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
  });
  await page.goto('http://localhost:8902/travel-expense/react/');
  await expect(page.getByText(/本機安全防護鎖|先解鎖再使用/).first()).toBeVisible();
});

test('Sync error indicator is clickable and retries sync', async ({ page }) => {
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
  });
  await page.goto('http://localhost:8902/travel-expense/react/');
  await page.evaluate(async () => {
    const clearIndexedSnapshot = () => new Promise((resolve) => {
      const req = indexedDB.open('travel-expense-react', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
      };
      req.onerror = () => resolve(undefined);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('state', 'readwrite');
        tx.objectStore('state').delete('app-state');
        tx.oncomplete = () => {
          db.close();
          resolve(undefined);
        };
        tx.onerror = () => {
          db.close();
          resolve(undefined);
        };
      };
    });
    await clearIndexedSnapshot();
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'dashboard',
      receipts: [],
      autoSync: false,
      globalSyncStatus: 'error',
      syncError: 'manual smoke failure',
      syncQueue: [],
    }));
  });

  await page.reload();
  const retry = page.getByRole('button', { name: /Sync error/ });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(retry).toBeHidden();
  await expect(page.locator('.sync-status-indicator')).not.toContainText('Sync error');
});

test('Boot currency and sync effects run once without noisy mobile 403s', async ({ page }) => {
  const consoleEvents = [];
  const notionPaths = [];
  page.on('console', (msg) => consoleEvents.push(`${msg.type()}:${msg.text()}`));
  page.on('response', (response) => {
    if (response.status() >= 400) consoleEvents.push(`response:${response.status()}:${response.url()}`);
  });
  await page.route('**/secrets.local.js', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS={};',
  }));
  await page.route('https://open.er-api.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ result: 'success', provider: 'qa-rate', rates: { HKD: 1, JPY: 20.5, USD: 0.13 } }),
  }));
  await page.route('**/notion/request', async (route) => {
    const payload = route.request().postDataJSON();
    notionPaths.push(`${payload.method || 'GET'} ${payload.path}`);
    if (payload.method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { properties: {} } }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { results: [], has_more: false } }) });
  });
  await page.addInitScript(() => {
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
      credentialSession: 'qa-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({ lastTab: 'dashboard', receipts: [], autoSync: true }));
    localStorage.setItem('boss-japan-tracker:state:supabase:11111111-1111-4111-8111-111111111111', JSON.stringify({
      lastTab: 'dashboard',
      receipts: [],
      autoSync: true,
      personalNotionConnected: true,
      notionDb: 'fake-notion-db-id',
      trips: [{
        id: 'trip_active',
        supabaseId: 'fake-supabase-trip-id',
        name: '名古屋 2026 📓',
        destinationSummary: '名古屋',
        startDate: '2026-05-08',
        endDate: '2026-05-15',
        budget: 50000,
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Tokyo'],
        active: true,
        notionDb: 'fake-notion-db-id',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }]
    }));
  });
  await page.goto('http://localhost:8902/travel-expense/react/');
  await expect(page.getByLabel('旅程總覽')).toBeVisible();
  await expect.poll(() => notionPaths.filter((path) => path.includes('/query')).length).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(1200);
  expect(notionPaths.filter((path) => path.includes('/query')).length).toBeGreaterThanOrEqual(2);
  expect(consoleEvents.filter((event) => event.includes('Auto-updated live exchange rate'))).toHaveLength(1);
  expect(consoleEvents.filter((event) => event.includes('corsproxy.io') || event.includes('403'))).toHaveLength(0);
});
