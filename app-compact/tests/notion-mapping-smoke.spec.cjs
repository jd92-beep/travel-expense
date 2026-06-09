const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

function title(content) {
  return { id: 'title', type: 'title', title: [{ plain_text: content, text: { content } }] };
}

function text(content) {
  return { type: 'rich_text', rich_text: content ? [{ plain_text: content, text: { content } }] : [] };
}

function select(name) {
  return { type: 'select', select: name ? { name } : null };
}

function number(value) {
  return { type: 'number', number: value };
}

function date(start) {
  return { type: 'date', date: start ? { start } : null };
}

function url(value) {
  return { type: 'url', url: value || null };
}

const schema = {
  properties: {
    '店名': { type: 'title' },
    '金額': { type: 'number' },
    '💴 金額 ¥': { type: 'number' },
    '日期': { type: 'date' },
    '📅 日期': { type: 'date' },
    '類別': { type: 'select' },
    '🗂 類別': { type: 'select' },
    '支付': { type: 'select' },
    '💳 支付': { type: 'select' },
    '地區': { type: 'rich_text' },
    '📍 地區': { type: 'rich_text' },
    '品項': { type: 'rich_text' },
    '🧾 品項': { type: 'rich_text' },
    '備註': { type: 'rich_text' },
    '📝 備註': { type: 'rich_text' },
    '旅伴': { type: 'rich_text' },
    '👥 旅伴': { type: 'rich_text' },
    'SourceID': { type: 'rich_text' },
    '🔑 SourceID': { type: 'rich_text' },
    'HKD': { type: 'number' },
    '💵 HKD': { type: 'number' },
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
    '📷 收據相片': { type: 'files' },
    'Active': { type: 'checkbox' },
  },
};

function pageFixture(id, properties) {
  return {
    id,
    object: 'page',
    url: `https://www.notion.so/${id}`,
    created_time: '2026-05-17T00:00:00.000Z',
    last_edited_time: '2026-05-17T00:00:00.000Z',
    archived: false,
    in_trash: false,
    properties,
  };
}

const pages = [
  pageFixture('settings_row', {
    '店名': title('⚙️ App Settings（請勿刪除）'),
    'Object Type': select('settings'),
    'SourceID': text(''),
    '🔑 SourceID': text('__meta_settings__'),
    '備註': text(''),
    '📝 備註': text('{"budget":1000}'),
  }),
  pageFixture('itinerary_row', {
    '店名': title('🗓 行程更新：黑部立山三日遊'),
    'Object Type': select('receipt'),
    'SourceID': text('email_trip_iu_0'),
    '🔑 SourceID': text('notion_trip_alt'),
    '品項': text('[行程更新]'),
    '類別': select('當地旅遊'),
    '🗂 類別': select('其他'),
    '支付': select('信用卡'),
    '💳 支付': select('現金'),
    '金額': number(0),
  }),
  pageFixture('conflict_row', {
    '店名': title('Conflict Rail'),
    'Object Type': select('receipt'),
    'SourceID': text('r_conflict'),
    '🔑 SourceID': text('alt_conflict'),
    '金額': number(2860),
    '💴 金額 ¥': number(9999),
    '日期': date('2026-04-21'),
    '📅 日期': date('2026-04-20'),
    '類別': select('交通'),
    '🗂 類別': select('其他'),
    '支付': select('信用卡'),
    '💳 支付': select('現金'),
    '地區': text('名古屋'),
    '📍 地區': text('東京'),
    '品項': text('Meitetsu ticket'),
    '備註': text('plain note'),
    '旅伴': text('👦 User 1'),
    'HKD': number(140),
    '💵 HKD': number(500),
    'Currency': select('JPY'),
    'Original Amount': number(2860),
    'Exchange Rate': number(20.4),
    '🔒 類型': select('👫 共同'),
  }),
  pageFixture('meta_row', {
    '店名': title('Meta Hotel'),
    'Object Type': select('receipt'),
    'SourceID': text('email_meta_hotel'),
    '金額': number(12345),
    '日期': date('2026-04-22'),
    '類別': select('住宿'),
    '支付': select('信用卡'),
    '備註': text('📍 名古屋駅 | 🔖 KNR358047 | ⏰ 18:30\nlate arrival'),
    '品項': text('1 night stay'),
    '旅伴': text('👦 User 1'),
    'HKD': number(606),
    'Currency': select('JPY'),
    'Original Amount': number(12345),
    'Exchange Rate': number(20.36),
    '🗺️ 地址': text(''),
    '🎫 Booking Ref': text(''),
    '⏰ 時間': text(''),
    '🔒 類型': select('👫 共同'),
  }),
  pageFixture('flight_row', {
    '店名': title('HK Express UO690 HKG→NGO'),
    'Object Type': select('receipt'),
    'SourceID': text('email_19da3eb4e2628ae9_0'),
    '金額': number(66170),
    '日期': date('2026-04-20'),
    '類別': select('交通'),
    '支付': select('信用卡'),
    '備註': text('⏰ 10:50 HKT | [📧 hkexpress] TD87QN'),
    '品項': text('去程 · 2 位 · UO690'),
    '旅伴': text('👦 User 1'),
    'HKD': number(3250),
    'Currency': select('JPY'),
    'Original Amount': number(66170),
    'Exchange Rate': number(20.36),
    '🔒 類型': select('👫 共同'),
    'Map URL': url('https://maps.example/uo690'),
  }),
];

