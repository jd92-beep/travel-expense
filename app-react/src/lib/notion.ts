import { CATEGORIES, DEFAULT_NOTION_DB, PAYMENTS, normalizeAiModelSettings } from './constants';
import { activeTrip, stampReceiptForTrip } from '../domain/trip/normalize';
import { brokerNotionRequest, hasCredentialBrokerSession, brokerNotionUploadFile } from './credentialBroker';
import { displayStore, getPersons, hkd, receiptRegion } from './domain';
import { getDirectNotionToken } from './storage';
import { isReceiptTombstoned } from './syncMerge';
import { currentSupabaseUserEmail } from './supabase';

export function hasDirectNotionToken(): boolean {
  if (!import.meta.env.DEV) return false;
  return !!(typeof window !== 'undefined' && (
    (window as any).DEV_SECRETS?.notionToken || getDirectNotionToken()
  ));
}
import type { AppState, CategoryId, PaymentId, Receipt, TripProfile } from './types';

const NOTION_VERSION = '2022-06-28';

const N = {
  // ── Receipt core fields (highest priority during schema resolution) ──
  store: ['店名', '🏪 店名', 'Store', 'Name'],
  amount: ['金額', '💴 金額 ¥', 'Amount', 'Price', 'Cost', '💰 金額', '💴 Amount'],
  date: ['日期', '📅 日期', 'Date', '📅 Date'],
  time: ['⏰ 時間', '時間', 'Time', '⏰ Time'],
  cat: ['類別', '🗂 類別', 'Category'],
  pay: ['支付', '💳 支付', 'Payment', 'Pay', '💳 Payment'],
  region: ['地區', '📍 地區', 'Region', 'Area', '📍 Region'],
  address: ['🗺️ 地址', '地址', 'Address', '🗺️ Address'],
  bookingRef: ['🎫 Booking Ref', 'Booking Ref', 'Booking Reference', 'Booking'],
  items: ['品項', '🧾 品項', 'Items', 'Order', '🧾 Items'],
  note: ['備註', '📝 備註', 'Note', 'Notes', 'Memo', '📝 Note'],
  photoUrl: ['📷 收據相片', '📷 相片 URL', '相片 URL', 'Photo URL', 'Photo', 'Image', '📷 Photo URL'],
  person: ['旅伴', '👥 旅伴', 'Person', 'People', 'Companion', '👥 Person'],
  sourceId: ['SourceID', '🔑 SourceID', 'Source ID'],
  hkd: ['HKD', '💵 HKD', 'HKD Amount', 'Amount (HKD)'],
  split: ['🔒 類型', 'Split', 'Sharing'],
  objectType: ['Object Type', '物件類型'],
  // ── Trip-specific fields ──
  tripId: ['TripID', 'Trip ID'],
  tripName: ['Trip Name', 'Trip'],
  destination: ['Destination Summary', 'Destination'],
  startDate: ['Start Date', 'Start', 'From'],
  endDate: ['End Date', 'End', 'To'],
  homeCurrency: ['Home Currency', 'Base Currency'],
  tripCurrencies: ['Trip Currencies', 'Currencies'],
  timezones: ['Timezone List', 'Timezones', 'Zones'],
  tripVersion: ['Trip Version', 'Version'],
  updatedAt: ['Updated At', 'Updated', 'Last Updated'],
  active: ['Active'],
  tripJson: ['Trip JSON', 'JSON'],
  currency: ['Currency', '幣種'],
  originalAmount: ['Original Amount', 'Original'],
  mapUrl: ['Map URL', 'Map', 'Map Link'],
  exchangeRate: ['Exchange Rate', '匯率', 'Rate', 'FX Rate'],
} as const;

type SchemaMap = Record<keyof typeof N, string>;
type ReadOptions = { allowLoose?: boolean };
type DuplicateMode = 'number' | 'date' | 'select' | 'text';

export type ReactMappingIssueKind =
  | 'duplicate-family'
  | 'conflicting-duplicate'
  | 'meta-fallback'
  | 'skipped-row';

export interface ReactMappingIssue {
  pageId: string;
  title: string;
  kind: ReactMappingIssueKind;
  field: string;
  detail: string;
}

export interface ReactMappingDiagnostics {
  scanned: number;
  receiptCandidates: number;
  skipped: number;
  issues: ReactMappingIssue[];
  counts: Record<ReactMappingIssueKind, number>;
}

export function getActiveNotionDb(state: AppState): string {
  const trip = activeTrip(state);
  const appDb = String(state.notionDb || '').trim();
  if (state.personalNotionConnected === true && appDb && appDb !== DEFAULT_NOTION_DB) return appDb;
  return trip?.notionDb || appDb || DEFAULT_NOTION_DB;
}

function stateForReceiptNotion(state: AppState, receipt: Receipt): AppState {
  const trip = receipt.tripId
    ? (state.trips || []).find((candidate) => candidate.id === receipt.tripId)
    : undefined;
  if (!trip) return state;
  const appDb = String(state.notionDb || '').trim();
  const shouldKeepPersonalAppDb = state.personalNotionConnected === true && appDb && appDb !== DEFAULT_NOTION_DB;
  return {
    ...state,
    activeTripId: trip.id,
    notionDb: shouldKeepPersonalAppDb ? appDb : trip.notionDb || appDb || DEFAULT_NOTION_DB,
  };
}

let schemaCache: { db: string; map: SchemaMap; propertyTypes?: Record<string, string> } | null = null;
let schemaPromise: { db: string; promise: Promise<SchemaMap> } | null = null;
let lastMigratedDb: string | null = null;

function makeProxyUrl(proxy: string, target: string) {
  if (proxy.endsWith('=')) return proxy + encodeURIComponent(target);
  return proxy + target;
}

