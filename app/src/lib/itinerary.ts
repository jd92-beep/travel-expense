import type { ItineraryDay } from './types';

export const ITINERARY: ItineraryDay[] = [
  {
    day: 1,
    date: '2026-04-20',
    region: '名古屋',
    title: '抵達名古屋',
    highlight: '蓬萊軒鰻魚飯',
    spots: [
      { time: '10:50', name: '✈️ UO690 HKG → NGO', type: 'transport', note: '香港快運' },
      { time: '15:50', name: '抵達名古屋中部機場', type: 'transport' },
      { time: '19:00', name: '蓬萊軒 本店 · 鰻魚飯', type: 'food' },
      { time: '22:00', name: 'Check-in 名古屋酒店', type: 'lodging' },
    ],
  },
  {
    day: 2,
    date: '2026-04-21',
    region: '飛驒高山 / 白川鄉',
    title: 'KKday 三日團 Day 1',
    highlight: '合掌村 ⛩',
    spots: [
      { time: '07:30', name: '集合出發', type: 'transport' },
      { time: '11:00', name: '飛驒高山古街', type: 'sightseeing' },
      { time: '14:30', name: '白川鄉合掌村', type: 'sightseeing' },
      { time: '19:00', name: '高山市內晚餐', type: 'food' },
    ],
  },
  {
    day: 3,
    date: '2026-04-22',
    region: '立山黑部 → 金澤',
    title: '雪之大谷 ❄️',
    highlight: '立山黑部阿爾卑斯路線',
    spots: [
      { time: '08:00', name: '立山站出發', type: 'transport' },
      { time: '11:00', name: '雪之大谷 · 大觀峰', type: 'sightseeing' },
      { time: '18:00', name: '抵達金澤', type: 'transport' },
    ],
  },
  {
    day: 4,
    date: '2026-04-23',
    region: '上高地 / 金澤',
    title: '兼六園 + 鳥開總本家',
    highlight: '兼六園',
    spots: [
      { time: '09:00', name: '上高地散策', type: 'sightseeing' },
      { time: '14:00', name: '兼六園', type: 'sightseeing' },
      { time: '19:00', name: '鳥開總本家 · 名古屋雞翼', type: 'food' },
    ],
  },
  {
    day: 5,
    date: '2026-04-24',
    region: '名古屋',
    title: '生日慶祝 🎂',
    highlight: 'Tony 生日',
    spots: [
      { time: '10:00', name: '名古屋城', type: 'sightseeing' },
      { time: '14:00', name: 'Osu 商店街', type: 'shopping' },
      { time: '19:30', name: '生日晚餐 🎂', type: 'food' },
    ],
  },
  {
    day: 6,
    date: '2026-04-25',
    region: '常滑 → 機場',
    title: '回程',
    highlight: '常滑陶瓷散步道',
    spots: [
      { time: '09:00', name: '常滑陶瓷散步道', type: 'sightseeing' },
      { time: '14:00', name: '到達中部機場', type: 'transport' },
      { time: '16:45', name: '✈️ UO691 NGO → HKG', type: 'transport' },
      { time: '20:00', name: '抵達香港', type: 'transport' },
    ],
  },
];

const HK_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Hong_Kong',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const HK_TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Hong_Kong',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export function todayHK(): string {
  // en-CA natively formats as YYYY-MM-DD
  return HK_DATE_FMT.format(new Date());
}

export function nowHKTime(): string {
  // HH:MM only — drop seconds
  const parts = HK_TIME_FMT.formatToParts(new Date());
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${h}:${m}`;
}

export function currentDay(): ItineraryDay | null {
  const t = todayHK();
  return ITINERARY.find((d) => d.date === t) ?? null;
}

export function dayNumberFor(date: string): number {
  const idx = ITINERARY.findIndex((d) => d.date === date);
  return idx >= 0 ? idx + 1 : 0;
}

export function daysBetween(from: string, to: string): number {
  const f = new Date(from + 'T00:00:00+08:00').getTime();
  const t = new Date(to + 'T00:00:00+08:00').getTime();
  return Math.round((t - f) / 86_400_000);
}

export type TripStatus =
  | { phase: 'before'; daysUntil: number }
  | { phase: 'during'; dayNum: number }
  | { phase: 'after'; daysSince: number };

export function tripStatus(): TripStatus {
  const t = todayHK();
  const first = ITINERARY[0].date;
  const last = ITINERARY[ITINERARY.length - 1].date;
  if (t < first) return { phase: 'before', daysUntil: daysBetween(t, first) };
  if (t > last) return { phase: 'after', daysSince: daysBetween(last, t) };
  return { phase: 'during', dayNum: dayNumberFor(t) };
}

export function timeGreeting(): { text: string; emoji: string; tone: string } {
  const h = new Date().getHours();
  if (h < 5)  return { text: '夜半靜', emoji: '🌙', tone: '休息下' };
  if (h < 11) return { text: '早晨 Boss', emoji: '🌅', tone: '新一日' };
  if (h < 14) return { text: '午飯時間', emoji: '🍜', tone: '食乜好?' };
  if (h < 17) return { text: '下午好', emoji: '🍵', tone: '慢嘆茶' };
  if (h < 19) return { text: '黃昏已至', emoji: '🌇', tone: '漫步散心' };
  if (h < 23) return { text: '晚上好', emoji: '✨', tone: '夜幕降臨' };
  return { text: '夜深喇', emoji: '🌌', tone: '早啲訓' };
}

/** Returns fraction [0..1] of how far through the current day we are, in HKT. */
export function dayProgressHKT(): number {
  const parts = HK_TIME_FMT.formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const s = Number(parts.find((p) => p.type === 'second')?.value ?? 0);
  return (h * 3600 + m * 60 + s) / 86_400;
}

/** Return the itinerary region for a given YYYY-MM-DD, or empty string if out of trip. */
export function getRegionForDate(date: string): string {
  return ITINERARY.find((d) => d.date === date)?.region ?? '';
}
