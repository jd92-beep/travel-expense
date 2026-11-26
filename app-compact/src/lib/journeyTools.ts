// @ts-expect-error TS5097: also consumed by Node's strip-types test runner.
import { pocketPacking } from './pocketPacking.ts';
import type { ItineraryDay, ItinerarySpot, PackingSuggestion } from './types';

export const AI_CHECKLIST_GROUP = 'AI 推薦額外用品';
export type ChecklistGroup = '行前準備' | '隨身物品' | '行李' | '行程用品' | typeof AI_CHECKLIST_GROUP | keyof typeof pocketPacking;
export type ChecklistItem = { id: string; label: string; group: ChecklistGroup; note: string; done: boolean };
export const CHECKLIST_GROUPS: ChecklistGroup[] = [...Object.keys(pocketPacking) as (keyof typeof pocketPacking)[], '行程用品', '行前準備', '隨身物品', '行李', AI_CHECKLIST_GROUP];
export const CHECKLIST_LIMIT = 300;

export function defaultChecklist(): ChecklistItem[] {
  return pocketChecklist();
}

export function pocketChecklist(): ChecklistItem[] {
  return (Object.keys(pocketPacking) as (keyof typeof pocketPacking)[]).flatMap((group, g) =>
    pocketPacking[group].map(([label, note], i) => ({ id: `pocket-${g}-${i}`, label, note, group, done: false })));
}

const checklistLabel = (label: string) => label.normalize('NFKC').toLowerCase().replace(/\s+/g, '');

export function aiChecklistItems(packing: PackingSuggestion[]): ChecklistItem[] {
  const known = new Set(defaultChecklist().map(item => checklistLabel(item.label)));
  return packing.flatMap(({ label, note }) => {
    const key = checklistLabel(label);
    if (!key || known.has(key)) return [];
    known.add(key);
    return [{
      id: `gear-${Array.from(label).reduce((hash, ch) => (Math.imul(hash, 31) + ch.codePointAt(0)!) >>> 0, 0).toString(36)}`,
      label, note: (note || '').slice(0, 500), group: AI_CHECKLIST_GROUP, done: false,
    }];
  });
}

// A saved list is the traveller's copy. Remember which templates have been seen
// so switching themes, re-importing a trip or reloading never resurrects a deletion.
export function reconcileChecklist(saved: unknown, packing: PackingSuggestion[] = []) {
  const items = saved ? parseChecklist(saved).map<ChecklistItem>(item => item.id.startsWith('gear-') && item.group === '行程用品'
    ? { ...item, group: AI_CHECKLIST_GROUP } : item) : [];
  const known = new Set(items.map(item => item.id));
  const rawSeen = saved && typeof saved === 'object' && 'seen' in saved ? saved.seen : [];
  const seen = new Set<string>(Array.isArray(rawSeen) ? rawSeen.filter((id): id is string => typeof id === 'string') : []);
  const additions = [...defaultChecklist(), ...aiChecklistItems(packing)];
  let omitted = 0;
  for (const item of additions) {
    const seenLabel = item.group === AI_CHECKLIST_GROUP ? `ai-label:${checklistLabel(item.label)}` : item.id;
    if (seen.has(item.id) || seen.has(seenLabel)) { seen.add(seenLabel); continue; }
    const match = items.findIndex(row => checklistLabel(row.label) === checklistLabel(item.label)
      && (row.group === item.group || item.group === AI_CHECKLIST_GROUP));
    if (!known.has(item.id) && match === -1) {
      if (items.length >= CHECKLIST_LIMIT) { omitted++; continue; }
      items.push(item);
      known.add(item.id);
    }
    seen.add(item.id);
    seen.add(seenLabel);
  }
  return { items, seen: [...seen], omitted };
}

export function checklistStorageKey(scope: string, tripId: string) {
  return `travel-ledger:checklist:v1:${encodeURIComponent(scope)}:${encodeURIComponent(tripId)}`;
}

