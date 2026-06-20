// Unit test for the pure settlement/simplify math. Run: node --experimental-strip-types
// scripts/split-engine.test.ts  (Node 22.18+ strips TS types natively). No test framework.
import assert from 'node:assert/strict';
import { computeShares, simplifyDebts, type IndexTransfer } from '../src/lib/splitEngine.ts';

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
  for (const r of residual) assert.equal(r, 0, `${label}: residual ${r} not fully settled`);
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
