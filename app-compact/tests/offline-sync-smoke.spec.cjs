const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

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

  await page.goto('http://localhost:8903/travel-expense/compact/#history');
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
