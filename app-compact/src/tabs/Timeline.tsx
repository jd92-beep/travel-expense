import type { CSSProperties, Dispatch, FormEvent, SetStateAction } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeftRight, ArrowDownUp, CalendarDays, Home, MapPin, PencilLine, Plus, ReceiptText, RotateCcw, Trash2, Settings } from 'lucide-react';
import { ActionSheet, GlassCard, Reveal, StatusPill, TimelineRail } from '../components/ui';
import { MagicCard } from '../components/ui/magic-card';
import { ShineBorder } from '../components/ui/shine-border';
import { applyItineraryEdit, categoryById, dayLooseReceipts, fmt, getItinerary, getReceiptHkdAmount, getResolvedTripCurrency, getScheduleSpots, mapsUrl, safeExternalUrl, setItineraryOverride, swapItineraryDays, todayForReceipts, isSettlementReceipt } from '../lib/domain';
import { currencyPrefix } from '../lib/currency';
import { activeTrip, scopedReceiptsForTrip } from '../domain/trip/normalize';
import type { AppState, ItineraryDay, ItinerarySpot, Receipt } from '../lib/types';
import { ReceiptRow } from './Dashboard';
import { ReceiptPhotoModal } from '../components/ReceiptPhotoModal';
import { VisualIcon } from '../components/VisualIcon';
import { categoryIconId } from '../lib/iconManifest';
import { useModalOpenClass } from '../lib/useModalOpenClass';
import travelAiAtlas from '../assets/atmosphere/travel-ai-atlas.webp';
import '../styles/timeline.css';

type ScheduleSpot = ItinerarySpot & { _spotIdx: number; receiptId?: string };
type TimelineStatus = 'is-passed' | 'is-live' | 'is-future';

type TimelineLiveContext = {
  mode: 'active' | 'before' | 'after' | 'outside' | 'empty';
  date?: string;
  day?: number;
  region?: string;
  nowLabel: string;
  headline: string;
  detail: string;
  currentLabel: string;
  nextLabel: string;
};

