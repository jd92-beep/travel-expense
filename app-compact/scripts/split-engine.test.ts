// Unit test for the pure settlement/simplify math. Run: node --experimental-strip-types
// scripts/split-engine.test.ts  (Node 22.18+ strips TS types natively). No test framework.
import assert from 'node:assert/strict';
import { computeShares, simplifyDebts, foldLineItemsToSplits, type IndexTransfer } from '../src/lib/splitEngine.ts';

function applyTransfers(balances: number[], transfers: IndexTransfer[]): number[] {
  const out = balances.slice();
  for (const t of transfers) {
    out[t.from] += t.amount; // debtor pays -> balance rises toward 0
    out[t.to] -= t.amount; //   creditor receives -> balance falls toward 0
  }
  return out;
}

// For integer balances the rounded transfers settle everyone exactly; assert residual == 0.
function assertSettlesExactly(balances: number[], label: string): IndexTransfer[] {
  const before = balances.reduce((a, b) => a + b, 0);
  const transfers = simplifyDebts(balances);
  const residual = applyTransfers(balances, transfers);
  const after = residual.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(before - after) < 1e-9, `${label}: net changed ${before} -> ${after}`);
  for (const r of residual) assert.ok(r === 0, `${label}: residual ${r} not fully settled`);
  assert.ok(transfers.length <= Math.max(0, balances.length - 1), `${label}: ${transfers.length} > n-1 transfers`);
  return transfers;
}

function sharesObject(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

assert.deepEqual(
  sharesObject(computeShares(101, 'equal', [{ personId: 'a' }, { personId: 'b' }, { personId: 'c' }])),
  { a: 34, b: 34, c: 33 },
  'equal split distributes rounding by deterministic id order',
);
assert.deepEqual(
  sharesObject(computeShares(120, 'shares', [{ personId: 'a', weight: 1 }, { personId: 'b', weight: 2 }, { personId: 'c', weight: 3 }])),
  { a: 20, b: 40, c: 60 },
  'weighted shares split by ratio',
);
assert.deepEqual(
  sharesObject(computeShares(100, 'exact', [{ personId: 'a', amount: 30 }, { personId: 'b', amount: 70 }])),
  { a: 30, b: 70 },
  'exact split preserves entered amounts',
);
assert.deepEqual(
  sharesObject(computeShares(101, 'percent', [{ personId: 'a', pct: 50 }, { personId: 'b', pct: 50 }])),
  { a: 51, b: 50 },
  'percent split rounds back to total',
);
assert.deepEqual(
  sharesObject(computeShares(100, 'adjustment', [{ personId: 'a', adjust: 10 }, { personId: 'b' }])),
  { a: 55, b: 45 },
  'adjustment split adds extras on top of equal base',
);
assert.equal([...computeShares(999, 'equal', [{ personId: 'a' }, { personId: 'b' }]).values()].reduce((a, b) => a + b, 0), 999, 'shares sum exactly');
assert.throws(() => computeShares(100, 'exact', [{ personId: 'a', amount: 40 }, { personId: 'b', amount: 40 }]), /must equal 100/);
assert.throws(() => computeShares(100, 'percent', [{ personId: 'a', pct: 60 }, { personId: 'b', pct: 30 }]), /must equal 100/);

// 2 participants — exact direction/amount (欣欣 owes Boss 500)
const t2 = assertSettlesExactly([500, -500], '2p');
assert.equal(t2.length, 1);
assert.deepEqual(t2[0], { from: 1, to: 0, amount: 500 });

// 3 / 5 / 10 participants, all net-zero
assertSettlesExactly([100, -60, -40], '3p');
assertSettlesExactly([120, 30, -50, -40, -60], '5p');
assertSettlesExactly([90, 10, 5, 40, -15, -20, -30, -25, -40, -15], '10p');

// Settlement semantics: a shared expense then a settle-up payment must zero the balance.
// Boss paid a 1000 shared meal split 50/50 -> Boss +500, 欣欣 -500. 欣欣 then settles 500.
{
  const afterExpense = [500, -500];
  const t = simplifyDebts(afterExpense);
  assert.equal(t.length, 1, 'one transfer outstanding before settle');
  // settle = 欣欣(idx1) pays Boss(idx0) 500 -> apply the engine's settleAdjust direction
  const settled = [afterExpense[0] - 500, afterExpense[1] + 500];
  assert.deepEqual(settled, [0, 0]);
  assert.equal(simplifyDebts(settled).length, 0, 'no transfers after full settlement');
}

// Rounding dust below epsilon produces no transfer; already-balanced produces none.
assert.equal(simplifyDebts([0.4, -0.4]).length, 0, 'sub-epsilon dust ignored');
assert.equal(simplifyDebts([0, 0, 0]).length, 0, 'balanced -> no transfers');

// Fractional balances: net-neutrality still holds (residuals may carry rounding dust).
{
  const bal = [33.33, 33.33, -66.66];
  const before = bal.reduce((a, b) => a + b, 0);
  const after = applyTransfers(bal, simplifyDebts(bal)).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(before - after) < 1e-9, 'fractional split stays net-neutral');
}

