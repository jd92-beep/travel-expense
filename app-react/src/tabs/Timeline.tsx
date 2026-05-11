import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import { CalendarDays, Clock3, Home, MapPin, PencilLine, ReceiptText, RotateCcw } from 'lucide-react';
import { ActionSheet, GlassCard, StatusPill, TimelineRail } from '../components/ui';
import { MagicCard } from '../components/ui/magic-card';
import { ShineBorder } from '../components/ui/shine-border';
import { categoryById, dayLooseReceipts, fmt, getItinerary, getScheduleSpots, hkd, mapsUrl, safeExternalUrl, setItineraryOverride, todayForReceipts } from '../lib/domain';
import type { AppState, ItinerarySpot, Receipt } from '../lib/types';
import { ReceiptRow } from './Dashboard';
import { VisualIcon } from '../components/VisualIcon';
import { categoryIconId } from '../lib/iconManifest';
import '../styles/timeline.css';

type ScheduleSpot = ItinerarySpot & { _spotIdx: number; receiptId?: string };

export function Timeline({ state, setState, onOpen }: { state: AppState; setState: Dispatch<SetStateAction<AppState>>; onOpen: (receipt: Receipt) => void }) {
  const today = todayForReceipts(state);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [editing, setEditing] = useState<{ date: string; idx: number; original: ItinerarySpot } | null>(null);
  const [dayReceipts, setDayReceipts] = useState<string | null>(null);
  const itinerary = getItinerary(state);
  const activeDay = dayReceipts ? itinerary.find((day) => day.date === dayReceipts) : null;
  const looseReceipts = activeDay ? dayLooseReceipts(state, activeDay) : [];

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

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
    <section className="stack timeline-screen">
      <MagicCard className="timeline-command p-0 rounded-[32px] overflow-hidden relative w-full border border-white/50 shadow-[0_20px_60px_-15px_rgba(45,110,72,0.25)]">
        <ShineBorder className="opacity-80" shineColor={['#2D6E48', '#D4A843']} borderWidth={3} />
        <div className="absolute inset-0 bg-gradient-to-br from-[#2D6E48] via-[#D4A843] to-[#C23B5E] opacity-[0.25] mix-blend-multiply" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 mix-blend-overlay" />
        <div className="absolute inset-0 bg-gradient-to-t from-white/40 via-transparent to-white/10" />
        
        <div className="relative z-10 w-full p-6 sm:p-8 flex flex-col gap-5">
          <div className="flex justify-between items-start w-full">
            <div className="flex gap-5 items-center w-full">
              <div className="flex-shrink-0 w-14 h-14 bg-gradient-to-br from-[#2D6E48] to-[#1a422b] rounded-2xl flex items-center justify-center shadow-lg border border-white/30 text-white font-serif text-2xl font-bold">
                旅
              </div>
              <div className="flex-1 min-w-0">
                <p className="uppercase tracking-[0.2em] text-[11px] font-bold text-green-900/60 mb-1">Timeline</p>
                <h2 className="text-[28px] leading-tight font-extrabold text-green-950 mb-1.5 drop-shadow-sm">行程時間線</h2>
                <p className="text-green-900/80 text-[14px] leading-snug break-words pr-2">
                  所有點、住宿、交通同額外消費都跟 active trip 更新。
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-3 items-center mt-1 pt-4 border-t border-green-900/10">
          <StatusPill tone="info" icon={<CalendarDays size={14} />}>{itinerary.length} 日</StatusPill>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-green-900/80 bg-white/40 px-3 py-1.5 rounded-full border border-white/60 shadow-sm"><Clock3 size={14} /> 日本の旅 · Liquid Glass</span>
        </div>
        </div>
      </MagicCard>

      {itinerary.map((day) => {
        const spots = getScheduleSpots(state, day);
        const loose = dayLooseReceipts(state, day);
        return (
        <GlassCard className={`timeline-day ${day.date === today ? 'today' : ''}`} key={day.date}>
          <div className="section-head timeline-day-head">
            <div className="timeline-day-title">
              <span className="timeline-day-number">Day {day.day}</span>
              <div>
                <p className="eyebrow">{day.date}</p>
                <h2>{day.region}</h2>
                {day.lodging?.name && <p className="muted timeline-lodging"><Home size={13} /> 住宿：{day.lodging.name}</p>}
              </div>
            </div>
            <div className="timeline-day-status">
              <StatusPill tone={day.date === today ? 'danger' : 'neutral'}>{day.date === today ? 'Today' : day.date}</StatusPill>
              <span>{spots.length} 個點</span>
            </div>
          </div>
          <TimelineRail>
            {spots.map((spot, idx) => {
              const progress = timelineProgress(day.date, spot.timezone || day.timezone, spots, idx, nowTick);
              const category = categoryById(spot.type);
              const stableKey = spotStableKey(day.date, spot, idx);
              return (
              <article className={`timeline-event ${progress}`} data-spot-key={stableKey} key={stableKey}>
                <time className="timeline-time" dateTime={`${day.date}T${spot.time || '00:00'}`}>
                  <span>{spot.time}</span>
                  {spot.timezone && <small>{spot.timezone}</small>}
                </time>
                <VisualIcon id={categoryIconId(spot.type)} label={category.name} className="cat timeline-cat" />
                <strong className="timeline-main">
                  <span className="timeline-title-row">
                    <span className="timeline-title">{spot.name}</span>
                    {progress === 'is-live' && <em className="timeline-now">Now</em>}
                  </span>
                  {spot.note && <small>{spot.note}</small>}
                  {spot.address && <small>{spot.address}</small>}
                </strong>
                <ActionSheet>
                  <a className="secondary mini" href={safeExternalUrl(spot.mapUrl, mapsUrl(spot.name, spot.address))} target="_blank" rel="noreferrer"><MapPin size={14} /> 地圖</a>
                {spot.receiptId ? (
                  <button className="secondary mini" type="button" onClick={() => {
                    const receipt = state.receipts.find((r) => r.id === spot.receiptId);
                    if (receipt) onOpen(receipt);
                  }}><ReceiptText size={14} /> 紀錄</button>
                ) : spot._spotIdx >= 0 && (
                  <button className="secondary mini" type="button" onClick={() => setEditing({ date: day.date, idx: spot._spotIdx, original: spot })}><PencilLine size={14} /> 編輯</button>
                )}
                </ActionSheet>
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
      );})}
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
            {looseReceipts.length ? looseReceipts.map((r) => <ReceiptRow key={r.id} state={state} receipt={r} onOpen={onOpen} />) : <p className="empty">呢日未有額外消費。</p>}
          </div>
        </div>
      )}
    </section>
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
