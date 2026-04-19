import type { Receipt } from './types';
import { CATEGORIES, DEFAULT_PROXY, NOTION_PROPS, NOTION_VERSION, PAYMENTS } from './constants';

interface NotionConfig {
  token: string;
  db: string;
  proxy?: string;
}

let _schemaCache: Record<string, string> | null = null;

function makeProxyUrl(proxy: string, url: string): string {
  return proxy.endsWith('=') ? proxy + encodeURIComponent(url) : proxy + url;
}

async function notionFetch(
  path: string,
  options: RequestInit,
  cfg: NotionConfig,
): Promise<any> {
  if (!cfg.token) throw new Error('未設定 Notion token');
  if (!cfg.db) throw new Error('未設定 Notion DB ID');
  const target = 'https://api.notion.com/v1' + path;
  const proxyCandidates = [
    cfg.proxy || DEFAULT_PROXY,
    'https://corsproxy.io/?url=',
  ].filter((p, i, a) => p && a.indexOf(p) === i) as string[];
  const headers = {
    Authorization: 'Bearer ' + cfg.token,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  let lastErr: Error | null = null;
  for (const proxy of proxyCandidates) {
    try {
      const r = await fetch(makeProxyUrl(proxy, target), { ...options, headers });
      if (!r.ok) {
        const body = await r.text();
        if (r.status >= 400 && r.status < 500) {
          if ([401, 403, 404].includes(r.status)) _schemaCache = null;
          throw new Error(`Notion ${r.status}: ${body.slice(0, 200)}`);
        }
        throw new Error(`Proxy ${r.status}: ${body.slice(0, 150)}`);
      }
      return r.json();
    } catch (e) {
      lastErr = e as Error;
      if (lastErr.message?.startsWith('Notion 4')) throw lastErr;
    }
  }
  throw lastErr || new Error('Notion fetch 失敗');
}

async function ensureSchema(cfg: NotionConfig): Promise<Record<string, string>> {
  if (_schemaCache) return _schemaCache;
  const db = await notionFetch(`/databases/${cfg.db}`, { method: 'GET' }, cfg);
  const existing = db.properties || {};
  const cache: Record<string, string> = {};
  for (const [key, [newName, oldName]] of Object.entries(NOTION_PROPS)) {
    cache[key] = existing[newName] ? newName : existing[oldName] ? oldName : newName;
  }
  _schemaCache = cache;
  return cache;
}

export function clearNotionSchemaCache() {
  _schemaCache = null;
}

function buildProps(r: Receipt, schemaMap: Record<string, string>) {
  const cat = CATEGORIES[r.category];
  const pay = PAYMENTS[r.payment];
  const nm = (k: string) => schemaMap[k] || NOTION_PROPS[k][0];
  const props: Record<string, any> = {
    [nm('store')]: { title: [{ text: { content: (r.store || '未命名').slice(0, 200) } }] },
    [nm('amount')]: { number: Number(r.total) || 0 },
    [nm('date')]: { date: { start: r.date } },
    [nm('cat')]: { select: { name: cat?.name || '其他' } },
    [nm('pay')]: { select: { name: pay?.name || '現金' } },
    [nm('region')]: { rich_text: [{ text: { content: (r.region || '').slice(0, 2000) } }] },
    [nm('items')]: { rich_text: [{ text: { content: (r.itemsText || '').slice(0, 2000) } }] },
    [nm('note')]: { rich_text: [{ text: { content: (r.note || '').slice(0, 2000) } }] },
    [nm('sourceId')]: { rich_text: [{ text: { content: r.id } }] },
  };
  if (r.hkd != null) props[nm('hkd')] = { number: Number(r.hkd) };
  if (r.tax != null) props[nm('tax')] = { number: Number(r.tax) };
  if (r.subtotal != null) props[nm('subtotal')] = { number: Number(r.subtotal) };
  return props;
}

function extractText(rt: any): string {
  if (!Array.isArray(rt)) return '';
  return rt.map((x: any) => x?.plain_text || x?.text?.content || '').join('');
}

export async function notionPushReceipt(r: Receipt, cfg: NotionConfig): Promise<Receipt> {
  const schemaMap = await ensureSchema(cfg);
  const props = buildProps(r, schemaMap);
  if (r.notionPageId) {
    try {
      await notionFetch(
        `/pages/${r.notionPageId}`,
        { method: 'PATCH', body: JSON.stringify({ properties: props }) },
        cfg,
      );
      return r;
    } catch (e) {
      // 404 → page deleted in Notion; fall through to create
      if (!/Notion 404/.test((e as Error).message)) throw e;
    }
  }
  const page = await notionFetch(
    `/pages`,
    {
      method: 'POST',
      body: JSON.stringify({
        parent: { database_id: cfg.db },
        properties: props,
      }),
    },
    cfg,
  );
  return { ...r, notionPageId: page.id };
}

export async function notionArchivePage(
  pageId: string,
  cfg: NotionConfig,
): Promise<void> {
  await notionFetch(
    `/pages/${pageId}`,
    { method: 'PATCH', body: JSON.stringify({ archived: true }) },
    cfg,
  );
}

/**
 * Fetch all non-archived pages from the Notion DB and return as Receipt[].
 * Uses SourceID rich_text field as the primary ID when present, otherwise Notion page_id.
 */
export async function notionPullAll(cfg: NotionConfig): Promise<Receipt[]> {
  const schemaMap = await ensureSchema(cfg);
  const out: Receipt[] = [];
  let cursor: string | undefined = undefined;
  for (let i = 0; i < 10; i++) {
    const body: any = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const page = await notionFetch(
      `/databases/${cfg.db}/query`,
      { method: 'POST', body: JSON.stringify(body) },
      cfg,
    );
    for (const p of page.results || []) {
      if (p.archived) continue;
      const props = p.properties || {};
      const get = (k: string) => props[schemaMap[k] || NOTION_PROPS[k][0]];
      const storeProp = get('store');
      const store = extractText(storeProp?.title) || '未命名';
      const total = Number(get('amount')?.number ?? 0);
      const date = get('date')?.date?.start || new Date().toISOString().slice(0, 10);
      const catName = get('cat')?.select?.name || '其他';
      const payName = get('pay')?.select?.name || '現金';
      const catId = findByName(CATEGORIES, catName) || 'other';
      const payId = findByName(PAYMENTS, payName) || 'cash';
      const sourceId = extractText(get('sourceId')?.rich_text) || p.id;
      out.push({
        id: sourceId,
        store,
        total: Math.round(total),
        subtotal: get('subtotal')?.number ?? null,
        tax: get('tax')?.number ?? null,
        hkd: get('hkd')?.number ?? null,
        date,
        category: catId as Receipt['category'],
        payment: payId as Receipt['payment'],
        region: extractText(get('region')?.rich_text) || undefined,
        itemsText: extractText(get('items')?.rich_text) || undefined,
        note: extractText(get('note')?.rich_text) || undefined,
        createdAt: new Date(p.created_time || Date.now()).getTime(),
        notionPageId: p.id,
      });
    }
    if (!page.has_more) break;
    cursor = page.next_cursor;
  }
  return out;
}

function findByName<T extends Record<string, { name: string }>>(
  map: T,
  name: string,
): keyof T | null {
  for (const [k, v] of Object.entries(map)) if (v.name === name) return k as keyof T;
  return null;
}
