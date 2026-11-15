import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { CATEGORIES, PAYMENTS } from '../lib/constants';
import { currencyPrefix, perHkdForCurrency, SUPPORTED_CURRENCIES } from '../lib/currency';
import { canBePrivateReceipt, getItinerary, getPersons, safePhotoUrl, todayForReceipts, compressPhoto } from '../lib/domain';
import { activeTrip } from '../domain/trip/normalize';
import type { AppState, CategoryId, PaymentId, Receipt, ReceiptLineItem, SplitMode } from '../lib/types';
import { ReceiptPhotoModal } from './ReceiptPhotoModal';
import { GradientButton } from './ui/gradient-button';
import { SegmentedControl } from './ui';
import { formatRate, knownLiveRate, settingsFixedRate } from '../lib/rateMode';
import { useModalAccessibility } from '../lib/useModalAccessibility';
import { useModalOpenClass } from '../lib/useModalOpenClass';

const newId = () => `manual_${Date.now()}_${(typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(16).slice(2)}`;
const MAX_RECEIPT_AMOUNT = 1_000_000_000;

function validAmount(value: string): number | null {
  const raw = value.trim();
  // Accept complete decimal amounts and conventional thousands grouping, never a numeric prefix.
  if (!/^(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)$/.test(raw)) return null;
  const amount = Number(raw.replace(/,/g, ''));
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
  prefix: string,
  hkdOf: (n: number) => number,
  fromHkd: (n: number) => number,
): { desc: string; amount: number; qty?: number } {
  const segments = String(text || '').split(/\s{2,}|\t/).map((seg) => seg.trim()).filter(Boolean);
  if (!segments.length) return { ...prev, desc: '' };
  let desc = segments[0];
  let qty: number | undefined;
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
    if (/HK/i.test(seg) && prefix !== 'HK$') hkdAmount = value;
    else if (destAmount == null) destAmount = value;
    else if (hkdAmount == null) hkdAmount = value;
  }
  let amount = prev.amount;
  const destChanged = destAmount != null && destAmount !== prev.amount;
  const hkdChanged = hkdAmount != null && Math.abs(hkdAmount - hkdOf(prev.amount)) > 0.01;
  if (destChanged) amount = Math.min(destAmount as number, MAX_RECEIPT_AMOUNT);
  else if (hkdChanged) amount = Math.min(fromHkd(hkdAmount as number), MAX_RECEIPT_AMOUNT);
  else if (destAmount != null) amount = Math.min(destAmount, MAX_RECEIPT_AMOUNT);
  return { desc, amount, qty };
}

