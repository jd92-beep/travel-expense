import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronRight, CloudSun, MapPin, Plus, X } from 'lucide-react';
import { motion } from 'motion/react';
import { AvatarBadge } from '../components/AvatarBadge';
import { ActionSheet, GlassCard, MetricCard } from '../components/ui';
import { AnimatedCircularProgressBar } from '../components/ui/animated-circular-progress-bar';
import { BorderBeam } from '../components/ui/border-beam';
import { BlurFade } from '../components/ui/blur-fade';
import { MagicCard } from '../components/ui/magic-card';
import { NumberTicker } from '../components/ui/number-ticker';

import { TextAnimate } from '../components/ui/text-animate';
import { ShimmerButton } from '../components/ui/shimmer-button';
import { VisualIcon } from '../components/VisualIcon';
import { categoryById, displayStore, fmt, getItinerary, getReceiptPhase, getPersons, hkd, isPendingReceipt, mapsUrl, receiptRegion, safeExternalUrl, todayForReceipts } from '../lib/domain';
import { categoryIconId } from '../lib/iconManifest';
import { activeTrip } from '../domain/trip/normalize';
import type { AppState, ItinerarySpot, Receipt, TabId } from '../lib/types';

type DashboardSheet =
  | { kind: 'day-receipts' }
  | { kind: 'spot'; spot: ItinerarySpot };

function displayDateRange(startDate: string, endDate: string) {
  const fmtDate = (date: string) => {
    const parsed = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return date;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
  };
  return `${fmtDate(startDate)} – ${fmtDate(endDate)}`;
}

function weekdayLabel(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(parsed);
}

function getBudgetRingColors(pct: number) {
  if (pct > 100) return { primary: '#FF453A', secondary: '#FF453A40' };
  if (pct >= 80) return { primary: '#FF9F0A', secondary: '#FF9F0A40' };
  if (pct >= 50) return { primary: '#32ADE6', secondary: '#32ADE640' };
  return { primary: '#34C759', secondary: '#34C75940' };
}

function tripLength(startDate: string, endDate: string, fallback: number) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return Math.max(1, fallback);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

