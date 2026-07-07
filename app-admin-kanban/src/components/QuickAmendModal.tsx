import { useState } from 'react';
import { amendReceipt } from '../lib/adminApi';
import type { AdminSession, AdminReceiptCard } from '../lib/types';

const RECEIPT_STATUSES = new Set(['draft', 'pending', 'confirmed']);
const CURRENCY_RE = /^[A-Z]{3}$/;
const RECEIPT_CATEGORIES = ['transport', 'food', 'shopping', 'lodging', 'ticket', 'medicine', 'other'];
const RECEIPT_PAYMENTS = ['cash', 'credit', 'paypay', 'suica'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function QuickAmendModal({
  session,
  receipt,
  onClose,
  onRefresh,
}: {
  session: AdminSession;
  receipt: AdminReceiptCard;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [store, setStore] = useState(receipt.store);
  const [amount, setAmount] = useState(receipt.amount.toString());
  const [currency, setCurrency] = useState(receipt.currency);
  const [status, setStatus] = useState(receipt.status);
  const [recordDate, setRecordDate] = useState(receipt.recordDate || '');
  const [recordTime, setRecordTime] = useState((receipt.recordTime || '').slice(0, 5));
  const [category, setCategory] = useState(receipt.category || 'other');
  const [payment, setPayment] = useState(receipt.payment || 'cash');
  const [originalAmount, setOriginalAmount] = useState(receipt.originalAmount != null ? String(receipt.originalAmount) : '');
  const [originalCurrency, setOriginalCurrency] = useState(receipt.originalCurrency || '');
  const [exchangeRate, setExchangeRate] = useState(receipt.exchangeRate != null ? String(receipt.exchangeRate) : '');
  const [itemsText, setItemsText] = useState(receipt.itemsText || '');
  const [note, setNote] = useState(receipt.note || '');
  const [address, setAddress] = useState(receipt.address || '');
  const [bookingRef, setBookingRef] = useState(receipt.bookingRef || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    try {
      const trimmedStore = store.trim();
      if (!trimmedStore) throw new Error('Store name cannot be empty');
      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount < 0) throw new Error('Amount must be a finite non-negative number');
      const upperCurrency = currency.toUpperCase().trim();
      if (!CURRENCY_RE.test(upperCurrency)) throw new Error('Currency must be a 3-letter uppercase code');
      if (!RECEIPT_STATUSES.has(status)) throw new Error(`Status must be one of: ${[...RECEIPT_STATUSES].join(', ')}`);
      if (!DATE_RE.test(recordDate)) throw new Error('Date must be YYYY-MM-DD');
      if (originalAmount.trim() && (!Number.isFinite(Number(originalAmount)) || Number(originalAmount) < 0)) throw new Error('Original amount must be a non-negative number');
      if (originalCurrency.trim() && !CURRENCY_RE.test(originalCurrency.toUpperCase().trim())) throw new Error('Original currency must be a 3-letter code');
      if (exchangeRate.trim() && (!Number.isFinite(Number(exchangeRate)) || Number(exchangeRate) <= 0)) throw new Error('Exchange rate must be a positive number');
      
      await amendReceipt(session, receipt.id, {
        store: trimmedStore,
        amount: parsedAmount,
        currency: upperCurrency,
        status,
        recordDate,
        recordTime: recordTime.trim(),
        category,
        payment,
        originalAmount: originalAmount.trim() ? Number(originalAmount) : null,
        originalCurrency: originalCurrency.toUpperCase().trim() || null,
        exchangeRate: exchangeRate.trim() ? Number(exchangeRate) : null,
        itemsText,
        note,
        address,
        bookingRef,
      });
      onRefresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to amend receipt');
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content amend-modal">
        <h3 style={{ marginTop: 0 }}>Amend Receipt</h3>
        <div className="amend-grid">
          <label>Store Name <input value={store} onChange={e => setStore(e.target.value)} /></label>
          <label>Amount <input type="number" value={amount} onChange={e => setAmount(e.target.value)} /></label>
          <label>Currency <input value={currency} onChange={e => setCurrency(e.target.value)} /></label>
          <label>Status <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="draft">draft</option>
            <option value="pending">pending</option>
            <option value="confirmed">confirmed</option>
          </select></label>
          <label>Date <input type="date" value={recordDate} onChange={e => setRecordDate(e.target.value)} /></label>
          <label>Time <input type="time" value={recordTime} onChange={e => setRecordTime(e.target.value)} /></label>
          <label>Category <select value={category} onChange={e => setCategory(e.target.value)}>
            {RECEIPT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select></label>
          <label>Payment <select value={payment} onChange={e => setPayment(e.target.value)}>
            {RECEIPT_PAYMENTS.map(p => <option key={p} value={p}>{p}</option>)}
          </select></label>
          <label>Original Amount <input type="number" value={originalAmount} onChange={e => setOriginalAmount(e.target.value)} placeholder="optional" /></label>
          <label>Original Currency <input value={originalCurrency} onChange={e => setOriginalCurrency(e.target.value)} placeholder="e.g. JPY" /></label>
          <label>Exchange Rate <input type="number" step="any" value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} placeholder="optional" /></label>
          <label>Booking Ref <input value={bookingRef} onChange={e => setBookingRef(e.target.value)} placeholder="optional" /></label>
          <label className="amend-full">Items <textarea value={itemsText} onChange={e => setItemsText(e.target.value)} rows={2} /></label>
          <label className="amend-full">Note <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} /></label>
          <label className="amend-full">Address <input value={address} onChange={e => setAddress(e.target.value)} /></label>
        </div>
        {error && <p className="error-line">{error}</p>}
        <div className="modal-actions">
          <button className="primary-command" type="button" disabled={busy} onClick={() => void save()}>Save</button>
          <button className="ghost-command" type="button" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
