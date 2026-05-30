const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

test.skip(process.env.SUPABASE_TRIP_ACTIVE_SMOKE !== '1', 'Set SUPABASE_TRIP_ACTIVE_SMOKE=1 and start Vite with fake Supabase env for this focused integration smoke.');

const userId = '44444444-4444-4444-8444-444444444444';
const oldTripUuid = '55555555-5555-4555-8555-555555555555';
const newTripUuid = '66666666-6666-4666-8666-666666666666';

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
      email: 'active-trip@example.com',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { email: 'active-trip@example.com' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

test('Active Supabase trip push deactivates stale active trips for the same user', async ({ page }) => {
  const tripUpserts = [];
  const tripPatches = [];

  await page.route('https://test-travel-expense.supabase.co/auth/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: sessionPayload().user }) });
  });

  await page.route('https://test-travel-expense.supabase.co/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    const method = route.request().method();
    const body = route.request().postDataJSON?.();

    if (table === 'profiles' && method === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: userId }]) });
      return;
    }
    if (table === 'profiles' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ app_settings: {} }) });
      return;
    }
    if (table === 'profiles' && method === 'PATCH') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (table === 'trips' && method === 'POST') {
      tripUpserts.push(body);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ...body,
          id: body.id || newTripUuid,
          owner_id: userId,
          created_at: body.created_at || new Date().toISOString(),
          updated_at: body.updated_at || new Date().toISOString(),
        }),
      });
      return;
    }
    if (table === 'trips' && method === 'PATCH') {
      tripPatches.push({ body, query: url.searchParams.toString() });
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (table === 'trips' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (table === 'receipts' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.addInitScript(({ userId, session, oldTripUuid, newTripUuid }) => {
    const now = Date.now();
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify(session));
    localStorage.setItem(`boss-japan-tracker:state:supabase:${userId}`, JSON.stringify({
      lastTab: 'dashboard',
      autoSync: true,
      activeTripId: 'trip_new',
      trips: [
        {
          id: 'trip_old',
          name: 'Old Trip',
          destinationSummary: 'Old City',
          startDate: '2026-07-01',
          endDate: '2026-07-02',
          homeCurrency: 'HKD',
          currencies: ['HKD', 'JPY'],
          timezones: ['Asia/Tokyo'],
          version: 1,
          active: false,
          supabaseId: oldTripUuid,
          itinerary: [],
          createdAt: now - 1000,
          updatedAt: now,
        },
        {
          id: 'trip_new',
          name: 'New Trip',
          destinationSummary: 'New City',
          startDate: '2026-08-01',
          endDate: '2026-08-02',
          homeCurrency: 'HKD',
          currencies: ['HKD', 'JPY'],
          timezones: ['Asia/Tokyo'],
          version: 1,
          active: true,
          supabaseId: newTripUuid,
          itinerary: [],
          createdAt: now,
          updatedAt: now,
        },
      ],
      receipts: [],
      syncQueue: [{
        id: 'sync_new_trip',
        type: 'trip',
        entityId: 'trip_new',
        op: 'create',
        status: 'queued',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
        payload: { sourceId: 'trip_trip_new', updatedAt: now },
      }],
    }));
  }, { userId, session: sessionPayload(), oldTripUuid, newTripUuid });

  await page.goto('http://localhost:8903/travel-expense/compact/#dashboard');
  await expect(page.getByText('Travel Ledger')).toBeVisible();

  await expect.poll(() => tripUpserts.length, { timeout: 10000 }).toBeGreaterThanOrEqual(1);
  expect(tripUpserts.at(-1).active).toBe(true);

  await expect.poll(() => tripPatches.length, { timeout: 10000 }).toBeGreaterThanOrEqual(1);
  expect(tripPatches.at(-1).body.active).toBe(false);
  expect(tripPatches.at(-1).query).toContain(`id=neq.${newTripUuid}`);
  expect(tripPatches.at(-1).query).toContain(`owner_id=eq.${userId}`);
});

