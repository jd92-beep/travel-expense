import { CATEGORIES, DEFAULT_NOTION_DB, PAYMENTS } from './constants';
import { activeTrip, stampReceiptForTrip } from '../domain/trip/normalize';
import { brokerNotionRequest, hasCredentialBrokerSession } from './credentialBroker';
import { displayStore, getPersons, hkd, receiptRegion } from './domain';
import { getDirectNotionToken } from './storage';

export function hasDirectNotionToken(): boolean {
  return !!(typeof window !== 'undefined' && (
    (window as any).DEV_SECRETS?.notionToken || getDirectNotionToken()
  ));
}
import type { AppState, CategoryId, PaymentId, Receipt, TripProfile } from './types';

const NOTION_VERSION = '2022-06-28';

const N = {
  store: ['🏪 店名', '店名', 'Store', 'Name', 'Title'],
  amount: ['💴 金額 ¥', '金額', 'Amount', 'Price', 'Cost', 'Total', 'Money', '💰 金額', '💴 Amount'],
  date: ['📅 日期', '日期', 'Date', '📅 Date'],
  time: ['⏰ 時間', '時間', 'Time', '⏰ Time'],
  cat: ['🗂 類別', '類別', 'Category', '類型', 'Type'],
  pay: ['💳 支付', '支付', 'Payment', 'Pay', '💳 Payment'],
  region: ['📍 地區', '地區', 'Region', 'Area', 'Location', '📍 Region'],
  address: ['🗺️ 地址', '地址', 'Address', '🗺️ Address'],
  bookingRef: ['🎫 Booking Ref', 'Booking Ref', 'Booking Reference', 'Booking'],
  items: ['🧾 品項', '品項', 'Items', 'Order', '🧾 Items'],
  note: ['📝 備註', '備註', 'Note', 'Notes', 'Memo', '📝 Note'],
  photoUrl: ['📷 相片 URL', '相片 URL', 'Photo URL', 'Photo', 'Image', '📷 Photo URL'],
  person: ['👥 旅伴', '旅伴', 'Person', 'People', 'Companion', '👥 Person'],
  sourceId: ['🔑 SourceID', 'SourceID', 'Source ID', 'ID'],
  hkd: ['💵 HKD', 'HKD', 'HKD Amount', 'Amount (HKD)'],
  split: ['🔒 類型', '類型', 'Split', 'Type', 'Sharing'],
  objectType: ['Object Type', '物件類型', 'Type'],
  tripId: ['TripID', 'TripID', 'Trip ID'],
  tripName: ['Trip Name', 'Trip Name', 'Trip'],
  destination: ['Destination Summary', 'Destination Summary', 'Destination', 'Location'],
  startDate: ['Start Date', 'Start Date', 'Start', 'From'],
  endDate: ['End Date', 'End Date', 'End', 'To'],
  homeCurrency: ['Home Currency', 'Home Currency', 'Home', 'Base Currency'],
  tripCurrencies: ['Trip Currencies', 'Trip Currencies', 'Currencies'],
  timezones: ['Timezone List', 'Timezone List', 'Timezones', 'Zones'],
  tripVersion: ['Trip Version', 'Trip Version', 'Version'],
  updatedAt: ['Updated At', 'Updated At', 'Updated', 'Last Updated'],
  active: ['Active', 'Active'],
  tripJson: ['Trip JSON', 'Trip JSON', 'JSON'],
  currency: ['Currency', 'Currency', '幣種'],
  originalAmount: ['Original Amount', 'Original Amount', 'Original'],
  mapUrl: ['Map URL', 'Map URL', 'Map', 'Map Link'],
  exchangeRate: ['Exchange Rate', '匯率', 'Rate', 'FX Rate'],
} as const;

type SchemaMap = Record<keyof typeof N, string>;

let schemaCache: { db: string; map: SchemaMap } | null = null;
let lastMigratedDb: string | null = null;

function makeProxyUrl(proxy: string, target: string) {
  if (proxy.endsWith('=')) return proxy + encodeURIComponent(target);
  return proxy + target;
}