// Free-typing wrapper: keeps the raw text while focused, parses + reformats on blur so the
// caret never jumps mid-edit and both currencies re-derive from whichever number changed.
function ItemLineInput({ item, prefix, hkdOf, fromHkd, onCommit, placeholder, ariaLabel, disabled }: {
  item: { desc: string; amount: number; qty?: number };
  prefix: string;
  hkdOf: (n: number) => number;
  fromHkd: (n: number) => number;
  onCommit: (next: { desc: string; amount: number; qty?: number }) => void;
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
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
      disabled={disabled}
      onChange={(e) => setRaw(e.target.value)}
      onKeyDown={(event) => {
        // Enter submits without blurring; commit the visible item before the form reads it.
        if (event.key === 'Enter' && !event.nativeEvent.isComposing && raw != null) {
          flushSync(() => {
            onCommit(parseItemLine(raw, item, prefix, hkdOf, fromHkd));
            setRaw(null);
          });
        }
      }}
      onBlur={() => {
        if (raw != null) onCommit(parseItemLine(raw, item, prefix, hkdOf, fromHkd));
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
  currentUserId,
}: {
  state: AppState;
  receipt?: Receipt | null;
  onCancel: () => void;
  onSave: (receipt: Receipt) => void;
  onDelete?: (receipt: Receipt) => void;
  onAddToItinerary?: (receipt: Receipt) => void;
  currentUserId?: string;
}) {
  const persons = useMemo(() => getPersons(state), [state]);
  const first = persons[0] || { id: '', name: '' };
  const itinerary = useMemo(() => getItinerary(state), [state]);
  // Viewers on a shared trip are read-only — they can't save or delete receipts (RLS enforces
  // this server-side; this prevents a confusing failed write on the client).
  const viewerReadOnly = activeTrip(state).sharing?.role === 'viewer';
  // A receipt owned by ANOTHER trip member is read-only too: the canonical RPC rejects
  // non-owner updates/deletes with 42501, and the local optimistic edit/tombstone would
  // otherwise diverge from the server copy forever (edit wins every merge via newer
  // updatedAt; delete hides a row that still exists for everyone else). Two signals:
  // ownerId vs the live session id, or the pull-time createdByLabel ('You' = mine) —
  // either one saying "not mine" is enough.
  const foreignOwned = !!receipt
    && !!receipt.ownerId
    && (
      (!!currentUserId && receipt.ownerId !== currentUserId)
      || (!!receipt.createdByLabel && receipt.createdByLabel !== 'You')
    );
  const readOnly = viewerReadOnly || foreignOwned;
  const ownerLabel = receipt?.createdByLabel && receipt.createdByLabel !== 'You'
    ? receipt.createdByLabel
    : '旅伴';
  const currencyForDate = (date?: string) => (
    itinerary.find((day) => day.date === date)?.currency
    || state.tripCurrency
    || 'JPY'
  );
  const photoRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(true);
  const [viewPhoto, setViewPhoto] = useState<Receipt | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const editorRef = useModalAccessibility(!viewPhoto && !showDeleteConfirm, onCancel);
  const deleteRef = useModalAccessibility(showDeleteConfirm, () => setShowDeleteConfirm(false));
  const dateRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const rateRef = useRef<HTMLInputElement>(null);
  const [amountTouched, setAmountTouched] = useState(false);
  const [dateTouched, setDateTouched] = useState(false);
  const [rateTouched, setRateTouched] = useState(false);
  useModalOpenClass(true);
  const createDraft = (): Receipt => receipt ? {
    ...receipt,
    // New OCR/manual drafts belong to the trip where they were opened; legacy rows keep their fallback.
    ...(!receipt.tripId && !state.receipts.some((r) => r.id === receipt.id)
      ? { tripId: activeTrip(state).id, tripLinkSource: 'explicit' as const } : {}),
    lineItems: hydratedLineItems(receipt),
  } : {
    id: newId(),
    tripId: activeTrip(state).id,
    tripLinkSource: 'explicit',
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
  };
  const [draft, setDraft] = useState<Receipt>(createDraft);
  // Keep the typed amount intact until validation succeeds, including decimal separators.
  const [totalInput, setTotalInput] = useState<string>(() => (receipt?.total != null ? String(receipt.total) : ''));
  const [rateInput, setRateInput] = useState(() => receipt?.exchangeRate != null ? String(receipt.exchangeRate) : '');
  const parsedTotal = validAmount(totalInput);
  const amountError = amountTouched && parsedTotal == null
    ? (totalInput.trim() ? `請輸入 0 至 ${MAX_RECEIPT_AMOUNT.toLocaleString('en-US')} 嘅有效金額，例如 2,480.50。` : '請輸入金額；零元紀錄請填 0。')
    : '';
  const dateError = dateTouched && !draft.date ? '請選擇記帳日期，再儲存。' : '';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setShowDeleteConfirm(false);
    const nextDraft = createDraft();
    setDraft(nextDraft);
    setTotalInput(receipt?.total != null ? String(receipt.total) : '');
    setRateInput(receipt?.exchangeRate != null ? String(receipt.exchangeRate) : '');
    setAmountTouched(false);
    setDateTouched(false);
    setRateTouched(false);
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
        return { ...d, [key]: value, currency: nextDayCurrency, originalCurrency: nextDayCurrency,
          ...(nextDayCurrency !== d.currency ? { exchangeRate: undefined, exchangeRatePinned: undefined } : {}) };
      }
    }
    return { ...d, [key]: value };
  });
  // 品項 rows: structured lineItems are the source of truth; legacy free-text receipts whose
  // itemsText can't be parsed keep the old textarea instead.
  const itemRowsMode = draft.lineItems != null || !draft.itemsText?.trim();
  const [newItem, setNewItem] = useState<{ desc: string; amount: number; qty?: number }>({ desc: '', amount: 0 });
  const editPrefix = currencyPrefix(draft.currency || draft.originalCurrency || currencyForDate(draft.date));
  const editCurrencyCode = String(draft.currency || draft.originalCurrency || currencyForDate(draft.date) || 'JPY').toUpperCase();
  const currentPerHkd = perHkdForCurrency(state, editCurrencyCode);
  // Preserve the receipt's saved rate; only new/currency-changed records use today's setting.
  const savedCurrency = String(receipt?.currency || receipt?.originalCurrency || '').toUpperCase();
  const draftRate = Number(draft.exchangeRate);
  const validDraftRate = Number.isFinite(draftRate) && draftRate > 0 ? draftRate : 0;
  const savedPerHkd = editCurrencyCode === savedCurrency ? validDraftRate : 0;
  const parsedRate = validAmount(rateInput);
  const validPinnedRate = parsedRate != null && parsedRate > 0 && parsedRate <= 1_000_000 ? parsedRate : null;
  const unsafeConversion = validPinnedRate != null && parsedTotal != null && !Number.isSafeInteger(Math.round(parsedTotal / validPinnedRate));
  const invalidPinnedRate = !!draft.exchangeRatePinned && editCurrencyCode !== 'HKD' && (validPinnedRate == null || unsafeConversion);
  const rateError = rateTouched && invalidPinnedRate
    ? unsafeConversion ? '折算金額超出可處理範圍，請檢查匯率。' : '請輸入大於 0、最多 1,000,000 嘅有效匯率。'
    : '';
  const pinnedPerHkd = draft.exchangeRatePinned ? validPinnedRate : 0;
  const editPerHkd = editCurrencyCode === 'HKD' ? 1 : pinnedPerHkd || savedPerHkd || currentPerHkd;
  const hkdOfItem = (amount: number) => Math.round((amount / editPerHkd) * 100) / 100;
  const fromHkdAmount = (hkdValue: number) => Math.round(hkdValue * editPerHkd * 100) / 100;
  const effectivePayerId = draft.personId || first?.id || '';
  const privacyEligible = canBePrivateReceipt({ splitMode: draft.splitMode || 'shared', beneficiaryId: draft.beneficiaryId, personId: effectivePayerId });
  const validateDraft = (): number | null => {
    setDateTouched(true);
    setAmountTouched(true);
    setRateTouched(true);
    if (!draft.date) { dateRef.current?.focus(); return null; }
    if (parsedTotal == null) { amountRef.current?.focus(); return null; }
    if (invalidPinnedRate) { rateRef.current?.focus(); return null; }
    return parsedTotal;
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
      lineItems: [...(d.lineItems || []), { ...newItem, id: newId(), desc: newItem.desc.trim() || '未命名品項' }],
    }));
    setNewItem({ desc: '', amount: 0 });
  };

  async function attachPhoto(file?: File) {
    if (!file) return;
    try {
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
      if (!mountedRef.current) return;
      // Replacing the photo must clear BOTH cloud paths/synced flags (Supabase and Notion),
      // otherwise sync sees the old flags and skips the re-upload of the new image.
      setDraft((d) => ({
        ...d,
        photoThumb: compressed || base64,
        photoUrl: '',
        _photoSyncedToSupabase: false,
        supabasePhotoPath: undefined,
        _photoSyncAttempts: 0,
        _photoSyncedToNotion: false,
        _photoBodyBlockAdded: false,
        notionFileUploadId: undefined,
      }));
    } catch (error) {
      console.warn('[ReceiptEditor] attachPhoto failed:', error);
    } finally {
      if (photoRef.current) photoRef.current.value = '';
    }
  }


  return (
    <div ref={editorRef} className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="receipt-editor-title" onClick={onCancel}>
      <form
        className="modal sheet receipt-editor-sheet"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (readOnly) return;
          const total = validateDraft();
          if (total == null) return;
          // A filled 加新品項 row the user never confirmed with ＋ still counts.
          const pendingNewItem = (newItem.desc.trim() || newItem.amount)
            ? [{ ...newItem, id: newId(), desc: newItem.desc.trim() || '未命名品項' }]
            : [];
          const finalLineItems = [...(draft.lineItems || []), ...pendingNewItem];
          const nextOriginalCurrency = draft.originalCurrency || draft.currency || currencyForDate(draft.date);
          const nextCurrency = draft.currency || draft.originalCurrency || currencyForDate(draft.date);
          const prevOriginalCurrency = receipt?.originalCurrency || receipt?.currency;
          const currencyChanged = !receipt
            || (nextCurrency !== (receipt.currency || prevOriginalCurrency))
            || (nextOriginalCurrency !== prevOriginalCurrency);
          // Preserve original-currency amounts / pinned-rate rows: only rewrite originalAmount
          // when the currency changed or the field is missing. A same-currency total correction
          // still mirrors the new total.
          const totalCorrected = !receipt || total !== Number(receipt.total);
          // 原金額 mirrors 金額 only when both currencies are the same. A foreign originalAmount
          // (or a pinned-rate row) must survive a total correction — it lives in a different
          // currency the 金額 field does not edit.
          const originalMirrorsTotal = nextOriginalCurrency === nextCurrency;
          const keepOriginalAmount = !!receipt
            && receipt.originalAmount != null
            && !currencyChanged
            && (!totalCorrected || !originalMirrorsTotal);
          onSave({
            ...draft,
            store: draft.store.trim() || '未命名',
            total,
            originalAmount: keepOriginalAmount && receipt ? Number(receipt.originalAmount) : total,
            originalCurrency: nextOriginalCurrency,
            currency: nextCurrency,
            personId: draft.personId || first?.id || '',
            splitMode: draft.splitMode || 'shared',
            // 鎖定匯率：pinned 就 stamp 用户輸入嘅匯率；HKD 永遠 1:1 唔使 pin。
            // Existing receipts keep their saved rate until the user explicitly changes it.
            exchangeRate: editPerHkd,
            // Only an explicit monetary edit replaces the historical HKD snapshot.
            hkdAmount: totalCorrected || currencyChanged || editPerHkd !== Number(receipt?.exchangeRate)
              ? Math.round(total / editPerHkd)
              : receipt?.hkdAmount,
            exchangeRatePinned: draft.exchangeRatePinned && editCurrencyCode !== 'HKD' ? true : undefined,
            visibility: privacyEligible && draft.visibility === 'private' ? 'private' : undefined,
            // Photo replaced/deleted in this edit session must re-upload (or clear cloud path).
            ...(receipt?.photoThumb !== draft.photoThumb
              ? {
                _photoSyncedToSupabase: false,
                supabasePhotoPath: undefined,
                _photoSyncAttempts: 0,
                _photoSyncedToNotion: false,
                _photoBodyBlockAdded: false,
                notionFileUploadId: undefined,
              }
              : {}),
            lineItems: finalLineItems.length ? finalLineItems : undefined,
            itemsText: itemRowsMode
              ? (finalLineItems.length ? serializeLineItems(finalLineItems, editPrefix) : '')
              : draft.itemsText,
          });
        }}
      >
        <div className="modal-head">
          <h2 id="receipt-editor-title">{receipt ? (foreignOwned ? '旅伴紀錄' : '編輯紀錄') : '手動記一筆'}</h2>
          <button type="button" className="icon-btn" aria-label="關閉記帳視窗" onClick={onCancel}>×</button>
        </div>
        <div className="receipt-editor-fields">
        {foreignOwned && (
          <p className="muted field-hint" style={{ margin: '0 0 8px' }}>👤 呢筆由 {ownerLabel} 記錄，全團可見，但只有建立者可以修改或刪除。</p>
        )}

        <label>店名 / 項目
          <input data-modal-initial-focus value={draft.store} onChange={(e) => set('store', e.target.value)} disabled={readOnly} />
        </label>
        <div className="form-grid form-grid--pair">
          <label>日期
            <input ref={dateRef} aria-label="日期" type="date" value={draft.date} aria-required="true" aria-invalid={!!dateError} aria-describedby={dateError ? 'receipt-date-error' : undefined} onChange={(e) => set('date', e.target.value)} disabled={readOnly} />
            {dateError && <small id="receipt-date-error" className="receipt-field-error" role="alert">{dateError}</small>}
          </label>
          <label>時間
            <input type="time" value={draft.time || ''} onChange={(e) => set('time', e.target.value)} disabled={readOnly} />
          </label>
        </div>
        <div className="form-grid form-grid--pair">
          <label>金額
            <input ref={amountRef} aria-label="金額" type="text" inputMode="decimal" placeholder="例如 2,480" value={totalInput} disabled={readOnly} aria-required="true" aria-invalid={!!amountError} aria-describedby={amountError ? 'receipt-amount-error' : undefined} onChange={(e) => {
              setTotalInput(e.target.value);
            }} onBlur={() => setAmountTouched(true)} />
            {amountError && <small id="receipt-amount-error" className="receipt-field-error" role="alert">{amountError}</small>}
          </label>
          <label>貨幣
            {/* Explicit aria-label: a wrapping <label> gives the select an accessible name polluted
                with every <option> text (貨幣JPYHKD...), breaking exact a11y queries. */}
            <select aria-label="貨幣" value={draft.currency || draft.originalCurrency || currencyForDate(draft.date)} disabled={readOnly} onChange={(e) => {
              setDraft((d) => ({ ...d, originalCurrency: e.target.value, currency: e.target.value, exchangeRate: undefined, exchangeRatePinned: undefined }));
            }}>
              {SUPPORTED_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
          </label>
        </div>
        {editCurrencyCode !== 'HKD' && (() => {
          // Show the rate used by this draft, including an existing receipt's historical rate.
          const appFixed = settingsFixedRate(state, editCurrencyCode);
          const liveRate = knownLiveRate(state, editCurrencyCode);
          const pinRate = (rate: number) => {
            setRateInput(String(rate));
            setRateTouched(false);
            setDraft((d) => ({ ...d, exchangeRatePinned: true, exchangeRate: rate }));
          };
          const presets = [
            appFixed ? { key: 'settings', label: '設定固定匯率', rate: appFixed } : null,
            liveRate ? { key: 'live', label: '即時匯率', rate: liveRate } : null,
            editCurrencyCode === savedCurrency && receipt?.exchangeRate && Number(receipt.exchangeRate) > 0 ? { key: 'saved', label: '此單原有匯率', rate: Number(receipt.exchangeRate) } : null,
          ].filter((preset): preset is { key: string; label: string; rate: number } => !!preset)
            .filter((preset, index, list) => list.findIndex((other) => Math.abs(other.rate - preset.rate) < 1e-9) === index);
          const amountHkd = parsedTotal == null || invalidPinnedRate ? '—' : Math.round(parsedTotal / editPerHkd).toLocaleString('en-US');
          const autoRateLabel = savedPerHkd > 0 ? '此單原有匯率' : appFixed ? '設定固定匯率' : '即時匯率';
          return (
            <div className="receipt-rate-pin">
              <div className="receipt-rate-head">
                <span>匯率（1 HKD = {editCurrencyCode}）</span>
                <SegmentedControl ariaLabel="收據匯率" value={draft.exchangeRatePinned ? 'pinned' : 'auto'}
                  options={[{ value: 'auto', label: autoRateLabel }, { value: 'pinned', label: '鎖定匯率' }]}
                  onChange={(mode) => {
                    if (readOnly) return;
                    if (mode === 'pinned') pinRate(Number(draft.exchangeRate) > 0 ? Number(draft.exchangeRate) : currentPerHkd);
                    // Return to this receipt's original rate, or the setting for a new currency.
                    else setDraft((d) => ({ ...d, exchangeRatePinned: undefined, exchangeRate: editCurrencyCode === savedCurrency ? receipt?.exchangeRate : undefined }));
                  }} />
              </div>
              {draft.exchangeRatePinned ? (
                <div className="receipt-rate-locked">
                  <label className="receipt-rate-input">
                    <span>鎖定匯率</span>
                    <input ref={rateRef} aria-label={`鎖定匯率（1 HKD = ${editCurrencyCode}）`} type="text" inputMode="decimal" value={rateInput} disabled={readOnly} aria-required="true" aria-invalid={!!rateError} aria-describedby={rateError ? 'receipt-rate-error' : undefined} onBlur={() => setRateTouched(true)} onChange={(e) => {
                      setRateInput(e.target.value);
                      const val = validAmount(e.target.value);
                      set('exchangeRate', val != null && val > 0 && val <= 1_000_000 ? val : undefined);
                    }} />
                    {rateError && <small id="receipt-rate-error" className="receipt-field-error" role="alert">{rateError}</small>}
                  </label>
                  {presets.length > 0 && (
                    <div className="receipt-rate-presets" role="group" aria-label="快速選擇匯率">
                      {presets.map((preset) => (
                        <button key={preset.key} type="button" disabled={readOnly}
                          aria-pressed={Math.abs(Number(draft.exchangeRate) - preset.rate) < 1e-9}
                          onClick={() => pinRate(preset.rate)}>
                          <small>{preset.label}</small><b>{formatRate(preset.rate)}</b>
                        </button>
                      ))}
                    </div>
                  )}
                  <small className="muted field-hint">釘死咗 — 之後匯率點變呢張單都唔會改 · 折合約 HK$ {amountHkd}</small>
                </div>
              ) : (
                <p className="receipt-rate-current">
                  <b>{formatRate(editPerHkd)}</b>
                  <span>{autoRateLabel} · 折合約 HK$ {amountHkd}</span>
                </p>
              )}
            </div>
          );
        })()}
        <label>Booking Ref
          <input value={draft.bookingRef || ''} onChange={(e) => set('bookingRef', e.target.value)} placeholder="KNR358047 / booking id" disabled={readOnly} />
        </label>
        <div className="form-grid form-grid--pair">
          <label>類別
            <select value={draft.category} onChange={(e) => set('category', e.target.value as CategoryId)} disabled={readOnly}>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>支付
            <select value={draft.payment} onChange={(e) => set('payment', e.target.value as PaymentId)} disabled={readOnly}>
              <option value="">未提供付款方式</option>
              {PAYMENTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
        <div className="form-grid form-grid--pair">
          <label>付款人
            <select value={draft.personId || first?.id || ''} onChange={(e) => set('personId', e.target.value)} disabled={readOnly}>
              {persons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>分帳
            <select aria-label="分帳" value={draft.splitMode || 'shared'} onChange={(e) => set('splitMode', e.target.value as SplitMode)} disabled={readOnly}>
              <option value="shared">Shared</option>
              <option value="private">私人 / 代付</option>
            </select>
          </label>
        </div>
        {draft.splitMode === 'private' && (
          <label>受惠人
            <select aria-label="受惠人" value={draft.beneficiaryId || draft.personId || first?.id || ''} onChange={(e) => set('beneficiaryId', e.target.value)} disabled={readOnly}>
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
            disabled={!privacyEligible || readOnly}
            onChange={(e) => set('visibility', e.target.value === 'private' ? 'private' : undefined)}
          >
            <option value="trip">全團可見</option>
            <option value="private">🔒 只有自己</option>
          </select>
          {!privacyEligible && <small className="muted field-hint">揀「私人」分帳（冇代付對象）先可以收起呢筆</small>}
          {privacyEligible && draft.visibility === 'private' && <small className="muted field-hint">🔒 只會 sync 去你自己嘅戶口，唔會出現喺旅伴 app 或 Notion</small>}
        </label>
        <label>地址 / 地圖搜尋
          <input value={draft.address || ''} onChange={(e) => set('address', e.target.value)} placeholder="例：名古屋市中村区名駅4-6-25" disabled={readOnly} />
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
                  disabled={readOnly || invalidPinnedRate}
                  onCommit={(next) => updateItem(idx, next)}
                />
                <button type="button" className="icon-btn receipt-item-remove" aria-label={`刪除品項 ${idx + 1}`} disabled={readOnly} onClick={() => removeItem(idx)}>×</button>
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
                disabled={readOnly || invalidPinnedRate}
                onCommit={setNewItem}
              />
              <button type="button" className="icon-btn receipt-item-add" aria-label="新增品項" disabled={readOnly || (!newItem.desc.trim() && !newItem.amount)} onClick={appendNewItem}>＋</button>
            </div>
          </div>
        ) : (
          <label>品項
            <textarea value={draft.itemsText || ''} onChange={(e) => set('itemsText', e.target.value)} rows={6} disabled={readOnly} />
          </label>
        )}
        <label>備註
          <textarea value={draft.note || ''} onChange={(e) => set('note', e.target.value)} rows={3} disabled={readOnly} />
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
                    e.currentTarget.src = thumbSrc;
                  }
                }}
              />
            </button>
          )}
          <div className="photo-tool-buttons">
            {(draft.photoThumb || draft.photoUrl) && !readOnly && <button type="button" className="danger" onClick={() => setDraft((d) => ({
              ...d,
              photoThumb: '',
              photoUrl: '',
              _photoSyncedToSupabase: false,
              supabasePhotoPath: undefined,
              _photoSyncAttempts: 0,
              _photoSyncedToNotion: false,
              _photoBodyBlockAdded: false,
              notionFileUploadId: undefined,
            }))}>刪除相片</button>}
            {!readOnly && <button type="button" className="secondary" onClick={() => photoRef.current?.click()}>加入 / 更換收據相</button>}
            {onAddToItinerary && !readOnly && <button type="button" className="secondary" onClick={() => {
              const total = validateDraft();
              if (total == null) return;
              onAddToItinerary({ ...draft, store: draft.store.trim() || '未命名', total });
            }}>加入行程</button>}
          </div>
        </div>
        </div>
        <div className="modal-actions receipt-editor-actions">
          {receipt && onDelete && !readOnly
            ? <div className="receipt-delete-slot"><button type="button" className="danger" onClick={() => setShowDeleteConfirm(true)}>刪除</button></div>
            : null}
          <div className="receipt-final-actions">
            {readOnly
              ? <span className="muted" style={{ fontSize: '12px', alignSelf: 'center' }}>{viewerReadOnly ? '只可檢視（Viewer 權限）' : `由 ${ownerLabel} 記錄 · 只有建立者可以修改或刪除`}</span>
              : <GradientButton type="submit" className="text-sm">儲存</GradientButton>}
            <button type="button" className="secondary" onClick={onCancel}>取消</button>
          </div>
        </div>
      </form>
      {showDeleteConfirm && receipt && onDelete && (
        <div
          ref={deleteRef}
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
              <button type="button" className="secondary" autoFocus onClick={() => setShowDeleteConfirm(false)}>取消</button>
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