test('Supabase receipt archive is scoped to the deleted receipt trip when SourceID repeats', async ({ page }) => {
  const receiptPatches = [];

  await page.route('https://test-travel-expense.supabase.co/auth/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: sessionPayload().user }) });
  });

  await page.route('https://test-travel-expense.supabase.co/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    const method = route.request().method();

    if (table === 'profiles' && method === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: userId }]) });
      return;
    }
    if (table === 'profiles' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ app_settings: {} }) });
      return;
    }
    if (table === 'trips' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (table === 'receipts' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    if (table === 'receipts' && method === 'PATCH') {
      receiptPatches.push({ body: route.request().postDataJSON?.(), query: url.searchParams.toString() });
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.addInitScript(({ userId, session, oldTripUuid, newTripUuid }) => {
    const now = Date.now();
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify(session));
    localStorage.setItem(`boss-japan-tracker:state:supabase:${userId}`, JSON.stringify({
      lastTab: 'history',
      autoSync: true,
      activeTripId: 'trip_a',
      trips: [
        {
          id: 'trip_a',
          name: 'Trip A',
          destinationSummary: 'A',
          startDate: '2026-07-01',
          endDate: '2026-07-02',
          homeCurrency: 'HKD',
          currencies: ['HKD', 'JPY'],
          timezones: ['Asia/Tokyo'],
          version: 1,
          active: true,
          supabaseId: oldTripUuid,
          itinerary: [],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'trip_b',
          name: 'Trip B',
          destinationSummary: 'B',
          startDate: '2026-08-01',
          endDate: '2026-08-02',
          homeCurrency: 'HKD',
          currencies: ['HKD', 'JPY'],
          timezones: ['Asia/Tokyo'],
          version: 1,
          active: false,
          supabaseId: newTripUuid,
          itinerary: [],
          createdAt: now,
          updatedAt: now,
        },
      ],
      receipts: [],
      syncQueue: [{
        id: 'sync_delete_shared_source',
        type: 'delete-receipt',
        entityId: 'receipt_deleted_from_trip_a',
        op: 'delete',
        status: 'queued',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
        payload: {
          sourceId: 'trip_a::shared_source',
          tripId: 'trip_a',
          updatedAt: now,
        },
      }],
    }));
  }, { userId, session: sessionPayload(), oldTripUuid, newTripUuid });

  await page.goto('http://localhost:8903/travel-expense/compact/#history');
  await expect(page.getByText('紀錄中心')).toBeVisible();

  await expect.poll(() => receiptPatches.length, { timeout: 10000 }).toBeGreaterThanOrEqual(1);
  expect(receiptPatches.at(-1).body.status).toBe('deleted');
  expect(receiptPatches.at(-1).query).toContain(`owner_id=eq.${userId}`);
  expect(receiptPatches.at(-1).query).toContain('source_id=eq.shared_source');
  expect(receiptPatches.at(-1).query).not.toContain('source_id=eq.trip_a%3A%3Ashared_source');
  expect(receiptPatches.at(-1).query).toContain(`trip_id=eq.${oldTripUuid}`);
  expect(receiptPatches.at(-1).query).not.toContain(`trip_id=eq.${newTripUuid}`);
});

