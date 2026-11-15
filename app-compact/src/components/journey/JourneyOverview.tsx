import { CalendarDays, Plane, BedDouble, ListChecks, ArrowUpRight, MapPin, Plus, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { activeTrip } from '../../domain/trip/normalize';
import { getItinerary, getPersons, getScheduleSpots, mapsUrl, safeExternalUrl, todayForReceipts } from '../../lib/domain';
import type { AppState, TabId } from '../../lib/types';
import { DayRail } from './DayRail';
import { JourneyCover } from './JourneyCover';
import type { PlannerView } from './JourneyPlanner';

export function JourneyOverview({ state, onTab, onPlanner, onManual }: {
  state: AppState; onTab: (tab: TabId) => void; onPlanner?: (view: PlannerView) => void; onManual: () => void;
}) {
  const trip = activeTrip(state);
  const days = getItinerary(state);
  const today = todayForReceipts(state, days);
  const [selected, setSelected] = useState(() => days.find(d => d.date === today)?.date || days[0]?.date || '');
  const day = days.find(d => d.date === selected) || days.find(d => d.date === today) || days[0];
  const spots = day ? getScheduleSpots(state, day) : [];
  const start = Date.parse(`${trip.startDate}T12:00:00Z`);
  const current = Date.parse(`${today}T12:00:00Z`);
  const until = Math.ceil((start - current) / 86400000);
  const status = until > 0 ? `${until} 日後出發` : today > trip.endDate ? '旅程回顧' : '旅程進行中';
  const open = (view: PlannerView) => { if (onPlanner) onPlanner(view); else onTab('timeline'); };
  return <section className="journey-overview" aria-label="旅程與下一站">
    <div className="journey-hero-heading">
      <div><h2>{trip.name || '下一趟旅程'}</h2><p>{trip.startDate} 至 {trip.endDate}<span> · {days.length} 日 · {getPersons(state).length} 位同行</span></p></div>
      <span className="journey-departure">{status}</span>
    </div>
    <JourneyCover trip={trip} />
    <div className="journey-quick-links" aria-label="旅程工具">
      {([{ id: 'schedule', label: '每日行程', icon: CalendarDays }, { id: 'flights', label: '航班', icon: Plane }, { id: 'stays', label: '住宿', icon: BedDouble }, { id: 'checklist', label: '清單', icon: ListChecks }] as const).map(item =>
        <button key={item.id} type="button" onClick={() => open(item.id)}><item.icon size={20} /><span>{item.label}</span><ArrowUpRight size={14} /></button>)}
    </div>
    {days.length ? <>
      <DayRail days={days} selected={day?.date || ''} onSelect={setSelected} />
      <div className="journey-next-head"><div><p>第 {day?.day} 天 · {day?.date}</p><h3>{day?.region || '沿途安排'}</h3></div><button type="button" className="journey-text-action" onClick={() => open('schedule')}>完整行程 <ArrowRight size={16} /></button></div>
      <ol className="journey-next-stops">
        {spots.slice(0, 3).map((spot, i) => <li key={spot.id || `${spot.name}-${i}`}><time>{spot.time || '待定'}</time><span className="journey-stop-dot" /><div><strong>{spot.name}</strong>{spot.note && <p>{spot.note}</p>}</div><a href={safeExternalUrl(spot.mapUrl, mapsUrl(spot.name, spot.address))} target="_blank" rel="noopener noreferrer" aria-label={`在地圖查看 ${spot.name}`}><MapPin size={18} /></a></li>)}
        {!spots.length && <li className="journey-empty-inline"><p>呢日留白也很好。想好去邊，就加落行程。</p><button type="button" className="secondary" onClick={() => open('schedule')}>安排行程</button></li>}
      </ol>
    </> : <div className="journey-empty"><h3>把想去的地方，排成一段旅程</h3><p>在設定匯入行程，或新增第一個停留點。</p><button type="button" className="primary" onClick={() => onTab('settings')}>設定旅程</button></div>}
    <div className="journey-capture-strip"><div><strong>沿途花費，隨手記低</strong><p>收據、現金、車票都放在同一趟旅程。</p></div><button type="button" className="primary" onClick={onManual}><Plus size={18} /> 記一筆</button></div>
  </section>;
}
