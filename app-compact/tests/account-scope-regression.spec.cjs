const { test, expect } = require('@playwright/test');
const origin = process.env.COMPACT_TEST_ORIGIN || 'http://127.0.0.1:8903';
async function boot(page) {
  page.on("pageerror", error => console.error(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.fulfill({ status: 200, json: [] }));
  await page.route('**/src/lib/clientHeartbeat.ts', route => route.fulfill({ contentType: 'application/javascript', body: 'export const recordClientHeartbeat = async () => {};' }));
  await page.route('**/src/lib/scopedPersistence.ts', route => route.fulfill({ contentType: 'application/javascript', body: `export * from '/travel-expense/compact/src/lib/scopedPersistence.ts?actual';
export const safeInitialState = scope => window.seed(scope.split(':')[1]);
export const hydrateScope = scope => window.defer('hydrate', scope.split(':')[1]);
export const persistScope = async () => ({ status: 'succeeded' });` }));
  await page.route('**/src/lib/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: `export * from '/travel-expense/compact/src/lib/supabase.ts?actual';
export const hasSupabaseSession = s => !!s?.user?.id;
export const upsertSupabaseReceipt = (s, state, receipt) => window.defer('push', s.user.id, receipt);
export const pullSupabaseData = (s) => window.defer('pull', s.user.id);` }));
  await page.route('**/audit-harness', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div><script type="module">import RefreshRuntime from "/travel-expense/compact/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>t=>t;window.__vite_plugin_react_preamble_installed__=true; await import("/travel-expense/compact/tests/fixtures/account-scope.tsx");</script>' }));
  await page.goto(`${origin}/audit-harness`);
  await expect.poll(() => page.evaluate(() => window.hydrates?.length || 0), { timeout: 15000 }).toBeGreaterThan(0);
}
async function hydrate(page, account) {
  await page.evaluate(account => window.hydrates.filter(x => x.account === account).forEach(x => x.resolve(window.seed(account))), account);
  await expect.poll(() => page.evaluate(() => window.api.isStorageReady)).toBe(true);
}
const receipt = { id: 'r1', sourceId: 'source1', tripId: 't1', store: 'original', total: 1, date: '2026-10-03', category: 'food', payment: 'cash', updatedAt: 10, version: 1 };
async function queueReceipt(page) {
  await page.evaluate(receipt => window.api.setState(s => ({ ...s, receipts: [receipt], syncQueue: [{ id: 'q1', type: 'receipt', entityId: 'r1', op: 'upsert', status: 'queued', attempts: 0, createdAt: 10, updatedAt: 10, payload: { updatedAt: 10 } }] })), receipt);
  await expect.poll(() => page.evaluate(() => window.api.state.receipts.length)).toBe(1);
  await page.evaluate(() => { window.pushDone = window.api.push(); });
  await expect.poll(() => page.evaluate(() => window.calls.length)).toBe(1);
}
test('StrictMode hydration preserves edits and deletions, then rejects an old account setter', async ({ page }) => {
  await boot(page);
  await page.evaluate(receipt => { window.oldSet = window.api.setState; window.api.setState(s => ({ ...s, budget: 321 })); window.api.deleteReceipt(receipt); }, receipt);
  await page.evaluate(receipt => window.hydrates.forEach(x => x.resolve({ ...window.seed('A'), receipts: [receipt], budget: 999 })), receipt);
  await expect.poll(() => page.evaluate(() => ({ budget: window.api.state.budget, count: window.api.state.receipts.length }))).toEqual({ budget: 321, count: 0 });
  await page.evaluate(() => window.api.switchAccount('B'));
  await expect.poll(() => page.evaluate(() => window.api.account)).toBe('B');
  await page.evaluate(() => window.oldSet(s => ({ ...s, budget: 777 })));
  await hydrate(page, 'B');
  expect(await page.evaluate(() => window.views.filter(x => x.account === 'B').every(x => x.budget === 200))).toBe(true);
});
test('a late A push cannot settle into B or a fresh A mount', async ({ page }) => {
  await boot(page); await hydrate(page, 'A'); await queueReceipt(page);
  await page.evaluate(() => window.api.switchAccount('B')); await expect.poll(() => page.evaluate(() => window.api.account)).toBe('B'); await hydrate(page, 'B');
  await page.evaluate(() => window.api.switchAccount('A')); await expect.poll(() => page.evaluate(() => window.api.account)).toBe('A'); await hydrate(page, 'A');
  await page.evaluate(() => window.calls[0].resolve({ ...window.calls[0].value, supabaseId: 'cloud-A', version: 2 }));
  await page.evaluate(() => window.pushDone);
  expect(await page.evaluate(() => window.api.state.receipts)).toEqual([]);
});
test('a mid-flight edit keeps content and adopts the successful cloud version', async ({ page }) => {
  await boot(page); await hydrate(page, 'A'); await queueReceipt(page);
  await page.evaluate(() => window.api.setState(s => ({ ...s, receipts: s.receipts.map(r => ({ ...r, store: 'edited', updatedAt: 20 })), syncQueue: s.syncQueue.map(q => ({ ...q, updatedAt: 20, status: 'queued', payload: { updatedAt: 20 } })) })));
  await expect.poll(() => page.evaluate(() => window.api.state.receipts[0].store)).toBe('edited');
  await page.evaluate(() => window.calls[0].resolve({ ...window.calls[0].value, supabaseId: 'cloud-r1', version: 2, syncRevision: 2 }));
  await page.evaluate(() => window.pushDone);
  expect(await page.evaluate(() => window.api.state.receipts[0])).toMatchObject({ store: 'edited', supabaseId: 'cloud-r1', version: 2, syncStatus: 'queued' });
  expect(await page.evaluate(() => window.api.state.syncQueue[0].status)).toBe('queued');
});
test('delete during creation retains the returned identity for the durable delete', async ({ page }) => {
  await boot(page); await hydrate(page, 'A'); await queueReceipt(page);
  await page.evaluate(() => window.api.deleteReceipt(window.api.state.receipts[0]));
  await expect.poll(() => page.evaluate(() => window.api.state.receipts.length)).toBe(0);
  await page.evaluate(() => window.calls[0].resolve({ ...window.calls[0].value, supabaseId: 'cloud-r1', version: 2, syncRevision: 2 }));
  await page.evaluate(() => window.pushDone);
  expect(await page.evaluate(() => window.api.state.syncQueue.find(q => q.type === 'delete-receipt')?.payload)).toMatchObject({ supabaseId: 'cloud-r1', version: 2 });
  expect(await page.evaluate(() => window.api.state.receipts)).toEqual([]);
});
test('late A pull does not merge into B', async ({ page }) => {
  await boot(page); await hydrate(page, 'A');
  await page.evaluate(() => { window.pullDone = window.api.pull(); });
  await expect.poll(() => page.evaluate(() => window.calls.length)).toBe(1);
  await page.evaluate(() => window.api.switchAccount('B')); await expect.poll(() => page.evaluate(() => window.api.account)).toBe('B'); await hydrate(page, 'B');
  await page.evaluate(receipt => window.calls[0].resolve({ trips: [], receipts: [receipt], tombstones: [], settings: { budget: 999 } }), receipt);
  await page.evaluate(() => window.pullDone);
  expect(await page.evaluate(() => ({ budget: window.api.state.budget, receipts: window.api.state.receipts }))).toEqual({ budget: 200, receipts: [] });
});
test('service requests keep their initiating bearer, mutation keys, and deleted trip target', async ({ page }) => {
  const calls = [];
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const body = request.postData() ? request.postDataJSON() : null;
    calls.push({ url: request.url(), auth: request.headers().authorization, body });
    const row = body?.p_receipt ? { ...body.p_receipt, id: '11111111-1111-4111-8111-111111111111', trip_id: body.p_trip_id, version: 2 } : [];
    await route.fulfill({ status: 200, json: row });
  });
  await page.route('**/service-harness', route => route.fulfill({ contentType: 'text/html', body: '<div>Service fixture</div>' }));
  await page.goto(`${origin}/service-harness`);
  const result = await page.evaluate(async () => {
    const service = await import('/travel-expense/compact/src/lib/supabase.ts');
    const { DEFAULT_STATE } = await import('/travel-expense/compact/src/lib/constants.ts');
    if (!service.isSupabaseConfigured()) return { configured: false };
    const A = { user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'a@example.com' }, access_token: 'fixture-A' };
    const B = { user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'b@example.com' }, access_token: 'fixture-B' };
    const clientA = service.getSupabaseClient(A);
    const clientB = service.getSupabaseClient(B);
    await clientB.from('profiles').select('id');
    A.access_token = 'mutated-token';
    await clientA.from('profiles').select('id');
    const trip = { ...DEFAULT_STATE.trips[0], id: 'original', supabaseId: '22222222-2222-4222-8222-222222222222' };
    const state = { ...DEFAULT_STATE, activeTripId: 'original', trips: [trip] };
    const receipt = { id: 'local', tripId: 'original', sourceId: 'local', store: 'first', total: 1, date: '2026-10-03', version: 1, updatedAt: 10 };
    await service.upsertSupabaseReceipt(A, state, receipt);
    await service.upsertSupabaseReceipt(A, state, receipt);
    await service.upsertSupabaseReceipt(A, state, { ...receipt, store: 'different edit' });
    let rejected = false;
    try { await service.upsertSupabaseReceipt(A, state, { ...receipt, tripId: 'missing' }); } catch { rejected = true; }
    await service.archiveSupabaseReceipt(A, state, { ...receipt, tripId: 'deleted', supabaseId: '11111111-1111-4111-8111-111111111111' }, '33333333-3333-4333-8333-333333333333');
    return { configured: true, rejected };
  });
  expect(result).toEqual({ configured: true, rejected: true });
  expect(calls[0].auth).toBe('Bearer fixture-B');
  expect(calls.slice(1).every(c => c.auth === 'Bearer fixture-A')).toBe(true);
  const keys = calls.filter(c => c.body?.p_receipt).map(c => c.body.p_idempotency_key);
  expect(keys).toHaveLength(3); expect(keys[0]).toBe(keys[1]); expect(keys[2]).not.toBe(keys[0]);
  expect(calls.at(-1).body.p_trip_id).toBe('33333333-3333-4333-8333-333333333333');
});
