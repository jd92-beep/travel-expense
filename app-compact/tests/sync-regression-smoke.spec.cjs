const { test, expect } = require('@playwright/test');

const APP_ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://127.0.0.1:8903';
const userId = '44444444-4444-4444-8444-444444444444';
const scopedStorageKey = `boss-japan-tracker:state:supabase:${userId}`;

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

function sessionPayload() {
  return {
    access_token: 'sync-regression-access-token',
    refresh_token: 'sync-regression-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'sync-regression@example.com',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

test('failed guide trip cloud save queues one recoverable trip without the generic sync banner', async ({ page }) => {
  await page.route('https://test-travel-expense.supabase.co/auth/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: sessionPayload().user }) });
  });
  await page.route('https://test-travel-expense.supabase.co/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    const method = route.request().method();
    if (table === 'profiles') {
      await route.fulfill({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (table === 'trips' && method === 'POST') {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ code: '42501', message: 'new row violates row-level security policy' }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.addInitScript(({ session, key }) => {
    localStorage.clear();
    indexedDB.deleteDatabase('travel-expense-react');
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify(session));
    localStorage.setItem(key, JSON.stringify({ autoSync: false }));
  }, { session: sessionPayload(), key: scopedStorageKey });

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/`);
  await expect(page.getByText('旅伴與分帳比例')).toBeVisible();
  await page.getByRole('button', { name: /手動輸入旅行細節/ }).click();
  await page.getByLabel('旅行名稱').fill('Queued guide trip');
  await page.getByLabel('目的地國家/城市').fill('Seoul Korea');
  await page.getByRole('button', { name: /建立並進入 App/ }).click();

  await expect.poll(async () => page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || '{}');
    const trip = state.trips?.[0];
    const queuedTrips = (state.syncQueue || []).filter((item) => item.type === 'trip' && item.entityId === trip?.id);
    return {
      queue: queuedTrips.map((item) => ({ status: item.status, attempts: item.attempts, error: item.error })),
      globalSyncStatus: state.globalSyncStatus,
      syncError: state.syncError,
    };
  }, scopedStorageKey)).toEqual({
    queue: [expect.objectContaining({ status: 'queued', attempts: 0, error: expect.stringMatching(/row-level security/i) })],
    globalSyncStatus: 'queued',
    syncError: '',
  });
  await expect(page.getByRole('button', { name: /Sync error/ })).toHaveCount(0);
});

test('IndexedDB-only scoped snapshot requeues a recoverable sync failure without the generic banner', async ({ page }) => {
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/`);
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase('travel-expense-react');
      deletion.onsuccess = () => resolve();
      deletion.onerror = () => reject(deletion.error);
      deletion.onblocked = () => resolve();
    });
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('travel-expense-react', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('state');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction('state', 'readwrite');
        transaction.objectStore('state').put({
          autoSync: false,
          globalSyncStatus: 'error',
          syncError: 'temporary backend outage',
          syncQueue: [{
            id: 'sync_recoverable_snapshot',
            type: 'trip',
            entityId: 'trip_snapshot',
            op: 'upsert',
            status: 'error',
            attempts: 1,
            error: 'temporary backend outage',
            createdAt: 1,
            updatedAt: 1,
          }],
        }, 'app-state');
        transaction.oncomplete = () => { request.result.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });

  await page.reload();
  await expect.poll(async () => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('boss-japan-tracker') || '{}');
    const item = state.syncQueue?.find((entry) => entry.id === 'sync_recoverable_snapshot');
    return { status: item?.status, attempts: item?.attempts, error: item?.error, globalSyncStatus: state.globalSyncStatus, syncError: state.syncError };
  })).toEqual({ status: 'queued', attempts: 1, error: undefined, globalSyncStatus: 'queued', syncError: '' });
  await expect(page.getByRole('button', { name: /Sync error/ })).toHaveCount(0);
});