export function parseChecklist(input: unknown): ChecklistItem[] {
  if (!input || typeof input !== 'object' || !('version' in input) || input.version !== 1 || !('items' in input) || !Array.isArray(input.items)) throw new Error('清單格式不正確，請選擇由本 app 匯出的 JSON。');
  if (input.items.length > CHECKLIST_LIMIT) throw new Error(`清單最多 ${CHECKLIST_LIMIT} 項。`);
  const ids = new Set<string>();
  return input.items.map((item: unknown, index: number) => {
    if (!item || typeof item !== 'object') throw new Error('清單內有無效項目。');
    const row = item as Record<string, unknown>;
    if (typeof row.label !== 'string' || !row.label.trim() || row.label.length > 160
      || typeof row.done !== 'boolean' || !CHECKLIST_GROUPS.includes(row.group as ChecklistGroup)
      || (row.note !== undefined && (typeof row.note !== 'string' || row.note.length > 500))) throw new Error('清單項目的名稱、分類或備註不正確。');
    const candidate = typeof row.id === 'string' && /^[\w-]{1,80}$/.test(row.id) ? row.id : `import-${index}`;
    let id = candidate;
    let suffix = 0;
    while (ids.has(id)) id = `import-${index}-${++suffix}`;
    ids.add(id);
    return { id, label: row.label.trim(), group: row.group as ChecklistGroup, note: (row.note as string || '').trim(), done: row.done };
  });
}

export function mergeChecklist(current: ChecklistItem[], imported: ChecklistItem[]): ChecklistItem[] {
  const labels = new Set(current.map(item => `${item.group}:${item.label.trim().toLocaleLowerCase()}`));
  const next = [...current];
  for (const item of imported) {
    const key = `${item.group}:${item.label.trim().toLocaleLowerCase()}`;
    if (labels.has(key)) continue;
    labels.add(key);
    next.push({ ...item, id: crypto.randomUUID() });
  }
  if (next.length > CHECKLIST_LIMIT) throw new Error(`合併後超過 ${CHECKLIST_LIMIT} 項，請先整理清單。`);
  return next;
}

