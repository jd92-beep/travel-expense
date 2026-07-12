const { test, expect } = require('@playwright/test');

const APP_ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://localhost:8903';



const tabs = [
  ['主頁', '預算總覽'],
  ['記帳', '掃描收據'],
  ['行程', '行程時間線'],
  ['紀錄', '紀錄中心'],
  ['天氣', '天氣預報'],
  ['統計', '預算使用分析'],
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
    await page.goto(`${APP_ORIGIN}/travel-expense/compact/`);
    await expect(page.getByText('掃描收據').first()).toBeVisible();
    if (viewport.width <= 390) {
      // Low-perf mode (narrow/coarse-pointer viewports) renders only the base wallpaper layer — cut
      // from 2 to 1 as a low-RAM cold-start optimization; the CSS washi backdrop covers the rest.
      await expect(page.locator('.hyperframe-layer')).toHaveCount(1);
      await expect(page.locator('canvas')).toHaveCount(0);
    }
    const nav = page.getByLabel('主要分頁');
    for (const [tabLabel, expectedText] of tabs) {
      await nav.getByRole('button', { name: tabLabel, exact: true }).click();
      if (viewport.width <= 390 && expectedText === '紀錄中心') {
        await expect(page.locator('.compact-mobile-title-art')).toHaveAttribute('data-title', '紀錄中心');
      } else if (viewport.width <= 390 && expectedText === '設定控制中心') {
        await expect(page.locator('.compact-mobile-title-art')).toHaveAttribute('data-title', '設定控制中心');
        await expect(page.locator('.settings-preview-controls')).toBeVisible();
      } else if (expectedText === '行程時間線') {
        await expect(page.locator('.timeline-command-title')).toBeVisible();
      } else {
        await expect(page.getByText(expectedText).first()).toBeVisible();
      }
    }
    await context.close();
  });
}

