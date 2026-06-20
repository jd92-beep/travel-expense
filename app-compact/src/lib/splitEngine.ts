// Pure split / settlement math — intentionally has NO app imports so it can be unit-tested in
// isolation (see scripts/split-engine.test.ts). domain.ts's computeSettlements delegates the
// debt-simplification step here. Keep this file dependency-free.

export interface IndexTransfer {
  from: number;
  to: number;
  amount: number;
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
