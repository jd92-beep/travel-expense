const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const requestId = '97000000-0000-4000-8000-000000000001';
const tripId = '98100000-0000-4000-8000-000000000001';
const accountId = '98000000-0000-4000-8000-0000000000a1';
const receiptId = '98200000-0000-4000-8000-000000000001';
const operationId = '98300000-0000-4000-8000-000000000001';
const auditEventId = '98900000-0000-4000-8000-000000000001';

function operation(status = 'previewed', action = 'provider_probe') {
  const now = new Date().toISOString();
  const integrity = action === 'run_integrity_scan';
  const r2 = new Set([
    'receipt_amend', 'receipt_trash', 'receipt_restore', 'trip_amend',
    'itinerary_amend', 'itinerary_restore', 'member_add', 'member_role', 'member_remove',
  ]).has(action);
  return {
    id: operationId,
    idempotencyKey: '98400000-0000-4000-8000-000000000001',
    action,
    risk: r2 ? 'R2' : 'R1',
    targetType: integrity ? 'integrity_scan' : r2 ? 'canonical_data' : 'provider',
    targetHash: 'a'.repeat(64),
    targetVersion: null,
    previewHash: 'b'.repeat(64),
    status,
    preview: {
      title: integrity ? 'Run data integrity scan' : 'Probe provider',
      consequence: integrity
        ? 'Checks itinerary, receipt, membership, tombstone, Notion and sync invariants.'
        : 'Sends one explicit credential test request through the Credential Broker.',
      affectedCount: integrity ? 0 : 1,
      rollbackBoundary: integrity
        ? 'The scan is read-only for app data.'
        : 'The probe does not change provider configuration.',
      ...(r2 ? {
        title: action.replaceAll('_', ' '),
        consequence: 'Updates one version-checked canonical record.',
        before: { version: 3, value: 'current' },
        proposed: { version: 4, value: 'proposed' },
        rollbackBoundary: 'The previous version remains in audit history.',
      } : {}),
    },
    result: status === 'completed'
      ? integrity
        ? { status: 'completed', findings: 0, recordsChecked: 42 }
        : { provider: 'google', status: 'healthy' }
      : null,
    error: null,
    requestId,
    previewExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    createdAt: now,
    updatedAt: now,
    startedAt: status === 'completed' ? now : null,
    completedAt: status === 'completed' ? now : null,
  };
}

function envelope(data, extra = {}) {
  return {
    ok: true,
    data,
    error: null,
    meta: {
      requestId,
      generatedAt: new Date().toISOString(),
      staleAfterSeconds: 60,
      scope: 'shared-cloud',
      sources: { 'shared-cloud': 'live' },
      warnings: [],
      ...extra,
    },
  };
}

const account = {
  id: accountId,
  masked_email: 're***@example.invalid',
  display_name: 'Boss Travel',
  status: 'active',
  last_seen_at: '2026-07-10T10:00:00Z',
  compact_last_seen_at: '2026-07-10T10:00:00Z',
  android_last_seen_at: '2026-07-10T09:55:00Z',
  compact_version: '0.9.0',
  android_version: '0.9.0',
  trip_count: 1,
  receipt_count: 2,
  last_sync_at: '2026-07-10T10:00:00Z',
  failed_sync_jobs: 0,
  notion_status: 'connected',
  shared_mirror_status: 'connected',
  open_risk: 0,
  updated_at: '2026-07-10T10:00:00Z',
};

const trip = {
  id: tripId,
  owner_id: accountId,
  owner_masked_email: 're***@example.invalid',
  name: 'Nagoya 2026',
  destination_summary: 'Nagoya / Kanazawa',
  start_date: '2026-04-20',
  end_date: '2026-04-25',
  trip_currency: 'JPY',
  home_currency: 'HKD',
  budget_amount: 120000,
  budget_currency: 'JPY',
  version: 7,
  archived: false,
  member_count: 1,
  receipt_count: 2,
  expected_days: 6,
  actual_days: 6,
  out_of_range_days: 0,
  duplicate_days: 0,
  integrity_status: 'healthy',
  itinerary_coverage: 100,
  notion_binding_status: 'connected',
  updated_at: '2026-07-10T10:00:00Z',
};

const receipt = {
  id: receiptId,
  trip_id: tripId,
  trip_name: 'Nagoya 2026',
  owner_id: accountId,
  owner_masked_email: 're***@example.invalid',
  store: 'Nagoya Station',
  record_date: '2026-04-20',
  record_time: '10:30',
  amount: 1200,
  currency: 'JPY',
  record_kind: 'expense',
  visibility: 'trip',
  category: 'transport',
  payment_method: 'card',
  status: 'confirmed',
  notion_sync_status: 'synced',
  version: 3,
  deleted_at: null,
  has_photo: true,
  integrity_status: 'healthy',
  updated_at: '2026-07-10T10:00:00Z',
};

const itinerary = {
  tripId,
  startDate: '2026-04-20',
  endDate: '2026-04-25',
  version: 7,
  integrityIssues: [],
  days: [
    { date: '2026-04-20', title: '名古屋市區', location: 'Nagoya', spots: [{ id: 's1', name: '名古屋城', time: '10:00', order: 1 }] },
    { date: '2026-04-21', title: '飛驒高山', location: 'Takayama', spots: [{ id: 's2', name: '白川鄉', time: '09:00', order: 1 }] },
    { date: '2026-04-22', title: '立山黑部', location: 'Toyama', spots: [{ id: 's3', name: '雪之大谷', time: '10:00', order: 1 }] },
    { date: '2026-04-23', title: '金澤', location: 'Kanazawa', spots: [{ id: 's4', name: '兼六園', time: '09:30', order: 1 }] },
    { date: '2026-04-24', title: '名古屋', location: 'Nagoya', spots: [{ id: 's5', name: '熱田神宮', time: '11:00', order: 1 }] },
    { date: '2026-04-25', title: '常滑與機場', location: 'Tokoname', spots: [{ id: 's6', name: '中部國際機場', time: '14:00', order: 1 }] },
  ],
};

