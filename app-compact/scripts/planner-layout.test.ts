import assert from 'node:assert/strict';
import { minuteOfDay, spotDuration, timetableLayout, clockLabel, endLabel, dayAxisMinute, freeMinutes } from '../src/lib/plannerLayout.ts';
const spot = (time: string, timeEnd?: string) => ({ name: 'Fixture', type: 'food', time, timeEnd });
assert.equal(minuteOfDay('24:00'), null);
assert.equal(minuteOfDay('08:59'), 539);
assert.equal(spotDuration(spot('23:30', '00:15')), 45);
assert.equal(spotDuration(spot('08:30')), null);
const layout = timetableLayout([spot('09:00', '10:00'), spot('09:30', '10:30'), spot('10:30', '11:00'), spot(''), spot('not-a-time')]);
assert.deepEqual(layout.blocks.map(x => [x.lane, x.lanes]), [[0,2],[1,2],[0,1]]);
assert.equal(layout.untimed.length, 2);
const short = timetableLayout([spot('09:00', '09:05'), spot('09:10', '09:15')]);
assert.equal(short.blocks[0].lanes, 2, 'short cards cannot visually overlap');
assert.equal(timetableLayout([spot('23:30', '00:15')]).blocks[0].end, 1455);
console.log('Planner layout: times, overnight, unknown durations, overlaps, short events and untimed passed.');

const flightDay = { date: '2026-11-26', timezone: 'Asia/Taipei' };
const longFlight = { ...spot('18:45','10:25'), endDate: '2026-11-27', endTimezone: 'Pacific/Auckland' };
assert.equal(spotDuration(longFlight, flightDay), 640);
assert.equal(endLabel(longFlight, flightDay.date), '11/27 10:25');
assert.equal(spotDuration(spot('23:15','25:05'), flightDay), 110);
assert.equal(clockLabel('25:05'), '翌日 01:05');
assert.equal(timetableLayout([spot('25:05')], flightDay).blocks[0].start, 1505);
assert.equal(spotDuration({...longFlight, endDate: undefined}, flightDay), null, 'unknown arrival date across zones');

const tokyo = { date: '2026-12-03', timezone: 'Asia/Tokyo' };
const incoming = { ...spot('08:45', '13:45'), timezone: 'Asia/Hong_Kong', endTimezone: 'Asia/Tokyo', endDate: tokyo.date };
assert.equal(dayAxisMinute(incoming, tokyo), 585, '08:45 in Hong Kong is 09:45 on the Tokyo grid');
assert.equal(spotDuration(incoming, tokyo), 240);
assert.equal(freeMinutes(tokyo, incoming, spot('14:15')), 30);
assert.equal(spotDuration({...incoming, endDate: undefined}, tokyo), null);
assert.equal(freeMinutes(flightDay, longFlight, spot('10:40')), null, 'the next local clock may precede arrival');

assert.equal(clockLabel('9:05'), '09:05');
assert.equal(spotDuration(spot('9:05', '10:05'), tokyo), 60);
assert.equal(endLabel({...spot('23:30','1:15'), endTimezone: tokyo.timezone}, tokyo.date, tokyo.timezone), '翌日 01:15');
