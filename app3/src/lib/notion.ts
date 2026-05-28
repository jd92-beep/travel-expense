import type { Receipt } from './types';
import { CATEGORY_MAP, PAYMENT_MAP } from './constants';

const NOTION_VERSION = '2022-06-28';

function headers(token: string) {
  return {
    'Authorization': `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

function buildProperties(r: Receipt) {
  const cat = CATEGORY_MAP[r.category];
  const pay = PAYMENT_MAP[r.payment];
  return {
    '店名': { title: [{ text: { content: r.store } }] },
    '金額': { number: r.total },
    '日期': { date: { start: r.date } },
    '類別': { select: { name: cat?.label ?? r.category } },
    '支付': { select: { name: pay?.label ?? r.payment } },
    '地區': { rich_text: [{ text: { content: r.region ?? '' } }] },
    '品項': { rich_text: [{ text: { content: r.itemsText ?? '' } }] },
    '備註': { rich_text: [{ text: { content: r.note ?? '' } }] },
    'SourceID': { rich_text: [{ text: { content: r.id } }] },
  };
}

export async function notionPushReceipt(
  receipt: Receipt,
  token: string,
  dbId: string,
  proxy: string,
): Promise<string> {
  const proxyUrl = (url: string) => proxy ? proxy + encodeURIComponent(url) : url;

  if (receipt.notionPageId) {
    // Update existing
    const res = await fetch(proxyUrl(`https://api.notion.com/v1/pages/${receipt.notionPageId}`), {
      method: 'PATCH',
      headers: headers(token),
      body: JSON.stringify({ properties: buildProperties(receipt) }),
    });
    if (!res.ok) throw new Error(`Notion update failed: ${res.status}`);
    return receipt.notionPageId;
  } else {
    // Create new
    const res = await fetch(proxyUrl('https://api.notion.com/v1/pages'), {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: buildProperties(receipt),
      }),
    });
    if (!res.ok) throw new Error(`Notion create failed: ${res.status}`);
    const data = await res.json() as { id: string };
    return data.id;
  }
}

export async function notionPullAll(
  token: string,
  dbId: string,
  proxy: string,
): Promise<Receipt[]> {
  const proxyUrl = (url: string) => proxy ? proxy + encodeURIComponent(url) : url;
  const res = await fetch(proxyUrl(`https://api.notion.com/v1/databases/${dbId}/query`), {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ page_size: 100 }),
  });
  if (!res.ok) throw new Error(`Notion pull failed: ${res.status}`);
  const data = await res.json() as { results: Array<{ id: string; properties: Record<string, unknown> }> };

  return data.results.map(page => {
    const p = page.properties as Record<string, {
      title?: Array<{ plain_text: string }>;
      number?: number;
      date?: { start: string };
      select?: { name: string };
      rich_text?: Array<{ plain_text: string }>;
    }>;
    const sourceId = p['SourceID']?.rich_text?.[0]?.plain_text ?? `notion_${page.id}`;
    return {
      id: sourceId,
      store: p['店名']?.title?.[0]?.plain_text ?? '',
      total: p['金額']?.number ?? 0,
      date: p['日期']?.date?.start ?? '',
      category: 'other' as const,
      payment: 'cash' as const,
      region: p['地區']?.rich_text?.[0]?.plain_text,
      itemsText: p['品項']?.rich_text?.[0]?.plain_text,
      note: p['備註']?.rich_text?.[0]?.plain_text,
      notionPageId: page.id,
      createdAt: Date.now(),
    } as Receipt;
  });
}
