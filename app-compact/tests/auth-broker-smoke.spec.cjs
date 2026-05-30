const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

test('Password unlock registers a trusted device and trusted reload refreshes broker session', async ({ page }) => {
  const brokerRequests = [];

  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));

  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/**', async (route) => {
    const url = new URL(route.request().url());
    const body = route.request().postData() ? route.request().postDataJSON() : {};
    brokerRequests.push({ path: url.pathname, body });

    if (url.pathname === '/session/unlock') {
      expect(body.password).toBe('1234');
      expect(body.trustDevice).toBe(true);
      expect(body.devicePublicKey?.kty).toBe('EC');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          session: 'first-broker-session',
          expiresAt: Date.now() + 60_000,
          device: {
            deviceId: 'trusted-device-1',
            deviceName: 'Test phone',
            createdAt: Date.now(),
            expiresAt: Date.now() + 31_536_000_000,
          },
        }),
      });
    }

    if (url.pathname === '/session/challenge') {
      expect(body.deviceId).toBe('trusted-device-1');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, challenge: 'refresh-challenge', expiresAt: Date.now() + 300_000 }),
      });
    }

    if (url.pathname === '/session/refresh') {
      expect(body.deviceId).toBe('trusted-device-1');
      expect(body.challenge).toBe('refresh-challenge');
      expect(String(body.signature || '').length).toBeGreaterThan(20);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, session: 'refreshed-broker-session', expiresAt: Date.now() + 60_000 }),
      });
    }

    if (url.pathname === '/notion/request') {
      const data = String(body.path || '').endsWith('/query')
        ? { results: [], has_more: false }
        : { properties: {} };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data }),
      });
    }

    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'unexpected broker path' }),
    });
  });

  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    if (!sessionStorage.getItem('auth-broker-smoke-seeded')) {
      localStorage.clear();
      indexedDB.deleteDatabase('travel-expense-react-trust');
      sessionStorage.setItem('auth-broker-smoke-seeded', '1');
    }
    const originalDecrypt = crypto.subtle.decrypt.bind(crypto.subtle);
    crypto.subtle.decrypt = async (algorithm, key, data) => {
      if (algorithm?.name === 'AES-GCM') {
        return new TextEncoder().encode(JSON.stringify({ ok: true, scope: 'travel-expense-react' }));
      }
      return originalDecrypt(algorithm, key, data);
    };
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.getByText('先解鎖再使用')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName || '')).not.toBe('INPUT');
  await page.getByLabel('密碼').fill('1234');
  await page.getByRole('button', { name: /解鎖/ }).click();
  await expect(page.getByLabel('旅程總覽')).toBeVisible();

  const firstSession = await page.evaluate(() => localStorage.getItem('boss-japan-tracker:credential-session:v1') || '');
  expect(firstSession).toContain('first-broker-session');
  const trustedMeta = await page.evaluate(() => localStorage.getItem('travel-expense-react:trusted-broker-device:v1') || '');
  expect(trustedMeta).toContain('trusted-device-1');
  expect(await page.evaluate(() => localStorage.getItem('boss-japan-tracker:direct-notion-token'))).toBeNull();

  await page.evaluate(() => localStorage.removeItem('boss-japan-tracker:credential-session:v1'));
  await page.reload();
  await expect(page.getByLabel('旅程總覽')).toBeVisible();

  const refreshedSession = await page.evaluate(() => localStorage.getItem('boss-japan-tracker:credential-session:v1') || '');
  expect(refreshedSession).toContain('refreshed-broker-session');
  expect(brokerRequests.some((request) => request.path === '/session/refresh')).toBe(true);
  expect(JSON.stringify(await page.evaluate(() => ({ ...localStorage })))).not.toContain('ntn_');
});