export function Timeline({ state, setState, onOpen }: { state: AppState; setState: Dispatch<SetStateAction<AppState>>; onOpen: (receipt: Receipt) => void }) {
  const today = todayForReceipts(state);
  const tripPrefix = currencyPrefix(getResolvedTripCurrency(state, activeTrip(state)));
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [editing, setEditing] = useState<{ date: string; idx: number; original: ItinerarySpot } | null>(null);
  const [dayReceipts, setDayReceipts] = useState<string | null>(null);
  const [viewPhoto, setViewPhoto] = useState<Receipt | null>(null);
  const [dayEdit, setDayEdit] = useState<{ date: string; day: number; region: string; spots: ItinerarySpot[] } | null>(null);
  const [swapSource, setSwapSource] = useState<string | null>(null);
  const [swapConfirm, setSwapConfirm] = useState<{ sourceDate: string; targetDate: string } | null>(null);
  const itinerary = getItinerary(state);
  // Viewers of a shared trip can't push trip changes — they keep the local override layer.
  const canEditItinerary = activeTrip(state).sharing?.role !== 'viewer';
  const tripWindow = timelineTripWindow(itinerary);
  const activeDay = dayReceipts ? itinerary.find((day) => day.date === dayReceipts) : null;
  const looseReceipts = activeDay ? dayLooseReceipts(state, activeDay) : [];
  const hasOpenModal = Boolean(editing || activeDay || viewPhoto || dayEdit || swapSource);
  const travelAtlasStyle = { '--travel-ai-atlas': `url(${travelAiAtlas})` } as CSSProperties;
  const liveContext = timelineLiveContext(state, itinerary, nowTick, tripWindow);
  const commandDay = (liveContext.date ? itinerary.find((day) => day.date === liveContext.date) : null) || itinerary.find((day) => day.date === today) || itinerary[0];
  const commandDate = commandDay?.date ? new Date(`${commandDay.date}T00:00:00`) : null;
  const commandYear = commandDate && !Number.isNaN(commandDate.getTime()) ? String(commandDate.getFullYear()) : '----';
  const commandMonth = commandDate && !Number.isNaN(commandDate.getTime()) ? String(commandDate.getMonth() + 1) : '--';
  const commandDateDay = commandDate && !Number.isNaN(commandDate.getTime()) ? String(commandDate.getDate()) : '--';
  const commandWeekday = commandDate && !Number.isNaN(commandDate.getTime()) ? new Intl.DateTimeFormat('zh-HK', { weekday: 'long' }).format(commandDate) : '';

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const lastAutoScrollKeyRef = useRef('');
  const scrollToLiveTimelineSpot = useCallback((force = false) => {
    if (typeof window === 'undefined') return;
    // ponytail: native WebView snapshots can smear during forced scroll; keep the tab stable there.
    if (document.body.classList.contains('compact-native-android')) return;
    const targetDate = liveContext.date || commandDay?.date;
    if (!targetDate) return;

    const scrollKey = [
      liveContext.mode,
      targetDate,
      liveContext.currentLabel,
      liveContext.nextLabel,
    ].join('|');
    if (!force && lastAutoScrollKeyRef.current === scrollKey) return;
    lastAutoScrollKeyRef.current = scrollKey;

    let attempts = 0;
    const tryScroll = () => {
      const element = selectTimelineAutoScrollTarget(targetDate);
      if (element) {
        scrollTimelineElementIntoCenter(element);
        return;
      }
      attempts += 1;
      if (attempts <= 8) window.setTimeout(tryScroll, 120);
    };

    window.setTimeout(tryScroll, force ? 80 : 180);
  }, [commandDay?.date, liveContext.currentLabel, liveContext.date, liveContext.mode, liveContext.nextLabel]);

  useLayoutEffect(() => {
    scrollToLiveTimelineSpot();
  }, [scrollToLiveTimelineSpot]);

  useEffect(() => {
    const handleTimelineEntry = () => {
      if (window.location.hash.slice(1) !== 'timeline') return;
      lastAutoScrollKeyRef.current = '';
      scrollToLiveTimelineSpot(true);
    };
    window.addEventListener('hashchange', handleTimelineEntry);
    window.addEventListener('popstate', handleTimelineEntry);
    return () => {
      window.removeEventListener('hashchange', handleTimelineEntry);
      window.removeEventListener('popstate', handleTimelineEntry);
    };
  }, [scrollToLiveTimelineSpot]);

  useModalOpenClass(hasOpenModal);

  const editingContainerRef = useRef<HTMLDivElement>(null);
  const editingPrevFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!editing) return;
    editingPrevFocusRef.current = document.activeElement as HTMLElement;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setEditing(null); }
      if (e.key === 'Tab' && editingContainerRef.current) {
        const focusable = editingContainerRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('keydown', handleKeyDown); editingPrevFocusRef.current?.focus?.(); };
  }, [editing]);

  const dayReceiptsContainerRef = useRef<HTMLDivElement>(null);
  const dayReceiptsPrevFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!activeDay) return;
    dayReceiptsPrevFocusRef.current = document.activeElement as HTMLElement;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setDayReceipts(null); }
      if (e.key === 'Tab' && dayReceiptsContainerRef.current) {
        const focusable = dayReceiptsContainerRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('keydown', handleKeyDown); dayReceiptsPrevFocusRef.current?.focus?.(); };
  }, [activeDay]);

  useEffect(() => {
    if (!dayEdit && !swapSource) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setDayEdit(null); setSwapSource(null); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dayEdit, swapSource]);

  function saveSpot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const data = new FormData(event.currentTarget);
    const patch: Partial<ItinerarySpot> = {
      time: String(data.get('time') || ''),
      timeEnd: String(data.get('timeEnd') || '') || undefined,
      name: String(data.get('name') || ''),
      type: String(data.get('type') || 'other') as ItinerarySpot['type'],
      note: String(data.get('note') || ''),
      address: String(data.get('address') || ''),
    };
    const targetDate = String(data.get('moveDate') || editing.date);
    setState((prev) => {
      // Viewer: keep the legacy personal-override behaviour (can't push trip changes).
      if (activeTrip(prev).sharing?.role === 'viewer') {
        return setItineraryOverride(prev, editing.date, editing.idx, patch);
      }
      const current = getItinerary(prev);
      const srcDay = current.find((d) => d.date === editing.date);
      const spot = srcDay?.spots?.[editing.idx];
      if (!srcDay || !spot) return prev;
      const updated = { ...spot, ...patch };
      const next = targetDate === editing.date
        ? current.map((d) => d.date === srcDay.date
          ? { ...d, spots: d.spots.map((s, i) => (i === editing.idx ? updated : s)) }
          : d)
        : current.map((d) => {
          if (d.date === srcDay.date) return { ...d, spots: d.spots.filter((_, i) => i !== editing.idx) };
          if (d.date === targetDate) return { ...d, spots: [...(d.spots || []), updated] };
          return d;
        });
      // Direct write supersedes any stale personal override for this spot.
      const itineraryOverrides = { ...(prev.itineraryOverrides || {}) };
      const key = spot.spotId || spot.id;
      if (key) delete itineraryOverrides[key];
      return { ...applyItineraryEdit(prev, next), itineraryOverrides };
    });
    setEditing(null);
  }

  function deleteSpot() {
    if (!editing) return;
    if (!window.confirm(`刪除行程點「${editing.original.name}」？`)) return;
    setState((prev) => {
      const current = getItinerary(prev);
      const next = current.map((d) => d.date === editing.date
        ? { ...d, spots: (d.spots || []).filter((_, i) => i !== editing.idx) }
        : d);
      return applyItineraryEdit(prev, next);
    });
    setEditing(null);
  }

  function openDayEditor(day: ItineraryDay, withNewSpot = false) {
    const spots = (day.spots || []).map((s) => ({ ...s }));
    if (withNewSpot) spots.push({ time: getNextSpotDefaultTime(spots), name: '', type: 'sightseeing' });
    setDayEdit({ date: day.date, day: day.day, region: day.region, spots });
  }

  function saveDayEditor() {
    if (!dayEdit) return;
    const cleaned = dayEdit.spots
      .map((s) => ({ ...s, name: s.name.trim() }))
      .filter((s) => s.name);
    setState((prev) => {
      const next = getItinerary(prev).map((d) => d.date === dayEdit.date
        ? { ...d, region: dayEdit.region.trim() || d.region, spots: cleaned }
        : d);
      return applyItineraryEdit(prev, next);
    });
    setDayEdit(null);
  }

  function openSpotDetailFromDayEditor(spot: ItinerarySpot, idx: number) {
    if (!dayEdit) return;
    const cleaned: ItinerarySpot[] = [];
    let activeIdx = -1;
    for (let i = 0; i < dayEdit.spots.length; i++) {
      const s = dayEdit.spots[i];
      const name = s.name.trim() || (i === idx ? '新行程點' : '');
      if (name) {
        cleaned.push({ ...s, name });
        if (i === idx) {
          activeIdx = cleaned.length - 1;
        }
      }
    }

    setState((prev) => {
      const next = getItinerary(prev).map((d) => d.date === dayEdit.date
        ? { ...d, region: dayEdit.region.trim() || d.region, spots: cleaned }
        : d);
      return applyItineraryEdit(prev, next);
    });

    if (activeIdx !== -1) {
      setEditing({ date: dayEdit.date, idx: activeIdx, original: cleaned[activeIdx] });
    }
    setDayEdit(null);
  }

  const isDayEditDirty = () => {
    if (!dayEdit) return false;
    const original = itinerary.find((d) => d.date === dayEdit.date);
    if (!original) return false;
    if ((dayEdit.region || '') !== (original.region || '')) return true;
    const origSpots = original.spots || [];
    if (dayEdit.spots.length !== origSpots.length) return true;
    return dayEdit.spots.some((s, i) => {
      const orig = origSpots[i];
      if (!orig) return true;
      const timeDiff = (s.time || '') !== (orig.time || '');
      const timeEndDiff = (s.timeEnd || '') !== (orig.timeEnd || '');
      const nameDiff = (s.name || '').trim() !== (orig.name || '').trim();
      const typeDiff = (s.type || 'other') !== (orig.type || 'other');
      return timeDiff || timeEndDiff || nameDiff || typeDiff;
    });
  };

  const handleCloseDayEditor = () => {
    if (isDayEditDirty()) {
      if (window.confirm('有未儲存嘅修改，確定要放棄？')) {
        setDayEdit(null);
      }
    } else {
      setDayEdit(null);
    }
  };

  function initiateSwap(targetDate: string) {
    if (!swapSource) return;
    setSwapConfirm({ sourceDate: swapSource, targetDate });
  }

  function executeSwap() {
    if (!swapConfirm) return;
    const { sourceDate, targetDate } = swapConfirm;
    setState((prev) => applyItineraryEdit(prev, swapItineraryDays(getItinerary(prev), sourceDate, targetDate)));
    setSwapConfirm(null);
    setSwapSource(null);
  }

  return (
    <>
      <section className="japanese-washi-bg w-full min-h-screen px-4 pb-28 pt-6 relative timeline-screen" style={travelAtlasStyle}>
      <div className="japanese-sun-decor" />
      <div className="japanese-sakura-decor" />
      <div className="stack w-full relative z-10">
      <MagicCard className="timeline-command p-0 rounded-[32px] overflow-hidden relative w-full border border-white/50 shadow-[0_20px_60px_-15px_rgba(45,110,72,0.25)]">
        <ShineBorder className="opacity-80 timeline-command-shine" shineColor={['#2D6E48', '#D4A843']} borderWidth={3} />
        <div className="absolute inset-0 bg-gradient-to-br from-[#2D6E48] via-[#D4A843] to-[#C23B5E] opacity-[0.25] mix-blend-multiply timeline-command-blend" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 mix-blend-overlay timeline-command-texture" />
        <div className="absolute inset-0 bg-gradient-to-t from-white/40 via-transparent to-white/10 timeline-command-wash" />

        <div className="relative z-10 w-full timeline-command-inner">
          <div className="timeline-command-title-row">
            <span className="timeline-command-seal" aria-hidden="true">旅</span>
            <h2 className="timeline-command-title">行程時間線</h2>
            <span className="timeline-trip-days" aria-label={`${itinerary.length}日行程`}>
              <CalendarDays size={14} />
              {itinerary.length}日
            </span>
          </div>
          {commandDay && (
            <div className="preview-timeline-overview">
              <div className="preview-timeline-date">
                <span>{commandYear}</span>
                <small>{commandMonth}月</small>
                <strong>{commandDateDay}</strong>
                <em>{commandWeekday}</em>
              </div>
              <div className="preview-timeline-copy">
                <span>第 {commandDay.day} 天 / 共 {itinerary.length || 1} 天</span>
                <strong>{commandDay.region}</strong>
                <small>{liveContext.detail}</small>
                <div className={`timeline-live-card mode-${liveContext.mode}`} aria-label="Live travel timeline">
                  <span className="timeline-live-clock">{liveContext.nowLabel}</span>
                  <b>{liveContext.headline}</b>
                  <em>{liveContext.currentLabel}</em>
                  <small>{liveContext.nextLabel}</small>
                </div>
              </div>
              <div className="preview-timeline-stats">
                <span><MapPin size={18} /> 行程 {getScheduleSpots(state, commandDay).length} 個景點</span>
                <b><ReceiptText size={18} /> 支出 HK$ {fmt(dayLooseReceipts(state, commandDay).reduce((s, r) => s + getReceiptHkdAmount(r, state), 0))}</b>
              </div>
            </div>
          )}
        </div>
      </MagicCard>

      {itinerary.map((day) => {
        const spots = getScheduleSpots(state, day);
        const loose = dayLooseReceipts(state, day);
        const rail = timelineRailMetrics(day.date, day.timezone, spots, nowTick, tripWindow);
        const dayDate = new Date(`${day.date}T00:00:00`);
        const dayDateValid = !Number.isNaN(dayDate.getTime());
        const dayDateNumber = dayDateValid ? String(dayDate.getDate()) : String(day.day);
        const dayMonth = dayDateValid ? `${dayDate.getMonth() + 1}月` : '';
        const dayWeekday = dayDateValid ? new Intl.DateTimeFormat('zh-HK', { weekday: 'short' }).format(dayDate) : '';
        return (
        <Reveal key={day.date} className="timeline-day-reveal" delay={Math.min(0.18, day.day * 0.018)}>
        <GlassCard className={`timeline-day ${day.date === today ? 'today' : ''}`} data-date={day.date}>
          <span className="timeline-day-anchor" data-date={day.date} hidden />
          <div className="section-head timeline-day-head">
            <div className="timeline-day-title">
              <span className="timeline-preview-date-badge" aria-hidden="true">
                <small>Day {day.day}</small>
                <strong>{dayDateNumber}</strong>
                <em>{dayMonth} · {dayWeekday}</em>
              </span>
              <span className="timeline-day-number">Day {day.day}</span>
              <div>
                <p className="eyebrow timeline-day-date-primary">{day.date}</p>
                <h2>{day.region}</h2>
                {day.lodging?.name && <p className="muted timeline-lodging"><Home size={13} /> 住宿：{day.lodging.name}</p>}
              </div>
            </div>
            <div className="timeline-day-status">
              {day.date === today && <StatusPill tone="danger">Today</StatusPill>}
              <span>{spots.length} 個點</span>
              {canEditItinerary && (
                <span className="timeline-day-tools">
                  <button type="button" className="icon-btn" aria-label={`編輯 Day ${day.day} 行程`} title="編輯呢日行程" onClick={() => openDayEditor(day)}><PencilLine size={15} /></button>
                  <button type="button" className="icon-btn" aria-label={`Day ${day.day} 與其他日子對調`} title="與另一日對調" onClick={() => setSwapSource(day.date)} disabled={itinerary.length < 2}><ArrowLeftRight size={15} /></button>
                </span>
              )}
            </div>
          </div>
          <TimelineRail className={[rail.isToday ? 'is-today' : '', rail.isOutsideTrip ? 'is-outside-trip' : ''].filter(Boolean).join(' ')} style={timelineRailStyle(rail)}>
            {rail.isToday && (
              <span className="timeline-now-marker" aria-hidden="true">
                <span>{rail.label}</span>
              </span>
            )}
            {spots.map((spot, idx) => {
              const progress = timelineProgress(day.date, spot.timezone || day.timezone, spots, idx, nowTick);
              const stateLabel = timelineStateLabel(progress);
              const category = categoryById(spot.type);
              const stableKey = spotStableKey(day.date, spot, idx);
              return (
              <article className={`timeline-event ${progress}`} data-spot-key={stableKey} key={stableKey}>
                <time className="timeline-time" dateTime={`${day.date}T${spot.time || '00:00'}`}>
                  <span>{spot.timeEnd ? `${spot.time} – ${spot.timeEnd}` : spot.time}</span>
                  {spot.timezone && <small>{spot.timezone}</small>}
                </time>
                <VisualIcon id={categoryIconId(spot.type)} label={category.name} className="cat timeline-cat" />
                <strong className="timeline-main">
                  <span className="timeline-title-row">
                    <span className="timeline-title">{spot.name}</span>
                    <em className={`timeline-now timeline-state-${progress}`}>{stateLabel}</em>
                  </span>
                  {spot.note && <small>{spot.note}</small>}
                  {spot.address && <small>{spot.address}</small>}
                </strong>
                <div className="timeline-route-actions" aria-label={`Route actions for ${spot.name}`}>
                <ActionSheet>
                  <a
                    className="secondary mini"
                    href={safeExternalUrl(spot.mapUrl, mapsUrl(spot.name, spot.address))}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MapPin size={14} /> 地圖
                  </a>
                {spot.receiptId ? (
                  <button className="secondary mini" type="button" onClick={() => {
                    const receipt = state.receipts.find((r) => r.id === spot.receiptId);
                    if (receipt) onOpen(receipt);
                  }}><ReceiptText size={14} /> 紀錄</button>
                ) : spot._spotIdx >= 0 && (
                  <button className="secondary mini" type="button" onClick={() => setEditing({ date: day.date, idx: spot._spotIdx, original: spot })}><PencilLine size={14} /> 編輯</button>
                )}
                </ActionSheet>
                </div>
              </article>
            );})}
          </TimelineRail>
          <button className="secondary full-width timeline-loose-receipts" type="button" onClick={() => setDayReceipts(day.date)}>
            <span className="timeline-loose-icon"><ReceiptText size={16} /></span>
            <span className="timeline-loose-copy">
              <strong>{loose.length} 筆消費</strong>
            </span>
            <span className="timeline-loose-total">
              {tripPrefix}{fmt(loose.reduce((s, r) => s + r.total, 0))}
              <small>HK$ {fmt(loose.reduce((s, r) => s + getReceiptHkdAmount(r, state), 0))}</small>
            </span>
          </button>
        </GlassCard>
        </Reveal>
      );})}
      {(() => {
        // Receipts dated outside every itinerary day used to silently vanish from this tab.
        const dayDates = new Set(itinerary.map((d) => d.date));
        const orphans = scopedReceiptsForTrip(state, activeTrip(state)).filter((r) => r.date && !dayDates.has(r.date) && !isSettlementReceipt(r));
        if (!orphans.length) return null;
        return (
          <GlassCard className="timeline-day">
            <div className="section-head timeline-day-head">
              <div className="timeline-day-title"><h2>行程日期以外</h2></div>
              <div className="timeline-day-status"><span>{orphans.length} 筆</span></div>
            </div>
            {orphans.map((r) => <ReceiptRow key={r.id} state={state} receipt={r} onOpen={onOpen} onViewPhoto={setViewPhoto} />)}
          </GlassCard>
        );
      })()}
      </div>
    </section>

    {editing && (
      <div ref={editingContainerRef} className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setEditing(null)}>
        <form className="modal sheet timeline-edit-sheet" onClick={(event) => event.stopPropagation()} onSubmit={saveSpot}>
          <div className="modal-head">
            <h2>編輯行程點</h2>
            <button type="button" className="icon-btn" onClick={() => setEditing(null)}>×</button>
          </div>
          <div className="form-grid">
            <label>開始時間<input name="time" type="time" defaultValue={editing.original.time} /></label>
            <label>結束時間<input name="timeEnd" type="time" defaultValue={editing.original.timeEnd || ''} /></label>
            <label>類別
              <select name="type" defaultValue={editing.original.type}>
                {SPOT_TYPE_OPTIONS.map((id) => <option key={id} value={id}>{categoryById(id).name}</option>)}
              </select>
            </label>
          </div>
          <label>名稱<input name="name" defaultValue={editing.original.name} /></label>
          <label>地址<input name="address" defaultValue={editing.original.address || ''} /></label>
          <label>備註<input name="note" defaultValue={editing.original.note || ''} /></label>
          {canEditItinerary && itinerary.length > 1 && (
            <label>移至日子
              <select name="moveDate" defaultValue={editing.date}>
                {itinerary.map((d) => <option key={d.date} value={d.date}>Day {d.day} · {d.date} · {d.region}</option>)}
              </select>
            </label>
          )}
          <div className="modal-actions">
            {canEditItinerary ? (
              <button type="button" className="danger" onClick={deleteSpot}><Trash2 size={15} /> 刪除</button>
            ) : (
              <button type="button" className="danger" onClick={() => {
                setState((prev) => setItineraryOverride(prev, editing.date, editing.idx, null));
                setEditing(null);
              }}><RotateCcw size={15} /> 還原</button>
            )}
            <div className="action-row">
              <button type="button" className="secondary" onClick={() => setEditing(null)}>取消</button>
              <button type="submit" className="primary">儲存</button>
            </div>
          </div>
        </form>
      </div>
    )}
    {activeDay && (
      <div ref={dayReceiptsContainerRef} className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setDayReceipts(null)}>
        <div className="modal sheet timeline-receipt-sheet" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h2>{activeDay.date} 消費</h2>
              <p className="muted">{looseReceipts.length} 筆 · {tripPrefix}{fmt(looseReceipts.reduce((s, r) => s + r.total, 0))} · HK$ {fmt(looseReceipts.reduce((s, r) => s + getReceiptHkdAmount(r, state), 0))}</p>
            </div>
            <button type="button" className="icon-btn" onClick={() => setDayReceipts(null)}>×</button>
          </div>
          {looseReceipts.length ? looseReceipts.map((r) => <ReceiptRow key={r.id} state={state} receipt={r} onOpen={onOpen} onViewPhoto={setViewPhoto} />) : <p className="empty">呢日未有額外消費。</p>}
        </div>
      </div>
    )}
    {dayEdit && (
      <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={handleCloseDayEditor}>
        <div className="modal sheet timeline-day-editor" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h2>編輯 Day {dayEdit.day} 行程</h2>
              <p className="muted">{dayEdit.date} · 改完撳儲存先會生效</p>
            </div>
            <button type="button" className="icon-btn" onClick={handleCloseDayEditor}>×</button>
          </div>
          <label>地區<input value={dayEdit.region} onChange={(e) => setDayEdit({ ...dayEdit, region: e.target.value })} /></label>
          <div className="timeline-day-editor-spots">
            {dayEdit.spots.map((spot, idx) => (
              <div className="timeline-day-editor-row" key={idx}>
                <input type="time" value={spot.time} aria-label="時間" onChange={(e) => setDayEdit({ ...dayEdit, spots: dayEdit.spots.map((s, i) => i === idx ? { ...s, time: e.target.value } : s) })} />
                <input type="time" value={spot.timeEnd || ''} aria-label="結束時間" onChange={(e) => setDayEdit({ ...dayEdit, spots: dayEdit.spots.map((s, i) => i === idx ? { ...s, timeEnd: e.target.value || undefined } : s) })} />
                <input value={spot.name} placeholder="景點 / 餐廳名" aria-label="名稱" onChange={(e) => setDayEdit({ ...dayEdit, spots: dayEdit.spots.map((s, i) => i === idx ? { ...s, name: e.target.value } : s) })} />
                <select value={spot.type || 'other'} aria-label="類別" onChange={(e) => setDayEdit({ ...dayEdit, spots: dayEdit.spots.map((s, i) => i === idx ? { ...s, type: e.target.value as ItinerarySpot['type'] } : s) })}>
                  {SPOT_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{categoryById(type).name}</option>)}
                </select>
                <button type="button" className="icon-btn detail-btn" aria-label="詳情" onClick={() => openSpotDetailFromDayEditor(spot, idx)}><Settings size={15} /></button>
                <button type="button" className="icon-btn delete-btn" aria-label={`刪除 ${spot.name || '行程點'}`} onClick={() => setDayEdit({ ...dayEdit, spots: dayEdit.spots.filter((_, i) => i !== idx) })}><Trash2 size={15} /></button>
              </div>
            ))}
            {!dayEdit.spots.length && <p className="empty">呢日未有行程點。</p>}
          </div>
          <div className="action-row wrap">
            <button type="button" className="secondary" onClick={() => setDayEdit({ ...dayEdit, spots: [...dayEdit.spots, { time: getNextSpotDefaultTime(dayEdit.spots), name: '', type: 'sightseeing' }] })}><Plus size={15} /> 新增行程點</button>
            <button type="button" className="secondary" onClick={() => setDayEdit({ ...dayEdit, spots: dayEdit.spots.slice().sort((a, b) => String(a.time || '').localeCompare(String(b.time || ''))) })}><ArrowDownUp size={15} /> 按時間排序</button>
          </div>
          <div className="modal-actions">
            <div className="action-row">
              <button type="button" className="secondary" onClick={handleCloseDayEditor}>取消</button>
              <button type="button" className="primary" onClick={saveDayEditor}>儲存</button>
            </div>
          </div>
        </div>
      </div>
    )}
    {swapSource && (
      <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setSwapSource(null)}>
        <div className="modal sheet timeline-swap-sheet" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h2>對調行程日</h2>
              <p className="muted">Day {itinerary.find((d) => d.date === swapSource)?.day} 會同你揀嘅日子交換全部行程內容（日期不變）</p>
            </div>
            <button type="button" className="icon-btn" onClick={() => setSwapSource(null)}>×</button>
          </div>
          {itinerary.filter((d) => d.date !== swapSource).map((d) => (
            <button type="button" className="secondary full-width timeline-swap-option" key={d.date} onClick={() => initiateSwap(d.date)}>
              <strong>Day {d.day} · {d.date}</strong>
              <span>{d.region} · {(d.spots || []).length} 個點</span>
            </button>
          ))}
        </div>
      </div>
    )}
    {swapConfirm && (() => {
      const a = itinerary.find((d) => d.date === swapConfirm.sourceDate);
      const b = itinerary.find((d) => d.date === swapConfirm.targetDate);
      if (!a || !b) return null;
      return (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setSwapConfirm(null)}>
          <div className="modal sheet timeline-swap-confirm-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <h2>確認對調行程</h2>
              <button type="button" className="icon-btn" onClick={() => setSwapConfirm(null)}>×</button>
            </div>
            <p className="swap-confirm-text" style={{ margin: '15px 0', fontSize: '15px', lineHeight: '1.5' }}>
              將 <strong>Day {a.day}（{a.region}）</strong> 與 <strong>Day {b.day}（{b.region}）</strong> 嘅行程內容對調？日期唔會郁。
            </p>
            <div className="modal-actions">
              <div className="action-row">
                <button type="button" className="secondary" onClick={() => setSwapConfirm(null)}>取消</button>
                <button type="button" className="primary" onClick={executeSwap}>確認對調</button>
              </div>
            </div>
          </div>
        </div>
      );
    })()}
    {viewPhoto && <ReceiptPhotoModal receipt={viewPhoto} onClose={() => setViewPhoto(null)} />}
  </>
  );
}

