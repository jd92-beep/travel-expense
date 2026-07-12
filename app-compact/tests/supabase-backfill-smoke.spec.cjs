const { test, expect } = require('@playwright/test');
const { version: APP_VERSION } = require('../package.json');

test.use({ viewport: { width: 390, height: 844 } });

const APP_ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://localhost:8903';

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
  const tripPosts = [];
  const itineraryRpcCalls = [];
  const heartbeatPosts = [];
  const storageUploads = [];
  const storageSignRequests = [];
  let receiptRevision = 20;
  const serverTrip = {
    id: tripUuid,
    owner_id: userId,
    name: 'Backfill Trip',
    destination_summary: 'Nagoya',
    start_date: '2026-04-20',
    end_date: '2026-04-25',
    home_currency: 'HKD',
    trip_currency: 'JPY',
    timezones: ['Asia/Tokyo'],
    budget_amount: 0,
    budget_currency: 'HKD',
    active: true,
    legacy_source_id: 'trip_backfill',
    itinerary: [
      { date: '2026-04-20', day: 1, region: '名古屋市區', spots: [{ time: '09:00', name: '名古屋站', type: 'transport' }] },
      { date: '2026-04-26', day: 7, region: '行程外', spots: [{ time: '09:00', name: '行程外景點', type: 'sightseeing' }] },
    ],
    app_metadata: { sourceId: 'trip_trip_backfill', localTripId: 'trip_backfill' },
    version: 1,
    itinerary_version: 1,
    archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await page.route('**/travel-expense/secrets.local.js', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.DEV_SECRETS = {};' });
  });

  await page.route('https://test-travel-expense.supabase.co/auth/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: sessionPayload().user }) });
  });

  await page.route('https://test-travel-expense.supabase.co/storage/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.includes('/object/sign/receipt-photos')) {
      const body = request.postDataJSON?.() || {};
      storageSignRequests.push({ url: request.url(), body });
      if (Array.isArray(body.paths)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(body.paths.map((path) => ({
            error: null,
            path,
            signedURL: `/object/sign/receipt-photos/${path}?token=test-signed-token`,
          }))),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ signedURL: `${url.pathname.replace('/storage/v1', '')}?token=test-signed-token` }),
      });
      return;
    }
    storageUploads.push(request.url());
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
    if (table === 'update_trip_itinerary' && method === 'POST') {
      const body = echoRow();
      itineraryRpcCalls.push(body);
      serverTrip.start_date = body.p_start_date;
      serverTrip.end_date = body.p_end_date;
      serverTrip.itinerary = body.p_itinerary;
      serverTrip.version += 1;
      serverTrip.itinerary_version += 1;
      serverTrip.updated_at = new Date().toISOString();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(serverTrip) });
      return;
    }
    if (table === 'app_usage_events' && method === 'POST') {
      heartbeatPosts.push(echoRow());
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (table === 'upsert_shared_trip_receipt' && method === 'POST') {
      const rpc = echoRow();
      const payload = rpc.p_receipt || {};
      const suffix = String(receiptPosts.length + 1).padStart(12, '0');
      const now = new Date().toISOString();
      const row = {
        id: rpc.p_receipt_id || `33333333-3333-4333-8333-${suffix}`,
        trip_id: rpc.p_trip_id,
        owner_id: userId,
        store: payload.store || '未命名',
        record_date: payload.record_date,
        record_time: payload.record_time || null,
        category: payload.category ?? null,
        record_kind: payload.record_kind || 'expense',
        payment_method: payload.payment_method || 'cash',
        amount: payload.amount || 0,
        currency: payload.currency || 'JPY',
        home_amount: payload.home_amount || null,
        home_currency: payload.home_currency || 'HKD',
        original_amount: payload.original_amount || null,
        original_currency: payload.original_currency || null,
        exchange_rate: payload.exchange_rate || null,
        items_text: payload.items_text || null,
        note: payload.note || null,
        address: payload.address || null,
        booking_ref: payload.booking_ref || null,
        source_id: rpc.p_source_id,
        status: 'confirmed',
        confidence: null,
        map_url: payload.map_url || null,
        visibility: payload.visibility || 'trip',
        split_mode: payload.split_mode || 'shared',
        split_type: payload.split_type || null,
        splits: payload.splits || null,
        payers: payload.payers || null,
        person_id: payload.person_id || null,
        beneficiary_id: payload.beneficiary_id || null,
        notion_page_id: null,
        notion_database_id: null,
        notion_sync_status: 'disabled',
        version: 1,
        sync_revision: ++receiptRevision,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };
      receiptPosts.push(row);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? row : [row]) });
      return;
    }
    if (table === 'trips' && method === 'POST') {
      const row = { ...echoRow(), id: tripUuid };
      tripPosts.push(row);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(single ? row : [row]) });
      return;
    }
    if (table === 'trips' && method === 'GET') {
      if (url.searchParams.get('select') === 'id') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? { id: tripUuid } : [{ id: tripUuid }]) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? serverTrip : [serverTrip]) });
      }
      return;
    }
    if (table === 'receipts' && method === 'GET' && url.searchParams.get('select') === 'id') {
      // findReceiptUuid: no existing server row
      await route.fulfill({ status: 200, contentType: 'application/json', body: single ? 'null' : '[]' });
      return;
    }
    if (table === 'trips' && method === 'PATCH') {
      Object.assign(serverTrip, echoRow(), { updated_at: new Date().toISOString() });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? serverTrip : [serverTrip]) });
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
        itinerary: [
          { date: '2026-04-20', day: 1, region: '名古屋市區', spots: [{ time: '09:00', name: '名古屋站', type: 'transport' }] },
          { date: '2026-04-26', day: 7, region: '行程外', spots: [{ time: '09:00', name: '行程外景點', type: 'sightseeing' }] },
        ],
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

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#dashboard`);

  // Boot sync -> pull -> backfill sweep -> versioned receipt RPC.
  await expect.poll(() => receiptPosts.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  await expect.poll(() => itineraryRpcCalls.length, { timeout: 10_000 }).toBe(1);
  await expect.poll(() => heartbeatPosts.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
  expect(heartbeatPosts[0].app_surface).toBe('compact');
  expect(heartbeatPosts[0].app_build).toBe(APP_VERSION);
  expect(heartbeatPosts[0].metadata.contractVersion).toBe(4);
  expect(heartbeatPosts[0].session_id_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(tripPosts).toHaveLength(0);
  expect(itineraryRpcCalls[0].p_expected_version).toBe(1);
  expect(itineraryRpcCalls[0].p_source).toBe('compact');
  const canonicalDates = itineraryRpcCalls[0].p_itinerary.map((day) => day.date);
  expect(canonicalDates).toEqual([
    '2026-04-20',
    '2026-04-21',
    '2026-04-22',
    '2026-04-23',
    '2026-04-24',
    '2026-04-25',
  ]);
  expect(JSON.stringify(itineraryRpcCalls[0].p_itinerary)).not.toContain('行程外景點');
  expect(JSON.stringify(itineraryRpcCalls[0].p_itinerary)).toContain('白川鄉 合掌村');
  const repairedState = await page.evaluate((userId) => {
    const raw = localStorage.getItem(`boss-japan-tracker:state:supabase:${userId}`);
    return raw ? JSON.parse(raw) : {};
  }, userId);
  const repairedTrip = repairedState.trips.find((trip) => trip.id === 'trip_backfill');
  expect(repairedTrip.itineraryVersion).toBe(2);
  expect(repairedTrip._itineraryNeedsRepair).toBe(false);
  expect((repairedState.syncQueue || []).filter((item) => item.status === 'error' || item.status === 'failed')).toHaveLength(0);
  const stores = receiptPosts.map((row) => row.store);
  expect(stores).toContain('味仙');
  expect(stores).toContain('驛麵通');
  // Photos: the local receipt AND the stale-flag receipt (server photo missing) must both upload
  await expect.poll(() => storageUploads.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  await expect.poll(() => storageSignRequests.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  expect(storageSignRequests.every(({ body }) => Number(body.expiresIn) > 0 && Number(body.expiresIn) <= 900)).toBe(true);
  const stalePhotoUpload = storageUploads.some((url) => url.includes('44444444-4444-4444-8444-444444444444'));
  expect(stalePhotoUpload).toBe(true);
});

test('successful empty cloud pull purges revoked trip data and keeps local-only trip', async ({ page }) => {
  await page.route('**/travel-expense/secrets.local.js', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.DEV_SECRETS = {};' });
  });
  await page.route('https://test-travel-expense.supabase.co/auth/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: sessionPayload().user }) });
  });
  await page.route('https://test-travel-expense.supabase.co/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    const method = route.request().method();
    const single = String(route.request().headers()['accept'] || '').includes('pgrst.object');
    if (table === 'profiles' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? { app_settings: {} } : [{ app_settings: {} }]) });
      return;
    }
    if (table === 'trips' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return;
    }
    if (table === 'app_usage_events' && method === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: single ? 'null' : '[]' });
  });

  await page.addInitScript(({ userId, session, tripUuid }) => {
    const now = Date.now();
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: now + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify(session));
    localStorage.setItem(`boss-japan-tracker:state:supabase:${userId}`, JSON.stringify({
      lastTab: 'dashboard',
      autoSync: false,
      activeTripId: 'trip_revoked',
      tripName: 'Revoked Trip',
      tripDateRange: { start: '2026-04-20', end: '2026-04-25' },
      trips: [
        {
          id: 'trip_revoked', supabaseId: tripUuid, name: 'Revoked Trip', destinationSummary: 'Nagoya',
          startDate: '2026-04-20', endDate: '2026-04-25', homeCurrency: 'HKD', currencies: ['HKD', 'JPY'],
          timezones: ['Asia/Tokyo'], version: 2, active: true, itinerary: [], sharing: { role: 'viewer', isShared: true, memberCount: 2, pendingInviteCount: 0 },
          createdAt: now - 1000, updatedAt: now - 1000,
        },
        {
          id: 'trip_local', name: 'Local Trip', destinationSummary: 'Taipei', startDate: '2026-08-01', endDate: '2026-08-02',
          homeCurrency: 'HKD', currencies: ['HKD', 'TWD'], timezones: ['Asia/Taipei'], version: 1, active: false,
          itinerary: [], createdAt: now, updatedAt: now,
        },
      ],
      receipts: [
        { id: 'r_revoked', tripId: 'trip_revoked', sourceId: 'r_revoked', store: 'Revoked', total: 100, date: '2026-04-21', category: 'food', payment: 'cash', version: 2, syncRevision: 8 },
        { id: 'r_local', tripId: 'trip_local', sourceId: 'r_local', store: 'Local', total: 200, date: '2026-08-01', category: 'food', payment: 'cash' },
      ],
      peopleByTripId: { trip_revoked: [{ id: 'p1', name: 'Removed', emoji: '', color: '#000' }], trip_local: [{ id: 'p2', name: 'Local', emoji: '', color: '#111' }] },
      shareRatiosByTripId: { trip_revoked: { p1: 100 }, trip_local: { p2: 100 } },
      receiptTombstones: {
        'trip_revoked::old': { supabaseId: '44444444-4444-4444-8444-444444444444', sourceId: 'old', tripId: 'trip_revoked', version: 2, syncRevision: 7, deletedAt: now },
      },
      notionDeletedSourceIds: ['trip_revoked::old'],
      syncQueue: [{
        id: 'q_revoked', type: 'receipt', entityId: 'r_revoked', op: 'update', status: 'failed', attempts: 3,
        createdAt: now, updatedAt: now, payload: { tripId: 'trip_revoked', sourceId: 'r_revoked', version: 2, syncRevision: 8 },
      }],
    }));
  }, { userId, session: sessionPayload(), tripUuid });

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#dashboard`);
  await expect.poll(async () => page.evaluate((userId) => {
    const state = JSON.parse(localStorage.getItem(`boss-japan-tracker:state:supabase:${userId}`) || '{}');
    return {
      trips: (state.trips || []).map((trip) => trip.id),
      receipts: (state.receipts || []).map((receipt) => receipt.id),
      people: Object.keys(state.peopleByTripId || {}),
      ratios: Object.keys(state.shareRatiosByTripId || {}),
      queue: (state.syncQueue || []).length,
      tombstones: Object.keys(state.receiptTombstones || {}),
      deletedSources: state.notionDeletedSourceIds || [],
      activeTripId: state.activeTripId,
    };
  }, userId), { timeout: 15_000 }).toEqual({
    trips: ['trip_local'],
    receipts: ['r_local'],
    people: ['trip_local'],
    ratios: ['trip_local'],
    queue: 0,
    tombstones: [],
    deletedSources: [],
    activeTripId: 'trip_local',
  });
});
