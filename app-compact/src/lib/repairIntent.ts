const REPAIR_RECEIPT_INTENT_KEY = 'travel-expense-compact:repair-receipt-id';

export function saveReceiptRepairIntent(receiptId: string): void {
  if (typeof window === 'undefined' || !receiptId) return;
  try {
    window.sessionStorage.setItem(REPAIR_RECEIPT_INTENT_KEY, receiptId);
  } catch {
    // Best effort only; History still opens normally without the shortcut.
  }
}

export function takeReceiptRepairIntent(): string {
  if (typeof window === 'undefined') return '';
  try {
    const receiptId = window.sessionStorage.getItem(REPAIR_RECEIPT_INTENT_KEY) || '';
    window.sessionStorage.removeItem(REPAIR_RECEIPT_INTENT_KEY);
    return receiptId;
  } catch {
    return '';
  }
}
