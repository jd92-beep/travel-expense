import type { Category, Payment } from './types';

export const STORAGE_KEY = 'boss-japan-tracker';

export const CATEGORIES: Record<Category, { name: string; icon: string; color: string }> = {
  transport:{name:'交通',   icon:'🚆',color:'#60a5fa'},
  food:     {name:'餐飲',   icon:'🍜',color:'#f59e0b'},
  shopping: {name:'購物',   icon:'🛍️',color:'#f472b6'},
  lodging:  {name:'住宿',   icon:'🏨',color:'#a78bfa'},
  ticket:   {name:'門票',   icon:'🎟️',color:'#34d399'},
  localtour:{name:'當地旅遊',icon:'🗺️',color:'#22d3ee'},
  medicine: {name:'藥品',   icon:'💊',color:'#fb7185'},
  other:    {name:'其他',   icon:'📦',color:'#94a3b8'},
};

export const PAYMENTS: Record<Payment, { name: string; icon: string; color: string }> = {
  cash:  {name:'現金',   icon:'💴',color:'#34d399'},
  credit:{name:'信用卡',  icon:'💳',color:'#60a5fa'},
  paypay:{name:'PayPay', icon:'🅿️',color:'#f87171'},
  suica: {name:'Suica',  icon:'🎫',color:'#a78bfa'},
};

export const DEFAULT_BUDGET = 101800;
export const DEFAULT_RATE = 20.36;

export const DEFAULT_SCAN_MODEL = 'gemini-3.1-flash-lite-preview';
export const GEMINI_VISION_MODELS = [
  { id: 'gemini-3.1-flash-lite-preview', label: 'G 3.1 Flash Lite' },
  { id: 'gemini-3-flash-preview',        label: 'G 3 Flash' },
  { id: 'gemini-2.5-flash',              label: 'G 2.5 Flash' },
  { id: 'gemini-3-pro-preview',          label: 'G 3 Pro' },
];
export const SCAN_MODELS = [
  { id:'gemini-3.1-flash-lite-preview', label:'Gemini 3.1 Flash Lite', desc:'快速 · 高準確度', color:'#CC2929', provider:'gemini' as const },
  { id:'gemini-3-flash-preview',        label:'Gemini 3 Flash',        desc:'穩定 · 平衡',     color:'#F5A623', provider:'gemini' as const },
  { id:'gemini-2.5-flash',              label:'Gemini 2.5 Flash',      desc:'成熟',           color:'#EA6C00', provider:'gemini' as const },
  { id:'gemini-3-pro-preview',          label:'Gemini 3 Pro',          desc:'最準 · 較慢',     color:'#2D5A8E', provider:'gemini' as const },
];

export const DEFAULT_PROXY = 'https://notion-proxy.ftjdfr.workers.dev/?';
export const NOTION_VERSION = '2022-06-28';
export const NOTION_PROPS: Record<string, [string, string]> = {
  store:   ['🏪 店名','店名'],     amount:  ['💴 金額 ¥','金額'],
  date:    ['📅 日期','日期'],     cat:     ['🗂 類別','類別'],
  pay:     ['💳 支付','支付'],     region:  ['📍 地區','地區'],
  items:   ['🧾 品項','品項'],     note:    ['📝 備註','備註'],
  sourceId:['🔑 SourceID','SourceID'], hkd:['💵 HKD','HKD'],
  tax:     ['💸 稅金 ¥','稅金'],   subtotal:['🧮 小計 ¥','小計'],
  photo:   ['📷 收據相片','收據相片'],
};

export const DEFAULT_LAT = 35.18;
export const DEFAULT_LON = 136.91;
export const LOCATIONS: Record<string,{name:string;lat:number;lon:number}> = {
  '名古屋':           {name:'名古屋',   lat:35.18,lon:136.91},
  '飛驒高山 / 白川鄉':  {name:'飛驒高山',  lat:36.14,lon:137.25},
  '立山黑部 → 金澤':    {name:'立山 / 金澤',lat:36.58,lon:137.46},
  '上高地 / 金澤':     {name:'上高地 / 金澤',lat:36.56,lon:136.66},
  '常滑 → 機場':       {name:'常滑',     lat:34.88,lon:136.83},
};
export const WEATHER_CODE_MAP: Record<number,{label:string;icon:string}> = {
  0:{label:'晴朗',icon:'☀️'},1:{label:'大致晴',icon:'🌤️'},2:{label:'多雲',icon:'⛅'},3:{label:'陰天',icon:'☁️'},
  45:{label:'霧',icon:'🌫️'},48:{label:'凍霧',icon:'🌫️'},
  51:{label:'細雨',icon:'🌦️'},53:{label:'中雨',icon:'🌦️'},55:{label:'大雨',icon:'🌧️'},
  61:{label:'小雨',icon:'🌧️'},63:{label:'雨',icon:'🌧️'},65:{label:'大雨',icon:'🌧️'},
  71:{label:'小雪',icon:'🌨️'},73:{label:'中雪',icon:'❄️'},75:{label:'大雪',icon:'❄️'},
  80:{label:'陣雨',icon:'🌦️'},81:{label:'大陣雨',icon:'🌧️'},82:{label:'暴陣雨',icon:'⛈️'},
  95:{label:'雷暴',icon:'⛈️'},96:{label:'雷雹',icon:'⛈️'},99:{label:'強雷雹',icon:'⛈️'},
};
export const WEATHER_SLOT_HOURS = [9,12,15,18,21];
