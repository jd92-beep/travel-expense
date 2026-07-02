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
      email: 'vc***@g***.com',
      displayName: 'Admin Boss',
      joinedAt: '2026-05-25T00:00:00Z',
      lastSeenAt: null,
      sessionCount: 0,
      eventCount: 0,
      tripCount: 1,
      receiptCount: 0,
      imageCount: 2,
      notionConnected: false,
      aiRequestsToday: 0,
      health: 'healthy',
    },
  ],
  trips: [
    {
      id: 'trip-a',
      ownerId: 'user-a',
      ownerEmail: 'vc***@g***.com',
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
    { provider: 'kimi', label: 'Kimi', status: 'healthy', storedStatus: 'broker_online', model: 'kimi-code', modelName: 'Kimi Code', latencyMs: 742, errors24h: 0 },
    { provider: 'kimi', label: 'Kimi', status: 'healthy', storedStatus: 'broker_online', model: 'kimi-8k', modelName: 'Kimi 8K', latencyMs: 500, errors24h: 0 },
    { provider: 'google', label: 'Google Gemma', status: 'healthy', storedStatus: 'broker_online', model: 'gemma-4-31b', modelName: 'Gemma 4 31B', latencyMs: 691, errors24h: 0 },
    { provider: 'mimo', label: 'Mimo v2.5', status: 'healthy', storedStatus: 'broker_online', model: 'mimo-v2.5', modelName: 'Mimo v2.5', latencyMs: 812, errors24h: 0 },
    { provider: 'weatherapi', label: 'WeatherAPI', status: 'healthy', storedStatus: 'broker_online', model: 'forecast', modelName: 'Weather Forecast', latencyMs: 318, errors24h: 0 },
    { provider: 'notion', label: 'Notion', status: 'unknown', storedStatus: 'test_pending', model: 'mirror', modelName: 'Notion Mirror', errors24h: 0 },
  ],
  audit: [],
  warnings: ['Usage telemetry table is ready, but no app usage events have been recorded yet.'],
};

const rlsDownSnapshot = {
  ...snapshot,
  supabase: { ...snapshot.supabase, rls: [], status: 'danger' },
  warnings: ['RLS runtime RPC is unavailable.'],
};

const staleSnapshot = {
  ...snapshot,
  generatedAt: new Date(Date.now() - 300_000).toISOString(),
  warnings: [],
};

async function mockAdminApi(page, snap) {
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
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, snapshot: snap || snapshot }) });
  });
  await page.route('**/api/delete-preview', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        preview: {
          userId: 'user-a',
          email: 'vc***@g***.com',
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

async function login(page, snap) {
  await mockAdminApi(page, snap);
  await page.goto('http://localhost:8904/');
  await expect(page.getByRole('heading', { name: 'Travel Ops KanBan' })).toBeVisible();
  await page.getByPlaceholder('Required for cross-user visibility').fill('admin-pass');
  await page.getByRole('button', { name: /Enter board/ }).click();
  await expect(page.getByRole('heading', { name: 'Universal App Health' })).toBeVisible();
}

test('desktop board renders live snapshot and guarded delete flow', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  await expect(page.getByRole('heading', { name: 'Live Users (1)' })).toBeVisible();
  await expect(page.getByText('ACTIVE_HEALTHY')).toBeVisible();
  await expect(page.getByText('RLS Force Enabled')).toBeVisible();
  await expect(page.getByText('Yes')).toBeVisible();
  await expect(page.getByText('Mimo v2.5').first()).toBeVisible();

  await page.getByRole('button', { name: /vc\*\*\*@g\*\*\*\.com/ }).click();
  await expect(page.getByRole('heading', { name: /vc\*\*\*@g\*\*\*\.com/ })).toBeVisible();
  await expect(page.getByText('Images')).toBeVisible();
  await expect(page.locator('.stat-box').filter({ hasText: 'Images' })).toContainText('2');
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

test('mobile board is scrollable and shows single column', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  await expect(page.getByText('Google Gemma')).toBeVisible();
  await expect(page.getByText('Mimo v2.5').first()).toBeVisible();
  await page.getByRole('button', { name: /vc\*\*\*@g\*\*\*\.com/ }).click();
  await expect(page.getByRole('heading', { name: /vc\*\*\*@g\*\*\*\.com/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Preview delete scope/ })).toBeVisible();

  const metrics = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    dashboardColumns: getComputedStyle(document.querySelector('.dashboard-content')).gridTemplateColumns,
  }));
  expect(metrics.width).toBe(390);
  expect(metrics.scrollWidth).toBeLessThanOrEqual(390);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(390);
  expect(Number.parseInt(metrics.dashboardColumns, 10)).toBeLessThanOrEqual(390);
  expect(metrics.dashboardColumns.trim().split(/\s+/)).toHaveLength(1);
});

test('RLS unavailable shows danger, not false green', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, rlsDownSnapshot);

  await expect(page.getByText('DANGER')).toBeVisible();
  await expect(page.getByText('Unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('RLS runtime RPC is unavailable.')).toBeVisible();
});