export function Dashboard({ state, onOpen, onTab, onManual }: { state: AppState; onOpen: (receipt: Receipt) => void; onTab: (tab: TabId) => void; onManual: () => void }) {
  const [sheet, setSheet] = useState<DashboardSheet | null>(null);
  const [titleStuck, setTitleStuck] = useState(false);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);
  const titleSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = titleSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setTitleStuck(!entry.isIntersecting),
      { rootMargin: '-1px 0px 0px 0px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const trip = activeTrip(state);
  const itinerary = getItinerary(state);
  const tripReceipts = useMemo(() => state.receipts.filter((r) => !r.tripId || r.tripId === trip.id), [state.receipts, trip.id]);
  const today = todayForReceipts(state);
  const flipped = !!state.statsIncludeTransportLodging;
  const dailyReceipts = tripReceipts
    .filter((r) => r.date === today)
    .filter((r) => flipped || (r.category !== 'flight' && r.category !== 'lodging'));
  const totalReceipts = flipped
    ? tripReceipts.filter((r) => r.category !== 'flight' && r.category !== 'lodging')
    : tripReceipts;
  const todayTotal = dailyReceipts.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const total = totalReceipts.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const prepReceipts = tripReceipts.filter((r) => getReceiptPhase(state, r) === 'prep');
  const postReceipts = tripReceipts.filter((r) => getReceiptPhase(state, r) === 'post');
  const pending = tripReceipts.filter(isPendingReceipt);
  const day = itinerary.find((d) => d.date === today) || itinerary[0];
  const persons = getPersons(state);
  const dailyBudget = Math.round((Number(state.budget) || 0) / Math.max(1, itinerary.length));
  const overDaily = dailyBudget > 0 && todayTotal > dailyBudget;
  const totalForBudget = total;
  const rawBudgetPct = state.budget > 0 ? totalForBudget / state.budget * 100 : 0;
  const budgetPct = Math.min(100, rawBudgetPct);
  const budgetColors = getBudgetRingColors(rawBudgetPct);
  const prepTotal = prepReceipts.reduce((s, r) => s + r.total, 0);
  const postTotal = postReceipts.reduce((s, r) => s + r.total, 0);
  const dailyAverage = Math.round(totalForBudget / Math.max(1, itinerary.length));
  const spendDays = new Set(totalReceipts.map((r) => r.date)).size;
  const recentReceipts = tripReceipts.slice().sort((a, b) => `${b.date} ${b.time || ''}`.localeCompare(`${a.date} ${a.time || ''}`));
  const length = tripLength(trip.startDate, trip.endDate, itinerary.length);
  const daySpots = (day?.spots || []).slice(0, 4);
  const tripCurrency = trip.currencies[0] || state.tripCurrency || 'JPY';

  return (
    <section className="stack dashboard-screen">
      {pending.length > 0 && <button className="notice notice-button" type="button" onClick={() => onTab('history')}>有 {pending.length} 筆 email 待確認，tap 去紀錄 tab 處理。</button>}
      <section className="trip-portrait" aria-label="旅程總覽">
        <div ref={titleSentinelRef} style={{ height: '1px', marginTop: '-1px' }} aria-hidden="true" />
        <motion.div layout className={`trip-title-row${titleStuck ? ' is-stuck' : ''}`}>
          <motion.div layout style={{ originX: 0, originY: 0 }}>
            <motion.button layout className="trip-title-button" type="button" onClick={() => onTab('settings')}>
              <motion.span layout>{trip.name}</motion.span>
              <ChevronDown size={20} />
            </motion.button>
            <motion.p layout>{displayDateRange(trip.startDate, trip.endDate)} ({length} days)</motion.p>
          </motion.div>
          <motion.button layout className="calendar-float" type="button" aria-label="開啟行程" onClick={() => onTab('timeline')}>
            <CalendarDays size={22} />
          </motion.button>
        </motion.div>

        <MagicCard className="dashboard-budget p-0 overflow-hidden w-full relative rounded-[40px] border border-white/20 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
          {/* Futuristic Cyberpunk / Glassmorphism Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#0B0F19] via-[#1A1025] to-[#0A1929] opacity-95" />
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 mix-blend-color-dodge" />
          
          {/* Glowing Orbs */}
          <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full bg-blue-500/20 blur-[80px] mix-blend-screen" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] rounded-full bg-purple-500/20 blur-[80px] mix-blend-screen" />

          <BorderBeam borderWidth={2} colorFrom="#38BDF8" colorTo="#C084FC" duration={10} className="opacity-80" />

          <div className="relative z-10 flex flex-col justify-between min-h-[500px] w-full p-6 sm:p-8">
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1">
                <span className="text-blue-300 font-bold uppercase tracking-[0.25em] text-[10px] sm:text-[12px] bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20 w-max shadow-[0_0_10px_rgba(56,189,248,0.2)]">Total Budget</span>
                <strong className="text-white drop-shadow-[0_0_15px_rgba(56,189,248,0.6)] mt-2">
                  <NumberTicker value={state.budget} prefix="¥" className="text-[32px] sm:text-[44px] font-black tracking-tighter" />
                </strong>
                <small className="text-blue-200/60 font-medium tracking-wider">HK$ {fmt(hkd(state.budget, state))}</small>
              </div>
              
              <div className="flex flex-col gap-1 items-end">
                <span className="text-purple-300 font-bold uppercase tracking-[0.25em] text-[10px] sm:text-[12px] bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20 w-max shadow-[0_0_10px_rgba(192,132,252,0.2)]">Spent</span>
                <strong className="text-white drop-shadow-[0_0_15px_rgba(192,132,252,0.6)] mt-2">
                  <NumberTicker value={totalForBudget} prefix="¥" className="text-[32px] sm:text-[44px] font-black tracking-tighter" />
                </strong>
                <small className="text-purple-200/60 font-medium tracking-wider">HK$ {fmt(hkd(totalForBudget, state))}</small>
              </div>
            </div>

            <motion.div
              whileTap={{ scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              className="cursor-pointer relative z-10 flex-1 flex items-center justify-center mt-8 mb-4 w-full"
              role="img"
              aria-label={`spent ${Math.round(rawBudgetPct)}%`}
            >
              {/* Massive Outer Glow matching the primary color */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] max-w-[500px] rounded-full blur-[70px] opacity-30 mix-blend-plus-lighter" style={{ background: budgetColors.primary }} />
              
              <AnimatedCircularProgressBar
                value={budgetPct}
                gaugePrimaryColor={budgetColors.primary}
                gaugeSecondaryColor="rgba(255,255,255,0.05)"
                className="w-[90%] sm:w-[85%] max-w-[400px] aspect-square drop-shadow-[0_0_40px_rgba(0,0,0,0.8)]"
              >
                <div className="flex flex-col items-center justify-center bg-black/30 backdrop-blur-xl rounded-full w-[82%] h-[82%] border border-white/10 shadow-[inset_0_0_30px_rgba(255,255,255,0.05)]">
                  <span className="font-mono text-[76px] sm:text-[96px] font-black leading-none text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50 drop-shadow-2xl tracking-tighter">
                    {Math.round(rawBudgetPct)}<span className="text-[36px] sm:text-[46px] text-white/70">%</span>
                  </span>
                  <span className="text-[14px] sm:text-[18px] font-bold text-white/60 mt-3 tracking-[0.5em] uppercase">Used</span>
                </div>
              </AnimatedCircularProgressBar>
            </motion.div>
          </div>
        </MagicCard>
        <div className="hero-handle" aria-hidden="true" />
      </section>

      <div className="metric-grid dashboard-metrics">
        <MetricCard label="今日" value={`¥${fmt(todayTotal)}`} detail={`HK$ ${fmt(hkd(todayTotal, state))} · ${dailyReceipts.length} 筆`} tone={overDaily ? 'danger' : 'accent'} />
        <MetricCard label="總消費" value={`¥${fmt(total)}`} detail={`HK$ ${fmt(hkd(total, state))} · ${totalReceipts.length} 筆`} />
        <MetricCard label="日均" value={`¥${fmt(dailyAverage)}`} detail={`${spendDays} 個有消費日 · 上限 ¥${fmt(dailyBudget)}`} tone={overDaily ? 'danger' : 'neutral'} />
        <MetricCard label="準備階段" value={`¥${fmt(prepTotal)}`} detail={`${prepReceipts.length} 筆行前支出 · ${tripCurrency}`} tone="success" />
      </div>

      <GlassCard className="today-itinerary-card">
        <div className="section-head today-head">
          <div>
            <p className="eyebrow">今日行程</p>
            <h2>Today · {weekdayLabel(today)}</h2>
          </div>
          <span className="weather-chip"><CloudSun size={22} /> 行程天氣</span>
        </div>
        <div className="today-rail">
          {daySpots.length ? daySpots.map((spot) => {
            const cat = categoryById(spot.type);
            const matchedReceipt = dailyReceipts.find((r) => displayStore(r).toLowerCase().includes(spot.name.toLowerCase()) || spot.name.toLowerCase().includes(displayStore(r).toLowerCase()));
            return (
              <BlurFade key={`${spot.time}-${spot.name}`} delay={0.02} duration={0.28} inView>
                <button className="today-line-item" type="button" onClick={() => setSheet({ kind: 'spot', spot })}>
                  <span className="line-time">{spot.time || '--:--'}</span>
                  <i className="line-dot" aria-hidden="true" />
                  <span className="line-card">
                    <VisualIcon id={categoryIconId(spot.type)} label={cat.name} className="line-icon" size="lg" />
                    <span className="line-copy">
                      <strong>{spot.name}</strong>
                      <small>{spot.note || spot.address || cat.name}</small>
                    </span>
                    {matchedReceipt ? <b>¥{fmt(matchedReceipt.total)}</b> : <ChevronRight size={20} />}
                  </span>
                </button>
              </BlurFade>
            );
          }) : <p className="empty">今日未有行程。你可以喺設定加入 Trip Update。</p>}
        </div>
        <button className="view-itinerary" type="button" onClick={() => onTab('timeline')}>
          View full itinerary <ChevronDown size={18} />
        </button>
      </GlassCard>

      <GlassCard className="recent-expenses-card">
        <div className="section-head recent-head">
          <h2><TextAnimate animation="blurInUp" by="character" duration={0.6} delay={0.1}>Recent Expenses</TextAnimate></h2>
          <button className="link-button" type="button" onClick={() => onTab('history')}>View all</button>
        </div>
        <div className="recent-list">
          {recentReceipts.length ? recentReceipts.slice(0, 3).map((r, index) => (
            <BlurFade key={r.id} delay={index * 0.04} duration={0.26} inView>
              <ReceiptRow state={state} receipt={r} onOpen={onOpen} onViewPhoto={setViewPhoto} />
            </BlurFade>
          )) : <p className="empty">暫時未有支出紀錄。</p>}
        </div>
        <ShimmerButton
          shimmerColor="#d39a29"
          shimmerSize="0.15em"
          shimmerDuration="2s"
          borderRadius="16px"
          background="linear-gradient(145deg, #d94132, #c43024)"
          className="add-expense-wide shimmer-washi"
          onClick={onManual}
        >
          <span className="flex items-center gap-2">
            <Plus size={24} />
            Add Expense
          </span>
        </ShimmerButton>
      </GlassCard>

      {overDaily && (
        <div className="notice">
          今日已超過日均上限：¥{fmt(todayTotal)} / ¥{fmt(dailyBudget)}
        </div>
      )}
      {prepReceipts.length > 0 && (
        <div className="card prep-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Prep Summary</p>
              <h2>行前支出 ¥{fmt(prepTotal)}</h2>
            </div>
            <button className="secondary" type="button" onClick={onManual}>+ 手動記一筆</button>
          </div>
          {prepReceipts.slice(-3).reverse().map((r) => <ReceiptRow key={r.id} state={state} receipt={r} onOpen={onOpen} onViewPhoto={setViewPhoto} />)}
        </div>
      )}
      {postReceipts.length > 0 && (
        <div className="card prep-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Post Trip</p>
              <h2>返程後支出 ¥{fmt(postTotal)}</h2>
            </div>
            <span className="pill">{postReceipts.length} 筆</span>
          </div>
          {postReceipts.slice(-3).reverse().map((r) => <ReceiptRow key={r.id} state={state} receipt={r} onOpen={onOpen} onViewPhoto={setViewPhoto} />)}
        </div>
      )}
      {persons.length > 1 && (
        <div className="card">
          <h2>付款人概覽</h2>
          <div className="person-grid">
            {persons.map((p) => {
              const paid = tripReceipts.filter((r) => (r.personId || persons[0].id) === p.id).reduce((s, r) => s + r.total, 0);
              return <div key={p.id} className="person-card"><AvatarBadge person={p} showName /><b>¥{fmt(paid)}</b></div>;
            })}
          </div>
        </div>
      )}
      <div className="card">
        <div className="section-head">
          <h2>今日紀錄</h2>
          <button className="secondary compact" type="button" onClick={() => setSheet({ kind: 'day-receipts' })}>{dailyReceipts.length} 筆</button>
        </div>
        {dailyReceipts.length ? dailyReceipts.slice().reverse().map((r) => <ReceiptRow key={r.id} state={state} receipt={r} onOpen={onOpen} onViewPhoto={setViewPhoto} />) : <p className="empty">今日仲未有紀錄。</p>}
      </div>
      {sheet && (
        <div className="modal-backdrop" role="presentation" onClick={() => setSheet(null)}>
          <section className="modal dashboard-sheet" role="dialog" aria-modal="true" aria-label={sheet.kind === 'spot' ? '行程詳情' : '今日紀錄'} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{sheet.kind === 'spot' ? '行程詳情' : `${today} 紀錄`}</h2>
              <button className="icon-btn" type="button" aria-label="關閉" onClick={() => setSheet(null)}><X size={18} /></button>
            </div>
            {sheet.kind === 'spot' ? (
              <div className="stack">
                <div className="spot-detail">
                  <VisualIcon id={categoryIconId(sheet.spot.type)} label={categoryById(sheet.spot.type).name} />
                  <div>
                    <p className="eyebrow">{sheet.spot.time || '未設定時間'}</p>
                    <h3>{sheet.spot.name}</h3>
                    {sheet.spot.note && <p>{sheet.spot.note}</p>}
                    {sheet.spot.address && <p className="muted">{sheet.spot.address}</p>}
                  </div>
                </div>
                <ActionSheet>
                  <a className="secondary" href={safeExternalUrl(sheet.spot.mapUrl, mapsUrl(sheet.spot.name, sheet.spot.address))} target="_blank" rel="noreferrer"><MapPin size={18} /> 開地圖</a>
                  <button className="secondary" type="button" onClick={() => { setSheet(null); onTab('timeline'); }}><CalendarDays size={18} /> 去 Timeline 編輯</button>
                </ActionSheet>
              </div>
            ) : (
              <div className="stack">
                {dailyReceipts.length ? dailyReceipts.slice().reverse().map((r) => (
                  <ReceiptRow key={r.id} state={state} receipt={r} onOpen={(receipt) => { setSheet(null); onOpen(receipt); }} onViewPhoto={(url) => { setSheet(null); setViewPhoto(url); }} />
                )) : <p className="empty">今日仲未有紀錄。</p>}
                <button className="primary" type="button" onClick={() => { setSheet(null); onManual(); }}><Plus size={18} /> 新增今日紀錄</button>
              </div>
            )}
          </section>
        </div>
      )}
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

export function ReceiptRow({ state, receipt, onOpen, onViewPhoto }: { state: AppState; receipt: Receipt; onOpen: (receipt: Receipt) => void; onViewPhoto?: (url: string) => void }) {
  const cat = categoryById(receipt.category);
  const persons = getPersons(state);
  const person = persons.find((p) => p.id === (receipt.personId || persons[0].id)) || persons[0];
  const beneficiary = receipt.splitMode === 'private' && receipt.beneficiaryId && receipt.beneficiaryId !== receipt.personId
    ? persons.find((p) => p.id === receipt.beneficiaryId)
    : null;
  const photoSrc = receipt.photoUrl || (receipt.photoThumb ? `data:image/jpeg;base64,${receipt.photoThumb}` : '');
  return (
    <div className="receipt-row" role="button" tabIndex={0} onClick={() => onOpen(receipt)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(receipt); }}>
      <VisualIcon id={categoryIconId(receipt.category)} label={cat.name} className="cat" />
      <span className="receipt-main">
        <strong>
          {isPendingReceipt(receipt) && <VisualIcon id="pending" size="sm" className="inline-visual-icon" />}
          {beneficiary && <VisualIcon id="gift" size="sm" className="inline-visual-icon" />}
          {!beneficiary && receipt.splitMode === 'private' && <VisualIcon id="private" size="sm" className="inline-visual-icon" />}
          {displayStore(receipt)}
          {photoSrc && (
            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onViewPhoto ? onViewPhoto(photoSrc) : window.open(photoSrc, '_blank', 'noopener,noreferrer'); }} style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, margin: 0 }}>
              <VisualIcon id="photo" size="sm" className="inline-visual-icon row-badge" />
            </button>
          )}
        </strong>
        <small>
          {[receipt.time, cat.name, receiptRegion(state, receipt), person.name, beneficiary ? `代 ${beneficiary.name}` : '', receipt.bookingRef ? `編號 ${receipt.bookingRef}` : ''].filter(Boolean).join(' · ')}
        </small>
        {receipt.address && <a className="map-link" href={mapsUrl(displayStore(receipt), receipt.address)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>地圖：{receipt.address}</a>}
      </span>
      <span className="amount">¥{fmt(receipt.total)}<small>HK$ {fmt(hkd(receipt.total, state))}</small></span>
    </div>
  );
}
