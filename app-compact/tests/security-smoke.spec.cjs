const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });
const APP_ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://localhost:8903';

function expectedAuthRedirect() {
  const configured = String(process.env.VITE_COMPACT_PUBLIC_URL || '').trim();
  if (configured) return new URL(configured).toString();
  return `${APP_ORIGIN}/travel-expense/compact/`;
}

function grantDeviceTrust() {
  localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
}

function stateWithTrip(tripId = 'security_trip', lastTab = 'dashboard') {
  return {
    schemaVersion: 3,
    lastTab,
    budget: 10000,
    tripCurrency: 'JPY',
    tripName: 'Security Trip',
    tripDateRange: { start: '2026-05-01', end: '2026-05-02' },
    activeTripId: tripId,
    trips: [{
      id: tripId,
      name: 'Security Trip',
      destinationSummary: 'Security City',
      startDate: '2026-05-01',
      endDate: '2026-05-02',
      homeCurrency: 'HKD',
      currencies: ['HKD', 'JPY'],
      timezones: ['Asia/Tokyo'],
      version: 1,
      active: true,
      itinerary: [{ date: '2026-05-01', day: 1, region: 'Security City', spots: [] }],
      createdAt: 1,
      updatedAt: 1,
    }],
    receipts: [],
  };
}

test('Sensitive legacy fields are stripped from localStorage, IndexedDB, and service workers', async ({ page }) => {
  test.skip(process.env.SUPABASE_REDIRECT_SMOKE === '1', 'Run this local-storage security smoke without Supabase env.');
  await page.addInitScript(() => {
    localStorage.clear();
    indexedDB.deleteDatabase('travel-expense-react');
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'security-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'settings',
      autoSync: false,
      receipts: [],
      notionToken: 'legacy-notion-placeholder',
      apiKey: 'legacy-api-placeholder',
      kimiKey: 'legacy-kimi-placeholder',
      googleKey: 'legacy-google-placeholder',
      credentialSession: 'legacy-session-placeholder',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
  });

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/`);
  await expect(page.getByRole('navigation', { name: '主要分頁' })).toBeVisible();
  await page.waitForTimeout(500);

  const mainStore = await page.evaluate(() => localStorage.getItem('boss-japan-tracker') || '');
  expect(mainStore).not.toContain('legacy-notion-placeholder');
  expect(mainStore).not.toContain('legacy-api-placeholder');
  expect(mainStore).not.toContain('legacy-kimi-placeholder');
  expect(mainStore).not.toContain('legacy-google-placeholder');
  expect(mainStore).not.toContain('legacy-session-placeholder');
  expect(mainStore).not.toContain('notionToken');
  expect(mainStore).not.toContain('kimiKey');
  expect(mainStore).not.toContain('googleKey');
  expect(mainStore).not.toContain('credentialSession');

  const indexedSnapshot = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('travel-expense-react', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readonly');
      const req = tx.objectStore('state').get('app-state');
      req.onsuccess = () => {
        db.close();
        resolve(JSON.stringify(req.result || {}));
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  });
  expect(indexedSnapshot).not.toContain('legacy-notion-placeholder');
  expect(indexedSnapshot).not.toContain('legacy-api-placeholder');
  expect(indexedSnapshot).not.toContain('legacy-kimi-placeholder');
  expect(indexedSnapshot).not.toContain('legacy-google-placeholder');
  expect(indexedSnapshot).not.toContain('legacy-session-placeholder');
  expect(indexedSnapshot).not.toContain('notionToken');
  expect(indexedSnapshot).not.toContain('credentialSession');

  const serviceWorkers = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return [];
    return (await navigator.serviceWorker.getRegistrations()).map((registration) => registration.active?.scriptURL || registration.installing?.scriptURL || registration.waiting?.scriptURL || '');
  });
  expect(serviceWorkers).toEqual([]);
});

test('Complete persistence failure is logged as failed', async ({ page }) => {
  const warnings = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'boss-japan-tracker') throw new DOMException('blocked', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
    IDBObjectStore.prototype.put = function() {
      throw new DOMException('blocked', 'QuotaExceededError');
    };
  });

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/`);
  await expect.poll(() => warnings.some((warning) => warning.includes('[useAppState] Persist failed:'))).toBe(true);
});

