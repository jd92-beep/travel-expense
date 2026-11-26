import { motion, useReducedMotion } from 'motion/react';
import planeMarker from '../../assets/journey/pocket-flight.webp';
import railMarker from '../../assets/journey/pocket-station.webp';
import outingMarker from '../../assets/journey/pocket-car.webp';
import bagMarker from '../../assets/journey/pocket-case.webp';
import { CategoryGlyph } from '../VisualIcon';
import { useEffect, useRef, useId } from 'react';
import { isFlightSpot } from '../../lib/plannerLayout';
import type { ItineraryDay } from '../../lib/types';

export function DayRail({ days, selected, onSelect, pocket = false }: {
  pocket?: boolean; days: ItineraryDay[]; selected: string; onSelect: (date: string) => void;
}) {
  const markerId = useId();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rail = ref.current;
    const item = rail?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!rail || !item) return;
    // Scroll the date rail only. scrollIntoView also moves the whole page on mobile.
    if (rail.scrollHeight > rail.clientHeight + 1) {
      rail.scrollTo({ top: item.offsetTop - (rail.clientHeight - item.clientHeight) / 2, behavior: 'instant' });
      return;
    }
    rail.scrollTo({ left: item.offsetLeft - rail.offsetLeft - (rail.clientWidth - item.clientWidth) / 2,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [selected]);
  return <div className="journey-day-rail" ref={ref} role="group" aria-label="選擇行程日子">
    {days.map(day => <DayButton key={day.date} day={day} selected={selected === day.date} onSelect={onSelect}
      pocket={pocket} reduced={!!reduced} markerId={markerId} />)}
  </div>;
}

export function DayButton({ day, selected, onSelect, pocket, reduced, markerId }: {
  day: ItineraryDay; selected: boolean; onSelect: (date: string) => void; pocket: boolean; reduced: boolean; markerId: string;
}) {
  const date = new Date(`${day.date}T12:00:00`);
  const types = day.spots.map(spot => spot.type);
  const illustration = day.spots.some(isFlightSpot) ? planeMarker : types.includes('shopping') ? bagMarker
    : types.includes('transport') ? railMarker : outingMarker;
  const valid = !Number.isNaN(date.getTime());
  return <button type="button" className="journey-day" aria-pressed={selected}
    aria-label={`Day ${day.day} · ${day.date} · ${day.region}`} onClick={() => onSelect(day.date)}>
    <span className="planner-day-dot" aria-hidden="true" />
    {selected && <motion.span className="planner-day-marker" layoutId={markerId} transition={{ duration: reduced ? 0 : .24, ease: [.16, 1, .3, 1] }} aria-hidden="true">{pocket ? <img src={illustration} alt="" /> : <CategoryGlyph category={day.spots.some(isFlightSpot) ? 'flight' : day.spots[0]?.type} size={19} />}</motion.span>}
    <span>{valid ? new Intl.DateTimeFormat('zh-HK', { weekday: 'short' }).format(date) : `Day ${day.day}`}</span>
    <strong>{valid ? date.getDate() : day.day}</strong>
    <small>{valid ? `${date.getMonth() + 1}月` : day.date}</small>
    <span className="journey-day-region">{day.region || '待安排'}</span>
  </button>;
}
