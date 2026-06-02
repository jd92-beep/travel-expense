const { test, expect } = require('@playwright/test');

const snapshot = {
  generatedAt: new Date('2026-06-02T11:45:00Z').toISOString(),
  staleAfterSeconds: 60,
  source: 'live',
  supabase: {
    projectRef: 'fbnnjoahvtdrnigevrtw',
    status: 'healthy',
    counts: {
      authUsers: 3,
      profiles: 3,
      trips: 1,
      receipts: 0,
      receiptItems: 0,
      receiptPhotos: 0,
      integrations: 0,
      receiptSyncJobs: 0,
      usageEvents: 0,
      auditEvents: 0,
    },
    rls: [
      'profiles',
      'trips',
      'trip_members',
      'receipts',
      'receipt_items',
      'receipt_photos',
      'integrations',
      'receipt_sync_jobs',
      'app_usage_events',
      'admin_audit_events',
    ].map((table) => ({ table, enabled: true, force: true })),
  },
  usage: { rangeDays: 7, events: 0, activeUsers: 0, sessions: 0, bySurface: [] },
  users: [
    {
      id: 'user-a',
      emailMasked: 'vc***@g***.com',
      joinedAt: '2026-05-25T00:00:00Z',
      lastSeenAt: null,
      sessionCount: 0,
      eventCount: 0,
      tripCount: 1,
      receiptCount: 0,
      notionConnected: false,
      aiRequestsToday: 0,
      health: 'healthy',
    },
  ],
  trips: [
    {
      id: 'trip-a',
      ownerId: 'user-a',
      ownerEmailMasked: 'vc***@g***.com',
      name: 'Japan Ops Trip',
      destination: 'Japan',
      dateRange: '2026-06-02 - 2026-06-07',
      countryCode: 'JP',
      currency: 'JPY',
      active: true,
      archived: false,
      receiptCount: 0,
      updatedAt: '2026-06-02T10:00:00Z',
    },
  ],
  receipts: [],
  notion: { connectedUsers: 0, integrationRows: 0, syncedReceipts: 0, failedJobs: 0, pendingJobs: 0, lastSyncedAt: null },
  llm: [
    { provider: 'kimi', label: 'Kimi', status: 'healthy', storedStatus: 'broker_online', model: 'kimi-code', latencyMs: 742, errors24h: 0 },
    { provider: 'google', label: 'Google Gemma', status: 'healthy', storedStatus: 'broker_online', model: 'gemma-4-31b', latencyMs: 691, errors24h: 0 },
    { provider: 'mimo', label: 'Mimo v2.5', status: 'healthy', storedStatus: 'broker_online', model: 'mimo-v2.5', latencyMs: 812, errors24h: 0 },
    { provider: 'weatherapi', label: 'WeatherAPI', status: 'healthy', storedStatus: 'broker_online', model: 'forecast', latencyMs: 318, errors24h: 0 },
    { provider: 'notion', label: 'Notion', status: 'unknown', storedStatus: 'test_pending', model: 'mirror', errors24h: 0 },
  ],
  audit: [],
  warnings: ['Usage telemetry table is ready, but no app usage events have been recorded yet.'],
};

async function mockAdminApi(page) {
  await page.route('**/api/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        session: {
          token: 'smoke-session-token',
          adminSubject: 'smoke-admin',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      }),
    });
  });
  await page.route('**/api/snapshot?*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, snapshot }) });
  });
  await page.route('**/api/delete-preview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        preview: {
          userId: 'user-a',
          emailMasked: 'vc***@g***.com',
          counts: { authUsers: 1, profiles: 1, trips: 1, receipts: 0, receiptPhotos: 0, integrations: 0 },
          confirmPhrase: 'DELETE USER vc***@g***.com',
          generatedAt: new Date().toISOString(),
        },
      }),
    });
  });
  await page.route('**/api/delete-user', async (route) => {
    const body = route.request().postDataJSON();
    const ok = body.confirmPhrase === 'DELETE USER vc***@g***.com' && body.adminPassphrase === 'again';
    await route.fulfill({
      status: ok ? 200 : 403,
      contentType: 'application/json',
      body: JSON.stringify(ok
        ? { ok: true, result: { deleted: true, postDeleteCounts: {} } }
        : { ok: false, error: 'Admin re-auth failed' }),
    });
  });
}

