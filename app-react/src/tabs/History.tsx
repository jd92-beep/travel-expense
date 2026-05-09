import { useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { GlassCard, StatusPill, Toast } from '../components/ui';
import { activeTrip } from '../domain/trip/normalize';
import { hasCredentialBrokerSession } from '../lib/credentialBroker';
import { CATEGORIES } from '../lib/constants';
import { fmt } from '../lib/domain';
import type { AppState, CategoryId, Receipt, TripProfile } from '../lib/types';
import { ReceiptRow } from './Dashboard';

export function History({
  state,
  onImport,
  onHydrate,
  onOpen,
  onConfirmPending,
  onPull,
}: {
  state: AppState;
  onImport: (receipts: Receipt[]) => void;
  onHydrate?: (receipts: Receipt[], trips: TripProfile[]) => void;
  onOpen: (receipt: Receipt) => void;
  onConfirmPending: (receipt: Receipt) => void;
  onPull?: () => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | CategoryId>('all');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const trip = activeTrip(state);
  const receipts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.receipts
      .filter((r) => !r.tripId || r.tripId === trip.id)
      .filter((r) => category === 'all' || r.category === category)
      .filter((r) => !q || [r.store, r.note, r.itemsText, r.region, r.bookingRef, r.address].some((v) => String(v || '').toLowerCase().includes(q)))
      .slice()
      .reverse();
  }, [state.receipts, query, category, trip.id]);
  const groups = receipts.reduce<Record<string, Receipt[]>>((acc, r) => {
    (acc[r.date] ||= []).push(r);
    return acc;
  }, {});
  const pending = state.receipts.filter((r) => r.store?.startsWith('⏳ ') && (!r.tripId || r.tripId === trip.id));
  const total = receipts.reduce((sum, receipt) => sum + receipt.total, 0);

  async function handlePull(mode: 'manual' | 'auto' = 'manual') {
    if (!hasCredentialBrokerSession(state)) {
      if (mode === 'manual') setStatus('Credential Broker 未連線；已保留本機紀錄，未向 Notion 發送 request。');
      return;
    }
    setBusy(true);
    try {
      if (onPull) {
        await onPull();
        setStatus(`${mode === 'auto' ? '已自動' : '已'}從 Notion 同步。`);
      }
    } catch (error) {
      setStatus(`Notion pull 失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack">
      <GlassCard className="history-command">
        <div>
          <p className="eyebrow">History</p>
          <h2>紀錄中心</h2>
          <p className="muted">{receipts.length} 筆 · ¥{fmt(total)} · {Object.keys(groups).length} 日</p>
        </div>
        <StatusPill tone={pending.length ? 'warning' : 'ok'}>{pending.length ? `${pending.length} pending` : 'local ready'}</StatusPill>
        <button className="secondary" type="button" disabled={busy} onClick={() => handlePull('manual')}>
          {busy ? <RefreshCw size={18} className="spin" /> : <RefreshCw size={18} />} Pull Notion
        </button>
      </GlassCard>
      {status && <Toast tone={/失敗|未連線/i.test(status) ? 'warning' : 'success'}>{status}</Toast>}
      {pending.length > 0 && (
        <div className="card">
          <div className="section-head">
            <h2>Email 待確認</h2>
            <span className="pill hot">{pending.length} 筆</span>
          </div>
          {pending.map((r) => (
            <div className="pending-row" key={r.id}>
              <span>{r.store.replace(/^⏳\s*/, '')}</span>
              <button className="secondary" type="button" onClick={() => onConfirmPending(r)}>確認</button>
            </div>
          ))}
        </div>
      )}
      <div className="filters history-filters">
        <label className="search-field">
          <Search size={16} />
          <input placeholder="搜尋店名 / 備註 / 地區" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <select value={category} onChange={(e) => setCategory(e.target.value as 'all' | CategoryId)}>
          <option value="all">全部類別</option>
          {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {Object.keys(groups).length === 0 && <p className="empty card">未有紀錄</p>}
      {Object.entries(groups).map(([date, items]) => (
        <div className="card" key={date}>
          <div className="section-head">
            <h2>{date}</h2>
            <span className="pill">{items.length} 筆</span>
          </div>
          {items.map((r) => <ReceiptRow key={r.id} state={state} receipt={r} onOpen={onOpen} />)}
        </div>
      ))}
    </section>
  );
}