const workspaceRoutes = [
  ['overview', '/overview'],
  ['search', '/search?q=Nagoya'],
  ['accounts', '/data/accounts'],
  ['account-detail', `/data/accounts/${accountId}`],
  ['trips', '/data/trips'],
  ['trip-detail', `/data/trips/${tripId}`],
  ['itinerary', `/data/trips/${tripId}/itinerary`],
  ['receipts', '/data/receipts'],
  ['receipt-detail', `/data/receipts/${receiptId}`],
  ['incidents', '/reliability/incidents'],
  ['sync', '/reliability/sync'],
  ['integrity', '/reliability/integrity'],
  ['reconciliation', `/reliability/reconciliation?tripId=${tripId}`],
  ['providers', '/system/providers'],
  ['releases', '/system/releases'],
  ['infrastructure', '/system/infrastructure'],
  ['audit', '/audit'],
  ['audit-detail', `/audit/${auditEventId}`],
];

async function setupApi(page, options = {}) {
  await page.addInitScript(() => {
    document.cookie = '__Host-admin_csrf=synthetic-csrf; Path=/; Secure; SameSite=Strict';
  });
  let lastOperationAction = 'provider_probe';
  let operationReadIndex = 0;
  await page.route('**/api/admin/**', async route => {
    const url = new URL(route.request().url());
    let body = null;
    try { body = route.request().postDataJSON(); } catch {}
    options.requests?.push({ method: route.request().method(), pathname: url.pathname, search: url.search, body });
    if (options.sessionErrorStatus && url.pathname === '/api/admin/session') {
      await route.fulfill({
        status: options.sessionErrorStatus,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          data: null,
          error: {
            code: options.sessionErrorStatus === 401 ? 'UNAUTHORIZED' : 'UPSTREAM_UNAVAILABLE',
            message: options.sessionErrorStatus === 401 ? 'Admin session expired' : 'Admin session store unavailable',
            retryable: options.sessionErrorStatus !== 401,
          },
          meta: { requestId, generatedAt: new Date().toISOString(), warnings: [] },
        }),
      });
      return;
    }
    if (options.errorPath && url.pathname === options.errorPath) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, data: null, error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Synthetic dependency unavailable', retryable: true }, meta: { requestId, generatedAt: new Date().toISOString(), warnings: [] } }) });
      return;
    }
    if (options.logoutError && route.request().method() === 'DELETE' && url.pathname === '/api/admin/session') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, data: null, error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Synthetic logout store unavailable', retryable: true }, meta: { requestId, generatedAt: new Date().toISOString(), warnings: [] } }) });
      return;
    }
    if (options.passkeyUnauthorized && url.pathname === '/api/admin/passkeys') {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false, data: null, error: { code: 'UNAUTHORIZED', message: 'Synthetic passkey session expired', retryable: false }, meta: { requestId, generatedAt: new Date().toISOString(), warnings: [] } }) });
      return;
    }
    if (options.commitNetworkError
      && route.request().method() === 'POST'
      && url.pathname === `/api/admin/operations/${operationId}/commit`) {
      await route.abort('failed');
      return;
    }
    if (url.pathname === `/api/admin/receipts/${receiptId}/photo`) {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
      });
      return;
    }
    let data;
    let meta = {};
    switch (url.pathname) {
      case '/api/admin/session': data = { actor: 'boss', authMethod: 'passphrase+passkey', idleExpiresAt: '2026-07-10T11:00:00Z', absoluteExpiresAt: '2026-07-10T12:00:00Z' }; break;
      case '/api/admin/overview':
        data = { counts: { activeAccounts: 1, openTrips: 1, recentReceipts: 2, failedJobs: 0, integrityIssues: 0 }, incidents: [], statusStrip: [{ id: 'shared-cloud', status: 'healthy', lastSeenAt: new Date().toISOString() }, { id: 'compact-web', status: 'healthy', lastSeenAt: new Date().toISOString() }, { id: 'android', status: 'healthy', lastSeenAt: new Date().toISOString() }, { id: 'notion', status: 'healthy', lastSeenAt: new Date().toISOString() }, { id: 'broker', status: 'unknown', lastSeenAt: null }], clientVersions: [{ app_surface: 'android', app_build: '0.9.0', contract_version: 4, installations: 1, last_seen_at: new Date().toISOString() }], recentOperations: [] };
        break;
      case '/api/admin/accounts': data = { items: [account] }; meta = { total: 1 }; break;
      case `/api/admin/accounts/${accountId}`: data = { identity: { ...account, email: 'read-owner@example.invalid', emailConfirmedAt: '2026-07-01T00:00:00Z', created_at: '2026-07-01T00:00:00Z' }, integrations: [], trips: [trip], recentReceipts: [receipt], incidents: [], audit: [] }; break;
      case `/api/admin/accounts/${accountId}/installations`: data = [{ installation_id: 'aaaaaaaaaaaaaaaa', app_surface: 'android', app_build: '0.9.0', contract_version: 4, first_seen_at: '2026-07-01T00:00:00Z', last_seen_at: '2026-07-10T10:00:00Z', event_count: 12, client_summary: 'Android' }]; break;
      case '/api/admin/trips': data = { items: [trip] }; meta = { total: 1 }; break;
      case `/api/admin/trips/${tripId}`: data = { overview: trip, members: [{ user_id: accountId, masked_email: 're***@example.invalid', role: 'owner', status: 'active' }, { user_id: '98000000-0000-4000-8000-0000000000b2', masked_email: 'me***@example.invalid', role: 'editor', status: 'active' }], invites: [], receipts: [receipt], integration: { status: 'connected', syncMode: 'dual_write', databaseConfigured: true }, audit: [] }; break;
      case `/api/admin/trips/${tripId}/itinerary`: data = options.itinerary || itinerary; break;
      case `/api/admin/trips/${tripId}/itinerary/versions`: data = { items: [{ version: 7, start_date: '2026-04-20', end_date: '2026-04-25', itinerary: itinerary.days, actor_id: null, source: 'compact', created_at: '2026-07-10T10:00:00Z' }, { version: 6, start_date: '2026-04-20', end_date: '2026-04-25', itinerary: itinerary.days, actor_id: null, source: 'android', created_at: '2026-07-09T10:00:00Z' }] }; meta = { total: 2 }; break;
      case '/api/admin/receipts': {
        const cursor = url.searchParams.get('cursor');
        data = { items: options.receipts || [receipt] };
        meta = {
          total: (options.receipts || [receipt]).length,
          ...(options.receiptCursorPages
            ? { nextCursor: cursor === 'page-2' ? 'page-3' : cursor === 'page-3' ? null : 'page-2' }
            : {}),
        };
        break;
      }
      case `/api/admin/receipts/${receiptId}`: data = { receipt: { ...receipt, note: 'Airport transfer', itemsText: 'Ticket', address: 'Nagoya', bookingRef: 'masked', sourceId: 'source-1' }, photo: { mimeType: 'image/jpeg', fileSize: 1234, width: 800, height: 600 }, syncJobs: options.receiptSyncJobs || [], audit: [] }; break;
      case '/api/admin/incidents': data = { items: [] }; meta = { total: 0 }; break;
      case '/api/admin/sync-jobs': data = { items: options.syncJobs || [] }; meta = { total: (options.syncJobs || []).length }; break;
      case '/api/admin/integrity': data = options.integrity || { items: [], state: 'no_issues', run: { id: '98600000-0000-4000-8000-000000000001', source: 'admin-integrity-v1', status: 'completed', summary: { checkVersion: 'admin-integrity-v1', recordsChecked: 42, findings: 0 }, completedAt: new Date().toISOString() } }; meta = { total: data.items.length }; break;
      case '/api/admin/reconciliation': data = {
        tripId,
        tripName: 'Nagoya 2026',
        binding: 'configured',
        syncMode: 'dual_write',
        bindingStatus: 'active',
        databaseScope: 'personal',
        lastHealthAt: new Date().toISOString(),
        lastError: null,
        tripReceipts: 2,
        privateReceiptsExcluded: 1,
        linkedReceipts: 1,
        matchingReceipts: 1,
        missingInNotion: 1,
        notionOnly: 1,
        duplicateNotion: 0,
        duplicateSupabase: 0,
        blockedNotionRows: 0,
        blockedSupabaseRows: 0,
        notionRowsScanned: 2,
        notionTripReceipts: 2,
        notionSource: 'live',
        mode: 'dry_run',
        checkVersion: 'notion-reconciliation-v1',
        resultRows: 3,
        truncated: false,
        items: [
          { sourceId: 'receipt-match', status: 'matched', supabaseReceiptId: receiptId, notionCopies: 1, linked: true },
          { sourceId: 'receipt-missing', status: 'missing_in_notion', supabaseReceiptId: '97000000-0000-4000-8000-000000000099', notionCopies: 0, linked: false },
          { sourceId: 'notion-only', status: 'notion_only', supabaseReceiptId: null, notionCopies: 1, linked: false },
        ],
      }; break;
      case '/api/admin/providers': data = [{ provider: 'google', label: 'Google Gemma', configured: true, healthy: true, status: 'healthy', storedStatus: 'connected', requiredModel: 'google/gemma-4-31b', actualModel: 'google/gemma-4-31b', lastSuccessfulRequestAt: new Date().toISOString(), lastProbeAt: null, probeCooldownSeconds: 60, probeAvailableAt: options.providerProbeAvailableAt || null, p50LatencyMs: 420, p95LatencyMs: 800, errors24h: 0, rateLimited24h: 0 }]; break;
      case '/api/admin/runtime': data = { adminFrontend: { version: '1.0.0-rc.1', gitSha: 'abc123', deploymentId: 'deploy-1', health: 'healthy' }, edge: { deploymentId: 'edge-1', sourceSha: 'abc123', routeVersion: 'admin-kanban-v1' }, broker: { version: '1.0.0', health: 'healthy' }, database: { auditContractVersion: 'admin-audit-v2', contractVersion: 'admin-operation-v1', itineraryContractVersion: 'versioned-itinerary-v1', receiptContractVersion: 'canonical-receipt-v1', schemaVersion: '20260712122000' }, clients: { compactVersion: '0.9.0', androidVersion: '0.9.0' }, runtimePolicy: options.runtimePolicy || { status: 'deny_all', version: 'admin-write-mode-v1', source: 'default', expiresAt: null, writable: false }, drift: [] }; break;
      case '/api/admin/audit': data = { items: options.auditItems || [] }; meta = { total: (options.auditItems || []).length }; break;
      case `/api/admin/audit/${auditEventId}`: data = { id: auditEventId, sequence: 42, previous_event_hash: 'e'.repeat(64), event_hash: 'f'.repeat(64), admin_subject_hash: 'a'.repeat(64), authentication_method: 'passphrase+passkey', session_hash: 'b'.repeat(64), risk: 'R2', action: 'operation_completed', target_type: 'trip', target_id_hash: 'c'.repeat(64), preview_counts: { affected: 1 }, before_state: { version: 6 }, after_state: { version: 7 }, result: { status: 'completed' }, error_code: null, request_id: requestId, operation_id: operationId, incident_id: null, frontend_version: '1.0.0-rc.1', edge_version: 'admin-kanban-v1', schema_version: '20260712122000', created_at: new Date().toISOString() }; break;
      case '/api/admin/search': data = { accounts: [account], trips: [trip], receipts: [receipt] }; break;
      case '/api/admin/operations': data = { items: (options.activityOperationStatuses || []).map((status) => operation(status, lastOperationAction)) }; break;
      case '/api/admin/passkeys': data = { credentials: [{ id: 'a1b2c3d4e5f6', label: 'Boss Mac', deviceType: 'multiDevice', backedUp: true, createdAt: '2026-07-01T00:00:00Z', lastUsedAt: '2026-07-10T10:00:00Z' }], count: 1, max: 3, context: { action: 'passkey_enroll', targetHash: 'c'.repeat(64), previewHash: 'd'.repeat(64) } }; break;
      case `/api/admin/operations/${operationId}`: {
        const statuses = options.operationReadStatuses || [options.commitStatus || 'queued'];
        const status = statuses[Math.min(operationReadIndex, statuses.length - 1)];
        operationReadIndex += 1;
        data = operation(status, lastOperationAction);
        break;
      }
      case '/api/admin/operations/preview':
        lastOperationAction = route.request().postDataJSON()?.action || 'provider_probe';
        data = operation('previewed', lastOperationAction);
        break;
      case `/api/admin/operations/${operationId}/commit`: {
        const status = options.commitStatus || 'completed';
        data = {
          operation: operation(status, lastOperationAction),
          reused: false,
          probe: status === 'completed' && lastOperationAction === 'provider_probe'
            ? { provider: 'google', status: 'healthy' }
            : undefined,
        };
        break;
      }
      default:
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, data: null, error: { code: 'NOT_FOUND', message: 'Synthetic route missing', retryable: false }, meta: { requestId, generatedAt: new Date().toISOString(), warnings: [] } }) });
        return;
    }
    if (url.pathname === '/api/admin/reconciliation' && options.reconciliationPatch) {
      data = { ...data, ...options.reconciliationPatch };
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope(data, { ...meta, ...(options.meta || {}) })),
    });
  });
}