console.log('split-engine: all settlement / simplify assertions passed ✅');

// --- foldLineItemsToSplits tests ---
{
  // Basic: 2 items, 2 people, all assigned to both -> equal fold
  const items = [
    { id: 'a', desc: 'Coffee', amount: 600, assignedTo: ['p1', 'p2'] },
    { id: 'b', desc: 'Cake', amount: 400, assignedTo: ['p1', 'p2'] },
  ];
  const splits = foldLineItemsToSplits(items, ['p1', 'p2'], 1000);
  const byId = Object.fromEntries(splits.map((s) => [s.personId, s.amount]));
  assert.equal(byId.p1, 500, 'item fold: p1 gets 500');
  assert.equal(byId.p2, 500, 'item fold: p2 gets 500');
  assert.equal(byId.p1 + byId.p2, 1000, 'item fold: shares sum to total');
}
{
  // Uneven assignment: p1 gets item A only, p2 gets item B only
  const items = [
    { id: 'a', desc: 'Steak', amount: 800, assignedTo: ['p1'] },
    { id: 'b', desc: 'Salad', amount: 200, assignedTo: ['p2'] },
  ];
  const splits = foldLineItemsToSplits(items, ['p1', 'p2'], 1000);
  const byId = Object.fromEntries(splits.map((s) => [s.personId, s.amount]));
  assert.equal(byId.p1, 800, 'uneven fold: p1 gets 800');
  assert.equal(byId.p2, 200, 'uneven fold: p2 gets 200');
  assert.equal(byId.p1 + byId.p2, 1000, 'uneven fold: shares sum to total');
}
{
  // Rounding: 3 items of 100 split among 2 people -> 50 each per item
  const items = [
    { id: 'a', desc: 'A', amount: 100, assignedTo: ['p1', 'p2'] },
    { id: 'b', desc: 'B', amount: 100, assignedTo: ['p1', 'p2'] },
    { id: 'c', desc: 'C', amount: 100, assignedTo: ['p1', 'p2'] },
  ];
  const splits = foldLineItemsToSplits(items, ['p1', 'p2'], 300);
  const sum = splits.reduce((acc, s) => acc + (s.amount || 0), 0);
  assert.equal(sum, 300, 'rounding fold: shares sum exactly to 300');
}
{
  // Odd amount: 1001 split between 2 people across 1 item
  const items = [
    { id: 'a', desc: 'Odd', amount: 1001, assignedTo: ['p1', 'p2'] },
  ];
  const splits = foldLineItemsToSplits(items, ['p1', 'p2'], 1001);
  const sum = splits.reduce((acc, s) => acc + (s.amount || 0), 0);
  assert.equal(sum, 1001, 'odd fold: shares sum exactly to 1001');
  const byId = Object.fromEntries(splits.map((s) => [s.personId, s.amount]));
  assert.equal(byId.p1 + byId.p2, 1001, 'odd fold: p1+p2 = 1001');
}
{
  // Unassigned items: items with empty assignedTo default to all people
  const items = [
    { id: 'a', desc: 'Tax', amount: 100, assignedTo: [] },
  ];
  const splits = foldLineItemsToSplits(items, ['p1', 'p2'], 100);
  const byId = Object.fromEntries(splits.map((s) => [s.personId, s.amount]));
  assert.equal(byId.p1, 50, 'unassigned fold: defaults to all people');
  assert.equal(byId.p2, 50, 'unassigned fold: defaults to all people');
}
{
  // Unallocated total: lineItems sum < total -> remainder split evenly
  const items = [
    { id: 'a', desc: 'Food', amount: 800, assignedTo: ['p1', 'p2'] },
  ];
  const splits = foldLineItemsToSplits(items, ['p1', 'p2'], 1000);
  const sum = splits.reduce((acc, s) => acc + (s.amount || 0), 0);
  assert.equal(sum, 1000, 'unallocated fold: remainder distributed, sum = total');
}
assert.throws(
  () => foldLineItemsToSplits([{ id: 'a', desc: 'Too much', amount: 1200, assignedTo: ['p1'] }], ['p1', 'p2'], 1000),
  /cannot exceed total/,
  'over-total itemized lines are rejected before settlement math',
);

