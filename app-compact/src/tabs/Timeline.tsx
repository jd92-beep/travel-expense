import { createPortal } from 'react-dom';
import type { CSSProperties, Dispatch, FormEvent, SetStateAction } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, ArrowDownUp, CalendarDays, Home, MapPin, PencilLine, Plus, ReceiptText, RotateCcw, Trash2, Settings } from 'lucide-react';
import { ActionSheet, GlassCard, Reveal, StatusPill, TimelineRail, Toast } from '../components/ui';
import { MagicCard } from '../components/ui/magic-card';
import { ShineBorder } from '../components/ui/shine-border';
import { applyItineraryEdit, categoryById, compareSpotsByTime, dayLooseReceipts, fmt, getItinerary, getReceiptHkdAmount, getReceiptTripAmount, getResolvedTripCurrency, getScheduleSpots, mapsUrl, safeExternalUrl, setItineraryOverride, swapItineraryDays, todayForReceipts } from '../lib/domain';
import { activeTrip, scopedReceiptsForTrip } from '../domain/trip/normalize';
import { currencyPrefix } from '../lib/currency';
import type { SyncEngineState, AppState, ItineraryDay, ItinerarySpot, Receipt } from '../lib/types';
import { ReceiptRow } from './Dashboard';
import { ReceiptPhotoModal } from '../components/ReceiptPhotoModal';
import { VisualIcon } from '../components/VisualIcon';
import { categoryIconId } from '../lib/iconManifest';
import { useModalOpenClass } from '../lib/useModalOpenClass';
import { useModalAccessibility } from '../lib/useModalAccessibility';
import travelAiAtlas from '../assets/atmosphere/travel-ai-atlas.webp';
import '../styles/timeline.css';
import { JourneyMap } from '../components/journey/JourneyMap';
import { TripTools } from '../components/journey/TripTools';
import { clockLabel, endLabel, freeMinutes, dayAxisMinute, spotDuration, durationLabel, placeIdentity } from '../lib/plannerLayout';
import { DayRail } from '../components/journey/DayRail';
import { useTripTheme } from '../theme/tripTheme';
import { JourneyCover } from '../components/journey/JourneyCover';
import { JourneyPlanner, type PlannerView } from '../components/journey/JourneyPlanner';

type ScheduleSpot = ItinerarySpot & { _spotIdx: number; receiptId?: string };
type TimelineStatus = 'is-passed' | 'is-live' | 'is-future' | 'is-untimed';

// Intl.DateTimeFormat construction is expensive — hoist the fixed weekday formatters and
// cache the per-timezone parts formatters instead of rebuilding them per spot per render.
const zhWeekdayShortFmt = new Intl.DateTimeFormat('zh-HK', { weekday: 'short' });
const zonePartsFormatterCache = new Map<string, Intl.DateTimeFormat>();

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

