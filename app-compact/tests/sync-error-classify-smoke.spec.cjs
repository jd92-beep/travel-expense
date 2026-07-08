const { test, expect } = require('@playwright/test');

// Guards the fix for "open the app after a few hours → always shows sync error". The banner is
// driven by globalSyncStatus === 'error'; a transient cold-boot network blip must NOT set it.
// We exercise the real classifier through Vite's module graph in the browser (no network, no
// live Notion — safe), which is the single decision that routes a failure to banner-vs-quiet.
test('isTransientSyncError classifies network blips as transient, real errors as hard', async ({ page }) => {
  await page.addInitScript(() => { window.__disable_supabase_configured = true; });
  await page.goto('http://localhost:8903/travel-expense/compact/#dashboard');

  const result = await page.evaluate(async () => {
    const mod = await import('/travel-expense/compact/src/lib/useSyncEngine.ts');
    const f = mod.isTransientSyncError;
    const transient = [
      new TypeError('Failed to fetch'),
      new Error('NetworkError when attempting to fetch resource'),
      new Error('Load failed'),
      new Error('Request timeout after 30000ms'),
      new Error('net::ERR_CONNECTION_RESET'),
      { message: 'fetch failed' },
      new Error('503 Service Unavailable'),
    ].map((e) => f(e));
    const hard = [
      new Error('登入憑證已失效，請重新登入後再同步'),
      new Error('401 Unauthorized'),
      new Error('new row violates row-level security policy'),
      new Error('40001 version conflict'),
      new Error('duplicate key value violates unique constraint'),
    ].map((e) => f(e));
    return { transient, hard };
  });

  // Every network-shaped failure is transient (quiet, self-heals).
  expect(result.transient).toEqual([true, true, true, true, true, true, true]);
  // Every actionable failure is hard (surfaces the banner so the user can act).
  expect(result.hard).toEqual([false, false, false, false, false]);
});

test('offline is always transient regardless of message', async ({ page }) => {
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true });
  });
  await page.goto('http://localhost:8903/travel-expense/compact/#dashboard');
  const offlineTransient = await page.evaluate(async () => {
    const mod = await import('/travel-expense/compact/src/lib/useSyncEngine.ts');
    // Even an auth-shaped error is transient while offline — nothing to act on until back online.
    return mod.isTransientSyncError(new Error('401 Unauthorized'));
  });
  expect(offlineTransient).toBe(true);
});
