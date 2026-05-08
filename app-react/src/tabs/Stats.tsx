import { BarChart3, HandCoins, PieChart, ReceiptText, TrendingUp, Trophy, Users, WalletCards } from 'lucide-react';
import { CATEGORIES, PAYMENTS } from '../lib/constants';
import { activeTrip } from '../domain/trip/normalize';
import { categoryById, computeSettlements, displayStore, fmt, getPersons, hkd } from '../lib/domain';
import type { AppState, CategoryId, PaymentId, Receipt } from '../lib/types';
import { EmptyState, GlassCard, MetricCard, ProgressRing, StatusPill } from '../components/ui';

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
    <section className="stack stats-tab">
      <GlassCard className="stats-command">
        <div>
          <small className="eyebrow">SETTLEMENT / INSIGHTS</small>
          <h2>分帳統計中心</h2>
          <p>按 active trip 計算分帳、類別、支付方式、Top 10 同每日趨勢。</p>
          <div className="stats-status-row">
            <StatusPill tone="info" icon={<ReceiptText size={14} />}>{scopedState.receipts.length} 筆紀錄</StatusPill>
            <StatusPill tone={settlement.transfers.length ? 'warning' : 'ok'} icon={<HandCoins size={14} />}>
              {settlement.transfers.length ? `${settlement.transfers.length} 筆轉帳` : '已平衡'}
            </StatusPill>
          </div>
        </div>
        <ProgressRing value={Math.min(100, scopedState.receipts.length ? analysisReceipts.length / scopedState.receipts.length * 100 : 0)} label="統計範圍" />
      </GlassCard>

      <div className="metric-grid stats-metrics">
        <MetricCard label="統計總額" value={`¥${fmt(analysisTotal)}`} detail={`HK$ ${fmt(hkd(analysisTotal, state))}`} tone="accent" />
        <MetricCard label="共同支出" value={`¥${fmt(settlement.sharedTotal)}`} detail={`${persons.length} 人分帳`} />
        <MetricCard label="私人/代付" value={`¥${fmt(privateTotal)}`} detail={`${settlement.crossPrivate.length} 筆跨私人代付`} tone="success" />
        <MetricCard label="待轉帳" value={`¥${fmt(transferTotal)}`} detail={settlement.transfers.length ? '需要結算' : '暫時不用轉帳'} tone={settlement.transfers.length ? 'danger' : 'success'} />
      </div>

      <GlassCard className="stats-controls">
        <div>
          <h2>統計口徑</h2>
          <p>此開關同 Dashboard/Settings 使用同一個設定；分帳結算仍保留全數 receipts，避免漏計真正欠款。</p>
        </div>
        <div className="stats-toggle-row">
          <label className="check-row inline-check">
            <input type="checkbox" checked={state.statsIncludeTransportLodging} onChange={(e) => updateState({ statsIncludeTransportLodging: e.target.checked })} />
            包括交通/住宿於統計圖表
          </label>
          <label className="check-row inline-check">
            <input type="checkbox" checked={state.top10IncludeBigItems} onChange={(e) => updateState({ top10IncludeBigItems: e.target.checked })} />
            TOP 10 包括交通/住宿
          </label>
        </div>
      </GlassCard>

      <GlassCard className="settlement-card">
        <div className="section-head">
          <h2><Users size={19} /> 分帳結算</h2>
          <StatusPill tone={settlement.transfers.length ? 'warning' : 'ok'}>{settlement.transfers.length ? '需要結算' : '不用轉帳'}</StatusPill>
        </div>
        {settlement.transfers.length ? settlement.transfers.map((t) => (
          <div className="transfer transfer-modern" key={`${t.from.id}-${t.to.id}-${t.amount}`}>
            <span>{t.from.emoji} {t.from.name}</span><b>→</b><span>{t.to.emoji} {t.to.name}</span><strong>¥{fmt(t.amount)}</strong>
          </div>
        )) : <EmptyState title="暫時唔需要互相轉帳" description="所有共同支出與代付已經平衡。" />}
      </GlassCard>

      <GlassCard>
        <div className="section-head">
          <h2><WalletCards size={19} /> 付款人</h2>
          <StatusPill tone="neutral">全 receipts</StatusPill>
        </div>
        {persons.map((p, i) => (
          <Bar key={p.id} label={`${p.emoji} ${p.name}`} value={settlement.sharedByPayer[i] + settlement.privateByOwner[i]} max={maxPersonTotal} state={scopedState} color={p.color} />
        ))}
        {settlement.crossPrivate.length > 0 && (
          <div className="mini-list">
            {settlement.crossPrivate.map((cp) => <span key={cp.id}>代付：{cp.payer.name} 代 {cp.beneficiary.name} 付 ¥{fmt(cp.amount)} · {cp.store}</span>)}
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <div className="section-head">
          <h2><PieChart size={19} /> 類別</h2>
          <StatusPill tone="neutral">{state.statsIncludeTransportLodging ? '包含大額' : '日常支出'}</StatusPill>
        </div>
        {catTotals.length ? catTotals.map((c) => <Bar key={c.id} label={`${c.icon} ${c.name}`} value={c.total} state={{ ...scopedState, receipts: analysisReceipts }} color={c.color} />) : <EmptyState title="未有紀錄" description="新增 receipt 後會自動顯示類別分佈。" />}
      </GlassCard>

      <GlassCard>
        <div className="section-head">
          <h2><BarChart3 size={19} /> 支付方式</h2>
          <StatusPill tone="neutral">{payTotals.length} 種方式</StatusPill>
        </div>
        {payTotals.length ? payTotals.map((p) => <Bar key={p.id} label={p.name} value={p.total} state={{ ...scopedState, receipts: analysisReceipts }} color={p.color} />) : <EmptyState title="未有紀錄" description="現金、信用卡、PayPay、Suica 會分開統計。" />}
      </GlassCard>

      <GlassCard>
        <div className="section-head">
          <h2><Trophy size={19} /> TOP 10 支出</h2>
          <StatusPill tone="info">{state.top10IncludeBigItems ? '全項目' : '排除大額'}</StatusPill>
        </div>
        {topReceipts.length ? topReceipts.map((r, idx) => {
          const cat = categoryById(r.category);
          return <div className="rank-row rank-modern" key={r.id}><b>{idx + 1}</b><span>{cat.icon} {displayStore(r)}</span><strong>¥{fmt(r.total)}</strong></div>;
        }) : <EmptyState title="未有紀錄" description="支出紀錄會按金額由高至低排列。" />}
      </GlassCard>

      <GlassCard>
        <div className="section-head">
          <h2><TrendingUp size={19} /> 每日趨勢</h2>
          <StatusPill tone="neutral">{trend.length} 日</StatusPill>
        </div>
        {trend.length ? trend.map(([date, total]) => <Bar key={date} label={date} value={total} state={{ ...scopedState, receipts: analysisReceipts }} color="#2d5a8e" />) : <EmptyState title="未有紀錄" description="新增跨日期 receipt 後會形成趨勢。" />}
      </GlassCard>
    </section>
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

function Bar({ label, value, state, color, max }: { label: string; value: number; state: AppState; color: string; max?: number }) {
  const total = max || Math.max(1, state.receipts.reduce((s, r) => s + r.total, 0));
  const summary = `${label}: ¥${fmt(value)} / HK$ ${fmt(hkd(value, state))}`;
  return (
    <div className="bar-row" title={summary} aria-label={summary}>
      <div><span>{label}</span><b>¥{fmt(value)} · HK$ {fmt(hkd(value, state))}</b></div>
      <div className="bar-track"><i style={{ width: `${Math.min(100, value / total * 100)}%`, background: color }} /></div>
    </div>
  );
}
