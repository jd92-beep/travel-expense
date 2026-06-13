import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, PAYMENTS } from '../lib/constants';
import { SUPPORTED_CURRENCIES } from '../lib/currency';
import { getItinerary, getPersons, safePhotoUrl, todayForReceipts, compressPhoto } from '../lib/domain';
import type { AppState, CategoryId, PaymentId, Receipt, SplitMode } from '../lib/types';
import { ReceiptPhotoModal } from './ReceiptPhotoModal';

const newId = () => `manual_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const MAX_RECEIPT_AMOUNT = 1_000_000_000;

function validAmount(value: unknown): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_RECEIPT_AMOUNT) return null;
  return amount;
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
  const currencyForDate = (date?: string) => (
    itinerary.find((day) => day.date === date)?.currency
    || state.tripCurrency
    || 'JPY'
  );
  const photoRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(true);
  const [viewPhoto, setViewPhoto] = useState<Receipt | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [draft, setDraft] = useState<Receipt>(() => receipt || {
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
    setDraft(receipt || {
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
    if (key === 'date' && !receipt) {
      const nextCurrency = currencyForDate(String(value || ''));
      return { ...d, [key]: value, currency: nextCurrency, originalCurrency: nextCurrency };
    }
    return { ...d, [key]: value };
  });

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
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="receipt-editor-title">
      <form
        className="modal sheet"
        onSubmit={(event) => {
          event.preventDefault();
          const total = validAmount(draft.total);
          const originalAmount = validAmount(draft.originalAmount ?? draft.total);
          if (total == null || originalAmount == null) {
            alert(`金額必須係 0 至 ${MAX_RECEIPT_AMOUNT.toLocaleString()} 之間嘅有效數字`);
            return;
          }
          onSave({
            ...draft,
            store: draft.store.trim() || '未命名',
            total,
            originalAmount,
            originalCurrency: draft.originalCurrency || draft.currency || currencyForDate(draft.date),
            currency: draft.currency || draft.originalCurrency || currencyForDate(draft.date),
            personId: draft.personId || first?.id || '',
            splitMode: draft.splitMode || 'shared',
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
          <label>金額（legacy total）
            <input type="text" inputMode="decimal" value={draft.total || ''} onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              set('total', !isNaN(parsed) && parsed >= 0 ? Math.min(parsed, MAX_RECEIPT_AMOUNT) : 0);
            }} />
          </label>
          <label>原貨幣
            <select value={draft.originalCurrency || draft.currency || currencyForDate(draft.date)} onChange={(e) => {
              set('originalCurrency', e.target.value);
              set('currency', e.target.value);
            }}>
              {SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>原金額
            <input type="text" inputMode="decimal" value={draft.originalAmount ?? draft.total ?? ''} onChange={(e) => {
              const parsed = parseFloat(e.target.value);
              set('originalAmount', !isNaN(parsed) && parsed >= 0 ? Math.min(parsed, MAX_RECEIPT_AMOUNT) : 0);
            }} />
          </label>
          <label>Booking Ref
            <input value={draft.bookingRef || ''} onChange={(e) => set('bookingRef', e.target.value)} placeholder="KNR358047 / booking id" />
          </label>
        </div>
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
            <select value={draft.splitMode || 'shared'} onChange={(e) => set('splitMode', e.target.value as SplitMode)}>
              <option value="shared">Shared</option>
              <option value="private">私人 / 代付</option>
            </select>
          </label>
        </div>
        {draft.splitMode === 'private' && (
          <label>受惠人
            <select value={draft.beneficiaryId || draft.personId || first?.id || ''} onChange={(e) => set('beneficiaryId', e.target.value)}>
              {persons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <label>地址 / 地圖搜尋
          <input value={draft.address || ''} onChange={(e) => set('address', e.target.value)} placeholder="例：名古屋市中村区名駅4-6-25" />
        </label>
        <label>品項
          <textarea value={draft.itemsText || ''} onChange={(e) => set('itemsText', e.target.value)} rows={6} />
        </label>
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
          <button type="button" className="secondary" onClick={() => photoRef.current?.click()}>加入 / 更換收據相</button>
          {((draft.photoThumb || draft.photoUrl) || onAddToItinerary) && (
            <div className="photo-secondary-actions">
              {(draft.photoThumb || draft.photoUrl) && <button type="button" className="danger" onClick={() => setDraft((d) => ({ ...d, photoThumb: '', photoUrl: '' }))}>刪除相片</button>}
              {onAddToItinerary && <button type="button" className="secondary" onClick={() => {
                const total = validAmount(draft.total);
                if (total == null) {
                  alert(`金額必須係 0 至 ${MAX_RECEIPT_AMOUNT.toLocaleString()} 之間嘅有效數字`);
                  return;
                }
                onAddToItinerary({ ...draft, store: draft.store.trim() || '未命名', total });
              }}>加入行程</button>}
            </div>
          )}
        </div>

        <div className="modal-actions receipt-editor-actions">
          <div className="receipt-delete-slot">
            {receipt && onDelete ? <button type="button" className="danger" onClick={() => setShowDeleteConfirm(true)}>刪除</button> : null}
          </div>
          <div className="receipt-final-actions">
            <button type="submit" className="primary">儲存</button>
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
        >
          <div className="modal receipt-delete-confirm">
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