const SPOT_TYPE_OPTIONS: ItinerarySpot['type'][] = ['flight', 'transport', 'food', 'shopping', 'lodging', 'ticket', 'localtour', 'medicine', 'sightseeing', 'other'];

function getNextSpotDefaultTime(spots: ItinerarySpot[]): string {
  if (!spots || spots.length === 0) return '09:00';
  const sorted = spots
    .filter((s) => s.time && /^\d{2}:\d{2}$/.test(s.time))
    .sort((a, b) => a.time.localeCompare(b.time));
  if (sorted.length === 0) return '09:00';
  const lastTime = sorted[sorted.length - 1].time;
  const [hh, mm] = lastTime.split(':').map(Number);
  let nextM = mm + 30;
  let nextH = hh;
  if (nextM >= 60) {
    nextM -= 60;
    nextH += 1;
  }
  if (nextH >= 24) return '23:59';
  return `${String(nextH).padStart(2, '0')}:${String(nextM).padStart(2, '0')}`;
}

function spotStableKey(date: string, spot: ScheduleSpot, fallbackIdx: number): string {
  if (spot.receiptId) return `${date}:receipt:${spot.receiptId}`;
  if (spot.spotId) return `${date}:spot:${spot.spotId}`;
  if (spot.id) return `${date}:id:${spot.id}`;
  if (spot._spotIdx >= 0) return `${date}:planned:${spot._spotIdx}`;
  return `${date}:render:${fallbackIdx}`;
}