test('stale data shows Stale pill after staleAfterSeconds', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, staleSnapshot);

  await expect(page.getByText('Stale')).toBeVisible({ timeout: 3000 });
});

test('LLM rows show provider-level grouping with model chips', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  await expect(page.getByText('Kimi Code')).toBeVisible();
  await expect(page.getByText('Kimi 8K')).toBeVisible();
  await expect(page.getByText('Gemma 4 31B')).toBeVisible();
  const llmRows = await page.locator('.llm-item-expanded').count();
  expect(llmRows).toBe(5);
  const testBtns = await page.locator('.test-provider-btn').count();
  expect(testBtns).toBe(5);
});

test('auto-refresh button is visible', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  await expect(page.getByRole('button', { name: /Auto/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Refresh/ })).toBeVisible();
});

test('search matches display name and email', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  await page.getByPlaceholder('Search users...').fill('Admin Boss');
  await expect(page.getByRole('button', { name: /vc\*\*\*@g\*\*\*\.com/ })).toBeVisible();

  await page.getByPlaceholder('Search users...').fill('vc***');
  await expect(page.getByRole('button', { name: /vc\*\*\*@g\*\*\*\.com/ })).toBeVisible();

  await page.getByPlaceholder('Search users...').fill('nonexistent');
  await expect(page.getByText('No users found.')).toBeVisible();
});

test('receipt amend modal validates input', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const snapshotWithReceipts = {
    ...snapshot,
    receipts: [
      { id: 'r1', tripId: 'trip-a', ownerId: 'user-a', store: 'Test Store', status: 'confirmed', amount: 5000, currency: 'JPY', recordDate: '2026-06-02', updatedAt: null, notionSynced: false, photoPath: null, category: 'food' },
    ],
  };
  await login(page, snapshotWithReceipts);

  await page.getByRole('button', { name: /vc\*\*\*@g\*\*\*\.com/ }).click();
  await page.waitForTimeout(300);
  await expect(page.getByText('Test Store')).toBeVisible();

  const amendBtn = page.locator('.icon-btn[title="Amend"]').first();
  await expect(amendBtn).toBeVisible();
  await amendBtn.click();
  await expect(page.getByText('Amend Receipt')).toBeVisible();

  // Full-edit modal exposes every compact-editable field
  await expect(page.locator('.amend-modal input[type="date"]')).toBeVisible();
  await expect(page.locator('.amend-modal input[type="time"]')).toBeVisible();
  await expect(page.locator('.amend-modal select')).toHaveCount(3); // status + category + payment
  await expect(page.locator('.amend-modal textarea')).toHaveCount(2); // items + note

  await page.locator('.amend-modal input[type="number"]').first().fill('-5');
  await page.getByRole('button', { name: /^Save$/ }).click();
  await expect(page.getByText('finite non-negative')).toBeVisible();

  await page.locator('.amend-modal input[type="number"]').first().fill('9999');
  await page.getByRole('button', { name: /Cancel/ }).click();
  await expect(page.getByText('Amend Receipt')).not.toBeVisible();
});

test('receipts group by date with day totals; no-photo button does not open details', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const snapshotWithReceipts = {
    ...snapshot,
    receipts: [
      { id: 'r1', tripId: 'trip-a', ownerId: 'user-a', store: 'Late Store', status: 'confirmed', amount: 3000, currency: 'JPY', recordDate: '2026-06-03', recordTime: '19:30', payment: 'cash', updatedAt: null, notionSynced: false, photoPath: null, category: 'food' },
      { id: 'r2', tripId: 'trip-a', ownerId: 'user-a', store: 'Early Store', status: 'confirmed', amount: 2000, currency: 'JPY', recordDate: '2026-06-02', recordTime: '09:00', payment: 'suica', updatedAt: null, notionSynced: false, photoPath: 'user-a/x.jpg', category: 'transport' },
    ],
  };
  await login(page, snapshotWithReceipts);
  await page.getByRole('button', { name: /vc\*\*\*@g\*\*\*\.com/ }).click();

  // Newest date group first, headers show count + per-day total
  const headers = page.locator('.receipt-date-header');
  await expect(headers).toHaveCount(2);
  await expect(headers.first()).toContainText('2026-06-03');
  await expect(headers.first()).toContainText('1 筆');
  await expect(headers.first()).toContainText('3,000 JPY');

  // No-photo icon is disabled and must NOT open the receipt detail modal
  const noPhotoBtn = page.locator('.icon-btn.no-photo').first();
  await expect(noPhotoBtn).toBeDisabled();
  await noPhotoBtn.click({ force: true });
  await expect(page.getByText('Receipt Details')).not.toBeVisible();

  // Photo icon exists for the receipt that has a photo
  await expect(page.locator('.icon-btn.has-photo')).toHaveCount(1);
});

