import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { motion } from 'motion/react';
import { BarChart3, ChevronRight, Info, Pencil, PieChart, ReceiptText, TrendingUp, Trophy, Users, WalletCards } from 'lucide-react';
import { CATEGORIES, PAYMENTS } from '../lib/constants';
import { activeTrip, scopedReceiptsForTrip } from '../domain/trip/normalize';
import { categoryById, computeSettlements, displayStore, fmt, getItinerary, getPersons, getReceiptHkdAmount, getReceiptTripAmount, getResolvedTripCurrency } from '../lib/domain';
import type { AppState, CategoryId, PaymentId, Receipt } from '../lib/types';
import { amountToHkd, formatCurrencyAmount, hkdToCurrency } from '../lib/currency';
import { needsTranslation, splitInlineTranslation, translateStoreNames } from '../lib/storeTranslation';
import { EmptyState, GlassCard, StatusPill, TickerMoney } from '../components/ui';
import { AvatarBadge } from '../components/AvatarBadge';
import { VisualIcon } from '../components/VisualIcon';
import { categoryIconId } from '../lib/iconManifest';
import '../styles/stats.css';

type StatBucket = { id: string; name: string; color: string; total: number; icon?: string };

export function Stats({ state, setState, updateState, onTab }: { state: AppState; setState?: Dispatch<SetStateAction<AppState>>; updateState: (patch: Partial<AppState>) => void; onTab?: (tab: any) => void }) {
  const trip = activeTrip(state);
  const scopedState = { ...state, receipts: scopedReceiptsForTrip(state, trip) };
  const settlement = computeSettlements(scopedState);
  const persons = getPersons(state);
  const itinerary = getItinerary(state);
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
  const analysisReceipts = scopedState.receipts.filter((r) => state.statsIncludeTransportLodging || !isBigTripItem(r));
  const catTotals = categoryTotals(analysisReceipts, state, resolvedTripCurrency);
  const payTotals = paymentTotals(analysisReceipts, state, resolvedTripCurrency);
  const analysisTotal = analysisReceipts.reduce((s, r) => s + getReceiptTripAmount(r, state, resolvedTripCurrency), 0);
  const trueTotal = scopedState.receipts.reduce((s, r) => s + getReceiptTripAmount(r, state, resolvedTripCurrency), 0);
  const maxPersonTotal = Math.max(1, ...persons.map((_, i) => settlement.sharedByPayer[i] + settlement.privateByOwner[i]));
  const settlementActionPlan = buildSettlementActionPlan(settlement, resolvedTripCurrency, toHkd);
  const topReceipts = scopedState.receipts
    .filter((r) => state.top10IncludeBigItems || !isFlightOrHotelItem(r))
    .slice()
    .sort((a, b) => getReceiptHkdAmount(b, state) - getReceiptHkdAmount(a, state))
    .slice(0, 10);
  const topStoreDisplay = useMemo(() => topReceipts.map((r) => {
    const rawName = displayStore(r);
    const inline = splitInlineTranslation(rawName);
    return {
      id: r.id,
      rawName,
      original: inline ? inline.original : rawName,
      translated: inline ? inline.translated : (needsTranslation(rawName) ? state.storeTranslations?.[rawName]?.t : undefined),
      hasInline: !!inline,
    };
  }), [topReceipts, state.storeTranslations]);
  const topNamesKey = topStoreDisplay.map((d) => d.rawName).join('§');
  const translationInFlightRef = useRef(false);
  const attemptedStoreNamesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // Seed the cache with translations already inline in the store string (e.g. "桜町商店 (櫻町商店)")
    // so future renders/sessions skip the AI call entirely for these names.
    const inlineSeeds = topStoreDisplay.filter((d) => d.hasInline && d.translated);
    if (inlineSeeds.length) {
      const existing = state.storeTranslations || {};
      const toSeed = inlineSeeds.filter((seed) => existing[seed.rawName]?.t !== seed.translated);
      if (toSeed.length) {
        const now = Date.now();
        const patch = { ...existing };
        for (const seed of toSeed) patch[seed.rawName] = { t: seed.translated!, at: now };
        updateState({ storeTranslations: patch });
      }
    }

    const namesNeeding = Array.from(new Set(
      topStoreDisplay
        .filter((d) => !d.hasInline && needsTranslation(d.rawName) && !state.storeTranslations?.[d.rawName]?.t && !attemptedStoreNamesRef.current.has(d.rawName))
        .map((d) => d.rawName)
    ));
    if (!namesNeeding.length || translationInFlightRef.current) return;

    translationInFlightRef.current = true;
    namesNeeding.forEach((name) => attemptedStoreNamesRef.current.add(name));
    translateStoreNames(state, namesNeeding)
      .then((result) => {
        if (!result || !Object.keys(result).length) return;
        const now = Date.now();
        const patch = { ...(state.storeTranslations || {}) };
        for (const [name, translated] of Object.entries(result)) patch[name] = { t: translated, at: now };
        updateState({ storeTranslations: patch });
      })
      .catch(() => {})
      .finally(() => {
        translationInFlightRef.current = false;
      });
    // Only re-run when the visible TOP 10 name list actually changes — avoids refetch loops
    // when updateState() above triggers a re-render with the same names.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topNamesKey]);
  const trend = Object.entries(analysisReceipts.reduce<Record<string, number>>((acc, r) => {
    acc[r.date] = (acc[r.date] || 0) + getReceiptTripAmount(r, state, resolvedTripCurrency);
    return acc;
  }, {})).sort(([a], [b]) => a.localeCompare(b));
  const tripDayCount = Math.max(1, itinerary.length || trend.length);
  const dailyBudget = Math.round((Number(state.budget) || 0) / tripDayCount);
  const dailyAverage = Math.round(trueTotal / tripDayCount);
  const overBudgetDays = trend.filter(([, total]) => dailyBudget > 0 && total > dailyBudget).length;
  const budgetStory = buildBudgetStoryCards({
    budget: Number(state.budget) || 0,
    analysisTotal,
    tripDayCount,
    trend,
    itinerary,
    resolvedTripCurrency,
    toHkd,
  });

  return (
    <section className="japanese-washi-bg w-full min-h-screen px-4 pb-28 pt-6 relative overflow-y-auto stats-tab stats-cockpit stats-screen preview-stats-screen">
      <div className="stack w-full relative z-10 preview-stats-grid">
      <GlassCard className="stats-command preview-stats-budget">
        <div className="stats-command-title-row">
          <h2 className="stats-command-title">預算使用分析</h2>
          <span className="stats-record-pill">
            <StatusPill tone="info" icon={<ReceiptText size={14} />}>{analysisReceipts.length} 筆紀錄</StatusPill>
          </span>
        </div>
        <SpendingCompass categories={catTotals} total={trueTotal} budget={Number(state.budget) || 0} dailyBudget={dailyBudget} dailyAverage={dailyAverage} state={state} setState={setState} updateState={updateState} onTab={onTab} />
      </GlassCard>

      <DataPanel
        className="top-expenses-panel"
        icon={<Trophy size={19} />}
        title="TOP 10 支出"
        status={<TopTenToggle includeBigItems={state.top10IncludeBigItems} onChange={(value) => updateState({ top10IncludeBigItems: value })} />}
      >
        {topReceipts.length ? topReceipts.map((r, idx) => {
          const cat = categoryById(r.category);
          const display = topStoreDisplay[idx];
          const showTranslation = !!display?.translated && display.translated !== display.original;
          return (
            <motion.div className="rank-row rank-modern" key={r.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22, delay: idx * 0.015 }}>
              <b>{idx + 1}</b>
              <span>
                <VisualIcon id={categoryIconId(r.category)} label={cat.name} size="sm" /> {display?.original ?? displayStore(r)}
                {showTranslation && <span className="rank-store-translation">{display!.translated}</span>}
              </span>
              <strong>{formatCurrencyAmount(r.total, r.currency || resolvedTripCurrency)}</strong>
            </motion.div>
          );
        }) : <EmptyState title="未有紀錄" description="支出紀錄會按金額由高至低排列。" />}
      </DataPanel>

      <section className="stats-story-grid" aria-label="Budget story cards">
        {budgetStory.map((card) => (
          <motion.article
            className={`stats-story-card tone-${card.tone}`}
            key={card.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.detail}</small>
          </motion.article>
        ))}
      </section>

      <DataPanel
        className="trend-panel preview-daily-pace"
        icon={<TrendingUp size={19} />}
        title="每日 Budget Pace"
        status={<StatusPill tone={overBudgetDays ? 'warning' : 'ok'}>{overBudgetDays ? `${overBudgetDays} 日超支` : '未超支'}</StatusPill>}
      >
        {trend.length ? <BudgetPaceChart trend={trend} dailyBudget={dailyBudget} dailyAverage={dailyAverage} state={state} /> : null}
        {trend.length ? trend.map(([date, total]) => <Bar key={date} label={date} value={total} state={{ ...scopedState, receipts: analysisReceipts }} color={dailyBudget > 0 && total > dailyBudget ? '#C23B5E' : '#2d5a8e'} />) : <EmptyState title="未有紀錄" description="新增跨日期 receipt 後會形成趨勢。" />}
      </DataPanel>

      <DataPanel
        className="settlement-card"
        icon={<Users size={19} />}
        title="分帳結算"
        status={<StatusPill tone={settlement.transfers.length ? 'warning' : 'ok'}>{settlement.transfers.length ? '需要結算' : '不用轉帳'}</StatusPill>}
      >
        {settlement.transfers.length ? (
          <>
            <section className="settlement-action-plan" aria-label="Settlement action plan">
              {settlementActionPlan.map((item) => (
                <motion.article
                  className={`settlement-action-card ${item.tone}`}
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, ease: 'easeOut' }}
                >
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                  <small>{item.detail}</small>
                </motion.article>
              ))}
            </section>

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
                <div className="flex flex-col items-end shrink-0 leading-none">
                  <strong className="text-[15px] font-extrabold text-blue-900">HK$ {fmt(toHkd(t.amount))}</strong>
                  <span className="text-[10px] text-slate-400 font-bold mt-1">
                    {resolvedTripCurrency === 'JPY' ? '¥' : resolvedTripCurrency + ' '}{fmt(t.amount)}
                  </span>
                </div>
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

function SpendingCompass({ categories, total, budget, dailyBudget, dailyAverage, state, setState, updateState, onTab }: { categories: StatBucket[]; total: number; budget: number; dailyBudget: number; dailyAverage: number; state: AppState; setState?: Dispatch<SetStateAction<AppState>>; updateState: (patch: Partial<AppState>) => void; onTab?: (tab: any) => void }) {
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [editBudgetVal, setEditBudgetVal] = useState('');
  const trip = activeTrip(state);
  const resolvedTripCurrency = getResolvedTripCurrency(state, trip);

  const scopedReceipts = scopedReceiptsForTrip(state, trip);
  const totalTrip = scopedReceipts.reduce((s, r) => s + getReceiptTripAmount(r, state, resolvedTripCurrency), 0);
  const totalHkd = scopedReceipts.reduce((s, r) => s + getReceiptHkdAmount(r, state), 0);

  const displayCurrency = state.displayCurrency || 'HKD';
  const showTripCurrency = displayCurrency !== 'HKD';

  const activeTotal = showTripCurrency ? totalTrip : totalHkd;
  const activeBudget = showTripCurrency
    ? (Number(state.budget) || 0)
    : Math.round(amountToHkd(Number(state.budget) || 0, resolvedTripCurrency, state));

  const slices = categorySlices(categories, totalTrip);
  const top = slices[0];
  const safeBudget = Math.max(0, activeBudget);
  const usedPercent = safeBudget > 0 ? Math.round(activeTotal / safeBudget * 100) : 0;
  const shownPercent = safeBudget > 0 ? `${usedPercent}%` : '--';
  const remaining = Math.max(0, safeBudget - activeTotal);
  const overBudget = safeBudget > 0 && activeTotal > safeBudget;
  const ring = budgetRingGradient(usedPercent);
  const delta = overBudget ? activeTotal - safeBudget : remaining;

  const fmtValue = (amt: number) => {
    return formatCurrencyAmount(amt, displayCurrency);
  };

  const activeDailyBudget = showTripCurrency
    ? dailyBudget
    : Math.round(amountToHkd(dailyBudget, resolvedTripCurrency, state));

  const activeDailyAverage = showTripCurrency
    ? dailyAverage
    : Math.round(amountToHkd(dailyAverage, resolvedTripCurrency, state));

  const activeTopTotal = top
    ? (showTripCurrency
        ? top.total
        : Math.round(amountToHkd(top.total, resolvedTripCurrency, state)))
    : 0;

  const handleUpdateBudget = (newBudgetVal: string) => {
    const rawInput = Number(newBudgetVal) || 0;
    // When editing in HKD mode, convert back to trip currency for storage
    const newBudget = showTripCurrency
      ? rawInput
      : Math.round(hkdToCurrency(rawInput, resolvedTripCurrency, state));
    if (setState) {
      const now = Date.now();
      const nextTrip = {
        ...trip,
        budget: newBudget,
        version: (trip.version || 0) + 1,
        updatedAt: now,
      };

      const queueItem = {
        id: `sync_${now}_${Math.random().toString(16).slice(2)}`,
        type: 'trip' as const,
        entityId: trip.id,
        op: 'update' as const,
        status: 'queued' as const,
        attempts: 0,
        createdAt: now,
        updatedAt: now,
        payload: {
          sourceId: nextTrip.sourceId || `trip_${nextTrip.id}`,
          updatedAt: nextTrip.updatedAt,
        },
      };

      setState((prev: AppState) => ({
        ...prev,
        budget: newBudget,
        trips: (prev.trips || []).map((t) => t.id === trip.id ? nextTrip : t),
        syncQueue: [
          ...(prev.syncQueue || []),
          queueItem,
        ].slice(-500),
      }));
    } else {
      updateState({ budget: newBudget });
    }
    setIsEditingBudget(false);
  };

  return (
    <div className={`spending-compass ${overBudget ? 'is-over-budget' : ''}`.trim()} aria-label={`預算使用分析，已用 ${shownPercent}，支出 ${fmtValue(activeTotal)}，預算 ${fmtValue(safeBudget)}`} style={{ '--compass-ring': ring } as CSSProperties}>
      <div className="preview-budget-heading">
        <span>預算羅盤</span>
        <Info size={17} aria-hidden="true" />
        <div className="preview-budget-currency" role="group" aria-label="顯示貨幣">
          <button
            type="button"
            className={displayCurrency === 'HKD' ? 'is-active' : ''}
            onClick={() => updateState({ displayCurrency: 'HKD' })}
            style={{ cursor: 'pointer' }}
          >
            HKD
          </button>
          <button
            type="button"
            className={displayCurrency === resolvedTripCurrency ? 'is-active' : ''}
            onClick={() => updateState({ displayCurrency: resolvedTripCurrency })}
            style={{ cursor: 'pointer' }}
          >
            {resolvedTripCurrency}
          </button>
        </div>
      </div>
      <div className="preview-budget-overview">
        <div className="preview-budget-main">
          <div className="spending-compass-ring" aria-hidden="true">
            <div className="spending-compass-copy">
              <span>預算使用</span>
              <strong>{safeBudget > 0 ? <TickerMoney text={shownPercent} /> : shownPercent}</strong>
              <small>{safeBudget > 0 ? (overBudget ? '已超預算' : '已使用') : '未設定預算'}</small>
              <b><TickerMoney text={fmtValue(activeTotal)} /></b>
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
            {isEditingBudget ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  className="w-20 text-sm px-1 py-0.5 rounded border border-gray-300 text-slate-800"
                  value={editBudgetVal}
                  onChange={(e) => setEditBudgetVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleUpdateBudget(editBudgetVal);
                    }
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="text-xs bg-slate-800 text-white px-2 py-0.5 rounded"
                  onClick={() => {
                    handleUpdateBudget(editBudgetVal);
                  }}
                >
                  儲存
                </button>
              </div>
            ) : (
              <>
                <strong>{safeBudget > 0 ? fmtValue(safeBudget) : '未設定'}</strong>
                <button
                  type="button"
                  aria-label="編輯預算"
                  onClick={() => {
                    // Show the value in the currently active display currency
                    const initVal = showTripCurrency
                      ? String(state.budget || '')
                      : String(Math.round(amountToHkd(Number(state.budget) || 0, resolvedTripCurrency, state)) || '');
                    setEditBudgetVal(initVal);
                    setIsEditingBudget(true);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <Pencil size={15} aria-hidden="true" /> 編輯
                </button>
              </>
            )}
          </div>
          <div className="preview-budget-row is-used">
            <span>已用</span>
            <strong><TickerMoney text={fmtValue(activeTotal)} /></strong>
          </div>
          <div className="preview-budget-row">
            <span>{overBudget ? '超出預算' : '尚餘預算'}</span>
            <strong><TickerMoney text={fmtValue(delta)} /></strong>
          </div>
          <div className="preview-budget-row preview-budget-stack">
            <span>每日預算</span>
            <strong>{fmtValue(activeDailyBudget)}</strong>
            <span>日均結餘</span>
            <strong>{fmtValue(Math.max(0, activeDailyBudget - activeDailyAverage))}</strong>
          </div>
          <div className="preview-budget-row preview-budget-stack">
            <span>最高類別</span>
            <strong>{top ? top.name : '未有分類'}</strong>
            <small>{top ? fmtValue(activeTopTotal) : '新增 receipt 後顯示'}</small>
          </div>
        </div>
      </div>
      <div
        className="preview-budget-reminder"
        onClick={() => onTab?.('settings')}
        style={{ cursor: 'pointer' }}
      >
        <span>預算提醒：每日平均使用需 ≤ {fmtValue(activeDailyBudget || 0)}</span>
        <ChevronRight size={20} aria-hidden="true" />
      </div>
    </div>
  );
}

type BudgetStoryInput = {
  budget: number;
  analysisTotal: number;
  tripDayCount: number;
  trend: Array<[string, number]>;
  itinerary: ReturnType<typeof getItinerary>;
  resolvedTripCurrency: string;
  toHkd: (amt: number) => number;
};

function buildBudgetStoryCards({
  budget,
  analysisTotal,
  tripDayCount,
  trend,
  itinerary,
  resolvedTripCurrency,
  toHkd,
}: BudgetStoryInput) {
  const safeBudget = Math.max(0, budget);
  const usedPercent = safeBudget > 0 ? Math.round(analysisTotal / safeBudget * 100) : 0;
  const remaining = Math.max(0, safeBudget - analysisTotal);
  const remainingDays = remainingTripDays(tripDayCount, trend, itinerary);
  const remainingPerDay = Math.round(remaining / remainingDays);

  const formatTrip = (amt: number) => `${resolvedTripCurrency === 'JPY' ? '¥' : resolvedTripCurrency + ' '}${fmt(amt)}`;
  const formatHkd = (amt: number) => `HK$ ${fmt(toHkd(amt))}`;

  return [
    {
      id: 'used-percent',
      label: 'Used percent',
      value: safeBudget > 0 ? `${usedPercent}%` : '未設定',
      detail: safeBudget <= 0 ? '先到 Settings 加預算' : usedPercent >= 100 ? `超出 ${formatTrip(analysisTotal - safeBudget)}` : `尚餘 ${formatTrip(remaining)} · ${formatHkd(remaining)}`,
      tone: usedPercent >= 100 ? 'danger' : usedPercent >= 80 ? 'warning' : 'ok',
    },
    {
      id: 'remaining-day',
      label: 'Remaining / day',
      value: formatTrip(remainingPerDay),
      detail: `${remainingDays} 日口徑 · 等值 ${formatHkd(remainingPerDay)}`,
      tone: remainingPerDay <= 0 && safeBudget > 0 ? 'danger' : remainingPerDay < Math.max(1, budget / tripDayCount * 0.35) ? 'warning' : 'ok',
    },
  ] as const;
}

function buildSettlementActionPlan(
  settlement: ReturnType<typeof computeSettlements>,
  resolvedTripCurrency: string,
  toHkd: (amt: number) => number,
) {
  const transferTotal = settlement.transfers.reduce((sum, item) => sum + item.amount, 0);
  const firstTransfer = settlement.transfers[0];
  const receiverCount = new Set(settlement.transfers.map((item) => item.to.id)).size;
  const crossPrivateTotal = settlement.crossPrivate.reduce((sum, item) => sum + item.amount, 0);
  const formatTrip = (amt: number) => `${resolvedTripCurrency === 'JPY' ? '¥' : resolvedTripCurrency + ' '}${fmt(amt)}`;
  const formatHkd = (amt: number) => `HK$ ${fmt(toHkd(amt))}`;

  return [
    {
      id: 'next-transfer',
      label: 'Next action',
      value: firstTransfer ? `${firstTransfer.from.name} → ${firstTransfer.to.name}` : '已平衡',
      detail: firstTransfer ? `${formatTrip(firstTransfer.amount)} · ${formatHkd(firstTransfer.amount)}` : '暫時不用轉帳',
      tone: firstTransfer ? 'danger' : 'ok',
    },
    {
      id: 'transfer-total',
      label: 'Total to settle',
      value: formatHkd(transferTotal),
      detail: `${settlement.transfers.length} 筆轉帳 · ${receiverCount || 0} 位收款人`,
      tone: transferTotal > 0 ? 'warning' : 'ok',
    },
    {
      id: 'private-repay',
      label: 'Private repay',
      value: formatTrip(crossPrivateTotal),
      detail: settlement.crossPrivate.length ? `${settlement.crossPrivate.length} 筆私人代付已納入結算` : '未有私人代付',
      tone: settlement.crossPrivate.length ? 'warning' : 'ok',
    },
  ] as const;
}

function remainingTripDays(tripDayCount: number, trend: Array<[string, number]>, itinerary: ReturnType<typeof getItinerary>) {
  const today = new Date().toISOString().slice(0, 10);
  const dates = (itinerary.length ? itinerary.map((day) => day.date) : trend.map(([date]) => date)).filter(Boolean).sort();
  if (!dates.length) return Math.max(1, tripDayCount);
  const elapsed = today < dates[0]
    ? 1
    : today > dates[dates.length - 1]
      ? tripDayCount
      : Math.max(1, dates.filter((date) => date <= today).length);
  return Math.max(1, tripDayCount - elapsed + 1);
}

function TopTenToggle({ includeBigItems, onChange }: { includeBigItems: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="top10-toggle" role="group" aria-label="TOP 10 支出篩選">
      <button type="button" className={includeBigItems ? 'active' : ''} aria-pressed={includeBigItems} onClick={() => onChange(true)}>全項目</button>
      <button type="button" className={!includeBigItems ? 'active' : ''} aria-pressed={!includeBigItems} onClick={() => onChange(false)}>除了機票和酒店</button>
    </div>
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
        <span><b><TickerMoney text={overDays.length} /></b><small>超支日</small></span>
        <span><b><TickerMoney text={`${currencySymbol}${fmt(dailyBudget)}`} /></b><small>每日預算線</small></span>
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
  // --compass-reveal (0→1, animated in styles.css) sweeps the ring open on entry.
  if (usedPercent >= 100) return 'conic-gradient(#C23B5E 0deg calc(360deg * var(--compass-reveal, 1)), rgba(232,221,208,.84) calc(360deg * var(--compass-reveal, 1)) 360deg)';
  const stop = `calc(${usedDeg.toFixed(1)}deg * var(--compass-reveal, 1))`;
  return `conic-gradient(#C23B5E 0deg ${stop}, #D4A843 ${stop} 360deg)`;
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
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, value / total * 100)}%` }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}
