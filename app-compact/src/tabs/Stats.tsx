import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'motion/react';
import { BarChart3, ChevronRight, Info, Pencil, PieChart, ReceiptText, TrendingUp, Trophy, Users, WalletCards } from 'lucide-react';
import { CATEGORIES, PAYMENTS } from '../lib/constants';
import { activeTrip, scopedReceiptsForTrip } from '../domain/trip/normalize';
import { categoryById, computeSettlements, displayStore, fmt, getItinerary, getPersons, hkd, getReceiptHkdAmount, getReceiptTripAmount, getResolvedTripCurrency } from '../lib/domain';
import type { AppState, CategoryId, PaymentId, Receipt } from '../lib/types';
import { EmptyState, GlassCard, StatusPill } from '../components/ui';
import { AvatarBadge } from '../components/AvatarBadge';
import { NumberTicker } from '../components/ui/number-ticker';
import { GlareHover } from '../components/ui/glare-hover';
import { VisualIcon } from '../components/VisualIcon';
import { categoryIconId } from '../lib/iconManifest';
import '../styles/stats.css';

type StatBucket = { id: string; name: string; color: string; total: number; icon?: string };

export function Stats({ state, updateState }: { state: AppState; updateState: (patch: Partial<AppState>) => void }) {
  const trip = activeTrip(state);
  const scopedState = { ...state, receipts: scopedReceiptsForTrip(state, trip) };
  const settlement = computeSettlements(scopedState);
  const persons = getPersons(state);
  const itinerary = getItinerary(state);
  const resolvedTripCurrency = getResolvedTripCurrency(state, trip);
  const analysisReceipts = scopedState.receipts.filter((r) => state.statsIncludeTransportLodging || !isBigTripItem(r));
  const catTotals = categoryTotals(analysisReceipts, state, resolvedTripCurrency);
  const payTotals = paymentTotals(analysisReceipts, state, resolvedTripCurrency);
  const analysisTotal = analysisReceipts.reduce((s, r) => s + getReceiptTripAmount(r, state, resolvedTripCurrency), 0);
  const analysisTotalHkd = analysisReceipts.reduce((s, r) => s + getReceiptHkdAmount(r, state), 0);
  const transferTotal = settlement.transfers.reduce((s, t) => s + t.amount, 0);
  const privateTotal = settlement.privateByOwner.reduce((s, n) => s + n, 0);
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
  const dailyBudget = Math.round((Number(state.budget) || 0) / tripDayCount);
  const dailyAverage = Math.round(analysisTotal / tripDayCount);
  const overBudgetDays = trend.filter(([, total]) => dailyBudget > 0 && total > dailyBudget).length;

  return (
    <section className="japanese-washi-bg w-full min-h-screen px-4 pb-28 pt-6 relative overflow-y-auto stats-tab stats-cockpit stats-screen preview-stats-screen">
      <div className="stack w-full relative z-10 preview-stats-grid">
      <GlassCard className="stats-command preview-stats-budget">
        <div className="stats-command-title-row">
          <h2 className="stats-command-title">預算使用分析</h2>
          <span className="stats-record-pill">
            <StatusPill tone="info" icon={<ReceiptText size={14} />}>{scopedState.receipts.length} 筆紀錄</StatusPill>
          </span>
        </div>
        <SpendingCompass categories={catTotals} total={analysisTotal} budget={Number(state.budget) || 0} dailyBudget={dailyBudget} dailyAverage={dailyAverage} state={state} />
      </GlassCard>

      <DataPanel
        className="trend-panel preview-daily-pace"
        icon={<TrendingUp size={19} />}
        title="每日 Budget Pace"
        status={<StatusPill tone={overBudgetDays ? 'warning' : 'ok'}>{overBudgetDays ? `${overBudgetDays} 日超支` : '未超支'}</StatusPill>}
      >
        {trend.length ? <BudgetPaceChart trend={trend} dailyBudget={dailyBudget} dailyAverage={dailyAverage} state={state} /> : null}
        {trend.length ? trend.map(([date, total]) => <Bar key={date} label={date} value={total} state={{ ...scopedState, receipts: analysisReceipts }} color={dailyBudget > 0 && total > dailyBudget ? '#C23B5E' : '#2d5a8e'} />) : <EmptyState title="未有紀錄" description="新增跨日期 receipt 後會形成趨勢。" />}
      </DataPanel>

      <div className="metric-grid stats-metrics preview-stats-metrics">
        <CockpitMetric label="圖表統計額" value={<NumberTicker value={analysisTotal} prefix={resolvedTripCurrency === 'JPY' ? '¥' : resolvedTripCurrency + ' '} />} detail={`圖表口徑 · HK$ ${fmt(analysisTotalHkd)}`} tone="accent" />
        <CockpitMetric label="共同分帳額" value={<NumberTicker value={settlement.sharedTotal} prefix={resolvedTripCurrency === 'JPY' ? '¥' : resolvedTripCurrency + ' '} delay={0.04} />} detail={`全 receipts · ${persons.length} 人`} />
        <CockpitMetric label="私人/代付" value={<NumberTicker value={privateTotal} prefix={resolvedTripCurrency === 'JPY' ? '¥' : resolvedTripCurrency + ' '} delay={0.08} />} detail={`${settlement.crossPrivate.length} 筆跨私人代付`} tone="success" />
        <CockpitMetric label="待轉帳" value={<NumberTicker value={transferTotal} prefix={resolvedTripCurrency === 'JPY' ? '¥' : resolvedTripCurrency + ' '} delay={0.12} />} detail={settlement.transfers.length ? '需要結算' : '暫時不用轉帳'} tone={settlement.transfers.length ? 'danger' : 'success'} />
      </div>

      <DataPanel
        className="settlement-card"
        icon={<Users size={19} />}
        title="分帳結算"
        status={<StatusPill tone={settlement.transfers.length ? 'warning' : 'ok'}>{settlement.transfers.length ? '需要結算' : '不用轉帳'}</StatusPill>}
      >
        {settlement.transfers.length ? (
          <>
            <div className="settlement-visual-map py-4 px-3 bg-[#FAF7F0]/60 backdrop-blur-sm rounded-2xl border border-stone-200/50 flex flex-col items-center justify-center gap-3 mb-4">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">結算概覽連線圖</span>
              <div className="flex items-center justify-center gap-8 w-full relative">
                {/* Left group: Givers */}
                <div className="flex flex-col gap-2 z-10">
                  {Array.from(new Set(settlement.transfers.map(t => t.from.id))).map(fromId => {
                    const person = persons.find(p => p.id === fromId) || settlement.transfers.find(t => t.from.id === fromId)?.from;
                    if (!person) return null;
                    return (
                      <div key={fromId} className="flex items-center gap-1.5 bg-white border border-stone-200/60 rounded-xl px-2.5 py-1 shadow-sm">
                        <AvatarBadge person={person} size="sm" />
                        <span className="text-xs font-bold text-slate-700">{person.name}</span>
                        <small className="text-[9px] text-[#C23B5E] font-extrabold ml-1 leading-none">給出</small>
                      </div>
                    );
                  })}
                </div>
                
                {/* Central Arrow Flow */}
                <div className="flex flex-col items-center justify-center pointer-events-none relative w-16 h-10">
                  <svg className="w-full h-full text-amber-500" viewBox="0 0 60 20" fill="none" stroke="currentColor">
                    <path d="M5,10 H55" strokeWidth="2" strokeDasharray="3,3" stroke="var(--compact-gold)" />
                    <path d="M48,5 L55,10 L48,15" strokeWidth="2" stroke="var(--compact-gold)" fill="none" />
                  </svg>
                </div>

                {/* Right group: Receivers */}
                <div className="flex flex-col gap-2 z-10">
                  {Array.from(new Set(settlement.transfers.map(t => t.to.id))).map(toId => {
                    const person = persons.find(p => p.id === toId) || settlement.transfers.find(t => t.to.id === toId)?.to;
                    if (!person) return null;
                    return (
                      <div key={toId} className="flex items-center gap-1.5 bg-white border border-stone-200/60 rounded-xl px-2.5 py-1 shadow-sm">
                        <AvatarBadge person={person} size="sm" />
                        <span className="text-xs font-bold text-slate-700">{person.name}</span>
                        <small className="text-[9px] text-[#2D6E48] font-extrabold ml-1 leading-none">收取</small>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {settlement.transfers.map((t) => (
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
                <strong className="text-lg text-blue-900 shrink-0">{resolvedTripCurrency === 'JPY' ? '¥' : resolvedTripCurrency + ' '}{fmt(t.amount)}</strong>
              </motion.div>
            ))}
          </>
        ) : <EmptyState title="暫時唔需要互相轉帳" description="所有共同支出與代付已經平衡。" />}
      </DataPanel>

      <DataPanel className="payer-panel" icon={<WalletCards size={19} />} title="付款人" status={<StatusPill tone="neutral">全 receipts</StatusPill>}>
        {persons.map((p, i) => (
          <Bar key={p.id} label={p.name} leading={<AvatarBadge person={p} size="sm" />} value={settlement.sharedByPayer[i] + settlement.privateByOwner[i]} max={maxPersonTotal} state={scopedState} color={p.color} />
        ))}
        {settlement.crossPrivate.length > 0 && (
          <div className="mini-list">
            {settlement.crossPrivate.map((cp) => <span key={cp.id}>代付：{cp.payer.name} 代 {cp.beneficiary.name} 付 {resolvedTripCurrency === 'JPY' ? '¥' : resolvedTripCurrency + ' '}{fmt(cp.amount)} · {cp.store}</span>)}
          </div>
        )}
      </DataPanel>

      <DataPanel className="category-panel" icon={<PieChart size={19} />} title="類別" status={<StatusPill tone="neutral">{state.statsIncludeTransportLodging ? '包含大額' : '日常支出'}</StatusPill>}>
        {catTotals.length ? catTotals.map((c) => <Bar key={c.id} label={c.name} leading={<VisualIcon id={categoryIconId(c.id)} label={c.name} size="sm" />} value={c.total} state={{ ...scopedState, receipts: analysisReceipts }} color={c.color} />) : <EmptyState title="未有紀錄" description="新增 receipt 後會自動顯示類別分佈。" />}
      </DataPanel>

      <DataPanel className="payment-panel" icon={<BarChart3 size={19} />} title="支付方式" status={<StatusPill tone="neutral">{payTotals.length} 種方式</StatusPill>}>
        {payTotals.length ? payTotals.map((p) => <Bar key={p.id} label={p.name} value={p.total} state={{ ...scopedState, receipts: analysisReceipts }} color={p.color} />) : <EmptyState title="未有紀錄" description="現金、信用卡、PayPay、Suica 會分開統計。" />}
      </DataPanel>

      <DataPanel
        className="top-expenses-panel"
        icon={<Trophy size={19} />}
        title="TOP 10 支出"
        status={<TopTenToggle includeBigItems={state.top10IncludeBigItems} onChange={(value) => updateState({ top10IncludeBigItems: value })} />}
      >
        {topReceipts.length ? topReceipts.map((r, idx) => {
          const cat = categoryById(r.category);
          return (
            <motion.div className="rank-row rank-modern" key={r.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22, delay: idx * 0.015 }}>
              <b>{idx + 1}</b>
              <span><VisualIcon id={categoryIconId(r.category)} label={cat.name} size="sm" /> {displayStore(r)}</span>
              <strong>{r.currency === 'HKD' ? 'HK$' : (r.currency || resolvedTripCurrency === 'JPY' ? '¥' : r.currency || resolvedTripCurrency + ' ')}{fmt(r.total)}</strong>
            </motion.div>
          );
        }) : <EmptyState title="未有紀錄" description="支出紀錄會按金額由高至低排列。" />}
      </DataPanel>

      <GlassCard className="stats-controls stats-glass" tone="control">
        <div>
          <h2>統一口徑</h2>
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

function SpendingCompass({ categories, total, budget, dailyBudget, dailyAverage, state }: { categories: StatBucket[]; total: number; budget: number; dailyBudget: number; dailyAverage: number; state: AppState }) {
  const trip = activeTrip(state);
  const resolvedTripCurrency = getResolvedTripCurrency(state, trip);
  const toHkd = (amt: number) => {
    if (resolvedTripCurrency === 'HKD') return amt;
    const rate = Math.max(
      0.1,
      Number(state.rateTable?.[resolvedTripCurrency]?.perHkd) ||
      (resolvedTripCurrency === 'JPY' ? Number(state.rate) : undefined) ||
      20.36
    );
    return Math.round(amt / rate);
  };

  const slices = categorySlices(categories, total);
  const top = slices[0];
  const safeBudget = Math.max(0, Number(budget) || 0);
  const usedPercent = safeBudget > 0 ? Math.round(total / safeBudget * 100) : 0;
  const shownPercent = safeBudget > 0 ? `${usedPercent}%` : '--';
  const remaining = Math.max(0, safeBudget - total);
  const overBudget = safeBudget > 0 && total > safeBudget;
  const ring = budgetRingGradient(usedPercent);
  const delta = overBudget ? total - safeBudget : remaining;
  const currencyState = resolvedTripCurrency;
  const currencySymbol = resolvedTripCurrency === 'JPY' ? '¥' : resolvedTripCurrency + ' ';
  return (
    <div className={`spending-compass ${overBudget ? 'is-over-budget' : ''}`.trim()} aria-label={`預算使用分析，已用 ${shownPercent}，支出 ${currencySymbol}${fmt(total)}，預算 ${currencySymbol}${fmt(safeBudget)}`} style={{ '--compass-ring': ring } as CSSProperties}>
      <div className="preview-budget-heading">
        <span>預算羅盤</span>
        <Info size={17} aria-hidden="true" />
        <div className="preview-budget-currency" role="group" aria-label="顯示貨幣">
          <span className={currencyState === 'HKD' ? 'is-active' : ''}>HKD</span>
          <span className={currencyState === 'JPY' ? 'is-active' : ''}>JPY</span>
        </div>
      </div>
      <div className="preview-budget-overview">
        <div className="preview-budget-main">
          <div className="spending-compass-ring" aria-hidden="true">
            <motion.i initial={{ rotate: -20, scale: 0.92 }} animate={{ rotate: 0, scale: 1 }} transition={{ duration: 0.5, ease: 'easeOut' }} />
            <div className="spending-compass-copy">
              <span>預算使用</span>
              <strong>{shownPercent}</strong>
              <small>{safeBudget > 0 ? (overBudget ? '已超預算' : '已使用') : '未設定預算'}</small>
              <b>HK$ {fmt(toHkd(total))}</b>
            </div>
          </div>
          <div className="spending-compass-legend" aria-label="類別比例">
            {(slices.length ? slices : [{ id: 'empty', name: '未有分類', color: '#b8aa96', total: 0 }]).map((slice) => (
              <span className="spending-compass-slice" key={slice.id} style={{ '--slice-color': slice.color } as CSSProperties}>
                <i aria-hidden="true" />{slice.name}
              </span>
            ))}
          </div>
        </div>
        <div className="preview-budget-side">
          <div className="preview-budget-total">
            <span>總預算</span>
            <strong>{safeBudget > 0 ? `HK$ ${fmt(toHkd(safeBudget))}` : '未設定'}</strong>
            <button type="button" aria-label="編輯預算"><Pencil size={15} aria-hidden="true" /> 編輯</button>
          </div>
          <div className="preview-budget-row is-used">
            <span>已用</span>
            <strong>HK$ {fmt(toHkd(total))}</strong>
          </div>
          <div className="preview-budget-row">
            <span>{overBudget ? '超出預算' : '尚餘預算'}</span>
            <strong>HK$ {fmt(toHkd(delta))}</strong>
          </div>
          <div className="preview-budget-row preview-budget-stack">
            <span>每日預算</span>
            <strong>HK$ {fmt(toHkd(dailyBudget))}</strong>
            <span>日均結餘</span>
            <strong>HK$ {fmt(toHkd(Math.max(0, dailyBudget - dailyAverage)))}</strong>
          </div>
          <div className="preview-budget-row preview-budget-stack">
            <span>最高類別</span>
            <strong>{top ? top.name : '未有分類'}</strong>
            <small>{top ? `HK$ ${fmt(toHkd(top.total))}` : '新增 receipt 後顯示'}</small>
          </div>
        </div>
      </div>
      <div className="preview-budget-reminder">
        <span>預算提醒：每日平均使用需 ≤ HK$ {fmt(toHkd(dailyBudget || 0))}</span>
        <ChevronRight size={20} aria-hidden="true" />
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

function BudgetPaceChart({ trend, dailyBudget, dailyAverage, state }: { trend: Array<[string, number]>; dailyBudget: number; dailyAverage: number; state: AppState }) {
  const trip = activeTrip(state);
  const resolvedTripCurrency = getResolvedTripCurrency(state, trip);
  const toHkd = (amt: number) => {
    if (resolvedTripCurrency === 'HKD') return amt;
    const rate = Math.max(
      0.1,
      Number(state.rateTable?.[resolvedTripCurrency]?.perHkd) ||
      (resolvedTripCurrency === 'JPY' ? Number(state.rate) : undefined) ||
      20.36
    );
    return Math.round(amt / rate);
  };
  const currencySymbol = resolvedTripCurrency === 'JPY' ? '¥' : resolvedTripCurrency + ' ';

  const max = Math.max(1, dailyBudget, ...trend.map(([, total]) => total));
  const budgetLine = dailyBudget > 0 ? Math.max(4, Math.min(96, 100 - dailyBudget / max * 100)) : 96;
  const overDays = trend.filter(([, total]) => dailyBudget > 0 && total > dailyBudget);
  const peak = trend.slice().sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="budget-pace" aria-label={`每日 Budget Pace，超支 ${overDays.length} 日，日均 ${currencySymbol}${fmt(dailyAverage)}`}>
      <div className="budget-pace-summary">
        <span><b>{overDays.length}</b><small>超支日</small></span>
        <span><b>{currencySymbol}{fmt(dailyBudget)}</b><small>每日預算線</small></span>
        <span><b>{peak ? peak[0] : '-'}</b><small>最高支出日</small></span>
      </div>
      <div className="budget-pace-chart" style={{ '--budget-line': `${budgetLine}%` } as CSSProperties}>
        <i className="budget-pace-line" aria-hidden="true" />
        {trend.map(([date, total], idx) => {
          const over = dailyBudget > 0 && total > dailyBudget;
          const height = Math.max(8, Math.min(100, total / max * 100));
          const label = trend.length <= 7 ? `Day ${idx + 1}` : date.slice(5);
          return (
            <div className={`budget-pace-day ${over ? 'over' : 'ok'}`} key={date} title={`${date}: ${currencySymbol}${fmt(total)} / HK$ ${fmt(toHkd(total))}`}>
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
      {peak && (
        <div className={`preview-budget-selected-day ${dailyBudget > 0 && peak[1] > dailyBudget ? 'is-over' : ''}`}>
          <span>
            <b>{peak[0]}</b>
            <small>最高支出日</small>
          </span>
          <strong>{dailyBudget > 0 ? `${Math.round(peak[1] / dailyBudget * 100)}%` : '--'}</strong>
          <span>
            <b>{dailyBudget > 0 && peak[1] > dailyBudget ? '超出預算' : '預算內'}</b>
            <small>HK$ {fmt(toHkd(peak[1]))}</small>
          </span>
          <ChevronRight size={20} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

function isBigTripItem(receipt: Receipt): boolean {
  return receipt.category === 'flight' || receipt.category === 'lodging' || receipt.category === 'transport';
}

function isFlightOrHotelItem(receipt: Receipt): boolean {
  return receipt.category === 'flight' || receipt.category === 'lodging';
}

function categoryTotals(receipts: Receipt[], state: AppState, currency: string): StatBucket[] {
  const known = new Set(CATEGORIES.map((c) => c.id));
  const totals = CATEGORIES.map((c) => ({
    ...c,
    total: receipts.filter((r) => r.category === c.id).reduce((s, r) => s + getReceiptTripAmount(r, state, currency), 0)
  })).filter((x) => x.total > 0);
  const unknownTotal = receipts.filter((r) => !known.has(r.category as CategoryId)).reduce((s, r) => s + getReceiptTripAmount(r, state, currency), 0);
  return unknownTotal > 0 ? [...totals, { id: 'unknown', icon: '?', name: '未分類', color: '#6b7280', total: unknownTotal }] : totals;
}

function paymentTotals(receipts: Receipt[], state: AppState, currency: string): StatBucket[] {
  const known = new Set(PAYMENTS.map((p) => p.id));
  const totals = PAYMENTS.map((p) => ({
    ...p,
    total: receipts.filter((r) => r.payment === p.id).reduce((s, r) => s + getReceiptTripAmount(r, state, currency), 0)
  })).filter((x) => x.total > 0);
  const unknownTotal = receipts.filter((r) => !known.has(r.payment as PaymentId)).reduce((s, r) => s + getReceiptTripAmount(r, state, currency), 0);
  return unknownTotal > 0 ? [...totals, { id: 'unknown', name: '其他方式', color: '#6b7280', total: unknownTotal }] : totals;
}

function categorySlices(categories: StatBucket[], total: number): StatBucket[] {
  if (!total) return [];
  const sorted = categories.slice().sort((a, b) => b.total - a.total);
  const visible = sorted.slice(0, 4);
  const rest = sorted.slice(4).reduce((sum, item) => sum + item.total, 0);
  return rest > 0 ? [...visible, { id: 'other-categories', name: '其他類別', color: '#8b7d6d', total: rest }] : visible;
}

function budgetRingGradient(usedPercent: number): string {
  const used = Math.max(0, Math.min(100, usedPercent));
  const usedDeg = used * 3.6;
  if (used <= 0) return 'conic-gradient(rgba(232,221,208,.84) 0deg 360deg)';
  if (used >= 100) return 'conic-gradient(#C23B5E 0deg 320deg, #D4A843 320deg 360deg)';
  return `conic-gradient(#C23B5E 0deg ${usedDeg.toFixed(1)}deg, #D4A843 ${usedDeg.toFixed(1)}deg 360deg)`;
}

function Bar({ label, leading, value, state, color, max }: { label: string; leading?: ReactNode; value: number; state: AppState; color: string; max?: number }) {
  const trip = activeTrip(state);
  const resolvedTripCurrency = getResolvedTripCurrency(state, trip);

  let valueHkd = 0;
  if (resolvedTripCurrency === 'HKD') {
    valueHkd = value;
  } else {
    const rate = Math.max(
      0.1,
      Number(state.rateTable?.[resolvedTripCurrency]?.perHkd) ||
      (resolvedTripCurrency === 'JPY' ? Number(state.rate) : undefined) ||
      20.36
    );
    valueHkd = Math.round(value / rate);
  }

  const currencySymbol = resolvedTripCurrency === 'JPY' ? '¥' : resolvedTripCurrency + ' ';
  const summary = `${label}: ${currencySymbol}${fmt(value)} / HK$ ${fmt(valueHkd)}`;
  const total = max || Math.max(1, state.receipts.reduce((s, r) => s + getReceiptTripAmount(r, state, resolvedTripCurrency), 0));

  return (
    <div className="bar-row" title={summary} aria-label={summary}>
      <div><span>{leading}{label}</span><b>{currencySymbol}{fmt(value)} · HK$ {fmt(valueHkd)}</b></div>
      <div className="bar-track">
        <motion.i
          style={{ width: `${Math.min(100, value / total * 100)}%`, background: color }}
          animate={{ width: `${Math.min(100, value / total * 100)}%` }}
          transition={{ duration: 0.38, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