test('reconcile tab runs Notion↔Supabase 對數 and identity tab offers merge', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.route('**/api/reconcile', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true,
      generatedAt: new Date().toISOString(),
      trips: [
        { tripId: 't1', tripName: '名古屋 2026', ownerEmail: 'boss@example.com', notionDatabaseId: 'db1', supabaseReceipts: 12, supabaseSyncedToNotion: 10, notionReceipts: 11, missingInNotion: 2, orphanInNotion: 1, orphanSamples: ['r_x'], status: 'mismatch' },
        { tripId: 't2', tripName: '濟州2026', ownerEmail: 'boss@example.com', notionDatabaseId: 'db1', supabaseReceipts: 4, supabaseSyncedToNotion: 4, notionReceipts: 4, missingInNotion: 0, orphanInNotion: 0, status: 'balanced' },
      ],
    })});
  });
  await page.route('**/api/identity/duplicates', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true,
      duplicates: [{ prefix: 'vc06456', users: [
        { id: 'u-1', email: 'vc06456@gmail.com', displayName: 'Boss', createdAt: '2026-05-26T00:00:00Z' },
        { id: 'u-2', email: 'vc06456@hotmail.com', displayName: null, createdAt: '2026-06-01T00:00:00Z' },
      ]}],
    })});
  });

  await page.getByRole('button', { name: /對數/ }).click();
  await page.getByRole('button', { name: /Run 對數/ }).click();
  await expect(page.getByText('名古屋 2026')).toBeVisible();
  await expect(page.getByText('⚠️ 有差異')).toBeVisible();
  await expect(page.getByText('✅ 平衡')).toBeVisible();
  await expect(page.getByText('缺 Notion 2 / 缺 Supabase 1')).toBeVisible();

  await page.getByRole('button', { name: /Identity/ }).click();
  await page.getByRole('button', { name: /Detect Duplicates/ }).click();
  await expect(page.getByText('vc06456@gmail.com (')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Merge' })).toBeVisible();
  await expect(page.locator('.merge-controls select')).toBeVisible();
});

test('default scope is compact and header says Compact Ops Console', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let capturedSurface = null;
  await page.route('**/api/session', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true, session: { token: 'test', adminSubject: 'admin', expiresAt: new Date(Date.now() + 60000).toISOString() },
    })});
  });
  await page.route('**/api/snapshot?*', async (route) => {
    const url = new URL(route.request().url());
    capturedSurface = url.searchParams.get('surface');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, snapshot }) });
  });

  await page.goto('http://localhost:8904/');
  await page.getByPlaceholder('Required for cross-user visibility').fill('pass');
  await page.getByRole('button', { name: /Enter board/ }).click();
  await expect(page.getByRole('heading', { name: 'Universal App Health' })).toBeVisible();

  await expect(page.getByText('Compact Ops Console')).toBeVisible();
  expect(capturedSurface).toBe('compact');

  const scopeSelect = page.locator('select[title="Data scope"]');
  await expect(scopeSelect).toBeVisible();
  await expect(scopeSelect).toHaveValue('compact');
});

test('runtime tab shows service health including vercel frontend', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.route('**/api/runtime', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true,
      runtime: {
        adminConsoleVersion: '0.5.0',
        edgeDeployId: 'dpl-test',
        edgeRouteVersion: '2026-07-02',
        brokerVersion: '1.2.3',
        vercelFrontend: 'healthy',
        dbSchemaVersion: '20260613140000',
        supabaseUrl: 'fbnnjoahvtdrnigevrtw',
      },
    })});
  });
  await page.getByRole('button', { name: /Runtime/ }).click();
  await expect(page.getByText('Runtime Status')).toBeVisible();
  await expect(page.getByText('v0.5.0')).toBeVisible();
  await expect(page.getByText('Vercel Frontend')).toBeVisible();
  await expect(page.getByText('healthy', { exact: true })).toBeVisible();
});

test('sync tab loads jobs and doctor tab scans', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.route('**/api/sync/jobs*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, jobs: [
      { id: 'job-1', provider: 'notion', status: 'failed', attempts: 3, last_error: 'timeout', updated_at: '2026-07-01T00:00:00Z' },
    ], total: 1 })});
  });
  await page.route('**/api/data-doctor', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, issues: [
      { severity: 'high', category: 'receipt', message: 'Receipt r1 missing trip_id', entityId: 'r1' },
    ], summary: { high: 1, medium: 0, low: 0 }, total: 1 })});
  });
  await page.getByRole('button', { name: /Sync/ }).click();
  await expect(page.getByText('Sync Operations')).toBeVisible();
  await expect(page.getByText('timeout')).toBeVisible();
  await expect(page.getByRole('button', { name: /Retry/ })).toBeVisible();
  await page.getByRole('button', { name: /Doctor/ }).click();
  await page.getByRole('button', { name: /Run Data Doctor/ }).click();
  await expect(page.getByText('1 High')).toBeVisible();
  await expect(page.getByText(/missing trip_id/)).toBeVisible();
});

test('switching to all surface shows warning badge', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  const scopeSelect = page.locator('select[title="Data scope"]');
  await scopeSelect.selectOption('all');
  await page.waitForTimeout(500);
  await expect(page.getByText('All surfaces')).toBeVisible();
});