test('desktop shell renders operational overview without a giant snapshot', async ({ page }) => {
  await setupApi(page);
  await page.goto('/overview');
  await expect(page.getByRole('heading', { name: '總覽' })).toBeVisible();
  await expect(page.getByText('Active accounts').locator('..').getByText('1')).toBeVisible();
  await expect(page.getByRole('navigation', { name: '主要導覽' })).toContainText('可靠性');
  expect((await page.locator('body').evaluate(el => el.scrollWidth <= el.clientWidth))).toBe(true);
  if (process.env.CAPTURE_UI === '1') await page.screenshot({ path: 'test-results/overview-desktop.png', fullPage: true });
});

test('missing session opens login while auth-state outage remains fail-closed', async ({ page }) => {
  await setupApi(page, { sessionErrorStatus: 401 });
  await page.goto('/overview');
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('heading', { name: 'Travel Expense Admin Console' })).toBeVisible();
  await expect(page.getByLabel('管理員通行片語')).toBeVisible();

  const outagePage = await page.context().newPage();
  await setupApi(outagePage, { sessionErrorStatus: 503 });
  await outagePage.goto('/overview');
  await expect(outagePage.getByRole('alert')).toContainText('管理員驗證服務暫時不可用');
  await expect(outagePage.getByRole('alert')).toContainText('UPSTREAM_UNAVAILABLE');
  await expect(outagePage.getByLabel('管理員通行片語')).toHaveCount(0);
});

