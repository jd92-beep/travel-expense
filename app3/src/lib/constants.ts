import type { ItineraryDay } from './types';

export const CATEGORIES = [
  { id: 'transport', label: '交通', icon: '🚆', color: '#2D5A8E' },
  { id: 'food',      label: '餐飲', icon: '🍜', color: '#CC2929' },
  { id: 'shopping',  label: '購物', icon: '🛍️', color: '#9333ea' },
  { id: 'lodging',   label: '住宿', icon: '🏨', color: '#059669' },
  { id: 'ticket',    label: '門票', icon: '🎟️', color: '#d97706' },
  { id: 'medicine',  label: '藥品', icon: '💊', color: '#dc2626' },
  { id: 'other',     label: '其他', icon: '📦', color: '#6b7280' },
] as const;

export const PAYMENTS = [
  { id: 'cash',   label: '現金',  icon: '💴' },
  { id: 'credit', label: '信用卡', icon: '💳' },
  { id: 'paypay', label: 'PayPay', icon: '📱' },
  { id: 'suica',  label: 'Suica',  icon: '🚃' },
] as const;

export const SCAN_MODELS = [
  { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite', color: '#CC2929' },
  { id: 'gemini-3-flash-preview',        label: 'Gemini 3 Flash',        color: '#F5A623' },
  { id: 'gemini-2.5-flash',              label: 'Gemini 2.5 Flash',      color: '#EA6C00' },
  { id: 'gemini-3-pro-preview',          label: 'Gemini 3 Pro',          color: '#2D5A8E' },
];

export const ITINERARY: ItineraryDay[] = [
  {
    day: 1, date: '2026-04-20', region: '名古屋市區', highlight: '蓬萊軒鰻魚飯',
    spots: [
      { time: '08:00', name: '香港國際機場 T1', type: 'transport' },
      { time: '12:45', name: '中部國際機場 セントレア', type: 'transport' },
      { time: '15:00', name: '名古屋城', type: 'sightseeing' },
      { time: '19:00', name: '蓬萊軒 松坂屋店', type: 'food' },
      { time: '22:00', name: 'ダイワロイネットホテル', type: 'lodging' },
    ],
  },
  {
    day: 2, date: '2026-04-21', region: '飛驒高山 / 白川鄉', highlight: 'KKday 三日團 Day 1',
    spots: [
      { time: '07:30', name: '名古屋駅 集合', type: 'transport' },
      { time: '10:30', name: '高山古い町並み', type: 'sightseeing' },
      { time: '12:30', name: '陣屋前朝市', type: 'food' },
      { time: '14:30', name: '白川郷 荻町合掌造り集落', type: 'sightseeing' },
      { time: '20:00', name: '民宿 大田屋', type: 'lodging' },
    ],
  },
  {
    day: 3, date: '2026-04-22', region: '立山黑部', highlight: '雪之大谷',
    spots: [
      { time: '08:00', name: '富山駅 出發', type: 'transport' },
      { time: '09:30', name: '立山駅', type: 'transport' },
      { time: '11:00', name: '雪之大谷 (雪の大谷)', type: 'sightseeing' },
      { time: '14:00', name: '黑部湖', type: 'sightseeing' },
      { time: '19:00', name: '富山市 酒店', type: 'lodging' },
    ],
  },
  {
    day: 4, date: '2026-04-23', region: '上高地 / 金澤', highlight: '兼六園 + 鳥開總本家',
    spots: [
      { time: '07:00', name: '上高地 河童橋', type: 'sightseeing' },
      { time: '11:30', name: '金澤駅', type: 'transport' },
      { time: '13:00', name: '兼六園', type: 'sightseeing' },
      { time: '16:00', name: '近江町市場', type: 'shopping' },
      { time: '19:00', name: '鳥開總本家', type: 'food' },
      { time: '22:00', name: 'APA Hotel 金澤', type: 'lodging' },
    ],
  },
  {
    day: 5, date: '2026-04-24', region: '名古屋', highlight: '生日慶祝 🎂',
    spots: [
      { time: '10:00', name: '熱田神宮', type: 'sightseeing' },
      { time: '12:30', name: '矢場とん 矢場町本店', type: 'food' },
      { time: '15:00', name: '大須商店街', type: 'shopping' },
      { time: '19:30', name: '生日慶祝晚餐 🎂', type: 'food' },
      { time: '23:00', name: 'ダイワロイネットホテル', type: 'lodging' },
    ],
  },
  {
    day: 6, date: '2026-04-25', region: '常滑 → 機場', highlight: '回程',
    spots: [
      { time: '09:00', name: '常滑やきもの散歩道', type: 'sightseeing' },
      { time: '12:00', name: 'INAX ライブミュージアム', type: 'ticket' },
      { time: '15:00', name: '中部國際機場', type: 'transport' },
      { time: '18:30', name: 'CX509 → 香港', type: 'transport' },
    ],
  },
];

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
export const PAYMENT_MAP = Object.fromEntries(PAYMENTS.map(p => [p.id, p]));