async function routeNotion(page) {
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/notion/request', async (route) => {
    const payload = route.request().postDataJSON();
    const path = String(payload.path || '');
    let data;
    if (payload.method === 'GET' && /\/databases\//.test(path)) {
      data = schema;
    } else if (payload.method === 'POST' && path.endsWith('/query')) {
      data = { results: pages, has_more: false };
    } else {
      data = { ok: true };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data }),
    });
  });
}

async function openAccordion(page, title) {
  const button = page.getByRole('button', { name: new RegExp(title) });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}

test('React Notion pull prefers plain fields, skips itinerary/settings rows, and recovers structured note meta', async ({ page }) => {
  await routeNotion(page);
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'mapping-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'history',
      receipts: [],
      tripDateRange: { start: '2026-04-20', end: '2026-04-25' },
      activeTripId: 'trip_2026_04_nagoya',
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.locator('header h1').first()).toContainText('紀錄中心');
  await expect(page.locator('.receipt-row').filter({ hasText: 'Conflict Rail' })).toContainText('JPY2,860');
  await expect(page.getByText('🗓 行程更新：黑部立山三日遊')).toHaveCount(0);
  await expect(page.getByText('⚙️ App Settings（請勿刪除）')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /HK Express UO690 HKG→NGO/ })).toBeVisible();
  await expect.poll(async () => {
    return page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('boss-japan-tracker') || '{}');
      return (state.receipts || []).find((receipt) => receipt.sourceId === 'email_19da3eb4e2628ae9_0');
    });
  }).toMatchObject({
    store: 'HK Express UO690 HKG→NGO',
    total: 66170,
    date: '2026-04-20',
    category: 'flight',
    payment: 'credit',
    itemsText: '去程 · 2 位 · UO690',
    note: '',
    bookingRef: 'TD87QN',
    mapUrl: 'https://maps.example/uo690',
  });
  await expect.poll(async () => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('boss-japan-tracker') || '{}');
    const receipt = (state.receipts || []).find((item) => item.sourceId === 'email_19da3eb4e2628ae9_0');
    return receipt?.photoUrl || '';
  })).toBe('');

  await expect.poll(async () => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('boss-japan-tracker') || '{}');
    return (state.receipts || []).find((receipt) => receipt.sourceId === 'email_meta_hotel');
  })).toMatchObject({
    store: 'Meta Hotel',
    time: '18:30',
    address: '名古屋駅',
    bookingRef: 'KNR358047',
  });
});

test('Settings mapping diagnostics stay read-only and surface mixed-schema issues', async ({ page }) => {
  await routeNotion(page);
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'mapping-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'settings',
      receipts: [],
      tripDateRange: { start: '2026-04-20', end: '2026-04-25' },
      activeTripId: 'trip_2026_04_nagoya',
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.getByText('設定控制中心')).toBeVisible();
  await openAccordion(page, 'Notion Sync');
  await page.getByRole('button', { name: '檢查 Mapping' }).click();
  await expect(page.getByText(/已掃描 .*issues/)).toBeVisible();
  await expect(page.getByText('conflicting-duplicate')).toHaveCount(7);
  await expect(page.getByText('meta-fallback')).toHaveCount(5);
  await expect(page.getByText('skipped-row')).toHaveCount(2);
});