console.log('split-engine: all foldLineItemsToSplits assertions passed ✅');

// Cross-currency settlement foundation: computeSettlements redistributes a converted trip-currency
// total by each person's receipt-currency share via computeShares('shares', weights).
{
  const weights = [{ personId: 'a', weight: 2000 }, { personId: 'b', weight: 6000 }];
  // Same-currency case: total === Σweights → returns weights unchanged (no behaviour change for JPY trips).
  const same = computeShares(8000, 'shares', weights);
  assert.equal(same.get('a'), 2000, 'same-currency identity a');
  assert.equal(same.get('b'), 6000, 'same-currency identity b');
  // Cross-currency: 8000 receipt-cur → 400 trip-cur, distributed 1:3 with an exact sum.
  const converted = computeShares(400, 'shares', weights);
  assert.equal(converted.get('a'), 100, 'converted share a (1:3)');
  assert.equal(converted.get('b'), 300, 'converted share b (1:3)');
  assert.equal((converted.get('a') || 0) + (converted.get('b') || 0), 400, 'converted shares sum exactly to trip total');
}
console.log('split-engine: cross-currency redistribution assertions passed ✅');

// ── Percentage sharing + zero-sum rounding + 6-person settlement (v0.12.29) ──────────────
import { roundZeroSum, sharePercents } from '../src/lib/splitEngine.ts';

// roundZeroSum: integers must sum to the SAME rounded total (0 here) with no lost/created units.
for (const vals of [
  [0.5, 0.5, -1.0],
  [2666.67, 666.67, -833.33, 1166.67, -633.33, -3033.33],
  [984.53, 131.51, 760.58, 535.53, 754.70, -3166.85],
  [33.4, 33.3, 33.3],
]) {
  const rounded = roundZeroSum(vals);
  assert.ok(rounded.reduce((a, b) => a + b, 0) === Math.round(vals.reduce((a, b) => a + b, 0)), `roundZeroSum preserves total for ${vals}`);
  rounded.forEach((v) => assert.ok(Number.isInteger(v), `roundZeroSum yields integers for ${vals}`));
}
console.log('split-engine: roundZeroSum assertions passed ✅');

// sharePercents: always sums to exactly 100. Legacy weights, explicit %, equal default.
assert.deepEqual(sharePercents(['a', 'b'], { a: 1, b: 1 }), [50, 50], 'legacy 1:1 → 50/50');
assert.deepEqual(sharePercents(['a', 'b', 'c'], { a: 50, b: 30, c: 20 }), [50, 30, 20], 'explicit % preserved');
for (const n of [2, 3, 5, 6, 7]) {
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const eq = sharePercents(ids, {});
  assert.equal(eq.reduce((a, b) => a + b, 0), 100, `equal split of ${n} sums to 100`);
  assert.ok(Math.max(...eq) - Math.min(...eq) <= 1, `equal split of ${n} is balanced (±1)`);
}
console.log('split-engine: sharePercents assertions passed ✅');

// 6-person settlement (Agent-3 walk): fractional net balances must round zero-sum then settle EXACTLY,
// with ≤ n−1 transfers. This is the "who pays who how much" guarantee for a many-person shared trip.
{
  const balances6 = [2666.67, 666.67, -833.33, 1166.67, -633.33, -3033.33];
  const rounded = roundZeroSum(balances6);
  const transfers = assertSettlesExactly(rounded, '6-person fractional settlement');
  assert.ok(transfers.length <= 5, `6-person: ${transfers.length} transfers ≤ 5`);
  // Regression guard for the drift bug: rounding FIRST leaves zero residual on every person.
  const residual = applyTransfers(rounded, transfers);
  residual.forEach((r, i) => assert.ok(r === 0, `6-person person ${i} residual ${r} != 0`));
}
// 50k random 6-person fractional trials: rounded balances always settle exactly (no ~2-unit drift).
{
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let t = 0; t < 50000; t++) {
    const raw = Array.from({ length: 6 }, () => Math.round(rnd() * 100000) / 100 - 500);
    const drift = raw.reduce((a, b) => a + b, 0);
    raw[0] -= drift; // force zero-sum like real balances
    const rounded = roundZeroSum(raw);
    const transfers = simplifyDebts(rounded);
    const residual = applyTransfers(rounded, transfers);
    for (const r of residual) assert.ok(r === 0, `random 6-person trial ${t}: residual ${r} != 0`);
  }
}
console.log('split-engine: 6-person settlement assertions passed ✅');