async function notionFetch<T>(state: AppState, path: string, init: RequestInit = {}): Promise<T> {
  const directToken = (typeof window !== 'undefined' ? (window as any).DEV_SECRETS?.notionToken : '') || getDirectNotionToken();
  if (directToken && !hasCredentialBrokerSession(state)) {
    if (!state.notionDb?.trim()) throw new Error('未設定 Notion DB ID');
    const targetUrl = `https://api.notion.com/v1${path}`;
    const url = state.proxy?.trim() ? makeProxyUrl(state.proxy.trim(), targetUrl) : targetUrl;
    const response = await fetch(url, {
      method: init.method || 'GET',
      headers: {
        Authorization: `Bearer ${directToken}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      body: init.body,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data?.message || `${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }
  if (!hasCredentialBrokerSession(state)) throw new Error('Credential Broker session 未連線，Notion token 只可留喺 server-side vault');
  if (!state.notionDb?.trim()) throw new Error('未設定 Notion DB ID');
  return brokerNotionRequest<T>(state, path, init);
}

function findPropByNames(props: Record<string, any>, names: readonly string[]): string | undefined {
  for (const name of names) {
    if (name in props) return name;
  }
  return undefined;
}

function findPropByTypeAndPattern(
  props: Record<string, any>,
  types: string[],
  patterns: RegExp[],
): string | undefined {
  for (const [name, prop] of Object.entries(props)) {
    if (types.includes(prop?.type)) {
      for (const pattern of patterns) {
        if (pattern.test(name)) return name;
      }
    }
  }
  return undefined;
}

async function ensureSchema(state: AppState): Promise<SchemaMap> {
  if (schemaCache?.db === state.notionDb) return schemaCache.map;
  const db = await notionFetch<{ properties?: Record<string, any> }>(state, `/databases/${state.notionDb}`, { method: 'GET' });
  const props = db.properties || {};
  const map: Partial<SchemaMap> = {};

  for (const [key, names] of Object.entries(N)) {
    const k = key as keyof typeof N;
    // 1. Exact name match (check all candidates)
    let found = findPropByNames(props, names);
    // 2. Type-based fallback for critical fields
    if (!found) {
      if (k === 'store') {
        const titleProp = Object.entries(props).find(([, p]) => p?.type === 'title');
        found = titleProp?.[0];
      } else if (k === 'amount') {
        found = findPropByTypeAndPattern(props, ['number', 'formula'],
          [/金額|amount|price|cost|total|money|¥|💰|💴/i]);
      } else if (k === 'date') {
        found = findPropByTypeAndPattern(props, ['date'],
          [/日期|date|📅/i]);
      } else if (k === 'hkd') {
        found = findPropByTypeAndPattern(props, ['number', 'formula'],
          [/hkd|港幣|hk\s*\$/i]);
      } else if (k === 'originalAmount') {
        found = findPropByTypeAndPattern(props, ['number', 'formula'],
          [/original|原價|原價格|original amount/i]);
      } else if (k === 'exchangeRate') {
        found = findPropByTypeAndPattern(props, ['number', 'formula'],
          [/exchange|rate|匯率|汇率/i]);
      } else if (k === 'tripVersion') {
        found = findPropByTypeAndPattern(props, ['number', 'formula'],
          [/version|版本/i]);
      } else if (k === 'active') {
        found = findPropByTypeAndPattern(props, ['checkbox'],
          [/active|啟用|启用/i]);
      }
    }
    // 3. First-of-type fallback for critical properties
    if (!found) {
      if (k === 'photoUrl' || k === 'mapUrl') {
        const urlProp = Object.entries(props).find(([, p]) => p?.type === 'url');
        found = urlProp?.[0];
        if (!found) {
          const filesProp = Object.entries(props).find(([, p]) => p?.type === 'files');
          found = filesProp?.[0];
        }
      } else if (k === 'address' || k === 'region' || k === 'bookingRef' || k === 'items' || k === 'note' || k === 'person' || k === 'time') {
        const rtProp = Object.entries(props).find(([, p]) => p?.type === 'rich_text');
        found = rtProp?.[0];
      } else if (k === 'cat' || k === 'pay' || k === 'split' || k === 'currency' || k === 'homeCurrency') {
        const selProp = Object.entries(props).find(([, p]) => p?.type === 'select');
        found = selProp?.[0];
      } else if (k === 'tripName' || k === 'destination' || k === 'tripCurrencies' || k === 'timezones' || k === 'sourceId' || k === 'tripId') {
        const rtProp = Object.entries(props).find(([, p]) => p?.type === 'rich_text');
        found = rtProp?.[0];
      } else if (k === 'startDate' || k === 'endDate' || k === 'updatedAt') {
        const dateProp = Object.entries(props).find(([, p]) => p?.type === 'date');
        found = dateProp?.[0];
      }
    }
    map[k] = found || names[0];
  }

  schemaCache = { db: state.notionDb, map: map as SchemaMap };
  return schemaCache.map;
}

function propName(schema: SchemaMap, key: keyof typeof N) {
  return schema[key] || N[key][0];
}

function richTextChunks(value: string, chunkSize = 1800) {
  const text = String(value || '');
  const chunks = text.match(new RegExp(`[\\s\\S]{1,${chunkSize}}`, 'g')) || [''];
  return chunks.slice(0, 80).map((content) => ({ text: { content } }));
}

function buildProps(state: AppState, receipt: Receipt, schema: SchemaMap) {
  const cat = CATEGORIES.find((c) => c.id === receipt.category);
  const pay = PAYMENTS.find((p) => p.id === receipt.payment);
  const persons = getPersons(state);
  const person = persons.find((p) => p.id === receipt.personId) || persons[0];
  return {
    [propName(schema, 'objectType')]: { select: { name: 'receipt' } },
    [propName(schema, 'store')]: { title: [{ text: { content: displayStore(receipt) || '未命名' } }] },
    [propName(schema, 'amount')]: { number: Number(receipt.total) || 0 },
    [propName(schema, 'date')]: { date: { start: receipt.date } },
    [propName(schema, 'time')]: { rich_text: [{ text: { content: receipt.time || '' } }] },
    [propName(schema, 'cat')]: { select: { name: cat?.name || '其他' } },
    [propName(schema, 'pay')]: { select: { name: pay?.name || '現金' } },
    [propName(schema, 'region')]: { rich_text: [{ text: { content: receiptRegion(state, receipt).slice(0, 200) } }] },
    [propName(schema, 'address')]: { rich_text: [{ text: { content: (receipt.address || '').slice(0, 500) } }] },
    [propName(schema, 'bookingRef')]: { rich_text: [{ text: { content: (receipt.bookingRef || '').slice(0, 200) } }] },
    [propName(schema, 'items')]: { rich_text: [{ text: { content: (receipt.itemsText || '').slice(0, 1900) } }] },
    [propName(schema, 'note')]: { rich_text: [{ text: { content: (receipt.note || '').slice(0, 1900) } }] },
    [propName(schema, 'photoUrl')]: { url: receipt.photoUrl || null },
    [propName(schema, 'person')]: { rich_text: [{ text: { content: person ? `${person.emoji} ${person.name}` : '' } }] },
    [propName(schema, 'sourceId')]: { rich_text: [{ text: { content: receipt.sourceId || receipt.id } }] },
    [propName(schema, 'hkd')]: { number: receipt.hkdAmount ?? hkd(receipt.total, state) },
    [propName(schema, 'split')]: { select: { name: receipt.splitMode === 'private' ? '🔒 私人' : '👫 共同' } },
    [propName(schema, 'tripId')]: { rich_text: [{ text: { content: receipt.tripId || activeTrip(state).id } }] },
    [propName(schema, 'tripVersion')]: { number: receipt.tripVersion || activeTrip(state).version },
    [propName(schema, 'currency')]: { select: { name: receipt.currency || receipt.originalCurrency || state.tripCurrency || 'JPY' } },
    [propName(schema, 'originalAmount')]: { number: Number(receipt.originalAmount ?? receipt.total) || 0 },
    [propName(schema, 'mapUrl')]: { url: receipt.mapUrl || null },
    [propName(schema, 'exchangeRate')]: { number: Number(receipt.exchangeRate) || 0 },
  };
}

async function findPageBySourceId(state: AppState, schema: SchemaMap, sourceId: string): Promise<string | null> {
  const response = await notionFetch<{ results?: Array<{ id: string }> }>(state, `/databases/${state.notionDb}/query`, {
    method: 'POST',
    body: JSON.stringify({
      page_size: 1,
      filter: {
        property: propName(schema, 'sourceId'),
        rich_text: { equals: sourceId },
      },
    }),
  });
  return response.results?.[0]?.id || null;
}

function buildTripProps(trip: TripProfile, schema: SchemaMap) {
  const title = trip.name || trip.destinationSummary || trip.id;
  return {
    [propName(schema, 'objectType')]: { select: { name: 'trip' } },
    [propName(schema, 'store')]: { title: [{ text: { content: title.slice(0, 120) || 'Trip' } }] },
    [propName(schema, 'sourceId')]: { rich_text: [{ text: { content: trip.sourceId || `trip_${trip.id}` } }] },
    [propName(schema, 'tripId')]: { rich_text: [{ text: { content: trip.id } }] },
    [propName(schema, 'tripName')]: { rich_text: [{ text: { content: trip.name.slice(0, 200) } }] },
    [propName(schema, 'destination')]: { rich_text: [{ text: { content: trip.destinationSummary.slice(0, 500) } }] },
    [propName(schema, 'startDate')]: { date: { start: trip.startDate } },
    [propName(schema, 'endDate')]: { date: { start: trip.endDate } },
    [propName(schema, 'homeCurrency')]: { select: { name: trip.homeCurrency || 'HKD' } },
    [propName(schema, 'tripCurrencies')]: { rich_text: [{ text: { content: trip.currencies.join(',') } }] },
    [propName(schema, 'timezones')]: { rich_text: [{ text: { content: trip.timezones.join(',') } }] },
    [propName(schema, 'tripVersion')]: { number: trip.version || 1 },
    [propName(schema, 'updatedAt')]: { date: { start: new Date(trip.updatedAt || Date.now()).toISOString() } },
    [propName(schema, 'active')]: { checkbox: !!trip.active && !trip.archived },
    [propName(schema, 'tripJson')]: { rich_text: richTextChunks(JSON.stringify(trip)) },
  };
}

function readText(prop: any, type: 'title' | 'rich_text') {
  return prop?.[type]?.[0]?.plain_text || prop?.[type]?.[0]?.text?.content || '';
}

function readAllText(prop: any, type: 'title' | 'rich_text') {
  return (prop?.[type] || []).map((item: any) => item?.plain_text || item?.text?.content || '').join('');
}

function readProp(props: Record<string, any>, key: keyof typeof N, schema?: SchemaMap) {
  const names = schema ? [schema[key], ...N[key]] : [...N[key]];
  // Deduplicate candidate names while preserving order
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const name of names) {
    if (name && !seen.has(name)) { seen.add(name); unique.push(name); }
  }
  // Collect ALL matches — prefer the one that has actual content
  let firstMatch: any = undefined;
  for (const name of unique) {
    if (!(name in props)) continue;
    const prop = props[name];
    if (!firstMatch) firstMatch = prop;
    // Check if this prop has non-empty content
    if (propHasContent(prop)) return prop;
  }
  return firstMatch;
}

/** Check whether a Notion property object has non-empty / non-zero payload */
function propHasContent(prop: any): boolean {
  if (!prop) return false;
  switch (prop.type) {
    case 'number': return typeof prop.number === 'number' && prop.number !== 0;
    case 'url': return !!prop.url;
    case 'files': return Array.isArray(prop.files) && prop.files.length > 0;
    case 'select': return !!prop.select?.name;
    case 'multi_select': return Array.isArray(prop.multi_select) && prop.multi_select.length > 0;
    case 'date': return !!prop.date?.start;
    case 'checkbox': return true; // checkbox always has a value
    case 'formula':
      return typeof prop.formula?.number === 'number' || !!prop.formula?.string;
    case 'rollup':
      return typeof prop.rollup?.number === 'number';
    case 'rich_text':
      return (prop.rich_text || []).some((t: any) => (t?.plain_text || t?.text?.content || '').length > 0);
    case 'title':
      return (prop.title || []).some((t: any) => (t?.plain_text || t?.text?.content || '').length > 0);
    default: return false;
  }
}

function readNumberProp(props: Record<string, any>, key: keyof typeof N, schema?: SchemaMap): number | undefined {
  const prop = readProp(props, key, schema);
  if (prop) {
    if (typeof prop.number === 'number') return prop.number;
    if (prop.formula?.type === 'number' && typeof prop.formula.number === 'number') return prop.formula.number;
    if (prop.rollup?.type === 'number' && typeof prop.rollup.number === 'number') return prop.rollup.number;
    const text = readAllText(prop, 'rich_text') || readAllText(prop, 'title') || '';
    const parsed = parseFloat(text.replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  // ULTRA FALLBACK: scan ALL properties when mapped property fails
  const isAmountLike = key === 'amount' || key === 'originalAmount';
  const isHkdLike = key === 'hkd';
  const isRateLike = key === 'exchangeRate';
  const isVersionLike = key === 'tripVersion';

  if (isAmountLike) {
    // Find any number/formula property with amount-related name
    for (const [name, p] of Object.entries(props)) {
      const val = p?.number ?? p?.formula?.number ?? p?.rollup?.number;
      if (typeof val === 'number' && val > 0 && /amount|金額|price|cost|total|money|¥|💰|💴/i.test(name)) return val;
    }
    // Last resort: first positive number property of any name
    for (const [, p] of Object.entries(props)) {
      const val = p?.number ?? p?.formula?.number ?? p?.rollup?.number;
      if (typeof val === 'number' && val > 0) return val;
    }
  }
  if (isHkdLike) {
    for (const [name, p] of Object.entries(props)) {
      const val = p?.number ?? p?.formula?.number ?? p?.rollup?.number;
      if (typeof val === 'number' && /hkd|港幣|hk\s*\$/i.test(name)) return val;
    }
  }
  if (isRateLike) {
    for (const [name, p] of Object.entries(props)) {
      const val = p?.number ?? p?.formula?.number ?? p?.rollup?.number;
      if (typeof val === 'number' && /exchange|rate|匯率|汇率/i.test(name)) return val;
    }
  }
  if (isVersionLike) {
    for (const [, p] of Object.entries(props)) {
      const val = p?.number ?? p?.formula?.number ?? p?.rollup?.number;
      if (typeof val === 'number') return val;
    }
  }
  return undefined;
}

function readUrlProp(props: Record<string, any>, key: keyof typeof N, schema?: SchemaMap): string {
  const prop = readProp(props, key, schema);
  if (prop?.type === 'url' && prop.url) return prop.url;
  if (prop?.type === 'files' && prop.files?.[0]) return prop.files[0].external?.url || prop.files[0].file?.url || '';
  // ULTRA FALLBACK
  if (key === 'photoUrl' || key === 'mapUrl') {
    for (const [name, p] of Object.entries(props)) {
      if (p?.type === 'url' && p?.url) {
        if (key === 'photoUrl' && /photo|image|pic|相片|照片|img/i.test(name)) return p.url;
        if (key === 'mapUrl' && /map|地圖|地图/i.test(name)) return p.url;
      }
    }
    if (key === 'photoUrl') {
      // Last resort: any url property
      for (const [, p] of Object.entries(props)) {
        if (p?.type === 'url' && p?.url) return p.url;
      }
      // Files property fallback
      for (const [, p] of Object.entries(props)) {
        if (p?.type === 'files' && p?.files?.[0]) {
          return p.files[0].external?.url || p.files[0].file?.url || '';
        }
      }
    }
  }
  return '';
}

function readRichTextProp(props: Record<string, any>, key: keyof typeof N, schema?: SchemaMap): string {
  const prop = readProp(props, key, schema);
  if (prop) {
    const text = readAllText(prop, 'rich_text') || readAllText(prop, 'title') || '';
    if (text) return text;
  }
  const patterns: Record<string, RegExp[]> = {
    address: [/address|地址|地點|地点|location|addr|street/i],
    region: [/region|地區|地区|area|zone|district|city|城市/i],
    bookingRef: [/booking|預訂|预订|ref|reference|訂單|订单|reservation/i],
    items: [/items|品項|项目|order|details|明细|products/i],
    note: [/note|備註|备注|memo|comment|说明|remarks/i],
    person: [/person|旅伴|people|companion|partner|member|who/i],
    time: [/time|時間|时间|hour|clock/i],
    tripName: [/trip|name|名稱|名称|title/i],
    destination: [/destination|地點|地点|location|place|去哪|summary/i],
    tripCurrencies: [/currency|幣種|币种|money|currencies/i],
    timezones: [/timezone|time.*zone|時區|时区|zones/i],
  };
  if (patterns[key]) {
    for (const [name, p] of Object.entries(props)) {
      if ((p?.type === 'rich_text' || p?.type === 'title')) {
        const text = readAllText(p, p.type) || '';
        if (text) {
          for (const pattern of patterns[key]) {
            if (pattern.test(name)) return text;
          }
        }
      }
    }
  }
  return '';
}

function readTitleProp(props: Record<string, any>, schema?: SchemaMap): string {
  const prop = readProp(props, 'store', schema);
  if (prop?.title?.[0]?.plain_text) return prop.title[0].plain_text;
  // Ultra fallback: find any title property
  for (const [, p] of Object.entries(props)) {
    if (p?.type === 'title' && p?.title?.[0]?.plain_text) {
      return p.title[0].plain_text;
    }
  }
  return '';
}

function readDateProp(props: Record<string, any>, key: keyof typeof N, schema?: SchemaMap): string | undefined {
  const prop = readProp(props, key, schema);
  if (prop?.date?.start) return prop.date.start;
  if (key === 'date' || key === 'startDate' || key === 'endDate' || key === 'updatedAt') {
    for (const [name, p] of Object.entries(props)) {
      if (p?.type === 'date' && p?.date?.start) {
        if (key === 'date' && /date|日期|📅/i.test(name)) return p.date.start;
        if (key === 'startDate' && /start|開始|开始|from/i.test(name)) return p.date.start;
        if (key === 'endDate' && /end|結束|结束|to/i.test(name)) return p.date.start;
        if (key === 'updatedAt' && /update|更新|modified/i.test(name)) return p.date.start;
      }
    }
    // Last resort: first date property
    for (const [, p] of Object.entries(props)) {
      if (p?.type === 'date' && p?.date?.start) return p.date.start;
    }
  }
  return undefined;
}

function readSelectProp(props: Record<string, any>, key: keyof typeof N, schema?: SchemaMap): string | undefined {
  const prop = readProp(props, key, schema);
  if (prop?.select?.name) return prop.select.name;
  const patterns: Record<string, RegExp[]> = {
    cat: [/cat|類別|类别|type|kind|分類|分类|種類|种类/i],
    pay: [/pay|支付|付款|payment|method|方式/i],
    split: [/split|類型|类型|type|sharing|share|共享/i],
    currency: [/currency|幣種|币种|money|幣别|币种/i],
    homeCurrency: [/home|base|currency|幣種|币种/i],
    objectType: [/type|類型|类型|kind|object/i],
  };
  if (patterns[key]) {
    for (const [name, p] of Object.entries(props)) {
      if (p?.type === 'select' && p?.select?.name) {
        for (const pattern of patterns[key]) {
          if (pattern.test(name)) return p.select.name;
        }
      }
    }
  }
  return undefined;
}

function receiptFromPage(state: AppState, page: any, schema: SchemaMap): Receipt | null {
  if (page.archived || page.in_trash) return null;
  const props = page.properties || {};
  const sourceId = readRichTextProp(props, 'sourceId', schema) || readRichTextProp(props, 'tripId', schema);
  if (sourceId === '__meta_settings__') return null;
  const objectType = readSelectProp(props, 'objectType', schema) || '';
  if (objectType === 'trip') return null;
  const catName = readSelectProp(props, 'cat', schema) || '';
  const payName = readSelectProp(props, 'pay', schema) || '';
  const personText = readRichTextProp(props, 'person', schema);
  const persons = getPersons(state);
  const receipt: Receipt = {
    id: sourceId || `notion_${page.id}`,
    notionPageId: page.id,
    sourceId,
    store: readTitleProp(props, schema) || 'Notion 匯入',
    total: readNumberProp(props, 'amount', schema) ?? 0,
    date: readDateProp(props, 'date', schema) || state.tripDateRange.start,
    time: readRichTextProp(props, 'time', schema),
    category: (CATEGORIES.find((c) => c.name === catName)?.id || 'other') as CategoryId,
    payment: (PAYMENTS.find((p) => p.name === payName)?.id || 'cash') as PaymentId,
    region: readRichTextProp(props, 'region', schema),
    address: readRichTextProp(props, 'address', schema),
    bookingRef: readRichTextProp(props, 'bookingRef', schema),
    itemsText: readRichTextProp(props, 'items', schema),
    note: readRichTextProp(props, 'note', schema),
    photoUrl: readUrlProp(props, 'photoUrl', schema),
    personId: persons.find((p) => personText.includes(p.name))?.id || persons[0]?.id,
    splitMode: String(readSelectProp(props, 'split', schema) || '').includes('私人') ? 'private' as const : 'shared' as const,
    source: 'notion',
    createdAt: page.created_time ? new Date(page.created_time).getTime() : Date.now(),
    updatedAt: page.last_edited_time ? new Date(page.last_edited_time).getTime() : undefined,
    tripId: readRichTextProp(props, 'tripId', schema) || state.activeTripId,
    tripVersion: readNumberProp(props, 'tripVersion', schema),
    originalAmount: readNumberProp(props, 'originalAmount', schema),
    originalCurrency: readSelectProp(props, 'currency', schema) || undefined,
    currency: readSelectProp(props, 'currency', schema) || undefined,
    hkdAmount: readNumberProp(props, 'hkd', schema),
    mapUrl: readUrlProp(props, 'mapUrl', schema),
    exchangeRate: readNumberProp(props, 'exchangeRate', schema),
  };
  return stampReceiptForTrip(state, receipt, { preserveUpdatedAt: true });
}

function tripFromPage(page: any, schema: SchemaMap): TripProfile | null {
  if (page.archived || page.in_trash) return null;
  const props = page.properties || {};
  const objectType = readProp(props, 'objectType', schema)?.select?.name || '';
  const sourceId = readText(readProp(props, 'sourceId', schema), 'rich_text');
  if (objectType !== 'trip' && !sourceId.startsWith('trip_')) return null;
  const raw = readAllText(readProp(props, 'tripJson', schema), 'rich_text');
  try {
    const parsed = JSON.parse(raw) as TripProfile;
      return {
        ...parsed,
        notionPageId: page.id,
        sourceId: sourceId || parsed.sourceId || `trip_${parsed.id}`,
        active: !!readProp(props, 'active', schema)?.checkbox,
        version: readNumberProp(props, 'tripVersion', schema) || parsed.version || 1,
        updatedAt: page.last_edited_time ? new Date(page.last_edited_time).getTime() : parsed.updatedAt,
      };
  } catch {
    const id = readText(readProp(props, 'tripId', schema), 'rich_text') || sourceId.replace(/^trip_/, '') || `trip_${page.id}`;
    return {
      id,
      name: readText(readProp(props, 'tripName', schema), 'rich_text') || readText(readProp(props, 'store', schema), 'title') || 'Notion Trip',
      destinationSummary: readText(readProp(props, 'destination', schema), 'rich_text'),
      startDate: readProp(props, 'startDate', schema)?.date?.start || '',
      endDate: readProp(props, 'endDate', schema)?.date?.start || '',
      homeCurrency: readProp(props, 'homeCurrency', schema)?.select?.name || 'HKD',
      currencies: readText(readProp(props, 'tripCurrencies', schema), 'rich_text').split(',').map((s: string) => s.trim()).filter(Boolean),
      timezones: readText(readProp(props, 'timezones', schema), 'rich_text').split(',').map((s: string) => s.trim()).filter(Boolean),
      version: readNumberProp(props, 'tripVersion', schema) || 1,
      active: !!readProp(props, 'active', schema)?.checkbox,
      itinerary: [],
      notionPageId: page.id,
      sourceId: sourceId || `trip_${id}`,
      createdAt: page.created_time ? new Date(page.created_time).getTime() : Date.now(),
      updatedAt: page.last_edited_time ? new Date(page.last_edited_time).getTime() : Date.now(),
    };
  }
}

export async function diagnoseNotionSchema(state: AppState): Promise<Array<{ name: string; type: string; mapped: string | null }>> {
  const db = await notionFetch<{ properties?: Record<string, { type: string }> }>(state, `/databases/${state.notionDb}`, { method: 'GET' });
  const props = db.properties || {};
  const schema = await ensureSchema(state);
  const reverseMap = new Map<string, string>();
  for (const [key, name] of Object.entries(schema)) {
    reverseMap.set(name, key);
  }
  return Object.entries(props).map(([name, prop]) => ({
    name,
    type: prop.type,
    mapped: reverseMap.get(name) || null,
  }));
}

export async function testNotion(state: AppState) {
  schemaCache = null;
  const schema = await ensureSchema(state);
  return Object.values(schema).join(', ');
}

export async function testDirectNotion(state: AppState): Promise<{ ok: boolean; count: number; firstTitle?: string; error?: string }> {
  const token = ((typeof window !== 'undefined' ? (window as any).DEV_SECRETS?.notionToken : '') || getDirectNotionToken());
  if (!token) return { ok: false, count: 0, error: 'No direct token in window.DEV_SECRETS' };
  const dbId = state.notionDb || DEFAULT_NOTION_DB;
  try {
    const targetUrl = `https://api.notion.com/v1/databases/${dbId}/query`;
    const url = state.proxy?.trim() ? makeProxyUrl(state.proxy.trim(), targetUrl) : targetUrl;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 1 }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, count: 0, error: data?.message || `${res.status} ${res.statusText}` };
    const schema = await ensureSchema(state);
    const firstTitleProp = data.results?.[0]?.properties?.[propName(schema, 'store')];
    const firstTitle = firstTitleProp?.title?.[0]?.plain_text;
    return { ok: true, count: data.results?.length ?? 0, firstTitle };
  } catch (err) {
    return { ok: false, count: 0, error: String(err) };
  }
}

export async function migrateNotionSchema(state: AppState): Promise<string> {
  schemaCache = null;
  const db = await notionFetch<{ properties?: Record<string, unknown> }>(state, `/databases/${state.notionDb}`, { method: 'GET' });
  const props = db.properties || {};
  const desired: Record<string, unknown> = {
    [N.amount[0]]: { number: { format: 'yen' } },
    [N.date[0]]: { date: {} },
    [N.time[0]]: { rich_text: {} },
    [N.cat[0]]: { select: { options: CATEGORIES.map((c) => ({ name: c.name, color: 'default' })) } },
    [N.pay[0]]: { select: { options: PAYMENTS.map((p) => ({ name: p.name, color: 'default' })) } },
    [N.region[0]]: { rich_text: {} },
    [N.address[0]]: { rich_text: {} },
    [N.bookingRef[0]]: { rich_text: {} },
    [N.items[0]]: { rich_text: {} },
    [N.note[0]]: { rich_text: {} },
    [N.photoUrl[0]]: { url: {} },
    [N.person[0]]: { rich_text: {} },
    [N.sourceId[0]]: { rich_text: {} },
    [N.hkd[0]]: { number: { format: 'hong_kong_dollar' } },
    [N.split[0]]: { select: { options: [{ name: '👫 共同', color: 'blue' }, { name: '🔒 私人', color: 'red' }] } },
    [N.objectType[0]]: { select: { options: [{ name: 'receipt', color: 'blue' }, { name: 'trip', color: 'green' }, { name: 'settings', color: 'gray' }] } },
    [N.tripId[0]]: { rich_text: {} },
    [N.tripName[0]]: { rich_text: {} },
    [N.destination[0]]: { rich_text: {} },
    [N.startDate[0]]: { date: {} },
    [N.endDate[0]]: { date: {} },
    [N.homeCurrency[0]]: { select: { options: [{ name: 'HKD', color: 'green' }] } },
    [N.tripCurrencies[0]]: { rich_text: {} },
    [N.timezones[0]]: { rich_text: {} },
    [N.tripVersion[0]]: { number: { format: 'number' } },
    [N.updatedAt[0]]: { date: {} },
    [N.active[0]]: { checkbox: {} },
    [N.tripJson[0]]: { rich_text: {} },
    [N.currency[0]]: { select: { options: ['JPY', 'HKD', 'USD', 'KRW', 'TWD', 'CNY', 'EUR', 'GBP', 'AUD', 'SGD', 'THB', 'MYR', 'VND'].map((name) => ({ name, color: 'default' })) } },
    [N.originalAmount[0]]: { number: { format: 'number' } },
    [N.mapUrl[0]]: { url: {} },
    [N.exchangeRate[0]]: { number: { format: 'number' } },
  };
  const missing = Object.fromEntries(Object.entries(desired).filter(([name]) => !props[name]));
  if (!Object.keys(missing).length) {
    lastMigratedDb = state.notionDb;
    return 'Notion schema 已齊全';
  }
  await notionFetch(state, `/databases/${state.notionDb}`, { method: 'PATCH', body: JSON.stringify({ properties: missing }) });
  schemaCache = null;
  lastMigratedDb = state.notionDb;
  return `已新增 ${Object.keys(missing).length} 個欄位`;
}

async function ensureWritableSchema(state: AppState): Promise<SchemaMap> {
  if (lastMigratedDb !== state.notionDb) {
    await migrateNotionSchema(state).catch(() => {
      // If schema migration is not permitted, the caller will still get a clear
      // Notion error from the actual write path.
    });
    lastMigratedDb = state.notionDb;
  }
  return ensureSchema(state);
}

export async function pushReceipt(state: AppState, receipt: Receipt): Promise<Receipt> {
  if (!state.notionDb) return receipt;
  const schema = await ensureWritableSchema(state);
  const properties = buildProps(state, receipt, schema);
  const sourceId = receipt.sourceId || receipt.id;
  let pageId: string | null | undefined = receipt.notionPageId;
  if (pageId) {
    try {
      await notionFetch(state, `/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
      return { ...receipt, notionPageId: pageId };
    } catch (err: any) {
      if (!/404|Could not find page|invalid_request_url/.test(err.message || '')) throw err;
      pageId = null; // stale ID, fall through
    }
  }
  if (!pageId) pageId = await findPageBySourceId(state, schema, sourceId).catch(() => null);
  if (pageId) {
    await notionFetch(state, `/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
    return { ...receipt, notionPageId: pageId };
  }
  const page = await notionFetch<{ id: string }>(state, '/pages', {
    method: 'POST',
    body: JSON.stringify({ parent: { database_id: state.notionDb }, properties }),
  });
  return { ...receipt, notionPageId: page.id };
}

export async function pushTripPage(state: AppState, trip: TripProfile): Promise<TripProfile> {
  if (!state.notionDb) return trip;
  const schema = await ensureWritableSchema(state);
  const properties = buildTripProps(trip, schema);
  const sourceId = trip.sourceId || `trip_${trip.id}`;
  let pageId: string | null | undefined = trip.notionPageId;
  if (pageId) {
    try {
      await notionFetch(state, `/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
      return { ...trip, notionPageId: pageId };
    } catch (err: any) {
      if (!/404|Could not find page|invalid_request_url/.test(err.message || '')) throw err;
      pageId = null; // stale ID, fall through
    }
  }
  if (!pageId) pageId = await findPageBySourceId(state, schema, sourceId).catch(() => null);
  if (pageId) {
    await notionFetch(state, `/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
    return { ...trip, notionPageId: pageId };
  }
  const page = await notionFetch<{ id: string }>(state, '/pages', {
    method: 'POST',
    body: JSON.stringify({ parent: { database_id: state.notionDb }, properties }),
  });
  return { ...trip, notionPageId: page.id };
}

export async function pushSettingsMeta(state: AppState): Promise<void> {
  if (!state.notionDb) return;
  const schema = await ensureWritableSchema(state);
  const payload = {
    budget: state.budget,
    rate: state.rate,
    tripCurrency: state.tripCurrency,
    autoSync: state.autoSync,
    activeTripId: state.activeTripId,
    persons: state.persons,
    shareRatios: state.shareRatios,
    settingsUpdatedAt: state.settingsUpdatedAt || Date.now(),
  };
  const properties = {
    [propName(schema, 'objectType')]: { select: { name: 'settings' } },
    [propName(schema, 'store')]: { title: [{ text: { content: '__meta_settings__' } }] },
    [propName(schema, 'sourceId')]: { rich_text: [{ text: { content: '__meta_settings__' } }] },
    [propName(schema, 'note')]: { rich_text: richTextChunks(JSON.stringify(payload)) },
    [propName(schema, 'updatedAt')]: { date: { start: new Date().toISOString() } },
  };
  const pageId = await findPageBySourceId(state, schema, '__meta_settings__').catch(() => null);
  if (pageId) {
    await notionFetch(state, `/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
    return;
  }
  await notionFetch(state, '/pages', {
    method: 'POST',
    body: JSON.stringify({ parent: { database_id: state.notionDb }, properties }),
  });
}

export async function archiveReceipt(state: AppState, receipt: Receipt) {
  if (!state.notionDb) return;
  const schema = await ensureWritableSchema(state);
  const pageId = receipt.notionPageId || await findPageBySourceId(state, schema, receipt.sourceId || receipt.id).catch(() => null);
  if (!pageId) return;
  await notionFetch(state, `/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) });
}

export async function pushAll(state: AppState) {
  let ok = 0;
  for (const trip of state.trips || []) {
    await pushTripPage(state, trip);
  }
  for (const receipt of state.receipts) {
    await pushReceipt(state, receipt);
    ok += 1;
  }
  await pushSettingsMeta(state);
  return ok;
}

export async function pullAll(state: AppState): Promise<Receipt[]> {
  const schema = await ensureSchema(state);
  const rows: Receipt[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i += 1) {
    const page = await notionFetch<{ results?: any[]; has_more?: boolean; next_cursor?: string }>(state, `/databases/${state.notionDb}/query`, {
      method: 'POST',
      body: JSON.stringify(cursor ? { page_size: 100, start_cursor: cursor } : { page_size: 100 }),
    });
    for (const item of page.results || []) {
      const receipt = receiptFromPage(state, item, schema);
      if (
        receipt
        && !state.notionDeletedIds?.includes(receipt.notionPageId || '')
        && !state.notionDeletedSourceIds?.includes(receipt.sourceId || receipt.id)
      ) rows.push(receipt);
    }
    if (!page.has_more) break;
    cursor = page.next_cursor;
  }
  return rows;
}

export async function pullTrips(state: AppState): Promise<TripProfile[]> {
  const schema = await ensureSchema(state);
  const rows: TripProfile[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i += 1) {
    const page = await notionFetch<{ results?: any[]; has_more?: boolean; next_cursor?: string }>(state, `/databases/${state.notionDb}/query`, {
      method: 'POST',
      body: JSON.stringify(cursor ? { page_size: 100, start_cursor: cursor } : { page_size: 100 }),
    });
    for (const item of page.results || []) {
      const trip = tripFromPage(item, schema);
      if (trip) rows.push(trip);
    }
    if (!page.has_more) break;
    cursor = page.next_cursor;
  }
  return rows;
}