test('Notion receipt push uses the receipt trip database even when another trip is active', async ({ page }) => {
  const requestLog = [];
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/notion/request', async (route) => {
    const payload = route.request().postDataJSON();
    requestLog.push({
      method: payload.method,
      path: payload.path,
      body: payload.body,
      databaseId: payload.databaseId,
    });
    const path = String(payload.path || '');
    const method = String(payload.method || 'GET');
    let data = { ok: true };
    if (method === 'GET' && /\/databases\//.test(path)) {
      data = schema;
    } else if (method === 'POST' && path.endsWith('/query')) {
      data = { results: [], has_more: false };
    } else if (method === 'POST' && path === '/pages') {
      data = { id: 'page_trip_a_receipt' };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data }),
    });
  });

  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    const now = Date.now();
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: now + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'push-trip-db-session',
      credentialSessionExpiresAt: now + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'history',
      autoSync: true,
      activeTripId: 'trip_b',
      notionDb: 'default_db',
      trips: [
        {
          id: 'trip_a',
          name: 'Trip A',
          destinationSummary: 'A City',
          startDate: '2026-06-01',
          endDate: '2026-06-02',
          homeCurrency: 'HKD',
          currencies: ['HKD', 'JPY'],
          timezones: ['Asia/Tokyo'],
          version: 7,
          active: false,
          notionDb: 'db_trip_a',
          itinerary: [{ date: '2026-06-01', day: 1, region: 'A City', spots: [] }],
          createdAt: now - 1000,
          updatedAt: now - 1000,
        },
        {
          id: 'trip_b',
          name: 'Trip B',
          destinationSummary: 'B City',
          startDate: '2026-07-01',
          endDate: '2026-07-02',
          homeCurrency: 'HKD',
          currencies: ['HKD', 'JPY'],
          timezones: ['Asia/Tokyo'],
          version: 3,
          active: true,
          notionDb: 'db_trip_b',
          itinerary: [{ date: '2026-07-01', day: 1, region: 'B City', spots: [] }],
          createdAt: now,
          updatedAt: now,
        },
      ],
      receipts: [{
        id: 'receipt_trip_a',
        tripId: 'trip_a',
        tripVersion: 7,
        store: 'Trip A Cafe',
        total: 1200,
        date: '2026-06-01',
        category: 'food',
        payment: 'cash',
        sourceId: 'receipt_trip_a_source',
        createdAt: now,
        updatedAt: now,
        syncStatus: 'queued',
      }],
      syncQueue: [{
        id: 'sync_trip_a_receipt',
        type: 'receipt',
        entityId: 'receipt_trip_a',
        op: 'create',
        status: 'queued',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
        payload: { sourceId: 'receipt_trip_a_source', updatedAt: now },
      }],
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.locator('header h1').first()).toContainText('紀錄中心');

  await expect.poll(() => requestLog.some((entry) => entry.path === '/pages')).toBe(true);
  const sourceLookup = requestLog.find((entry) => String(entry.path).endsWith('/query') && entry.body?.filter?.and);
  expect(sourceLookup.body.filter.and).toEqual([
    { property: 'SourceID', rich_text: { equals: 'receipt_trip_a_source' } },
    { property: 'TripID', rich_text: { equals: 'trip_a' } },
  ]);
  const pageCreate = requestLog.find((entry) => entry.path === '/pages');
  expect(pageCreate.body.parent.database_id).toBe('db_trip_a');
  expect(requestLog.some((entry) => String(entry.path).includes('/databases/db_trip_a/'))).toBe(true);
  expect(pageCreate.body.properties.TripID.rich_text[0].text.content).toBe('trip_a');
  expect(pageCreate.body.properties['Trip Version'].number).toBe(7);
});

