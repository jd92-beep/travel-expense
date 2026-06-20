import type { Receipt, ReceiptPayer, ReceiptSplit, SplitType } from './types';

const SPLIT_NOTE_PREFIX = '[[travel-expense-split:v1]]';

function validSplitType(value: unknown): SplitType | undefined {
  const v = String(value || '');
  return ['equal', 'shares', 'exact', 'percent', 'adjustment', 'itemized'].includes(v) ? v as SplitType : undefined;
}

function cleanSplits(value: unknown): ReceiptSplit[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value.map((raw) => {
    const row = raw as any;
    const next: ReceiptSplit = { personId: String(row?.personId || '') };
    const weight = Number(row?.weight);
    const amount = Number(row?.amount);
    const pct = Number(row?.pct);
    const adjust = Number(row?.adjust);
    if (Number.isFinite(weight)) next.weight = weight;
    if (Number.isFinite(amount)) next.amount = amount;
    if (Number.isFinite(pct)) next.pct = pct;
    if (Number.isFinite(adjust)) next.adjust = adjust;
    return next;
  }).filter((row) => row.personId);
  return rows.length ? rows : undefined;
}

function cleanPayers(value: unknown): ReceiptPayer[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value.map((raw) => {
    const row = raw as any;
    return {
      personId: String(row?.personId || ''),
      amount: Number(row?.amount) || 0,
    };
  }).filter((row) => row.personId && row.amount >= 0);
  return rows.length ? rows : undefined;
}

export function serializeNotionSplitNote(receipt: Receipt) {
  const payload = {
    splitType: receipt.splitType,
    splits: receipt.splits?.length ? receipt.splits : undefined,
    payers: receipt.payers?.length ? receipt.payers : undefined,
  };
  if (!payload.splitType && !payload.splits && !payload.payers) return (receipt.note || '').slice(0, 1900);
  const marker = `${SPLIT_NOTE_PREFIX}${JSON.stringify(payload)}`;
  const note = (receipt.note || '').slice(0, Math.max(0, 1899 - marker.length)).trimEnd();
  return note ? `${note}\n${marker}` : marker;
}

export function parseNotionSplitNote(rawNote: string): { note: string; splitType?: SplitType; splits?: ReceiptSplit[]; payers?: ReceiptPayer[] } {
  const text = String(rawNote || '');
  const index = text.lastIndexOf(SPLIT_NOTE_PREFIX);
  if (index < 0) return { note: text };
  const before = text.slice(0, index).trimEnd();
  const payloadText = text.slice(index + SPLIT_NOTE_PREFIX.length).split('\n')[0].trim();
  try {
    const payload = JSON.parse(payloadText);
    return {
      note: before,
      splitType: validSplitType(payload?.splitType),
      splits: cleanSplits(payload?.splits),
      payers: cleanPayers(payload?.payers),
    };
  } catch {
    return { note: text };
  }
}
