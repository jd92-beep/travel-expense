// @ts-expect-error TS5097: also consumed by Node's strip-types test runner.
import { calendarInstant, calendarTime, spotEndInstant } from './journeyTools.ts';
import type { ItineraryDay, ItinerarySpot } from './types';

export function minuteOfDay(value?: string): number | null {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}
// A pasted timetable can use 25:30 to mean 01:30 the following day.
function itineraryMinute(value?: string) {
  if (!value || !/^(?:\d|[0-3]\d|4[0-7]):[0-5]\d$/.test(value)) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

export function clockLabel(value?: string) {
  const minutes = itineraryMinute(value);
  if (minutes === null) return '';
  return minutes >= 1440 ? '翌日 ' + String(Math.floor(minutes / 60) - 24).padStart(2, '0') + value!.slice(-3) : value!.padStart(5, '0');
}

export function endLabel(spot: ItinerarySpot, date: string, timezone?: string) {
  const label = clockLabel(spot.timeEnd);
  if (!label) return '';
  if (spot.endDate && spot.endDate !== date) return spot.endDate.slice(5).replace('-', '/') + ' ' + label;
  if (!spot.endDate && (!spot.endTimezone || spot.endTimezone === (spot.timezone || timezone)) && spot.time && !label.startsWith('翌日') && label < clockLabel(spot.time)) return '翌日 ' + label;
  return label;
}

type DayClock = Pick<ItineraryDay, 'date' | 'timezone'>;
function epochMinutes(stamp: string) {
  const iso = stamp.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/, '$1-$2-$3T$4:$5:$6Z');
  return Date.parse(iso) / 60000;
}
export function spotDuration(spot: ItinerarySpot, day?: DayClock): number | null {
  const start = itineraryMinute(spot.time), end = itineraryMinute(spot.timeEnd);
  if (start === null || end === null) return null;
  if (day) {
    try {
      const local = calendarTime(day.date, spot.time);
      const finish = spotEndInstant(day, spot);
      if (!local || !finish) return null;
      const elapsed = epochMinutes(finish) - epochMinutes(calendarInstant(local, spot.timezone || day.timezone || ''));
      return elapsed > 0 ? elapsed : null;
    } catch { return null; }
  }
  if (spot.endDate || spot.endTimezone || start === end) return null;
  return end > start ? end - start : end + 1440 - start;
}

// Position the stop on the column's local clock. The activity label still
// shows the traveller's original clock and zone when they differ.
export function dayAxisMinute(spot: ItinerarySpot, day?: DayClock): number | null {
  const minutes = itineraryMinute(spot.time);
  if (minutes === null || !day?.timezone || !spot.timezone || day.timezone === spot.timezone) return minutes;
  try {
    const clock = calendarTime(day.date, spot.time);
    if (!clock) return null;
    const instant = epochMinutes(calendarInstant(clock, spot.timezone));
    const local = new Intl.DateTimeFormat('en-GB', {
      timeZone: day.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(instant * 60000);
    const value = (type: string) => Number(local.find(part => part.type === type)?.value);
    const date = Date.UTC(value('year'), value('month') - 1, value('day'));
    return (date - Date.parse(day.date + 'T00:00:00Z')) / 60000 + value('hour') * 60 + value('minute');
  } catch { return null; }
}

export function freeMinutes(day: DayClock, spot: ItinerarySpot, next?: ItinerarySpot) {
  if (!next?.time || spotDuration(spot, day) === null) return null;
  try {
    const finish = spotEndInstant(day, spot);
    const start = calendarTime(day.date, next.time);
    if (!finish || !start) return null;
    const gap = epochMinutes(calendarInstant(start, next.timezone || day.timezone || '')) - epochMinutes(finish);
    return gap > 0 ? gap : null;
  } catch { return null; }
}
export function durationLabel(minutes: number) {
  return `${minutes >= 60 ? `${Math.floor(minutes / 60)} 小時` : ''}${minutes % 60 ? ` ${minutes % 60} 分鐘` : ''}`.trim();
}
export function timetableLayout<T extends ItinerarySpot>(spots: T[], day?: DayClock) {
  const blocks = spots.flatMap((spot, index) => {
    const start = dayAxisMinute(spot, day);
    if (start === null) return [];
    const duration = spotDuration(spot, day);
    return [{ spot, index, start, end: start + (duration ?? 40), displayEnd: start + Math.max(Math.min(duration ?? 40, 2880 - start), 40), lane: 0, lanes: 1, duration }];
  }).sort((a, b) => a.start - b.start || a.index - b.index);
  let group: typeof blocks = [], ends: number[] = [], groupEnd = -1;
  const finish = () => group.forEach(block => { block.lanes = ends.length; });
  for (const block of blocks) {
    if (block.start >= groupEnd) { finish(); group = []; ends = []; groupEnd = -1; }
    let lane = ends.findIndex(end => end <= block.start);
    if (lane < 0) lane = ends.length;
    block.lane = lane; ends[lane] = block.displayEnd; group.push(block);
    groupEnd = Math.max(groupEnd, block.displayEnd);
  }
  finish();
  return { blocks, untimed: spots.map((spot, index) => ({ spot, index })).filter(({ spot }) => dayAxisMinute(spot, day) === null) };
}
export function placeIdentity(spot: ItinerarySpot, index: number) { return spot.id || `${index}:${spot.name}:${spot.time || ''}`; }
