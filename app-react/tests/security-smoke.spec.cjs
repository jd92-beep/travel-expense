const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

test('Sensitive legacy fields are stripped from localStorage, IndexedDB, and service workers', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    indexedDB.deleteDatabase('travel-expense-react');
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'settings',
      receipts: [],
      notionToken: 'legacy-notion-placeholder',
      apiKey: 'legacy-api-placeholder',
      kimiKey: 'legacy-kimi-placeholder',
      googleKey: 'legacy-google-placeholder',
      credentialSession: 'legacy-session-placeholder',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
  });

  await page.goto('http://localhost:8902/travel-expense/react/');
  await expect(page.getByText('設定控制中心')).toBeVisible();
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