test('Final lock gate smoke without trusted device', async ({ page }) => {
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
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
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/`);
  await expect(page.getByText(/本機安全防護鎖|先解鎖再使用/).first()).toBeVisible();
});

// Drives the sync-error banner the way production actually reaches it: seed a QUEUED (not
// error) syncQueue item pointing at a real receipt, stub the backend endpoint the engine
// actually calls in __disable_supabase_configured mode (the credential-broker's /notion/request
// proxy — Supabase is disabled, so useSyncEngine's push() falls through to the Notion mirror
// path), and let the app's own push() observe the failure and set globalSyncStatus:'error'
// itself. storage.ts's hydrate-reset only resets error/failed queue items back to 'queued' on
// load — it never fabricates a NEW failure, so seeding 'queued' + a real backend failure
// survives that reset by construction.
//
// The stubbed failure is HTTP 403 "permission denied" on the Notion page-create call
// specifically: it is NOT auth-shaped (no "401"/"unauthorized"/"jwt"), so it parks as a real
// actionable error rather than triggering re-login handling.
//
// TWO ANDROID DIFFERENCES vs main's rig:
// 1. This tree's push() requeues ANY non-auth, non-version-conflict failure with a 30s
//    exponential backoff until MAX_RETRY_ATTEMPTS (3) — main only requeues
//    isTransientSyncError() matches. A first-attempt 403 therefore never paints the banner
//    here; the rig seeds attempts: 2 so the single 403 exhausts the retry budget
//    (nextAttempts 3 >= 3) and parks as 'error' immediately.
// 2. The boot flow runs sync() = push THEN pull, and a clean pull unconditionally settles the
//    status to 'synced' — overwriting the error the failed push just painted (verified live:
//    push completes with failures: 1, then pull() success flips the indicator to "Synced").
//    So the 403 must land on a push that is NOT followed by a pull. The rig seeds
//    nextRetryAt ~6s in the future: the boot sync() push (~1s) and the autoSync debounce push
//    (~3s) both skip the item (queueItemReady sees the open backoff window), the boot pull's
//    'synced' lands harmlessly, and then the engine's backoff wake-up effect fires a bare
//    push() at nextRetryAt — that push takes the 403, parks the item, and paints the banner
//    with no pull behind it to wipe it.
// Both seeds survive storage.ts's hydrate-reset because that reset only rewrites
// error/failed/syncing items — 'queued' items keep attempts and nextRetryAt. The manual-retry
// click (retryFailedItems) resets attempts/nextRetryAt, and the stub succeeds from the second
// page-create onwards, so the "click retry and the banner clears" assertion still exercises a
// real recovered sync.
function installNotionPermissionDeniedOnFirstCreate(page) {
  let pageCreateAttempts = 0;
  return page.route('**/notion/request', async (route) => {
    const payload = route.request().postDataJSON();
    const path = String(payload.path || '');
    const method = String(payload.method || 'GET');
    if (method === 'POST' && path === '/pages') {
      pageCreateAttempts += 1;
      if (pageCreateAttempts === 1) {
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'permission denied' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { id: `fake-notion-page-${pageCreateAttempts}` } }),
      });
    }
    if (method === 'GET' && /^\/databases\//.test(path)) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { properties: {} } }) });
    }
    // Schema migration PATCH, findPageBySourceId query, image-block lookup, etc. — none of these
    // are on the failure path we're testing, so they always succeed with an empty/no-op shape.
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { results: [], has_more: false } }) });
  });
}

test('Sync error indicator is clickable and retries sync', async ({ page }) => {
  await installNotionPermissionDeniedOnFirstCreate(page);
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
  });
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/`);
  await Promise.all([
    page.waitForNavigation(),
    page.evaluate(async () => {
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
      const now = Date.now();
      localStorage.clear();
      localStorage.setItem('__stress_panel_unlocked', 'true');
      localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: now + 31_536_000_000 }));
      // Credential Broker session (not a Supabase session — Supabase is disabled above) so
      // canUseNotionMirror() lets push() actually attempt the Notion mirror write.
      localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
        credentialSession: 'sync-error-rig-session',
        credentialSessionExpiresAt: now + 60 * 60_000,
      }));
      localStorage.setItem('boss-japan-tracker', JSON.stringify({
        lastTab: 'dashboard',
        autoSync: true,
        receipts: [{
          id: 'sync_error_receipt',
          store: 'Sync Error Rig Store',
          total: 500,
          date: '2026-01-01',
          category: 'other',
          payment: 'cash',
          createdAt: now - 60_000,
          updatedAt: now - 60_000,
        }],
        syncQueue: [{
          id: 'sync_error_queue',
          type: 'receipt',
          entityId: 'sync_error_receipt',
          op: 'create',
          status: 'queued',
          // attempts: 2 + nextRetryAt ~6s out — see the rig comment above: the 403 must land
          // on the FINAL retry attempt (so it parks instead of requeueing with backoff) and on
          // the backoff wake-up push specifically (so no boot pull runs after it and settles
          // the status back to 'synced', wiping the banner).
          attempts: 2,
          nextRetryAt: now + 6_000,
          createdAt: now - 60_000,
          updatedAt: now - 60_000,
        }],
        settingsUpdatedAt: now + 31_536_000_000,
        schemaVersion: 3,
      }));
      window.location.reload();
    })
  ]);

  // The queued item auto-pushes ~3s after boot (autoSync debounce) and hits the stubbed 403.
  await expect(page.getByRole('button', { name: /Sync error/ })).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => {
    const retry = page.getByRole('button', { name: /Sync error/ });
    if (!(await retry.isVisible().catch(() => false))) return true;
    await retry.evaluate((button) => button.click()).catch(() => undefined);
    return !(await page.getByRole('button', { name: /Sync error/ }).isVisible().catch(() => false));
  }, { timeout: 10_000 }).toBe(true);
  await expect(page.locator('.sync-status-indicator')).not.toContainText('Sync error');
});

test('Duplicate person ids do not create React key warnings', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'stats',
      autoSync: false,
      persons: [
        { id: 'p_trip_2', name: 'May', emoji: 'M', color: '#2d5a8e' },
        { id: 'p_trip_2', name: 'Duplicate May', emoji: 'D', color: '#c23b5e' },
        { id: 'p_boss', name: 'User 1', emoji: 'T', color: '#cc2929' },
      ],
      shareRatios: { p_trip_2: 1, p_boss: 1 },
      receipts: [
        { id: 'dup_person_receipt', store: 'Compact Cafe', total: 1000, date: '2026-04-20', category: 'food', payment: 'cash', personId: 'p_trip_2', splitMode: 'shared', createdAt: 1 },
      ],
      schemaVersion: 3,
    }));
  });

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#stats`);
  await expect(page.getByText('預算使用分析').first()).toBeVisible();
  await page.getByLabel('主要分頁').getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.locator('.compact-mobile-title-art')).toHaveAttribute('data-title', '設定控制中心');
  await expect.poll(() => consoleErrors.filter((text) => text.includes('same key') || text.includes('Encountered two children')).length).toBe(0);
});