test('Supabase pull merges a migrated local receipt by trip SourceID when Supabase id is new', async ({ page }) => {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const localUpdatedAt = now - 10_000;
  const remoteReceiptUuid = '77777777-7777-4777-8777-777777777777';
  const tripRows = [{
    id: oldTripUuid,
    owner_id: userId,
    name: 'Trip A',
    destination_summary: 'A',
    start_date: '2026-07-01',
    end_date: '2026-07-02',
    home_currency: 'HKD',
    trip_currency: 'JPY',
    timezones: ['Asia/Tokyo'],
    budget_amount: 0,
    budget_currency: 'HKD',
    active: true,
    legacy_source_id: 'trip_a',
    itinerary: [],
    app_metadata: { sourceId: 'trip_trip_a' },
    version: 1,
    archived: false,
    notion_page_id: null,
    notion_database_id: null,
    created_at: nowIso,
    updated_at: nowIso,
  }];
  const receiptRows = [{
    id: remoteReceiptUuid,
    trip_id: oldTripUuid,
    owner_id: userId,
    store: 'Supabase Corrected Store',
    record_date: '2026-07-01',
    record_time: null,
    category: 'food',
    payment_method: 'cash',
    amount: 456,
    currency: 'JPY',
    home_amount: null,
    home_currency: 'HKD',
    original_amount: 456,
    original_currency: 'JPY',
    exchange_rate: null,
    items_text: null,
    note: null,
    address: null,
    booking_ref: null,
    source_id: 'email_001',
    status: 'confirmed',
    confidence: null,
    map_url: null,
    notion_page_id: null,
    notion_database_id: null,
    created_at: nowIso,
    updated_at: nowIso,
    deleted_at: null,
  }];

  await page.route('https://test-travel-expense.supabase.co/auth/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: sessionPayload().user }) });
  });

  await page.route('https://test-travel-expense.supabase.co/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    const method = route.request().method();

    if (table === 'profiles' && method === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: userId }]) });
      return;
    }
    if (table === 'profiles' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ app_settings: {} }) });
      return;
    }
    if (table === 'trips' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tripRows) });
      return;
    }
    if (table === 'receipts' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(receiptRows) });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.addInitScript(({ userId, session, localUpdatedAt }) => {
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify(session));
    localStorage.setItem(`boss-japan-tracker:state:supabase:${userId}`, JSON.stringify({
      lastTab: 'history',
      autoSync: true,
      activeTripId: 'trip_a',
      trips: [{
        id: 'trip_a',
        name: 'Trip A',
        destinationSummary: 'A',
        startDate: '2026-07-01',
        endDate: '2026-07-02',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Tokyo'],
        version: 1,
        active: true,
        supabaseId: '55555555-5555-4555-8555-555555555555',
        itinerary: [],
        createdAt: localUpdatedAt,
        updatedAt: localUpdatedAt,
      }],
      receipts: [{
        id: 'local_legacy_receipt',
        tripId: 'trip_a',
        store: 'Local Legacy Store',
        total: 123,
        date: '2026-07-01',
        category: 'food',
        payment: 'cash',
        sourceId: 'email_001',
        createdAt: localUpdatedAt,
        updatedAt: localUpdatedAt,
      }],
      syncQueue: [],
    }));
  }, { userId, session: sessionPayload(), localUpdatedAt });

  await page.goto('http://localhost:8903/travel-expense/compact/#history');
  await expect(page.getByText('紀錄中心')).toBeVisible();

  await expect.poll(async () => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('boss-japan-tracker:state:supabase:44444444-4444-4444-8444-444444444444') || '{}');
    return (state.receipts || [])
      .filter((receipt) => receipt.sourceId === 'email_001')
      .map((receipt) => ({
        id: receipt.id,
        supabaseId: receipt.supabaseId,
        store: receipt.store,
        total: receipt.total,
        tripId: receipt.tripId,
      }));
  }), { timeout: 10000 }).toEqual([{
    id: 'local_legacy_receipt',
    supabaseId: remoteReceiptUuid,
    store: 'Supabase Corrected Store',
    total: 456,
    tripId: 'trip_a',
  }]);
});

