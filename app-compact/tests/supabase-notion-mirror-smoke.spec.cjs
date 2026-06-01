const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

test.skip(process.env.SUPABASE_MIRROR_SMOKE !== '1', 'Set SUPABASE_MIRROR_SMOKE=1 and start Vite with fake Supabase env for this focused integration smoke.');

const userId = '11111111-1111-4111-8111-111111111111';
const tripUuid = '22222222-2222-4222-8222-222222222222';
const receiptUuid = '33333333-3333-4333-8333-333333333333';

const schema = {
  properties: {
    '店名': { type: 'title' },
    '金額': { type: 'number' },
    '日期': { type: 'date' },
    '類別': { type: 'select' },
    '支付': { type: 'select' },
    '地區': { type: 'rich_text' },
    '品項': { type: 'rich_text' },
    '備註': { type: 'rich_text' },
    '旅伴': { type: 'rich_text' },
    'SourceID': { type: 'rich_text' },
    'HKD': { type: 'number' },
    '⏰ 時間': { type: 'rich_text' },
    '🗺️ 地址': { type: 'rich_text' },
    '🎫 Booking Ref': { type: 'rich_text' },
    'Currency': { type: 'select' },
    'Original Amount': { type: 'number' },
    'Exchange Rate': { type: 'number' },
    'Map URL': { type: 'url' },
    'Object Type': { type: 'select' },
    'TripID': { type: 'rich_text' },
    'Trip Version': { type: 'number' },
    '🔒 類型': { type: 'select' },
    '📷 相片 URL': { type: 'url' },
  },
};

function text(content) {
  return { type: 'rich_text', rich_text: content ? [{ plain_text: content, text: { content } }] : [] };
}

function pageFixture(id, properties) {
  return {
    id,
    object: 'page',
    url: `https://www.notion.so/${id}`,
    created_time: '2026-05-26T00:00:00.000Z',
    last_edited_time: '2026-05-26T00:00:00.000Z',
    archived: false,
    in_trash: false,
    properties,
  };
}

async function setAccordion(page, title, expanded = true) {
  const button = page.getByRole('button', { name: new RegExp(title) });
  if ((await button.getAttribute('aria-expanded')) !== String(expanded)) await button.click();
}

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
      email: 'mirror@example.com',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { email: 'mirror@example.com' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

test.beforeEach(async ({ page }) => {
  await page.route('**/travel-expense/secrets.local.js', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.DEV_SECRETS = {};' });
  });
});

