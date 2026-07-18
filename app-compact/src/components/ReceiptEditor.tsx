import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, PAYMENTS } from '../lib/constants';
import { currencyPrefix, perHkdForCurrency, SUPPORTED_CURRENCIES } from '../lib/currency';
import { canBePrivateReceipt, getItinerary, getPersons, safePhotoUrl, todayForReceipts, compressPhoto } from '../lib/domain';
import { activeTrip } from '../domain/trip/normalize';
import type { AppState, CategoryId, PaymentId, Receipt, ReceiptLineItem, SplitMode } from '../lib/types';
import { ReceiptPhotoModal } from './ReceiptPhotoModal';
import { GradientButton } from './ui/gradient-button';

const newId = () => `manual_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const MAX_RECEIPT_AMOUNT = 1_000_000_000;

function validAmount(value: unknown): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_RECEIPT_AMOUNT) return null;
  return amount;
}

// 品項 rows ⇄ itemsText round-trip. Serialized format is `- desc x N: ¥1,234` (same shape the
// OCR pipeline emits), so itemsText stays the synced source of truth and structured rows can be
// rebuilt from it on any device.
function serializeLineItems(items: ReceiptLineItem[], prefix: string): string {
  return items.map((item) => {
    const qty = item.qty && item.qty > 1 ? ` x ${item.qty}` : '';
    return `- ${item.desc}${qty}: ${prefix}${item.amount.toLocaleString()}`;
  }).join('\n');
}

function parseItemsText(text: string): ReceiptLineItem[] {
  const lines = String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const out: ReceiptLineItem[] = [];
  for (const [idx, line] of lines.entries()) {
    // Lenient by design: EVERY non-empty line becomes one item so existing receipts (whose
    // itemsText was free-form OCR text, not our `- desc: ¥n` shape) still render as rows.
    // Try to peel a trailing amount (optional currency symbol); if none, the whole line is the name.
    const m = line.match(/^-?\s*(.+?)(?:\s+[x×]\s*(\d+))?\s*[:：]?\s*(?:HK\$|NT\$|US\$|[¥₩€£$])\s*([\d,]+(?:\.\d+)?)\s*$/);
    if (m) {
      out.push({ id: `li_parsed_${idx}`, desc: m[1].trim(), qty: m[2] ? Number(m[2]) : undefined, amount: Number(m[3].replace(/,/g, '')) });
      continue;
    }
    // No currency symbol — try `name: 1234` / `name 1234` with a trailing bare number.
    const bare = line.match(/^-?\s*(.+?)(?:\s+[x×]\s*(\d+))?\s*[:：]\s*([\d,]+(?:\.\d+)?)\s*$/);
    if (bare) {
      out.push({ id: `li_parsed_${idx}`, desc: bare[1].trim(), qty: bare[2] ? Number(bare[2]) : undefined, amount: Number(bare[3].replace(/,/g, '')) });
      continue;
    }
    out.push({ id: `li_parsed_${idx}`, desc: line.replace(/^-\s*/, ''), amount: 0 });
  }
  return out;
}

function hydratedLineItems(receipt: Receipt | null | undefined): ReceiptLineItem[] | undefined {
  if (!receipt) return undefined;
  if (receipt.lineItems?.length) return receipt.lineItems;
  if (!receipt.itemsText?.trim()) return undefined;
  const parsed = parseItemsText(receipt.itemsText);
  return parsed.length ? parsed : undefined;
}

// One combined line per item: `name␣␣␣¥1,018␣␣␣HK$49.51` (three-space separator, Boss spec).
// The full item name stays visible instead of being squeezed by separate amount inputs.
function formatItemLine(item: { desc: string; amount: number; qty?: number }, prefix: string, hkdOf: (n: number) => number): string {
  const qty = item.qty && item.qty > 1 ? ` x ${item.qty}` : '';
  const amountPart = item.amount ? `${prefix}${item.amount.toLocaleString()}` : prefix;
  const hkdPart = item.amount ? `HK$${hkdOf(item.amount).toLocaleString()}` : 'HK$';
  return `${item.desc}${qty}   ${amountPart}   ${hkdPart}`;
}

// Parse a combined line back. Segments split on 2+ spaces (forgiving). A segment containing
// "HK" is the HKD side; the other numeric segment is the destination amount. Whichever number
// the user actually changed drives the item amount (the other is recomputed).
function parseItemLine(
  text: string,
  prev: { desc: string; amount: number; qty?: number },
  hkdOf: (n: number) => number,
  fromHkd: (n: number) => number,
): { desc: string; amount: number; qty?: number } {
  const segments = String(text || '').split(/\s{2,}|\t/).map((seg) => seg.trim()).filter(Boolean);
  if (!segments.length) return { ...prev, desc: '' };
  let desc = segments[0];
  let qty = prev.qty;
  const qtyMatch = desc.match(/^(.*?)\s+[x×]\s*(\d+)$/);
  if (qtyMatch) {
    desc = qtyMatch[1].trim();
    qty = Number(qtyMatch[2]) || undefined;
  }
  let destAmount: number | null = null;
  let hkdAmount: number | null = null;
  for (const seg of segments.slice(1)) {
    const digits = seg.replace(/[^\d.]/g, '');
    if (!digits) continue;
    const value = Number(digits);
    if (!Number.isFinite(value) || value < 0) continue;
    if (/HK/i.test(seg)) hkdAmount = value;
    else if (destAmount == null) destAmount = value;
    else if (hkdAmount == null) hkdAmount = value;
  }
  let amount = prev.amount;
  const destChanged = destAmount != null && Math.round(destAmount) !== Math.round(prev.amount);
  const hkdChanged = hkdAmount != null && Math.abs(hkdAmount - hkdOf(prev.amount)) > 0.01;
  if (destChanged) amount = Math.min(destAmount as number, MAX_RECEIPT_AMOUNT);
  else if (hkdChanged) amount = Math.min(fromHkd(hkdAmount as number), MAX_RECEIPT_AMOUNT);
  else if (destAmount != null) amount = Math.min(destAmount, MAX_RECEIPT_AMOUNT);
  return { desc, amount, qty };
}

// Free-typing wrapper: keeps the raw text while focused, parses + reformats on blur so the
// caret never jumps mid-edit and both currencies re-derive from whichever number changed.
function ItemLineInput({ item, prefix, hkdOf, fromHkd, onCommit, placeholder, ariaLabel }: {
  item: { desc: string; amount: number; qty?: number };
  prefix: string;
  hkdOf: (n: number) => number;
  fromHkd: (n: number) => number;
  onCommit: (next: { desc: string; amount: number; qty?: number }) => void;
  placeholder?: string;
  ariaLabel: string;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  const isBlankNew = !item.desc && !item.amount;
  const display = raw ?? (isBlankNew ? '' : formatItemLine(item, prefix, hkdOf));
  return (
    <input
      className="receipt-item-line"
      value={display}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={() => {
        if (raw != null) onCommit(parseItemLine(raw, item, hkdOf, fromHkd));
        setRaw(null);
      }}
    />
  );
}

export function ReceiptEditor({
  state,
  receipt,
  onCancel,
  onSave,
  onDelete,
  onAddToItinerary,
}: {
  state: AppState;
  receipt?: Receipt | null;
  onCancel: () => void;
  onSave: (receipt: Receipt) => void;
  onDelete?: (receipt: Receipt) => void;
  onAddToItinerary?: (receipt: Receipt) => void;
}) {
  const persons = useMemo(() => getPersons(state), [state]);
  const first = persons[0] || { id: '', name: '' };
  const itinerary = useMemo(() => getItinerary(state), [state]);
  // Viewers on a shared trip are read-only — they can't save or delete receipts (RLS enforces
  // this server-side; this prevents a confusing failed write on the client).
  const viewerReadOnly = activeTrip(state).sharing?.role === 'viewer';
  const currencyForDate = (date?: string) => (
    itinerary.find((day) => day.date === date)?.currency
    || state.tripCurrency
    || 'JPY'
  );
  const photoRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(true);
  const [viewPhoto, setViewPhoto] = useState<Receipt | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [draft, setDraft] = useState<Receipt>(() => (receipt ? { ...receipt, lineItems: hydratedLineItems(receipt) } : null) || {
    id: newId(),
    store: '',
    total: 0,
    date: todayForReceipts(state),
    currency: currencyForDate(todayForReceipts(state)),
    originalCurrency: currencyForDate(todayForReceipts(state)),
    category: 'food',
    payment: 'cash',
    personId: first?.id || '',
    splitMode: 'shared',
    createdAt: Date.now(),
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setShowDeleteConfirm(false);
    setDraft((receipt ? { ...receipt, lineItems: hydratedLineItems(receipt) } : null) || {
      id: newId(),
      store: '',
      total: 0,
      date: todayForReceipts(state),
      currency: currencyForDate(todayForReceipts(state)),
      originalCurrency: currencyForDate(todayForReceipts(state)),
      category: 'food',
      payment: 'cash',
      personId: first?.id || '',
      splitMode: 'shared',
      createdAt: Date.now(),
    });
    // Only reset when the receipt ID changes, not on every AppState update or object reference change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt?.id]);

  const set = <K extends keyof Receipt>(key: K, value: Receipt[K]) => setDraft((d) => {
    if (key === 'date') {
      const prevDayCurrency = currencyForDate(d.date);
      const nextDayCurrency = currencyForDate(String(value || ''));
      // Follow the new day's currency (e.g. JP day → KR day) — but only when the user hasn't
      // manually diverged the currency from the previous day's. Never override a custom choice.
      if (!d.currency || d.currency === prevDayCurrency) {
        return { ...d, [key]: value, currency: nextDayCurrency, originalCurrency: nextDayCurrency };
      }
    }
    return { ...d, [key]: value };
  });
  // 品項 rows: structured lineItems are the source of truth; legacy free-text receipts whose
  // itemsText can't be parsed keep the old textarea instead.
  const itemRowsMode = Boolean(draft.lineItems?.length) || !draft.itemsText?.trim();
  const [newItem, setNewItem] = useState<{ desc: string; amount: number }>({ desc: '', amount: 0 });
  const editPrefix = currencyPrefix(draft.currency || draft.originalCurrency || currencyForDate(draft.date));
  const editPerHkd = Math.max(0.1, perHkdForCurrency(state, draft.currency || draft.originalCurrency || currencyForDate(draft.date)));
  const hkdOfItem = (amount: number) => Math.round((amount / editPerHkd) * 100) / 100;
  const fromHkdAmount = (hkdValue: number) => Math.round(hkdValue * editPerHkd * 100) / 100;
  const effectivePayerId = draft.personId || first?.id || '';
  const privacyEligible = canBePrivateReceipt({ splitMode: draft.splitMode || 'shared', beneficiaryId: draft.beneficiaryId, personId: effectivePayerId });
  const parseAmountInput = (raw: string) => {
    const parsed = parseFloat(raw);
    return !isNaN(parsed) && parsed >= 0 ? Math.min(parsed, MAX_RECEIPT_AMOUNT) : 0;
  };
  const updateItem = (idx: number, patch: Partial<ReceiptLineItem>) => setDraft((d) => ({
    ...d,
    lineItems: (d.lineItems || []).map((item, i) => (i === idx ? { ...item, ...patch } : item)),
  }));
  const removeItem = (idx: number) => setDraft((d) => ({
    ...d,
    lineItems: (d.lineItems || []).filter((_, i) => i !== idx),
  }));
  const appendNewItem = () => {
    if (!newItem.desc.trim() && !newItem.amount) return;
    setDraft((d) => ({
      ...d,
      lineItems: [...(d.lineItems || []), { id: newId(), desc: newItem.desc.trim() || '未命名品項', amount: newItem.amount }],
    }));
    setNewItem({ desc: '', amount: 0 });
  };

  async function attachPhoto(file?: File) {
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('讀取相片失敗'));
      reader.readAsDataURL(file);
    });
    if (!mountedRef.current) return;

    const [, mime = '', base64 = ''] = dataUrl.match(/^data:([^;]+);base64,(.*)$/) || [];

    // Auto compress to 800px width to keep localStorage lightweight (~50-80KB) and prevent size limit crashes
    const compressed = await compressPhoto(base64, mime, 800);
    setDraft((d) => ({ ...d, photoThumb: compressed || base64 }));

    if (photoRef.current) photoRef.current.value = '';
  }


  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="receipt-editor-title" onClick={onCancel}>
      <form
        className="modal sheet"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          const total = validAmount(draft.total);
          if (total == null) {
            alert(`金額必須係 0 至 ${MAX_RECEIPT_AMOUNT.toLocaleString()} 之間嘅有效數字`);
            return;
          }
          // A filled 加新品項 row the user never confirmed with ＋ still counts.
          const pendingNewItem = (newItem.desc.trim() || newItem.amount)
            ? [{ id: newId(), desc: newItem.desc.trim() || '未命名品項', amount: newItem.amount }]
            : [];
          const finalLineItems = [...(draft.lineItems || []), ...pendingNewItem];
          onSave({
            ...draft,
            store: draft.store.trim() || '未命名',
            total,
            // 原金額 UI field was removed — the schema field now simply mirrors 金額.
            originalAmount: total,
            originalCurrency: draft.originalCurrency || draft.currency || currencyForDate(draft.date),
            currency: draft.currency || draft.originalCurrency || currencyForDate(draft.date),
            personId: draft.personId || first?.id || '',
            splitMode: draft.splitMode || 'shared',
            visibility: privacyEligible && draft.visibility === 'private' ? 'private' : undefined,
            lineItems: finalLineItems.length ? finalLineItems : undefined,
            itemsText: itemRowsMode
              ? (finalLineItems.length ? serializeLineItems(finalLineItems, editPrefix) : '')
              : draft.itemsText,
          });
        }}
      >
        <div className="modal-head">
          <h2 id="receipt-editor-title">{receipt ? '編輯紀錄' : '手動記一筆'}</h2>
          <button type="button" className="icon-btn" onClick={onCancel}>×</button>
        </div>

        <label>店名 / 項目
          <input value={draft.store} onChange={(e) => set('store', e.target.value)} autoFocus />
        </label>
        <div className="form-grid">
          <label>日期
            <input type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} />
          </label>
          <label>時間
            <input type="time" value={draft.time || ''} onChange={(e) => set('time', e.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>金額
            <input type="text" inputMode="decimal" value={draft.total || ''} onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              set('total', !isNaN(parsed) && parsed >= 0 ? Math.min(parsed, MAX_RECEIPT_AMOUNT) : 0);
            }} />
          </label>
          <label>貨幣
            {/* Explicit aria-label: a wrapping <label> gives the select an accessible name polluted
                with every <option> text (貨幣JPYHKD...), breaking exact a11y queries. */}
            <select aria-label="貨幣" value={draft.originalCurrency || draft.currency || currencyForDate(draft.date)} onChange={(e) => {
              set('originalCurrency', e.target.value);
              set('currency', e.target.value);
            }}>
              {SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
        </div>
        <label>Booking Ref
          <input value={draft.bookingRef || ''} onChange={(e) => set('bookingRef', e.target.value)} placeholder="KNR358047 / booking id" />
        </label>
        <div className="form-grid">
          <label>類別
            <select value={draft.category} onChange={(e) => set('category', e.target.value as CategoryId)}>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>支付
            <select value={draft.payment} onChange={(e) => set('payment', e.target.value as PaymentId)}>
              {PAYMENTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>付款人
            <select value={draft.personId || first?.id || ''} onChange={(e) => set('personId', e.target.value)}>
              {persons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>分帳
            <select aria-label="分帳" value={draft.splitMode || 'shared'} onChange={(e) => set('splitMode', e.target.value as SplitMode)}>
              <option value="shared">Shared</option>
              <option value="private">私人 / 代付</option>
            </select>
          </label>
        </div>
        {draft.splitMode === 'private' && (
          <label>受惠人
            <select aria-label="受惠人" value={draft.beneficiaryId || draft.personId || first?.id || ''} onChange={(e) => set('beneficiaryId', e.target.value)}>
              {persons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <label>可見度
          {/* Locked to 全團可見 unless the record is personal (私人 split, no cross 代付) —
              a hidden record must never change another member's balance. */}
          <select
            aria-label="可見度"
            value={privacyEligible ? (draft.visibility || 'trip') : 'trip'}
            disabled={!privacyEligible}
            onChange={(e) => set('visibility', e.target.value === 'private' ? 'private' : undefined)}
          >
            <option value="trip">全團可見</option>
            <option value="private">🔒 只有自己</option>
          </select>
          {!privacyEligible && <small className="muted field-hint">揀「私人」分帳（冇代付對象）先可以收起呢筆</small>}
          {privacyEligible && draft.visibility === 'private' && <small className="muted field-hint">🔒 只會 sync 去你自己嘅戶口，唔會出現喺旅伴 app 或 Notion</small>}
        </label>
        <label>地址 / 地圖搜尋
          <input value={draft.address || ''} onChange={(e) => set('address', e.target.value)} placeholder="例：名古屋市中村区名駅4-6-25" />
        </label>
        {itemRowsMode ? (
          <div className="receipt-items-editor">
            <span className="receipt-items-label">品項</span>
            {(draft.lineItems || []).map((item, idx) => (
              <div className="receipt-item-row" key={item.id || idx}>
                <ItemLineInput
                  item={item}
                  prefix={editPrefix}
                  hkdOf={hkdOfItem}
                  fromHkd={fromHkdAmount}
                  ariaLabel={`品項 ${idx + 1}`}
                  onCommit={(next) => updateItem(idx, next)}
                />
                <button type="button" className="icon-btn receipt-item-remove" aria-label={`刪除品項 ${idx + 1}`} onClick={() => removeItem(idx)}>×</button>
              </div>
            ))}
            <div className="receipt-item-row receipt-item-row--new">
              <ItemLineInput
                item={newItem}
                prefix={editPrefix}
                hkdOf={hkdOfItem}
                fromHkd={fromHkdAmount}
                ariaLabel="新品項"
                placeholder={`加新品項…   ${editPrefix}金額   HK$`}
                onCommit={(next) => setNewItem({ desc: next.desc, amount: next.amount })}
              />
              <button type="button" className="icon-btn receipt-item-add" aria-label="新增品項" disabled={!newItem.desc.trim() && !newItem.amount} onClick={appendNewItem}>＋</button>
            </div>
          </div>
        ) : (
          <label>品項
            <textarea value={draft.itemsText || ''} onChange={(e) => set('itemsText', e.target.value)} rows={6} />
          </label>
        )}
        <label>備註
          <textarea value={draft.note || ''} onChange={(e) => set('note', e.target.value)} rows={3} />
        </label>
        <input ref={photoRef} hidden type="file" accept="image/*" onChange={(e) => attachPhoto(e.target.files?.[0])} />
        <div className="photo-tools">
          {(draft.photoThumb || draft.photoUrl) && (
            <button className="photo-thumb" type="button" onClick={() => setViewPhoto(draft)}>
              <img
                src={safePhotoUrl(draft.photoUrl, draft.photoThumb)}
                alt="receipt"
                onError={(e) => {
                  const thumbSrc = safePhotoUrl(draft.photoThumb);
                  if (thumbSrc && e.currentTarget.src !== thumbSrc) {
                    console.log('[ReceiptEditor] photoUrl failed, fallback to photoThumb');
                    e.currentTarget.src = thumbSrc;
                  }
                }}
              />
            </button>
          )}
          <div className="photo-tool-buttons">
            {(draft.photoThumb || draft.photoUrl) && <button type="button" className="danger" onClick={() => setDraft((d) => ({ ...d, photoThumb: '', photoUrl: '' }))}>刪除相片</button>}
            <button type="button" className="secondary" onClick={() => photoRef.current?.click()}>加入 / 更換收據相</button>
            {onAddToItinerary && <button type="button" className="secondary" onClick={() => {
              const total = validAmount(draft.total);
              if (total == null) {
                alert(`金額必須係 0 至 ${MAX_RECEIPT_AMOUNT.toLocaleString()} 之間嘅有效數字`);
                return;
              }
              onAddToItinerary({ ...draft, store: draft.store.trim() || '未命名', total });
            }}>加入行程</button>}
          </div>
        </div>

        <div className="modal-actions receipt-editor-actions">
          {receipt && onDelete && !viewerReadOnly
            ? <div className="receipt-delete-slot"><button type="button" className="danger" onClick={() => setShowDeleteConfirm(true)}>刪除</button></div>
            : null}
          <div className="receipt-final-actions">
            {viewerReadOnly
              ? <span className="muted" style={{ fontSize: '12px', alignSelf: 'center' }}>只可檢視（Viewer 權限）</span>
              : <GradientButton type="submit" className="text-sm">儲存</GradientButton>}
            <button type="button" className="secondary" onClick={onCancel}>取消</button>
          </div>
        </div>
      </form>
      {showDeleteConfirm && receipt && onDelete && (
        <div
          className="modal-backdrop receipt-delete-confirm-backdrop"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="receipt-delete-confirm-title"
          aria-describedby="receipt-delete-confirm-description"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div className="modal receipt-delete-confirm" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2 id="receipt-delete-confirm-title">確認刪除紀錄</h2>
            </div>
            <p id="receipt-delete-confirm-description" className="muted">
              你即將刪除「{receipt.store || '未命名'}」。確認後會移除呢筆消費紀錄；按取消會返回編輯畫面。
            </p>
            <div className="modal-actions receipt-delete-confirm-actions">
              <button type="button" className="secondary" onClick={() => setShowDeleteConfirm(false)}>取消</button>
              <button type="button" className="danger" onClick={() => {
                setShowDeleteConfirm(false);
                onDelete(receipt);
              }}>確認刪除</button>
            </div>
          </div>
        </div>
      )}
      {viewPhoto && (
        <ReceiptPhotoModal receipt={viewPhoto} onClose={() => setViewPhoto(null)} />
      )}
    </div>
  );
}
