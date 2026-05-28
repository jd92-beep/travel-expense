import type { Receipt } from './types';
import { CATEGORIES, PAYMENTS } from './constants';

/** Build CSV string from receipts. Uses BOM for Excel UTF-8 compatibility. */
export function receiptsToCSV(receipts: Receipt[]): string {
  const BOM = '\ufeff';
  const header = ['日期', '時間', '店舖', '金額 (JPY)', '類別', '支付', '地區', '備註', '品項'];
  const rows = receipts.map((r) => [
    r.date,
    r.time || '',
    r.store,
    String(r.total),
    CATEGORIES[r.category]?.name || r.category,
    PAYMENTS[r.payment]?.name || r.payment,
    r.region || '',
    r.note || '',
    (r.itemsText || '').replace(/\n/g, ' | '),
  ]);
  return BOM + [header, ...rows].map(csvRow).join('\n');
}

function csvRow(fields: string[]): string {
  return fields
    .map((f) => {
      const s = String(f ?? '');
      if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    })
    .join(',');
}

/** Trigger a file download with the given CSV content. */
export function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}
