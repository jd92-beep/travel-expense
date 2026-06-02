import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'motion/react';
import { BarChart3, PieChart, ReceiptText, TrendingUp, Trophy, Users, WalletCards } from 'lucide-react';
import { CATEGORIES, PAYMENTS } from '../lib/constants';
import { activeTrip, scopedReceiptsForTrip } from '../domain/trip/normalize';
import { 
  categoryById, 
  computeSettlements, 
  displayStore, 
  fmt, 
  getItinerary, 
  getPersons, 
  hkd,
  getResolvedTripCurrency,
  getReceiptHkdAmount,
  getReceiptTripAmount
} from '../lib/domain';
import type { AppState, CategoryId, PaymentId, Receipt } from '../lib/types';
import { EmptyState, GlassCard, StatusPill } from '../components/ui';
import { AvatarBadge } from '../components/AvatarBadge';
import { ShineBorder } from '../components/ui/shine-border';
import { MagicCard } from '../components/ui/magic-card';
import { NumberTicker } from '../components/ui/number-ticker';
import { AnimatedGradientText } from '../components/ui/animated-gradient-text';
import { GlareHover } from '../components/ui/glare-hover';
import { RetroGrid } from '../components/ui/retro-grid';
import { VisualIcon } from '../components/VisualIcon';
import { categoryIconId } from '../lib/iconManifest';
import '../styles/stats.css';

type StatBucket = { id: string; name: string; color: string; total: number; totalHkd: number; icon?: string };

