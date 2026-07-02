const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

test.skip(process.env.SUPABASE_MIRROR_SMOKE !== '1', 'Set SUPABASE_MIRROR_SMOKE=1 and start Vite with fake Supabase env (VITE_SUPABASE_URL=https://test-travel-expense.supabase.co) for this focused integration smoke.');

const userId = '11111111-1111-4111-8111-111111111111';
const tripUuid = '22222222-2222-4222-8222-222222222222';

// 1x1 transparent PNG
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function sessionPayload() {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'backfill@example.com',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { email: 'backfill@example.com' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

test('backfill sweep pushes local receipts that never reached Supabase', async ({ page }) => {
  const receiptPosts = [];
  const storagePosts = [];

  await page.route('**/travel-expense/secrets.local.js', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.DEV_SECRETS = {};' });
  });

  await page.route('https://test-travel-expense.supabase.co/auth/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: sessionPayload().user }) });
  });

  await page.route('https://test-travel-expense.supabase.co/storage/v1/**', async (route) => {
    storagePosts.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ Key: `receipt-photos/${userId}/test.jpg` }) });
  });

  await page.route('https://test-travel-expense.supabase.co/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    const method = route.request().method();
    const single = String(route.request().headers()['accept'] || '').includes('pgrst.object');
    const echoRow = () => {
      let body = route.request().postDataJSON?.() || {};
      if (Array.isArray(body)) body = body[0] || {};
      return body;
    };
    if (table === 'receipts' && method === 'POST') {
      receiptPosts.push(echoRow());
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(single ? echoRow() : [echoRow()]) });
      return;
    }
    if (table === 'trips' && method === 'POST') {
      const row = { ...echoRow(), id: tripUuid };
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(single ? row : [row]) });
      return;
    }
    if (table === 'trips' && method === 'GET') {
      if (url.searchParams.get('select') === 'id') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? { id: tripUuid } : [{ id: tripUuid }]) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
      return;
    }
    if (table === 'receipts' && method === 'GET' && url.searchParams.get('select') === 'id') {
      // findReceiptUuid: no existing server row
      await route.fulfill({ status: 200, contentType: 'application/json', body: single ? 'null' : '[]' });
      return;
    }
    if (method === 'PATCH' || method === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (table === 'profiles' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? { app_settings: {} } : [{ id: userId, app_settings: {} }]) });
      return;
    }
    if (method === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(single ? echoRow() : [echoRow()]) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: single ? 'null' : '[]' });
  });

  // Block Notion so the test only proves the Supabase path
  await page.route('**/notion/**', async (route) => {
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false }) });
  });

  await page.addInitScript(({ userId, session, tinyPng }) => {
    const now = Date.now();
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: now + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify(session));
    localStorage.setItem(`boss-japan-tracker:state:supabase:${userId}`, JSON.stringify({
      lastTab: 'dashboard',
      autoSync: true,
      activeTripId: 'trip_backfill',
      personalNotionConnected: false,
      trips: [{
        id: 'trip_backfill',
        name: 'Backfill Trip',
        destinationSummary: 'Nagoya',
        startDate: '2026-04-20',
        endDate: '2026-04-25',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Tokyo'],
        version: 1,
        active: true,
        itinerary: [],
        createdAt: now,
        updatedAt: now,
      }],
      // Two receipts stuck in the classic broken states: marked synced (Notion era) and
      // plain local — neither has a supabaseId, neither sits in the syncQueue.
      receipts: [
        { id: 'r_stuck_synced', tripId: 'trip_backfill', store: '味仙', total: 2400, date: '2026-04-21', category: 'food', payment: 'cash', currency: 'JPY', syncStatus: 'synced', createdAt: now - 100000, updatedAt: now - 100000 },
        { id: 'r_stuck_local', tripId: 'trip_backfill', store: '驛麵通', total: 980, date: '2026-04-22', category: 'food', payment: 'suica', currency: 'JPY', syncStatus: 'local', photoThumb: tinyPng, createdAt: now - 50000, updatedAt: now - 50000 },
        // Stale flag: local state believes the photo was uploaded, but the server pull
        // returns no receipt_photos row — the engine must clear the flag and re-upload.
        { id: 'r_stale_photo', tripId: 'trip_backfill', store: '大須唐揚', total: 650, date: '2026-04-23', category: 'food', payment: 'cash', currency: 'JPY', syncStatus: 'synced', supabaseId: '44444444-4444-4444-8444-444444444444', photoThumb: tinyPng, _photoSyncedToSupabase: true, createdAt: now - 30000, updatedAt: now - 30000 },
      ],
      syncQueue: [],
    }));
  }, { userId, session: sessionPayload(), tinyPng: TINY_PNG });

  await page.goto('http://localhost:8903/travel-expense/compact/#dashboard');

  // Boot sync (800ms) -> pull -> backfill sweep enqueues -> debounced push (3s) -> POST /receipts
  await expect.poll(() => receiptPosts.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  const stores = receiptPosts.map((row) => row.store);
  expect(stores).toContain('味仙');
  expect(stores).toContain('驛麵通');
  // Photos: the local receipt AND the stale-flag receipt (server photo missing) must both upload
  await expect.poll(() => storagePosts.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  const stalePhotoUpload = storagePosts.some((url) => url.includes('44444444-4444-4444-8444-444444444444'));
  expect(stalePhotoUpload).toBe(true);
});