test('account list and detail preserve URL navigation', async ({ page }) => {
  await setupApi(page);
  await page.goto('/data/accounts?status=active');
  await expect(page.getByRole('heading', { name: '帳戶', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Boss Travel' }).click();
  await expect(page).toHaveURL(new RegExp(`/data/accounts/${accountId}$`));
  await expect(page.getByText('read-owner@example.invalid').first()).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/status=active/);
});

test('trip detail renders Audit v2 object results without a React crash', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await setupApi(page, {
    auditItems: [{
      id: '98900000-0000-4000-8000-000000000001',
      admin_subject_hash: 'a'.repeat(64),
      action: 'operation_completed',
      target_type: 'trip',
      target_id_hash: 'b'.repeat(64),
      request_id: requestId,
      result: { status: 'completed' },
      error_code: null,
      created_at: new Date().toISOString(),
    }],
  });
  await page.goto(`/data/trips/${tripId}`);
  await expect(page.getByRole('heading', { name: '最近審計' })).toBeVisible();
  await expect(page.locator('.operation-list li').filter({ hasText: 'operation_completed' }))
    .toContainText('completed');
  expect(pageErrors).toEqual([]);
});

test('receipt selection exports bounded formula-safe CSV and clears on filter change', async ({ page }) => {
  await setupApi(page, {
    receipts: [{ ...receipt, store: '=HYPERLINK("https://attacker.invalid")' }],
  });
  await page.goto('/data/receipts');
  await page.getByRole('checkbox', { name: '選取全部本頁收據' }).check();
  await expect(page.getByText('已選 1 項')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出已選 CSV' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let csv = '';
  for await (const chunk of stream) csv += chunk.toString('utf8');
  expect(csv).toContain("'=HYPERLINK");
  await page.getByLabel('可見範圍').selectOption('private');
  await expect(page.getByText('已選 1 項')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('已清除選取');
});

test('cursor history returns through opaque pages while direct links fall back to the first page', async ({ page }) => {
  await setupApi(page, { receiptCursorPages: true });
  await page.goto('/data/receipts');
  await page.getByRole('button', { name: '下一頁' }).click();
  await expect(page).toHaveURL(/cursor=page-2/);
  await page.getByRole('button', { name: '下一頁' }).click();
  await expect(page).toHaveURL(/cursor=page-3/);
  await page.getByRole('button', { name: '上一頁' }).click();
  await expect(page).toHaveURL(/cursor=page-2/);
  await page.getByRole('button', { name: '上一頁' }).click();
  await expect(page).toHaveURL('/data/receipts');

  await page.goto('/data/receipts?cursor=opaque-next-page');
  await page.getByRole('button', { name: '上一頁' }).click();
  await expect(page).toHaveURL('/data/receipts');
  await expect(page.getByRole('heading', { name: '收據', exact: true })).toBeVisible();
});

test('partial integrity scans warn operators and expose finding detail', async ({ page }) => {
  await setupApi(page, {
    integrity: {
      state: 'partial',
      run: {
        id: '98600000-0000-4000-8000-000000000001',
        source: 'admin-integrity-v1',
        status: 'partial',
        summary: { checkVersion: 'admin-integrity-v1', recordsChecked: 42, findings: 1 },
        completedAt: new Date().toISOString(),
      },
      items: [{
        id: '98700000-0000-4000-8000-000000000001',
        run_id: '98600000-0000-4000-8000-000000000001',
        severity: 'high',
        finding_type: 'out_of_range_itinerary_day',
        entity_type: 'trip',
        entity_id: tripId,
        detail: { date: '2026-04-26', expectedEnd: '2026-04-25' },
        created_at: new Date().toISOString(),
      }],
    },
  });
  await page.goto('/reliability/integrity');
  await expect(page.getByRole('alert')).toContainText('部分');
  await page.getByText('查看詳細資料').click();
  await expect(page.getByText('2026-04-26')).toBeVisible();
});

test('audit defaults to 24 hours and datetime filters retain local input values', async ({ page }) => {
  const requests = [];
  await setupApi(page, { requests });
  await page.goto('/audit');
  const startInput = page.getByLabel('開始日期');
  await expect(startInput).not.toHaveValue('');
  await expect(page).toHaveURL(/startAt=/);
  const startAt = new URL(page.url()).searchParams.get('startAt');
  expect(startAt).toBeTruthy();
  const age = Date.now() - Date.parse(startAt);
  expect(age).toBeGreaterThan(23 * 60 * 60 * 1000);
  expect(age).toBeLessThan(25 * 60 * 60 * 1000);

  const endInput = page.getByLabel('結束日期');
  await endInput.fill('2026-07-12T10:30');
  await expect(endInput).toHaveValue('2026-07-12T10:30');
  expect(Number.isFinite(Date.parse(new URL(page.url()).searchParams.get('endAt')))).toBe(true);

  await page.getByRole('button', { name: '全部時間' }).click();
  await expect(page).not.toHaveURL(/startAt=/);
  await expect(startInput).toHaveValue('');
  await page.getByRole('button', { name: '24 小時' }).click();
  await expect(page).not.toHaveURL(/cursor=/);
  await expect(startInput).not.toHaveValue('');
  expect(requests.some((request) => request.pathname === '/api/admin/audit' && request.search.includes('startAt='))).toBe(true);
});

test('Nagoya itinerary is exactly six inclusive days with no outside scenery', async ({ page }) => {
  await setupApi(page);
  await page.goto(`/data/trips/${tripId}/itinerary`);
  await expect(page.getByRole('heading', { name: '行程表' })).toBeVisible();
  await expect(page.locator('.itinerary-day')).toHaveCount(6);
  await expect(page.locator('.itinerary-day').first()).toContainText('2026-04-20');
  await expect(page.locator('.itinerary-day').last()).toContainText('2026-04-25');
  await expect(page.getByText('中部國際機場')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Version history' })).toBeVisible();
  await expect(page.getByText('v7')).toBeVisible();
  await expect(page.getByText('Out of range scenery')).toHaveCount(0);
});

test('mobile console has bottom navigation and no document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await setupApi(page);
  await page.goto('/overview');
  await expect(page.getByRole('navigation', { name: '流動版主要導覽' })).toBeVisible();
  expect(await page.locator('body').evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }))).toEqual({ scroll: 360, client: 360 });
  await page.getByRole('navigation', { name: '流動版主要導覽' }).getByText('資料').click();
  await expect(page.getByRole('heading', { name: '帳戶', exact: true })).toBeVisible();
  expect((await page.locator('body').evaluate(el => el.scrollWidth <= el.clientWidth))).toBe(true);
  if (process.env.CAPTURE_UI === '1') await page.screenshot({ path: 'test-results/accounts-mobile.png', fullPage: true });
});

