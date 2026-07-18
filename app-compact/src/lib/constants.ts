import type { AppState, ItineraryDay } from './types';

// App build version — single source of truth, shown in the Settings build label.
// RULE: bump this on every code change (patch for fixes, minor for features) and
// keep package.json "version" in sync. See HANDOVER.md "Build Versioning Rule".
export const APP_VERSION = '0.19.9';
export const MAX_SYNC_RETRY_ATTEMPTS = 3;

export const STORAGE_KEY = 'boss-japan-tracker';
export const DEFAULT_NOTION_DB = '3438d94d5f7c81878221fcda6d65d39d';
export const DEFAULT_CREDENTIAL_BROKER_URL = 'https://travel-expense-credential-broker.ftjdfr.workers.dev';
export const ALLOWED_CREDENTIAL_BROKER_URLS = [DEFAULT_CREDENTIAL_BROKER_URL] as const;
export const NATIVE_REACHABILITY_ONLINE_EVENT = 'travel-expense:native-reachability-online';
export const APP_SCHEMA_VERSION = 3;
export const DEFAULT_GOOGLE_BACKUP_MODEL = 'gemma-4-31b-it';
export const DEFAULT_SCAN_VOICE_MODEL_ID = 'mimo/mimo-v2.5';
export const DEFAULT_KIMI_PRIMARY_MODEL_ID = 'kimi/kimi-code';
export const DEFAULT_TRIP_UPDATE_MODEL_ID = 'mimo/mimo-v2.5-pro';

const STALE_GOOGLE_BACKUP_MODELS = new Set(['gemma-3-27b-it', 'gemma-4-31b', 'gemma-4-26b-a4b-it']);
const LEGACY_SCAN_VOICE_DEFAULTS = new Set(['kimi/kimi-code', 'kimi-code', 'kimi/kimi-k2.6', 'kimi-k2.6', 'google/gemma-4-31b-it']);
const LEGACY_EMAIL_TRIP_DEFAULTS = new Set(['', 'kimi-code', 'kimi/kimi-for-coding', 'kimi-for-coding', 'kimi/kimi-code']);

export const AI_MODELS = [
  { id: 'kimi/kimi-code', name: 'Kimi (kimi-code)' },
  { id: 'kimi/kimi-8k', name: 'Kimi (kimi-8k)' },
  { id: 'kimi/kimi-32k', name: 'Kimi (kimi-32k)' },
  { id: 'kimi/kimi-k2.6', name: 'Kimi (kimi-k2.6)' },
  { id: 'kimi/kimi-for-coding', name: 'Kimi (kimi-for-coding)' },
  { id: 'google/gemini-2.5-flash', name: 'Google Gemini 2.5 Flash' },
  { id: 'google/gemini-3.1-flash', name: 'Google Gemini 3.1 Flash' },
  { id: 'google/gemini-3.1-flash-lite', name: 'Google Gemini 3.1 Flash Lite' },
  { id: 'google/gemma-4-31b-it', name: 'Google Gemma 4 31B' },
  { id: 'google/gemma-4-26b', name: 'Google Gemma 4 26B' },
  { id: 'mimo/mimo-v2.5', name: 'Mimo v2.5' },
  { id: 'mimo/mimo-v2.5-pro', name: 'Mimo v2.5 Pro' },
  { id: 'volcano/doubao-seed-2.0-lite', name: 'Volcano (doubao-seed-2.0-lite)' },
  { id: 'volcano/doubao-seed-2.0-pro', name: 'Volcano (doubao-seed-2.0-pro)' },
  { id: 'volcano/minimax-m3', name: 'Volcano (minimax-m3)' },
  { id: 'volcano/minimax-m2.7', name: 'Volcano (minimax-m2.7)' },
  { id: 'volcano/doubao-seed-2.0-mini', name: 'Volcano (doubao-seed-2.0-mini)' },
] as const;