test('desktop board renders live snapshot and guarded delete flow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAdminApi(page);

  await page.goto('http://localhost:8904/');
  await expect(page.getByRole('heading', { name: 'Travel Ops KanBan' })).toBeVisible();
  await page.getByPlaceholder('Required for cross-user visibility').fill('admin-pass');
  await page.getByRole('button', { name: /Enter board/ }).click();

  const desktopLanes = page.locator('.lanes');
  await expect(desktopLanes.getByText('Live Users', { exact: true })).toBeVisible();
  await expect(desktopLanes.getByText('Trip Ops', { exact: true })).toBeVisible();
  await expect(desktopLanes.getByText('Expense Flow', { exact: true })).toBeVisible();
  await expect(desktopLanes.getByText('LLM Health', { exact: true })).toBeVisible();
  await expect(desktopLanes.getByText('Backend Health', { exact: true })).toBeVisible();
  await expect(desktopLanes.getByText('Admin Actions', { exact: true })).toBeVisible();
  await expect(page.getByText('ACTIVE_HEALTHY')).toBeVisible();
  await expect(page.getByText('RLS force')).toBeVisible();
  await expect(page.getByText('Mimo v2.5')).toBeVisible();
  await expect(desktopLanes.locator('.lane-amber').getByText('0 receipts', { exact: true })).toBeVisible();

  await expect(page.getByRole('button', { name: /Preview delete scope/ })).toBeDisabled();
  await page.getByRole('button', { name: /vc\*\*\*@g\*\*\*\.com/ }).click();
  await expect(page.getByLabel('Inspector')).toContainText('emailMasked');
  await expect(page.getByLabel('Inspector')).not.toContainText('token');
  await page.getByRole('button', { name: /vc\*\*\*@g\*\*\*\.com/ }).dragTo(page.locator('[data-lane-id="trips"]'));
  await expect(page.locator('[data-lane-id="trips"] [data-testid="triage-stack"]')).toContainText('vc***@g***.com');
  await page.locator('[data-lane-id="trips"] .triage-card').click();
  await expect(page.locator('[data-lane-id="trips"] [data-testid="triage-stack"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Preview delete scope/ })).toBeEnabled();
  await page.getByRole('button', { name: /Preview delete scope/ }).click();
  await expect(page.getByText('Delete preview')).toBeVisible();
  await page.getByPlaceholder('DELETE USER vc***@g***.com').fill('DELETE USER wrong');
  await page.locator('.delete-preview input[type="password"]').fill('again');
  await expect(page.getByRole('button', { name: /Confirm user delete/ })).toBeDisabled();
  await page.getByPlaceholder('DELETE USER vc***@g***.com').fill('DELETE USER vc***@g***.com');
  await expect(page.getByRole('button', { name: /Confirm user delete/ })).toBeEnabled();
  await page.getByRole('button', { name: /Confirm user delete/ }).click();
  await expect(page.getByText('User delete completed and verified.')).toBeVisible();
});

test('mobile board is scrollable and lane picker controls one active lane', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAdminApi(page);

  await page.goto('http://localhost:8904/');
  await page.getByPlaceholder('Required for cross-user visibility').fill('admin-pass');
  await page.getByRole('button', { name: /Enter board/ }).click();

  await expect(page.getByLabel('Mobile lane picker')).toBeVisible();
  await page.getByRole('button', { name: /LLM Health/ }).click();
  await expect(page.locator('.lane.mobile-active').filter({ hasText: 'LLM Health' })).toBeVisible();
  await expect(page.locator('.lane.mobile-active')).toContainText('Google Gemma');
  await expect(page.locator('.lane.mobile-active')).toContainText('Mimo v2.5');

  const metrics = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    activeLaneCount: document.querySelectorAll('.lane.mobile-active').length,
  }));
  expect(metrics.width).toBe(390);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(390);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(390);
  expect(metrics.activeLaneCount).toBe(1);
});