function selectTimelineAutoScrollTarget(date: string): Element | null {
  const anchor = document.querySelector(`.timeline-day-anchor[data-date="${date}"]`);
  const day = anchor?.closest('.timeline-day');
  if (!day) return null;
  const live = day.querySelector('.timeline-event.is-live');
  if (live) return live;
  const next = day.querySelector('.timeline-event.is-future');
  if (next) return next;
  const events = day.querySelectorAll('.timeline-event');
  return events[events.length - 1] || day;
}

function scrollTimelineElementIntoCenter(element: Element) {
  const scrollToElement = (behavior: ScrollBehavior) => {
    const rect = element.getBoundingClientRect();
    const targetTop = Math.max(0, window.scrollY + rect.top - window.innerHeight * 0.42);
    window.scrollTo({ top: targetTop, behavior });
  };

  scrollToElement('smooth');
  window.setTimeout(() => {
    const rect = element.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    if (center < 150 || center > window.innerHeight - 150) scrollToElement('auto');
  }, 320);
}

function timelineProgress(date: string, timezone: string | undefined, spots: Array<ItinerarySpot & { _spotIdx: number }>, idx: number, nowMs: number): 'is-passed' | 'is-live' | 'is-future' {
  const current = datePartsForZone(nowMs, normalizeTimelineTimezone(timezone));
  if (!current) return 'is-future';
  if (date < current.date) return 'is-passed';
  if (date > current.date) return 'is-future';
  const start = minutesForTime(spots[idx]?.time);
  const next = minutesForTime(spots[idx + 1]?.time);
  if (current.minutes < start) return 'is-future';
  if (current.minutes < next) return 'is-live';
  return 'is-passed';
}

