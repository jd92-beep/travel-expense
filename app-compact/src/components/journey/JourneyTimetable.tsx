import { useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { DayButton } from './DayRail';
import { CategoryGlyph } from '../VisualIcon';
import type { AppState, ItineraryDay, ItinerarySpot } from '../../lib/types';
import { getScheduleSpots, categoryById } from '../../lib/domain';
import { clockLabel, endLabel, durationLabel, placeIdentity, timetableLayout } from '../../lib/plannerLayout';

export function JourneyTimetable({ pocket, calendarJump, state, days, selectedDate, selectedPlace, onSelectDay, onSelect, onEdit }: {
  pocket: boolean; calendarJump: number; state: AppState; days: ItineraryDay[]; selectedDate?: string; selectedPlace: string;
  onSelectDay: (date: string) => void;
  onEdit?: (date: string, index: number, spot: ItinerarySpot) => void;
  onSelect: (day: ItineraryDay, spot: ItinerarySpot, index: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const markerId = useId();
  const reduced = useReducedMotion();
  const [viewportWidth, setViewportWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const hourWidth = 42;
  const availableWidth = Math.max(1, viewportWidth - hourWidth);
  const capacity = availableWidth < 255 ? 2 : Math.max(3, Math.floor(availableWidth / 118));
  const columns = Math.min(Math.max(days.length, 1), capacity);
  const dayWidth = availableWidth / columns;
  const firstVisible = Math.min(days.length - 1, Math.floor((scrollLeft + 1) / dayWidth));
  const lastVisible = Math.min(days.length - 1, Math.ceil((scrollLeft + availableWidth - 1) / dayWidth) - 1);
  const layouts = useMemo(() => days.map(day => ({
    day, ...timetableLayout(getScheduleSpots(state, day), day),
  })), [days, state]);
  const blocks = layouts.flatMap(x => x.blocks);
  const start = Math.floor(Math.min(8 * 60, ...blocks.map(x => x.start)) / 60) * 60;
  const end = Math.ceil(Math.max(20 * 60, ...blocks.map(x => x.displayEnd)) / 60) * 60;
  const scale = 1.5;
  useLayoutEffect(() => {
    const grid = scroller.current;
    if (!grid) return;
    const measure = () => setViewportWidth(grid.clientWidth);
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(grid);
    return () => resize.disconnect();
  }, []);

  const lastJump = useRef('');
  useLayoutEffect(() => {
    const grid = scroller.current;
    const day = grid?.querySelector<HTMLElement>('.journey-calendar-day.is-selected');
    if (!grid || !day || !viewportWidth) return;
    // In Pocket Planner, tapping a visible block selects it in place. Moving the
    // column on the first tap would put a different block under the second tap.
    const jump = [calendarJump, viewportWidth, dayWidth].join(':');
    if (pocket && lastJump.current === jump) return;
    const activity = day.querySelector<HTMLElement>('.planner-time-block.is-selected')
      ?? day.querySelector<HTMLElement>('.planner-time-block');
    // Focus scrolling from the date button can still be running during layout.
    // Position the grid after the browser settles the new selection.
    const frame = requestAnimationFrame(() => {
      lastJump.current = jump;
      grid.scrollTo({ left: day.offsetLeft - hourWidth, top: activity?.offsetTop ?? 0, behavior: 'instant' });
      setScrollLeft(grid.scrollLeft);
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedDate, calendarJump, viewportWidth, dayWidth, pocket]);

  function startPan(event: PointerEvent<HTMLDivElement>) {
    suppressClick.current = false;
    if (!event.isPrimary || event.button !== 0 || event.pointerType === 'touch') return;
    const grid = event.currentTarget;
    // Capture on the pressed element: an ordinary click/double-click still belongs
    // to its button, while movement outside the grid continues the same drag.
    (event.target as Element).setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: grid.scrollLeft, top: grid.scrollTop, moved: false };
  }

  function pan(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 5) return;
    start.moved = true;
    suppressClick.current = true;
    event.currentTarget.dataset.panning = 'true';
    event.currentTarget.scrollTo({ left: start.left - dx, top: start.top - dy, behavior: 'instant' });
  }

  function endPan(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return;
    delete event.currentTarget.dataset.panning;
    drag.current = null;
  }

  function pageDays(direction: number) {
    const grid = scroller.current;
    if (!grid) return;
    const target = Math.round(grid.scrollLeft / dayWidth) + direction * columns;
    grid.scrollTo({ left: Math.max(0, target) * dayWidth, behavior: 'instant' });
  }

  return <section className="journey-calendar" aria-label="多日行事曆">
    {days.length > 0 && <div className="planner-calendar-pager">
      <CalendarRange size={16} aria-hidden="true" />
      <span>{days[firstVisible]?.date.slice(5).replace('-', '/')} – {days[lastVisible]?.date.slice(5).replace('-', '/')} · 共 {days.length} 日</span>
      <button type="button" aria-label="上一組日子" disabled={scrollLeft < 1} onClick={() => pageDays(-1)}><ChevronLeft size={18} /></button>
      <button type="button" aria-label="下一組日子" disabled={scrollLeft >= dayWidth * (days.length - columns) - 1} onClick={() => pageDays(1)}><ChevronRight size={18} /></button>
    </div>}
    <div ref={scroller} className="planner-grid-scroll" tabIndex={0} aria-label="可左右及上下捲動的行程時間表"
      onPointerDown={startPan} onPointerMove={pan} onPointerUp={endPan} onPointerCancel={endPan} onLostPointerCapture={endPan}
      onClickCapture={event => {
        if (event.detail > 0 && suppressClick.current) { event.preventDefault(); event.stopPropagation(); }
      }}
      onDoubleClickCapture={event => { if (suppressClick.current) event.stopPropagation(); }}
      onScroll={event => setScrollLeft(event.currentTarget.scrollLeft)}>
      <div className="planner-time-grid" role="group" aria-label={pocket ? '選擇行程日子' : '各日時間表'} style={{ gridTemplateColumns: `${hourWidth}px repeat(${Math.max(days.length, 1)}, ${dayWidth}px)` }}>
        <div className="planner-hour-column"><div className="planner-grid-heading">時間</div><div style={{ height: (end - start) * scale }}>{Array.from({ length: (end - start) / 60 + 1 }, (_, i) => <time key={i} style={{ top: i * 60 * scale }}>{String(((start / 60) + i + 24) % 24).padStart(2, '0')}:00{start / 60 + i >= 24 ? <small>翌日</small> : start / 60 + i < 0 && <small>前一日</small>}</time>)}</div></div>
        {layouts.map(({ day, blocks, untimed }) => <article key={day.date} className={`journey-calendar-day${selectedDate === day.date ? ' is-selected' : ''}`}>
          <header className="planner-grid-heading">{pocket
            ? <DayButton day={day} selected={day.date === selectedDate} onSelect={onSelectDay} pocket reduced={!!reduced} markerId={markerId} />
            : <strong>Day {day.day} · {day.date.slice(5).replace('-', '/')}</strong>}<span title={day.region}>{day.region}</span>{!blocks.length && !untimed.length && <small>未有活動</small>}<small>{day.timezone || '當地時間'}</small></header>
          <div className="planner-grid-track" style={{ height: (end - start) * scale, backgroundSize: `100% ${60 * scale}px` }}>
            {blocks.map(block => <button type="button" key={placeIdentity(block.spot, block.index)} className={`planner-time-block${selectedDate === day.date && selectedPlace === placeIdentity(block.spot, block.index) ? ' is-selected' : ''}`} data-category={block.spot.type}
              aria-pressed={selectedDate === day.date && selectedPlace === placeIdentity(block.spot, block.index)} aria-label={`${day.date} ${block.spot.time} ${block.spot.name}${block.duration ? `，${durationLabel(block.duration)}` : block.spot.timeEnd ? '，時長待定' : '，結束時間待定'}`}
              style={{ top: (block.start - start) * scale, height: (block.displayEnd - block.start) * scale - 3, left: `calc(${block.lane / block.lanes * 100}% + 3px)`, width: `calc(${100 / block.lanes}% - 6px)` }} onDoubleClick={onEdit && block.spot._spotIdx >= 0 ? () => onEdit(day.date, block.spot._spotIdx, block.spot) : undefined}
              onClick={() => onSelect(day, block.spot, block.index)}>
              <time>{clockLabel(block.spot.time)}{block.spot.timezone && block.spot.timezone !== day.timezone && ' ' + block.spot.timezone}{block.spot.timeEnd && `–${endLabel(block.spot, day.date, day.timezone)}`}</time><strong className="planner-block-title" title={block.spot.name}><CategoryGlyph category={block.spot.type} size={13} /><span>{block.spot.name}</span></strong><small>{block.duration ? durationLabel(block.duration) : block.spot.timeEnd ? '時長待定' : '結束待定'} · {(block.spot.type === 'sightseeing' ? '景點' : categoryById(block.spot.type).name)}</small>
            </button>)}
          </div>
          <div className="planner-untimed"><strong>時間待定</strong>{untimed.map(({ spot, index }) => <button type="button" key={placeIdentity(spot, index)} onDoubleClick={onEdit && spot._spotIdx >= 0 ? () => onEdit(day.date, spot._spotIdx, spot) : undefined} onClick={() => onSelect(day, spot, index)}>{spot.name}</button>)}{!untimed.length && <span>沒有待安排項目</span>}</div>
        </article>)}
      </div>
    </div>
    {!days.length && <p className="journey-empty-inline">未有每日行程。可在旅程工具匯入行程。</p>}
  </section>;
}