test('Supabase public Notion panel clearly stays Supabase-only before Personal Notion is connected', async ({ page }) => {
  const notionRequests = [];


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
    if (table === 'trips' && method === 'GET') {
      if (url.searchParams.get('select') === 'id') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: tripUuid }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
      return;
    }
    if (table === 'trips' && method === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ...body, id: tripUuid, owner_id: userId }),
      });
      return;
    }
    if (table === 'receipts' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.route('**/notion/request', async (route) => {
    notionRequests.push(route.request().postDataJSON());
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Notion should not be called before Personal Notion is connected' }) });
  });

  await page.addInitScript(({ userId, session }) => {
    const now = Date.now();
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify(session));
    localStorage.setItem(`boss-japan-tracker:state:supabase:${userId}`, JSON.stringify({
      lastTab: 'settings',
      autoSync: true,
      activeTripId: 'trip_supabase_only',
      notionDb: '3438d94d5f7c81878221fcda6d65d39d',
      personalNotionConnected: false,
      trips: [{
        id: 'trip_supabase_only',
        name: 'Supabase Only Trip',
        destinationSummary: 'Supabase City',
        startDate: '2026-09-01',
        endDate: '2026-09-02',
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
      syncQueue: [],
    }));
  }, { userId, session: sessionPayload() });

  await page.goto('http://localhost:8903/travel-expense/compact/#settings');
  await expect(page.getByText('設定控制中心')).toBeVisible();
  await setAccordion(page, 'Notion Sync');

  await expect(page.getByLabel('Database ID', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Notion mirror database')).toBeDisabled();
  await expect(page.getByLabel('Notion mirror database')).toHaveValue('Personal Notion 未連接');
  await expect(page.getByRole('button', { name: /Push Supabase$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Save & Push Supabase Settings/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '測試' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '美化 Schema' })).toBeDisabled();

  await page.getByRole('button', { name: /Push Supabase$/ }).click();
  await expect(page.getByText(/已透過 Sync Engine 推送 pending queue/)).toBeVisible();
  await page.waitForTimeout(500);
  expect(notionRequests).toHaveLength(0);
});

test('Supabase personal Notion connect persists database scope and queues active trip update', async ({ page }) => {
  const connectRequests = [];

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
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.route('**/notion/request', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { ok: true } }),
    });
  });

  await page.route('**/integrations/notion/connect', async (route) => {
    connectRequests.push({
      supabaseAuth: route.request().headers()['x-supabase-auth'] || '',
      brokerSession: route.request().headers()['x-travel-session'] || '',
      body: route.request().postDataJSON(),
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        status: {
          provider: 'notion',
          status: 'connected',
          databaseId: 'db_personal_new',
          updatedAt: Date.now(),
        },
      }),
    });
  });

  await page.addInitScript(({ userId, session }) => {
    const now = Date.now();
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify(session));
    localStorage.setItem(`boss-japan-tracker:state:supabase:${userId}`, JSON.stringify({
      lastTab: 'settings',
      autoSync: true,
      activeTripId: 'trip_old_notion',
      notionDb: '3438d94d5f7c81878221fcda6d65d39d',
      personalNotionConnected: false,
      trips: [{
        id: 'trip_old_notion',
        name: 'Old Notion Trip',
        destinationSummary: 'Old City',
        startDate: '2026-08-01',
        endDate: '2026-08-02',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Tokyo'],
        version: 1,
        active: true,
        notionDb: 'old_trip_db',
        itinerary: [],
        createdAt: now,
        updatedAt: now,
      }],
      receipts: [],
      syncQueue: [],
    }));
  }, { userId, session: sessionPayload() });

  await page.goto('http://localhost:8903/travel-expense/compact/#settings');
  await expect(page.getByText('設定控制中心')).toBeVisible();
  await setAccordion(page, 'Email / Shortcut');
  await expect(page.getByText(/Public Supabase mode 不使用共享 Gmail inbox/)).toBeVisible();
  await expect(page.getByRole('button', { name: /複製 Gmail/ })).toHaveCount(0);
  await setAccordion(page, 'Notion Sync');
  await page.getByLabel('Personal Notion database ID').fill('db_personal_new');
  await page.getByLabel('Personal Notion connector secret').fill('ntn_test_personal_secret');
  await page.getByRole('button', { name: /Connect Personal Notion/ }).click();
  await expect(page.getByText(/Personal Notion 已安全連接/)).toBeVisible();

  expect(connectRequests).toHaveLength(1);
  expect(connectRequests[0].supabaseAuth).toBe('Bearer test-access-token');
  expect(connectRequests[0].brokerSession).toBe('');
  expect(connectRequests[0].body.databaseId).toBe('db_personal_new');

  console.log('DEBUG LOCALSTORAGE:', await page.evaluate(() => JSON.stringify(localStorage, null, 2)));

  await expect.poll(() => page.evaluate((userId) => {
    const state = JSON.parse(localStorage.getItem(`boss-japan-tracker:state:supabase:${userId}`) || '{}');
    const activeTrip = (state.trips || []).find((trip) => trip.id === 'trip_old_notion');
    return {
      notionDb: state.notionDb,
      personalNotionConnected: state.personalNotionConnected,
      activeTripNotionDb: activeTrip?.notionDb,
      queuedTypes: (state.syncQueue || []).map((item) => `${item.type}:${item.entityId}`).sort(),
    };
  }, userId), { timeout: 10000 }).toEqual({
    notionDb: 'db_personal_new',
    personalNotionConnected: true,
    activeTripNotionDb: undefined,
    queuedTypes: ['settings:app-settings'],
  });
});

