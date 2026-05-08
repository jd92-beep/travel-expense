import { useMemo, useState } from 'react';
import { CalendarDays, MapPin, Plus, ReceiptText, WalletCards, X } from 'lucide-react';
import { ActionSheet, GlassCard, MetricCard, ProgressRing, StatusPill } from '../components/ui';
import { categoryById, displayStore, fmt, getItinerary, getReceiptPhase, getPersons, hkd, isPendingReceipt, mapsUrl, receiptRegion, safeExternalUrl, todayForReceipts } from '../lib/domain';
import { activeTrip } from '../domain/trip/normalize';
import type { AppState, ItinerarySpot, Receipt, TabId } from '../lib/types';

type DashboardSheet =
  | { kind: 'day-receipts' }
  | { kind: 'spot'; spot: ItinerarySpot };

export function Dashboard({ state, onOpen, onTab, onManual }: { state: AppState; onOpen: (receipt: Receipt) => void; onTab: (tab: TabId) => void; onManual: () => void }) {
  const [sheet, setSheet] = useState<DashboardSheet | null>(null);
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
  const budgetPct = state.budget > 0 ? Math.min(100, totalForBudget / state.budget * 100) : 0;
  const prepTotal = prepReceipts.reduce((s, r) => s + r.total, 0);
  const postTotal = postReceipts.reduce((s, r) => s + r.total, 0);
  const dailyAverage = Math.round(totalForBudget / Math.max(1, itinerary.length));
  const spendDays = new Set(totalReceipts.map((r) => r.date)).size;

  return (
    <section className="stack">
      {pending.length > 0 && <button className="notice notice-button" type="button" onClick={() => onTab('history')}>有 {pending.length} 筆 email 待確認，tap 去紀錄 tab 處理。</button>}
      <GlassCard className="dashboard-hero">
        <div>
          <p className="eyebrow">Active Trip</p>
          <h2>{trip.name}</h2>
          <p className="muted">{trip.destinationSummary}</p>
        </div>
        <div className="dashboard-hero-meta">
          <StatusPill tone="info" icon={<CalendarDays size={14} />}>{trip.startDate} → {trip.endDate}</StatusPill>
          <StatusPill tone={flipped ? 'ok' : 'warning'} icon={<WalletCards size={14} />}>{flipped ? '包括交通住宿' : '日常支出模式'}</StatusPill>
        </div>
        <ActionSheet>
          <button className="secondary" type="button" onClick={onManual}><Plus size={18} /> 手動記一筆</button>
          <button className="secondary" type="button" onClick={() => setSheet({ kind: 'day-receipts' })}><ReceiptText size={18} /> 今日紀錄</button>
          <button className="secondary" type="button" onClick={() => onTab('timeline')}><CalendarDays size={18} /> 行程</button>
        </ActionSheet>
      </GlassCard>

      <GlassCard className="budget-card dashboard-budget">
        <div className="section-head">
          <div>
            <p className="eyebrow">Budget</p>
            <h2>預算進度</h2>
          </div>
          <ProgressRing value={budgetPct} label="已用" />
        </div>
        <div className="bar-track tall"><i style={{ width: `${budgetPct}%`, background: budgetPct > 90 ? '#dc2626' : '#cc2929' }} /></div>
        <p className="muted">
          HK$ {fmt(hkd(totalForBudget, state))} / {fmt(hkd(state.budget, state))} · 餘 ¥{fmt(Math.max(0, state.budget - totalForBudget))}
        </p>
      </GlassCard>
      {overDaily && (
        <div className="notice">
          今日已超過日均上限：¥{fmt(todayTotal)} / ¥{fmt(dailyBudget)}
        </div>
      )}
      <div className="metric-grid">
        <MetricCard label="今日" value={`¥${fmt(todayTotal)}`} detail={`HK$ ${fmt(hkd(todayTotal, state))} · ${dailyReceipts.length} 筆`} tone={overDaily ? 'danger' : 'accent'} />
        <MetricCard label="總消費" value={`¥${fmt(total)}`} detail={`HK$ ${fmt(hkd(total, state))} · ${totalReceipts.length} 筆`} />
        <MetricCard label="日均" value={`¥${fmt(dailyAverage)}`} detail={`${spendDays} 個有消費日 · 上限 ¥${fmt(dailyBudget)}`} tone={overDaily ? 'danger' : 'neutral'} />
        <MetricCard label="準備階段" value={`¥${fmt(prepTotal)}`} detail={`${prepReceipts.length} 筆行前支出`} tone="success" />
      </div>
      {prepReceipts.length > 0 && (
        <div className="card prep-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Prep Summary</p>
              <h2>行前支出 ¥{fmt(prepTotal)}</h2>
            </div>
            <button className="secondary" type="button" onClick={onManual}>+ 手動記一筆</button>
          </div>
          {prepReceipts.slice(-3).reverse().map((r) => <ReceiptRow key={r.id} state={state} receipt={r} onOpen={onOpen} />)}
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
          {postReceipts.slice(-3).reverse().map((r) => <ReceiptRow key={r.id} state={state} receipt={r} onOpen={onOpen} />)}
        </div>
      )}
      <div className="card">
        <div className="section-head">
          <div>
            <p className="eyebrow">今日行程</p>
            <h2>{day?.region || '未設定'}</h2>
          </div>
          <span className="pill">{today}</span>
        </div>
        <div className="timeline-mini">
          {(day?.spots || []).map((spot) => (
            <button className="timeline-mini-row" type="button" key={`${spot.time}-${spot.name}`} onClick={() => setSheet({ kind: 'spot', spot })}>
              <span>{spot.time}</span>
              <strong>
                {spot.name}
                <small>{spot.address || spot.note || 'Tap 查看詳情'}</small>
              </strong>
              <em>{categoryById(spot.type).icon}</em>
            </button>
          ))}
        </div>
      </div>
      {persons.length > 1 && (
        <div className="card">
          <h2>付款人概覽</h2>
          <div className="person-grid">
            {persons.map((p) => {
              const paid = tripReceipts.filter((r) => (r.personId || persons[0].id) === p.id).reduce((s, r) => s + r.total, 0);
              return <div key={p.id} className="person-card"><span>{p.emoji}</span><strong>{p.name}</strong><b>¥{fmt(paid)}</b></div>;
            })}
          </div>
        </div>
      )}
      <div className="card">
        <div className="section-head">
          <h2>今日紀錄</h2>
          <button className="secondary compact" type="button" onClick={() => setSheet({ kind: 'day-receipts' })}>{dailyReceipts.length} 筆</button>
        </div>
        {dailyReceipts.length ? dailyReceipts.slice().reverse().map((r) => <ReceiptRow key={r.id} state={state} receipt={r} onOpen={onOpen} />) : <p className="empty">今日仲未有紀錄。</p>}
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
                  <span className="cat">{categoryById(sheet.spot.type).icon}</span>
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
                  <ReceiptRow key={r.id} state={state} receipt={r} onOpen={(receipt) => { setSheet(null); onOpen(receipt); }} />
                )) : <p className="empty">今日仲未有紀錄。</p>}
                <button className="primary" type="button" onClick={() => { setSheet(null); onManual(); }}><Plus size={18} /> 新增今日紀錄</button>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

