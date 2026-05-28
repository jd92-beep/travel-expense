import type { Receipt } from './types';
import { CATEGORY_MAP, PAYMENT_MAP } from './constants';

export function exportCSV(receipts: Receipt[], rate: number): void {
  const headers = ['日期', '時間', '店名', '金額(JPY)', '金額(HKD)', '類別', '支付', '地區', '品項', '備註'];
  const rows = receipts.map(r => {
    const hkd = (r.total / rate).toFixed(1);
    const cat = CATEGORY_MAP[r.category]?.label ?? r.category;
    const pay = PAYMENT_MAP[r.payment]?.label ?? r.payment;
    return [
      r.date,
      r.time ?? '',
      r.store,
      r.total.toString(),
      hkd,
      cat,
      pay,
      r.region ?? '',
      (r.itemsText ?? '').replace(/\n/g, '|'),
      r.note ?? '',
    ].map(v => `"${v.replace(/"/g, '""')}"`).join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `travel-expense-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