export function downloadJourneyFile(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.replace(/[\\/:*?"<>|\u0000-\u001F]/g, '-').slice(0, 120);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const escapeCalendar = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
function foldCalendar(line: string) {
  const parts: string[] = [];
  let part = '';
  let bytes = 0;
  const encoder = new TextEncoder();
  for (const char of line) {
    const length = encoder.encode(char).length;
    if (bytes + length > 75) { parts.push(part); part = ' '; bytes = 1; }
    part += char;
    bytes += length;
  }
  return [...parts, part].join('\r\n');
}

export function calendarTime(date: string, time?: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  if (!time) return date.replace(/-/g, '');
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match || Number(match[1]) > 47 || Number(match[2]) > 59) return null;
  parsed.setUTCHours(Number(match[1]), Number(match[2]));
  return parsed.toISOString().replace(/[-:]/g, '').slice(0, 15);
}

// Finite itinerary events use UTC when a zone is known. This avoids depending on
// an importing calendar's TZID database or emitting incomplete VTIMEZONE blocks.
const calendarFormatters = new Map<string, Intl.DateTimeFormat>();

// Imported itineraries often label clocks with abbreviations ("HKT", "JST"), which Intl rejects.
const ZONE_ALIASES: Record<string, string> = {
  HKT: 'Asia/Hong_Kong', JST: 'Asia/Tokyo', KST: 'Asia/Seoul', SGT: 'Asia/Singapore', ICT: 'Asia/Bangkok',
  NZST: 'Pacific/Auckland', NZDT: 'Pacific/Auckland', NZT: 'Pacific/Auckland', AEST: 'Australia/Sydney', AEDT: 'Australia/Sydney',
  UTC: 'UTC', GMT: 'UTC',
};
export const normalizeZone = (zone?: string) => (zone && ZONE_ALIASES[zone.trim().toUpperCase()]) || zone || '';

export function calendarInstant(local: string, rawZone: string): string {
  const timezone = normalizeZone(rawZone);
  if (!timezone) return local;
  let formatter = calendarFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    calendarFormatters.set(timezone, formatter);
  }
  const wallTime = (instant: number) => {
    const parts = formatter!.formatToParts(instant);
    const get = (type: string) => Number(parts.find(part => part.type === type)?.value);
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  };
  const desired = Date.UTC(Number(local.slice(0, 4)), Number(local.slice(4, 6)) - 1, Number(local.slice(6, 8)), Number(local.slice(9, 11)), Number(local.slice(11, 13)), Number(local.slice(13, 15)));
  // Both offsets around a daylight-saving boundary are considered. If the local
  // clock repeats, RFC 5545 selects its first occurrence; nonexistent times fail.
  const offsets = new Set([-36, 0, 36].map(hours => {
    const sample = desired + hours * 3_600_000;
    return wallTime(sample) - sample;
  }));
  const matches = [...offsets].map(offset => desired - offset).filter(instant => wallTime(instant) === desired).sort((a, b) => a - b);
  if (!matches.length) throw new Error(`時間 ${local.slice(9, 11)}:${local.slice(11, 13)} 在 ${timezone} 不存在，請檢查夏令時間轉換日的行程。`);
  return new Date(matches[0]).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
}

export function spotEndInstant(day: Pick<ItineraryDay, 'date' | 'timezone'>, spot: ItinerarySpot) {
  if (!spot.time || !spot.timeEnd) return null;
  const zone = spot.timezone || day.timezone || '';
  const endZone = spot.endTimezone || zone;
  let end = calendarTime(spot.endDate || day.date, spot.timeEnd);
  if (!end) return null;
  // Local clock readings in two zones cannot establish the arrival date.
  if (!spot.endDate && zone !== endZone) return null;
  const start = calendarTime(day.date, spot.time);
  if (!spot.endDate && start && end < start) {
    const midnight = new Date(day.date + 'T00:00:00Z');
    midnight.setUTCDate(midnight.getUTCDate() + 1);
    end = calendarTime(midnight.toISOString().slice(0, 10), spot.timeEnd)!;
  }
  return calendarInstant(end, endZone);
}

export function itineraryCalendar(name: string, days: ItineraryDay[], now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Travel Ledger//Journey//ZH-HANT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeCalendar(name)}`];
  // Local deterministic identifiers exclude cloud IDs, booking references and account identity.
  const hash = [...name].reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) | 0, 0) >>> 0;
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  for (const day of days) for (const [index, spot] of day.spots.entries()) {
    const start = calendarTime(day.date, spot.time);
    if (!start || !spot.name.trim()) continue;
    const timezone = spot.timezone || day.timezone || '';
    const timed = Boolean(spot.time);
    const suffix = timed ? '' : ';VALUE=DATE';
    const zonedStart = timed ? calendarInstant(start, timezone) : start;
    lines.push('BEGIN:VEVENT', `UID:journey-${hash}-${day.date}-${index}@travel-ledger.local`, `DTSTAMP:${stamp}`, `DTSTART${suffix}:${zonedStart}`, `SUMMARY:${escapeCalendar(spot.name)}`);
    const end = timed ? spotEndInstant(day, spot) : null;
    if (end && end > zonedStart) lines.push(`DTEND${suffix}:${end}`);
    if (spot.address) lines.push(`LOCATION:${escapeCalendar(spot.address)}`);
    if (spot.note) lines.push(`DESCRIPTION:${escapeCalendar(spot.note)}`);
    lines.push('END:VEVENT');
  }
  if (!lines.includes('BEGIN:VEVENT')) throw new Error('未有可匯出的有效行程。請先加入日期及地點。');
  lines.push('END:VCALENDAR');
  return lines.map(foldCalendar).join('\r\n') + '\r\n';
}

export function routeDirections(spots: ItinerarySpot[]): string | null {
  const places = spots.filter(spot => spot.name.trim()).map(spot => spot.address?.trim() || spot.name.trim());
  if (!places.length) return null;
  if (places.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(places[0])}`;
  const params = new URLSearchParams({ api: '1', origin: places[0], destination: places[places.length - 1] });
  // Three waypoints is the mobile-web Maps limit; longer days keep per-stop map links.
  if (places.length > 5) return null;
  if (places.length > 2) params.set('waypoints', places.slice(1, -1).join('|'));
  const url = `https://www.google.com/maps/dir/?${params}`;
  return url.length <= 2048 ? url : null;
}
