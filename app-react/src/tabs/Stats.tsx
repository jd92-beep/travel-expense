import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { BarChart3, HandCoins, PieChart, ReceiptText, TrendingUp, Trophy, Users, WalletCards } from 'lucide-react';
import { CATEGORIES, PAYMENTS } from '../lib/constants';
import { activeTrip } from '../domain/trip/normalize';
import { categoryById, computeSettlements, displayStore, fmt, getPersons, hkd } from '../lib/domain';
import type { AppState, CategoryId, PaymentId, Receipt } from '../lib/types';
import { EmptyState, GlassCard, StatusPill } from '../components/ui';
import { AvatarBadge } from '../components/AvatarBadge';
import { ShineBorder } from '../components/ui/shine-border';
import { MagicCard } from '../components/ui/magic-card';
import { NumberTicker } from '../components/ui/number-ticker';
import { VisualIcon } from '../components/VisualIcon';
import { categoryIconId } from '../lib/iconManifest';
import '../styles/stats.css';

export function Stats({ state, updateState }: { state: AppState; updateState: (patch: Partial<AppState>) => void }) {
  const trip = activeTrip(state);
  const scopedState = { ...state, receipts: state.receipts.filter((r) => !r.tripId || r.tripId === trip.id) };
  const settlement = computeSettlements(scopedState);
  const persons = getPersons(state);
  const analysisReceipts = scopedState.receipts.filter((r) => state.statsIncludeTransportLodging || !isBigTripItem(r));
  const catTotals = categoryTotals(analysisReceipts);
  const payTotals = paymentTotals(analysisReceipts);
  const analysisTotal = analysisReceipts.reduce((s, r) => s + r.total, 0);
  const transferTotal = settlement.transfers.reduce((s, t) => s + t.amount, 0);
  const privateTotal = settlement.privateByOwner.reduce((s, n) => s + n, 0);
  const maxPersonTotal = Math.max(1, ...persons.map((_, i) => settlement.sharedByPayer[i] + settlement.privateByOwner[i]));
  const scopeRatio = Math.min(100, scopedState.receipts.length ? analysisReceipts.length / scopedState.receipts.length * 100 : 0);
  const topReceipts = scopedState.receipts
    .filter((r) => state.top10IncludeBigItems || !isBigTripItem(r))
    .slice()
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  const trend = Object.entries(analysisReceipts.reduce<Record<string, number>>((acc, r) => {
    acc[r.date] = (acc[r.date] || 0) + r.total;
    return acc;
  }, {})).sort(([a], [b]) => a.localeCompare(b));

  return (
    <section className="stack stats-tab stats-cockpit">
      <MagicCard className="stats-command p-0 rounded-[24px] overflow-hidden relative border border-white/40 shadow-xl w-full">
        <ShineBorder className="opacity-70" shineColor={['#C23B5E', '#1E4D6B']} borderWidth={2} />
        <div className="absolute inset-0 bg-gradient-to-br from-[#C23B5E] via-[#D4A843] to-[#1E4D6B] opacity-[0.15] mix-blend-multiply pointer-events-none" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 p-6 h-full w-full">
          <div className="flex-1">
            <small className="eyebrow text-red-800/70">旅費管制盤 / INSIGHTS</small>
            <h2 className="text-2xl font-bold text-red-900 mb-1">分帳統計中心</h2>
            <p className="muted text-sm mb-4">按 active trip 計算分帳、類別、支付方式、Top 10 同每日趨勢。</p>
            <div className="flex flex-wrap gap-2">
              <StatusPill tone="info" icon={<ReceiptText size={14} />}>{scopedState.receipts.length} 筆紀錄</StatusPill>
              <StatusPill tone={settlement.transfers.length ? 'warning' : 'ok'} icon={<HandCoins size={14} />}>
                {settlement.transfers.length ? `${settlement.transfers.length} 筆轉帳` : '已平衡'}
              </StatusPill>
            </div>
          </div>
          <div className="flex-shrink-0 self-center">
            <ScopeDial value={scopeRatio} receipts={analysisReceipts.length} transfers={settlement.transfers.length} />
          </div>
        </div>
      </MagicCard>

      <div className="metric-grid stats-metrics">
        <CockpitMetric label="統計總額" value={`¥${fmt(analysisTotal)}`} detail={`HK$ ${fmt(hkd(analysisTotal, state))}`} tone="accent" />
        <CockpitMetric label="共同支出" value={`¥${fmt(settlement.sharedTotal)}`} detail={`${persons.length} 人分帳`} />
        <CockpitMetric label="私人/代付" value={`¥${fmt(privateTotal)}`} detail={`${settlement.crossPrivate.length} 筆跨私人代付`} tone="success" />
        <CockpitMetric label="待轉帳" value={`¥${fmt(transferTotal)}`} detail={settlement.transfers.length ? '需要結算' : '暫時不用轉帳'} tone={settlement.transfers.length ? 'danger' : 'success'} />
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
        title="每日趨勢"
        status={<StatusPill tone="neutral">{trend.length} 日</StatusPill>}
      >
        {trend.length ? <TrendLine trend={trend} /> : null}
        {trend.length ? trend.map(([date, total]) => <Bar key={date} label={date} value={total} state={{ ...scopedState, receipts: analysisReceipts }} color="#2d5a8e" />) : <EmptyState title="未有紀錄" description="新增跨日期 receipt 後會形成趨勢。" />}
      </DataPanel>
    </section>
  );
}