export function normalizeAiModelSettings<T extends Partial<Pick<AppState, 'scanModel' | 'voiceModel' | 'emailModel' | 'tripUpdateModel' | 'googleBackupModel'>>>(settings: T): T {
  const next = { ...settings };
  if (!next.googleBackupModel || STALE_GOOGLE_BACKUP_MODELS.has(String(next.googleBackupModel))) {
    next.googleBackupModel = DEFAULT_GOOGLE_BACKUP_MODEL;
  }
  if (!next.scanModel || LEGACY_SCAN_VOICE_DEFAULTS.has(String(next.scanModel))) {
    next.scanModel = DEFAULT_SCAN_VOICE_MODEL_ID;
  }
  if (!next.voiceModel || LEGACY_SCAN_VOICE_DEFAULTS.has(String(next.voiceModel))) {
    next.voiceModel = DEFAULT_SCAN_VOICE_MODEL_ID;
  }
  if (!next.emailModel || LEGACY_EMAIL_TRIP_DEFAULTS.has(String(next.emailModel))) {
    next.emailModel = DEFAULT_TRIP_UPDATE_MODEL_ID;
  }
  if (!next.tripUpdateModel || LEGACY_EMAIL_TRIP_DEFAULTS.has(String(next.tripUpdateModel))) {
    next.tripUpdateModel = DEFAULT_TRIP_UPDATE_MODEL_ID;
  }
  return next;
}

export const CATEGORIES = [
  { id: 'flight', name: '機票', icon: '✈️', color: '#2563eb' },
  { id: 'transport', name: '交通', icon: '🚆', color: '#60a5fa' },
  { id: 'food', name: '餐飲', icon: '🍱', color: '#f97316' },
  { id: 'shopping', name: '購物', icon: '🛍️', color: '#a78bfa' },
  { id: 'lodging', name: '住宿', icon: '🏨', color: '#34d399' },
  { id: 'ticket', name: '門票', icon: '🎫', color: '#fbbf24' },
  { id: 'localtour', name: '當地旅遊', icon: '🗺️', color: '#06b6d4' },
  { id: 'medicine', name: '藥品', icon: '💊', color: '#f472b6' },
  { id: 'other', name: '其他', icon: '📦', color: '#6B7285' },
] as const;

export const PAYMENTS = [
  { id: 'cash', name: '現金', color: '#34d399' },
  { id: 'credit', name: '信用卡', color: '#60a5fa' },
  { id: 'paypay', name: 'PayPay', color: '#f97316' },
  { id: 'suica', name: 'Suica', color: '#a78bfa' },
] as const;

export const PRE_PAID_CATEGORIES = new Set(['lodging', 'ticket', 'localtour', 'transport']);

export const ITINERARY: ItineraryDay[] = [
  { date: '2026-04-20', day: 1, region: '名古屋市區', highlight: 'HKG→NGO + 蓬萊軒鰻魚飯', spots: [
    { time: '10:50', name: 'UO690 離港 HKG→NGO', type: 'transport', timezone: 'HKT' },
    { time: '15:50', name: 'UO690 抵達名古屋 NGO', type: 'transport', timezone: 'JST' },
    { time: '17:00', name: 'JR 名古屋站', type: 'transport', note: '買 Suica' },
    { time: '19:30', name: '矢場とん', type: 'food', note: '味噌豬排' },
    { time: '23:00', name: 'Daiwa Roynet 名古屋太間通口', type: 'lodging' },
  ] },
  { date: '2026-04-21', day: 2, region: '飛驒高山/白川鄉 → 長野', highlight: 'KKday 三日團 Day 1', spots: [
    { time: '07:30', name: '名古屋站 集合', type: 'transport' },
    { time: '10:00', name: '高山陣屋', type: 'ticket' },
    { time: '14:30', name: '白川鄉 合掌村', type: 'ticket' },
    { time: '20:00', name: '長野松代美居溫泉度假酒店', type: 'lodging' },
  ] },
  { date: '2026-04-22', day: 3, region: '立山黑部 → 金澤', highlight: '雪之大谷', spots: [
    { time: '10:30', name: '室堂', type: 'transport' },
    { time: '11:30', name: '雪之大谷', type: 'ticket' },
    { time: '15:00', name: '黑部水庫', type: 'ticket' },
    { time: '20:00', name: 'MYSTAYS 金澤精品酒店', type: 'lodging' },
  ] },
  { date: '2026-04-23', day: 4, region: '上高地 / 金澤', highlight: '兼六園 + 鳥開總本家', spots: [
    { time: '08:00', name: '上高地', type: 'ticket', note: '河童橋 + 明神池' },
    { time: '15:30', name: '兼六園', type: 'ticket' },
    { time: '17:00', name: '近江町市場', type: 'shopping' },
    { time: '19:00', name: '鳥開總本家', type: 'food' },
  ] },
  { date: '2026-04-24', day: 5, region: '名古屋', highlight: '生日慶祝', spots: [
    { time: '11:00', name: '名古屋城', type: 'ticket' },
    { time: '15:00', name: 'OASIS 21', type: 'shopping' },
    { time: '19:00', name: '生日晚餐', type: 'food' },
  ] },
  { date: '2026-04-25', day: 6, region: '常滑 → 機場', highlight: 'NGO→HKG 回程', spots: [
    { time: '09:00', name: '常滑', type: 'shopping' },
    { time: '15:00', name: '中部機場 Check-in', type: 'transport' },
    { time: '16:45', name: 'UO691 離港 NGO→HKG', type: 'transport', timezone: 'JST' },
    { time: '20:00', name: 'UO691 抵達香港 HKG', type: 'transport', timezone: 'HKT' },
  ] },
];

