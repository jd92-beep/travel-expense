const { test, expect } = require('@playwright/test');
const origin = process.env.COMPACT_TEST_ORIGIN || 'http://127.0.0.1:8903';
test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

async function boot(page, tripId) {
  page.on('pageerror', error => console.error(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.route('**/src/lib/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
    import React from '/travel-expense/compact/node_modules/.vite/deps/react.js';
    export * from '/travel-expense/compact/src/lib/supabase.ts?actual';
    export function useSupabaseAuth() {
      const [session, setSession] = React.useState({ user: { id: 'account-a', email: 'a@example.com' }, access_token: 'fixture-a' });
      window.switchAuditAccount = id => setSession({ user: { id, email: id + '@example.com' }, access_token: 'fixture-b' });
      return { configured: true, loading: false, session };
    }
    export const pullSupabaseData = async () => ({ trips: [], receipts: [], tombstones: [], settings: {} });
  ` }));
  await page.addInitScript(tripId => {
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
    for (const id of ['account-a', 'account-b']) {
      const date = '2026-10-30';
      localStorage.setItem('boss-japan-tracker:state:supabase:' + id, JSON.stringify({
        activeTripId: tripId, autoSync: false, rateMode: 'fixed', tripCurrency: 'HKD',
        trips: [{ id: tripId, name: id, active: true, version: 1, startDate: date, endDate: date, currencies: ['HKD'], timezones: ['Asia/Hong_Kong'], itinerary: [{ date, day: 1, currency: 'HKD', region: '香港', spots: [] }] }],
        receipts: [],
      }));
    }
  }, tripId);
  await page.goto(`${origin}/travel-expense/compact/#scan`);
  await expect(page.getByRole('heading', { name: 'account-a', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '手動', exact: true })).toBeVisible();
}

for (const tripId of ['shared-trip', 'trip_default']) {
test(`switching accounts closes the old ${tripId} receipt draft before the next account can save it`, async ({ page }) => {
  await boot(page, tripId);
  await page.getByRole('button', { name: '手動', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '手動記一筆' });
  await editor.getByLabel('店名 / 項目').fill('Account A private draft');
  await editor.getByLabel('金額', { exact: true }).fill('88');
  await page.evaluate(() => window.switchAuditAccount('account-b'));
  await expect(page.getByRole('heading', { name: 'account-b', exact: true })).toBeVisible();
  await expect(editor).toHaveCount(0);
  await page.getByRole('button', { name: '手動', exact: true }).click();
  await expect(editor.getByLabel('店名 / 項目')).toHaveValue('');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('boss-japan-tracker:state:supabase:account-b')).receipts)).toEqual([]);
});
}
