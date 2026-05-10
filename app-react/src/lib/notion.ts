import { CATEGORIES, DEFAULT_NOTION_DB, PAYMENTS } from './constants';
import { activeTrip, stampReceiptForTrip } from '../domain/trip/normalize';
import { brokerNotionRequest, hasCredentialBrokerSession } from './credentialBroker';
import { displayStore, getPersons, hkd, receiptRegion } from './domain';

export function hasDirectNotionToken(): boolean {
  return !!(typeof window !== 'undefined' && (window as any).DEV_SECRETS?.notionToken);
}
import type { AppState, CategoryId, PaymentId, Receipt, TripProfile } from './types';

const NOTION_VERSION = '2022-06-28';

const N = {
  store: ['🏪 店名', '店名'],
  amount: ['💴 金額 ¥', '金額'],
  date: ['📅 日期', '日期'],
  time: ['⏰ 時間', '時間'],
  cat: ['🗂 類別', '類別'],
  pay: ['💳 支付', '支付'],
  region: ['📍 地區', '地區'],
  address: ['🗺️ 地址', '地址'],
  bookingRef: ['🎫 Booking Ref', 'Booking Ref'],
  items: ['🧾 品項', '品項'],
  note: ['📝 備註', '備註'],
  photoUrl: ['📷 相片 URL', '相片 URL'],
  person: ['👥 旅伴', '旅伴'],
  sourceId: ['🔑 SourceID', 'SourceID'],
  hkd: ['💵 HKD', 'HKD'],
  split: ['🔒 類型', '類型'],
  objectType: ['Object Type', '物件類型'],
  tripId: ['TripID', 'TripID'],
  tripName: ['Trip Name', 'Trip Name'],
  destination: ['Destination Summary', 'Destination Summary'],
  startDate: ['Start Date', 'Start Date'],
  endDate: ['End Date', 'End Date'],
  homeCurrency: ['Home Currency', 'Home Currency'],
  tripCurrencies: ['Trip Currencies', 'Trip Currencies'],
  timezones: ['Timezone List', 'Timezone List'],
  tripVersion: ['Trip Version', 'Trip Version'],
  updatedAt: ['Updated At', 'Updated At'],
  active: ['Active', 'Active'],
  tripJson: ['Trip JSON', 'Trip JSON'],
  currency: ['Currency', 'Currency'],
  originalAmount: ['Original Amount', 'Original Amount'],
  mapUrl: ['Map URL', 'Map URL'],
  exchangeRate: ['Exchange Rate', '匯率'],
} as const;

type SchemaMap = Record<keyof typeof N, string>;

let schemaCache: { db: string; map: SchemaMap } | null = null;
let lastMigratedDb: string | null = null;

function makeProxyUrl(proxy: string, target: string) {
  if (proxy.endsWith('=')) return proxy + encodeURIComponent(target);
  return proxy + target;
}

