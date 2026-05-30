import { useMemo, useState } from 'react';
import { ChevronDown, RefreshCw, Search, X } from 'lucide-react';
import { Reveal, Toast } from '../components/ui';
import { activeTrip, scopedReceiptsForTrip } from '../domain/trip/normalize';
import { hasCredentialBrokerSession } from '../lib/credentialBroker';
import { hasDirectNotionToken } from '../lib/notion';
import { CATEGORIES } from '../lib/constants';
import type { AppState, CategoryId, Receipt, TripProfile } from '../lib/types';
import { MagicCard } from '../components/ui/magic-card';
import { ShineBorder } from '../components/ui/shine-border';
import { GlareHover } from '../components/ui/glare-hover';
import { ReceiptRow } from './Dashboard';
import { ReceiptPhotoModal } from '../components/ReceiptPhotoModal';

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
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | CategoryId>('all');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [viewPhoto, setViewPhoto] = useState<Receipt | null>(null);
  const [isTitleDropdownOpen, setIsTitleDropdownOpen] = useState(false);
  const [isActionDropdownOpen, setIsActionDropdownOpen] = useState(false);
  
  const trip = activeTrip(state);
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
        <MagicCard className="history-command p-0 rounded-[24px] w-full relative border border-white/40 shadow-xl !overflow-visible z-20">
          {/* Background layers wrapper with overflow-hidden to keep rounded corners clipped perfectly */}
          <div className="absolute inset-0 rounded-[24px] overflow-hidden pointer-events-none z-0">
            <ShineBorder className="opacity-70" shineColor={['#4A90E2', '#D4A843']} borderWidth={2} />
            <div className="absolute inset-0 bg-gradient-to-br from-[#1E4D6B] via-[#4A90E2] to-[#D4A843] opacity-[0.15] mix-blend-multiply" />
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10" />
          </div>
          <div className="history-command-row relative z-10 flex flex-row justify-between items-center gap-2 p-4 sm:p-5 h-full w-full">
            <div className="relative min-w-0 flex-1">
              <div className="relative z-30">
                <button
                  className="history-title-button flex items-center gap-1 text-2xl font-bold text-blue-900 border-none bg-transparent focus:outline-none cursor-pointer hover:opacity-80 active:scale-98 transition-all p-0 min-w-0"
                  type="button"
                  onClick={() => setIsTitleDropdownOpen(!isTitleDropdownOpen)}
                >
                  <span className="truncate">紀錄中心</span>
                  <ChevronDown size={18} className={`text-blue-800/70 mt-0.5 transition-transform duration-200 shrink-0 ${isTitleDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {isTitleDropdownOpen && (
                  <div className="absolute top-8 left-0 w-64 bg-white/95 backdrop-blur-md rounded-2xl border border-white/80 shadow-2xl p-2 z-50 flex flex-col gap-1 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      選擇旅程 (Select Trip)
                    </div>
                    <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
                      {(state.trips || []).filter((t) => !t.archived).map((t) => {
                        const isActive = t.id === trip.id;
                        return (
                          <button
                            key={t.id}
                            className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-left transition-all border-none focus:outline-none cursor-pointer ${
                              isActive 
                                ? 'bg-blue-50 text-blue-900 font-bold' 
                                : 'hover:bg-slate-50 text-slate-700 bg-transparent'
                            }`}
                            onClick={() => {
                              setIsTitleDropdownOpen(false);
                              handleSwitchTrip(t.id);
                            }}
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm truncate">{t.name}</span>
                              <span className="text-[10px] text-slate-400 truncate">
                                {t.destinationSummary || '未設定目的地'} ({t.itinerary?.length || 0}天)
                              </span>
                            </div>
                            {isActive && (
                              <div className="w-2 h-2 rounded-full bg-blue-600 shrink-0 ml-2" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="history-command-actions flex items-center justify-end gap-2 shrink-0">
              {/* 右側切換旅程實體按鈕 */}
              <div className="relative z-30">
                <button
                  className="secondary history-trip-button bg-white/60 hover:bg-white/80 border border-white/80 backdrop-blur-md rounded-full px-3 py-2 font-semibold text-blue-900 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer focus:outline-none active:scale-95"
                  type="button"
                  onClick={() => setIsActionDropdownOpen(!isActionDropdownOpen)}
                >
                  <span>切換旅程</span>
                  <ChevronDown size={16} className={`text-blue-800/70 transition-transform duration-200 ${isActionDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {isActionDropdownOpen && (
                  <div className="absolute right-0 top-12 w-64 bg-white/95 backdrop-blur-md rounded-2xl border border-white/80 shadow-2xl p-2 z-50 flex flex-col gap-1 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      選擇旅程 (Select Trip)
                    </div>
                    <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
                      {(state.trips || []).filter((t) => !t.archived).map((t) => {
                        const isActive = t.id === trip.id;
                        return (
                          <button
                            key={t.id}
                            className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-left transition-all border-none focus:outline-none cursor-pointer ${
                              isActive 
                                ? 'bg-blue-50 text-blue-900 font-bold' 
                                : 'hover:bg-slate-50 text-slate-700 bg-transparent'
                            }`}
                            onClick={() => {
                              setIsActionDropdownOpen(false);
                              handleSwitchTrip(t.id);
                            }}
                          >
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm truncate">{t.name}</span>
                              <span className="text-[10px] text-slate-400 truncate">
                                {t.destinationSummary || '未設定目的地'} ({t.itinerary?.length || 0}天)
                              </span>
                            </div>
                            {isActive && (
                              <div className="w-2 h-2 rounded-full bg-blue-600 shrink-0 ml-2" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <button
                className="secondary history-refresh-button bg-white/60 hover:bg-white/80 border border-white/80 backdrop-blur-md rounded-full font-semibold text-blue-900 transition-all shadow-sm"
                type="button"
                disabled={busy}
                onClick={() => handlePull('manual')}
                aria-label="重新同步"
                title="重新同步"
              >
                <RefreshCw size={18} className={busy ? 'spin' : undefined} />
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
      {Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0])).map(([date, items], groupIdx) => (
        <Reveal key={date} className="history-date-reveal" delay={Math.min(0.16, groupIdx * 0.018)}>
        <details className="card history-expandable-group" open>
          <summary className="section-head history-expandable-summary">
            <h2>{date}</h2>
            <span className="pill">{items.length} 筆</span>
          </summary>
          <div className="history-record-stack">
            {items.map((r) => (
              <GlareHover
                key={r.id}
                className="history-record-glare"
                background="transparent"
                color="#D4A843"
                opacity={0.12}
                width="100%"
                playOnce
              >
                <ReceiptRow state={state} receipt={r} onOpen={onOpen} onViewPhoto={setViewPhoto} />
              </GlareHover>
            ))}
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
