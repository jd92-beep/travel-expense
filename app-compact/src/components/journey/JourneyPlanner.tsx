import { motion, useReducedMotion } from 'motion/react';
import { useId, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react';
import { ArrowUpRight, Hotel, CalendarDays, CalendarRange, Check, Gamepad2, ListChecks, MapPin, Pencil, Plane, Plus, Route, X } from 'lucide-react';
import { activeTrip } from '../../domain/trip/normalize';
import { applyItineraryEdit, getItinerary, getScheduleSpots, mapsUrl, safeExternalUrl } from '../../lib/domain';
import type { AppState, ItineraryDay, ItinerarySpot } from '../../lib/types';
import { JourneyChecklist } from './JourneyChecklist';
import { JourneyTimetable } from './JourneyTimetable';
import { useTripTheme } from '../../theme/tripTheme';
import takeoff from '../../assets/journey/postcard-takeoff.gif';
import takeoffStill from '../../assets/journey/postcard-takeoff.webp';
import landing from '../../assets/journey/postcard-landing.gif';
import landingStill from '../../assets/journey/postcard-landing.webp';
import { clockLabel, endLabel } from '../../lib/plannerLayout';
import { tripPacking } from '../../lib/journeyActivities';
import { JourneyGame } from './JourneyGame';

export type PlannerView = 'schedule' | 'calendar' | 'route' | 'flights' | 'stays' | 'checklist' | 'play';
export const PLANNER_VIEWS = [
  { id: 'schedule', label: '日程', icon: CalendarDays }, { id: 'calendar', label: '日曆', icon: CalendarRange },
  { id: 'route', label: '路線', icon: Route }, { id: 'flights', label: '航班', icon: Plane },
  { id: 'stays', label: '住宿', icon: Hotel }, { id: 'checklist', label: '清單', icon: ListChecks },
  { id: 'play', label: '小遊戲', icon: Gamepad2 },
] as const;

type BookingDraft = { kind: 'flight' | 'lodging'; date: string; name: string; time: string; timeEnd: string; address: string; bookingRef: string; note: string; originalDate?: string; originalIndex?: number; dayLodging?: boolean };

export function JourneyPlanner({ pocket, days, calendarJump, state, setState, scope, view, onViewChange, selectedDay, onSelectDay, onEditDay, onEditSpot, scheduleActions, selectedPlace, onSelectPlace }: {
  pocket: boolean; days: ItineraryDay[]; calendarJump: number;
  state: AppState; setState: Dispatch<SetStateAction<AppState>>; scope: string;
  view: PlannerView; onViewChange: (view: PlannerView) => void; selectedDay?: ItineraryDay;
  onSelectDay: (date: string) => void; onEditDay: (day: ItineraryDay) => void;
  onEditSpot: (date: string, index: number, spot: ItinerarySpot) => void;
  scheduleActions?: ReactNode;
  selectedPlace: string; onSelectPlace: (day: ItineraryDay, spot: ItinerarySpot, index: number) => void;
}) {
  const indicator = useId();
  const reduced = useReducedMotion();
  const postcard = useTripTheme().theme.id === 'alpine_postcard';
  const trip = activeTrip(state);
  const canEdit = trip.sharing?.role !== 'viewer';
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [status, setStatus] = useState('');
  const packing = view === 'checklist' ? tripPacking(days) : [];
  const selected = selectedDay || days[0];

  function createBooking(kind: 'flight' | 'lodging') {
    setDraft({ kind, date: selected?.date || trip.startDate, name: '', time: '', timeEnd: '', address: '', bookingRef: '', note: '' });
    setStatus('');
  }

  function saveBooking(event: FormEvent) {
    event.preventDefault();
    if (!draft || !draft.name.trim()) return;
    const captured = draft;
    const date = new Date(`${captured.date}T12:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== captured.date) { setStatus('請輸入有效日期。'); return; }
    if (captured.date < trip.startDate || captured.date > trip.endDate) { setStatus('預訂日期須在目前旅程日期內。請先在設定調整旅程日期。'); return; }
    const tripId = trip.id;
    setState(prev => {
      if (activeTrip(prev).id !== tripId || activeTrip(prev).sharing?.role === 'viewer') return prev;
      const itinerary = getItinerary(prev).map(day => ({ ...day, spots: [...day.spots] }));
      const original = itinerary.find(day => day.date === captured.originalDate);
      let target = itinerary.find(day => day.date === captured.date);
      if (!target) {
        target = { date: captured.date, day: itinerary.length + 1, region: trip.destinationSummary || trip.name, timezone: trip.timezones?.[0], spots: [] };
        itinerary.push(target);
      }
      if (captured.dayLodging && original) {
        original.lodging = { ...original.lodging, name: captured.name.trim(), address: captured.address.trim(), bookingRef: captured.bookingRef.trim(), checkIn: captured.time, checkOut: captured.timeEnd };
      } else {
        const previous = captured.originalIndex !== undefined ? original?.spots[captured.originalIndex] : undefined;
        const spot: ItinerarySpot = { ...previous, id: previous?.id || crypto.randomUUID(), name: captured.name.trim(), type: captured.kind, time: captured.time, timeEnd: captured.timeEnd || undefined, address: captured.address.trim(), bookingRef: captured.bookingRef.trim(), note: captured.note.trim() };
        if (previous && original && captured.originalIndex !== undefined) original.spots.splice(captured.originalIndex, 1);
        target.spots.push(spot);
      }
      return applyItineraryEdit(prev, itinerary.sort((a, b) => a.date.localeCompare(b.date)));
    });
    setDraft(null); setStatus('已儲存到目前旅程的行程。');
  }

  const flights = days.flatMap(day => getScheduleSpots(state, day).filter(spot => spot.type === 'flight').map(spot => ({ day, spot })));
  const stays = days.flatMap(day => [
    ...(day.lodging?.name ? [{ day, name: day.lodging.name, address: day.lodging.address, bookingRef: day.lodging.bookingRef, time: day.lodging.checkIn, timeEnd: day.lodging.checkOut, mapUrl: day.lodging.mapUrl, spot: null as (ItinerarySpot & { _spotIdx: number; receiptId?: string }) | null }] : []),
    ...getScheduleSpots(state, day).filter(spot => spot.type === 'lodging' && spot.name !== day.lodging?.name).map(spot => ({ day, name: spot.name, address: spot.address, bookingRef: spot.bookingRef, time: spot.time, timeEnd: spot.timeEnd, mapUrl: spot.mapUrl, spot })),
  ]);

  const bookingVisible = canEdit && draft?.kind === (view === 'flights' ? 'flight' : 'lodging');
  return <>
    {!pocket && <nav className="journey-planner-tabs" aria-label="行程工具">{PLANNER_VIEWS.filter(item => ['schedule', 'calendar', 'route'].includes(item.id)).map(item => <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => { onViewChange(item.id); setDraft(null); setStatus(''); }}>{view === item.id && <motion.i aria-hidden="true" className="planner-tab-indicator" layoutId={reduced ? undefined : indicator} transition={{ duration: .22, ease: [.16, 1, .3, 1] }} />}<item.icon size={17} /><span>{item.id === 'calendar' ? '多日' : item.id === 'route' ? '地圖' : item.label}</span></button>)}</nav>}
    {view === 'schedule' && <div className="journey-planner-actions">{scheduleActions}</div>}
    {status && <p className="journey-feedback" role="status">{status}</p>}

    {view === 'calendar' && <JourneyTimetable onSelectDay={onSelectDay} pocket={pocket} calendarJump={calendarJump} onEdit={pocket && canEdit ? onEditSpot : undefined} state={state} days={days} selectedDate={selected?.date} selectedPlace={selectedPlace} onSelect={onSelectPlace} />}
    {view === 'route' && <p className="planner-grid-hint">點選站點，連接 Google Maps 查看位置或開始導航。</p>}
    {!['schedule', 'calendar', 'route'].includes(view) && <button type="button" className="journey-text-action" onClick={() => onViewChange('schedule')}>← 返回每日行程</button>}

    {(view === 'flights' || view === 'stays') && <section className="journey-bookings" aria-label={view === 'flights' ? '旅程航班' : '旅程住宿'}>
      <header className="journey-section-heading"><div><h2>{view === 'flights' ? '飛向下一站' : '今晚，住這裡'}</h2><p>{view === 'flights' ? '航班資料來自行程，並非即時航班狀態。' : '入住安排、地址與訂位資料，集中在一起。'}</p></div>{canEdit && <button type="button" className="secondary" onClick={() => createBooking(view === 'flights' ? 'flight' : 'lodging')}><Plus size={17} /> {view === 'flights' ? '新增航班' : '新增住宿'}</button>}</header>
      {draft && bookingVisible && <form className="journey-inline-form" aria-label={draft.kind === 'flight' ? '航班資料' : '住宿資料'} onSubmit={saveBooking}>
        <div className="journey-form-title"><h3>{draft.originalDate ? '編輯' : '新增'}{draft.kind === 'flight' ? '航班' : '住宿'}</h3><button type="button" className="journey-icon-button" aria-label="取消編輯預訂" onClick={() => setDraft(null)}><X size={18} /></button></div>
        <label>{draft.kind === 'flight' ? '航班名稱及路線' : '住宿名稱'}<input autoFocus required maxLength={200} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder={draft.kind === 'flight' ? '例如：CX536 香港 → 名古屋' : '酒店或民宿名稱'} /></label>
        <div className="journey-form-grid"><label>日期<input required type="date" min={trip.startDate} max={trip.endDate} disabled={draft.dayLodging} value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} /></label><label>{draft.kind === 'flight' ? '起飛時間' : '入住時間'}<input type="time" value={draft.time} onChange={e => setDraft({ ...draft, time: e.target.value })} /></label><label>{draft.kind === 'flight' ? '抵達時間' : '退房時間'}<input type="time" value={draft.timeEnd} onChange={e => setDraft({ ...draft, timeEnd: e.target.value })} /></label></div>
        <p className="journey-footnote">時間按行程當地時區顯示。未確認的時間可留白；跨日抵達請在備註寫明日期及時區。</p>
        <label>地址<input maxLength={500} value={draft.address} onChange={e => setDraft({ ...draft, address: e.target.value })} /></label><label>訂位編號<input maxLength={120} value={draft.bookingRef} onChange={e => setDraft({ ...draft, bookingRef: e.target.value })} /></label>
        {!draft.dayLodging && <label>備註<textarea rows={3} maxLength={2000} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} placeholder="行李、付款狀態、交通方式…" /></label>}
        <div className="action-row"><button type="button" className="secondary" onClick={() => setDraft(null)}>取消</button><button type="submit" className="primary"><Check size={16} /> 儲存預訂</button></div>
      </form>}
      <div className="journey-booking-grid">{view === 'flights' ? flights.map(({ day, spot }, i) => <article className="journey-flight-ticket" key={`${day.date}-${i}`}>
        {postcard && <picture className="postcard-flight-art">
          <source media="(prefers-reduced-motion: reduce)" srcSet={i === 0 ? takeoffStill : landingStill} />
          <img src={i === 0 ? takeoff : landing} width="520" height="120" alt="" loading="lazy" />
        </picture>}
        <header><Plane size={20} /><span>{day.date}</span><span>Day {day.day}</span></header><h3>{spot.name}</h3>
        <div className="journey-flight-times"><div><small>出發</small><strong>{clockLabel(spot.time) || '待確認'}</strong>{spot.timezone && <small>{spot.timezone}</small>}</div><span className="journey-flight-path"><Plane size={20} /></span><div><small>抵達</small><strong>{endLabel(spot, day.date, day.timezone) || '待確認'}</strong>{spot.endTimezone && <small>{spot.endTimezone}</small>}</div></div>
        {(spot.timezone || day.timezone) && <p className="journey-footnote">行程時區：{spot.timezone || day.timezone}</p>}
        {spot.note && <p className="journey-booking-note">{spot.note}</p>}{spot.bookingRef && <p className="journey-booking-reference">訂位編號 <strong>{spot.bookingRef}</strong></p>}
        <footer><a href={safeExternalUrl(spot.mapUrl, mapsUrl(spot.name, spot.address))} target="_blank" rel="noopener noreferrer"><MapPin size={16} /> 地圖</a>{spot._spotIdx >= 0 && <button type="button" className="journey-text-action" onClick={() => onEditSpot(day.date, spot._spotIdx, spot)}><Pencil size={15} /> {canEdit ? '編輯' : '檢視行程'}</button>}</footer>
      </article>) : stays.map(stay => <article className="journey-stay-card" key={`${stay.day.date}-${stay.name}`}>
        <div className="journey-stay-date"><Hotel size={26} strokeWidth={1.4} /><span>{stay.day.date.slice(5).replace('-', '/')}</span><small>Day {stay.day.day}</small></div><div className="journey-stay-copy"><h3>{stay.name}</h3><p>{stay.address || stay.day.region}</p>{(stay.time || stay.timeEnd) && <p>入住 {stay.time || '待確認'} · 退房 {stay.timeEnd || '待確認'}</p>}{stay.bookingRef && <p className="journey-booking-reference">訂位編號 <strong>{stay.bookingRef}</strong></p>}{stay.spot?.note && <p className="journey-booking-note">{stay.spot.note}</p>}<footer><a href={safeExternalUrl(stay.mapUrl, mapsUrl(stay.name, stay.address))} target="_blank" rel="noopener noreferrer"><MapPin size={16} /> 地圖</a>{canEdit && <button type="button" className="journey-text-action" onClick={() => {
          if (stay.spot && stay.spot._spotIdx >= 0) onEditSpot(stay.day.date, stay.spot._spotIdx, stay.spot);
          else if (!stay.spot) setDraft({ kind: 'lodging', date: stay.day.date, originalDate: stay.day.date, dayLodging: true, name: stay.name, address: stay.address || '', bookingRef: stay.bookingRef || '', time: stay.time || '', timeEnd: stay.timeEnd || '', note: '' });
        }}><Pencil size={15} /> 編輯</button>}</footer></div>
      </article>)}</div>
      {(view === 'flights' ? !flights.length : !stays.length) && !bookingVisible && <div className="journey-empty">{view === 'flights' ? <Plane size={36} strokeWidth={1.3} /> : <Hotel size={36} strokeWidth={1.3} />}<h3>{view === 'flights' ? '未有航班' : '未有住宿'}</h3><p>匯入行程時會自動整理，亦可在這裡手動加入。</p>{canEdit && <button type="button" className="primary" onClick={() => createBooking(view === 'flights' ? 'flight' : 'lodging')}>加入第一個{view === 'flights' ? '航班' : '住宿'}</button>}</div>}
    </section>}
    {view === 'checklist' && <JourneyChecklist packing={packing} pocket={pocket} key={JSON.stringify([scope, trip.id, pocket, packing])} scope={scope} tripId={trip.id} tripName={trip.name} />}
    {view === 'play' && <JourneyGame key={trip.id} days={days} />}
  </>;
}