test('Supabase magic-link redirect uses a clean app root without route hash', async ({ page }) => {
  test.skip(process.env.SUPABASE_REDIRECT_SMOKE !== '1', 'Set SUPABASE_REDIRECT_SMOKE=1 and start Vite with fake Supabase env.');
  let redirectTo = '';

  await page.route('https://test-travel-expense.supabase.co/auth/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const body = route.request().postDataJSON?.() || {};
    if (url.pathname.endsWith('/otp')) {
      redirectTo = url.searchParams.get('redirect_to') || body.options?.emailRedirectTo || '';
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });

  await page.addInitScript(() => {
    localStorage.clear();
    grantDeviceTrust();
  });

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#settings`);
  await page.getByRole('button', { name: 'Email' }).click();
  await expect(page.getByText('Email 連結登入')).toBeVisible();
  await page.getByPlaceholder('you@example.com').fill('redirect-smoke@example.com');
  await page.getByRole('button', { name: /寄出登入連結/ }).click();

  await expect.poll(() => redirectTo, { timeout: 10000 }).toBe(expectedAuthRedirect());
  expect(redirectTo).not.toContain('#');
  expect(redirectTo).not.toContain('access_token');
});

test('Supabase Google OAuth starts with a clean app root redirect', async ({ page }) => {
  test.skip(process.env.SUPABASE_REDIRECT_SMOKE !== '1', 'Set SUPABASE_REDIRECT_SMOKE=1 and start Vite with fake Supabase env.');
  let provider = '';
  let redirectTo = '';

  await page.route('https://test-travel-expense.supabase.co/auth/v1/authorize**', async (route) => {
    const url = new URL(route.request().url());
    provider = url.searchParams.get('provider') || '';
    redirectTo = url.searchParams.get('redirect_to') || '';
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>OAuth smoke</title><main>Google OAuth smoke</main>',
    });
  });

  await page.addInitScript(() => {
    localStorage.clear();
    grantDeviceTrust();
  });

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#settings`);
  await expect(page.getByText('旅程雲端登入')).toBeVisible();
  await page.getByRole('button', { name: '使用 Google 帳號登入' }).click();

  await expect.poll(() => provider, { timeout: 10000 }).toBe('google');
  expect(redirectTo).toBe(expectedAuthRedirect());
  expect(redirectTo).not.toContain('#');
  expect(redirectTo).not.toContain('access_token');
});