test('Compact PWA readiness strip surfaces queue, install, update, cache, and motion states', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const releaseNoteRequests = [];
  page.on('request', (request) => {
    const url = request.url();
    if (/github|changelog|release-notes|releases/i.test(url) && !url.startsWith(`${APP_ORIGIN}/`)) {
      releaseNoteRequests.push(url);
    }
  });
  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'dashboard',
      autoSync: true,
      globalSyncStatus: 'queued',
      lastSyncedAt: Date.now() - 5 * 60_000,
      syncQueue: [{
        id: 'pwa_queue_receipt',
        type: 'receipt',
        entityId: 'pwa_receipt',
        op: 'create',
        status: 'queued',
        attempts: 0,
        createdAt: Date.now() - 1_000,
        updatedAt: Date.now() - 1_000,
      }],
      receipts: [],
      schemaVersion: 3,
    }));
  });

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/`);
  await expect(page.getByLabel('Compact travel readiness')).toHaveCount(0);
  const nav = page.locator('.app-floating-dock-mobile[aria-label="主要分頁"]');
  await nav.getByRole('button', { name: '設定', exact: true }).click();
  const readiness = page.getByLabel('Compact travel readiness');
  await expect(readiness).toBeVisible();
  await expect(readiness).toContainText('Network · online');
  await expect(readiness).toContainText('Queue · 1 pending');

  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt');
    Object.defineProperty(event, 'prompt', {
      value: async () => { window.__compactInstallPrompted = true; },
    });
    Object.defineProperty(event, 'userChoice', {
      value: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    });
    window.dispatchEvent(event);
  });
  await expect(readiness.getByRole('button', { name: /Install/ })).toBeVisible();
  await readiness.getByRole('button', { name: /Install/ }).click();
  await expect.poll(() => page.evaluate(() => window.__compactInstallPrompted === true)).toBe(true);

  await page.evaluate(() => navigator.serviceWorker?.dispatchEvent(new Event('controllerchange')));
  const releaseNotes = page.getByLabel('Compact release notes');
  await expect(releaseNotes).toBeVisible();
  await expect(releaseNotes).toContainText('Compact release notes');
  await expect(releaseNotes).toContainText('Now vs previous');
  await expect(releaseNotes).toContainText('Compact Home and Timeline');
  await expect(releaseNotes).toContainText('Attachment checks');
  await expect(releaseNotes).toContainText('No external calls');
  expect(releaseNoteRequests, releaseNoteRequests.join('\n')).toHaveLength(0);

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(readiness).toContainText('Network · offline');

  const metrics = await readiness.evaluate((node) => ({
    scrollWidth: document.documentElement.scrollWidth,
    chipCount: node.querySelectorAll('.pwa-chip').length,
  }));
  expect(metrics.scrollWidth, JSON.stringify(metrics, null, 2)).toBeLessThanOrEqual(390);
  expect(metrics.chipCount).toBeGreaterThanOrEqual(2);
  await context.close();
});

test('Native reachability restore releases queued upload backoff for immediate retry', async ({ page }) => {
  const retryAt = Date.now() + 10 * 60_000;
  await page.addInitScript((retryAt) => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'settings',
      autoSync: true,
      globalSyncStatus: 'error',
      syncError: 'Failed to fetch',
      receipts: [],
      syncQueue: [{
        id: 'upload_midflight',
        type: 'receipt',
        entityId: 'receipt_midflight',
        op: 'create',
        status: 'queued',
        attempts: 1,
        nextRetryAt: retryAt,
        error: 'Failed to fetch',
        createdAt: Date.now() - 1000,
        updatedAt: Date.now() - 1000,
      }],
      schemaVersion: 3,
    }));
  }, retryAt);

  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#settings`);
  await expect(page.locator('.compact-mobile-title-art')).toHaveAttribute('data-title', '設定控制中心');
  await page.evaluate(() => window.dispatchEvent(new Event('travel-expense:native-reachability-online')));
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('boss-japan-tracker') || '{}');
    const item = state.syncQueue?.[0] || {};
    return {
      status: item.status,
      attempts: item.attempts,
      nextRetryAt: item.nextRetryAt ?? null,
      error: item.error ?? null,
      globalSyncStatus: state.globalSyncStatus,
      syncError: state.syncError ?? null,
      queueLength: state.syncQueue?.length || 0,
    };
  }), { timeout: 5000 }).toEqual({
    status: 'queued',
    attempts: 1,
    nextRetryAt: null,
    error: null,
    globalSyncStatus: 'queued',
    syncError: '',
    queueLength: 1,
  });
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
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#dashboard`);
  await expect(page.getByLabel('旅程總覽')).toBeVisible();
  await expect.poll(() => notionPaths.filter((path) => path.includes('/query')).length).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(1200);
  expect(notionPaths.filter((path) => path.includes('/query')).length).toBeGreaterThanOrEqual(2);
  expect(consoleEvents.filter((event) => event.includes('Auto-updated live exchange rate'))).toHaveLength(1);
  expect(consoleEvents.filter((event) => event.includes('corsproxy.io') || event.includes('403'))).toHaveLength(0);
});