test('cold-open keeps a version conflict as durable terminal evidence', async ({ page }) => {
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/`);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      autoSync: false,
      syncQueue: [{
        id: 'sync_conflict',
        type: 'receipt',
        entityId: 'conflict',
        op: 'update',
        status: 'error',
        attempts: 3,
        error: '40001 version conflict',
        createdAt: 1,
        updatedAt: 1,
      }],
    }));
  });

  await page.reload();
  const restored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('boss-japan-tracker') || '{}'));
  expect(restored.syncQueue.find((item) => item.entityId === 'conflict').status).toBe('error');
  expect(restored.syncQueue.find((item) => item.entityId === 'conflict').attempts).toBe(3);
});

test('new guide trip retries a legacy-schema insert without RETURNING when SELECT RLS cannot read it', async ({ page }) => {
  const tripPosts = [];
  await page.route('https://test-travel-expense.supabase.co/auth/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: sessionPayload().user }) });
  });
  await page.route('https://test-travel-expense.supabase.co/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    const method = route.request().method();
    if (table === 'profiles') {
      await route.fulfill({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (table === 'trips' && method === 'POST') {
      const body = route.request().postDataJSON();
      tripPosts.push({ url: route.request().url(), body });
      if (body.country_code || body.theme_key || body.locale || body.weather_region || body.trip_intelligence) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'PGRST204', message: "Could not find the 'country_code' column of 'trips' in the schema cache" }),
        });
        return;
      }
      if (url.searchParams.get('select') === '*') {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ code: '42501', message: 'new row violates row-level security policy' }),
        });
        return;
      }
      await route.fulfill({ status: 201, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.addInitScript((session) => {
    localStorage.clear();
    indexedDB.deleteDatabase('travel-expense-react');
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify(session));
  }, sessionPayload());

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/`);
  await expect(page.getByText('旅伴與分帳比例')).toBeVisible();
  await page.getByRole('button', { name: /手動輸入旅行細節/ }).click();
  await page.getByLabel('旅行名稱').fill('Legacy schema trip');
  await page.getByLabel('目的地國家/城市').fill('Seoul Korea');
  await page.getByRole('button', { name: /建立並進入 App/ }).click();

  await expect.poll(async () => page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || '{}');
    return {
      trip: state.trips?.[0] && { name: state.trips[0].name, supabaseId: state.trips[0].supabaseId },
      queuedTrips: (state.syncQueue || []).filter((item) => item.type === 'trip'),
      syncError: state.syncError,
    };
  }, scopedStorageKey)).toEqual({
    trip: expect.objectContaining({ name: 'Legacy schema trip', supabaseId: expect.any(String) }),
    queuedTrips: [],
    syncError: '',
  });
  expect(tripPosts).toHaveLength(2);
  expect(tripPosts[0].body).toEqual(expect.objectContaining({ country_code: expect.any(String) }));
  expect(new URL(tripPosts[1].url).searchParams.get('select')).toBeNull();
  await expect(page.getByRole('button', { name: /Sync error/ })).toHaveCount(0);
});

test('authoritative empty pull backfills a local-only owner trip once and auto-syncs it', async ({ page }) => {
  const tripPosts = [];
  let insertedTrip = null;
  await page.route('https://test-travel-expense.supabase.co/auth/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: sessionPayload().user }) });
  });
  await page.route('https://test-travel-expense.supabase.co/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    const method = route.request().method();
    if (table === 'profiles') {
      await route.fulfill({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (table === 'trips' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(insertedTrip ? [insertedTrip] : []) });
      return;
    }
    if (table === 'trips' && method === 'POST') {
      const body = route.request().postDataJSON();
      tripPosts.push({ url: route.request().url(), body });
      if (body.country_code || body.theme_key || body.locale || body.weather_region || body.trip_intelligence) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'PGRST204', message: "Could not find the 'country_code' column of 'trips' in the schema cache" }),
        });
        return;
      }
      if (url.searchParams.get('select') === '*') {
        await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'new row violates row-level security policy' }) });
        return;
      }
      insertedTrip = body;
      await route.fulfill({ status: 201, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.addInitScript(({ session, key }) => {
    const now = Date.now();
    localStorage.clear();
    indexedDB.deleteDatabase('travel-expense-react');
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: now + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify(session));
    localStorage.setItem(key, JSON.stringify({
      autoSync: true,
      activeTripId: 'trip_local_recovery',
      trips: [{
        id: 'trip_local_recovery',
        name: 'Recovered local trip',
        destinationSummary: 'Seoul Korea',
        startDate: '2026-08-01',
        endDate: '2026-08-03',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'KRW'],
        timezones: ['Asia/Seoul'],
        version: 1,
        active: true,
        itinerary: [],
        createdAt: now,
        updatedAt: now,
      }],
      receipts: [],
      syncQueue: [],
    }));
  }, { session: sessionPayload(), key: scopedStorageKey });

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/`);
  await expect.poll(async () => page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || '{}');
    const trip = state.trips?.find((entry) => entry.id === 'trip_local_recovery');
    return {
      supabaseId: trip?.supabaseId,
      queuedTrips: (state.syncQueue || []).filter((item) => item.type === 'trip').length,
      syncError: state.syncError,
    };
  }, scopedStorageKey), { timeout: 15_000 }).toEqual({ supabaseId: expect.any(String), queuedTrips: 0, syncError: '' });
  expect(tripPosts).toHaveLength(2);

  await page.reload();
  await page.waitForTimeout(1_500);
  const afterReload = await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || '{}');
    return (state.syncQueue || []).filter((item) => item.type === 'trip').length;
  }, scopedStorageKey);
  expect(afterReload).toBe(0);
  expect(tripPosts).toHaveLength(2);
  await expect(page.getByRole('button', { name: /Sync error/ })).toHaveCount(0);
});

test('stale deployment is detected without a service worker and takes priority over sync errors', async ({ page }) => {
  await page.route('**/*__compact_deploy_check*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><html><head><script type="module" src="/assets/index-next.js"></script></head><body></body></html>',
    });
  });
  await page.route('https://test-travel-expense.supabase.co/auth/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: sessionPayload().user }) });
  });
  await page.route('https://test-travel-expense.supabase.co/rest/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.addInitScript(({ session, key }) => {
    const now = Date.now();
    localStorage.clear();
    indexedDB.deleteDatabase('travel-expense-react');
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: now + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify(session));
    localStorage.setItem(key, JSON.stringify({
      autoSync: false,
      activeTripId: 'trip_stale_deployment',
      trips: [{
        id: 'trip_stale_deployment',
        name: 'Stale deployment trip',
        destinationSummary: 'Tokyo',
        startDate: '2026-08-01',
        endDate: '2026-08-03',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Tokyo'],
        version: 1,
        active: true,
        itinerary: [],
        createdAt: now,
        updatedAt: now,
      }],
      receipts: [],
      globalSyncStatus: 'error',
      syncError: 'legacy stale runtime failure',
      syncQueue: [{
        id: 'sync_stale_deployment',
        type: 'trip',
        entityId: 'trip_stale_deployment',
        op: 'upsert',
        status: 'error',
        attempts: 3,
        error: 'legacy stale runtime failure',
        createdAt: now - 1_000,
        updatedAt: now - 1_000,
      }],
    }));
  }, { session: sessionPayload(), key: scopedStorageKey });

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/`);
  await expect(page.getByText('發現新版本')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/有資料同步失敗/)).toHaveCount(0);
  const serviceWorkers = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
  expect(serviceWorkers).toBe(0);
});

