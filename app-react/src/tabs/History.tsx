import { useMemo, useState } from 'react';
import { RefreshCw, Search, X } from 'lucide-react';
import { GlassCard, StatusPill, Toast } from '../components/ui';
import { activeTrip } from '../domain/trip/normalize';
import { hasCredentialBrokerSession } from '../lib/credentialBroker';
import { hasDirectNotionToken } from '../lib/notion';
import { CATEGORIES } from '../lib/constants';
import { fmt } from '../lib/domain';
import type { AppState, CategoryId, Receipt, TripProfile } from '../lib/types';
import { MagicCard } from '../components/ui/magic-card';
import { BorderBeam } from '../components/ui/border-beam';
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
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);
  const trip = activeTrip(state);
  const receipts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.receipts
      .filter((r) => !r.tripId || r.tripId === trip.id)
      .filter((r) => category === 'all' || r.category === category)
      .filter((r) => !q || [r.store, r.note, r.itemsText, r.region, r.bookingRef, r.address].some((v) => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => {
        const dateA = a.date || '0000-00-00';
        const dateB = b.date || '0000-00-00';
        const dateDiff = dateB.localeCompare(dateA);
        if (dateDiff !== 0) return dateDiff;
        
        const timeA = a.time || '00:00';
        const timeB = b.time || '00:00';
        return timeB.localeCompare(timeA);
      });
  }, [state.receipts, query, category, trip.id]);
  const groups = receipts.reduce<Record<string, Receipt[]>>((acc, r) => {
    (acc[r.date] ||= []).push(r);
    return acc;
  }, {});
  const pending = state.receipts.filter((r) => r.store?.startsWith('⏳ ') && (!r.tripId || r.tripId === trip.id));
  const total = receipts.reduce((sum, receipt) => sum + receipt.total, 0);

  async function handlePull(mode: 'manual' | 'auto' = 'manual') {
    if (!hasCredentialBrokerSession(state) && !hasDirectNotionToken()) {
      if (mode === 'manual') setStatus('未連線：請到 Settings → Notion Sync 輸入 Notion Integration Token，或連接 Credential Broker。');
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
      <MagicCard className="history-command p-0 rounded-[24px] overflow-hidden w-full relative border border-white/40 shadow-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1E4D6B] via-[#4A90E2] to-[#D4A843] opacity-[0.15] mix-blend-multiply pointer-events-none" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none" />
        <BorderBeam borderWidth={2} colorFrom="#4A90E2" colorTo="#D4A843" className="opacity-60" />
        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-6 h-full w-full">
          <div>
            <p className="eyebrow text-blue-800/70">Record</p>
            <h2 className="text-2xl font-bold text-blue-900 mb-1">紀錄中心</h2>
            <p className="muted text-sm">{receipts.length} 筆 · ¥{fmt(total)} · {Object.keys(groups).length} 日</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusPill tone={pending.length ? 'warning' : 'ok'}>{pending.length ? `${pending.length} pending` : 'local ready'}</StatusPill>
            <button className="secondary bg-white/60 hover:bg-white/80 border border-white/80 backdrop-blur-md rounded-full px-4 py-2 font-semibold text-blue-900 transition-all shadow-sm" type="button" disabled={busy} onClick={() => handlePull('manual')}>
              {busy ? <RefreshCw size={18} className="spin" /> : <RefreshCw size={18} />} Pull Notion
            </button>
          </div>
        </div>
      </MagicCard>
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
      {Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0])).map(([date, items]) => (
        <div className="card" key={date}>
          <div className="section-head">
            <h2>{date}</h2>
            <span className="pill">{items.length} 筆</span>
          </div>
          {items.map((r) => <ReceiptRow key={r.id} state={state} receipt={r} onOpen={onOpen} onViewPhoto={setViewPhoto} />)}
        </div>
      ))}
      {viewPhoto && (
        <div className="modal-backdrop" role="presentation" onClick={() => setViewPhoto(null)} style={{ zIndex: 9999 }}>
          <div className="modal flex justify-center items-center p-2 bg-transparent shadow-none" onClick={(e) => e.stopPropagation()}>
            <div className="relative max-w-full max-h-[90vh]">
              <img src={viewPhoto} alt="Receipt" className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl" />
              <button 
                className="icon-btn absolute -top-4 -right-4 bg-black/50 text-white hover:bg-black/70 transition-colors" 
                type="button" 
                onClick={() => setViewPhoto(null)}
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