test('Supabase clear-device sign out removes scoped local snapshots', async ({ page }) => {
  test.skip(process.env.SUPABASE_REDIRECT_SMOKE !== '1', 'Set SUPABASE_REDIRECT_SMOKE=1 and start Vite with fake Supabase env.');
  const userId = '11111111-1111-4111-8111-111111111111';
  const scope = `supabase:${userId}`;
  const scopedStorageKey = `boss-japan-tracker:state:${scope}`;
  const scopedIndexedKey = `app-state:${scope}`;

  await page.route('https://test-travel-expense.supabase.co/auth/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
  });

  await page.addInitScript(({ userId, scopedStorageKey, scopedState }) => {
    localStorage.clear();
    indexedDB.deleteDatabase('travel-expense-react');
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem(scopedStorageKey, JSON.stringify(scopedState));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify({
      access_token: 'fake-access-token',
      refresh_token: 'fake-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'device-clear@example.com',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }));
  }, { userId, scopedStorageKey, scopedState: stateWithTrip() });

  page.on('dialog', (dialog) => dialog.accept());

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/`);
  await expect(page.getByRole('navigation', { name: '主要分頁' })).toBeVisible();
  await expect(page.locator('.supabase-session-actions')).toHaveCount(0);

  await page.evaluate(async ({ scopedStorageKey, scopedIndexedKey }) => {
    localStorage.setItem(scopedStorageKey, JSON.stringify({ receipts: [{ id: 'private-receipt', store: 'Private shop' }] }));
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('travel-expense-react', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('state')) req.result.createObjectStore('state');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite');
      tx.objectStore('state').put({ receipts: [{ id: 'private-indexed-receipt' }] }, scopedIndexedKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { scopedStorageKey, scopedIndexedKey });

  await page.getByLabel('主要分頁').getByRole('button', { name: '設定' }).click();
  await page.getByRole('button', { name: /雲端帳號與密碼設定/ }).click();
  await expect(page.getByText('device-clear@example.com').first()).toBeVisible();
  await page.getByRole('button', { name: '清除此裝置資料並登出 Supabase' }).click();
  await expect(page.getByRole('dialog', { name: '清除此裝置資料' })).toBeVisible();
  await expect(page.getByText(/雲端 Supabase \/ Notion 資料不會刪除/)).toBeVisible();
  await page.getByRole('button', { name: '確認清除並登出' }).click();
  await expect(page.getByText('旅程雲端登入')).toBeVisible();

  const remaining = await page.evaluate(async ({ scopedStorageKey, scopedIndexedKey }) => {
    const localValue = localStorage.getItem(scopedStorageKey);
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('travel-expense-react', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const indexedValue = await new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readonly');
      const req = tx.objectStore('state').get(scopedIndexedKey);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return { localValue, indexedValue };
  }, { scopedStorageKey, scopedIndexedKey });

  expect(remaining.localValue).toBeNull();
  expect(remaining.indexedValue).toBeNull();
});

test('Supabase scoped IndexedDB fallback does not hydrate another user or legacy local data', async ({ page }) => {
  test.skip(process.env.SUPABASE_REDIRECT_SMOKE !== '1', 'Set SUPABASE_REDIRECT_SMOKE=1 and start Vite with fake Supabase env.');
  const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const scopeA = `supabase:${userA}`;
  const scopeB = `supabase:${userB}`;
  const keyA = `boss-japan-tracker:state:${scopeA}`;
  const keyB = `boss-japan-tracker:state:${scopeB}`;
  const indexedKeyA = `app-state:${scopeA}`;
  const indexedKeyB = `app-state:${scopeB}`;

  await page.route('https://test-travel-expense.supabase.co/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const table = url.pathname.split('/').pop();
    if (url.pathname.startsWith('/auth/v1/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
      return;
    }
    if (table === 'profiles' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ app_settings: {} }) });
      return;
    }
    if (table === 'profiles' && (method === 'POST' || method === 'PATCH')) {
      await route.fulfill({ status: method === 'POST' ? 201 : 204, contentType: 'application/json', body: method === 'POST' ? JSON.stringify([]) : '' });
      return;
    }
    if (table === 'trips' || table === 'receipts') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.route(`${APP_ORIGIN}/__scope-seed`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>seed</title>' });
  });
  await page.goto(`${APP_ORIGIN}/__scope-seed`);
  await page.evaluate(async ({ userB, keyA, keyB, indexedKeyA, indexedKeyB, scopeBState }) => {
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase('travel-expense-react');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify({
      access_token: 'fake-access-token-b',
      refresh_token: 'fake-refresh-token-b',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: userB,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'user-b@example.com',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'history',
      receipts: [{
        id: 'legacy_private_a',
        store: 'Legacy Private A',
        total: 9100,
        date: '2026-05-01',
        category: 'food',
        payment: 'cash',
        createdAt: Date.now() + 1000,
      }],
    }));
    localStorage.setItem(keyA, JSON.stringify({
      lastTab: 'history',
      receipts: [{
        id: 'scoped_private_a',
        store: 'Scoped Private A',
        total: 9200,
        date: '2026-05-02',
        category: 'food',
        payment: 'cash',
        createdAt: Date.now() + 1000,
      }],
    }));
    localStorage.setItem(keyB, JSON.stringify(scopeBState));

    const db = await new Promise((resolve, reject) => {
      const openReq = indexedDB.open('travel-expense-react', 1);
      openReq.onupgradeneeded = () => {
        if (!openReq.result.objectStoreNames.contains('state')) openReq.result.createObjectStore('state');
      };
      openReq.onsuccess = () => resolve(openReq.result);
      openReq.onerror = () => reject(openReq.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('state', 'readwrite');
      tx.objectStore('state').put({
        lastTab: 'history',
        settingsUpdatedAt: Date.now() + 2_000,
        credentialSession: 'indexed-scoped-session-token',
        credentialSessionExpiresAt: Date.now() + 60_000,
        trips: [{
          ...scopeBState.trips[0],
          sharing: {
            role: 'owner',
            isShared: true,
            memberCount: 1,
            pendingInviteCount: 1,
            invites: [{ id: 'indexed-invite', email: 'indexed@example.com', role: 'editor', token: 'indexed-invite-token' }],
          },
        }],
        receipts: [{
          id: 'indexed_private_a',
          store: 'Indexed Private A',
          total: 9300,
          date: '2026-05-03',
          category: 'food',
          payment: 'cash',
          tripId: 'scope_a_trip',
          createdAt: Date.now() + 1000,
        }],
      }, indexedKeyA);
      tx.objectStore('state').put({
        lastTab: 'history',
        receipts: [{
          id: 'indexed_private_b',
          store: 'Indexed Private B',
          total: 1200,
          date: '2026-05-04',
          category: 'food',
          payment: 'cash',
          tripId: 'scope_b_trip',
          createdAt: Date.now(),
        }],
      }, indexedKeyB);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, {
    userB,
    keyA,
    keyB,
    indexedKeyA,
    indexedKeyB,
    scopeBState: {
      ...stateWithTrip('scope_b_trip', 'history'),
      credentialSession: 'local-scoped-session-token',
      credentialSessionExpiresAt: Date.now() + 60_000,
      trips: [{
        ...stateWithTrip('scope_b_trip', 'history').trips[0],
        sharing: {
          role: 'owner',
          isShared: true,
          memberCount: 1,
          pendingInviteCount: 1,
          invites: [{ id: 'local-invite', email: 'local@example.com', role: 'editor', token: 'local-invite-token' }],
        },
      }],
    },
  });

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#history`);
  await expect(page.getByLabel('紀錄中心 header')).toBeVisible();

  await expect.poll(async () => page.evaluate((keyB) => {
    const raw = localStorage.getItem(keyB);
    return raw ? JSON.parse(raw) : null;
  }, keyB), { timeout: 10000 }).toMatchObject({
    receipts: [expect.objectContaining({ id: 'indexed_private_b', store: 'Indexed Private B' })],
  });

  const scopedState = await page.evaluate((keyB) => JSON.parse(localStorage.getItem(keyB) || '{}'), keyB);
  const serialized = JSON.stringify(scopedState);
  expect(serialized).toContain('Indexed Private B');
  expect(serialized).not.toContain('Legacy Private A');
  expect(serialized).not.toContain('Scoped Private A');
  expect(serialized).not.toContain('Indexed Private A');
  expect(serialized).not.toContain('local-scoped-session-token');
  expect(serialized).not.toContain('indexed-scoped-session-token');
  expect(serialized).not.toContain('local-invite-token');
  expect(serialized).not.toContain('indexed-invite-token');
  expect(serialized).not.toContain('credentialSession');
  expect(serialized).not.toContain('"token"');
});

