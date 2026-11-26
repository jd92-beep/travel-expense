import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, MapPin, Navigation, Pencil, Map, X } from 'lucide-react';
import { mapsUrl, safeExternalUrl } from '../../lib/domain';
import { CategoryGlyph } from '../VisualIcon';
import { routeDirections } from '../../lib/journeyTools';
import { clockLabel, endLabel, durationLabel, isFlightSpot, placeIdentity, spotDuration } from '../../lib/plannerLayout';
import type { ItineraryDay, ItinerarySpot } from '../../lib/types';

// Offline stop-order sketch (video 2's route card): numbered stops on a smooth path, never to scale.
function RouteSchematic({ spots, selected, onSelect }: { spots: Spot[]; selected: Spot; onSelect: (spot: Spot, index: number) => void }) {
  const reduced = useReducedMotion();
  if (spots.length < 2) return null;
  const width = 320, height = 120, gap = (width - 48) / (spots.length - 1);
  const points = spots.map((_, i) => ({ x: 24 + gap * i, y: 60 + (i % 2 ? 26 : -26) * Math.cos(i * .9) }));
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const d = points.length === 2 ? `M${points[0].x} ${points[0].y}L${points[1].x} ${points[1].y}` : points.reduce((path, p, i) => {
    if (i === 0) return `M${p.x} ${p.y}`;
    const m = mid(points[i - 1], p);
    return i === points.length - 1 ? `${path}Q${points[i - 1].x} ${points[i - 1].y} ${m.x} ${m.y}L${p.x} ${p.y}` : `${path}Q${points[i - 1].x} ${points[i - 1].y} ${m.x} ${m.y}`;
  }, '');
  return <figure className="planner-route-sketch">
    <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      <motion.path d={d} className="planner-route-line" initial={{ pathLength: reduced ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduced ? 0 : .9, ease: [.16, 1, .3, 1] }} />
      {points.map((p, i) => <g key={i} className={spots[i] === selected ? 'is-selected' : ''} transform={`translate(${p.x} ${p.y})`} onClick={() => onSelect(spots[i], i)}>
        <circle className="planner-route-halo" r="17" /><circle className="planner-route-dot" r="12" /><text textAnchor="middle" dy="4">{i + 1}</text>
      </g>)}
    </svg>
    <figcaption>示意圖 · 按停留順序排列，非實際位置或比例</figcaption>
  </figure>;
}

type Spot = ItinerarySpot & { _spotIdx: number; receiptId?: string };
export function JourneyMap({ day, spots, selectedPlace, onSelect, onEdit, canEdit }: {
  day?: ItineraryDay; spots: Spot[]; selectedPlace: string; onSelect: (spot: Spot, index: number) => void;
  onEdit: (spot: Spot) => void; canEdit: boolean;
}) {
  const spot = spots.find((s, i) => placeIdentity(s, i) === selectedPlace) || spots[0];
  const [enabled, setEnabled] = useState(false);
  const [travelMode, setTravelMode] = useState('');
  const [status, setStatus] = useState<'loading' | 'loaded' | 'slow'>('loading');
  const query = spot?.address || spot?.name || '';
  useEffect(() => {
    if (!enabled || !query) return;
    setStatus('loading');
    const timer = window.setTimeout(() => setStatus(s => s === 'loading' ? 'slow' : s), 9000);
    return () => clearTimeout(timer);
  }, [query, enabled]);
  const directions = new URLSearchParams({ api: '1', destination: query });
  if (travelMode) directions.set('travelmode', travelMode);
  const fullRoute = routeDirections(spots);
  const duration = spot ? spotDuration(spot, day) : null;
  return <section className="planner-map" aria-label="當日路線預覽">
    <header className="planner-panel-heading"><div><Map size={19} /><h3>Day {day?.day || '—'} · 地圖與路線</h3></div><span>{day?.date.slice(5).replace('-', '/')}</span></header>
    {spot ? <>
      <nav className="planner-map-stops" aria-label="選擇地圖站點">{spots.map((s, index) => <button type="button" key={placeIdentity(s, index)} aria-pressed={s === spot} onClick={() => onSelect(s, index)}><span>{index + 1}</span><CategoryGlyph category={isFlightSpot(s) ? 'flight' : s.type} size={15} />{s.name}</button>)}</nav>
      <RouteSchematic spots={spots} selected={spot} onSelect={onSelect} />
      <div className="planner-place" aria-live="polite"><div><small>{clockLabel(spot.time) || '時間待定'}{spot.timeEnd && ` – ${endLabel(spot, day?.date || '', day?.timezone)}`}{duration && ` · ${durationLabel(duration)}`}</small><h3>{spot.name}</h3><p>{spot.address || '未填地址，地圖將以地點名稱搜尋。'}</p>{spot.note && <p>{spot.note}</p>}</div>
        {spot._spotIdx >= 0 && <button type="button" className="journey-icon-button" aria-label={`${canEdit ? '編輯' : '檢視'}所選行程`} onClick={() => onEdit(spot)}><Pencil size={18} /></button>}
      </div>
      <label className="planner-map-mode">導航方式<select value={travelMode} onChange={event => setTravelMode(event.target.value)}><option value="">在 Google Maps 選擇</option><option value="walking">步行</option><option value="transit">公共交通</option><option value="driving">駕車</option></select></label>
      <div className="planner-map-actions"><a className="primary" href={`https://www.google.com/maps/dir/?${directions}`} target="_blank" rel="noopener noreferrer"><Navigation size={17} /> 導航到這裡</a><a className="secondary" href={safeExternalUrl(spot.mapUrl, mapsUrl(spot.name, spot.address))} target="_blank" rel="noopener noreferrer"><MapPin size={17} /> 在地圖開啟 <ArrowUpRight size={14} /></a></div>
      {!enabled ? <button type="button" className="planner-map-activate" onClick={() => setEnabled(true)}><Map size={28} /><strong>載入 Google 地圖預覽</strong><span>連線後顯示所選地點</span></button> : <div className="journey-map-embed">
        <div className="planner-map-caption"><span>Google 地圖 · 需要網絡</span><button type="button" className="journey-text-action" onClick={() => setEnabled(false)}><X size={15} /> 收起地圖</button></div>
        {status !== 'loaded' && <p role="status">{status === 'slow' ? '預覽未能確認載入。可直接在 Google Maps 開啟。' : '正在載入所選地點…'}</p>}
        <iframe key={query} title={`${spot.name} Google 地圖預覽`} loading="lazy" referrerPolicy="no-referrer" src={`https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`} onLoad={() => setStatus('loaded')} onError={() => setStatus('slow')} />
        <small>預覽空白或受限制時，請使用上方「在地圖開啟」。</small>
      </div>}
      {fullRoute ? <a className="journey-whole-route" href={fullRoute} target="_blank" rel="noopener noreferrer">在 Google Maps 開啟全日路線 <ArrowUpRight size={17} /></a> : <p className="journey-footnote">停留點較多，請逐站開啟地圖，避免手機地圖省略中途站。</p>}
    </> : <p className="journey-empty-inline">這天未有停留點。加入行程後即可查看地圖。</p>}
  </section>;
}