export function ReceiptRow({ state, receipt, onOpen }: { state: AppState; receipt: Receipt; onOpen: (receipt: Receipt) => void }) {
  const cat = categoryById(receipt.category);
  const persons = getPersons(state);
  const person = persons.find((p) => p.id === (receipt.personId || persons[0].id)) || persons[0];
  const beneficiary = receipt.splitMode === 'private' && receipt.beneficiaryId && receipt.beneficiaryId !== receipt.personId
    ? persons.find((p) => p.id === receipt.beneficiaryId)
    : null;
  const photoSrc = receipt.photoUrl || (receipt.photoThumb ? `data:image/jpeg;base64,${receipt.photoThumb}` : '');
  return (
    <div className="receipt-row" role="button" tabIndex={0} onClick={() => onOpen(receipt)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(receipt); }}>
      <span className="cat" style={{ background: `${cat.color}22`, color: cat.color }}>{cat.icon}</span>
      <span className="receipt-main">
        <strong>
          {isPendingReceipt(receipt) ? '⏳ ' : ''}
          {beneficiary ? '🎁 ' : receipt.splitMode === 'private' ? '🔒 ' : ''}
          {displayStore(receipt)}
          {photoSrc && <i className="row-badge">📷</i>}
        </strong>
        <small>
          {[receipt.time, cat.name, receiptRegion(state, receipt), `${person.emoji} ${person.name}`, beneficiary ? `代 ${beneficiary.name}` : '', receipt.bookingRef ? `編號 ${receipt.bookingRef}` : ''].filter(Boolean).join(' · ')}
        </small>
        {receipt.address && <a className="map-link" href={mapsUrl(displayStore(receipt), receipt.address)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>地圖：{receipt.address}</a>}
      </span>
      <span className="amount">¥{fmt(receipt.total)}<small>HK$ {fmt(hkd(receipt.total, state))}</small></span>
    </div>
  );
}