test('Delayed old scope hydration cannot overwrite or persist after an account switch', async ({ page }) => {
  test.skip(process.env.SUPABASE_REDIRECT_SMOKE !== '1', 'Set SUPABASE_REDIRECT_SMOKE=1 and start Vite with fake Supabase env.');
  const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const scopeA = `supabase:${userA}`;
  const scopeB = `supabase:${userB}`;
  const keyA = `boss-japan-tracker:state:${scopeA}`;
  const keyB = `boss-japan-tracker:state:${scopeB}`;
  const indexedKeyA = `app-state:${scopeA}`;
  const indexedKeyB = `app-state:${scopeB}`;
  const sessionFor = (userId, email) => ({
    access_token: `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, sub: userId, email })).toString('base64url')}.`,
    refresh_token: `refresh-${userId}`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });

  await page.route('https://test-travel-expense.supabase.co/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/user')) {
      const token = (route.request().headers().authorization || '').replace(/^Bearer\s+/i, '');
      const payload = token ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) : {};
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: payload.sub,
          aud: payload.aud || 'authenticated',
          role: payload.role || 'authenticated',
          email: payload.email,
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
  await page.goto(`${APP_ORIGIN}/__scope-seed`);
  await page.evaluate(async ({ keyA, indexedKeyA, indexedKeyB, sessionA, stateA, stateB }) => {
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify(sessionA));
    localStorage.setItem(keyA, JSON.stringify(stateA));
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('travel-expense-react', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('state')) request.result.createObjectStore('state');
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('state', 'readwrite');
        tx.objectStore('state').put(stateA, indexedKeyA);
        tx.objectStore('state').put(stateB, indexedKeyB);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  }, {
    keyA,
    indexedKeyA,
    indexedKeyB,
    sessionA: sessionFor(userA, 'user-a@example.com'),
    stateA: {
      ...stateWithTrip('scope_a_trip', 'history'),
      receipts: [{ id: 'old-scope-receipt', store: 'Old scope', total: 1, date: '2026-05-01', category: 'food', payment: 'cash', tripId: 'scope_a_trip', updatedAt: 1 }],
    },
    stateB: {
      ...stateWithTrip('scope_b_trip', 'history'),
      receipts: [{ id: 'new-scope-receipt', store: 'New scope', total: 2, date: '2026-05-02', category: 'food', payment: 'cash', tripId: 'scope_b_trip', updatedAt: 2 }],
    },
  });

  await page.addInitScript((oldIndexedKey) => {
    const get = IDBObjectStore.prototype.get;
    const setItem = Storage.prototype.setItem;
    window.__scopeWrites = [];
    Storage.prototype.setItem = function(key, value) {
      if (key.includes(':state:supabase:')) window.__scopeWrites.push(key);
      return setItem.call(this, key, value);
    };
    IDBObjectStore.prototype.get = function(key) {
      const request = get.call(this, key);
      if (key !== oldIndexedKey) return request;
      const delayed = {};
      Object.defineProperties(delayed, {
        result: { get: () => request.result },
        error: { get: () => request.error },
        onsuccess: {
          set: (handler) => {
            request.onsuccess = (event) => {
              window.__oldScopeHydrationReady = true;
              window.__releaseOldScopeHydration = () => handler(event);
            };
          },
        },
        onerror: { set: (handler) => { request.onerror = handler; } },
      });
      return delayed;
    };
  }, indexedKeyA);

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#history`);
  await expect.poll(() => page.evaluate(() => window.__oldScopeHydrationReady === true)).toBe(true);

  await page.evaluate(() => window.__scopeWrites = []);
  const switched = await page.evaluate(async (session) => {
    const { getSupabaseClient } = await import('/travel-expense/compact/src/lib/supabase.ts');
    const result = await getSupabaseClient().auth.setSession(session);
    return { error: result.error?.message || '', userId: result.data.session?.user.id || '' };
  }, sessionFor(userB, 'user-b@example.com'));
  expect(switched).toEqual({ error: '', userId: userB });

  await expect.poll(async () => page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return {
      receipt: raw ? JSON.parse(raw).receipts?.[0]?.id : '',
      wrote: window.__scopeWrites.includes(key),
    };
  }, keyB), { timeout: 10_000 }).toEqual({ receipt: 'new-scope-receipt', wrote: true });
  await page.evaluate(() => window.__releaseOldScopeHydration());
  await page.waitForTimeout(250);

  const result = await page.evaluate(({ keyA, keyB }) => ({
    writes: window.__scopeWrites,
    oldState: localStorage.getItem(keyA),
    newState: localStorage.getItem(keyB),
  }), { keyA, keyB });
  expect(result.writes).not.toContain(keyA);
  expect(result.writes).toContain(keyB);
  expect(result.newState).toContain('new-scope-receipt');
  expect(result.newState).not.toContain('old-scope-receipt');
  expect(result.oldState).toContain('old-scope-receipt');
});