test('Supabase personal Notion connection mirrors without a broker password session', async ({ page }) => {
  const receiptUpserts = [];
  const receiptIdLookups = [];
  const notionRequests = [];
  const profilePatches = [];

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
      profilePatches.push(body);
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (table === 'trips' && method === 'GET') {
      if (url.searchParams.get('select') === 'id') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: tripUuid }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
      return;
    }
    if (table === 'trips' && method === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ...body,
          id: tripUuid,
          owner_id: userId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      return;
    }
    if (table === 'receipts' && method === 'GET') {
      if (url.searchParams.get('select') === 'id') {
        receiptIdLookups.push({
          ownerId: url.searchParams.get('owner_id'),
          tripId: url.searchParams.get('trip_id'),
          sourceId: url.searchParams.get('source_id'),
        });
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(null) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
      return;
    }
    if (table === 'receipts' && method === 'POST') {
      receiptUpserts.push(body);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ...body,
          id: receiptUuid,
          owner_id: userId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.route('**/notion/request', async (route) => {
    const payload = route.request().postDataJSON();
    notionRequests.push({
      supabaseAuth: route.request().headers()['x-supabase-auth'] || '',
      brokerSession: route.request().headers()['x-travel-session'] || '',
      databaseId: payload.databaseId || '',
      path: payload.path || '',
    });
    const path = String(payload.path || '');
    const method = String(payload.method || 'GET');
    if (payload.databaseId && payload.databaseId !== 'db_mirror') {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Personal Notion request outside registered database' }),
      });
      return;
    }
    let data = { ok: true };
    if (method === 'GET' && /\/databases\//.test(path)) {
      data = schema;
    } else if (method === 'POST' && path.endsWith('/query')) {
      data = { results: [], has_more: false };
    } else if (method === 'POST' && path === '/pages') {
      data = { id: 'notion_page_after_mirror' };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
  });

  await page.addInitScript(({ userId, session }) => {
    const now = Date.now();
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify(session));
    localStorage.setItem(`boss-japan-tracker:state:supabase:${userId}`, JSON.stringify({
      lastTab: 'history',
      autoSync: true,
      activeTripId: 'trip_mirror',
      notionDb: '3438d94d5f7c81878221fcda6d65d39d',
      personalNotionConnected: true,
      trips: [{
        id: 'trip_mirror',
        name: 'Mirror Trip',
        destinationSummary: 'Mirror City',
        startDate: '2026-08-01',
        endDate: '2026-08-02',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Tokyo'],
        version: 2,
        active: true,
        notionDb: 'db_mirror',
        supabaseId: '22222222-2222-4222-8222-222222222222',
        itinerary: [{ date: '2026-08-01', day: 1, region: 'Mirror City', spots: [] }],
        createdAt: now,
        updatedAt: now,
      }],
      receipts: [{
        id: 'receipt_mirror',
        tripId: 'trip_mirror',
        tripVersion: 2,
        store: 'Mirror Cafe',
        total: 1800,
        date: '2026-08-01',
        category: 'food',
        payment: 'cash',
        sourceId: 'receipt_mirror_source',
        createdAt: now,
        updatedAt: now,
        syncStatus: 'queued',
      }],
      syncQueue: [{
        id: 'sync_mirror_receipt',
        type: 'receipt',
        entityId: 'receipt_mirror',
        op: 'create',
        status: 'queued',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
        payload: { sourceId: 'receipt_mirror_source', updatedAt: now },
      }, {
        id: 'sync_mirror_settings',
        type: 'settings',
        entityId: 'app-settings',
        op: 'upsert',
        status: 'queued',
        attempts: 0,
        createdAt: now + 1,
        updatedAt: now + 1,
        payload: { updatedAt: now + 1 },
      }],
    }));
  }, { userId, session: sessionPayload() });

  await page.goto('http://localhost:8903/travel-expense/compact/#history');
  await expect(page.getByText('紀錄中心')).toBeVisible();

  await expect.poll(() => receiptUpserts.length, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
  expect(receiptIdLookups.some((lookup) => (
    lookup.ownerId === `eq.${userId}` &&
    lookup.tripId === `eq.${tripUuid}` &&
    lookup.sourceId === 'eq.receipt_mirror_source'
  ))).toBe(true);
  expect(notionRequests.length).toBeGreaterThan(0);
  expect(notionRequests.every((request) => request.supabaseAuth === 'Bearer test-access-token')).toBe(true);
  expect(notionRequests.every((request) => !request.brokerSession)).toBe(true);
  expect(notionRequests.every((request) => request.databaseId === 'db_mirror')).toBe(true);
  await expect.poll(() => profilePatches.some((patch) => patch?.app_settings?.notionDb === 'db_mirror'), { timeout: 10000 }).toBe(true);
  expect(profilePatches.every((patch) => patch?.app_settings?.notionDb !== '3438d94d5f7c81878221fcda6d65d39d')).toBe(true);
  expect(receiptUpserts[0].notion_page_id).toBeNull();
  expect(receiptUpserts.at(-1).notion_page_id).toBeNull();
  expect(receiptUpserts.at(-1).notion_database_id).toBeNull();
});