test('Supabase pull keeps duplicate SourceID receipts separate across trips', async ({ page }) => {
  const nowIso = new Date().toISOString();
  const tripRows = [
    {
      id: oldTripUuid,
      owner_id: userId,
      name: 'Trip A',
      destination_summary: 'A',
      start_date: '2026-07-01',
      end_date: '2026-07-02',
      home_currency: 'HKD',
      trip_currency: 'JPY',
      timezones: ['Asia/Tokyo'],
      budget_amount: 0,
      budget_currency: 'HKD',
      active: true,
      legacy_source_id: 'trip_a',
      itinerary: [],
      app_metadata: { sourceId: 'trip_trip_a' },
      version: 1,
      archived: false,
      notion_page_id: null,
      notion_database_id: null,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: newTripUuid,
      owner_id: userId,
      name: 'Trip B',
      destination_summary: 'B',
      start_date: '2026-08-01',
      end_date: '2026-08-02',
      home_currency: 'HKD',
      trip_currency: 'JPY',
      timezones: ['Asia/Tokyo'],
      budget_amount: 0,
      budget_currency: 'HKD',
      active: false,
      legacy_source_id: 'trip_b',
      itinerary: [],
      app_metadata: { sourceId: 'trip_trip_b' },
      version: 1,
      archived: false,
      notion_page_id: null,
      notion_database_id: null,
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];
  const receiptRows = [
    {
      id: '77777777-7777-4777-8777-777777777777',
      trip_id: oldTripUuid,
      owner_id: userId,
      store: 'Trip A Shared Source Cafe',
      record_date: '2026-07-01',
      record_time: null,
      category: 'food',
      payment_method: 'cash',
      amount: 111,
      currency: 'JPY',
      home_amount: null,
      home_currency: 'HKD',
      original_amount: 111,
      original_currency: 'JPY',
      exchange_rate: null,
      items_text: null,
      note: null,
      address: null,
      booking_ref: null,
      source_id: 'shared_source',
      status: 'confirmed',
      confidence: null,
      map_url: null,
      notion_page_id: null,
      notion_database_id: null,
      created_at: nowIso,
      updated_at: nowIso,
      deleted_at: null,
    },
    {
      id: '88888888-8888-4888-8888-888888888888',
      trip_id: newTripUuid,
      owner_id: userId,
      store: 'Trip B Shared Source Cafe',
      record_date: '2026-08-01',
      record_time: null,
      category: 'food',
      payment_method: 'cash',
      amount: 222,
      currency: 'JPY',
      home_amount: null,
      home_currency: 'HKD',
      original_amount: 222,
      original_currency: 'JPY',
      exchange_rate: null,
      items_text: null,
      note: null,
      address: null,
      booking_ref: null,
      source_id: 'shared_source',
      status: 'confirmed',
      confidence: null,
      map_url: null,
      notion_page_id: null,
      notion_database_id: null,
      created_at: nowIso,
      updated_at: nowIso,
      deleted_at: null,
    },
    {
      id: '99999999-9999-4999-8999-999999999999',
      trip_id: '99999999-0000-4000-8000-000000000999',
      owner_id: userId,
      store: 'Unknown Trip Should Not Attach',
      record_date: '2026-07-01',
      record_time: null,
      category: 'food',
      payment_method: 'cash',
      amount: 999,
      currency: 'JPY',
      home_amount: null,
      home_currency: 'HKD',
      original_amount: 999,
      original_currency: 'JPY',
      exchange_rate: null,
      items_text: null,
      note: null,
      address: null,
      booking_ref: null,
      source_id: 'unknown_trip_source',
      status: 'confirmed',
      confidence: null,
      map_url: null,
      notion_page_id: null,
      notion_database_id: null,
      created_at: nowIso,
      updated_at: nowIso,
      deleted_at: null,
    },
  ];

  await page.route('https://test-travel-expense.supabase.co/auth/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: sessionPayload().user }) });
  });

  await page.route('https://test-travel-expense.supabase.co/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    const method = route.request().method();

    if (table === 'profiles' && method === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: userId }]) });
      return;
    }
    if (table === 'profiles' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ app_settings: {} }) });
      return;
    }
    if (table === 'trips' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tripRows) });
      return;
    }
    if (table === 'receipts' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(receiptRows) });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.addInitScript(({ userId, session }) => {
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify(session));
    localStorage.setItem(`boss-japan-tracker:state:supabase:${userId}`, JSON.stringify({
      lastTab: 'history',
      autoSync: true,
      activeTripId: 'trip_a',
      trips: [],
      receipts: [],
      syncQueue: [],
    }));
  }, { userId, session: sessionPayload() });

  await page.goto('http://localhost:8903/travel-expense/compact/#history');
  await expect(page.getByText('紀錄中心')).toBeVisible();

  await expect.poll(async () => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('boss-japan-tracker:state:supabase:44444444-4444-4444-8444-444444444444') || '{}');
    return (state.receipts || [])
      .filter((receipt) => receipt.sourceId === 'shared_source')
      .map((receipt) => ({ id: receipt.id, tripId: receipt.tripId, total: receipt.total }))
      .sort((a, b) => a.tripId.localeCompare(b.tripId));
  }), { timeout: 10000 }).toEqual([
    { id: '77777777-7777-4777-8777-777777777777', tripId: 'trip_a', total: 111 },
    { id: '88888888-8888-4888-8888-888888888888', tripId: 'trip_b', total: 222 },
  ]);

  await expect.poll(async () => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('boss-japan-tracker:state:supabase:44444444-4444-4444-8444-444444444444') || '{}');
    return (state.receipts || []).some((receipt) => receipt.sourceId === 'unknown_trip_source' || receipt.store === 'Unknown Trip Should Not Attach');
  }), { timeout: 10000 }).toBe(false);
});