test('successful stale trip push retains newer local content and applies the Supabase identity', async ({ page }) => {
  const tripPosts = [];
  await page.route('https://test-travel-expense.supabase.co/auth/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: sessionPayload().user }) });
  });
  await page.route('https://test-travel-expense.supabase.co/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    const method = route.request().method();
    if (table === 'profiles') {
      await route.fulfill({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (table === 'trips' && method === 'POST') {
      const body = route.request().postDataJSON();
      tripPosts.push(body);
      if (body.country_code || body.theme_key || body.locale || body.weather_region || body.trip_intelligence) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'PGRST204', message: "Could not find the 'country_code' column of 'trips' in the schema cache" }),
        });
        return;
      }
      await route.fulfill({ status: 201, body: '' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.addInitScript(({ session, key }) => {
    const now = Date.now();
    localStorage.clear();
    indexedDB.deleteDatabase('travel-expense-react');
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: now + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify(session));
    localStorage.setItem(key, JSON.stringify({
      autoSync: true,
      activeTripId: 'trip_stale_identity',
      trips: [{
        id: 'trip_stale_identity',
        name: 'Newer local name',
        destinationSummary: 'Osaka',
        startDate: '2026-09-01',
        endDate: '2026-09-03',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Tokyo'],
        version: 1,
        active: true,
        itinerary: [],
        createdAt: now - 20_000,
        updatedAt: now,
      }],
      receipts: [],
      syncQueue: [{
        id: 'sync_stale_identity',
        type: 'trip',
        entityId: 'trip_stale_identity',
        op: 'upsert',
        status: 'queued',
        attempts: 0,
        createdAt: now - 10_000,
        updatedAt: now - 10_000,
        payload: { sourceId: 'trip_stale_identity', updatedAt: now - 10_000 },
      }],
    }));
  }, { session: sessionPayload(), key: scopedStorageKey });

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/`);
  await expect.poll(async () => page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key) || '{}');
    const trip = state.trips?.find((entry) => entry.id === 'trip_stale_identity');
    return {
      name: trip?.name,
      supabaseId: trip?.supabaseId,
      queuedTrips: (state.syncQueue || []).filter((item) => item.type === 'trip').length,
    };
  }, scopedStorageKey), { timeout: 15_000 }).toEqual({
    name: 'Newer local name',
    supabaseId: expect.any(String),
    queuedTrips: 0,
  });
  expect(tripPosts).toHaveLength(2);
});
