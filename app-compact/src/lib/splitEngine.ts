// Pure split / settlement math — intentionally has no runtime app imports so it can be unit-tested in
// isolation (see scripts/split-engine.test.ts). domain.ts's computeSettlements delegates the
// debt-simplification step here. Keep this file dependency-free.
import type { ReceiptLineItem, ReceiptSplit, SplitType } from './types';

export interface IndexTransfer {
  from: number;
  to: number;
  amount: number;
}

type ShareRow = { personId: string; raw: number };

function assertFiniteAmount(value: unknown, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} must be finite`);
  return n;
}

function assertWholeNonNegative(value: unknown, label: string): number {
  const n = Math.round(assertFiniteAmount(value, label));
  if (n < 0) throw new Error(`${label} must be non-negative`);
  return n;
}

function assertClose(actual: number, expected: number, label: string, epsilon = 1e-6) {
  if (Math.abs(actual - expected) > epsilon) throw new Error(`${label} must equal ${expected}`);
}

function splitRows(splits: ReceiptSplit[]): ReceiptSplit[] {
  const rows = splits.filter((split) => split.personId);
  if (!rows.length) throw new Error('At least one split participant is required');
  return rows;
}

function largestRemainder(total: number, rows: ShareRow[]): Map<string, number> {
  const roundedTotal = Math.round(total);
  const parts = rows.map((row, index) => {
    if (row.raw < 0 || !Number.isFinite(row.raw)) throw new Error('Share amount must be non-negative');
    const floored = Math.floor(row.raw);
    return { ...row, index, amount: floored, remainder: row.raw - floored };
  });
  let leftover = roundedTotal - parts.reduce((sum, row) => sum + row.amount, 0);
  const order = parts.slice().sort((a, b) =>
    b.remainder - a.remainder || a.personId.localeCompare(b.personId) || a.index - b.index,
  );
  for (let i = 0; leftover > 0 && order.length; i += 1, leftover -= 1) {
    order[i % order.length].amount += 1;
  }
  if (leftover !== 0) throw new Error('Unable to distribute split rounding residual');
  return parts.reduce((map, row) => map.set(row.personId, (map.get(row.personId) || 0) + row.amount), new Map<string, number>());
}

export function computeShares(total: number, splitType: SplitType, splits: ReceiptSplit[]): Map<string, number> {
  const roundedTotal = assertWholeNonNegative(total, 'total');
  const rows = splitRows(splits);
  if (splitType === 'exact' || splitType === 'itemized') {
    const out = new Map<string, number>();
    for (const split of rows) out.set(split.personId, (out.get(split.personId) || 0) + assertWholeNonNegative(split.amount, 'split amount'));
    const sum = [...out.values()].reduce((a, b) => a + b, 0);
    if (sum !== roundedTotal) throw new Error(`exact split total ${sum} must equal ${roundedTotal}`);
    return out;
  }
  if (splitType === 'percent') {
    const pctTotal = rows.reduce((sum, split) => sum + assertFiniteAmount(split.pct, 'split percent'), 0);
    assertClose(pctTotal, 100, 'split percent total');
    return largestRemainder(roundedTotal, rows.map((split) => ({
      personId: split.personId,
      raw: roundedTotal * (assertFiniteAmount(split.pct, 'split percent') / 100),
    })));
  }
  if (splitType === 'adjustment') {
    const adjustments = rows.map((split) => assertWholeNonNegative(split.adjust || 0, 'split adjustment'));
    const adjustmentTotal = adjustments.reduce((a, b) => a + b, 0);
    if (adjustmentTotal > roundedTotal) throw new Error('split adjustments cannot exceed total');
    const equalBase = (roundedTotal - adjustmentTotal) / rows.length;
    return largestRemainder(roundedTotal, rows.map((split, index) => ({
      personId: split.personId,
      raw: equalBase + adjustments[index],
    })));
  }
  const weights = rows.map((split) => splitType === 'shares'
    ? assertWholeNonNegative(split.weight ?? 0, 'split weight')
    : 1);
  const weightTotal = weights.reduce((a, b) => a + b, 0);
  if (weightTotal <= 0) throw new Error('split weights must be positive');
  return largestRemainder(roundedTotal, rows.map((split, index) => ({
    personId: split.personId,
    raw: roundedTotal * (weights[index] / weightTotal),
  })));
}

/**
 * Greedy debt simplification. Input: net balances per participant, where a positive value means
 * "is owed money" and negative means "owes money" (the array must sum to ~0). Output: a small set
 * of transfers (debtor -> creditor) that zeroes everyone out. The result is net-neutral by
 * construction: each transfer moves `amount` from a debtor to a creditor without changing the total.
 *
 * `epsilon` ignores residual balances below half a currency unit (rounding dust) so we don't emit
 * meaningless 0-ish transfers.
 */
export function simplifyDebts(balances: number[], epsilon = 0.5): IndexTransfer[] {
  const work = balances.map((balance, idx) => ({ idx, balance }));
  const transfers: IndexTransfer[] = [];
  // At most n-1 transfers are ever needed; the generous bound is just a runaway guard.
  const maxIterations = work.length * work.length + 5;
  for (let i = 0; i < maxIterations; i++) {
    work.sort((a, b) => a.balance - b.balance);
    const debtor = work[0];
    const creditor = work[work.length - 1];
    if (!debtor || !creditor || debtor.balance >= -epsilon || creditor.balance <= epsilon) break;
    const amount = Math.min(-debtor.balance, creditor.balance);
    debtor.balance += amount;
    creditor.balance -= amount;
    transfers.push({ from: debtor.idx, to: creditor.idx, amount: Math.round(amount) });
  }
  return transfers;
}

export function foldLineItemsToSplits(
  lineItems: ReceiptLineItem[],
  personIds: string[],
  total: number,
): ReceiptSplit[] {
  if (!lineItems.length || !personIds.length) return [];
  const perPerson = new Map<string, number>();
  for (const pid of personIds) perPerson.set(pid, 0);
  let assignedTotal = 0;
  for (const item of lineItems) {
    const assigned = item.assignedTo?.length ? item.assignedTo : personIds;
    if (!assigned.length) continue;
    const share = Math.floor(item.amount / assigned.length);
    let leftover = item.amount - share * assigned.length;
    for (const pid of assigned) {
      perPerson.set(pid, (perPerson.get(pid) || 0) + share + (leftover-- > 0 ? 1 : 0));
    }
    assignedTotal += item.amount;
  }
  if (assignedTotal > Math.round(total)) throw new Error('itemized line items cannot exceed total');
  const unassigned = Math.max(0, Math.round(total) - assignedTotal);
  if (unassigned > 0) {
    const share = Math.floor(unassigned / personIds.length);
    let leftover = unassigned - share * personIds.length;
    for (const pid of personIds) {
      perPerson.set(pid, (perPerson.get(pid) || 0) + share + (leftover-- > 0 ? 1 : 0));
    }
  }
  return personIds.map((pid) => ({ personId: pid, amount: perPerson.get(pid) || 0 }));
}
