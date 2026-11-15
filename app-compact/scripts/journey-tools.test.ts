import assert from 'node:assert/strict';
import { calendarInstant, calendarTime, checklistStorageKey, defaultChecklist, pocketChecklist, reconcileChecklist, itineraryCalendar, mergeChecklist, parseChecklist, routeDirections } from '../src/lib/journeyTools.ts';
import type { ItineraryDay } from '../src/lib/types.ts';

assert.notEqual(checklistStorageKey('account-a', 'trip-one'), checklistStorageKey('account-b', 'trip-one'));
assert.notEqual(checklistStorageKey('account-a', 'trip-one'), checklistStorageKey('account-a', 'trip-two'));
assert.notEqual(checklistStorageKey('a:b', 'c'), checklistStorageKey('a', 'b:c'));
const current = defaultChecklist(); current[0].done = true;
const incoming = parseChecklist({ version: 1, items: [
  { ...current[0], done: false },
  { id: 'collision', group: '行李', label: '測試物品', note: 'fixture', done: true, accountId: 'must-not-import' },
  { id: 'collision', group: '行李', label: '第二件', note: '', done: false },
  { id: 'import-2-1', group: '行李', label: '第三件', note: '', done: false },
] });
assert.equal(new Set(incoming.map(item => item.id)).size, incoming.length);
assert.equal('accountId' in incoming[1], false);
const merged = mergeChecklist(current, incoming);
assert.equal(merged[0].done, true, 'import must not reset existing completion');
assert.equal(merged.length, current.length + 3);
assert.equal(current.length, 9, 'merge does not mutate source');
assert.throws(() => parseChecklist({ version: 2, items: [] }));
assert.throws(() => parseChecklist({ version: 1, items: [{ ...current[0], label: '' }] }));
assert.throws(() => parseChecklist({ version: 1, items: Array.from({ length: 301 }, () => current[0]) }));
assert.equal(calendarTime('2026-02-30', '12:00'), null);
assert.equal(calendarTime('2026-12-03', '25:30'), '20261204T013000');
assert.equal(calendarTime('2026-12-03', '12:99'), null);
assert.equal(calendarInstant('20261203T104000', 'Asia/Tokyo'), '20261203T014000Z');
assert.equal(calendarInstant('20260701T100000', 'America/New_York'), '20260701T140000Z');
assert.equal(calendarInstant('20261101T013000', 'America/New_York'), '20261101T053000Z', 'repeated clock chooses first occurrence');
assert.throws(() => calendarInstant('20260308T023000', 'America/New_York'), /不存在/);
assert.equal(calendarInstant('20261203T104000', ''), '20261203T104000');
const days: ItineraryDay[] = [{ date: '2026-12-03', day: 1, region: 'Fixture', timezone: 'Asia/Tokyo', spots: [
  { name: 'A,B;C\\D\nE', time: '10:40', timeEnd: '12:00', type: 'sightseeing', address: '名古屋'.repeat(35), note: 'one\ntwo' },
  { name: '全日行程', time: '', type: 'sightseeing' },
]}];
const calendar = itineraryCalendar('測試旅行', days, new Date('2026-01-01T00:00:00Z'));
assert.match(calendar, /DTSTART:20261203T014000Z/);
assert.match(calendar, /DTEND:20261203T030000Z/);
assert.match(calendar, /DTSTART;VALUE=DATE:20261203/);
assert.ok(calendar.includes('SUMMARY:A\\,B\\;C\\\\D\\nE'));
assert.ok(calendar.split('\r\n').every(line => new TextEncoder().encode(line).length <= 75), 'UTF-8 lines fold without breaking characters');
assert.equal(calendar.includes('\uFFFD'), false);
assert.throws(() => itineraryCalendar('Empty', []), /未有可匯出/);
const spots = [1,2,3,4,5].map(i => ({ name: `地方 ${i}`, type: 'sightseeing' as const }));
const url = new URL(routeDirections(spots)!);
assert.equal(url.searchParams.get('origin'), '地方 1');
assert.equal(url.searchParams.get('destination'), '地方 5');
assert.equal(url.searchParams.get('waypoints'), '地方 2|地方 3|地方 4');
assert.equal(routeDirections([...spots, { name: 'Six', type: 'sightseeing' }]), null);
assert.equal(routeDirections([]), null);
assert.equal(routeDirections([{ name: 'A'.repeat(1800), type: 'sightseeing' }, { name: 'B'.repeat(1800), type: 'sightseeing' }]), null);
console.log('Journey tools passed: account/trip keys, safe merge and validation, UTC/DST calendar export, UTF-8 escaping/folding, and bounded map routes.');

const family = pocketChecklist();
assert.deepEqual(Object.values(Object.groupBy(family, item => item.group)).map(group => group!.length), [7,8,8,13,8,8]);
assert.equal(new Set(family.map(i => i.id)).size, 52);
const old = {version: 1, items: [{...defaultChecklist()[0], label: '我自己的預訂資料', done: true}]};
const upgrade = reconcileChecklist(old, true, [{label:'登山杖', note:'高山步道', suggested:true}]);
assert.equal(upgrade.items.length, 54);
assert.deepEqual(upgrade.items[0], old.items[0]);
const afterDelete = reconcileChecklist({version: 1, seen: upgrade.seen, items: upgrade.items.slice(0, -1)}, true, [{label:'登山杖'}]);
assert.equal(afterDelete.items.length, 53, 'deleted seed must stay deleted');
const calendarOvernight = itineraryCalendar('return', [{...days[0], spots:[{name:'Flight', type:'flight', time:'23:30', timeEnd:'00:15'}]}]);
assert.match(calendarOvernight, /DTEND:20261203T151500Z/);

const longNote = reconcileChecklist(null, false, [{label: '備用電池', note: '甲'.repeat(500)}]);
assert.doesNotThrow(() => parseChecklist({version: 1, items: longNote.items}));