test('tablet shell reports its environment and restores focus from modal panels', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await setupApi(page);
  await page.goto('/overview');
  await expect(page.getByRole('banner').getByText('LOCAL', { exact: true })).toBeVisible();

  const menu = page.getByRole('button', { name: '開啟導覽' });
  const menuBox = await menu.boundingBox();
  expect(menuBox.width).toBeGreaterThanOrEqual(44);
  expect(menuBox.height).toBeGreaterThanOrEqual(44);
  await menu.click();
  await expect(page.getByRole('dialog', { name: '主要導覽選單' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '主要導覽選單' })).not.toBeVisible();
  await expect(menu).toBeFocused();

  await menu.click();
  await page.getByRole('dialog', { name: '主要導覽選單' }).getByText('資料').click();
  const accountHeading = page.getByRole('heading', { name: '帳戶', exact: true });
  await expect(accountHeading).toBeFocused();

  const activity = page.getByRole('button', { name: '開啟 Activity Center' });
  await activity.click();
  await expect(page.getByRole('dialog', { name: 'Activity Center' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Activity Center' })).not.toBeVisible();
  await expect(activity).toBeFocused();
});

test('session security dialog lists redacted passkeys and backup capacity', async ({ page }) => {
  await setupApi(page);
  await page.goto('/overview');
  const trigger = page.getByRole('button', { name: '管理 Boss passkeys' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Boss passkeys' });
  await expect(dialog).toContainText('Boss Mac');
  await expect(dialog).toContainText('1 / 3');
  await expect(dialog.getByLabel('Current passphrase')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '新增備用 passkey' })).toBeDisabled();
  await dialog.getByRole('button', { name: '關閉 passkey 管理' }).click();
  await expect(trigger).toBeFocused();
});

test('typed dependency error shows request evidence and retry', async ({ page }) => {
  await setupApi(page, { errorPath: '/api/admin/providers' });
  await page.goto('/system/providers');
  await expect(page.getByRole('alert')).toContainText('Synthetic dependency unavailable');
  await expect(page.getByRole('alert')).toContainText('UPSTREAM_UNAVAILABLE');
  await expect(page.getByRole('button', { name: '重試' })).toBeVisible();
});

test('provider R1 operation requires server preview before commit', async ({ page }) => {
  await setupApi(page);
  await page.goto('/system/providers');
  await page.getByRole('button', { name: 'Probe Google Gemma' }).click();
  await expect(page.getByRole('dialog')).toContainText('Sends one explicit credential test request');
  await page.getByRole('button', { name: '確認執行' }).click();
  await expect(page.getByRole('dialog')).toContainText('操作已由 server 驗證完成');
});

test('provider cooldown is visible and blocks duplicate probes', async ({ page }) => {
  await setupApi(page, {
    providerProbeAvailableAt: new Date(Date.now() + 1_000).toISOString(),
  });
  await page.goto('/system/providers');
  await expect(page.getByText('Cooldown 至')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Probe Google Gemma' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Probe Google Gemma' })).toBeEnabled({ timeout: 2_000 });
});

