const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

const APP_ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://localhost:8903';

// Offline-first contract: a receipt edited while offline must (1) persist locally,
// (2) sit in the sync queue, (3) trigger an automatic sync attempt the moment the
// browser fires 'online' — no manual sync tap, no waiting for the 120s interval.
// Hermetic rig: fake broker session satisfies the enqueue/push gates; every
// non-localhost request is aborted so no real backend is ever contacted.

const PERSONS = [
  { id: 'p_boss', name: 'A', emoji: '👤', color: '#CC2929' },
  { id: 'p2', name: 'B', emoji: '🧳', color: '#1E4D6B' },
];

test('offline receipt entry queues locally and auto-syncs on reconnect', async ({ page }) => {
  const logs = [];
  page.on('console', (msg) => logs.push(msg.text()));
  // Abort everything that is not the local dev server (Notion/broker/Supabase/fonts…).
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());

  await page.addInitScript((payload) => {
    window.__disable_supabase_configured = true;
    // Controllable navigator.onLine so the engine's offline gate + 'online' listener
    // can be exercised without killing the dev-server connection.
    let fakeOnline = true;
    Object.defineProperty(navigator, 'onLine', { get: () => fakeOnline, configurable: true });
    window.__setOnline = (v) => {
      fakeOnline = v;
      window.dispatchEvent(new Event(v ? 'online' : 'offline'));
    };
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    // Broker session hydrates from its own key, not the state blob (storage.ts BROKER_SESSION_KEY).
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'smoke_session_token',
      credentialSessionExpiresAt: Date.now() + 86_400_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify(payload));
  }, {
    budget: 100000, rate: 20.36, tripCurrency: 'JPY', persons: PERSONS,
    shareRatios: { p_boss: 50, p2: 50 },
    autoSync: true,
    // Fake broker session → hasCredentialBrokerSession() true → receipts enqueue and
    // push() engages even with Supabase disabled. All its network calls are aborted above.
    credentialSession: 'smoke_session_token',
    credentialSessionExpiresAt: Date.now() + 86_400_000,
    lastTab: 'history',
    receipts: [{
      id: 'r_off', store: '離線便利店', total: 1200, currency: 'JPY', originalCurrency: 'JPY',
      date: '2026-04-21', category: 'food', payment: 'cash',
      personId: 'p_boss', splitMode: 'shared', createdAt: Date.now(), updatedAt: Date.now(),
    }],
  });

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#history`);
  await expect(page.locator('.receipt-main', { hasText: '離線便利店' }).first()).toBeVisible();

  // ---- Go offline, then edit + save the receipt ----
  await page.evaluate(() => window.__setOnline(false));
  await page.locator('.receipt-main', { hasText: '離線便利店' }).first().click();
  await expect(page.getByRole('heading', { name: '編輯紀錄' })).toBeVisible();
  await page.getByLabel('分帳', { exact: true }).selectOption('private');
  await page.getByRole('button', { name: '儲存' }).click();

  // Saved locally + queued despite being offline.
  await expect.poll(async () => page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('boss-japan-tracker') || '{}');
    const r = (s.receipts || []).find((x) => x.id === 'r_off');
    return { split: r?.splitMode, queued: (s.syncQueue || []).filter((q) => q.type === 'receipt' && q.status !== 'synced').length };
  })).toEqual({ split: 'private', queued: 1 });

  // Debounced push fires (~3s) and must bail out on the offline gate.
  await expect.poll(() => logs.some((l) => l.includes('push() skipped — offline')), { timeout: 10_000 }).toBe(true);

  // ---- Reconnect: the 'online' event alone must kick off a sync ----
  const before = logs.length;
  await page.evaluate(() => window.__setOnline(true));
  await expect.poll(() => logs.slice(before).some((l) => l.includes('sync() started')), { timeout: 5_000 }).toBe(true);
  await expect.poll(() => logs.slice(before).some((l) => l.includes('push() started')), { timeout: 5_000 }).toBe(true);

  // Backend unreachable (routes aborted) → item must stay in the queue for retry, not vanish.
  const queueAfter = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('boss-japan-tracker') || '{}');
    return (s.syncQueue || []).filter((q) => q.type === 'receipt' && q.status !== 'synced').length;
  });
  expect(queueAfter).toBe(1);
});

test('IndexedDB cold start requeues only retryable sync failures and preserves exhausted or conflict evidence', async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
  });

  const seedIndexedState = async (snapshot) => {
    await page.goto(`${APP_ORIGIN}/travel-expense/compact/favicon.svg`);
    await page.evaluate(async (value) => {
      localStorage.clear();
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('travel-expense-react', 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('state')) request.result.createObjectStore('state');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const transaction = db.transaction('state', 'readwrite');
        transaction.objectStore('state').put(value, 'app-state');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      db.close();
    }, snapshot);
    await page.goto(`${APP_ORIGIN}/travel-expense/compact/`);
  };

  const snapshot = (item) => ({
    receipts: [{
      id: item.entityId,
      store: 'IndexedDB sync item',
      total: 500,
      date: '2026-01-01',
      category: 'other',
      payment: 'cash',
      createdAt: 1,
      updatedAt: 1,
    }],
    syncQueue: [item],
    globalSyncStatus: 'error',
    syncError: item.error,
    settingsUpdatedAt: Date.now() + 31_536_000_000,
    schemaVersion: 3,
  });
  const readIndexedState = () => page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('travel-expense-react', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const state = await new Promise((resolve, reject) => {
      const transaction = db.transaction('state', 'readonly');
      const request = transaction.objectStore('state').get('app-state');
      request.onsuccess = () => resolve(request.result || {});
      request.onerror = () => reject(request.error);
    });
    db.close();
    return { status: state.globalSyncStatus, error: state.syncError, queue: state.syncQueue?.[0] };
  });

  await seedIndexedState(snapshot({
    id: 'retryable', type: 'receipt', entityId: 'retryable', op: 'create', status: 'error', attempts: 1,
    error: 'session expired', createdAt: 1, updatedAt: 1,
  }));
  await expect.poll(readIndexedState).toMatchObject({ status: 'queued', error: '', queue: { status: 'queued', attempts: 1 } });

  await seedIndexedState(snapshot({
    id: 'exhausted', type: 'receipt', entityId: 'exhausted', op: 'create', status: 'error', attempts: 3,
    error: 'permission denied', createdAt: 1, updatedAt: 1,
  }));
  await expect.poll(readIndexedState).toMatchObject({ status: 'error', error: 'permission denied', queue: { status: 'error', attempts: 3 } });

  await seedIndexedState(snapshot({
    id: 'conflict', type: 'receipt', entityId: 'conflict', op: 'create', status: 'failed', attempts: 1,
    error: 'version conflict', createdAt: 1, updatedAt: 1,
  }));
  await expect.poll(readIndexedState).toMatchObject({ status: 'error', error: 'version conflict', queue: { status: 'failed', attempts: 1 } });
});
