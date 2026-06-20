import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, PAYMENTS } from '../lib/constants';
import { SUPPORTED_CURRENCIES } from '../lib/currency';
import { getItinerary, getPersons, safePhotoUrl, todayForReceipts, compressPhoto } from '../lib/domain';
import { perHkdForCurrency } from '../lib/currency';
import { activeTrip } from '../domain/trip/normalize';
import type { AppState, CategoryId, PaymentId, Person, Receipt, ReceiptLineItem, ReceiptPayer, ReceiptSplit, SplitMode, SplitType } from '../lib/types';
import { AvatarBadge } from './AvatarBadge';
import { ReceiptPhotoModal } from './ReceiptPhotoModal';
import { SegmentedControl, StatusPill } from './ui';
import { foldLineItemsToSplits } from '../lib/splitEngine';

const newId = () => `manual_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const MAX_RECEIPT_AMOUNT = 1_000_000_000;
type SplitField = 'weight' | 'amount' | 'pct' | 'adjust';
const BASE_SPLIT_TYPE_OPTIONS: Array<{ value: SplitType; label: string }> = [
  { value: 'equal', label: '均分' },
  { value: 'shares', label: '份數' },
  { value: 'exact', label: '實額' },
  { value: 'percent', label: '百分比' },
  { value: 'adjustment', label: '加減' },
];
const ITEMIZED_SPLIT_OPTION: { value: SplitType; label: string } = { value: 'itemized', label: '品項' };

function splitFieldFor(type: SplitType): SplitField | null {
  if (type === 'shares') return 'weight';
  if (type === 'exact') return 'amount';
  if (type === 'percent') return 'pct';
  if (type === 'adjustment') return 'adjust';
  return null;
}

function splitInputLabel(type: SplitType) {
  if (type === 'shares') return '份數';
  if (type === 'exact') return '實額';
  if (type === 'percent') return '百分比';
  return '加減';
}

function validAmount(value: unknown): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_RECEIPT_AMOUNT) return null;
  return amount;
}

function splitValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function splitEvenly(total: number, count: number) {
  const rounded = Math.round(Math.max(0, total));
  const base = Math.floor(rounded / Math.max(1, count));
  let leftover = rounded - base * count;
  return Array.from({ length: count }, () => base + (leftover-- > 0 ? 1 : 0));
}

function percentEvenly(count: number) {
  const base = Math.floor(10000 / Math.max(1, count));
  let leftover = 10000 - base * count;
  return Array.from({ length: count }, () => (base + (leftover-- > 0 ? 1 : 0)) / 100);
}

function defaultSplits(persons: Person[], splitType: SplitType, total: number): ReceiptSplit[] {
  const amounts = splitEvenly(total, persons.length);
  const percents = percentEvenly(persons.length);
  return persons.map((person, index) => ({
    personId: person.id,
    weight: splitType === 'shares' ? 1 : undefined,
    amount: splitType === 'exact' ? amounts[index] : undefined,
    pct: splitType === 'percent' ? percents[index] : undefined,
    adjust: splitType === 'adjustment' ? 0 : undefined,
  }));
}

function splitRowsFor(persons: Person[], splits: ReceiptSplit[] | undefined, splitType: SplitType, total: number): ReceiptSplit[] {
  const byId = new Map((splits || []).map((split) => [split.personId, split]));
  return defaultSplits(persons, splitType, total).map((split) => ({
    ...split,
    ...byId.get(split.personId),
    personId: split.personId,
  }));
}

function formatDelta(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

function validateSplitRows(splitType: SplitType, total: number, rows: ReceiptSplit[]) {
  const field = splitFieldFor(splitType);
  if (!field) return { valid: true, label: '已對數' };
  const sum = rows.reduce((acc, row) => acc + splitValue(row[field]), 0);
  if (splitType === 'shares') {
    return sum > 0 ? { valid: true, label: '已對數' } : { valid: false, label: '份數要大過 0' };
  }
  if (splitType === 'percent') {
    const diff = 100 - sum;
    if (Math.abs(diff) < 0.01) return { valid: true, label: '已對數' };
    return { valid: false, label: diff > 0 ? `差 ${formatDelta(diff)}%` : `多 ${formatDelta(Math.abs(diff))}%` };
  }
  const diff = Math.round(total) - Math.round(sum);
  if (splitType === 'adjustment') {
    return diff >= 0 ? { valid: true, label: '已對數' } : { valid: false, label: `多 ¥${formatDelta(Math.abs(diff))}` };
  }
  return diff === 0 ? { valid: true, label: '已對數' } : { valid: false, label: diff > 0 ? `差 ¥${formatDelta(diff)}` : `多 ¥${formatDelta(Math.abs(diff))}` };
}

function payerRowsFor(persons: Person[], payers: ReceiptPayer[] | undefined, total: number, fallbackPersonId: string): ReceiptPayer[] {
  const byId = new Map((payers || []).map((payer) => [payer.personId, payer]));
  return persons.map((person) => ({
    personId: person.id,
    amount: person.id === fallbackPersonId ? Math.round(Math.max(0, total)) : 0,
    ...byId.get(person.id),
  }));
}

function validatePayers(total: number, rows: ReceiptPayer[]) {
  const sum = rows.reduce((acc, row) => acc + splitValue(row.amount), 0);
  const positive = rows.filter((row) => splitValue(row.amount) > 0).length;
  if (Math.round(total) > 0 && positive < 2) return { valid: false, label: '至少兩位付款' };
  const diff = Math.round(total) - Math.round(sum);
  return diff === 0 ? { valid: true, label: '已對數' } : { valid: false, label: diff > 0 ? `差 ¥${formatDelta(diff)}` : `多 ¥${formatDelta(Math.abs(diff))}` };
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
  const hasLineItems = Boolean(draft.lineItems?.length);
  const splitTypeOptions = useMemo(
    () => hasLineItems ? [...BASE_SPLIT_TYPE_OPTIONS, ITEMIZED_SPLIT_OPTION] : BASE_SPLIT_TYPE_OPTIONS,
    [hasLineItems],
  );
  const selectedSplitType = splitTypeOptions.some((option) => option.value === draft.splitType)
    ? draft.splitType as SplitType
    : 'equal';
  const totalForSplit = validAmount(draft.total) ?? 0;
  const splitRows = useMemo(
    () => splitRowsFor(persons, draft.splits, selectedSplitType, totalForSplit),
    [draft.splits, persons, selectedSplitType, totalForSplit],
  );
  const splitValidation = useMemo(
    () => validateSplitRows(selectedSplitType, totalForSplit, splitRows),
    [selectedSplitType, splitRows, totalForSplit],
  );
  const multiPayerEnabled = draft.splitMode !== 'private' && Boolean(draft.payers?.length);
  const payerRows = useMemo(
    () => payerRowsFor(persons, draft.payers, totalForSplit, draft.personId || first.id),
    [draft.payers, draft.personId, first.id, persons, totalForSplit],
  );
  const payerValidation = useMemo(
    () => validatePayers(totalForSplit, payerRows),
    [payerRows, totalForSplit],
  );

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

  const setSplitValue = (personId: string, raw: string) => {
    const field = splitFieldFor(selectedSplitType);
    if (!field) return;
    setDraft((d) => ({
      ...d,
      splitType: selectedSplitType,
      splits: splitRowsFor(persons, d.splits, selectedSplitType, validAmount(d.total) ?? 0)
        .map((row) => row.personId === personId ? { ...row, [field]: splitValue(raw) } : row),
    }));
  };

  const setPayerValue = (personId: string, raw: string) => {
    setDraft((d) => ({
      ...d,
      payers: payerRowsFor(persons, d.payers, validAmount(d.total) ?? 0, d.personId || first.id)
        .map((row) => row.personId === personId ? { ...row, amount: splitValue(raw) } : row),
    }));
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
          const originalAmount = validAmount(draft.originalAmount ?? draft.total);
          if (total == null || originalAmount == null) {
            alert(`金額必須係 0 至 ${MAX_RECEIPT_AMOUNT.toLocaleString()} 之間嘅有效數字`);
            return;
          }
          const keepSplits = draft.splitMode !== 'private' && selectedSplitType !== 'equal';
          const finalSplits = selectedSplitType === 'itemized' && hasLineItems
            ? foldLineItemsToSplits(draft.lineItems!, persons.map((p) => p.id), totalForSplit)
            : splitRows;
          if (keepSplits && selectedSplitType !== 'itemized' && !splitValidation.valid) {
            alert(`拆數未對數：${splitValidation.label}`);
            return;
          }
          const keepPayers = draft.splitMode !== 'private' && multiPayerEnabled;
          if (keepPayers && !payerValidation.valid) {
            alert(`付款未對數：${payerValidation.label}`);
            return;
          }
          const savedCurrency = draft.currency || draft.originalCurrency || currencyForDate(draft.date);
          const fxRate = savedCurrency === 'HKD' ? undefined : perHkdForCurrency(state, savedCurrency);
          onSave({
            ...draft,
            store: draft.store.trim() || '未命名',
            total,
            originalAmount,
            originalCurrency: draft.originalCurrency || draft.currency || currencyForDate(draft.date),
            currency: savedCurrency,
            exchangeRate: fxRate ?? draft.exchangeRate,
            hkdAmount: fxRate ? Math.round(total / Math.max(0.1, fxRate)) : draft.hkdAmount,
            personId: draft.personId || first?.id || '',
            splitMode: draft.splitMode || 'shared',
            splitType: keepSplits ? selectedSplitType : undefined,
            splits: keepSplits ? finalSplits : undefined,
            lineItems: hasLineItems ? draft.lineItems : undefined,
            payers: keepPayers ? payerRows.filter((row) => splitValue(row.amount) > 0) : undefined,
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
            <select value={draft.splitMode || 'shared'} onChange={(e) => setDraft((d) => {
              const splitMode = e.target.value as SplitMode;
              return { ...d, splitMode, payers: splitMode === 'private' ? undefined : d.payers };
            })}>
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
        {draft.splitMode !== 'private' && (
          <details className="receipt-split-disclosure">
            <summary>進階拆數</summary>
            <SegmentedControl
              ariaLabel="選擇拆數方式"
              value={selectedSplitType}
              options={splitTypeOptions}
              onChange={(value) => setDraft((d) => ({ ...d, splitType: value, splits: value === 'equal' ? undefined : d.splits }))}
            />
            {selectedSplitType !== 'equal' && selectedSplitType !== 'itemized' && (
              <div className="receipt-split-editor">
                <StatusPill tone={splitValidation.valid ? 'ok' : 'warning'}>{splitValidation.label}</StatusPill>
                <div className="receipt-split-rows">
                  {splitRows.map((row) => {
                    const field = splitFieldFor(selectedSplitType);
                    const person = persons.find((p) => p.id === row.personId);
                    if (!field || !person) return null;
                    const label = splitInputLabel(selectedSplitType);
                    return (
                      <label key={row.personId} className="receipt-split-row">
                        <span className="receipt-split-person">
                          <AvatarBadge person={person} size="sm" />
                          <span>{person.name}</span>
                        </span>
                        <input
                          aria-label={`${person.name} ${label}`}
                          type="text"
                          inputMode="decimal"
                          value={splitValue(row[field])}
                          onChange={(event) => setSplitValue(row.personId, event.target.value)}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {selectedSplitType === 'itemized' && hasLineItems && (
              <div className="receipt-split-editor receipt-itemized-editor">
                <div className="receipt-itemized-actions">
                  <button
                    type="button"
                    className="secondary receipt-itemized-assign-all"
                    onClick={() => {
                      setDraft((d) => ({
                        ...d,
                        lineItems: (d.lineItems || []).map((li) => ({
                          ...li,
                          assignedTo: persons.map((p) => p.id),
                        })),
                      }));
                    }}
                  >一鍵均分所有人</button>
                  <button
                    type="button"
                    className="secondary receipt-itemized-assign-all"
                    onClick={() => {
                      setDraft((d) => ({
                        ...d,
                        lineItems: (d.lineItems || []).map((li) => ({
                          ...li,
                          assignedTo: [],
                        })),
                      }));
                    }}
                  >清除全部分配</button>
                </div>
                <div className="receipt-itemized-rows">
                  {draft.lineItems!.map((item, idx) => {
                    const assigned = new Set(item.assignedTo?.length ? item.assignedTo : persons.map((p) => p.id));
                    return (
                      <div key={item.id || idx} className="receipt-itemized-row">
                        <div className="receipt-itemized-info">
                          <span className="receipt-itemized-desc">{item.desc}</span>
                          <span className="receipt-itemized-amount">¥{item.amount.toLocaleString()}{item.qty && item.qty > 1 ? ` ×${item.qty}` : ''}</span>
                        </div>
                        <div className="receipt-itemized-avatars">
                          {persons.map((person) => {
                            const isOn = assigned.has(person.id);
                            return (
                              <button
                                key={person.id}
                                type="button"
                                className={`receipt-itemized-toggle ${isOn ? 'is-on' : ''}`}
                                aria-label={`${person.name} ${isOn ? '已分配' : '未分配'}`}
                                onClick={() => {
                                  setDraft((d) => {
                                    const items = (d.lineItems || []).map((li, liIdx) => {
                                      if (liIdx !== idx) return li;
                                      const prev = new Set(li.assignedTo?.length ? li.assignedTo : persons.map((p) => p.id));
                                      if (prev.has(person.id)) prev.delete(person.id);
                                      else prev.add(person.id);
                                      return { ...li, assignedTo: persons.filter((p) => prev.has(p.id)).map((p) => p.id) };
                                    });
                                    return { ...d, lineItems: items };
                                  });
                                }}
                              >
                                <AvatarBadge person={person} size="sm" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {(() => {
                  const lineTotal = draft.lineItems!.reduce((sum, item) => sum + item.amount, 0);
                  const gap = Math.round(totalForSplit) - lineTotal;
                  if (gap !== 0) {
                    return <StatusPill tone="warning">{gap > 0 ? `未分配 ¥${gap.toLocaleString()}` : `超出 ¥${Math.abs(gap).toLocaleString()}`}</StatusPill>;
                  }
                  return <StatusPill tone="ok">品項已對數</StatusPill>;
                })()}
              </div>
            )}
            <label className="check-row receipt-multi-payer-toggle">
              <input
                type="checkbox"
                checked={multiPayerEnabled}
                onChange={(event) => setDraft((d) => ({
                  ...d,
                  payers: event.target.checked
                    ? payerRowsFor(persons, d.payers, validAmount(d.total) ?? 0, d.personId || first.id)
                    : undefined,
                }))}
              />
              <span>多人付款</span>
            </label>
            {multiPayerEnabled && (
              <div className="receipt-split-editor receipt-payer-editor">
                <StatusPill tone={payerValidation.valid ? 'ok' : 'warning'}>{payerValidation.label}</StatusPill>
                <div className="receipt-split-rows">
                  {payerRows.map((row) => {
                    const person = persons.find((p) => p.id === row.personId);
                    if (!person) return null;
                    return (
                      <label key={row.personId} className="receipt-split-row">
                        <span className="receipt-split-person">
                          <AvatarBadge person={person} size="sm" />
                          <span>{person.name}</span>
                        </span>
                        <input
                          aria-label={`${person.name} 付款`}
                          type="text"
                          inputMode="decimal"
                          value={splitValue(row.amount)}
                          onChange={(event) => setPayerValue(row.personId, event.target.value)}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </details>
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
        {receipt?.supabaseId && (
          <ExpenseComments receiptSupabaseId={receipt.supabaseId} />
        )}
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
            {receipt && onDelete && !viewerReadOnly ? <button type="button" className="danger" onClick={() => setShowDeleteConfirm(true)}>刪除</button> : null}
          </div>
          <div className="receipt-final-actions">
            {viewerReadOnly
              ? <span className="muted" style={{ fontSize: '12px', alignSelf: 'center' }}>只可檢視（Viewer 權限）</span>
              : <button type="submit" className="primary">儲存</button>}
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

function ExpenseComments({ receiptSupabaseId }: { receiptSupabaseId: string }) {
  const [comments, setComments] = useState<Array<{ id: string; user_id: string; content: string; created_at: string }>>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { fetchExpenseComments } = await import('../lib/supabase');
        const data = await fetchExpenseComments(receiptSupabaseId);
        if (!cancelled) setComments(data);
      } catch {
        // silently ignore — comments are optional
      }
    })();
    return () => { cancelled = true; };
  }, [receiptSupabaseId]);

  async function addComment() {
    const text = newComment.trim();
    if (!text) return;
    setLoading(true);
    setError('');
    try {
      const { insertExpenseComment } = await import('../lib/supabase');
      const comment = await insertExpenseComment(receiptSupabaseId, text);
      setComments((prev) => [...prev, comment]);
      setNewComment('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '留言失敗');
    } finally {
      setLoading(false);
    }
  }

  async function removeComment(id: string) {
    try {
      const { deleteExpenseComment } = await import('../lib/supabase');
      await deleteExpenseComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // silently ignore
    }
  }

  return (
    <details className="receipt-comments-disclosure">
      <summary>留言 ({comments.length})</summary>
      <div className="receipt-comments-list">
        {comments.map((c) => (
          <div key={c.id} className="receipt-comment-row">
            <span className="receipt-comment-text">{c.content}</span>
            <button type="button" className="icon-btn receipt-comment-delete" onClick={() => removeComment(c.id)} aria-label="刪除留言">×</button>
          </div>
        ))}
        {comments.length === 0 && <p className="muted receipt-comments-empty">暫無留言</p>}
      </div>
      <div className="receipt-comment-input-row">
        <input
          type="text"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="寫個留言…"
          maxLength={2000}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addComment(); } }}
          disabled={loading}
        />
        <button type="button" className="primary" onClick={addComment} disabled={loading || !newComment.trim()}>送出</button>
      </div>
      {error && <p className="muted" style={{ color: 'var(--red)' }}>{error}</p>}
    </details>
  );
}