test('infrastructure reports the backend deny-all runtime policy', async ({ page }) => {
  await setupApi(page);
  await page.goto('/system/infrastructure');
  const policy = page.locator('.data-section').filter({ hasText: 'Runtime policy' });
  await expect(policy).toContainText('deny_all');
  await expect(policy).toContainText('admin-write-mode-v1');
  await expect(policy).toContainText('default');
  await expect(policy).toContainText('Writes disabled');
});

test('infrastructure reports the runtime policy state supplied by the backend', async ({ page }) => {
  await setupApi(page, {
    runtimePolicy: { status: 'allowlisted', version: 'admin-write-mode-v1', source: 'ADMIN_WRITE_MODE', expiresAt: null, writable: true },
  });
  await page.goto('/system/infrastructure');
  const policy = page.locator('.data-section').filter({ hasText: 'Runtime policy' });
  await expect(policy).toContainText('allowlisted');
  await expect(policy).toContainText('admin-write-mode-v1');
  await expect(policy).toContainText('ADMIN_WRITE_MODE');
  await expect(policy).toContainText('Writes enabled');
});

test('non-terminal operation responses never claim verified completion', async ({ page }) => {
  await setupApi(page, { commitStatus: 'queued' });
  await page.goto('/system/providers');
  await page.getByRole('button', { name: 'Probe Google Gemma' }).click();
  await page.getByRole('button', { name: '確認執行' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('queued');
  await expect(dialog).not.toContainText('操作已由 server 驗證完成');
  await expect(dialog.getByRole('button', { name: '關閉並追蹤' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '確認執行' })).toHaveCount(0);
});

test('network loss after commit enters outcome unknown and recovers from operation status', async ({ page }) => {
  const requests = [];
  await setupApi(page, {
    commitNetworkError: true,
    operationReadStatuses: ['outcome_unknown', 'completed'],
    activityOperationStatuses: ['outcome_unknown'],
    requests,
  });
  await page.goto('/system/providers');
  await page.getByRole('button', { name: 'Probe Google Gemma' }).click();
  await page.getByRole('button', { name: '確認執行' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('結果未確認');
  await expect(dialog).not.toContainText('操作已由 server 驗證完成');
  await dialog.getByRole('button', { name: '查看 Activity Center' }).click();
  const activityCenter = page.getByRole('dialog', { name: 'Activity Center' });
  await expect(activityCenter).toContainText('outcome_unknown');
  const activityReadsBefore = requests.filter((request) => request.pathname === '/api/admin/operations').length;
  await activityCenter.getByRole('button', { name: `重新檢查操作 ${operationId.slice(0, 8)}` }).click();
  await expect.poll(() => requests.filter((request) => request.pathname === '/api/admin/operations').length)
    .toBeGreaterThan(activityReadsBefore);
  await activityCenter.getByRole('button', { name: '關閉' }).click();
  await page.getByRole('button', { name: '開啟 Activity Center' }).click();
  await expect(page.getByRole('dialog', { name: 'Activity Center' })).toContainText('outcome_unknown');
  await page.getByRole('dialog', { name: 'Activity Center' }).getByRole('button', { name: '關閉' }).click();
});

test('integrity scan is a previewed R1 operation and refreshes the run', async ({ page }) => {
  await setupApi(page);
  await page.goto('/reliability/integrity');
  await expect(page.getByText('42', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '執行掃描' }).click();
  await expect(page.getByRole('dialog')).toContainText('Checks itinerary');
  await page.getByRole('button', { name: '確認執行' }).click();
  await expect(page.getByRole('dialog')).toContainText('操作已由 server 驗證完成');
});

test('partial or truncated reconciliation never reports a balanced result', async ({ page }) => {
  await setupApi(page, {
    reconciliationPatch: {
      items: [],
      notionSource: 'partial',
      notionRowsScanned: 200,
      resultRows: 201,
      truncated: true,
    },
    meta: { warnings: ['NOTION_RESULTS_TRUNCATED'], sources: { 'shared-cloud': 'live', notion: 'unavailable' } },
  });
  await page.goto(`/reliability/reconciliation?tripId=${tripId}`);
  await expect(page.getByRole('alert')).toContainText('對數覆蓋未完成');
  await expect(page.getByRole('alert')).toContainText('200');
  await expect(page.getByText('Supabase 與 Notion 一致')).toHaveCount(0);
});

test('receipt photo is rendered through the admin BFF route', async ({ page }) => {
  await setupApi(page);
  await page.goto(`/data/receipts/${receiptId}`);
  const image = page.getByRole('img', { name: 'Nagoya Station 收據照片' });
  await expect(image).toBeVisible();
  await expect(image).toHaveJSProperty('naturalWidth', 1);
});

test('receipt sync controls expose only server-eligible retry and cancel actions', async ({ page }) => {
  const requests = [];
  const failedJobId = '98500000-0000-4000-8000-000000000001';
  const pendingJobId = '98500000-0000-4000-8000-000000000002';
  const processingJobId = '98500000-0000-4000-8000-000000000003';
  await setupApi(page, {
    requests,
    receiptSyncJobs: [
      { id: failedJobId, provider: 'notion', operation: 'upsert', status: 'failed', attempts: 2 },
      { id: pendingJobId, provider: 'notion', operation: 'upsert', status: 'pending', attempts: 0 },
      { id: processingJobId, provider: 'notion', operation: 'upsert', status: 'processing', attempts: 1 },
    ],
  });
  await page.goto(`/data/receipts/${receiptId}`);
  await page.getByRole('button', { name: `重試 sync job ${failedJobId}` }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(requests.find(request => request.pathname === '/api/admin/operations/preview')?.body?.action)
    .toBe('retry_sync_job');
  await page.getByRole('button', { name: '關閉操作' }).click();
  await expect(page.getByRole('button', { name: `取消 sync job ${pendingJobId}` })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(processingJobId) })).toHaveCount(0);
});

test('receipt R2 editor creates a versioned before-and-after preview', async ({ page }) => {
  await setupApi(page);
  await page.goto(`/data/receipts/${receiptId}`);
  await page.getByRole('button', { name: '修改' }).click();
  await page.getByLabel('商戶').fill('Nagoya Dinner');
  await page.getByRole('button', { name: '預覽修改' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('R2');
  await expect(dialog.getByRole('heading', { name: '目前資料' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: '提交後' })).toBeVisible();
  await expect(dialog.getByLabel('Current passphrase')).toBeVisible();
  if (process.env.CAPTURE_UI === '1') await page.screenshot({ path: 'test-results/visual-audit/receipt-r2-preview.png', fullPage: true });
});

test('itinerary editor preserves six days and previews one full canonical payload', async ({ page }) => {
  await setupApi(page);
  await page.goto(`/data/trips/${tripId}/itinerary`);
  await page.getByRole('button', { name: '編輯行程' }).click();
  await expect(page.locator('.itinerary-day-editor')).toHaveCount(6);
  if (process.env.CAPTURE_UI === '1') await page.screenshot({ path: 'test-results/visual-audit/itinerary-editor.png', fullPage: true });
  await page.getByLabel('標題').first().fill('名古屋抵達日');
  await page.getByRole('button', { name: '預覽完整行程' }).click();
  await expect(page.getByRole('dialog')).toContainText('itinerary amend');
  await expect(page.getByRole('dialog').getByLabel('Current passphrase')).toBeVisible();
});

test('date shrink requires and transmits explicit removal of a title-only itinerary day', async ({ page }) => {
  const requests = [];
  const titleOnly = {
    ...itinerary,
    days: itinerary.days.map((day) => day.date === '2026-04-25'
      ? { date: day.date, title: '返港日', spots: [] }
      : day),
  };
  await setupApi(page, { itinerary: titleOnly, requests });
  await page.goto(`/data/trips/${tripId}/itinerary`);
  await page.getByRole('button', { name: '編輯行程' }).click();
  await page.getByLabel('結束日期').fill('2026-04-24');
  await expect(page.getByRole('alert')).toContainText('縮短日期前要處理範圍外內容');
  await expect(page.getByRole('alert')).toContainText('2026-04-25');
  await expect(page.getByRole('button', { name: '預覽完整行程' })).toBeDisabled();
  await page.getByRole('alert').getByRole('button', { name: '明確移除' }).click();
  await expect(page.getByRole('button', { name: '預覽完整行程' })).toBeEnabled();
  await page.getByRole('button', { name: '預覽完整行程' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const preview = requests.find((request) => request.pathname === '/api/admin/operations/preview');
  expect(preview?.body?.payload?.removedDates).toEqual(['2026-04-25']);
});

test('trip member role and itinerary restore both enter the shared R2 preview flow', async ({ page }) => {
  await setupApi(page);
  await page.goto(`/data/trips/${tripId}`);
  const memberRow = page.getByRole('row').filter({ hasText: 'me***@example.invalid' });
  await memberRow.getByRole('combobox').selectOption('admin');
  await memberRow.getByRole('button', { name: '套用角色' }).click();
  await expect(page.getByRole('dialog')).toContainText('member role');
  await page.getByRole('button', { name: '關閉操作' }).click();

  await page.goto(`/data/trips/${tripId}/itinerary`);
  await page.getByRole('button', { name: '還原行程版本 6' }).click();
  await expect(page.getByRole('dialog')).toContainText('itinerary restore');
});

test('R2 passkey remains available on a zoomed desktop viewport', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 844 });
  await setupApi(page);
  await page.goto(`/data/receipts/${receiptId}`);
  await page.getByRole('button', { name: '移至 Trash' }).click();
  await expect(page.getByRole('dialog').getByLabel('Current passphrase')).toBeVisible();
  await page.getByRole('dialog').getByLabel('Current passphrase').fill('passphrase');
  await expect(page.getByRole('button', { name: '驗證並執行' })).toBeEnabled();
});

test('mobile R2 preview shows impact but blocks commit on the small viewport', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => query === '(pointer: coarse)' || query === '(any-pointer: fine)'
      ? { matches: query === '(any-pointer: fine)', media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }
      : nativeMatchMedia(query);
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (Linux; Android 16; Pixel 8) AppleWebKit/537.36 Mobile' });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await setupApi(page);
  await page.goto(`/data/receipts/${receiptId}`);
  await page.getByRole('button', { name: '移至 Trash' }).click();
  await expect(page.getByRole('dialog')).toContainText('請使用桌面版完成');
  await expect(page.getByRole('button', { name: '驗證並執行' })).toBeDisabled();
  expect((await page.locator('body').evaluate(el => el.scrollWidth <= el.clientWidth))).toBe(true);
});

test('sync actions fail closed for partial and offline data, then reactively recover online', async ({ page }) => {
  await page.addInitScript(() => {
    let online = true;
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online });
    window.__setAdminOnline = (value) => {
      online = value;
      window.dispatchEvent(new Event(value ? 'online' : 'offline'));
    };
  });
  const failedJobId = '98500000-0000-4000-8000-000000000001';
  await setupApi(page, {
    syncJobs: [{ id: failedJobId, provider: 'notion', operation: 'upsert', status: 'failed', attempts: 2, owner_masked_email: 're***@example.invalid', receipt_id: receiptId, next_attempt_at: null, last_error: 'Synthetic failure', updated_at: new Date().toISOString() }],
  });
  await page.goto('/reliability/sync');
  const retry = page.getByRole('button', { name: `重試同步工作 ${failedJobId.slice(0, 8)}` });
  await expect(retry).toBeEnabled();
  await page.evaluate(() => window.__setAdminOnline(false));
  await expect(retry).toBeDisabled();
  await page.evaluate(() => window.__setAdminOnline(true));
  await expect(retry).toBeEnabled();

  const partialPage = await page.context().newPage();
  await setupApi(partialPage, {
    receiptSyncJobs: [{ id: failedJobId, provider: 'notion', operation: 'upsert', status: 'failed', attempts: 2 }],
    meta: { warnings: ['NOTION_RESULTS_TRUNCATED'], sources: { 'shared-cloud': 'live', notion: 'partial' } },
  });
  await partialPage.goto(`/data/receipts/${receiptId}`);
  await expect(partialPage.getByRole('button', { name: `重試 sync job ${failedJobId}` })).toBeDisabled();
  await partialPage.close();

  const stalePage = await page.context().newPage();
  await setupApi(stalePage, {
    receiptSyncJobs: [{ id: failedJobId, provider: 'notion', operation: 'upsert', status: 'failed', attempts: 2 }],
    meta: { generatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), staleAfterSeconds: 30, sources: { 'shared-cloud': 'live' } },
  });
  await stalePage.goto(`/data/receipts/${receiptId}`);
  await expect(stalePage.getByRole('button', { name: `重試 sync job ${failedJobId}` })).toBeDisabled();
  await stalePage.close();
});

