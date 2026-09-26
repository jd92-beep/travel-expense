import assert from 'node:assert/strict';
import { collectLocalDayHeaders, extractLocalDaySpots, localTripDraftFromParagraph } from '../src/lib/ai';
import { DEFAULT_STATE } from '../src/lib/constants';

// --- Day header combinations ---
const zh = collectLocalDayHeaders('Day 1 7月10日 名古屋\nDay 2 7月11日 高山', '2026');
assert.equal(zh.length, 2);
assert.equal(zh[0].date, '2026-07-10');
assert.equal(zh[1].date, '2026-07-11');

const dPrefix = collectLocalDayHeaders('D1: 2026-07-10\nD2: 2026-07-11', '2026');
assert.equal(dPrefix.length, 2);
assert.equal(dPrefix[0].date, '2026-07-10');

const cnDay = collectLocalDayHeaders('第1天\n第2天', '2026');
assert.equal(cnDay.length, 2);
assert.equal(cnDay[0].date, '2026-01-01');
assert.equal(cnDay[1].date, '2026-01-02');

const dateOnly = collectLocalDayHeaders('2026-07-10\n2026-07-11', '2026');
assert.equal(dateOnly.length, 2);
assert.equal(dateOnly[0].date, '2026-07-10');

const enDay = collectLocalDayHeaders('Day 1 – Jul 10, 2026\nDay 2 – Jul 11, 2026', '2026');
assert.equal(enDay.length, 2);
assert.equal(enDay[0].date, '2026-07-10');

// --- Spot combinations ---
const multiSameTime = extractLocalDaySpots('12:00 午餐：On-Off / Rodem Garden / 牛島炸醬麵');
assert.equal(multiSameTime.length, 3);
assert.equal(multiSameTime[0].time, '12:00');
assert.equal(multiSameTime[1].time, '12:00');

const arrow = extractLocalDaySpots('09:00 仁川機場 → 弘大商圈');
assert.equal(arrow.length, 2);
assert.equal(arrow[0].type, 'transport');

const ranged = extractLocalDaySpots('09:00-10:30 景福宮');
assert.equal(ranged.length, 1);
assert.equal(ranged[0].time, '09:00');
assert.equal(ranged[0].timeEnd, '10:30');

const cjkTime = extractLocalDaySpots('9時30分 名古屋城');
assert.equal(cjkTime.length, 1);
assert.equal(cjkTime[0].time, '09:30');

const pm = extractLocalDaySpots('7:30pm 烤肉晚餐');
assert.equal(pm.length, 1);
assert.equal(pm[0].time, '19:30');
assert.equal(pm[0].type, 'food');

const flight = extractLocalDaySpots('08:15 NH859 航班 HKG → NRT');
assert.equal(flight[0].type, 'flight');

const table = extractLocalDaySpots('| 10:00 | 門票 | 環球影城 |\n| 12:30 | 餐飲 | 拉麵 |');
assert.ok(table.length >= 2);
assert.equal(table[0].time, '10:00');

const bullet = extractLocalDaySpots('• 清水寺\n• 二年坂');
assert.equal(bullet.length, 2);
assert.equal(bullet[0].time, '');

const booking = extractLocalDaySpots('15:00 酒店入住 Hotel Fine PNR: ABC123');
assert.ok(booking[0].bookingRef === 'ABC123' || booking[0].name.includes('ABC123'));

const overnight = extractLocalDaySpots('22:00-26:00 夜班機 CX500');
assert.equal(overnight.length, 1);
assert.equal(overnight[0].timeEnd, '26:00');

const dedupe = extractLocalDaySpots('10:00 名古屋城\n10:00 名古屋城');
assert.equal(dedupe.length, 1);

const multiLineSameSlot = extractLocalDaySpots('09:00 道頭洞彩虹海岸道路\n09:00 石頭爺爺麥當勞');
assert.equal(multiLineSameSlot.length, 2);

// Japanese day headers
const jaDay = collectLocalDayHeaders('第1日\n第2日', '2026');
assert.equal(jaDay.length, 2);

// Full local draft: multi-night lodging + sort + trip name
const draft = localTripDraftFromParagraph([
  '行程：濟州三日',
  'Day 1 7月10日 濟州',
  '住宿：Hotel Fine Jeju',
  '14:00 機場',
  '09:00 城山日出峰',
  'Day 2 7月11日 濟州',
  '10:00 Aqua Planet',
  'Day 3 7月12日 濟州',
  '住宿：Stanford Hotel',
  '11:00 機場',
].join('\n'), { ...DEFAULT_STATE, tripCurrency: 'KRW' });

assert.ok(draft);
assert.equal(draft!.trip.itinerary.length, 3);
assert.equal(draft!.trip.name, '濟州三日');
assert.equal(draft!.trip.itinerary[0].spots[0].time, '09:00'); // sorted
assert.equal(draft!.trip.itinerary[0].lodging?.name, 'Hotel Fine Jeju');
assert.equal(draft!.trip.itinerary[1].lodging?.name, 'Hotel Fine Jeju'); // multi-night carry
assert.equal(draft!.trip.itinerary[2].lodging?.name, 'Stanford Hotel');

console.log('local itinerary parser combination tests passed');