test('Supabase profile settings stay authoritative over stale Notion meta in public mode', async ({ page }) => {
  const now = Date.now();
  let settingsMetaQueries = 0;
  const supabaseTripRow = {
    id: tripUuid,
    owner_id: userId,
    name: 'Supabase Trip',
    destination_summary: 'Supabase City',
    start_date: '2026-08-01',
    end_date: '2026-08-02',
    home_currency: 'HKD',
    trip_currency: 'JPY',
    timezones: ['Asia/Tokyo'],
    budget_amount: 0,
    budget_currency: 'HKD',
    active: true,
    legacy_source_id: 'trip_supabase',
    itinerary: [],
    app_metadata: { sourceId: 'trip_trip_supabase' },
    version: 1,
    archived: false,
    notion_page_id: null,
    notion_database_id: 'db_mirror',
    created_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
  };
  const notionMetaPage = pageFixture('notion_meta_settings', {
    '備註': text(JSON.stringify({
      activeTripId: 'notion_foreign_trip',
      trips: [{
        id: 'notion_foreign_trip',
        name: 'Foreign Notion Trip',
        destinationSummary: 'Other Account',
        startDate: '2026-12-01',
        endDate: '2026-12-02',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Tokyo'],
        active: true,
        itinerary: [],
      }],
      settingsUpdatedAt: now + 100_000,
    })),
  });

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
    if (table === 'profiles' && method === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: userId }]) });
      return;
    }
    if (table === 'profiles' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          app_settings: {
            activeTripId: 'trip_supabase',
            settingsUpdatedAt: now + 1_000,
          },
        }),
      });
      return;
    }
    if (table === 'trips' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([supabaseTripRow]) });
      return;
    }
    if (table === 'receipts' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.route('**/notion/request', async (route) => {
    const payload = route.request().postDataJSON();
    const path = String(payload.path || '');
    const method = String(payload.method || 'GET');
    const bodyText = JSON.stringify(payload.body || {});
    let data = { ok: true };
    if (method === 'GET' && /\/databases\//.test(path)) {
      data = schema;
    } else if (method === 'POST' && path.endsWith('/query') && bodyText.includes('__meta_settings__')) {
      settingsMetaQueries += 1;
      data = { results: [notionMetaPage], has_more: false };
    } else if (method === 'GET' && path === '/pages/notion_meta_settings') {
      data = notionMetaPage;
    } else if (method === 'POST' && path.endsWith('/query')) {
      data = { results: [], has_more: false };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
  });

  await page.addInitScript(({ userId, session, now }) => {
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify(session));
    localStorage.setItem(`boss-japan-tracker:state:supabase:${userId}`, JSON.stringify({
      lastTab: 'history',
      autoSync: false,
      activeTripId: 'trip_local',
      notionDb: 'default_db',
      personalNotionConnected: true,
      settingsUpdatedAt: now,
      trips: [{
        id: 'trip_local',
        name: 'Local Trip',
        destinationSummary: 'Local City',
        startDate: '2026-08-01',
        endDate: '2026-08-02',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Tokyo'],
        version: 1,
        active: true,
        notionDb: 'db_mirror',
        itinerary: [],
        createdAt: now,
        updatedAt: now,
      }],
      receipts: [],
      syncQueue: [],
    }));
  }, { userId, session: sessionPayload(), now });

  await page.goto('http://localhost:8903/travel-expense/compact/#history');
  await expect(page.getByText('紀錄中心')).toBeVisible();
  await page.getByRole('button', { name: '重新同步' }).click();

  await expect.poll(() => page.evaluate((userId) => {
    const state = JSON.parse(localStorage.getItem(`boss-japan-tracker:state:supabase:${userId}`) || '{}');
    return { activeTripId: state.activeTripId, tripNames: (state.trips || []).map((trip) => trip.name) };
  }, userId), { timeout: 10000 }).toEqual({
    activeTripId: 'trip_supabase',
    tripNames: ['Local Trip', 'Supabase Trip'],
  });
  const tripNames = await page.evaluate((userId) => {
    const state = JSON.parse(localStorage.getItem(`boss-japan-tracker:state:supabase:${userId}`) || '{}');
    return (state.trips || []).map((trip) => trip.name);
  }, userId);
  expect(tripNames).not.toContain('Foreign Notion Trip');
  expect(settingsMetaQueries).toBe(0);
});

