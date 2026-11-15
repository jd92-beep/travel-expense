import assert from 'node:assert/strict';
import { AI_CHECKLIST_GROUP, aiChecklistItems, calendarInstant, calendarTime, checklistStorageKey, defaultChecklist, pocketChecklist, reconcileChecklist, itineraryCalendar, mergeChecklist, parseChecklist, routeDirections } from '../src/lib/journeyTools.ts';
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
assert.equal(current.length, 52, 'merge does not mutate the fixed template');
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
const old = {version: 1, items: [{id:'starter-0', group:'行前準備', label:'我自己的預訂資料', note:'保留個人資料', done:true}]};
const upgrade = reconcileChecklist(old);
assert.equal(upgrade.items.length, 53);
assert.deepEqual(upgrade.items[0], old.items[0]);
const afterDelete = reconcileChecklist({version: 1, seen: upgrade.seen, items: upgrade.items.slice(0, -1)});
assert.equal(afterDelete.items.length, 52, 'deleted template item must stay deleted');
const calendarOvernight = itineraryCalendar('return', [{...days[0], spots:[{name:'Flight', type:'flight', time:'23:30', timeEnd:'00:15'}]}]);
assert.match(calendarOvernight, /DTEND:20261203T151500Z/);

assert.deepEqual(reconcileChecklist(null).items, family, 'all themes start with the fixed video template');
const longNote = reconcileChecklist({version:1,items:[{id:'manual-battery',group:'行李',label:'備用電池',note:'甲'.repeat(500),done:false}]});
assert.doesNotThrow(() => parseChecklist({version: 1, items: longNote.items}));

const suggestions = [
  {label:'觀鳥望遠鏡',note:'1 副 · 隨身；公園觀鳥用。',suggested:true},
  {label:family[0].label,note:'不可重覆固定用品',suggested:true},
  {label:' 觀鳥望遠鏡 ',note:'重覆建議',suggested:true},
];
assert.equal(aiChecklistItems(suggestions).length,1);
const withExtras = reconcileChecklist(null,suggestions);
assert.deepEqual(withExtras.items.slice(0,52),family,'AI extras must not edit the fixed template');
assert.equal(withExtras.items.length,53);
assert.equal(withExtras.items.at(-1)!.group,AI_CHECKLIST_GROUP);
withExtras.items.at(-1)!.done=true;
const refreshed = reconcileChecklist({version:1,items:withExtras.items,seen:withExtras.seen},[...suggestions,{label:'賞鳥圖鑑',note:'1 本 · 行李；辨認鳥類。',suggested:true}]);
assert.equal(refreshed.items.length,54);
assert.equal(refreshed.items.find(item=>item.label==='觀鳥望遠鏡')!.done,true,'new AI suggestions preserve prior completion');
const rejectedExtra = reconcileChecklist({version:1,items:refreshed.items.filter(item=>item.label!=='觀鳥望遠鏡'),seen:refreshed.seen},suggestions);
assert.equal(rejectedExtra.items.some(item=>item.label==='觀鳥望遠鏡'),false,'deleted AI suggestions must not reappear');
const movedLegacy = reconcileChecklist({version:1,items:[{...withExtras.items.at(-1)!,group:'行程用品'}]},suggestions);
assert.equal(movedLegacy.items[0].group,AI_CHECKLIST_GROUP);
assert.equal(movedLegacy.items[0].done,true,'moving old AI items keeps completion');
const cameraExtra = reconcileChecklist(null,[{label:'Go Pro',note:'1 部 · 隨身',suggested:true}]);
const removedCamera = {version:1,items:cameraExtra.items.filter(item=>item.group!==AI_CHECKLIST_GROUP),seen:cameraExtra.seen};
assert.equal(reconcileChecklist(removedCamera,[{label:'ＧＯＰＲＯ',note:'同一件用品',suggested:true}]).items.length,52,
  'deleted AI items stay deleted when the model changes case, width or whitespace');