function ScopeDial({ value, receipts, transfers }: { value: number; receipts: number; transfers: number }) {
  const dash = Math.max(0, Math.min(100, value));
  return (
    <div className="stats-orbit" aria-label={`統計範圍 ${dash.toFixed(0)}%`}>
      <svg viewBox="0 0 180 180" role="img">
        <defs>
          <linearGradient id="stats-scope-stroke" x1="18" y1="20" x2="150" y2="164" gradientUnits="userSpaceOnUse">
            <stop stopColor="#d94132" />
            <stop offset="0.52" stopColor="#d39a29" />
            <stop offset="1" stopColor="#173a60" />
          </linearGradient>
        </defs>
        <circle cx="90" cy="90" r="72" className="orbit-rail" />
        <motion.circle
          cx="90"
          cy="90"
          r="72"
          className="orbit-progress"
          pathLength="100"
          strokeDasharray={`${dash} 100`}
          initial={{ strokeDasharray: '0 100' }}
          animate={{ strokeDasharray: `${dash} 100` }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
        />
        <path className="orbit-grid" d="M32 90h116M90 32v116M49 49l82 82M131 49l-82 82" />
        <circle cx="90" cy="90" r="36" className="orbit-core" />
      </svg>
      <div className="orbit-copy">
        <strong>{dash.toFixed(0)}%</strong>
        <span>統計範圍</span>
        <small>{receipts} 筆分析 · {transfers} 筆轉帳</small>
      </div>
    </div>
  );
}

function CockpitMetric({ label, value, detail, tone = 'neutral' }: { label: string; value: ReactNode; detail?: ReactNode; tone?: 'neutral' | 'accent' | 'danger' | 'success' }) {
  return (
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

function TrendLine({ trend }: { trend: Array<[string, number]> }) {
  const max = Math.max(1, ...trend.map(([, total]) => total));
  const points = trend.map(([, total], idx) => {
    const x = trend.length === 1 ? 50 : idx / (trend.length - 1) * 100;
    const y = 78 - total / max * 58;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg className="trend-line" viewBox="0 0 100 88" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="stats-trend-fill" x1="0" x2="0" y1="0" y2="1">
          <stop stopColor="#d94132" stopOpacity=".34" />
          <stop offset="1" stopColor="#fff7e8" stopOpacity=".08" />
        </linearGradient>
      </defs>
      <polyline points={`0,82 ${points} 100,82`} className="trend-fill" />
      <motion.polyline points={points} className="trend-stroke" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.62, ease: 'easeOut' }} />
    </svg>
  );
}

function isBigTripItem(receipt: Receipt): boolean {
  return receipt.category === 'flight' || receipt.category === 'lodging' || receipt.category === 'transport';
}

function categoryTotals(receipts: Receipt[]) {
  const known = new Set(CATEGORIES.map((c) => c.id));
  const totals = CATEGORIES.map((c) => ({ ...c, total: receipts.filter((r) => r.category === c.id).reduce((s, r) => s + r.total, 0) })).filter((x) => x.total > 0);
  const unknownTotal = receipts.filter((r) => !known.has(r.category as CategoryId)).reduce((s, r) => s + r.total, 0);
  return unknownTotal > 0 ? [...totals, { id: 'unknown', icon: '?', name: '未分類', color: '#6b7280', total: unknownTotal }] : totals;
}

function paymentTotals(receipts: Receipt[]) {
  const known = new Set(PAYMENTS.map((p) => p.id));
  const totals = PAYMENTS.map((p) => ({ ...p, total: receipts.filter((r) => r.payment === p.id).reduce((s, r) => s + r.total, 0) })).filter((x) => x.total > 0);
  const unknownTotal = receipts.filter((r) => !known.has(r.payment as PaymentId)).reduce((s, r) => s + r.total, 0);
  return unknownTotal > 0 ? [...totals, { id: 'unknown', name: '其他方式', color: '#6b7280', total: unknownTotal }] : totals;
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
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, value / total * 100)}%` }}
          transition={{ duration: 0.38, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