test('Supabase pull ignores stale profile activeTripId that is not in the user trip list', async ({ page }) => {
  const now = Date.now();
  const supabaseTripRow = {
    id: tripUuid,
    owner_id: userId,
    name: 'Valid Supabase Trip',
    destination_summary: 'Valid City',
    start_date: '2026-10-01',
    end_date: '2026-10-03',
    home_currency: 'HKD',
    trip_currency: 'JPY',
    timezones: ['Asia/Tokyo'],
    budget_amount: 0,
    budget_currency: 'HKD',
    active: true,
    legacy_source_id: 'trip_valid_supabase',
    itinerary: [],
    app_metadata: { sourceId: 'trip_trip_valid_supabase' },
    version: 1,
    archived: false,
    notion_page_id: null,
    notion_database_id: null,
    created_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
  };

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
    if (table === 'profiles' && method === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: userId }]) });
      return;
    }
    if (table === 'profiles' && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          app_settings: {
            activeTripId: 'foreign_or_deleted_trip',
            settingsUpdatedAt: now + 10_000,
          },
        }),
      });
      return;
    }
    if (table === 'trips' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([supabaseTripRow]) });
      return;
    }
    if (table === 'receipts' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.addInitScript(({ userId, session, now }) => {
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify(session));
    localStorage.setItem(`boss-japan-tracker:state:supabase:${userId}`, JSON.stringify({
      lastTab: 'history',
      autoSync: false,
      activeTripId: 'trip_local',
      settingsUpdatedAt: now,
      trips: [{
        id: 'trip_local',
        name: 'Local Trip',
        destinationSummary: 'Local City',
        startDate: '2026-09-01',
        endDate: '2026-09-02',
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
      syncQueue: [],
    }));
  }, { userId, session: sessionPayload(), now });

  await page.goto('http://localhost:8903/travel-expense/compact/#history');
  await expect(page.getByText('紀錄中心')).toBeVisible();
  await page.getByRole('button', { name: '重新同步' }).click();

  await expect.poll(() => page.evaluate((userId) => {
    const state = JSON.parse(localStorage.getItem(`boss-japan-tracker:state:supabase:${userId}`) || '{}');
    return {
      activeTripId: state.activeTripId,
      activeFlags: (state.trips || []).map((trip) => ({ id: trip.id, active: trip.active, archived: !!trip.archived })),
    };
  }, userId), { timeout: 10000 }).toEqual({
    activeTripId: 'trip_valid_supabase',
    activeFlags: [
      { id: 'trip_local', active: false, archived: false },
      { id: 'trip_valid_supabase', active: true, archived: false },
    ],
  });
});