async function notionFetch<T>(state: AppState, path: string, init: RequestInit = {}): Promise<T> {
  const directToken = typeof window !== 'undefined' ? (window as any).DEV_SECRETS?.notionToken : '';
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

async function ensureSchema(state: AppState): Promise<SchemaMap> {
  if (schemaCache?.db === state.notionDb) return schemaCache.map;
  const db = await notionFetch<{ properties?: Record<string, unknown> }>(state, `/databases/${state.notionDb}`, { method: 'GET' });
  const props = db.properties || {};
  schemaCache = {
    db: state.notionDb,
    map: Object.fromEntries(
      Object.entries(N).map(([key, names]) => [key, props[names[0]] ? names[0] : props[names[1]] ? names[1] : names[0]]),
    ) as SchemaMap,
  };
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

function readProp(props: Record<string, any>, key: keyof typeof N) {
  return props[N[key][0]] || props[N[key][1]];
}

function receiptFromPage(state: AppState, page: any): Receipt | null {
  if (page.archived || page.in_trash) return null;
  const props = page.properties || {};
  const sourceId = readText(readProp(props, 'sourceId'), 'rich_text');
  if (sourceId === '__meta_settings__') return null;
  const objectType = readProp(props, 'objectType')?.select?.name || '';
  if (objectType === 'trip') return null;
  const catName = readProp(props, 'cat')?.select?.name || '';
  const payName = readProp(props, 'pay')?.select?.name || '';
  const personText = readText(readProp(props, 'person'), 'rich_text');
  const persons = getPersons(state);
  const receipt: Receipt = {
    id: sourceId || `notion_${page.id}`,
    notionPageId: page.id,
    sourceId,
    store: readText(readProp(props, 'store'), 'title') || 'Notion 匯入',
    total: Number(readProp(props, 'amount')?.number) || 0,
    date: readProp(props, 'date')?.date?.start || state.tripDateRange.start,
    time: readText(readProp(props, 'time'), 'rich_text'),
    category: (CATEGORIES.find((c) => c.name === catName)?.id || 'other') as CategoryId,
    payment: (PAYMENTS.find((p) => p.name === payName)?.id || 'cash') as PaymentId,
    region: readText(readProp(props, 'region'), 'rich_text'),
    address: readText(readProp(props, 'address'), 'rich_text'),
    bookingRef: readText(readProp(props, 'bookingRef'), 'rich_text'),
    itemsText: readText(readProp(props, 'items'), 'rich_text'),
    note: readText(readProp(props, 'note'), 'rich_text'),
    photoUrl: readProp(props, 'photoUrl')?.url || '',
    personId: persons.find((p) => personText.includes(p.name))?.id || persons[0]?.id,
    splitMode: String(readProp(props, 'split')?.select?.name || '').includes('私人') ? 'private' as const : 'shared' as const,
    source: 'notion',
    createdAt: page.created_time ? new Date(page.created_time).getTime() : Date.now(),
    updatedAt: page.last_edited_time ? new Date(page.last_edited_time).getTime() : undefined,
    tripId: readText(readProp(props, 'tripId'), 'rich_text') || state.activeTripId,
    tripVersion: Number(readProp(props, 'tripVersion')?.number) || undefined,
    originalAmount: Number(readProp(props, 'originalAmount')?.number) || undefined,
    originalCurrency: readProp(props, 'currency')?.select?.name || undefined,
    currency: readProp(props, 'currency')?.select?.name || undefined,
    hkdAmount: Number(readProp(props, 'hkd')?.number) || undefined,
    mapUrl: readProp(props, 'mapUrl')?.url || '',
    exchangeRate: Number(readProp(props, 'exchangeRate')?.number) || undefined,
  };
  return stampReceiptForTrip(state, receipt, { preserveUpdatedAt: true });
}

function tripFromPage(page: any): TripProfile | null {
  if (page.archived || page.in_trash) return null;
  const props = page.properties || {};
  const objectType = readProp(props, 'objectType')?.select?.name || '';
  const sourceId = readText(readProp(props, 'sourceId'), 'rich_text');
  if (objectType !== 'trip' && !sourceId.startsWith('trip_')) return null;
  const raw = readAllText(readProp(props, 'tripJson'), 'rich_text');
  try {
    const parsed = JSON.parse(raw) as TripProfile;
      return {
        ...parsed,
        notionPageId: page.id,
        sourceId: sourceId || parsed.sourceId || `trip_${parsed.id}`,
        active: !!readProp(props, 'active')?.checkbox,
        version: Number(readProp(props, 'tripVersion')?.number) || parsed.version || 1,
        updatedAt: page.last_edited_time ? new Date(page.last_edited_time).getTime() : parsed.updatedAt,
      };
  } catch {
    const id = readText(readProp(props, 'tripId'), 'rich_text') || sourceId.replace(/^trip_/, '') || `trip_${page.id}`;
    return {
      id,
      name: readText(readProp(props, 'tripName'), 'rich_text') || readText(readProp(props, 'store'), 'title') || 'Notion Trip',
      destinationSummary: readText(readProp(props, 'destination'), 'rich_text'),
      startDate: readProp(props, 'startDate')?.date?.start || '',
      endDate: readProp(props, 'endDate')?.date?.start || '',
      homeCurrency: readProp(props, 'homeCurrency')?.select?.name || 'HKD',
      currencies: readText(readProp(props, 'tripCurrencies'), 'rich_text').split(',').map((s: string) => s.trim()).filter(Boolean),
      timezones: readText(readProp(props, 'timezones'), 'rich_text').split(',').map((s: string) => s.trim()).filter(Boolean),
      version: Number(readProp(props, 'tripVersion')?.number) || 1,
      active: !!readProp(props, 'active')?.checkbox,
      itinerary: [],
      notionPageId: page.id,
      sourceId: sourceId || `trip_${id}`,
      createdAt: page.created_time ? new Date(page.created_time).getTime() : Date.now(),
      updatedAt: page.last_edited_time ? new Date(page.last_edited_time).getTime() : Date.now(),
    };
  }
}

export async function testNotion(state: AppState) {
  schemaCache = null;
  const schema = await ensureSchema(state);
  return Object.values(schema).join(', ');
}

export async function testDirectNotion(state: AppState): Promise<{ ok: boolean; count: number; firstTitle?: string; error?: string }> {
  const token = typeof window !== 'undefined' ? (window as any).DEV_SECRETS?.notionToken : '';
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
    const firstTitle = data.results?.[0]?.properties?.['店名']?.title?.[0]?.plain_text;
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
  await ensureSchema(state);
  const rows: Receipt[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i += 1) {
    const page = await notionFetch<{ results?: any[]; has_more?: boolean; next_cursor?: string }>(state, `/databases/${state.notionDb}/query`, {
      method: 'POST',
      body: JSON.stringify(cursor ? { page_size: 100, start_cursor: cursor } : { page_size: 100 }),
    });
    for (const item of page.results || []) {
      const receipt = receiptFromPage(state, item);
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
  await ensureSchema(state);
  const rows: TripProfile[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i += 1) {
    const page = await notionFetch<{ results?: any[]; has_more?: boolean; next_cursor?: string }>(state, `/databases/${state.notionDb}/query`, {
      method: 'POST',
      body: JSON.stringify(cursor ? { page_size: 100, start_cursor: cursor } : { page_size: 100 }),
    });
    for (const item of page.results || []) {
      const trip = tripFromPage(item);
      if (trip) rows.push(trip);
    }
    if (!page.has_more) break;
    cursor = page.next_cursor;
  }
  return rows;
}
