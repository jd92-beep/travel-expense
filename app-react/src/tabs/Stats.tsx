import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'motion/react';
import { BarChart3, PieChart, ReceiptText, TrendingUp, Trophy, Users, WalletCards } from 'lucide-react';
import { CATEGORIES, PAYMENTS } from '../lib/constants';
import { activeTrip, scopedReceiptsForTrip } from '../domain/trip/normalize';
import { categoryById, computeSettlements, displayStore, fmt, getItinerary, getPersons, hkd } from '../lib/domain';
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

type StatBucket = { id: string; name: string; color: string; total: number; icon?: string };

export function Stats({ state, updateState }: { state: AppState; updateState: (patch: Partial<AppState>) => void }) {
  const trip = activeTrip(state);
  const scopedState = { ...state, receipts: scopedReceiptsForTrip(state, trip) };
  const settlement = computeSettlements(scopedState);
  const persons = getPersons(state);
  const itinerary = getItinerary(state);
  const analysisReceipts = scopedState.receipts.filter((r) => state.statsIncludeTransportLodging || !isBigTripItem(r));
  const catTotals = categoryTotals(analysisReceipts);
  const payTotals = paymentTotals(analysisReceipts);
  const analysisTotal = analysisReceipts.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const transferTotal = settlement.transfers.reduce((s, t) => s + t.amount, 0);
  const privateTotal = settlement.privateByOwner.reduce((s, n) => s + n, 0);
  const maxPersonTotal = Math.max(1, ...persons.map((_, i) => settlement.sharedByPayer[i] + settlement.privateByOwner[i]));
  const topReceipts = scopedState.receipts
    .filter((r) => state.top10IncludeBigItems || !isBigTripItem(r))
    .slice()
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  const trend = Object.entries(analysisReceipts.reduce<Record<string, number>>((acc, r) => {
    acc[r.date] = (acc[r.date] || 0) + (Number(r.total) || 0);
    return acc;
  }, {})).sort(([a], [b]) => a.localeCompare(b));
  const tripDayCount = Math.max(1, itinerary.length || trend.length);
  const dailyBudget = Math.round((Number(state.budget) || 0) / tripDayCount);
  const dailyAverage = Math.round(analysisTotal / tripDayCount);
  const overBudgetDays = trend.filter(([, total]) => dailyBudget > 0 && total > dailyBudget).length;

  return (
    <section className="japanese-washi-bg w-full min-h-screen px-4 pb-28 pt-6 relative overflow-y-auto stats-tab stats-cockpit stats-screen">
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
                <AnimatedGradientText colorFrom="#C23B5E" colorTo="#1E4D6B" speed={1.1}>分帳統計中心</AnimatedGradientText>
              </h2>
              <span className="stats-record-pill">
                <StatusPill tone="info" icon={<ReceiptText size={14} />}>{scopedState.receipts.length} 筆紀錄</StatusPill>
              </span>
            </div>
          </div>
          <div className="stats-command-visual">
            <SpendingCompass categories={catTotals} total={analysisTotal} dailyAverage={dailyAverage} state={state} />
          </div>
        </div>
      </MagicCard>

      <div className="metric-grid stats-metrics">
        <CockpitMetric label="統計總額" value={<NumberTicker value={analysisTotal} prefix="¥" />} detail={`HK$ ${fmt(hkd(analysisTotal, state))}`} tone="accent" />
        <CockpitMetric label="共同支出" value={<NumberTicker value={settlement.sharedTotal} prefix="¥" delay={0.04} />} detail={`${persons.length} 人分帳`} />
        <CockpitMetric label="私人/代付" value={<NumberTicker value={privateTotal} prefix="¥" delay={0.08} />} detail={`${settlement.crossPrivate.length} 筆跨私人代付`} tone="success" />
        <CockpitMetric label="待轉帳" value={<NumberTicker value={transferTotal} prefix="¥" delay={0.12} />} detail={settlement.transfers.length ? '需要結算' : '暫時不用轉帳'} tone={settlement.transfers.length ? 'danger' : 'success'} />
      </div>

      <GlassCard className="stats-controls stats-glass" tone="control">
        <div>
          <h2>統計口徑</h2>
          <p>此開關同 Dashboard/Settings 使用同一個設定；分帳結算仍保留全數 receipts，避免漏計真正欠款。</p>
        </div>
        <div className="stats-toggle-row">
          <label className="check-row inline-check stats-switch">
            <input type="checkbox" checked={state.statsIncludeTransportLodging} onChange={(e) => updateState({ statsIncludeTransportLodging: e.target.checked })} />
            <span className="switch-track" aria-hidden="true" />
            <span>包括交通/住宿於統計圖表</span>
          </label>
          <label className="check-row inline-check stats-switch">
            <input type="checkbox" checked={state.top10IncludeBigItems} onChange={(e) => updateState({ top10IncludeBigItems: e.target.checked })} />
            <span className="switch-track" aria-hidden="true" />
            <span>TOP 10 包括交通/住宿</span>
          </label>
        </div>
      </GlassCard>

      <DataPanel
        className="settlement-card"
        icon={<Users size={19} />}
        title="分帳結算"
        status={<StatusPill tone={settlement.transfers.length ? 'warning' : 'ok'}>{settlement.transfers.length ? '需要結算' : '不用轉帳'}</StatusPill>}
      >
        {settlement.transfers.length ? settlement.transfers.map((t) => (
          <motion.div
            className="transfer transfer-modern stats-transfer flex items-center justify-between gap-2 p-2 rounded-lg bg-white/40 mb-2 border border-white/60 shadow-sm overflow-hidden"
            key={`${t.from.id}-${t.to.id}-${t.amount}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="flex items-center gap-1.5 min-w-0 overflow-hidden"><AvatarBadge person={t.from} size="sm" /> <span className="truncate">{t.from.name}</span></span>
              <b className="text-gray-400 shrink-0">→</b>
              <span className="flex items-center gap-1.5 min-w-0 overflow-hidden"><AvatarBadge person={t.to} size="sm" /> <span className="truncate">{t.to.name}</span></span>
            </div>
            <strong className="text-lg text-blue-900 shrink-0">¥{fmt(t.amount)}</strong>
          </motion.div>
        )) : <EmptyState title="暫時唔需要互相轉帳" description="所有共同支出與代付已經平衡。" />}
      </DataPanel>

      <DataPanel icon={<WalletCards size={19} />} title="付款人" status={<StatusPill tone="neutral">全 receipts</StatusPill>}>
        {persons.map((p, i) => (
          <Bar key={p.id} label={p.name} leading={<AvatarBadge person={p} size="sm" />} value={settlement.sharedByPayer[i] + settlement.privateByOwner[i]} max={maxPersonTotal} state={scopedState} color={p.color} />
        ))}
        {settlement.crossPrivate.length > 0 && (
          <div className="mini-list">
            {settlement.crossPrivate.map((cp) => <span key={cp.id}>代付：{cp.payer.name} 代 {cp.beneficiary.name} 付 ¥{fmt(cp.amount)} · {cp.store}</span>)}
          </div>
        )}
      </DataPanel>

      <DataPanel icon={<PieChart size={19} />} title="類別" status={<StatusPill tone="neutral">{state.statsIncludeTransportLodging ? '包含大額' : '日常支出'}</StatusPill>}>
        {catTotals.length ? catTotals.map((c) => <Bar key={c.id} label={c.name} leading={<VisualIcon id={categoryIconId(c.id)} label={c.name} size="sm" />} value={c.total} state={{ ...scopedState, receipts: analysisReceipts }} color={c.color} />) : <EmptyState title="未有紀錄" description="新增 receipt 後會自動顯示類別分佈。" />}
      </DataPanel>

      <DataPanel icon={<BarChart3 size={19} />} title="支付方式" status={<StatusPill tone="neutral">{payTotals.length} 種方式</StatusPill>}>
        {payTotals.length ? payTotals.map((p) => <Bar key={p.id} label={p.name} value={p.total} state={{ ...scopedState, receipts: analysisReceipts }} color={p.color} />) : <EmptyState title="未有紀錄" description="現金、信用卡、PayPay、Suica 會分開統計。" />}
      </DataPanel>

      <DataPanel icon={<Trophy size={19} />} title="TOP 10 支出" status={<StatusPill tone="info">{state.top10IncludeBigItems ? '全項目' : '排除大額'}</StatusPill>}>
        {topReceipts.length ? topReceipts.map((r, idx) => {
          const cat = categoryById(r.category);
          return (
            <motion.div className="rank-row rank-modern" key={r.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22, delay: idx * 0.015 }}>
              <b>{idx + 1}</b>
              <span><VisualIcon id={categoryIconId(r.category)} label={cat.name} size="sm" /> {displayStore(r)}</span>
              <strong>¥{fmt(r.total)}</strong>
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
        {trend.length ? <BudgetPaceChart trend={trend} dailyBudget={dailyBudget} dailyAverage={dailyAverage} state={state} /> : null}
        {trend.length ? trend.map(([date, total]) => <Bar key={date} label={date} value={total} state={{ ...scopedState, receipts: analysisReceipts }} color={dailyBudget > 0 && total > dailyBudget ? '#C23B5E' : '#2d5a8e'} />) : <EmptyState title="未有紀錄" description="新增跨日期 receipt 後會形成趨勢。" />}
      </DataPanel>
      </div>
    </section>
  );
}

function SpendingCompass({ categories, total, dailyAverage, state }: { categories: StatBucket[]; total: number; dailyAverage: number; state: AppState }) {
  const slices = categorySlices(categories, total);
  const top = slices[0];
  const ring = categoryRingGradient(slices, total);
  return (
    <div className="spending-compass" aria-label={`支出方向盤，日均 ¥${fmt(dailyAverage)}，最高支出 ${top ? top.name : '未有紀錄'}`} style={{ '--compass-ring': ring } as CSSProperties}>
      <div className="spending-compass-ring" aria-hidden="true">
        <motion.i initial={{ rotate: -20, scale: 0.92 }} animate={{ rotate: 0, scale: 1 }} transition={{ duration: 0.5, ease: 'easeOut' }} />
      </div>
      <div className="spending-compass-copy">
        <span>支出方向盤</span>
        <strong>¥{fmt(dailyAverage)}</strong>
        <small>日均 · HK$ {fmt(hkd(dailyAverage, state))}</small>
      </div>
      <div className="spending-compass-legend">
        {slices.length ? slices.map((item) => (
          <span className="spending-compass-slice" key={item.id} style={{ '--slice-color': item.color } as CSSProperties}>
            <i aria-hidden="true" />
            {item.name} {total > 0 ? Math.round(item.total / total * 100) : 0}%
          </span>
        )) : <span className="spending-compass-slice is-empty">未有分類</span>}
      </div>
      <div className="spending-compass-top">
        <span>最高</span>
        <b>{top ? `${top.name} · ¥${fmt(top.total)}` : '未有紀錄'}</b>
      </div>
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
  const max = Math.max(1, dailyBudget, ...trend.map(([, total]) => total));
  const budgetLine = dailyBudget > 0 ? Math.max(4, Math.min(96, 100 - dailyBudget / max * 100)) : 96;
  const overDays = trend.filter(([, total]) => dailyBudget > 0 && total > dailyBudget);
  const peak = trend.slice().sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="budget-pace" aria-label={`每日 Budget Pace，超支 ${overDays.length} 日，日均 ¥${fmt(dailyAverage)}`}>
      <div className="budget-pace-summary">
        <span><b>{overDays.length}</b><small>超支日</small></span>
        <span><b>¥{fmt(dailyBudget)}</b><small>每日預算線</small></span>
        <span><b>{peak ? peak[0] : '-'}</b><small>最高支出日</small></span>
      </div>
      <div className="budget-pace-chart" style={{ '--budget-line': `${budgetLine}%` } as CSSProperties}>
        <i className="budget-pace-line" aria-hidden="true" />
        {trend.map(([date, total], idx) => {
          const over = dailyBudget > 0 && total > dailyBudget;
          const height = Math.max(8, Math.min(100, total / max * 100));
          const label = trend.length <= 7 ? `Day ${idx + 1}` : date.slice(5);
          return (
            <div className={`budget-pace-day ${over ? 'over' : 'ok'}`} key={date} title={`${date}: ¥${fmt(total)} / HK$ ${fmt(hkd(total, state))}`}>
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

function categoryTotals(receipts: Receipt[]): StatBucket[] {
  const known = new Set(CATEGORIES.map((c) => c.id));
  const totals = CATEGORIES.map((c) => ({ ...c, total: receipts.filter((r) => r.category === c.id).reduce((s, r) => s + (Number(r.total) || 0), 0) })).filter((x) => x.total > 0);
  const unknownTotal = receipts.filter((r) => !known.has(r.category as CategoryId)).reduce((s, r) => s + (Number(r.total) || 0), 0);
  return unknownTotal > 0 ? [...totals, { id: 'unknown', icon: '?', name: '未分類', color: '#6b7280', total: unknownTotal }] : totals;
}

function paymentTotals(receipts: Receipt[]): StatBucket[] {
  const known = new Set(PAYMENTS.map((p) => p.id));
  const totals = PAYMENTS.map((p) => ({ ...p, total: receipts.filter((r) => r.payment === p.id).reduce((s, r) => s + (Number(r.total) || 0), 0) })).filter((x) => x.total > 0);
  const unknownTotal = receipts.filter((r) => !known.has(r.payment as PaymentId)).reduce((s, r) => s + (Number(r.total) || 0), 0);
  return unknownTotal > 0 ? [...totals, { id: 'unknown', name: '其他方式', color: '#6b7280', total: unknownTotal }] : totals;
}

function categorySlices(categories: StatBucket[], total: number): StatBucket[] {
  if (!total) return [];
  const sorted = categories.slice().sort((a, b) => b.total - a.total);
  const visible = sorted.slice(0, 4);
  const rest = sorted.slice(4).reduce((sum, item) => sum + item.total, 0);
  return rest > 0 ? [...visible, { id: 'other-categories', name: '其他類別', color: '#8b7d6d', total: rest }] : visible;
}

function categoryRingGradient(slices: StatBucket[], total: number): string {
  if (!slices.length || !total) return 'conic-gradient(#e8ddd0 0deg 360deg)';
  let cursor = 0;
  const parts = slices.map((slice) => {
    const next = cursor + slice.total / total * 360;
    const segment = `${slice.color} ${cursor.toFixed(1)}deg ${next.toFixed(1)}deg`;
    cursor = next;
    return segment;
  });
  if (cursor < 360) parts.push(`rgba(232,221,208,.74) ${cursor.toFixed(1)}deg 360deg`);
  return `conic-gradient(${parts.join(', ')})`;
}

function Bar({ label, leading, value, state, color, max }: { label: string; leading?: ReactNode; value: number; state: AppState; color: string; max?: number }) {
  const total = max || Math.max(1, state.receipts.reduce((s, r) => s + r.total, 0));
  const summary = `${label}: ¥${fmt(value)} / HK$ ${fmt(hkd(value, state))}`;
  return (
    <div className="bar-row" title={summary} aria-label={summary}>
      <div><span>{leading}{label}</span><b>¥{fmt(value)} · HK$ {fmt(hkd(value, state))}</b></div>
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