async function notionFetch<T>(state: AppState, path: string, init: RequestInit = {}): Promise<T> {
  const directToken = import.meta.env.DEV
    ? ((typeof window !== 'undefined' ? (window as any).DEV_SECRETS?.notionToken : '') || getDirectNotionToken())
    : '';
  const activeDb = getActiveNotionDb(state);
  if (directToken && !hasCredentialBrokerSession(state)) {
    if (!activeDb?.trim()) throw new Error('未設定 Notion DB ID');
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
  const userEmail = await currentSupabaseUserEmail();
  const isBoss = userEmail === 'vc06456@gmail.com';
  if (!isBoss && !hasCredentialBrokerSession(state) && state.personalNotionConnected !== true) {
    throw new Error('Credential Broker session 未連線；請先連接 Personal Notion notebook');
  }
  if (!activeDb?.trim()) throw new Error('未設定 Notion DB ID');
  return brokerNotionRequest<T>({ ...state, notionDb: activeDb }, path, init);
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
  const activeDb = getActiveNotionDb(state);
  if (schemaCache?.db === activeDb) return schemaCache.map;
  if (schemaPromise?.db === activeDb) return schemaPromise.promise;
  const promise = (async () => {
    const db = await notionFetch<{ properties?: Record<string, any> }>(state, `/databases/${activeDb}`, { method: 'GET' });
    const props = db.properties || {};
    const map: Partial<SchemaMap> = {};
    // Track which Notion property names have already been claimed so that no
    // two logical keys resolve to the same physical column.
    const usedPropNames = new Set<string>();

    // Resolution order matters: receipt-core fields first so trip-only fields
    // can't steal columns like 地區, 類別, etc.
    const resolutionOrder: (keyof typeof N)[] = [
      // 1. Identity / dedup
      'sourceId', 'objectType',
      // 2. Receipt core — the fields Boss actually sees
      'store', 'amount', 'date', 'time', 'cat', 'pay', 'region', 'address',
      'bookingRef', 'items', 'note', 'photoUrl', 'person', 'hkd', 'split',
      // 3. Multi-currency
      'currency', 'originalAmount', 'exchangeRate', 'mapUrl',
      // 4. Trip-specific
      'tripId', 'tripName', 'destination', 'startDate', 'endDate',
      'homeCurrency', 'tripCurrencies', 'timezones', 'tripVersion',
      'updatedAt', 'active', 'tripJson',
    ];

    for (const k of resolutionOrder) {
      const names = N[k];
      // 1. Exact name match — only consider names NOT already claimed
      let found: string | undefined;
      for (const name of names) {
        if (name in props && !usedPropNames.has(name)) {
          found = name;
          break;
        }
      }
      // 2. Type+pattern fallback for critical fields (only unclaimed props)
      if (!found) {
        const unclaimed = Object.entries(props).filter(([n]) => !usedPropNames.has(n));
        if (k === 'store') {
          found = unclaimed.find(([, p]) => p?.type === 'title')?.[0];
        } else if (k === 'amount') {
          found = unclaimed.find(([n, p]) =>
            (p?.type === 'number' || p?.type === 'formula') &&
            /金額|amount|price|cost|total|money|¥|💰|💴/i.test(n))?.[0];
        } else if (k === 'date') {
          found = unclaimed.find(([n, p]) =>
            p?.type === 'date' && /日期|date|📅/i.test(n))?.[0];
        } else if (k === 'hkd') {
          found = unclaimed.find(([n, p]) =>
            (p?.type === 'number' || p?.type === 'formula') &&
            /hkd|港幣|hk\s*\$/i.test(n))?.[0];
        } else if (k === 'originalAmount') {
          found = unclaimed.find(([n, p]) =>
            (p?.type === 'number' || p?.type === 'formula') &&
            /original|原價/i.test(n))?.[0];
        } else if (k === 'exchangeRate') {
          found = unclaimed.find(([n, p]) =>
            (p?.type === 'number' || p?.type === 'formula') &&
            /exchange|rate|匯率|汇率/i.test(n))?.[0];
        } else if (k === 'tripVersion') {
          found = unclaimed.find(([n, p]) =>
            (p?.type === 'number' || p?.type === 'formula') &&
            /version|版本/i.test(n))?.[0];
        } else if (k === 'active') {
          found = unclaimed.find(([n, p]) =>
            p?.type === 'checkbox' && /active|啟用|启用/i.test(n))?.[0];
        }
      }
      // 3. NO first-of-type fallback — it caused cross-contamination where
      //    cat/pay/split all resolved to the same select column, and
      //    region/items/note/person all resolved to the same rich_text column.
      //    If no match is found, use the canonical name (names[0]) which
      //    means pushes will create the column and pulls will return empty.
      map[k] = found || names[0];
      if (found) usedPropNames.add(found);
    }

    const propertyTypes: Record<string, string> = {};
    for (const [name, prop] of Object.entries(props)) {
      if (prop && (prop as any).type) {
        propertyTypes[name] = (prop as any).type;
      }
    }
    schemaCache = { db: activeDb, map: map as SchemaMap, propertyTypes };
    console.log('[notion] schema resolved:', JSON.stringify(map));
    return schemaCache.map;
  })();
  schemaPromise = { db: activeDb, promise };
  try {
    return await promise;
  } finally {
    if (schemaPromise?.promise === promise) schemaPromise = null;
  }
}

function propName(schema: SchemaMap, key: keyof typeof N) {
  return schema[key] || N[key][0];
}

function uniqueAliases(schema: Partial<SchemaMap> | null | undefined, key: keyof typeof N) {
  return Array.from(new Set([schema?.[key], ...N[key]].filter(Boolean) as string[]));
}

function unwrapProp(prop: any) {
  let current = prop;
  if (current?.type === 'formula' && current.formula) current = current.formula;
  if (current?.type === 'rollup' && current.rollup) {
    if (current.rollup.type === 'array' && current.rollup.array?.[0]) {
      const first = current.rollup.array[0];
      current = first.type === 'formula' ? first.formula : first;
    } else {
      current = current.rollup;
    }
  }
  return current;
}

function aliasEntries(props: Record<string, any>, key: keyof typeof N, schema?: SchemaMap) {
  return uniqueAliases(schema, key)
    .filter((name) => name in props)
    .map((name) => ({ name, prop: unwrapProp(props[name]) }));
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

  const photoCol = propName(schema, 'photoUrl');
  const photoType = schemaCache?.propertyTypes?.[photoCol];
  const photoProp = photoType === 'files'
    ? {
        files: receipt.notionFileUploadId
          ? [{ name: receipt.store || 'receipt', type: 'file_upload', file_upload: { id: receipt.notionFileUploadId } }]
          : receipt.photoUrl
          ? [{ name: receipt.store || 'receipt', type: 'external', external: { url: receipt.photoUrl } }]
          : []
      }
    : { url: receipt.photoUrl || null };

  const mapCol = propName(schema, 'mapUrl');
  const mapType = schemaCache?.propertyTypes?.[mapCol];
  const mapProp = mapType === 'files'
    ? {
        files: receipt.mapUrl
          ? [{ name: 'map', type: 'external', external: { url: receipt.mapUrl } }]
          : []
      }
    : { url: receipt.mapUrl || null };

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
    [photoCol]: photoProp,
    [propName(schema, 'person')]: { rich_text: [{ text: { content: person ? `${person.emoji} ${person.name}` : '' } }] },
    [propName(schema, 'sourceId')]: { rich_text: [{ text: { content: receipt.sourceId || receipt.id } }] },
    [propName(schema, 'hkd')]: { number: receipt.hkdAmount ?? hkd(receipt.total, state) },
    [propName(schema, 'split')]: { select: { name: receipt.splitMode === 'private' ? '🔒 私人' : '👫 共同' } },
    [propName(schema, 'tripId')]: { rich_text: [{ text: { content: receipt.tripId || activeTrip(state).id } }] },
    [propName(schema, 'tripVersion')]: { number: receipt.tripVersion || activeTrip(state).version },
    [propName(schema, 'currency')]: { select: { name: receipt.currency || receipt.originalCurrency || state.tripCurrency || 'JPY' } },
    [propName(schema, 'originalAmount')]: { number: Number(receipt.originalAmount ?? receipt.total) || 0 },
    [mapCol]: mapProp,
    [propName(schema, 'exchangeRate')]: { number: Number(receipt.exchangeRate) || 0 },
  };
}

