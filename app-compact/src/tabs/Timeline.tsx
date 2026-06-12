import type { CSSProperties, Dispatch, FormEvent, SetStateAction } from 'react';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Home, MapPin, PencilLine, ReceiptText, RotateCcw } from 'lucide-react';
import { ActionSheet, GlassCard, Reveal, StatusPill, TimelineRail } from '../components/ui';
import { MagicCard } from '../components/ui/magic-card';
import { ShineBorder } from '../components/ui/shine-border';
import { categoryById, dayLooseReceipts, fmt, getItinerary, getScheduleSpots, hkd, mapsUrl, safeExternalUrl, setItineraryOverride, todayForReceipts } from '../lib/domain';
import type { AppState, ItineraryDay, ItinerarySpot, Receipt } from '../lib/types';
import { ReceiptRow } from './Dashboard';
import { ReceiptPhotoModal } from '../components/ReceiptPhotoModal';
import { VisualIcon } from '../components/VisualIcon';
import { categoryIconId } from '../lib/iconManifest';
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
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [editing, setEditing] = useState<{ date: string; idx: number; original: ItinerarySpot } | null>(null);
  const [dayReceipts, setDayReceipts] = useState<string | null>(null);
  const [viewPhoto, setViewPhoto] = useState<Receipt | null>(null);
  const itinerary = getItinerary(state);
  const tripWindow = timelineTripWindow(itinerary);
  const activeDay = dayReceipts ? itinerary.find((day) => day.date === dayReceipts) : null;
  const looseReceipts = activeDay ? dayLooseReceipts(state, activeDay) : [];
  const hasOpenModal = Boolean(editing || activeDay || viewPhoto);
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

  const scrolledRef = useRef(false);
  useEffect(() => {
    if (scrolledRef.current) return;
    if (liveContext.mode !== 'active' || !liveContext.date) return;

    scrolledRef.current = true;
    const timer = window.setTimeout(() => {
      const targetDate = liveContext.date;
      let element = document.querySelector(`.timeline-day[data-date="${targetDate}"] .timeline-event.is-live`);
      if (!element) {
        element = document.querySelector(`.timeline-day[data-date="${targetDate}"]`);
      }
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [liveContext.mode, liveContext.date]);

  useEffect(() => {
    document.documentElement.classList.toggle('modal-open', hasOpenModal);
    return () => document.documentElement.classList.remove('modal-open');
  }, [hasOpenModal]);

  function saveSpot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const data = new FormData(event.currentTarget);
    const patch: Partial<ItinerarySpot> = {
      time: String(data.get('time') || ''),
      name: String(data.get('name') || ''),
      type: String(data.get('type') || 'other') as ItinerarySpot['type'],
      note: String(data.get('note') || ''),
      address: String(data.get('address') || ''),
    };
    setState((prev) => setItineraryOverride(prev, editing.date, editing.idx, patch));
    setEditing(null);
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
                <b><ReceiptText size={18} /> 支出 HK$ {fmt(hkd(dayLooseReceipts(state, commandDay).reduce((s, r) => s + r.total, 0), state))}</b>
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
              <small>鬆散紀錄</small>
            </span>
            <span className="timeline-loose-total">
              ¥{fmt(loose.reduce((s, r) => s + r.total, 0))}
              <small>HK$ {fmt(hkd(loose.reduce((s, r) => s + r.total, 0), state))}</small>
            </span>
          </button>
        </GlassCard>
        </Reveal>
      );})}
      </div>
    </section>

    {editing && (
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <form className="modal sheet timeline-edit-sheet" onSubmit={saveSpot}>
          <div className="modal-head">
            <h2>編輯行程點</h2>
            <button type="button" className="icon-btn" onClick={() => setEditing(null)}>×</button>
          </div>
          <div className="form-grid">
            <label>時間<input name="time" type="time" defaultValue={editing.original.time} /></label>
            <label>類別
              <select name="type" defaultValue={editing.original.type}>
                {['transport', 'food', 'shopping', 'lodging', 'ticket', 'localtour', 'medicine', 'other'].map((id) => <option key={id} value={id}>{categoryById(id).name}</option>)}
              </select>
            </label>
          </div>
          <label>名稱<input name="name" defaultValue={editing.original.name} /></label>
          <label>地址<input name="address" defaultValue={editing.original.address || ''} /></label>
          <label>備註<input name="note" defaultValue={editing.original.note || ''} /></label>
          <div className="modal-actions">
            <button type="button" className="danger" onClick={() => {
              setState((prev) => setItineraryOverride(prev, editing.date, editing.idx, null));
              setEditing(null);
            }}><RotateCcw size={15} /> 還原</button>
            <div className="action-row">
              <button type="button" className="secondary" onClick={() => setEditing(null)}>取消</button>
              <button type="submit" className="primary">儲存</button>
            </div>
          </div>
        </form>
      </div>
    )}
    {activeDay && (
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <div className="modal sheet timeline-receipt-sheet">
          <div className="modal-head">
            <div>
              <h2>{activeDay.date} 消費</h2>
              <p className="muted">{looseReceipts.length} 筆 · ¥{fmt(looseReceipts.reduce((s, r) => s + r.total, 0))} · HK$ {fmt(hkd(looseReceipts.reduce((s, r) => s + r.total, 0), state))}</p>
            </div>
            <button type="button" className="icon-btn" onClick={() => setDayReceipts(null)}>×</button>
          </div>
          {looseReceipts.length ? looseReceipts.map((r) => <ReceiptRow key={r.id} state={state} receipt={r} onOpen={onOpen} onViewPhoto={setViewPhoto} />) : <p className="empty">呢日未有額外消費。</p>}
        </div>
      </div>
    )}
    {viewPhoto && <ReceiptPhotoModal receipt={viewPhoto} onClose={() => setViewPhoto(null)} />}
  </>
  );
}

function spotStableKey(date: string, spot: ScheduleSpot, fallbackIdx: number): string {
  if (spot.receiptId) return `${date}:receipt:${spot.receiptId}`;
  if (spot.spotId) return `${date}:spot:${spot.spotId}`;
  if (spot.id) return `${date}:id:${spot.id}`;
  if (spot._spotIdx >= 0) return `${date}:planned:${spot._spotIdx}`;
  return `${date}:render:${fallbackIdx}`;
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
  return zone || 'Asia/Tokyo';
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