test('passkey API 401 clears the client session and failed logout preserves it for retry', async ({ page }) => {
  await setupApi(page, { passkeyUnauthorized: true });
  await page.goto('/overview');
  await page.getByRole('button', { name: '管理 Boss passkeys' }).click();
  await expect(page).toHaveURL('/login');

  await setupApi(page, { logoutError: true });
  await page.goto('/overview');
  await page.getByRole('button', { name: '登出管理員' }).click();
  await expect(page.getByRole('alert')).toContainText('Synthetic logout store unavailable');
  await expect(page.getByRole('heading', { name: '總覽' })).toBeVisible();
  await expect(page.getByRole('button', { name: '重試登出' })).toBeVisible();
});

test('stale entity snapshots disable every R2 entry point', async ({ page }) => {
  await setupApi(page, {
    meta: {
      generatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      staleAfterSeconds: 30,
      sources: { 'shared-cloud': 'live' },
    },
  });

  await page.goto(`/data/receipts/${receiptId}`);
  await expect(page.getByText('資料已過期，寫入操作已停用')).toBeVisible();
  await expect(page.getByRole('button', { name: '修改' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '移至 Trash' })).toBeDisabled();

  await page.goto(`/data/trips/${tripId}`);
  await expect(page.getByRole('button', { name: '修改' })).toBeDisabled();

  await page.goto(`/data/trips/${tripId}/itinerary`);
  await expect(page.getByRole('button', { name: '編輯行程' })).toBeDisabled();
});

