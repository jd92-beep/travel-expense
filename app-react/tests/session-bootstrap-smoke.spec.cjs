const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

test('unreachable Supabase releases the reconnect screen after session refresh fails', async ({ page }) => {
  await page.route('https://test-travel-expense.supabase.co/**', (route) => route.abort('failed'));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify({
      access_token: 'expired.jwt.token',
      refresh_token: 'refresh_token_for_unreachable_project',
      expires_at: Math.floor(Date.now() / 1000) - 600,
      token_type: 'bearer',
      user: { id: 'u_network_failure', email: 'network@example.com' },
    }));
  });

  await page.goto('http://localhost:8902/travel-expense/react/#dashboard');

  await expect(page.getByLabel('Supabase reconnect')).toBeHidden({ timeout: 10_000 });
  await expect(page.getByLabel('Travel Expense Supabase login')).toBeVisible();
  await expect(page.locator('.lock-error')).toContainText(/fetch|network/i);
});
