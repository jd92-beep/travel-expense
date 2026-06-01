import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { CalendarDays, Camera, ChevronDown, ChevronRight, Mail, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { Reveal, Toast } from '../components/ui';
import { activeTrip, scopedReceiptsForTrip } from '../domain/trip/normalize';
import { hasCredentialBrokerSession } from '../lib/credentialBroker';
import { hasDirectNotionToken } from '../lib/notion';
import { CATEGORIES } from '../lib/constants';
import type { AppState, CategoryId, Receipt, TripProfile } from '../lib/types';
import { ReceiptPhotoModal } from '../components/ReceiptPhotoModal';
import { VisualIcon } from '../components/VisualIcon';
import { categoryById, displayStore, fmt, getPersons, hkd, isPendingReceipt, safePhotoUrl, getReceiptHkdAmount, getReceiptTripAmount, getResolvedTripCurrency } from '../lib/domain';

function historyDateLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][parsed.getDay()];
  return `${parsed.getFullYear()}年${parsed.getMonth() + 1}月${parsed.getDate()}日（${weekday}）`;
}

export function History({
  state,
  setState,
  onImport,
  onHydrate,
  onOpen,
  onConfirmPending,
  onPull,
  cloudSyncAvailable = false,
}: {
  state: AppState;
  setState?: React.Dispatch<React.SetStateAction<AppState>>;
  onImport: (receipts: Receipt[]) => void;
  onHydrate?: (receipts: Receipt[], trips: TripProfile[]) => void;
  onOpen: (receipt: Receipt) => void;
  onConfirmPending: (receipt: Receipt) => void;
  onPull?: () => Promise<void>;
  cloudSyncAvailable?: boolean;
}) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | CategoryId>('all');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [viewPhoto, setViewPhoto] = useState<Receipt | null>(null);


  const trip = activeTrip(state);
  const resolvedTripCurrency = getResolvedTripCurrency(state, trip);
  const receipts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scopedReceiptsForTrip(state, trip)
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
  const pending = scopedReceiptsForTrip(state, trip).filter((r) => r.store?.startsWith('⏳ '));
  const people = getPersons(state);
  const categoryChips = [
    { id: 'all' as const, name: '全部', color: '#cf2626' },
    ...CATEGORIES.filter((item) => ['flight', 'lodging', 'food', 'transport', 'shopping', 'ticket', 'other'].includes(item.id)),
  ];
  const filterBadge = (category !== 'all' ? 1 : 0) + pending.length;
  const activeTripName = trip.name || state.tripName || '東京出張之旅';
  const handleSwitchTrip = (tripId: string) => {
    if (!setState) return;
    const target = state.trips?.find((t) => t.id === tripId && !t.archived);
    if (!target) return;

    setState((prev) => ({
      ...prev,
      activeTripId: tripId,
      trips: (prev.trips || []).map((item) => ({ ...item, active: item.id === tripId && !item.archived })),
      tripName: target.name,
      budget: target.budget ?? prev.budget,
      tripCurrency: target.currencies?.find((c) => c !== 'HKD') || prev.tripCurrency,
      customItinerary: target.itinerary || [],
      tripDateRange: { start: target.startDate, end: target.endDate }
    }));
  };

  async function handlePull(mode: 'manual' | 'auto' = 'manual') {
    if (!cloudSyncAvailable && !hasCredentialBrokerSession(state) && !hasDirectNotionToken()) {
      if (mode === 'manual') setStatus('未連線：請登入 Supabase 或重新解鎖 Credential Broker。');
      return;
    }
    setBusy(true);
    try {
      if (onPull) {
        await onPull();
        setStatus(`${mode === 'auto' ? '已自動' : '已'}從雲端同步。`);
      }
    } catch (error) {
      setStatus(`雲端 pull 失敗：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="japanese-washi-bg w-full min-h-screen px-4 pb-28 pt-6 relative overflow-y-auto history-screen">
      <div className="japanese-sun-decor" />
      <div className="japanese-sakura-decor" />
      <div className="stack w-full relative z-10">

      {status && <Toast tone={/失敗|未連線/i.test(status) ? 'warning' : 'success'}>{status}</Toast>}
      <div className="history-filter-deck history-filters">
        <label className="search-field">
          <Search size={16} />
          <input placeholder="搜尋店家、類別、標籤、金額..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="history-filter-button">
          <SlidersHorizontal size={19} aria-hidden="true" />
          <span>篩選</span>
          {filterBadge > 0 && <b>{filterBadge}</b>}
          <select aria-label="篩選類別" value={category} onChange={(e) => setCategory(e.target.value as 'all' | CategoryId)}>
            <option value="all">全部類別</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      <div className="history-chip-rail" aria-label="類別篩選">
        <button
          type="button"
          className="history-chip history-chip-control"
          onClick={() => setCategory('all')}
          aria-pressed={category === 'all'}
        >
          <SlidersHorizontal size={17} aria-hidden="true" />
          類別
        </button>
        {categoryChips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={`history-chip ${category === chip.id ? 'active' : ''}`}
            style={{ '--chip-color': chip.color } as CSSProperties}
            onClick={() => setCategory(chip.id)}
            aria-pressed={category === chip.id}
          >
            {chip.name}
          </button>
        ))}
      </div>
      {pending.length > 0 && (
        <section className="history-pending-banner card" aria-label="Email 待確認">
          <Mail size={30} aria-hidden="true" />
          <div>
            <h2>Email 待確認</h2>
            <strong>待確認：{pending.length} 筆郵件收據</strong>
            <p>已匯入，等待確認以完成記帳</p>
          </div>
          <button className="history-confirm-button" type="button" onClick={() => onConfirmPending(pending[0])}>
            查看並確認
          </button>
        </section>
      )}
      {Object.keys(groups).length === 0 && <p className="empty card">未有紀錄</p>}
      {Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0])).map(([date, items], groupIdx) => (
        <Reveal key={date} className="history-date-reveal" delay={Math.min(0.16, groupIdx * 0.018)}>
        <details className="card history-expandable-group" open>
          <summary className="section-head history-expandable-summary">
            <div className="history-date-title">
              <CalendarDays size={18} aria-hidden="true" />
              <h2>{historyDateLabel(date)}</h2>
              <span className="pill">{items.length} 筆</span>
            </div>
            <span className="history-date-total">{resolvedTripCurrency === 'JPY' ? '¥' : (resolvedTripCurrency + ' ')}{fmt(items.reduce((sum, item) => sum + getReceiptTripAmount(item, state, resolvedTripCurrency), 0))} · HKD ${fmt(items.reduce((sum, item) => sum + getReceiptHkdAmount(item, state), 0))}</span>
          </summary>
          <div className="history-record-stack">
            {items.map((r) => {
              const cat = categoryById(r.category);
              const person = people.find((p) => p.id === r.personId) || people[0];
              const photoSrc = safePhotoUrl(r.photoUrl, r.photoThumb);
              return (
                <div
                  key={r.id}
                  className="receipt-row history-ledger-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(r)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onOpen(r); }}
                >
                  <VisualIcon id={r.category as CategoryId} size="md" className="history-ledger-icon washi-nippon-stamp" />
                  <span className="receipt-main history-ledger-main">
                    <strong>
                      {isPendingReceipt(r) && <span className="history-pending-mini">pending</span>}
                      {displayStore(r)}
                    </strong>
                    <small>{[cat.name, r.date.slice(5).replace('-', '/'), r.region || r.regionSnapshot, person?.name].filter(Boolean).join(' · ')}</small>
                  </span>
                  <span className="history-photo-slot" aria-hidden={!photoSrc}>
                    {photoSrc ? (
                      <button
                        type="button"
                        className="history-photo-thumb"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setViewPhoto(r);
                        }}
                        aria-label={`查看 ${displayStore(r)} 收據相片`}
                      >
                        <img src={photoSrc} alt="" />
                      </button>
                    ) : (
                      <Camera size={24} />
                    )}
                  </span>
                  <span className="amount history-ledger-amount">
                    <strong>{r.currency === 'HKD' ? 'HK$' : (r.currency || '¥')}{fmt(r.total)}</strong>
                    <small>HKD ${fmt(getReceiptHkdAmount(r, state))}</small>
                  </span>
                  <ChevronRight className="history-row-chevron" size={21} aria-hidden="true" />
                </div>
              );
            })}
            <div className="history-day-subtotal">
              <span>當日小計</span>
              <strong>{resolvedTripCurrency === 'JPY' ? '¥' : (resolvedTripCurrency + ' ')}{fmt(items.reduce((sum, item) => sum + getReceiptTripAmount(item, state, resolvedTripCurrency), 0))} · HKD ${fmt(items.reduce((sum, item) => sum + getReceiptHkdAmount(item, state), 0))}</strong>
            </div>
          </div>
        </details>
        </Reveal>
      ))}
      </div>
      {viewPhoto && <ReceiptPhotoModal receipt={viewPhoto} onClose={() => setViewPhoto(null)} />}
    </section>
  );
}

// ReceiptPhotoModal removed - imported from shared components instead