export function Stats({ state, updateState }: { state: AppState; updateState: (patch: Partial<AppState>) => void }) {
  const trip = activeTrip(state);
  const scopedState = { ...state, receipts: scopedReceiptsForTrip(state, trip) };
  const settlement = computeSettlements(scopedState);
  const persons = getPersons(state);
  const itinerary = getItinerary(state);
  const resolvedTripCurrency = getResolvedTripCurrency(state, trip);

  const activeRate = Math.max(
    0.1,
    Number(state.rateTable?.[resolvedTripCurrency]?.perHkd) || 
    (resolvedTripCurrency === 'JPY' ? Number(state.rate) : undefined) || 
    20.36
  );

  const tripCurrencySymbol = (() => {
    switch (resolvedTripCurrency.toUpperCase()) {
      case 'JPY': return '¥';
      case 'HKD': return 'HK$';
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'TWD': return 'NT$';
      case 'KRW': return '₩';
      case 'GBP': return '£';
      case 'CNY': return '¥';
      case 'THB': return '฿';
      default: return resolvedTripCurrency + ' ';
    }
  })();

  const analysisReceipts = scopedState.receipts.filter((r) => state.statsIncludeTransportLodging || !isBigTripItem(r));
  
  // 基於多貨幣精確對齊計算
  const catTotals = categoryTotals(analysisReceipts, (r) => getReceiptHkdAmount(r, state), (r) => getReceiptTripAmount(r, state, resolvedTripCurrency));
  const payTotals = paymentTotals(analysisReceipts, (r) => getReceiptHkdAmount(r, state), (r) => getReceiptTripAmount(r, state, resolvedTripCurrency));
  
  const analysisTotal = analysisReceipts.reduce((s, r) => s + getReceiptTripAmount(r, state, resolvedTripCurrency), 0);
  const analysisTotalHkd = analysisReceipts.reduce((s, r) => s + getReceiptHkdAmount(r, state), 0);

  const transferTotal = settlement.transfers.reduce((s, t) => s + t.amount, 0);
  const transferTotalHkd = Math.round(transferTotal / activeRate);

  const privateTotal = settlement.privateByOwner.reduce((s, n) => s + n, 0);
  const privateTotalHkd = Math.round(privateTotal / activeRate);

  const sharedTotalHkd = Math.round(settlement.sharedTotal / activeRate);

  const maxPersonTotal = Math.max(1, ...persons.map((_, i) => settlement.sharedByPayer[i] + settlement.privateByOwner[i]));
  
  const topReceipts = scopedState.receipts
    .filter((r) => state.top10IncludeBigItems || !isFlightOrHotelItem(r))
    .slice()
    .sort((a, b) => getReceiptHkdAmount(b, state) - getReceiptHkdAmount(a, state))
    .slice(0, 10);

  const trend = Object.entries(analysisReceipts.reduce<Record<string, number>>((acc, r) => {
    acc[r.date] = (acc[r.date] || 0) + getReceiptTripAmount(r, state, resolvedTripCurrency);
    return acc;
  }, {})).sort(([a], [b]) => a.localeCompare(b));

  const tripDayCount = Math.max(1, itinerary.length || trend.length);
  
  const budgetHkd = Math.round(hkd(state.budget, state));
  const dailyBudget = Math.round((Number(state.budget) || 0) / tripDayCount);
  const dailyBudgetHkd = Math.round(budgetHkd / tripDayCount);

  const dailyAverage = Math.round(analysisTotal / tripDayCount);
  const dailyAverageHkd = Math.round(analysisTotalHkd / tripDayCount);

  const overBudgetDays = trend.filter(([, total]) => dailyBudget > 0 && total > dailyBudget).length;

  return (
    <section className="japanese-washi-bg w-full min-h-screen px-4 pb-28 pt-6 relative overflow-y-auto stats-tab stats-cockpit stats-screen" aria-label="分帳統計中心">
      <div className="japanese-sun-decor" />
      <div className="japanese-sakura-decor" />
      <div className="stack w-full relative z-10">
      <MagicCard className="stats-command p-0 rounded-[24px] overflow-hidden relative border border-white/40 shadow-xl w-full">
        <ShineBorder className="opacity-70" shineColor={['#C23B5E', '#1E4D6B']} borderWidth={2} />
        <RetroGrid className="stats-retro-grid" opacity={0.22} cellSize={48} angle={64} lightLineColor="rgba(30,77,107,.24)" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#C23B5E] via-[#D4A843] to-[#1E4D6B] opacity-[0.15] mix-blend-multiply pointer-events-none" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none" />
        <div className="stats-command-inner relative z-10 h-full w-full">
          <div className="stats-command-copy flex-1 min-w-0">
            <div className="stats-command-title-row">
              <h2 className="stats-command-title text-2xl font-bold text-red-900">
                <AnimatedGradientText colorFrom="#C23B5E" colorTo="#1E4D6B" speed={1.1}>預算使用分析</AnimatedGradientText>
              </h2>
              <span className="stats-record-pill">
                <StatusPill tone="info" icon={<ReceiptText size={14} />}>{scopedState.receipts.length} 筆紀錄</StatusPill>
              </span>
            </div>
          </div>
          <div className="stats-command-visual">
            <SpendingCompass
              categories={catTotals} 
              total={analysisTotal}
              totalHkd={analysisTotalHkd}
              budget={Number(state.budget) || 0} 
              budgetHkd={budgetHkd}
              dailyAverage={dailyAverage} 
              dailyAverageHkd={dailyAverageHkd}
              resolvedTripCurrency={resolvedTripCurrency}
              tripCurrencySymbol={tripCurrencySymbol}
              state={state} 
            />
          </div>
        </div>
      </MagicCard>

      <div className="metric-grid stats-metrics">
        <CockpitMetric label="圖表統計額" value={<NumberTicker value={analysisTotalHkd} prefix="HK$ " />} detail={`圖表口徑 · ${tripCurrencySymbol}${fmt(analysisTotal)}`} tone="accent" />
        <CockpitMetric label="共同分帳額" value={<NumberTicker value={sharedTotalHkd} prefix="HK$ " delay={0.04} />} detail={`全 receipts · ${tripCurrencySymbol}${fmt(settlement.sharedTotal)}`} />
        <CockpitMetric label="私人/代付" value={<NumberTicker value={privateTotalHkd} prefix="HK$ " delay={0.08} />} detail={`${settlement.crossPrivate.length} 筆 · ${tripCurrencySymbol}${fmt(privateTotal)}`} tone="success" />
        <CockpitMetric label="待轉帳" value={<NumberTicker value={transferTotalHkd} prefix="HK$ " delay={0.12} />} detail={settlement.transfers.length ? `需結算 · ${tripCurrencySymbol}${fmt(transferTotal)}` : '暫時不用轉帳'} tone={settlement.transfers.length ? 'danger' : 'success'} />
      </div>

      <DataPanel
        className="settlement-card"
        icon={<Users size={19} />}
        title="分帳結算"
        status={<StatusPill tone={settlement.transfers.length ? 'warning' : 'ok'}>{settlement.transfers.length ? '需要結算' : '不用轉帳'}</StatusPill>}
      >
        {settlement.transfers.length ? settlement.transfers.map((t) => {
          const amountHkd = Math.round(t.amount / activeRate);
          return (
            <motion.div
              className="transfer transfer-modern stats-transfer flex items-center justify-between gap-2 p-2 rounded-lg bg-white/40 mb-2 border border-white/60 shadow-sm overflow-hidden"
              key={`${t.from.id}-${t.to.id}-${t.amount}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <span className="stats-transfer-person"><AvatarBadge person={t.from} size="sm" /> <span>{t.from.name}</span></span>
                <b className="text-gray-400 shrink-0">→</b>
                <span className="stats-transfer-person"><AvatarBadge person={t.to} size="sm" /> <span>{t.to.name}</span></span>
              </div>
              <strong className="text-lg text-blue-900 shrink-0">HK$ {fmt(amountHkd)} <small className="text-xs font-normal text-slate-500 font-sans ml-0.5">({tripCurrencySymbol}{fmt(t.amount)})</small></strong>
            </motion.div>
          );
        }) : <EmptyState title="暫時唔需要互相轉帳" description="所有共同支出與代付已經平衡。" />}
      </DataPanel>

      <DataPanel icon={<WalletCards size={19} />} title="付款人" status={<StatusPill tone="neutral">全 receipts</StatusPill>}>
        {persons.map((p, i) => {
          const valTrip = settlement.sharedByPayer[i] + settlement.privateByOwner[i];
          const valHkd = Math.round(valTrip / activeRate);
          return (
            <Bar 
              key={p.id} 
              label={p.name} 
              leading={<AvatarBadge person={p} size="sm" />} 
              value={valTrip} 
              valueHkd={valHkd}
              tripCurrencySymbol={tripCurrencySymbol}
              activeRate={activeRate}
              maxHkd={Math.max(1, Math.round(maxPersonTotal / activeRate))} 
              color={p.color} 
            />
          );
        })}
        {settlement.crossPrivate.length > 0 && (
          <div className="mini-list">
            {settlement.crossPrivate.map((cp) => {
              const amountHkd = Math.round(cp.amount / activeRate);
              return <span key={cp.id}>代付：{cp.payer.name} 代 {cp.beneficiary.name} 付 HK$ {fmt(amountHkd)} ({tripCurrencySymbol}{fmt(cp.amount)}) · {cp.store}</span>;
            })}
          </div>
        )}
      </DataPanel>

      <DataPanel icon={<PieChart size={19} />} title="類別" status={<StatusPill tone="neutral">{state.statsIncludeTransportLodging ? '包含大額' : '日常支出'}</StatusPill>}>
        {catTotals.length ? catTotals.map((c) => (
          <Bar 
            key={c.id} 
            label={c.name} 
            leading={<VisualIcon id={categoryIconId(c.id)} label={c.name} size="sm" />} 
            value={c.total} 
            valueHkd={c.totalHkd}
            tripCurrencySymbol={tripCurrencySymbol}
            activeRate={activeRate}
            maxHkd={analysisTotalHkd} 
            color={c.color} 
          />
        )) : <EmptyState title="未有紀錄" description="新增 receipt 後會自動顯示類別分佈。" />}
      </DataPanel>

      <DataPanel icon={<BarChart3 size={19} />} title="支付方式" status={<StatusPill tone="neutral">{payTotals.length} 種方式</StatusPill>}>
        {payTotals.length ? payTotals.map((p) => (
          <Bar 
            key={p.id} 
            label={p.name} 
            value={p.total} 
            valueHkd={p.totalHkd}
            tripCurrencySymbol={tripCurrencySymbol}
            activeRate={activeRate}
            maxHkd={analysisTotalHkd} 
            color={p.color} 
          />
        )) : <EmptyState title="未有紀錄" description="現金、信用卡、PayPay、Suica 會分開統計。" />}
      </DataPanel>

      <DataPanel
        icon={<Trophy size={19} />}
        title="TOP 10 支出"
        status={<TopTenToggle includeBigItems={state.top10IncludeBigItems} onChange={(value) => updateState({ top10IncludeBigItems: value })} />}
      >
        {topReceipts.length ? topReceipts.map((r, idx) => {
          const cat = categoryById(r.category);
          const hkdAmt = getReceiptHkdAmount(r, state);
          const tripAmt = getReceiptTripAmount(r, state, resolvedTripCurrency);
          return (
            <motion.div className="rank-row rank-modern" key={r.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22, delay: idx * 0.015 }}>
              <b>{idx + 1}</b>
              <span><VisualIcon id={categoryIconId(r.category)} label={cat.name} size="sm" /> {displayStore(r)}</span>
              <strong>HK$ {fmt(hkdAmt)} <small className="text-xs font-normal text-slate-500 font-sans ml-0.5">({tripCurrencySymbol}{fmt(tripAmt)})</small></strong>
            </motion.div>
          );
        }) : <EmptyState title="未有紀錄" description="支出紀錄會按金額由高至低排列。" />}
      </DataPanel>

      <DataPanel
        className="trend-panel"
        icon={<TrendingUp size={19} />}
        title="每日 Budget Pace"
        status={<StatusPill tone={overBudgetDays ? 'warning' : 'ok'}>{overBudgetDays ? `${overBudgetDays} 日超支` : '未超支'}</StatusPill>}
      >
        {trend.length ? (
          <BudgetPaceChart 
            trend={trend} 
            dailyBudget={dailyBudget} 
            dailyBudgetHkd={dailyBudgetHkd}
            dailyAverage={dailyAverage} 
            dailyAverageHkd={dailyAverageHkd}
            tripCurrencySymbol={tripCurrencySymbol}
            activeRate={activeRate}
            state={state} 
          />
        ) : null}
        {trend.length ? trend.map(([date, total]) => {
          const totalHkd = Math.round(total / activeRate);
          return (
            <Bar 
              key={date} 
              label={date} 
              value={total} 
              valueHkd={totalHkd}
              tripCurrencySymbol={tripCurrencySymbol}
              activeRate={activeRate}
              maxHkd={Math.max(1, ...trend.map(([, t]) => Math.round(t / activeRate)))} 
              color={dailyBudget > 0 && total > dailyBudget ? '#C23B5E' : '#2d5a8e'} 
            />
          );
        }) : <EmptyState title="未有紀錄" description="新增跨日期 receipt 後會形成趨勢。" />}
      </DataPanel>

      <GlassCard className="stats-controls stats-glass" tone="control">
        <div>
          <h2>統統一口徑</h2>
          <p>此開關同 Dashboard/Settings 使用同一個設定；分帳結算仍保留全數 receipts，避免漏計真正欠款。</p>
        </div>
        <div className="stats-toggle-row">
          <label className="check-row inline-check stats-switch">
            <input type="checkbox" checked={state.statsIncludeTransportLodging} onChange={(e) => updateState({ statsIncludeTransportLodging: e.target.checked })} />
            <span className="switch-track" aria-hidden="true" />
            <span>包括交通/住宿於統計圖表</span>
          </label>
        </div>
      </GlassCard>
      </div>
    </section>
  );
}

function SpendingCompass({ 
  categories, 
  total, 
  totalHkd,
  budget, 
  budgetHkd,
  dailyAverage, 
  dailyAverageHkd,
  resolvedTripCurrency,
  tripCurrencySymbol,
  state 
}: { 
  categories: StatBucket[]; 
  total: number; 
  totalHkd: number;
  budget: number; 
  budgetHkd: number;
  dailyAverage: number; 
  dailyAverageHkd: number;
  resolvedTripCurrency: string;
  tripCurrencySymbol: string;
  state: AppState 
}) {
  const slices = categorySlices(categories, total);
  const top = slices[0];
  const usedPercent = budgetHkd > 0 ? Math.round(totalHkd / budgetHkd * 100) : 0;
  const shownPercent = budgetHkd > 0 ? `${usedPercent}%` : '--';
  const remainingHkd = Math.max(0, budgetHkd - totalHkd);
  const remainingTrip = Math.max(0, budget - total);
  const overBudget = budgetHkd > 0 && totalHkd > budgetHkd;
  const ring = budgetRingGradient(usedPercent);
  return (
    <div className={`spending-compass ${overBudget ? 'is-over-budget' : ''}`.trim()} aria-label={`預算使用分析，已用 ${shownPercent}，支出 HK$ ${fmt(totalHkd)}，預算 HK$ ${fmt(budgetHkd)}`} style={{ '--compass-ring': ring } as CSSProperties}>
      <div className="spending-compass-ring" aria-hidden="true">
        <motion.i initial={{ rotate: -20, scale: 0.92 }} animate={{ rotate: 0, scale: 1 }} transition={{ duration: 0.5, ease: 'easeOut' }} />
        <div className="spending-compass-copy">
          <span>預算使用</span>
          <strong>{shownPercent}</strong>
          <small>{budgetHkd > 0 ? (overBudget ? '已超預算' : '已用預算') : '未設定預算'}</small>
        </div>
      </div>
      <div className="spending-compass-legend">
        <span className="spending-compass-slice" style={{ '--slice-color': '#C23B5E' } as CSSProperties}><i aria-hidden="true" />已用 HK$ {fmt(totalHkd)} <small className="text-[10px] text-slate-500 font-sans font-normal ml-0.5">({tripCurrencySymbol}{fmt(total)})</small></span>
        <span className="spending-compass-slice" style={{ '--slice-color': '#D4A843' } as CSSProperties}><i aria-hidden="true" />{overBudget ? '超出' : '尚餘'} HK$ {fmt(overBudget ? totalHkd - budgetHkd : remainingHkd)} <small className="text-[10px] text-slate-500 font-sans font-normal ml-0.5">({tripCurrencySymbol}{fmt(overBudget ? total - budget : remainingTrip)})</small></span>
        <span className="spending-compass-slice" style={{ '--slice-color': top ? top.color : '#8b7d6d' } as CSSProperties}><i aria-hidden="true" />最高 {top ? top.name : '未有分類'} HK$ {fmt(top ? top.totalHkd : 0)} <small className="text-[10px] text-slate-500 font-sans font-normal ml-0.5">({tripCurrencySymbol}{fmt(top ? top.total : 0)})</small></span>
        <span className="spending-compass-slice" style={{ '--slice-color': '#1E4D6B' } as CSSProperties}><i aria-hidden="true" />日均 HK$ {fmt(dailyAverageHkd)} <small className="text-[10px] text-slate-500 font-sans font-normal ml-0.5">({tripCurrencySymbol}{fmt(dailyAverage)})</small></span>
      </div>
      <div className="spending-compass-top">
        <span>預算</span>
        <b>{budgetHkd > 0 ? `HK$ ${fmt(budgetHkd)} (${tripCurrencySymbol}${fmt(budget)})` : '未設定'}</b>
        <span>{overBudget ? '超出' : '尚餘'}</span>
        <b>{budgetHkd > 0 ? `HK$ ${fmt(overBudget ? totalHkd - budgetHkd : remainingHkd)} (${tripCurrencySymbol}${fmt(overBudget ? total - budget : remainingTrip)})` : '設定後顯示'}</b>
      </div>
    </div>
  );
}

function TopTenToggle({ includeBigItems, onChange }: { includeBigItems: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="top10-toggle" role="group" aria-label="TOP 10 支出篩選">
      <button type="button" className={includeBigItems ? 'active' : ''} aria-pressed={includeBigItems} onClick={() => onChange(true)}>全項目</button>
      <button type="button" className={!includeBigItems ? 'active' : ''} aria-pressed={!includeBigItems} onClick={() => onChange(false)}>除了機票和酒店</button>
    </div>
  );
}

function CockpitMetric({ label, value, detail, tone = 'neutral' }: { label: string; value: ReactNode; detail?: ReactNode; tone?: 'neutral' | 'accent' | 'danger' | 'success' }) {
  return (
    <GlareHover className="stats-metric-glare" background="transparent" color={tone === 'danger' ? '#d94132' : '#d39a29'} opacity={0.16} width="100%" height="100%" playOnce>
      <motion.article
        className={`metric-card stats-metric ${tone}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.26, ease: 'easeOut' }}
      >
        <span>{label}</span>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
        <i aria-hidden="true" />
      </motion.article>
    </GlareHover>
  );
}

function DataPanel({ icon, title, status, children, className = '' }: { icon: ReactNode; title: string; status: ReactNode; children: ReactNode; className?: string }) {
  return (
    <GlassCard className={`stats-panel stats-glass ${className}`.trim()}>
      <div className="section-head">
        <h2>{icon} {title}</h2>
        {status}
      </div>
      {children}
    </GlassCard>
  );
}

function BudgetPaceChart({ 
  trend, 
  dailyBudget, 
  dailyBudgetHkd,
  dailyAverage, 
  dailyAverageHkd,
  tripCurrencySymbol,
  activeRate,
  state 
}: { 
  trend: Array<[string, number]>; 
  dailyBudget: number; 
  dailyBudgetHkd: number;
  dailyAverage: number; 
  dailyAverageHkd: number;
  tripCurrencySymbol: string;
  activeRate: number;
  state: AppState 
}) {
  const max = Math.max(1, dailyBudget, ...trend.map(([, total]) => total));
  const budgetLine = dailyBudget > 0 ? Math.max(4, Math.min(96, 100 - dailyBudget / max * 100)) : 96;
  const overDays = trend.filter(([, total]) => dailyBudget > 0 && total > dailyBudget);
  const peak = trend.slice().sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="budget-pace" aria-label={`每日 Budget Pace，超支 ${overDays.length} 日，日均 HK$ ${fmt(dailyAverageHkd)}`}>
      <div className="budget-pace-summary">
        <span><b>{overDays.length}</b><small>超支日</small></span>
        <span><b>HK$ {fmt(dailyBudgetHkd)}</b><small>每日預算線</small></span>
        <span><b>{peak ? peak[0] : '-'}</b><small>最高支出日</small></span>
      </div>
      <div className="budget-pace-chart" style={{ '--budget-line': `${budgetLine}%` } as CSSProperties}>
        <i className="budget-pace-line" aria-hidden="true" />
        {trend.map(([date, total], idx) => {
          const over = dailyBudget > 0 && total > dailyBudget;
          const height = Math.max(8, Math.min(100, total / max * 100));
          const label = trend.length <= 7 ? `Day ${idx + 1}` : date.slice(5);
          const totalHkd = Math.round(total / activeRate);
          return (
            <div className={`budget-pace-day ${over ? 'over' : 'ok'}`} key={date} title={`${date}: HK$ ${fmt(totalHkd)} / ${tripCurrencySymbol}${fmt(total)}`}>
              <span className="budget-pace-bar">
                <motion.i
                  style={{ height: `${height}%` }}
                  initial={{ height: 0 }}
                  animate={{ height: `${height}%` }}
                  transition={{ duration: 0.42, delay: idx * 0.025, ease: 'easeOut' }}
                />
              </span>
              <small>{label}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function isBigTripItem(receipt: Receipt): boolean {
  return receipt.category === 'flight' || receipt.category === 'lodging' || receipt.category === 'transport';
}

function isFlightOrHotelItem(receipt: Receipt): boolean {
  return receipt.category === 'flight' || receipt.category === 'lodging';
}

function categoryTotals(receipts: Receipt[], getHkd: (r: Receipt) => number, getTrip: (r: Receipt) => number): StatBucket[] {
  const known = new Set(CATEGORIES.map((c) => c.id));
  const totals = CATEGORIES.map((c) => {
    const filtered = receipts.filter((r) => r.category === c.id);
    return {
      ...c,
      total: filtered.reduce((s, r) => s + getTrip(r), 0),
      totalHkd: filtered.reduce((s, r) => s + getHkd(r), 0)
    };
  }).filter((x) => x.total > 0);

  const unknownReceipts = receipts.filter((r) => !known.has(r.category as CategoryId));
  const unknownTotal = unknownReceipts.reduce((s, r) => s + getTrip(r), 0);
  const unknownTotalHkd = unknownReceipts.reduce((s, r) => s + getHkd(r), 0);

  return unknownTotal > 0 
    ? [...totals, { id: 'unknown', icon: '?', name: '未分類', color: '#6b7280', total: unknownTotal, totalHkd: unknownTotalHkd }] 
    : totals;
}

function paymentTotals(receipts: Receipt[], getHkd: (r: Receipt) => number, getTrip: (r: Receipt) => number): StatBucket[] {
  const known = new Set(PAYMENTS.map((p) => p.id));
  const totals = PAYMENTS.map((p) => {
    const filtered = receipts.filter((r) => r.payment === p.id);
    return {
      ...p,
      total: filtered.reduce((s, r) => s + getTrip(r), 0),
      totalHkd: filtered.reduce((s, r) => s + getHkd(r), 0)
    };
  }).filter((x) => x.total > 0);

  const unknownReceipts = receipts.filter((r) => !known.has(r.payment as PaymentId));
  const unknownTotal = unknownReceipts.reduce((s, r) => s + getTrip(r), 0);
  const unknownTotalHkd = unknownReceipts.reduce((s, r) => s + getHkd(r), 0);

  return unknownTotal > 0 
    ? [...totals, { id: 'unknown', name: '其他方式', color: '#6b7280', total: unknownTotal, totalHkd: unknownTotalHkd }] 
    : totals;
}

function categorySlices(categories: StatBucket[], total: number): StatBucket[] {
  if (!total) return [];
  const sorted = categories.slice().sort((a, b) => b.total - a.total);
  const visible = sorted.slice(0, 4);
  const rest = sorted.slice(4).reduce((sum, item) => sum + item.total, 0);
  const restHkd = sorted.slice(4).reduce((sum, item) => sum + item.totalHkd, 0);
  return rest > 0 ? [...visible, { id: 'other-categories', name: '其他類別', color: '#8b7d6d', total: rest, totalHkd: restHkd }] : visible;
}


function budgetRingGradient(usedPercent: number): string {
  const used = Math.max(0, Math.min(100, usedPercent));
  const usedDeg = used * 3.6;
  if (used <= 0) return 'conic-gradient(rgba(232,221,208,.84) 0deg 360deg)';
  if (used >= 100) return 'conic-gradient(#C23B5E 0deg 320deg, #D4A843 320deg 360deg)';
  return `conic-gradient(#C23B5E 0deg ${usedDeg.toFixed(1)}deg, #D4A843 ${usedDeg.toFixed(1)}deg 360deg)`;
}

function Bar({ label, leading, value, valueHkd, tripCurrencySymbol, activeRate, color, maxHkd }: { label: string; leading?: ReactNode; value: number; valueHkd: number; tripCurrencySymbol: string; activeRate: number; color: string; maxHkd: number }) {
  const summary = `${label}: HK$ ${fmt(valueHkd)} / ${tripCurrencySymbol}${fmt(value)}`;
  return (
    <div className="bar-row" title={summary} aria-label={summary}>
      <div>
        <span>{leading}{label}</span>
        <b>HK$ {fmt(valueHkd)} <small className="text-[10.5px] font-normal text-slate-500 font-sans ml-1">({tripCurrencySymbol}{fmt(value)})</small></b>
      </div>
      <div className="bar-track">
        <motion.i
          style={{ width: `${Math.min(100, maxHkd > 0 ? valueHkd / maxHkd * 100 : 0)}%`, background: color }}
          animate={{ width: `${Math.min(100, maxHkd > 0 ? valueHkd / maxHkd * 100 : 0)}%` }}
          transition={{ duration: 0.38, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
