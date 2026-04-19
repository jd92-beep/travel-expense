import { useState, useEffect } from 'react';
import { Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CATEGORIES, PAYMENTS } from '@/lib/constants';
import type { Category, Payment, Receipt } from '@/lib/types';
import { todayHK } from '@/lib/itinerary';
import { rid } from '@/lib/utils';

interface ReceiptFormProps {
  initial?: Partial<Receipt>;
  onSave: (r: Receipt) => void;
  onDelete?: () => void;
  onCancel: () => void;
  title?: string;
  submitLabel?: string;
}

export function ReceiptForm({
  initial,
  onSave,
  onDelete,
  onCancel,
  submitLabel = '儲存',
}: ReceiptFormProps) {
  const [store, setStore] = useState(initial?.store ?? '');
  const [total, setTotal] = useState(String(initial?.total ?? ''));
  const [date, setDate] = useState(initial?.date ?? todayHK());
  const [time, setTime] = useState(initial?.time ?? '');
  const [category, setCategory] = useState<Category>(initial?.category ?? 'food');
  const [payment, setPayment] = useState<Payment>(initial?.payment ?? 'credit');
  const [region, setRegion] = useState(initial?.region ?? '');
  const [itemsText, setItemsText] = useState(initial?.itemsText ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [store, total, date, category, payment]);

  const submit = () => {
    if (!store.trim()) return setError('請輸入店名');
    const n = Number(total);
    if (!Number.isFinite(n) || n < 0) return setError('金額需為非負數');
    const receipt: Receipt = {
      id: initial?.id ?? rid(),
      store: store.trim(),
      total: Math.round(n),
      date,
      time: time || undefined,
      category,
      payment,
      region: region.trim() || undefined,
      itemsText: itemsText || undefined,
      note: note || undefined,
      createdAt: initial?.createdAt ?? Date.now(),
      notionPageId: initial?.notionPageId,
      subtotal: initial?.subtotal,
      tax: initial?.tax,
      hkd: initial?.hkd,
      items: initial?.items,
    };
    onSave(receipt);
  };

  return (
    <div className="p-5 space-y-4">
      <Field label="店名">
        <input
          value={store}
          onChange={(e) => setStore(e.target.value)}
          placeholder="例：ローソン"
          className="input"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="金額 (JPY)">
          <input
            type="number"
            inputMode="numeric"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="1800"
            className="input num"
          />
        </Field>
        <Field label="日期">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="時間 (選填)">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="地區">
          <input
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="名古屋"
            className="input"
          />
        </Field>
      </div>
      <Field label="類別">
        <div className="grid grid-cols-4 gap-1.5">
          {(Object.entries(CATEGORIES) as [Category, typeof CATEGORIES.food][]).map(([id, c]) => (
            <button
              key={id}
              type="button"
              onClick={() => setCategory(id)}
              className={`px-2 py-2 rounded-xl text-xs font-medium transition-all border ${
                category === id
                  ? 'bg-gradient-arsenal text-white border-transparent shadow-glow-sm'
                  : 'bg-ink-800/60 text-ink-300 border-white/5 hover:border-white/15'
              }`}
            >
              <div className="text-base leading-none">{c.icon}</div>
              <div className="mt-1">{c.name}</div>
            </button>
          ))}
        </div>
      </Field>
      <Field label="支付方式">
        <div className="grid grid-cols-4 gap-1.5">
          {(Object.entries(PAYMENTS) as [Payment, typeof PAYMENTS.cash][]).map(([id, p]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPayment(id)}
              className={`px-2 py-2 rounded-xl text-xs font-medium transition-all border ${
                payment === id
                  ? 'bg-gradient-arsenal text-white border-transparent shadow-glow-sm'
                  : 'bg-ink-800/60 text-ink-300 border-white/5 hover:border-white/15'
              }`}
            >
              <div className="text-base leading-none">{p.icon}</div>
              <div className="mt-1">{p.name}</div>
            </button>
          ))}
        </div>
      </Field>
      <Field label="品項 (選填)">
        <textarea
          value={itemsText}
          onChange={(e) => setItemsText(e.target.value)}
          rows={3}
          placeholder="おにぎり ¥150&#10;お茶 ¥140"
          className="input num resize-none"
        />
      </Field>
      <Field label="備註 (選填)">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="input"
        />
      </Field>

      {error && (
        <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2">
        {onDelete && (
          <Button variant="danger" size="md" onClick={onDelete} className="mr-auto">
            <Trash2 size={14} /> 刪除
          </Button>
        )}
        <Button variant="secondary" size="md" onClick={onCancel}>
          取消
        </Button>
        <Button onClick={submit} size="md">
          <Save size={14} /> {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-medium block mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
