import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BedDouble, CalendarDays, ChevronUp, Cloud, Download, Gamepad2, ListChecks, MapPin, Plane, Settings, Upload, X } from 'lucide-react';
import { useTripTheme } from '../../theme/tripTheme';
import { activeTrip } from '../../domain/trip/normalize';
import { downloadJson, getItinerary, getScheduleSpots } from '../../lib/domain';
import { portableTripBackup, exportFilename } from '../../lib/tripExport';
import { downloadJourneyFile, itineraryCalendar } from '../../lib/journeyTools';
import type { AppState, SyncEngineState } from '../../lib/types';
import { useModalAccessibility } from '../../lib/useModalAccessibility';
import { useModalOpenClass } from '../../lib/useModalOpenClass';
import type { PlannerView } from './JourneyPlanner';

export function TripTools({ state, syncState, onView, onSettings }: { state: AppState; syncState?: SyncEngineState; onView: (view: PlannerView) => void; onSettings: (section: string) => void }) {
  const [open, setOpen] = useState(false), [notice, setNotice] = useState('');
  const pocket = useTripTheme().theme.id === 'pocket_planner';
  const swipeStart = useRef<{ id: number; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  function startSwipe(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    swipeStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    suppressClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveSwipe(event: PointerEvent<HTMLButtonElement>) {
    const start = swipeStart.current;
    if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 8) suppressClick.current = true;
  }
  function endSwipe(event: PointerEvent<HTMLButtonElement>, opening: boolean) {
    const start = swipeStart.current;
    if (start?.id !== event.pointerId) return;
    moveSwipe(event);
    swipeStart.current = null;
    const distance = (event.clientY - start.y) * (opening ? -1 : 1);
    if (distance >= 32 && distance > Math.abs(event.clientX - start.x)) {
      setNotice('');
      setOpen(opening);
    }
  }
  function cancelSwipe() {
    swipeStart.current = null;
    suppressClick.current = true;
  }
  function clickGrip(event: MouseEvent<HTMLButtonElement>, opening: boolean) {
    // Browsers can synthesize a click on the captured grip after a short drag.
    if (pocket && event.detail > 0 && suppressClick.current) return;
    setNotice('');
    setOpen(opening);
  }
  const reduced = useReducedMotion();
  const ref = useModalAccessibility(open, () => setOpen(false));
  useModalOpenClass(open);
  const trip = activeTrip(state);
  const failed = syncState?.failedCount || state.syncQueue?.filter(x => x.status === 'failed').length || 0;
  const syncText = failed || syncState?.status === 'error' ? '同步有未完成項目，請到設定查看' : !state.autoSync ? '自動同步已關閉' : (syncState?.status === 'pushing' || syncState?.status === 'pulling') ? '正在同步…' : syncState?.pendingCount ? `${syncState.pendingCount} 項等待同步` : syncState?.lastSyncedAt ? `上次同步 ${new Date(syncState.lastSyncedAt).toLocaleString('zh-HK')}` : '尚未確認雲端同步';
  const view = (next: PlannerView) => { setOpen(false); onView(next); };
  const settings = (section: string) => { setOpen(false); onSettings(section); };
  return <>
    {createPortal(<button type="button" className="planner-tools-handle" aria-haspopup="dialog" aria-expanded={open} onPointerDown={pocket ? startSwipe : undefined} onPointerUp={pocket ? event => endSwipe(event, true) : undefined} onPointerMove={pocket ? moveSwipe : undefined} onPointerCancel={cancelSwipe} onClick={event => clickGrip(event, true)}><ChevronUp size={18} /> 旅程工具</button>, document.body)}
    {createPortal(<AnimatePresence>{open && <motion.div className="planner-tools-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .18 }} onClick={() => setOpen(false)}>
      <motion.div ref={ref} className="planner-tools-sheet" role="dialog" aria-modal="true" aria-label="旅程工具面板" initial={{ y: reduced ? 0 : '100%' }} animate={{ y: 0 }} exit={{ y: reduced ? 0 : '100%' }} transition={{ duration: reduced ? 0 : .3, ease: [.16, 1, .3, 1] }} onClick={e => e.stopPropagation()}>
        {pocket && <button type="button" className="pocket-sheet-grip" aria-label="收起旅程工具" onPointerDown={startSwipe} onPointerUp={event => endSwipe(event, false)} onPointerMove={moveSwipe} onPointerCancel={cancelSwipe} onClick={event => clickGrip(event, false)}><span /></button>}
        <header><div><h2>旅程工具</h2><p>{trip.name}</p></div><button type="button" className="journey-icon-button" aria-label="關閉旅程工具" onClick={() => setOpen(false)}><X size={22} /></button></header>
        <button type="button" className="planner-sync-status" onClick={() => settings('settings-data')}><Cloud size={20} /><span>{syncText}<small>查看同步與資料管理</small></span></button>
        <nav className="planner-tools-shortcuts" aria-label="更多行程工具">{[{ id: 'flights', label: '航班', icon: Plane }, { id: 'stays', label: '住宿', icon: BedDouble }, { id: 'checklist', label: '清單', icon: ListChecks }, { id: 'play', label: '小遊戲', icon: Gamepad2 }].map(item => <button type="button" key={item.id} onClick={() => view(item.id as PlannerView)}><item.icon size={21} />{item.label}</button>)}</nav>
        <div className="planner-tools-grid">
          <button type="button" aria-label="匯出日曆" onClick={() => { try { const days = getItinerary(state); downloadJourneyFile(itineraryCalendar(trip.name, days.map(day => ({ ...day, spots: getScheduleSpots(state, day) }))), `${exportFilename(trip.name)}-行程.ics`, 'text/calendar;charset=utf-8'); setNotice('已下載日曆檔，可在 Apple、Google 或其他日曆匯入。'); } catch (error) { setNotice(error instanceof Error ? error.message : '未能匯出日曆。'); } }}><CalendarDays size={19} /><span>匯出至日曆<small>Apple / Google · ICS</small></span></button>
          <button type="button" onClick={() => { try { downloadJson(`${exportFilename(trip.name)}-backup.json`, portableTripBackup(state, trip)); setNotice('已匯出目前旅程備份；裝置清單請另行匯出。'); } catch { setNotice('未能下載備份，請到資料管理再試。'); } }}><Download size={19} /><span>匯出旅程備份<small>目前旅程 · JSON</small></span></button>
          <button type="button" onClick={() => settings('settings-trip-update')}><Upload size={19} /><span>匯入行程<small>先預覽，再確認</small></span></button>
          <button type="button" onClick={() => settings('settings-data')}><Upload size={19} /><span>還原備份<small>開啟資料管理</small></span></button>
          <button type="button" onClick={() => settings('settings-trip')}><Settings size={19} /><span>旅程資料<small>日期、旅伴與預算</small></span></button>
          <button type="button" onClick={() => view('route')}><MapPin size={19} /><span>Google Maps<small>所選日子的地點與路線</small></span></button>
        </div>
        {notice && <p className="journey-feedback" role="status">{notice}</p>}
      </motion.div>
    </motion.div>}</AnimatePresence>, document.body)}
  </>;
}