function timelineStateLabel(progress: TimelineStatus): string {
  if (progress === 'is-passed') return '完成';
  if (progress === 'is-live') return 'Now';
  return '即將';
}

function timelineLiveContext(state: AppState, itinerary: ItineraryDay[], nowMs: number, tripWindow?: { start: string; end: string } | null): TimelineLiveContext {
  if (!itinerary.length) {
    return {
      mode: 'empty',
      nowLabel: '--:--',
      headline: '未有行程',
      detail: '匯入行程後會顯示即時位置',
      currentLabel: 'Current · --',
      nextLabel: 'Next · --',
    };
  }

  const firstZone = normalizeTimelineTimezone(itinerary[0]?.timezone);
  const reference = datePartsForZone(nowMs, firstZone);
  const outsideTrip = Boolean(reference && tripWindow && (reference.date < tripWindow.start || reference.date > tripWindow.end));
  const activeDay = itinerary.find((day) => {
    const current = datePartsForZone(nowMs, normalizeTimelineTimezone(day.timezone));
    return current?.date === day.date;
  });

  if (outsideTrip || !activeDay) {
    const isBefore = Boolean(reference && tripWindow && reference.date < tripWindow.start);
    const day = isBefore ? itinerary[0] : itinerary[itinerary.length - 1];
    const spots = getScheduleSpots(state, day);
    const target = isBefore ? spots[0] : spots[spots.length - 1];
    return {
      mode: outsideTrip ? 'outside' : isBefore ? 'before' : 'after',
      date: day.date,
      day: day.day,
      region: day.region,
      nowLabel: reference ? formatTimelineMinutes(reference.minutes) : '--:--',
      headline: isBefore ? '旅程未開始' : '旅程已完結',
      detail: isBefore ? `Day ${day.day} · ${day.region}` : `最後一日 · ${day.region}`,
      currentLabel: target ? `Focus · ${target.name}` : 'Focus · --',
      nextLabel: isBefore && target ? `Next · ${target.time || '--:--'} ${target.name}` : 'Next · 休息 / 整理紀錄',
    };
  }

  const current = datePartsForZone(nowMs, normalizeTimelineTimezone(activeDay.timezone));
  const spots = getScheduleSpots(state, activeDay);
  const live = spots.find((spot, idx) => timelineProgress(activeDay.date, spot.timezone || activeDay.timezone, spots, idx, nowMs) === 'is-live');
  const next = spots.find((spot, idx) => timelineProgress(activeDay.date, spot.timezone || activeDay.timezone, spots, idx, nowMs) === 'is-future');
  const passedCount = spots.filter((spot, idx) => timelineProgress(activeDay.date, spot.timezone || activeDay.timezone, spots, idx, nowMs) === 'is-passed').length;

  return {
    mode: 'active',
    date: activeDay.date,
    day: activeDay.day,
    region: activeDay.region,
    nowLabel: current ? formatTimelineMinutes(current.minutes) : '--:--',
    headline: live ? `而家 · ${live.name}` : next ? '準備出發' : '今日行程完成',
    detail: `Day ${activeDay.day} · ${activeDay.region} · ${passedCount}/${spots.length || 0} 完成`,
    currentLabel: live ? `Current · ${live.time || '--:--'} ${live.name}` : 'Current · 等待下一站',
    nextLabel: next ? `Next · ${next.time || '--:--'} ${next.name}` : 'Next · 今日已無下一站',
  };
}