test('Personal Notion app database overrides stale active trip database', async ({ page }) => {
  const requestLog = [];
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/notion/request', async (route) => {
    const payload = route.request().postDataJSON();
    requestLog.push({
      method: payload.method,
      path: payload.path,
      body: payload.body,
      databaseId: payload.databaseId,
    });
    const path = String(payload.path || '');
    const method = String(payload.method || 'GET');
    let data = { ok: true };
    if (method === 'GET' && /\/databases\//.test(path)) {
      data = schema;
    } else if (method === 'POST' && path.endsWith('/query')) {
      data = { results: [], has_more: false };
    } else if (method === 'POST' && path === '/pages') {
      data = { id: 'page_user_b_receipt' };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data }),
    });
  });

  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    const now = Date.now();
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: now + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'personal-db-session',
      credentialSessionExpiresAt: now + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'history',
      autoSync: true,
      activeTripId: 'trip_user_b',
      notionDb: 'db_user_b',
      personalNotionConnected: true,
      trips: [{
        id: 'trip_user_b',
        name: 'User B Trip',
        destinationSummary: 'B City',
        startDate: '2026-08-01',
        endDate: '2026-08-02',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Tokyo'],
        version: 1,
        active: true,
        notionDb: 'db_user_a_stale',
        itinerary: [{ date: '2026-08-01', day: 1, region: 'B City', spots: [] }],
        createdAt: now,
        updatedAt: now,
      }],
      receipts: [{
        id: 'receipt_user_b',
        tripId: 'trip_user_b',
        store: 'User B Cafe',
        total: 800,
        date: '2026-08-01',
        category: 'food',
        payment: 'cash',
        sourceId: 'receipt_user_b_source',
        createdAt: now,
        updatedAt: now,
        syncStatus: 'queued',
      }],
      syncQueue: [{
        id: 'sync_user_b_receipt',
        type: 'receipt',
        entityId: 'receipt_user_b',
        op: 'create',
        status: 'queued',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
        payload: { sourceId: 'receipt_user_b_source', updatedAt: now },
      }],
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.locator('header h1').first()).toContainText('紀錄中心');

  await expect.poll(() => requestLog.some((entry) => entry.path === '/pages')).toBe(true);
  const pageCreate = requestLog.find((entry) => entry.path === '/pages');
  expect(pageCreate.body.parent.database_id).toBe('db_user_b');
  expect(JSON.stringify(requestLog)).not.toContain('db_user_a_stale');
});

test('Notion pull does not let a legacy SourceID tombstone hide another trip receipt', async ({ page }) => {
  const sharedPage = pageFixture('shared_source_trip_b_page', {
    '店名': title('Trip B Shared Source Cafe'),
    'Object Type': select('receipt'),
    'SourceID': text('shared_source'),
    '金額': number(880),
    '日期': date('2026-07-01'),
    '類別': select('飲食'),
    '支付': select('現金'),
    'TripID': text('trip_b'),
    'Trip Version': number(3),
  });

  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/notion/request', async (route) => {
    const payload = route.request().postDataJSON();
    const path = String(payload.path || '');
    let data;
    if (payload.method === 'GET' && /\/databases\//.test(path)) {
      data = schema;
    } else if (payload.method === 'POST' && path.endsWith('/query')) {
      data = { results: [sharedPage], has_more: false };
    } else {
      data = { ok: true };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data }),
    });
  });

  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    const now = Date.now();
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: now + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'pull-tombstone-session',
      credentialSessionExpiresAt: now + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'history',
      receipts: [],
      activeTripId: 'trip_b',
      notionDb: 'db_trip_b',
      trips: [
        {
          id: 'trip_a',
          name: 'Trip A',
          destinationSummary: 'A City',
          startDate: '2026-06-01',
          endDate: '2026-06-02',
          homeCurrency: 'HKD',
          currencies: ['HKD', 'JPY'],
          timezones: ['Asia/Tokyo'],
          version: 2,
          active: false,
          notionDb: 'db_trip_a',
          itinerary: [],
          createdAt: now - 1000,
          updatedAt: now - 1000,
        },
        {
          id: 'trip_b',
          name: 'Trip B',
          destinationSummary: 'B City',
          startDate: '2026-07-01',
          endDate: '2026-07-02',
          homeCurrency: 'HKD',
          currencies: ['HKD', 'JPY'],
          timezones: ['Asia/Tokyo'],
          version: 3,
          active: true,
          notionDb: 'db_trip_b',
          itinerary: [],
          createdAt: now,
          updatedAt: now,
        },
      ],
      notionDeletedSourceIds: ['shared_source'],
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.locator('header h1').first()).toContainText('紀錄中心');
  await expect(page.locator('.receipt-row').filter({ hasText: 'Trip B Shared Source Cafe' })).toContainText('JPY880');
});

