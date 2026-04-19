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

export function todayHK(): string {
  const now = new Date();
  const hkMillis = now.getTime() + (now.getTimezoneOffset() + 480) * 60000;
  const hk = new Date(hkMillis);
  const yyyy = hk.getFullYear();
  const mm = String(hk.getMonth() + 1).padStart(2, '0');
  const dd = String(hk.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function currentDay(): ItineraryDay | null {
  const t = todayHK();
  return ITINERARY.find((d) => d.date === t) ?? null;
}

export function dayNumberFor(date: string): number {
  const idx = ITINERARY.findIndex((d) => d.date === date);
  return idx >= 0 ? idx + 1 : 0;
}