test('Supabase public account without own Notion database does not use shared Notion mirror', async ({ page }) => {
  const receiptUpserts = [];
  const notionRequests = [];

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
    const body = route.request().postDataJSON?.();

    if (table === 'profiles' && method === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: userId }]) });
      return;
    }
    if (table === 'profiles' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ app_settings: {} }) });
      return;
    }
    if (table === 'trips' && method === 'GET') {
      if (url.searchParams.get('select') === 'id') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: tripUuid }) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
      return;
    }
    if (table === 'trips' && method === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ...body,
          id: tripUuid,
          owner_id: userId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      return;
    }
    if (table === 'receipts' && method === 'GET') {
      if (url.searchParams.get('select') === 'id') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(null) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
      return;
    }
    if (table === 'receipts' && method === 'POST') {
      receiptUpserts.push(body);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ...body,
          id: receiptUuid,
          owner_id: userId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.route('**/notion/request', async (route) => {
    notionRequests.push(route.request().postDataJSON());
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Notion should not be called without a user-scoped DB' }) });
  });

  await page.addInitScript(({ userId, session }) => {
    const now = Date.now();
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify(session));
    localStorage.setItem(`boss-japan-tracker:state:supabase:${userId}`, JSON.stringify({
      lastTab: 'history',
      autoSync: true,
      activeTripId: 'trip_public_only',
      notionDb: '3438d94d5f7c81878221fcda6d65d39d',
      credentialSession: 'public-user-broker-session',
      credentialSessionExpiresAt: now + 60_000,
      trips: [{
        id: 'trip_public_only',
        name: 'Public Only Trip',
        destinationSummary: 'Public City',
        startDate: '2026-09-01',
        endDate: '2026-09-02',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Tokyo'],
        version: 1,
        active: true,
        supabaseId: '22222222-2222-4222-8222-222222222222',
        itinerary: [{ date: '2026-09-01', day: 1, region: 'Public City', spots: [] }],
        createdAt: now,
        updatedAt: now,
      }],
      receipts: [{
        id: 'receipt_public_only',
        tripId: 'trip_public_only',
        tripVersion: 1,
        store: 'Public Cafe',
        total: 1200,
        date: '2026-09-01',
        category: 'food',
        payment: 'cash',
        sourceId: 'receipt_public_source',
        createdAt: now,
        updatedAt: now,
        syncStatus: 'queued',
      }],
      syncQueue: [{
        id: 'sync_public_receipt',
        type: 'receipt',
        entityId: 'receipt_public_only',
        op: 'create',
        status: 'queued',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
        payload: { sourceId: 'receipt_public_source', updatedAt: now },
      }],
    }));
  }, { userId, session: sessionPayload() });

  await page.goto('http://localhost:8903/travel-expense/compact/#history');
  await expect(page.getByText('紀錄中心')).toBeVisible();

  await expect.poll(() => receiptUpserts.length, { timeout: 10000 }).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(1500);
  expect(notionRequests).toHaveLength(0);
  expect(receiptUpserts.at(-1).notion_page_id).toBeNull();
  expect(receiptUpserts.at(-1).notion_database_id).toBeNull();
});
