import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import { CalendarDays, MapPin, ReceiptText } from 'lucide-react';
import { ActionSheet, GlassCard, StatusPill, TimelineRail } from '../components/ui';
import { categoryById, dayLooseReceipts, fmt, getItinerary, getScheduleSpots, hkd, mapsUrl, safeExternalUrl, setItineraryOverride, todayForReceipts } from '../lib/domain';
import type { AppState, ItinerarySpot, Receipt } from '../lib/types';
import { ReceiptRow } from './Dashboard';

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
    <section className="stack">
      <GlassCard className="timeline-command">
        <div>
          <p className="eyebrow">Timeline</p>
          <h2>行程時間線</h2>
          <p className="muted">所有點、住宿、交通同額外消費都跟 active trip 更新。</p>
        </div>
        <StatusPill tone="info" icon={<CalendarDays size={14} />}>{itinerary.length} 日</StatusPill>
      </GlassCard>

      {itinerary.map((day) => {
        const spots = getScheduleSpots(state, day);
        const loose = dayLooseReceipts(state, day);
        return (
        <GlassCard className={`timeline-day ${day.date === today ? 'today' : ''}`} key={day.date}>
          <div className="section-head">
            <div>
              <p className="eyebrow">Day {day.day}</p>
              <h2>{day.region}</h2>
              {day.lodging?.name && <p className="muted">住宿：{day.lodging.name}</p>}
            </div>
            <StatusPill tone={day.date === today ? 'danger' : 'neutral'}>{day.date === today ? 'Today' : day.date}</StatusPill>
          </div>
          <TimelineRail>
            {spots.map((spot, idx) => {
              const progress = timelineProgress(day.date, spot.timezone || day.timezone, spots, idx, nowTick);
              return (
              <div className={`timeline-event ${progress}`} key={`${spot.time}-${spot.name}-${spot.receiptId || spot.spotId || spot.id || spot._spotIdx}`}>
                <span className="timeline-time">{spot.time}{spot.timezone ? ` ${spot.timezone}` : ''}</span>
                <span className="cat" style={{ background: `${categoryById(spot.type).color}22`, color: categoryById(spot.type).color }}>{categoryById(spot.type).icon}</span>
                <strong className="timeline-main">
                  {spot.name}
                  {progress === 'is-live' && <em className="timeline-now">Now</em>}
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
                  <button className="secondary mini" type="button" onClick={() => setEditing({ date: day.date, idx: spot._spotIdx, original: spot })}>編輯</button>
                )}
                </ActionSheet>
              </div>
            );})}
          </TimelineRail>
          <button className="secondary full-width" type="button" onClick={() => setDayReceipts(day.date)}>
            💰 {loose.length} 筆消費 · ¥{fmt(loose.reduce((s, r) => s + r.total, 0))}
          </button>
        </GlassCard>
      );})}
      {editing && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="modal sheet" onSubmit={saveSpot}>
            <div className="modal-head">
              <h2>編輯行程點</h2>
              <button type="button" className="icon-btn" onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="form-grid">
              <label>時間<input name="time" type="time" defaultValue={editing.original.time} /></label>
              <label>類別
                <select name="type" defaultValue={editing.original.type}>
                  {['transport', 'food', 'shopping', 'lodging', 'ticket', 'localtour', 'medicine', 'other'].map((id) => <option key={id} value={id}>{categoryById(id).icon} {categoryById(id).name}</option>)}
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
              }}>還原</button>
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
          <div className="modal sheet">
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