test('Notion pull assigns legacy rows without TripID by receipt date instead of active trip', async ({ page }) => {
  const legacyPage = pageFixture('legacy_trip_a_page', {
    '店名': title('Legacy Trip A Cafe'),
    'Object Type': select('receipt'),
    'SourceID': text('legacy_no_trip_id'),
    '金額': number(660),
    '日期': date('2026-06-01'),
    '類別': select('飲食'),
    '支付': select('現金'),
  });

  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/notion/request', async (route) => {
    const payload = route.request().postDataJSON();
    const path = String(payload.path || '');
    let data;
    if (payload.method === 'GET' && /\/databases\//.test(path)) {
      data = schema;
    } else if (payload.method === 'POST' && path.endsWith('/query')) {
      data = { results: [legacyPage], has_more: false };
    } else {
      data = { ok: true };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data }),
    });
  });

  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    const now = Date.now();
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: now + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'legacy-trip-date-session',
      credentialSessionExpiresAt: now + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'history',
      receipts: [],
      activeTripId: 'trip_b',
      notionDb: 'db_trip_b',
      tripDateRange: { start: '2026-07-01', end: '2026-07-02' },
      trips: [
        {
          id: 'trip_a',
          name: 'Trip A',
          destinationSummary: 'A City',
          startDate: '2026-06-01',
          endDate: '2026-06-02',
          homeCurrency: 'HKD',
          currencies: ['HKD', 'JPY'],
          timezones: ['Asia/Tokyo'],
          version: 2,
          active: false,
          notionDb: 'db_trip_a',
          itinerary: [],
          createdAt: now - 1000,
          updatedAt: now - 1000,
        },
        {
          id: 'trip_b',
          name: 'Trip B',
          destinationSummary: 'B City',
          startDate: '2026-07-01',
          endDate: '2026-07-02',
          homeCurrency: 'HKD',
          currencies: ['HKD', 'JPY'],
          timezones: ['Asia/Tokyo'],
          version: 3,
          active: true,
          notionDb: 'db_trip_b',
          itinerary: [],
          createdAt: now,
          updatedAt: now,
        },
      ],
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.locator('header h1').first()).toContainText('紀錄中心');
  await expect.poll(async () => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('boss-japan-tracker') || '{}');
    const receipt = (state.receipts || []).find((item) => item.sourceId === 'legacy_no_trip_id');
    return receipt ? { tripId: receipt.tripId, total: receipt.total, store: receipt.store } : null;
  }), { timeout: 10000 }).toEqual({ tripId: 'trip_a', total: 660, store: 'Legacy Trip A Cafe' });
});

