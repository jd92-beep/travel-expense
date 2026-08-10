const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

const SUPA_KEY = 'travel-expense:supabase-auth:v1';

// Regression: opening the app with an EXPIRED access_token must NOT delete the persisted
// Supabase session. The access_token (JWT) expires ~hourly but the refresh_token is long-lived;
// supabase-js mints a fresh access_token from it. The old storedSupabaseSession() removed the
// whole blob (refresh_token included) on expiry, forcing a full re-login every ~1 hour on the
// phone. storedSupabaseSession() runs on every boot regardless of Supabase config, so this is
// deterministic on the local path (no live backend needed).
test('expired access_token session survives cold boot (refresh_token not thrown away)', async ({ page }) => {
  await page.addInitScript((key) => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem(key, JSON.stringify({
      access_token: 'expired.jwt.token',
      refresh_token: 'long_lived_refresh_token',
      // expired 10 minutes ago (seconds since epoch, as supabase-js stores it)
      expires_at: Math.floor(Date.now() / 1000) - 600,
      token_type: 'bearer',
      user: { id: 'u_phone_123', email: 'phone@example.com' },
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({ budget: 100000, rate: 20.36, tripCurrency: 'JPY', lastTab: 'dashboard' }));
  }, SUPA_KEY);

  await page.goto('http://localhost:8903/travel-expense/compact/#dashboard');
  await page.waitForLoadState('networkidle');

  // The persisted session (and crucially its refresh_token) must still be there.
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), SUPA_KEY);
  expect(stored).not.toBeNull();
  expect(stored.refresh_token).toBe('long_lived_refresh_token');
  expect(stored.user.id).toBe('u_phone_123');
});

// A structurally invalid blob (no user id) is not a usable hint, but we still must not throw.
test('malformed session blob is ignored without crashing the app', async ({ page }) => {
  await page.addInitScript((key) => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem(key, JSON.stringify({ access_token: 'x', user: {} }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({ budget: 100000, rate: 20.36, tripCurrency: 'JPY', lastTab: 'dashboard' }));
  }, SUPA_KEY);

  await page.goto('http://localhost:8903/travel-expense/compact/#dashboard');
  // App renders real UI (didn't throw on the malformed blob) rather than a blank/error screen.
  await expect(page.getByRole('banner').first()).toBeVisible();
});

// Regression: if Supabase is paused or unreachable, getSession() can reject or
// remain pending while refreshing the saved token. Cold boot must leave the reconnect screen and
// show the sign-in surface with the network error instead of loading forever.
test('unreachable Supabase releases the reconnect screen after session refresh fails', async ({ page }) => {
  await page.route('https://test-travel-expense.supabase.co/**', (route) => route.abort('failed'));
  await page.addInitScript((key) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({
      access_token: 'expired.jwt.token',
      refresh_token: 'refresh_token_for_unreachable_project',
      expires_at: Math.floor(Date.now() / 1000) - 600,
      token_type: 'bearer',
      user: { id: 'u_network_failure', email: 'network@example.com' },
    }));
  }, SUPA_KEY);

  await page.goto('http://localhost:8903/travel-expense/compact/#dashboard');

  await expect(page.getByLabel('Supabase reconnect')).toBeHidden({ timeout: 10_000 });
  await expect(page.getByLabel('Travel Expense Supabase login')).toBeVisible();
  await expect(page.locator('.lock-error')).toContainText(/fetch|network/i);
});

test('Taiwan theme keeps the configured Supabase login on semantic dark tokens', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('boss-japan-tracker:theme:v1', 'taiwan_nightmarket');
    localStorage.setItem('boss-japan-tracker', JSON.stringify({ schemaVersion: 4, themePreference: 'taiwan_nightmarket' }));
  });
  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.getByLabel('Travel Expense Supabase login')).toBeVisible();

  expect(await page.evaluate(() => {
    const color = (selector, property = 'color', pseudo) => getComputedStyle(document.querySelector(selector), pseudo)[property];
    return {
      theme: document.documentElement.dataset.appTheme,
      scheme: document.documentElement.dataset.colorScheme,
      panel: color('.compact-login-panel', 'backgroundColor'),
      brand: color('.compact-login-brand'),
      mark: color('.compact-login-brand-mark'),
      markBackground: color('.compact-login-brand-mark', 'backgroundColor'),
      heading: color('.compact-login-head h1'),
      copy: color('.compact-login-head > p:last-child'),
      kicker: color('.compact-login-kicker'),
      label: color('.compact-login-form label'),
      field: color('.compact-login-form input', 'backgroundColor'),
      placeholder: color('.compact-login-form input', 'color', '::placeholder'),
      primary: color('.compact-login-primary'),
      primaryBackground: color('.compact-login-primary', 'backgroundColor'),
      divider: color('.compact-login-divider'),
      privacy: color('.compact-login-privacy'),
    };
  })).toEqual({
    theme: 'taiwan_nightmarket',
    scheme: 'dark',
    panel: 'rgb(32, 43, 63)',
    brand: 'rgb(248, 250, 252)',
    mark: 'rgb(17, 24, 39)',
    markBackground: 'rgb(251, 113, 133)',
    heading: 'rgb(248, 250, 252)',
    copy: 'rgb(184, 195, 211)',
    kicker: 'rgb(184, 195, 211)',
    label: 'rgb(248, 250, 252)',
    field: 'rgb(23, 32, 51)',
    placeholder: 'rgb(184, 195, 211)',
    primary: 'rgb(17, 24, 39)',
    primaryBackground: 'rgb(251, 113, 133)',
    divider: 'rgb(184, 195, 211)',
    privacy: 'rgb(184, 195, 211)',
  });
});