function timelineRailMetrics(date: string, timezone: string | undefined, spots: Array<ItinerarySpot & { _spotIdx: number }>, nowMs: number, tripWindow?: { start: string; end: string } | null): { isToday: boolean; isOutsideTrip: boolean; progress: number; label: string } {
  const current = datePartsForZone(nowMs, normalizeTimelineTimezone(timezone));
  if (!current) return { isToday: false, isOutsideTrip: false, progress: 0, label: '' };
  const isOutsideTrip = Boolean(tripWindow && (current.date < tripWindow.start || current.date > tripWindow.end));
  if (isOutsideTrip) {
    return { isToday: false, isOutsideTrip: true, progress: current.date > (tripWindow?.end || date) ? 100 : 0, label: '' };
  }
  if (date < current.date) return { isToday: false, isOutsideTrip: false, progress: 100, label: '' };
  if (date > current.date) return { isToday: false, isOutsideTrip: false, progress: 0, label: '' };
  const progress = timelineSpotProgress(current.minutes, spots);
  return { isToday: true, isOutsideTrip: false, progress, label: formatTimelineMinutes(current.minutes) };
}

function timelineTripWindow(itinerary: Array<{ date: string }>): { start: string; end: string } | null {
  const dates = itinerary.map((day) => day.date).filter(Boolean).sort();
  if (!dates.length) return null;
  return { start: dates[0], end: dates[dates.length - 1] };
}