test('Personal Notion pull skips rows without a known TripID', async ({ page }) => {
  const foreignPage = pageFixture('foreign_trip_page', {
    '店名': title('Foreign Trip Cafe'),
    'Object Type': select('receipt'),
    'SourceID': text('foreign_trip_source'),
    '金額': number(990),
    '日期': date('2026-07-01'),
    '類別': select('飲食'),
    '支付': select('現金'),
    'TripID': text('trip_foreign'),
  });
  const missingTripPage = pageFixture('missing_trip_page', {
    '店名': title('Missing Trip Cafe'),
    'Object Type': select('receipt'),
    'SourceID': text('missing_trip_source'),
    '金額': number(880),
    '日期': date('2026-07-01'),
    '類別': select('飲食'),
    '支付': select('現金'),
  });
  const knownPage = pageFixture('known_trip_page', {
    '店名': title('Known Trip Cafe'),
    'Object Type': select('receipt'),
    'SourceID': text('known_trip_source'),
    '金額': number(770),
    '日期': date('2026-07-01'),
    '類別': select('飲食'),
    '支付': select('現金'),
    'TripID': text('trip_b'),
  });

  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/notion/request', async (route) => {
    const payload = route.request().postDataJSON();
    const path = String(payload.path || '');
    let data;
    if (payload.method === 'GET' && /\/databases\//.test(path)) {
      data = schema;
    } else if (payload.method === 'POST' && path.endsWith('/query')) {
      data = { results: [foreignPage, missingTripPage, knownPage], has_more: false };
    } else {
      data = { ok: true };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data }),
    });
  });

  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    const now = Date.now();
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: now + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'personal-tripid-session',
      credentialSessionExpiresAt: now + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'history',
      receipts: [],
      activeTripId: 'trip_b',
      notionDb: 'db_user_b',
      personalNotionConnected: true,
      trips: [{
        id: 'trip_b',
        name: 'Trip B',
        destinationSummary: 'B City',
        startDate: '2026-07-01',
        endDate: '2026-07-02',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Tokyo'],
        version: 3,
        active: true,
        notionDb: 'db_user_b',
        itinerary: [],
        createdAt: now,
        updatedAt: now,
      }],
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.locator('header h1').first()).toContainText('紀錄中心');
  await expect.poll(async () => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('boss-japan-tracker') || '{}');
    return (state.receipts || []).map((receipt) => ({
      sourceId: receipt.sourceId,
      tripId: receipt.tripId,
      store: receipt.store,
    })).sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  }), { timeout: 10000 }).toEqual([
    { sourceId: 'known_trip_source', tripId: 'trip_b', store: 'Known Trip Cafe' },
  ]);
});

test('Notion receipt archive uses the deleted receipt trip database even after active trip changes', async ({ page }) => {
  const requestLog = [];
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/notion/request', async (route) => {
    const payload = route.request().postDataJSON();
    requestLog.push({
      method: payload.method,
      path: payload.path,
      body: payload.body,
      databaseId: payload.databaseId,
    });
    const path = String(payload.path || '');
    let data = { ok: true };
    if (payload.method === 'GET' && /\/databases\//.test(path)) {
      data = schema;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data }),
    });
  });

  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    const now = Date.now();
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: now + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'archive-trip-db-session',
      credentialSessionExpiresAt: now + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'history',
      autoSync: true,
      activeTripId: 'trip_b',
      notionDb: 'default_db',
      trips: [
        {
          id: 'trip_a',
          name: 'Trip A',
          destinationSummary: 'A City',
          startDate: '2026-06-01',
          endDate: '2026-06-02',
          homeCurrency: 'HKD',
          currencies: ['HKD', 'JPY'],
          timezones: ['Asia/Tokyo'],
          version: 7,
          active: false,
          notionDb: 'db_trip_a',
          itinerary: [],
          createdAt: now - 1000,
          updatedAt: now - 1000,
        },
        {
          id: 'trip_b',
          name: 'Trip B',
          destinationSummary: 'B City',
          startDate: '2026-07-01',
          endDate: '2026-07-02',
          homeCurrency: 'HKD',
          currencies: ['HKD', 'JPY'],
          timezones: ['Asia/Tokyo'],
          version: 3,
          active: true,
          notionDb: 'db_trip_b',
          itinerary: [],
          createdAt: now,
          updatedAt: now,
        },
      ],
      receipts: [],
      syncQueue: [{
        id: 'sync_archive_trip_a_receipt',
        type: 'delete-receipt',
        entityId: 'receipt_trip_a_deleted',
        op: 'delete',
        status: 'queued',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
        payload: {
          notionPageId: 'page_trip_a_deleted',
          sourceId: 'receipt_trip_a_source',
          tripId: 'trip_a',
          updatedAt: now,
        },
      }],
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.locator('header h1').first()).toContainText('紀錄中心');

  await expect.poll(() => requestLog.some((entry) => entry.path === '/pages/page_trip_a_deleted')).toBe(true);
  const archivePatchIndex = requestLog.findIndex((entry) => entry.path === '/pages/page_trip_a_deleted');
  const schemaBeforeArchive = requestLog
    .slice(0, archivePatchIndex)
    .filter((entry) => String(entry.path).includes('/databases/'))
    .at(-1);
  expect(schemaBeforeArchive.path).toContain('/databases/db_trip_a');
  const archivePatch = requestLog[archivePatchIndex];
  expect(archivePatch.method).toBe('PATCH');
  expect(archivePatch.body.archived).toBe(true);
});
