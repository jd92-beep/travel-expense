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
