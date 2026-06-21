// Throwaway exploratory driver: load the app with diverse stress data, walk every tab + open the
// receipt editor, and capture ALL console errors / page exceptions / failed requests. Not a smoke —
// it asserts nothing; it surfaces runtime errors the assertion-based smokes don't look for.
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:8903/travel-expense/compact/';
const seed = {
  schemaVersion: 3,
  lastTab: 'dashboard',
  budget: 200000,
  rate: 20,
  tripCurrency: 'JPY',
  activeTripId: 't1',
  tripName: 'Stress Trip',
  tripDateRange: { start: '2026-04-20', end: '2026-04-25' },
  persons: [
    { id: 'p_boss', name: 'Boss', emoji: '👦', color: '#CC2929' },
    { id: 'p_xinxin', name: '欣欣', emoji: '👧', color: '#2962CC' },
    { id: 'p_c', name: 'Carol', emoji: '🧑', color: '#29CC62' },
  ],
  shareRatios: { p_boss: 1, p_xinxin: 1, p_c: 1 },
  trips: [{
    id: 't1', name: 'Stress Trip', destinationSummary: 'Nagoya', startDate: '2026-04-20', endDate: '2026-04-25',
    homeCurrency: 'HKD', currencies: ['HKD', 'JPY', 'KRW'], timezones: ['Asia/Tokyo'], version: 1, active: true,
    itinerary: [{ date: '2026-04-20', day: 1, region: 'Nagoya', spots: [{ time: '12:00', name: 'Lunch', type: 'food' }] }],
    createdAt: 1, updatedAt: 1,
  }],
  receipts: [
    { id: 'r1', store: 'Shared JPY equal', total: 3000, date: '2026-04-20', category: 'food', payment: 'cash', personId: 'p_boss', splitMode: 'shared', currency: 'JPY', createdAt: 1 },
    { id: 'r2', store: 'Exact split', total: 9000, date: '2026-04-21', category: 'food', payment: 'credit', personId: 'p_boss', splitMode: 'shared', currency: 'JPY', splitType: 'exact', splits: [{ personId: 'p_boss', amount: 3000 }, { personId: 'p_xinxin', amount: 3000 }, { personId: 'p_c', amount: 3000 }], createdAt: 2 },
    { id: 'r3', store: 'Multi-payer', total: 6000, date: '2026-04-21', category: 'shopping', payment: 'cash', personId: 'p_boss', splitMode: 'shared', currency: 'JPY', payers: [{ personId: 'p_boss', amount: 4000 }, { personId: 'p_xinxin', amount: 2000 }], createdAt: 3 },
    { id: 'r4', store: 'Private 代付', total: 5000, date: '2026-04-22', category: 'ticket', payment: 'cash', personId: 'p_boss', beneficiaryId: 'p_xinxin', splitMode: 'private', currency: 'JPY', createdAt: 4 },
    { id: 'r5', store: 'KRW cross-currency', total: 30000, date: '2026-04-22', category: 'shopping', payment: 'credit', personId: 'p_xinxin', splitMode: 'shared', currency: 'KRW', splitType: 'shares', splits: [{ personId: 'p_boss', weight: 2 }, { personId: 'p_xinxin', weight: 1 }, { personId: 'p_c', weight: 1 }], createdAt: 5 },
    { id: 'r6', store: 'HKD percent', total: 600, date: '2026-04-23', category: 'food', payment: 'cash', personId: 'p_c', splitMode: 'shared', currency: 'HKD', splitType: 'percent', splits: [{ personId: 'p_boss', pct: 50 }, { personId: 'p_xinxin', pct: 25 }, { personId: 'p_c', pct: 25 }], createdAt: 6 },
    { id: 'r7', store: '結算 · 欣欣 → Boss', total: 2000, date: '2026-04-24', category: 'settlement', payment: 'cash', personId: 'p_xinxin', beneficiaryId: 'p_boss', splitMode: 'private', isSettlement: true, currency: 'JPY', createdAt: 7 },
    { id: 'r8', store: 'Itemized', total: 1200, date: '2026-04-23', category: 'food', payment: 'cash', personId: 'p_boss', splitMode: 'shared', currency: 'JPY', splitType: 'itemized', lineItems: [{ desc: 'A', amount: 800, qty: 1, assignedTo: ['p_boss'] }, { desc: 'B', amount: 400, qty: 1, assignedTo: ['p_xinxin', 'p_c'] }], splits: [{ personId: 'p_boss', amount: 800 }, { personId: 'p_xinxin', amount: 200 }, { personId: 'p_c', amount: 200 }], createdAt: 8 },
  ],
};

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE.error: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on('requestfailed', (r) => { const u = r.url(); if (!/jma\.go\.jp|visa|generativelanguage|api\.|notion|supabase|workers\.dev/.test(u)) errors.push(`REQFAIL: ${u} ${r.failure()?.errorText || ''}`); });

await page.addInitScript((s) => {
  window.__disable_supabase_configured = true;
  localStorage.clear();
  localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
  localStorage.setItem('boss-japan-tracker', JSON.stringify(s));
}, seed);

const tabs = ['dashboard', 'history', 'timeline', 'scan', 'weather', 'stats', 'settings'];
for (const tab of tabs) {
  try {
    await page.goto(`${BASE}#${tab}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(900);
  } catch (e) { errors.push(`NAV ${tab}: ${e.message}`); }
}

// Open the receipt editor on the first history row (exercises the heaviest UI)
try {
  await page.goto(`${BASE}#history`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const row = page.locator('.receipt-row, [data-receipt-id], .history-receipt').first();
  if (await row.count()) { await row.click(); await page.waitForTimeout(800); }
} catch (e) { errors.push(`EDITOR open: ${e.message}`); }

await browser.close();
if (errors.length) { console.log(`\n❌ ${errors.length} runtime error(s):`); for (const e of [...new Set(errors)]) console.log('  - ' + e); process.exit(1); }
else { console.log('\n✅ No runtime errors across all 7 tabs + editor with diverse stress data.'); }