export const DEFAULT_STATE: AppState = {
  schemaVersion: APP_SCHEMA_VERSION,
  receipts: [],
  budget: 101800,
  rate: 20.36,
  rateTable: {},
  rateMode: 'live',
  tripCurrency: 'JPY',
  autoSync: true,
  proxy: 'https://notion-proxy.ftjdfr.workers.dev/?',
  notionDb: DEFAULT_NOTION_DB,
  personalNotionConnected: false,
  credentialBrokerUrl: DEFAULT_CREDENTIAL_BROKER_URL,
  credentialSession: '',
  credentialSessionExpiresAt: 0,
  scanModel: DEFAULT_SCAN_VOICE_MODEL_ID,
  voiceModel: DEFAULT_SCAN_VOICE_MODEL_ID,
  emailModel: DEFAULT_TRIP_UPDATE_MODEL_ID,
  tripUpdateModel: DEFAULT_TRIP_UPDATE_MODEL_ID,
  googleBackupModel: DEFAULT_GOOGLE_BACKUP_MODEL,
  persons: [
    { id: 'p_boss', name: 'User 1', emoji: '👤', color: '#CC2929' },
  ],
  shareRatios: {},
  tripName: '名古屋 2026',
  tripDateRange: { start: '2026-04-20', end: '2026-04-25' },
  activeTripId: 'trip_2026_04_nagoya',
  trips: [{
    id: 'trip_2026_04_nagoya',
    name: '名古屋 2026',
    destinationSummary: '日本名古屋、飛驒高山、白川鄉、金澤、常滑',
    startDate: '2026-04-20',
    endDate: '2026-04-25',
    homeCurrency: 'HKD',
    currencies: ['JPY', 'HKD'],
    timezones: ['Asia/Tokyo', 'Asia/Hong_Kong'],
    version: 1,
    active: true,
    itinerary: ITINERARY,
    sourceId: 'trip_trip_2026_04_nagoya',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }],
  customItinerary: null,
  itineraryOverrides: {},
  statsIncludeTransportLodging: true,
  top10IncludeBigItems: true,
  lastTab: 'scan',
  notionDeletedIds: [],
  notionDeletedSourceIds: [],
  syncQueue: [],
  lastSyncedAt: 0,
  globalSyncStatus: 'idle',
  syncError: '',
  settingsPulledAt: 0,
  storeTranslations: {},
};

export const BOSS_EMAILS = new Set([
  'vc06456@gmail.com'
]);

export function isBoss(email?: string | null): boolean {
  if (!email) return false;
  return BOSS_EMAILS.has(email.toLowerCase());
}