function timelineSpotProgress(currentMinutes: number, spots: Array<ItinerarySpot & { _spotIdx: number }>): number {
  if (!spots.length) return 0;
  let currentIdx = -1;
  for (let idx = 0; idx < spots.length; idx += 1) {
    const start = minutesForTime(spots[idx]?.time);
    if (!Number.isFinite(start) || currentMinutes < start) break;
    currentIdx = idx;
    const next = minutesForTime(spots[idx + 1]?.time);
    if (currentMinutes < next) break;
  }
  if (currentIdx < 0) return 0;
  if (spots.length === 1) return 50;
  return Math.max(0, Math.min(100, (currentIdx / (spots.length - 1)) * 100));
}

function timelineRailStyle(metrics: { progress: number }): CSSProperties {
  return {
    '--timeline-now': `${metrics.progress}%`,
    '--timeline-progress': String(metrics.progress / 100),
  } as CSSProperties;
}

function formatTimelineMinutes(total: number): string {
  const minutes = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)));
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function minutesForTime(value?: string): number {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return Number.POSITIVE_INFINITY;
  return Math.min(23, Number(match[1]) || 0) * 60 + Math.min(59, Number(match[2]) || 0);
}

function normalizeTimelineTimezone(value?: string): string {
  const zone = String(value || '').trim();
  if (zone === 'JST') return 'Asia/Tokyo';
  if (zone === 'HKT') return 'Asia/Hong_Kong';
  if (zone === 'KST') return 'Asia/Seoul';
  // Neutral home fallback rather than assuming Japan when a day has no timezone.
  return zone || 'Asia/Hong_Kong';
}

function datePartsForZone(nowMs: number, timezone: string): { date: string; minutes: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(nowMs));
    const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
    return {
      date: `${value('year')}-${value('month')}-${value('day')}`,
      minutes: (Number(value('hour')) || 0) * 60 + (Number(value('minute')) || 0),
    };
  } catch {
    return null;
  }
}

// ReceiptPhotoModal removed - imported from shared components instead