test('capture workspace visual audit', async ({ page }) => {
  test.skip(process.env.CAPTURE_UI !== '1', 'visual audit capture only');
  await setupApi(page);
  for (const [name, path] of workspaceRoutes) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    await page.screenshot({ path: `test-results/visual-audit/${name}.png`, fullPage: true });
  }
});

test('all workspace routes have no serious or critical axe violations on desktop and mobile', async ({ page }) => {
  await setupApi(page);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const [name, path] of workspaceRoutes) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      const blocking = results.violations.filter(item => ['serious', 'critical'].includes(item.impact));
      expect(blocking, `${name} at ${viewport.width}x${viewport.height}\n${JSON.stringify(blocking, null, 2)}`).toEqual([]);
    }
  }
});

test('representative workspaces reflow without document overflow across release viewports', async ({ page }) => {
  await setupApi(page);
  const viewports = [
    { width: 320, height: 568 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
    { width: 640, height: 400 },
  ];
  const routes = workspaceRoutes.filter(([name]) => [
    'overview', 'accounts', 'trip-detail', 'itinerary',
    'receipt-detail', 'integrity', 'providers', 'audit',
  ].includes(name));

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const [name, path] of routes) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      const layout = await page.evaluate(() => ({
        documentScrollWidth: document.documentElement.scrollWidth,
        documentClientWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        bodyClientWidth: document.body.clientWidth,
      }));
      expect(
        layout.documentScrollWidth <= layout.documentClientWidth + 1
          && layout.bodyScrollWidth <= layout.bodyClientWidth + 1,
        `${name} overflowed at ${viewport.width}x${viewport.height}: ${JSON.stringify(layout)}`,
      ).toBe(true);
    }
  }
});