export function Timeline({ state, setState, onOpen, scope = 'local', plannerView = 'schedule', onPlannerView, onExpenses, syncState, onSettings = () => { location.hash = 'settings'; } }: { state: AppState; setState: Dispatch<SetStateAction<AppState>>; onOpen: (receipt: Receipt) => void; scope?: string; onExpenses?: () => void; syncState?: SyncEngineState; onSettings?: (section: string) => void; plannerView?: PlannerView; onPlannerView?: (view: PlannerView) => void }) {
  // getItinerary normalizes + canonicalizes on every call, so memoize it on the state slices
  // it actually reads (trips / customItinerary / activeTripId / tripDateRange / tripName /
  // tripCurrency). Without this the per-day memo below never hits and every keystroke in the
  // day editor recomputes spots + receipt scans for every day.
  const itinerary = useMemo(
    () => getItinerary(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.trips, state.customItinerary, state.activeTripId, state.tripDateRange, state.tripName, state.tripCurrency],
  );
  // Reuse the memoized itinerary instead of letting todayForReceipts re-run getItinerary.
  const pocket = useTripTheme().theme.id === 'pocket_planner';
  const today = todayForReceipts(state, itinerary);
  const [selectedDate, setSelectedDate] = useState(() => itinerary.find(day => day.date === today)?.date || itinerary[0]?.date || '');
  const [calendarJump, setCalendarJump] = useState(0);
  const [showAllDays, setShowAllDays] = useState(false);
  const selectedDay = itinerary.find(day => day.date === selectedDate) || itinerary[0];
  const [selectedPlace, setSelectedPlace] = useState('');
  const [dayDirection, setDayDirection] = useState(1);
  const selectDay = (date: string) => { setDayDirection(date >= selectedDate ? 1 : -1); setSelectedDate(date); setSelectedPlace(''); setShowAllDays(false); };
  const jumpToDay = (date: string) => { selectDay(date); if (plannerView === 'calendar') setCalendarJump(value => value + 1); };
  const selectPlace = (day: ItineraryDay, spot: ItinerarySpot, index: number) => { if (day.date !== selectedDay?.date) selectDay(day.date); setSelectedPlace(placeIdentity(spot, index)); };
  const resolvedTripCurrency = getResolvedTripCurrency(state, activeTrip(state));
  const tripPrefix = currencyPrefix(resolvedTripCurrency);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [editing, setEditing] = useState<{ date: string; idx: number; original: ItinerarySpot; draft?: boolean } | null>(null);
  const [dayReceipts, setDayReceipts] = useState<string | null>(null);
  const [viewPhoto, setViewPhoto] = useState<Receipt | null>(null);
  const [dayEdit, setDayEdit] = useState<{ date: string; day: number; region: string; spots: ItinerarySpot[] } | null>(null);
  const [swapSource, setSwapSource] = useState<string | null>(null);
  const [swapConfirm, setSwapConfirm] = useState<{ sourceDate: string; targetDate: string } | null>(null);
  const [status, setStatus] = useState('');
  // Viewers of a shared trip can't push trip changes — they keep the local override layer.
  const canEditItinerary = activeTrip(state).sharing?.role !== 'viewer';
  const tripWindow = useMemo(() => timelineTripWindow(itinerary), [itinerary]);
  // Shared by the per-day loop and the orphan-receipts block so neither redoes the
  // trip-scoped receipt filter per day.
  const tripReceipts = useMemo(
    () => scopedReceiptsForTrip(state, activeTrip(state)),
    [state.receipts, state.trips, state.activeTripId],
  );

  // Precompute schedule spots / per-day receipts / day totals once per itinerary day. Deps cover
  // everything getScheduleSpots/getReceiptTripAmount read from state: the memoized itinerary,
  // the trip-scoped receipts, itinerary overrides, which trip is active (trips + activeTripId,
  // since scopedReceiptsForTrip's hasMultipleTrips check depends on state.trips.length too), the
  // exchange-rate slices used for trip-currency totals. Rail metrics depend on the 60s nowTick
  // instead, so they live in a separate cheap memo below — otherwise every minute tick re-ran
  // the per-day receipt scans and currency conversion for the whole trip.
  const perDayBase = useMemo(() => {
    return itinerary.map((day) => {
      const spots = getScheduleSpots(state, day, tripReceipts);
      // All of the day's receipts — including the ones backing lodging/transport spots —
      // so the headline day-spend figure matches what was actually spent that day
      // (converted to the trip currency).
      const dayReceiptsAll = tripReceipts.filter((r) => r.date === day.date);
      const tripTotal = dayReceiptsAll.reduce((sum, r) => sum + getReceiptTripAmount(r, state, resolvedTripCurrency), 0);
      const hkdTotal = dayReceiptsAll.reduce((sum, r) => sum + getReceiptHkdAmount(r, state), 0);
      return { day, spots, dayReceipts: dayReceiptsAll, tripTotal, hkdTotal };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itinerary, tripReceipts, state.receipts, state.itineraryOverrides, state.trips, state.activeTripId, state.rateTable, state.rate, resolvedTripCurrency]);
  const perDayTimeline = useMemo(() => {
    return perDayBase.map((entry) => ({
      ...entry,
      rail: timelineRailMetrics(entry.day.date, entry.day.timezone, entry.spots, nowTick, tripWindow),
    }));
  }, [perDayBase, nowTick, tripWindow]);
  const perDayTimelineByDate = useMemo(() => {
    const map = new Map<string, (typeof perDayTimeline)[number]>();
    for (const entry of perDayTimeline) map.set(entry.day.date, entry);
    return map;
  }, [perDayTimeline]);

  const activeDay = dayReceipts ? itinerary.find((day) => day.date === dayReceipts) : null;
  const activeDayEntry = activeDay ? perDayTimelineByDate.get(activeDay.date) : undefined;
  const hasOpenModal = Boolean(editing || activeDay || viewPhoto || dayEdit || swapSource || swapConfirm);
  const travelAtlasStyle = { '--travel-ai-atlas': `url(${travelAiAtlas})` } as CSSProperties;
  const liveContext = timelineLiveContext(itinerary, nowTick, tripWindow, perDayTimelineByDate);
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  function goToCurrentStop() {
    const date = liveContext.date;
    if (!date) return;
    selectDay(date);
    requestAnimationFrame(() => {
      const target = selectTimelineAutoScrollTarget(date);
      target?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
  }

  useModalOpenClass(hasOpenModal);

  // Only the top sheet owns keyboard handling; closing a detail must preserve its day draft.
  const editingContainerRef = useModalAccessibility(Boolean(editing), () => handleCloseSpotEditor());
  const dayReceiptsContainerRef = useModalAccessibility(Boolean(activeDay && !viewPhoto), () => setDayReceipts(null));
  const dayEditContainerRef = useModalAccessibility(Boolean(dayEdit && !editing), () => handleCloseDayEditor());
  const swapSourceContainerRef = useModalAccessibility(Boolean(swapSource && !swapConfirm), () => setSwapSource(null));
  const swapConfirmContainerRef = useModalAccessibility(Boolean(swapConfirm), () => setSwapConfirm(null));

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
      bookingRef: String(data.get('bookingRef') || ''),
    };
    // Draft spots (opened via 詳情 inside the day editor) write back into the unsaved
    // dayEdit draft — nothing persists until the day editor's 儲存 is pressed.
    if (editing.draft) {
      setDayEdit((prev) => prev ? { ...prev, spots: prev.spots.map((s, i) => (i === editing.idx ? { ...s, ...patch } : s)) } : prev);
      setEditing(null);
      return;
    }
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
    if (editing.draft) {
      setDayEdit((prev) => prev ? { ...prev, spots: prev.spots.filter((_, i) => i !== editing.idx) } : prev);
      setEditing(null);
      flashStatus(`已刪除「${editing.original.name || '行程點'}」`);
      return;
    }
    setState((prev) => {
      const current = getItinerary(prev);
      const day = current.find((d) => d.date === editing.date);
      const spot = day?.spots?.[editing.idx];
      const next = current.map((d) => d.date === editing.date
        ? { ...d, spots: (d.spots || []).filter((_, i) => i !== editing.idx) }
        : d);
      const merged = applyItineraryEdit(prev, next);
      // Mirror saveSpot: a deleted spot must not keep a stale personal override,
      // including the legacy `${date}_${idx}` key form.
      const itineraryOverrides = { ...(merged.itineraryOverrides || {}) };
      const key = spot?.spotId || spot?.id;
      if (key) delete itineraryOverrides[key];
      delete itineraryOverrides[`${editing.date}_${editing.idx}`];
      return { ...merged, itineraryOverrides };
    });
    setEditing(null);
  }

  function openDayEditor(day: ItineraryDay, withNewSpot = false) {
    // Match the timeline's display order (by time, time-less last) so the editor rows
    // line up with what the user just saw on the day card.
    const spots = (day.spots || []).map((s) => ({ ...s })).sort(compareSpotsByTime);
    if (withNewSpot) spots.push({ time: getNextSpotDefaultTime(spots), name: '', type: 'sightseeing' });
    setDayEdit({ date: day.date, day: day.day, region: day.region, spots });
  }

  function saveDayEditor() {
    if (!dayEdit) return;
    const dropped = dayEdit.spots.filter((s) => !s.name.trim()).length;
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
    if (dropped) flashStatus(`已略過 ${dropped} 個未命名行程點`);
  }

  // Open the spot detail sheet against the UNSAVED day-editor draft. Edits write back into
  // dayEdit.spots (see saveSpot/deleteSpot draft branches) so the editor's 「改完撳儲存先會
  // 生效」 contract holds and 取消 truly discards.
  function openSpotDetailFromDayEditor(_spot: ItinerarySpot, idx: number) {
    if (!dayEdit) return;
    setEditing({ date: dayEdit.date, idx, original: { ...dayEdit.spots[idx] }, draft: true });
  }

  const isDayEditDirty = () => {
    if (!dayEdit) return false;
    const original = itinerary.find((d) => d.date === dayEdit.date);
    if (!original) return false;
    if ((dayEdit.region || '') !== (original.region || '')) return true;
    // openDayEditor sorts the draft by time — compare against the same ordering so merely
    // opening the editor doesn't count as dirty.
    const origSpots = (original.spots || []).slice().sort(compareSpotsByTime);
    if (dayEdit.spots.length !== origSpots.length) return true;
    return dayEdit.spots.some((s, i) => {
      const orig = origSpots[i];
      if (!orig) return true;
      const timeDiff = (s.time || '') !== (orig.time || '');
      const timeEndDiff = (s.timeEnd || '') !== (orig.timeEnd || '');
      const nameDiff = (s.name || '').trim() !== (orig.name || '').trim();
      const typeDiff = (s.type || 'other') !== (orig.type || 'other');
      const noteDiff = (s.note || '') !== (orig.note || '');
      const addressDiff = (s.address || '') !== (orig.address || '');
      return timeDiff || timeEndDiff || nameDiff || typeDiff || noteDiff || addressDiff;
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

  const editingFormRef = useRef<HTMLFormElement>(null);

  const isSpotEditDirty = () => {
    const form = editingFormRef.current;
    if (!form || !editing) return false;
    const data = new FormData(form);
    const moveDate = data.get('moveDate');
    return String(data.get('time') || '') !== (editing.original.time || '')
      || String(data.get('timeEnd') || '') !== (editing.original.timeEnd || '')
      || String(data.get('name') || '') !== (editing.original.name || '')
      || String(data.get('type') || 'other') !== (editing.original.type || 'other')
      || String(data.get('note') || '') !== (editing.original.note || '')
      || String(data.get('address') || '') !== (editing.original.address || '')
      || (moveDate !== null && String(moveDate) !== editing.date);
  };

  // Same discard guard as the day editor — backdrop/×/取消/Escape must not silently
  // drop edits made in the spot sheet.
  const handleCloseSpotEditor = () => {
    if (isSpotEditDirty() && !window.confirm('有未儲存嘅修改，確定要放棄？')) return;
    setEditing(null);
  };

  const flashStatus = (message: string) => {
    setStatus(message);
    window.setTimeout(() => setStatus((current) => (current === message ? '' : current)), 2600);
  };

  function removeDraftSpot(idx: number) {
    if (!dayEdit) return;
    const removed = dayEdit.spots[idx];
    setDayEdit({ ...dayEdit, spots: dayEdit.spots.filter((_, i) => i !== idx) });
    flashStatus(`已刪除「${removed?.name?.trim() || '未命名行程點'}」— 撳儲存先生效`);
  }

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
      <section className="japanese-washi-bg w-full min-h-screen px-4 pb-28 pt-6 relative timeline-screen" style={travelAtlasStyle} data-planner-view={plannerView}>
      <div className="japanese-sun-decor" />
      <div className="japanese-sakura-decor" />
      <div className="stack w-full relative z-10">
      {plannerView === 'schedule' && liveContext.mode === 'active' && <section className="planner-live-stop" aria-label="目前行程">
        <div><small>當地時間 {liveContext.nowLabel}</small><strong>{liveContext.headline}</strong><span>{liveContext.nextLabel}</span></div>
        <button type="button" className="secondary" onClick={goToCurrentStop}>查看目前行程</button>
      </section>}
      {pocket && <div className="pocket-trip-summary">
        <div><small>{itinerary[0]?.date.slice(0, 4)} · {itinerary.length} 日</small><h2>{activeTrip(state).name}</h2></div>
        <div><strong>{perDayTimeline.reduce((count, entry) => count + entry.spots.length, 0)}</strong><small>已安排站點</small></div>
      </div>}
      {pocket && <nav className="pocket-sections" aria-label="旅程分類">
        <button type="button" aria-pressed={plannerView !== 'checklist'} onClick={() => onPlannerView?.('schedule')}>行程規劃</button>
        <button type="button" onClick={onExpenses}>費用總覽</button>
        <button type="button" aria-pressed={plannerView === 'checklist'} onClick={() => onPlannerView?.('checklist')}>攜帶用品</button>
      </nav>}
      {pocket && ['schedule', 'calendar', 'route'].includes(plannerView) ? <header className="pocket-calendar-header">
        <div><h2>行事曆</h2><small>{selectedDay ? selectedDay.date.slice(0, 7).replace('-', ' 年 ') + ' 月' : '未有日期'}</small></div>
        <nav aria-label="行程工具" className="pocket-view-switch">
          <button type="button" aria-label="多日" aria-pressed={plannerView === 'calendar'} onClick={() => onPlannerView?.('calendar')}>週行事曆</button>
          <button type="button" aria-label="日程" aria-pressed={plannerView === 'schedule'} onClick={() => onPlannerView?.('schedule')}>單日時間軸</button>
        </nav>
        {canEditItinerary && selectedDay && <button type="button" className="pocket-add" aria-label="加入行程" onClick={() => openDayEditor(selectedDay)}><Plus size={18} /></button>}
      </header> : <>
      <header className="journey-itinerary-heading"><div><h2>每日行程</h2><p>{activeTrip(state).name} · {itinerary.length} 日</p></div><div className="action-row">{selectedDay && canEditItinerary && <button type="button" className="secondary" onClick={() => openDayEditor(selectedDay)}><Plus size={17} /> 加入行程</button>}</div></header>
      <JourneyCover day={selectedDay?.day} trip={activeTrip(state)} className="journey-planner-cover" />
      </>}
      {['schedule', 'calendar', 'route'].includes(plannerView) && !(pocket && plannerView === 'calendar') && <DayRail pocket={pocket} days={itinerary} selected={selectedDay?.date || ''} onSelect={jumpToDay} />}
      <div className="planner-connected-layout"><div className="planner-schedule-pane" style={{ '--day-direction': dayDirection } as CSSProperties}>
      <JourneyPlanner pocket={pocket} days={itinerary} calendarJump={calendarJump} selectedPlace={selectedPlace} onSelectPlace={selectPlace} state={state} setState={setState} scope={scope} view={plannerView} onViewChange={view => onPlannerView?.(view)} selectedDay={selectedDay} onSelectDay={jumpToDay} onEditDay={openDayEditor} onEditSpot={(date, idx, original) => setEditing({ date, idx, original })} scheduleActions={<div className="journey-day-view-options"><button className="journey-text-action" type="button" aria-pressed={showAllDays} onClick={() => setShowAllDays(value => !value)}>{showAllDays ? '只看選定日子' : '顯示全部日子'}</button>{itinerary.some(day => day.date === today) && <button className="journey-text-action" type="button" onClick={() => selectDay(today)}>回到今日</button>}</div>} />
      {plannerView === 'schedule' && !itinerary.length && <div className="journey-empty"><CalendarDays size={32} /><h2>未有每日行程</h2><p>匯入旅行安排，開始規劃每日路線。</p><a className="primary" href="#settings">去設定匯入行程</a></div>}

      {plannerView === 'schedule' && perDayTimeline.filter(entry => showAllDays || entry.day.date === selectedDay?.date).map(({ day, spots, dayReceipts: daySpend, tripTotal, hkdTotal, rail }) => {
        const dayDate = new Date(`${day.date}T00:00:00`);
        const dayDateValid = !Number.isNaN(dayDate.getTime());
        const dayDateNumber = dayDateValid ? String(dayDate.getDate()) : String(day.day);
        const dayMonth = dayDateValid ? `${dayDate.getMonth() + 1}月` : '';
        const dayWeekday = dayDateValid ? zhWeekdayShortFmt.format(dayDate) : '';
        return (
        <div key={day.date} className="timeline-day-reveal planner-day-enter" tabIndex={pocket ? 0 : undefined} role={pocket ? 'region' : undefined} aria-label={pocket ? `第 ${day.day} 天時間軸` : undefined}>
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
                {day.timezone && <small className="schedule-zone">當地時間 · {day.timezone}</small>}
                {day.highlight && day.highlight !== day.region && <p>{day.highlight}</p>}
                {day.note && <p className="schedule-day-note">{day.note}</p>}
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
              const progress = timelineProgress(day, nowPartsForZone(nowTick, normalizeTimelineTimezone(day.timezone)), spots, idx);
              const stateLabel = timelineStateLabel(progress);
              const category = categoryById(spot.type);
              const startTime = clockLabel(spot.time);
              const finishTime = endLabel(spot, day.date, day.timezone);
              const duration = spotDuration(spot, day);
              const gap = freeMinutes(day, spot, spots[idx + 1]);
              const stableKey = spotStableKey(day.date, spot, idx);
              return (
              <div className="planner-stop-group" data-timed={!!startTime} key={stableKey}><article className={`timeline-event ${progress}${(selectedPlace || placeIdentity(spots[0], 0)) === placeIdentity(spot, idx) && day.date === selectedDay?.date ? ' is-selected' : ''}`} data-category={spot.type} data-spot-key={stableKey} key={stableKey} onClick={pocket ? event => {
                if (!(event.target as HTMLElement).closest('button, a')) selectPlace(day, spot, idx);
              } : undefined} onDoubleClick={pocket && canEditItinerary && spot._spotIdx >= 0 ? event => {
                if (!(event.target as HTMLElement).closest('.timeline-route-actions')) setEditing({ date: day.date, idx: spot._spotIdx, original: spot });
              } : undefined}>
                <div className="timeline-time">
                  <span><time dateTime={startTime && !startTime.startsWith('翌日') ? spot.time : undefined}>{startTime || '待定'}</time></span>
                </div>
                <i className="schedule-stop-node" aria-hidden="true" />
                <div className="schedule-stop-card">
                <VisualIcon id={categoryIconId(spot.type)} label={category.name} className="cat timeline-cat" />
                <strong className="timeline-main">
                  {pocket && <span className="pocket-category">{spot.type === 'sightseeing' ? '景點' : category.name}</span>}
                  <span className="timeline-title-row">
                    <button type="button" className="timeline-title planner-select-place" aria-label={`在行程地圖查看 ${spot.name}`} aria-pressed={day.date === selectedDay?.date && (selectedPlace || placeIdentity(spots[0], 0)) === placeIdentity(spot, idx)} onClick={() => selectPlace(day, spot, idx)}>{spot.name}</button>
                    <em className={`timeline-now timeline-state-${progress}`}>{stateLabel}</em>
                  </span>
                  {(finishTime || spot.timezone && spot.timezone !== day.timezone) && <small className="schedule-time-detail">
                    {[spot.timezone && spot.timezone !== day.timezone ? spot.timezone : '', finishTime ? `${spot.type === 'flight' ? '抵達' : '至'} ${finishTime}${spot.endTimezone && spot.endTimezone !== (spot.timezone || day.timezone) ? ' ' + spot.endTimezone : ''}` : '', duration !== null ? durationLabel(duration) : ''].filter(Boolean).join(' · ')}
                  </small>}
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
                </div>
              </article>
              {gap !== null && <div className="planner-between-stops"><span />{durationLabel(gap)} 空檔 · 可安排交通或休息</div>}
              </div>
            );})}
          </TimelineRail>
          <button className="secondary full-width timeline-loose-receipts" type="button" onClick={() => setDayReceipts(day.date)}>
            <span className="timeline-loose-icon"><ReceiptText size={16} /></span>
            <span className="timeline-loose-copy">
              <strong>{daySpend.length} 筆消費</strong>
            </span>
            <span className="timeline-loose-total">
              {tripPrefix}{fmt(tripTotal)}
              <small>HK$ {fmt(hkdTotal)}</small>
            </span>
          </button>
        </GlassCard>
        </div>
      );})}
      {(() => {
        if (plannerView !== 'schedule') return null;
        // Receipts dated outside every itinerary day used to silently vanish from this tab.
        const dayDates = new Set(itinerary.map((d) => d.date));
        const orphans = tripReceipts.filter((r) => r.date && !dayDates.has(r.date));
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
      {pocket && (plannerView === 'calendar' || plannerView === 'schedule') && <footer className="pocket-legend">
        <span>景點</span><span>餐飲</span><span>住宿</span><span>交通／航班</span>
        <small>{canEditItinerary ? '單擊預覽・雙擊編輯' : '單擊預覽'}</small>
      </footer>}
      </div>
      {['schedule', 'calendar', 'route'].includes(plannerView) && <JourneyMap day={selectedDay} spots={selectedDay ? getScheduleSpots(state, selectedDay) : []} selectedPlace={selectedPlace} onSelect={(spot, index) => selectedDay && selectPlace(selectedDay, spot, index)} onEdit={spot => selectedDay && setEditing({ date: selectedDay.date, idx: spot._spotIdx, original: spot })} canEdit={canEditItinerary} />}
      </div>
      <TripTools state={state} syncState={syncState} onView={view => onPlannerView?.(view)} onSettings={onSettings} />
      {status && <Toast tone="info">{status}</Toast>}
      </div>
    </section>

    {createPortal(<>
    {editing && (
      <div ref={editingContainerRef} className="modal-backdrop" role="dialog" aria-modal="true" aria-label="編輯行程點" onClick={handleCloseSpotEditor}>
        <form ref={editingFormRef} className="modal sheet timeline-edit-sheet" onClick={(event) => event.stopPropagation()} onSubmit={saveSpot}>
          <div className="modal-head">
            <h2>編輯行程點</h2>
            <button type="button" className="icon-btn" onClick={handleCloseSpotEditor}>×</button>
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
          <label>訂位編號<input name="bookingRef" defaultValue={editing.original.bookingRef || ''} /></label>
          <label>備註<input name="note" defaultValue={editing.original.note || ''} /></label>
          {canEditItinerary && !editing.draft && itinerary.length > 1 && (
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
              <button type="button" className="secondary" onClick={handleCloseSpotEditor}>取消</button>
              <button type="submit" className="primary">儲存</button>
            </div>
          </div>
        </form>
      </div>
    )}
    {activeDay && (
      <div ref={dayReceiptsContainerRef} className="modal-backdrop" role="dialog" aria-modal="true" aria-label="當日消費" onClick={() => setDayReceipts(null)}>
        <div className="modal sheet timeline-receipt-sheet" onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h2>{activeDay.date} 消費</h2>
              <p className="muted">{activeDayEntry?.dayReceipts.length ?? 0} 筆 · {tripPrefix}{fmt(activeDayEntry?.tripTotal ?? 0)} · HK$ {fmt(activeDayEntry?.hkdTotal ?? 0)}</p>
            </div>
            <button type="button" className="icon-btn" aria-label="關閉當日消費" onClick={() => setDayReceipts(null)}>×</button>
          </div>
          {activeDayEntry?.dayReceipts.length ? activeDayEntry.dayReceipts.map((r) => <ReceiptRow key={r.id} state={state} receipt={r} onOpen={receipt => { setDayReceipts(null); onOpen(receipt); }} onViewPhoto={setViewPhoto} />) : <p className="empty">呢日未有消費。</p>}
        </div>
      </div>
    )}
    {dayEdit && (
      <div ref={dayEditContainerRef} className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`編輯 Day ${dayEdit.day} 行程`} style={editing?.draft ? { display: 'none' } : undefined} onClick={handleCloseDayEditor}>
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
              // Include idx in the fallback key: two new draft spots share no id and can
              // share time+name, which collided as duplicate React keys and broke editing.
              <div className="timeline-day-editor-row" key={spot.id || `draft-${idx}-${spot.time || ''}`}>
                <input type="time" value={spot.time} aria-label="時間" onChange={(e) => setDayEdit({ ...dayEdit, spots: dayEdit.spots.map((s, i) => i === idx ? { ...s, time: e.target.value } : s) })} />
                <input type="time" value={spot.timeEnd || ''} aria-label="結束時間" onChange={(e) => setDayEdit({ ...dayEdit, spots: dayEdit.spots.map((s, i) => i === idx ? { ...s, timeEnd: e.target.value || undefined } : s) })} />
                <input value={spot.name} placeholder="景點 / 餐廳名" aria-label="名稱" onChange={(e) => setDayEdit({ ...dayEdit, spots: dayEdit.spots.map((s, i) => i === idx ? { ...s, name: e.target.value } : s) })} />
                <select value={spot.type || 'other'} aria-label="類別" onChange={(e) => setDayEdit({ ...dayEdit, spots: dayEdit.spots.map((s, i) => i === idx ? { ...s, type: e.target.value as ItinerarySpot['type'] } : s) })}>
                  {SPOT_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{categoryById(type).name}</option>)}
                </select>
                <button type="button" className="icon-btn detail-btn" aria-label="詳情" onClick={() => openSpotDetailFromDayEditor(spot, idx)}><Settings size={15} /></button>
                <button type="button" className="icon-btn delete-btn" aria-label={`刪除 ${spot.name || '行程點'}`} onClick={() => removeDraftSpot(idx)}><Trash2 size={15} /></button>
              </div>
            ))}
            {!dayEdit.spots.length && <p className="empty">呢日未有行程點。</p>}
          </div>
          <div className="action-row wrap">
            <button type="button" className="secondary" onClick={() => setDayEdit({ ...dayEdit, spots: [...dayEdit.spots, { time: getNextSpotDefaultTime(dayEdit.spots), name: '', type: 'sightseeing' }] })}><Plus size={15} /> 新增行程點</button>
            <button type="button" className="secondary" onClick={() => setDayEdit({ ...dayEdit, spots: dayEdit.spots.slice().sort(compareSpotsByTime) })}><ArrowDownUp size={15} /> 按時間排序</button>
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
      <div ref={swapSourceContainerRef} className="modal-backdrop" role="dialog" aria-modal="true" aria-label="對調行程日" style={swapConfirm ? { display: 'none' } : undefined} onClick={() => setSwapSource(null)}>
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
        <div ref={swapConfirmContainerRef} className="modal-backdrop" role="dialog" aria-modal="true" aria-label="確認對調行程" onClick={() => setSwapConfirm(null)}>
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
    </>, document.body)}
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

// "Now" parts cached per timezone for a single nowMs value: a render with N spots sharing a
// timezone should format once, not N times. Cleared whenever the clock tick changes.
let nowPartsCacheMs = -1;
const nowPartsCache = new Map<string, { date: string; minutes: number } | null>();
function nowPartsForZone(nowMs: number, timezone: string): { date: string; minutes: number } | null {
  if (nowPartsCacheMs !== nowMs) {
    nowPartsCacheMs = nowMs;
    nowPartsCache.clear();
  }
  if (nowPartsCache.has(timezone)) return nowPartsCache.get(timezone) ?? null;
  const parts = datePartsForZone(nowMs, timezone);
  nowPartsCache.set(timezone, parts);
  return parts;
}

function timelineProgress(day: Pick<ItineraryDay, 'date' | 'timezone'>, current: { date: string; minutes: number } | null, spots: ScheduleSpot[], idx: number): TimelineStatus {
  if (!current) return 'is-future';
  const start = dayAxisMinute(spots[idx], day);
  if (start === null) return 'is-untimed';
  const dateOffset = (Date.parse(current.date + 'T00:00:00Z') - Date.parse(day.date + 'T00:00:00Z')) / 60000;
  const now = dateOffset + current.minutes;
  if (now < start) return 'is-future';
  const duration = spotDuration(spots[idx], day);
  if (duration !== null) return now < start + duration ? 'is-live' : 'is-passed';
  for (let j = idx + 1; j < spots.length; j++) {
    const next = dayAxisMinute(spots[j], day);
    if (next !== null && next > start) return now < next ? 'is-live' : 'is-passed';
  }
  return now < (Math.floor(start / 1440) + 1) * 1440 ? 'is-live' : 'is-passed';
}

function timelineStateLabel(progress: TimelineStatus): string {
  if (progress === 'is-untimed') return '待安排';
  if (progress === 'is-passed') return '完成';
  if (progress === 'is-live') return 'Now';
  return '即將';
}

function timelineLiveContext(itinerary: ItineraryDay[], nowMs: number, tripWindow: { start: string; end: string } | null | undefined, spotsByDate: Map<string, { spots: ScheduleSpot[] }>): TimelineLiveContext {
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
    const spots = spotsByDate.get(day.date)?.spots ?? [];
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
  const spots = spotsByDate.get(activeDay.date)?.spots ?? [];
  // Single pass: the old find/find/filter triple evaluated timelineProgress (and a
  // formatToParts) three times per spot on every render.
  let live: ScheduleSpot | undefined;
  let next: ScheduleSpot | undefined;
  let passedCount = 0;
  for (let idx = 0; idx < spots.length; idx += 1) {
    const spot = spots[idx];
    const progress = timelineProgress(activeDay, current, spots, idx);
    if (progress === 'is-live') { if (!live) live = spot; }
    else if (progress === 'is-future') { if (!next) next = spot; }
    else if (progress === 'is-passed') passedCount += 1;
  }

  return {
    mode: 'active',
    date: activeDay.date,
    day: activeDay.day,
    region: activeDay.region,
    nowLabel: current ? formatTimelineMinutes(current.minutes) : '--:--',
    headline: live ? `而家 · ${live.name}` : next ? '準備出發' : !spots.length ? '今日未有行程' : passedCount < spots.length ? '尚有待安排的站點' : '今日行程完成',
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
  const progress = timelineSpotProgress(current.minutes, spots, { date, timezone });
  return { isToday: true, isOutsideTrip: false, progress, label: formatTimelineMinutes(current.minutes) };
}

function timelineTripWindow(itinerary: Array<{ date: string }>): { start: string; end: string } | null {
  const dates = itinerary.map((day) => day.date).filter(Boolean).sort();
  if (!dates.length) return null;
  return { start: dates[0], end: dates[dates.length - 1] };
}

function timelineSpotProgress(currentMinutes: number, spots: ScheduleSpot[], day: Pick<ItineraryDay, 'date' | 'timezone'>): number {
  if (!spots.length) return 0;
  let currentIdx = -1;
  for (let idx = 0; idx < spots.length; idx += 1) {
    const start = dayAxisMinute(spots[idx], day);
    // Skip time-less spots instead of breaking — one bad spot must not freeze the rail at 0.
    if (start === null) continue;
    if (currentMinutes < start) break;
    currentIdx = idx;

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
    let formatter = zonePartsFormatterCache.get(timezone);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
      zonePartsFormatterCache.set(timezone, formatter);
    }
    const parts = formatter.formatToParts(new Date(nowMs));
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