async function findPageBySourceId(state: AppState, schema: SchemaMap, sourceId: string, tripId?: string): Promise<string | null> {
  const activeDb = getActiveNotionDb(state);
  const knownProps = schemaCache?.db === activeDb ? schemaCache.propertyTypes || {} : {};
  const existingAliases = uniqueAliases(schema, 'sourceId').filter((name) => name in knownProps);
  const aliases = existingAliases.length ? existingAliases : [propName(schema, 'sourceId')];
  const tripIdProp = propName(schema, 'tripId');
  const canFilterTrip = !!tripId && tripIdProp in knownProps;
  for (const name of aliases) {
    try {
      const sourceFilter = {
        property: name,
        rich_text: { equals: sourceId },
      };
      const response = await notionFetch<{ results?: Array<{ id: string }> }>(state, `/databases/${activeDb}/query`, {
        method: 'POST',
        body: JSON.stringify({
          page_size: 1,
          filter: canFilterTrip
            ? { and: [sourceFilter, { property: tripIdProp, rich_text: { equals: tripId } }] }
            : sourceFilter,
        }),
      });
      const id = response.results?.[0]?.id;
      if (id) return id;
    } catch (err) {
      // Mixed-schema databases can be missing one alias family entirely.
      // Ignore invalid-property errors and keep probing the other aliases.
      if (!/property|schema|unknown|does not exist/i.test(String((err as Error)?.message || ''))) throw err;
    }
  }
  return null;
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
  const entries = aliasEntries(props, key, schema);
  // Collect ALL matches — prefer the one that has actual content
  let firstMatch: any = undefined;
  for (const { prop } of entries) {
    if (!firstMatch) firstMatch = prop;
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

function readNumberValue(prop: any): number | undefined {
  if (!prop) return undefined;
  if (typeof prop.number === 'number') return prop.number;
  if (prop.formula?.type === 'number' && typeof prop.formula.number === 'number') return prop.formula.number;
  if (prop.rollup?.type === 'number' && typeof prop.rollup.number === 'number') return prop.rollup.number;
  const text = readAllText(prop, 'rich_text') || readAllText(prop, 'title') || '';
  const parsed = parseFloat(text.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readNumberProp(props: Record<string, any>, key: keyof typeof N, schema?: SchemaMap, options: ReadOptions = {}): number | undefined {
  const prop = readProp(props, key, schema);
  const direct = readNumberValue(prop);
  if (direct !== undefined) return direct;
  if (options.allowLoose === false) return undefined;
  // ULTRA FALLBACK: scan ALL properties when mapped property fails
  const isAmountLike = key === 'amount' || key === 'originalAmount';
  const isHkdLike = key === 'hkd';
  const isRateLike = key === 'exchangeRate';
  const isVersionLike = key === 'tripVersion';

  if (isAmountLike) {
    // Find any number/formula property with amount-related name
    for (const [name, p] of Object.entries(props)) {
      const val = p?.number ?? p?.formula?.number ?? p?.rollup?.number;
      if (typeof val === 'number' && val > 0 && /小計|amount|金額|price|cost|total|money|¥|💰|💴/i.test(name)) return val;
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

function readUrlProp(props: Record<string, any>, key: keyof typeof N, schema?: SchemaMap, options: ReadOptions = {}): string {
  const prop = readProp(props, key, schema);
  if (prop?.type === 'url' && prop.url) return prop.url;
  if (prop?.type === 'files' && prop.files?.[0]) return prop.files[0].external?.url || prop.files[0].file?.url || '';
  if (options.allowLoose === false) return '';
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

function readTextValue(prop: any): string {
  return readAllText(prop, 'rich_text') || readAllText(prop, 'title') || '';
}

function readRichTextProp(props: Record<string, any>, key: keyof typeof N, schema?: SchemaMap, options: ReadOptions = {}): string {
  const prop = readProp(props, key, schema);
  if (prop) {
    const text = readTextValue(prop);
    if (text) return text;
  }
  if (options.allowLoose === false) return '';
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

function readDateValue(prop: any): string | undefined {
  return prop?.date?.start;
}

function readDateProp(props: Record<string, any>, key: keyof typeof N, schema?: SchemaMap, options: ReadOptions = {}): string | undefined {
  const prop = readProp(props, key, schema);
  const direct = readDateValue(prop);
  if (direct) return direct;
  if (options.allowLoose === false) return undefined;
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

function readSelectValue(prop: any): string | undefined {
  return prop?.select?.name;
}

function readSelectProp(props: Record<string, any>, key: keyof typeof N, schema?: SchemaMap, options: ReadOptions = {}): string | undefined {
  const prop = readProp(props, key, schema);
  const direct = readSelectValue(prop);
  if (direct) return direct;
  if (options.allowLoose === false) return undefined;
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

function normalizeDiagnosticValue(mode: DuplicateMode, value: string | number | undefined) {
  if (value == null) return '';
  if (mode === 'number') return Number(value).toString();
  return String(value).trim();
}

function readDuplicateValue(props: Record<string, any>, name: string, mode: DuplicateMode) {
  const prop = unwrapProp(props[name]);
  if (!propHasContent(prop)) return undefined;
  if (mode === 'number') return readNumberValue(prop);
  if (mode === 'date') return readDateValue(prop);
  if (mode === 'select') return readSelectValue(prop);
  return readTextValue(prop) || undefined;
}

function receiptSkipReason(props: Record<string, any>, schema: SchemaMap) {
  const sourceId = readRichTextProp(props, 'sourceId', schema, { allowLoose: false });
  const storeTitle = readTitleProp(props, schema) || '';
  const objectType = readSelectProp(props, 'objectType', schema, { allowLoose: false }) || '';
  const cleanTitle = storeTitle.replace(/^⏳\s+/, '').trim();
  const rawItems = readRichTextProp(props, 'items', schema, { allowLoose: false });
  if (sourceId === '__meta_settings__' || storeTitle === '__meta_settings__' || storeTitle.includes('App Settings（請勿刪除）') || objectType === 'settings') return 'settings/meta row';
  if (objectType === 'trip') return 'trip row';
  if (cleanTitle.startsWith('🗓 行程更新：') || /\[行程更新\]/.test(rawItems) || /_iu_\d+$/.test(sourceId)) return 'itinerary update row';
  return null;
}

function collectDuplicateIssues(page: any, props: Record<string, any>, schema: SchemaMap): ReactMappingIssue[] {
  const title = readTitleProp(props, schema) || page.id;
  const specs: Array<{ field: string; key: keyof typeof N; mode: DuplicateMode }> = [
    { field: 'sourceId', key: 'sourceId', mode: 'text' },
    { field: 'amount', key: 'amount', mode: 'number' },
    { field: 'date', key: 'date', mode: 'date' },
    { field: 'category', key: 'cat', mode: 'select' },
    { field: 'payment', key: 'pay', mode: 'select' },
    { field: 'region', key: 'region', mode: 'text' },
    { field: 'items', key: 'items', mode: 'text' },
    { field: 'note', key: 'note', mode: 'text' },
    { field: 'hkd', key: 'hkd', mode: 'number' },
    { field: 'person', key: 'person', mode: 'text' },
  ];
  const issues: ReactMappingIssue[] = [];
  for (const spec of specs) {
    const values = uniqueAliases(schema, spec.key)
      .filter((name) => name in props)
      .map((name) => ({ name, value: readDuplicateValue(props, name, spec.mode) }))
      .filter((entry) => entry.value !== undefined && normalizeDiagnosticValue(spec.mode, entry.value) !== '');
    if (values.length < 2) continue;
    const distinct = new Map<string, { name: string; value: string | number | undefined }>();
    for (const entry of values) {
      const normalized = normalizeDiagnosticValue(spec.mode, entry.value);
      if (!distinct.has(normalized)) distinct.set(normalized, entry);
    }
    if (distinct.size > 1) {
      const sample = Array.from(distinct.values()).slice(0, 2);
      issues.push({
        pageId: page.id,
        title,
        kind: 'conflicting-duplicate',
        field: spec.field,
        detail: `${sample[0].name}=${sample[0].value} vs ${sample[1].name}=${sample[1].value}`,
      });
    } else {
      issues.push({
        pageId: page.id,
        title,
        kind: 'duplicate-family',
        field: spec.field,
        detail: values.map((entry) => entry.name).join(' / '),
      });
    }
  }
  return issues;
}

function normalizeSelectName(value: string): string {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '')
    .toLowerCase();
}

function categoryIdFromName(name: string): CategoryId {
  const normalized = normalizeSelectName(name);
  const aliases: Record<string, CategoryId> = {
    food: 'food',
    dining: 'food',
    restaurant: 'food',
    餐飲: 'food',
    餐饮: 'food',
    transport: 'transport',
    transit: 'transport',
    train: 'transport',
    交通: 'transport',
    shopping: 'shopping',
    購物: 'shopping',
    购物: 'shopping',
    lodging: 'lodging',
    hotel: 'lodging',
    accommodation: 'lodging',
    住宿: 'lodging',
    ticket: 'ticket',
    tickets: 'ticket',
    門票: 'ticket',
    门票: 'ticket',
    medicine: 'medicine',
    pharmacy: 'medicine',
    藥品: 'medicine',
    药品: 'medicine',
    localtour: 'localtour',
    tour: 'localtour',
    當地旅遊: 'localtour',
    当地旅游: 'localtour',
  };
  return CATEGORIES.find((c) => normalizeSelectName(c.name) === normalized || c.id === name)?.id
    || aliases[normalized]
    || 'other';
}

function paymentIdFromName(name: string): PaymentId {
  const normalized = normalizeSelectName(name);
  const aliases: Record<string, PaymentId> = {
    cash: 'cash',
    現金: 'cash',
    现金: 'cash',
    card: 'credit',
    credit: 'credit',
    creditcard: 'credit',
    信用卡: 'credit',
    paypay: 'paypay',
    suica: 'suica',
    iccard: 'suica',
  };
  return PAYMENTS.find((p) => normalizeSelectName(p.name) === normalized || p.id === name)?.id
    || aliases[normalized]
    || 'cash';
}

function personIdFromText(personText: string, persons: ReturnType<typeof getPersons>): string | undefined {
  const clean = personText.replace(/\p{Extended_Pictographic}/gu, '').normalize('NFKC').trim();
  return persons.find((p) => clean === p.name || clean === p.id)?.id
    || persons.find((p) => clean.includes(p.name))?.id
    || persons[0]?.id;
}

function parseStructuredNoteMeta(rawNote: string) {
  const text = String(rawNote || '').replace(/<br\s*\/?>/gi, '\n');
  const firstLineEnd = text.indexOf('\n');
  const firstLine = firstLineEnd >= 0 ? text.slice(0, firstLineEnd) : text;
  const parsed = { time: '', address: '', bookingRef: '', note: text };
  if (!/[📍🔖⏰]/.test(firstLine)) return parsed;
  const compactFirstLine = firstLine.replace(/\s+/g, ' ').trim();
  for (const chunk of firstLine.split(/\s*\|\s*/)) {
    const address = chunk.match(/^📍\s*(.+)$/);
    if (address) { parsed.address = address[1].trim(); continue; }
    const booking = chunk.match(/^🔖\s*(.+)$/);
    if (booking) { parsed.bookingRef = booking[1].trim(); continue; }
    const time = chunk.match(/^⏰\s*(\d{1,2}:\d{2})/);
    if (time) { parsed.time = time[1]; continue; }
  }
  if (!parsed.bookingRef) {
    const emailStyleRef = compactFirstLine.match(/\[\s*📧[^\]]*\]\s*([A-Z0-9-]{5,16})\b/i);
    const contextualRef = compactFirstLine.match(/\b(?:booking\s*ref(?:erence)?|booking|ref(?:erence)?|reservation|confirmation|order|預訂編號|預訂號碼|訂位編號|訂單編號|訂單號碼|予約番号)\s*[:#]?\s*([A-Z0-9-]{5,16})\b/i);
    const fallbackRef = emailStyleRef?.[1] || contextualRef?.[1] || '';
    if (fallbackRef && /[A-Z]/i.test(fallbackRef) && /\d/.test(fallbackRef)) {
      parsed.bookingRef = fallbackRef.trim().toUpperCase();
    }
  }
  parsed.note = firstLineEnd >= 0 ? text.slice(firstLineEnd + 1) : '';
  return parsed;
}

function receiptFromPage(state: AppState, page: any, schema: SchemaMap): Receipt | null {
  if (page.archived || page.in_trash) return null;
  const props = page.properties || {};
  if (receiptSkipReason(props, schema)) return null;
  const sourceId = readRichTextProp(props, 'sourceId', schema, { allowLoose: false });
  const catName = readSelectProp(props, 'cat', schema, { allowLoose: false }) || '';
  const payName = readSelectProp(props, 'pay', schema, { allowLoose: false }) || '';
  const personText = readRichTextProp(props, 'person', schema, { allowLoose: false });
  const rawNote = readRichTextProp(props, 'note', schema, { allowLoose: false });
  const rawItems = readRichTextProp(props, 'items', schema, { allowLoose: false });
  const parsedMeta = parseStructuredNoteMeta(rawNote);
  const persons = getPersons(state);
  const tripId = readRichTextProp(props, 'tripId', schema, { allowLoose: false }) || undefined;
  const appDb = String(state.notionDb || '').trim();
  if (state.personalNotionConnected === true && appDb && appDb !== DEFAULT_NOTION_DB) {
    const knownTripIds = new Set((state.trips || []).filter((trip) => !trip.archived).map((trip) => trip.id));
    if (!tripId || !knownTripIds.has(tripId)) return null;
  }
  const receipt: Receipt = {
    id: sourceId || `notion_${page.id}`,
    notionPageId: page.id,
    sourceId,
    store: readTitleProp(props, schema) || 'Notion 匯入',
    total: readNumberProp(props, 'amount', schema, { allowLoose: false }) ?? 0,
    date: readDateProp(props, 'date', schema, { allowLoose: false }) || state.tripDateRange.start,
    time: readRichTextProp(props, 'time', schema, { allowLoose: false }) || parsedMeta.time,
    category: categoryIdFromName(catName),
    payment: paymentIdFromName(payName),
    region: readRichTextProp(props, 'region', schema, { allowLoose: false }),
    address: readRichTextProp(props, 'address', schema, { allowLoose: false }) || parsedMeta.address,
    bookingRef: readRichTextProp(props, 'bookingRef', schema, { allowLoose: false }) || parsedMeta.bookingRef,
    itemsText: rawItems,
    note: parsedMeta.note,
    photoUrl: readUrlProp(props, 'photoUrl', schema, { allowLoose: false }),
    personId: personIdFromText(personText, persons),
    splitMode: String(readSelectProp(props, 'split', schema, { allowLoose: false }) || '').includes('私人') ? 'private' as const : 'shared' as const,
    source: 'notion',
    createdAt: page.created_time ? new Date(page.created_time).getTime() : Date.now(),
    updatedAt: page.last_edited_time ? new Date(page.last_edited_time).getTime() : undefined,
    tripId,
    tripVersion: readNumberProp(props, 'tripVersion', schema, { allowLoose: false }),
    originalAmount: readNumberProp(props, 'originalAmount', schema, { allowLoose: false }),
    originalCurrency: readSelectProp(props, 'currency', schema, { allowLoose: false }) || undefined,
    currency: readSelectProp(props, 'currency', schema, { allowLoose: false }) || undefined,
    hkdAmount: readNumberProp(props, 'hkd', schema, { allowLoose: false }),
    mapUrl: readUrlProp(props, 'mapUrl', schema, { allowLoose: false }),
    exchangeRate: readNumberProp(props, 'exchangeRate', schema, { allowLoose: false }),
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
  const activeDb = getActiveNotionDb(state);
  const db = await notionFetch<{ properties?: Record<string, { type: string }> }>(state, `/databases/${activeDb}`, { method: 'GET' });
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

export async function diagnoseReactReceiptMapping(state: AppState): Promise<ReactMappingDiagnostics> {
  const schema = await ensureSchema(state);
  const activeDb = getActiveNotionDb(state);
  const issues: ReactMappingIssue[] = [];
  const counts: Record<ReactMappingIssueKind, number> = {
    'duplicate-family': 0,
    'conflicting-duplicate': 0,
    'meta-fallback': 0,
    'skipped-row': 0,
  };
  let scanned = 0;
  let receiptCandidates = 0;
  let skipped = 0;
  let cursor: string | undefined;
  for (let i = 0; i < 20; i += 1) {
    const page = await notionFetch<{ results?: any[]; has_more?: boolean; next_cursor?: string }>(state, `/databases/${activeDb}/query`, {
      method: 'POST',
      body: JSON.stringify(cursor ? { page_size: 100, start_cursor: cursor } : { page_size: 100 }),
    });
    for (const item of page.results || []) {
      if (item.archived || item.in_trash) continue;
      scanned += 1;
      const props = item.properties || {};
      const title = readTitleProp(props, schema) || item.id;
      const skipReason = receiptSkipReason(props, schema);
      if (skipReason) {
        skipped += 1;
        issues.push({ pageId: item.id, title, kind: 'skipped-row', field: 'row', detail: skipReason });
        counts['skipped-row'] += 1;
        continue;
      }
      receiptCandidates += 1;
      const duplicateIssues = collectDuplicateIssues(item, props, schema);
      for (const issue of duplicateIssues) {
        issues.push(issue);
        counts[issue.kind] += 1;
      }
      const rawNote = readRichTextProp(props, 'note', schema, { allowLoose: false });
      const parsedMeta = parseStructuredNoteMeta(rawNote);
      const structuredChecks: Array<{ field: 'time' | 'address' | 'bookingRef'; current: string; fallback: string }> = [
        { field: 'time', current: readRichTextProp(props, 'time', schema, { allowLoose: false }), fallback: parsedMeta.time },
        { field: 'address', current: readRichTextProp(props, 'address', schema, { allowLoose: false }), fallback: parsedMeta.address },
        { field: 'bookingRef', current: readRichTextProp(props, 'bookingRef', schema, { allowLoose: false }), fallback: parsedMeta.bookingRef },
      ];
      for (const check of structuredChecks) {
        if (check.current || !check.fallback) continue;
        issues.push({
          pageId: item.id,
          title,
          kind: 'meta-fallback',
          field: check.field,
          detail: `Recovered from note meta: ${check.fallback}`,
        });
        counts['meta-fallback'] += 1;
      }
    }
    if (!page.has_more) break;
    cursor = page.next_cursor;
  }
  return { scanned, receiptCandidates, skipped, issues, counts };
}

export async function testNotion(state: AppState) {
  schemaCache = null;
  const schema = await ensureSchema(state);
  return Object.values(schema).join(', ');
}

export async function testDirectNotion(state: AppState): Promise<{ ok: boolean; count: number; firstTitle?: string; error?: string }> {
  const token = ((typeof window !== 'undefined' ? (window as any).DEV_SECRETS?.notionToken : '') || getDirectNotionToken());
  if (!token) return { ok: false, count: 0, error: 'No local dev Notion credential in window.DEV_SECRETS' };
  const dbId = getActiveNotionDb(state);
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
  const activeDb = getActiveNotionDb(state);
  const db = await notionFetch<{ properties?: Record<string, unknown> }>(state, `/databases/${activeDb}`, { method: 'GET' });
  const props = db.properties || {};
  
  const schema = await ensureSchema(state);
  const missing: Record<string, unknown> = {};
  
  const specs: Record<keyof typeof N, any> = {
    amount: { number: { format: 'yen' } },
    date: { date: {} },
    time: { rich_text: {} },
    cat: { select: { options: CATEGORIES.map((c) => ({ name: c.name, color: 'default' })) } },
    pay: { select: { options: PAYMENTS.map((p) => ({ name: p.name, color: 'default' })) } },
    region: { rich_text: {} },
    address: { rich_text: {} },
    bookingRef: { rich_text: {} },
    items: { rich_text: {} },
    note: { rich_text: {} },
    photoUrl: { url: {} },
    person: { rich_text: {} },
    sourceId: { rich_text: {} },
    hkd: { number: { format: 'hong_kong_dollar' } },
    split: { select: { options: [{ name: '👫 共同', color: 'blue' }, { name: '🔒 私人', color: 'red' }] } },
    objectType: { select: { options: [{ name: 'receipt', color: 'blue' }, { name: 'trip', color: 'green' }, { name: 'settings', color: 'gray' }] } },
    tripId: { rich_text: {} },
    tripName: { rich_text: {} },
    destination: { rich_text: {} },
    startDate: { date: {} },
    endDate: { date: {} },
    homeCurrency: { select: { options: [{ name: 'HKD', color: 'green' }] } },
    tripCurrencies: { rich_text: {} },
    timezones: { rich_text: {} },
    tripVersion: { number: { format: 'number' } },
    updatedAt: { date: {} },
    active: { checkbox: {} },
    tripJson: { rich_text: {} },
    currency: { select: { options: ['JPY', 'HKD', 'USD', 'KRW', 'TWD', 'CNY', 'EUR', 'GBP', 'AUD', 'SGD', 'THB', 'MYR', 'VND'].map((name) => ({ name, color: 'default' })) } },
    originalAmount: { number: { format: 'number' } },
    mapUrl: { url: {} },
    exchangeRate: { number: { format: 'number' } },
    store: null, // Title property cannot be created, DB always has one
  };

  for (const [key, spec] of Object.entries(specs)) {
    if (!spec) continue;
    const k = key as keyof typeof N;
    const mappedName = schema[k];
    if (!props[mappedName]) {
      missing[N[k][0]] = spec;
    }
  }

  if (!Object.keys(missing).length) {
    lastMigratedDb = activeDb;
    return 'Notion schema 已齊全';
  }
  await notionFetch(state, `/databases/${activeDb}`, { method: 'PATCH', body: JSON.stringify({ properties: missing }) });
  schemaCache = null;
  lastMigratedDb = activeDb;
  return `已新增 ${Object.keys(missing).length} 個欄位`;
}

async function ensureWritableSchema(state: AppState): Promise<SchemaMap> {
  const activeDb = getActiveNotionDb(state);
  if (lastMigratedDb !== activeDb) {
    await migrateNotionSchema(state).catch(() => {
      // If schema migration is not permitted, the caller will still get a clear
      // Notion error from the actual write path.
    });
    lastMigratedDb = activeDb;
  }
  return ensureSchema(state);
}

export async function createNotionDatabase(
  state: AppState,
  tripName: string,
  parentPageId: string,
  sourceSchema: Record<string, any>
): Promise<string> {
  const cleanProperties: Record<string, any> = {};
  for (const [name, prop] of Object.entries(sourceSchema)) {
    if (!prop || typeof prop !== 'object') continue;
    const type = (prop as any).type;
    if (type === 'title') {
      cleanProperties[name] = { title: {} };
      continue;
    }
    if (type === 'number') {
      cleanProperties[name] = { number: { format: (prop as any).number?.format || 'number' } };
    } else if (type === 'date') {
      cleanProperties[name] = { date: {} };
    } else if (type === 'rich_text') {
      cleanProperties[name] = { rich_text: {} };
    } else if (type === 'url') {
      cleanProperties[name] = { url: {} };
    } else if (type === 'checkbox') {
      cleanProperties[name] = { checkbox: {} };
    } else if (type === 'select') {
      const options = (prop as any).select?.options?.map((opt: any) => ({
        name: opt.name,
        color: opt.color || 'default'
      })) || [];
      cleanProperties[name] = { select: { options } };
    } else if (type === 'multi_select') {
      const options = (prop as any).multi_select?.options?.map((opt: any) => ({
        name: opt.name,
        color: opt.color || 'default'
      })) || [];
      cleanProperties[name] = { multi_select: { options } };
    }
  }

  const response = await notionFetch<{ id: string }>(state, '/databases', {
    method: 'POST',
    body: JSON.stringify({
      parent: { type: 'page_id', page_id: parentPageId },
      title: [{ type: 'text', text: { content: tripName } }],
      icon: { type: 'emoji', emoji: '✈️' },
      properties: cleanProperties,
    }),
  });

  return response.id;
}

export async function pushReceipt(state: AppState, receipt: Receipt): Promise<Receipt> {
  const notionState = stateForReceiptNotion(state, receipt);
  const activeDb = getActiveNotionDb(notionState);
  if (!activeDb) return receipt;

  // 1. Upload photo to Notion native storage first if we have a local thumb and haven't uploaded yet.
  if (receipt.photoThumb && !receipt.notionFileUploadId && !receipt.photoUrl) {
    try {
      console.log('[notionPush] Attempting Native Notion file upload via broker...');
      const safeName = (receipt.store || 'receipt').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
      const filename = `${safeName}_${receipt.date || 'nodate'}.jpg`;
      const up = await brokerNotionUploadFile(notionState, receipt.photoThumb, 'image/jpeg', filename);
      if (up?.fileUploadId) {
        receipt.notionFileUploadId = up.fileUploadId;
        receipt._photoSyncedToNotion = true;
        console.log('[notionPush] Native Notion upload succeeded:', up.fileUploadId);
      }
    } catch (e: any) {
      console.warn('[notionPush] Native Notion photo upload failed:', e.message || e);
    }
  }

  const schema = await ensureWritableSchema(notionState);
  const properties = buildProps(notionState, receipt, schema);
  const sourceId = receipt.sourceId || receipt.id;
  let pageId: string | null | undefined = receipt.notionPageId;

  if (pageId) {
    try {
      await notionFetch(notionState, `/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
    } catch (err: any) {
      if (!/404|Could not find page|invalid_request_url/.test(err.message || '')) throw err;
      pageId = null; // stale ID, fall through
    }
  }

  if (!pageId) pageId = await findPageBySourceId(notionState, schema, sourceId, receipt.tripId).catch(() => null);

  if (pageId) {
    await notionFetch(notionState, `/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
  } else {
    const page = await notionFetch<{ id: string }>(notionState, '/pages', {
      method: 'POST',
      body: JSON.stringify({ parent: { database_id: activeDb }, properties }),
    });
    pageId = page.id;
  }

  receipt.notionPageId = pageId || undefined;

  // 2. Append Image Block to Page Body for direct visualization in Notion App
  if (pageId) {
    if (receipt.photoThumb && !receipt._photoBodyBlockAdded) {
      try {
        console.log('[notionPush] Appending image block to page body...');
        const baseName = (receipt.store || 'receipt').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
        const fileName = `${baseName}_${receipt.date || 'nodate'}_page.jpg`;
        const bodyUp = await brokerNotionUploadFile(notionState, receipt.photoThumb, 'image/jpeg', fileName);
        if (bodyUp?.fileUploadId) {
          await notionFetch(notionState, `/blocks/${pageId}/children`, {
            method: 'PATCH',
            body: JSON.stringify({
              children: [{
                object: 'block',
                type: 'image',
                image: { type: 'file_upload', file_upload: { id: bodyUp.fileUploadId } }
              }]
            })
          });
          receipt._photoBodyBlockAdded = true;
          console.log('[notionPush] Native body image block added successfully.');
        }
      } catch (e: any) {
        console.warn('[notionPush] could not append photo block to page body:', e.message || e);
      }
    } else if (receipt.photoUrl && !receipt._photoBodyBlockAdded) {
      try {
        console.log('[notionPush] Appending external image block to page body...');
        await notionFetch(notionState, `/blocks/${pageId}/children`, {
          method: 'PATCH',
          body: JSON.stringify({
            children: [{
              object: 'block',
              type: 'image',
              image: { type: 'external', external: { url: receipt.photoUrl } }
            }]
          })
        });
        receipt._photoBodyBlockAdded = true;
        console.log('[notionPush] External body image block added successfully.');
      } catch (e: any) {
        console.warn('[notionPush] could not append external photo block to page body:', e.message || e);
      }
    }
  }

  return receipt;
}

export async function pushTripPage(state: AppState, trip: TripProfile): Promise<TripProfile> {
  const activeDb = getActiveNotionDb(state);
  if (!activeDb) return trip;
  
  let currentTrip = { ...trip };
  
  // 如果該旅程沒有 Notion Database ID，則自動在 parent page 下面克隆創建一個
  if (!currentTrip.notionDb) {
    const templateDb = state.notionDb || DEFAULT_NOTION_DB;
    try {
      console.log(`[notion] 正在為旅程「${currentTrip.name}」在背景自動創建 Notion Database...`);
      const dbMeta = await notionFetch<{ parent?: { page_id?: string }; properties?: Record<string, any> }>(
        state,
        `/databases/${templateDb}`,
        { method: 'GET' }
      );
      
      const parentPageId = dbMeta.parent?.page_id;
      if (!parentPageId) {
        throw new Error('無法獲取 Notion DB 的 parent page_id，無法自動創表');
      }
      
      const newDbId = await createNotionDatabase(
        state,
        currentTrip.name,
        parentPageId,
        dbMeta.properties || {}
      );
      
      console.log(`[notion] 自動創表成功！新 DB ID: ${newDbId}`);
      currentTrip.notionDb = newDbId;
    } catch (e: any) {
      console.warn('[notion] 自動創建 Notion Database 失敗，將會 fallback 使用預設 Database:', e.message || e);
      currentTrip.notionDb = templateDb;
    }
  }

  const tripDb = currentTrip.notionDb || activeDb;
  const tempState = { 
    ...state, 
    notionDb: tripDb, 
    trips: state.trips?.map((t) => t.id === currentTrip.id ? currentTrip : t) 
  };
  
  const schema = await ensureWritableSchema(tempState);
  const properties = buildTripProps(currentTrip, schema);
  const sourceId = currentTrip.sourceId || `trip_${currentTrip.id}`;
  let pageId: string | null | undefined = currentTrip.notionPageId;

  if (pageId) {
    try {
      await notionFetch(tempState, `/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
      return { ...currentTrip, notionPageId: pageId };
    } catch (err: any) {
      if (!/404|Could not find page|invalid_request_url/.test(err.message || '')) throw err;
      pageId = null; // stale ID, fall through
    }
  }

  if (!pageId) pageId = await findPageBySourceId(tempState, schema, sourceId).catch(() => null);

  if (pageId) {
    await notionFetch(tempState, `/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
    return { ...currentTrip, notionPageId: pageId };
  }

  const page = await notionFetch<{ id: string }>(tempState, '/pages', {
    method: 'POST',
    body: JSON.stringify({ parent: { database_id: tripDb }, properties }),
  });
  
  return { ...currentTrip, notionPageId: page.id };
}

export async function pushSettingsMeta(state: AppState): Promise<void> {
  const activeDb = getActiveNotionDb(state);
  if (!activeDb) return;
  const schema = await ensureWritableSchema(state);
  const payload = {
    budget: state.budget,
    rate: state.rate,
    tripCurrency: state.tripCurrency,
    autoSync: state.autoSync,
    activeTripId: state.activeTripId,
    trips: (state.trips || []).map((trip) => ({
      ...trip,
      sourceId: trip.sourceId || `trip_${trip.id}`,
    })),
    persons: state.persons,
    shareRatios: state.shareRatios,
    itineraryOverrides: state.itineraryOverrides || {},
    settingsUpdatedAt: state.settingsUpdatedAt || Date.now(),
    scanModel: state.scanModel,
    voiceModel: state.voiceModel,
    emailModel: state.emailModel,
    tripUpdateModel: state.tripUpdateModel,
    googleBackupModel: state.googleBackupModel,
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
    body: JSON.stringify({ parent: { database_id: activeDb }, properties }),
  });
}

export async function pullSettingsMeta(state: AppState): Promise<Partial<AppState> | null> {
  const activeDb = getActiveNotionDb(state);
  if (!activeDb) return null;
  const schema = await ensureSchema(state);
  const pageId = await findPageBySourceId(state, schema, '__meta_settings__').catch(() => null);
  if (!pageId) return null;
  try {
    const page = await notionFetch<{ properties?: Record<string, any> }>(state, `/pages/${pageId}`, { method: 'GET' });
    const props = page.properties || {};
    const rawNote = readAllText(readProp(props, 'note', schema), 'rich_text');
    if (rawNote && rawNote.trim().startsWith('{')) {
      const payload = JSON.parse(rawNote);
      return normalizeAiModelSettings({
        budget: payload.budget,
        rate: payload.rate,
        tripCurrency: payload.tripCurrency,
        autoSync: payload.autoSync,
        activeTripId: payload.activeTripId,
        trips: Array.isArray(payload.trips) ? payload.trips : undefined,
        persons: payload.persons,
        shareRatios: payload.shareRatios,
        itineraryOverrides: payload.itineraryOverrides || {},
        settingsUpdatedAt: payload.settingsUpdatedAt || payload.updatedAt || Date.now(),
        scanModel: payload.scanModel,
        voiceModel: payload.voiceModel,
        emailModel: payload.emailModel,
        tripUpdateModel: payload.tripUpdateModel,
        googleBackupModel: payload.googleBackupModel,
      });
    }
  } catch (err) {
    console.warn('[notion] pullSettingsMeta failed:', err);
  }
  return null;
}

export async function archiveReceipt(state: AppState, receipt: Receipt) {
  const notionState = stateForReceiptNotion(state, receipt);
  const activeDb = getActiveNotionDb(notionState);
  if (!activeDb) return;
  const schema = await ensureWritableSchema(notionState);
  const pageId = receipt.notionPageId || await findPageBySourceId(notionState, schema, receipt.sourceId || receipt.id, receipt.tripId).catch(() => null);
  if (!pageId) return;
  await notionFetch(notionState, `/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) });
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
  const activeDb = getActiveNotionDb(state);
  if (!activeDb) return [];
  const schema = await ensureSchema(state);
  const rows: Receipt[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i += 1) {
    const page = await notionFetch<{ results?: any[]; has_more?: boolean; next_cursor?: string }>(state, `/databases/${activeDb}/query`, {
      method: 'POST',
      body: JSON.stringify(cursor ? { page_size: 100, start_cursor: cursor } : { page_size: 100 }),
    });
    for (const item of page.results || []) {
      const receipt = receiptFromPage(state, item, schema);
      if (
        receipt
        && !isReceiptTombstoned(state, receipt)
      ) rows.push(receipt);
    }
    if (!page.has_more) break;
    cursor = page.next_cursor;
  }
  return rows;
}

export async function pullTrips(state: AppState): Promise<TripProfile[]> {
  const activeDb = getActiveNotionDb(state);
  if (!activeDb) return [];
  const schema = await ensureSchema(state);
  const rows: TripProfile[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i += 1) {
    const page = await notionFetch<{ results?: any[]; has_more?: boolean; next_cursor?: string }>(state, `/databases/${activeDb}/query`, {
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
