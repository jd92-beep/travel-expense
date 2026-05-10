import { activeTrip, normalizeItinerary, tripFromLegacyState } from '../domain/trip/normalize';
import { brokerAiJson, hasCredentialBrokerSession, testProviderConnection } from './credentialBroker';
import { DEFAULT_GOOGLE_BACKUP_MODEL } from './constants';
import type { AppState, CategoryId, ItineraryDay, PaymentId, Receipt, TripDraft, TripProfile } from './types';

const KIMI_API_MODEL = 'kimi-for-coding';
const KIMI_NON_THINKING = { type: 'disabled' } as const;

function isKimiModel(model?: string): boolean {
  return /kimi/i.test(String(model || ''));
}

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!match) throw new Error('AI 回覆唔係 JSON');
    return JSON.parse(match[1]);
  }
}

function slug(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'trip';
}

function validCategory(value: unknown): CategoryId {
  const v = String(value || '').toLowerCase();
  if (['flight', 'transport', 'food', 'shopping', 'lodging', 'ticket', 'localtour', 'medicine', 'other'].includes(v)) return v as CategoryId;
  if (/hotel|住宿|旅館/.test(v)) return 'lodging';
  if (/train|jr|bus|交通|車|機場/.test(v)) return 'transport';
  if (/food|餐|食|便利店|拉麵/.test(v)) return 'food';
  return 'other';
}

function validPayment(value: unknown): PaymentId {
  const v = String(value || '').toLowerCase();
  if (['cash', 'credit', 'paypay', 'suica'].includes(v)) return v as PaymentId;
  if (/card|visa|master|信用/.test(v)) return 'credit';
  if (/suica|ic/.test(v)) return 'suica';
  if (/paypay/.test(v)) return 'paypay';
  return 'cash';
}

function ymdFromText(text: string, fallback: string): string {
  const iso = text.match(/20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/);
  if (iso) {
    const [y, m, d] = iso[0].split(/[-/.]/);
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const md = text.match(/(\d{1,2})\s*[月/]\s*(\d{1,2})\s*(?:日)?/);
  if (md) return `${(fallback || '').slice(0, 4)}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')}`;
  return fallback;
}

function amountCandidatesFromText(text: string): number[] {
  const candidates: number[] = [];
  const pushAmount = (value: string) => {
    const amount = Number(value.replace(/,/g, ''));
    if (Number.isFinite(amount) && amount > 0) candidates.push(amount);
  };

  const currencyPatterns = [
    /(?:¥|JPY|円|yen|蚊|HKD|港幣|\$)\s*([0-9][0-9,]*(?:\.\d+)?)/gi,
    /([0-9][0-9,]*(?:\.\d+)?)\s*(?:円|yen|jpy|蚊|hkd|港幣)/gi,
  ];
  for (const pattern of currencyPatterns) {
    for (const match of text.matchAll(pattern)) pushAmount(match[1]);
  }
  if (candidates.length) return candidates;

  for (const match of text.matchAll(/\b([0-9][0-9,]{1,8}(?:\.\d+)?)\b/g)) {
    const index = match.index ?? 0;
    const before = text[index - 1] || '';
    const after = text[index + match[0].length] || '';
    if (/[-/:]/.test(before) || /[-/:]/.test(after)) continue;
    pushAmount(match[1]);
  }
  return candidates;
}

export function heuristicReceiptFromText(text: string, state: AppState): Receipt {
  const amount = amountCandidatesFromText(text);
  const total = amount.length ? amount[amount.length - 1] : 0;
  let category: CategoryId = 'other';
  if (/機票|航班|flight|airport|機場/i.test(text)) category = 'flight';
  else if (/酒店|hotel|住宿|旅館/i.test(text)) category = 'lodging';
  else if (/餐|食|飯|拉麵|壽司|便利店|family|lawson|7-?11/i.test(text)) category = 'food';
  else if (/jr|新幹線|地鐵|巴士|的士|taxi|train|交通/i.test(text)) category = 'transport';
  else if (/藥|藥妝|drug/i.test(text)) category = 'medicine';
  else if (/門票|ticket|入場/i.test(text)) category = 'ticket';
  else if (/買|購物|shop|mall/i.test(text)) category = 'shopping';

  const storeMatch = text.match(/(?:喺|係|at|from)\s*([^，,。.\n]{2,30})/i);
  const firstLine = text.split(/\n|。|，|,/).find(Boolean)?.trim();
  const timeMatch = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const bookingMatch = text.match(/\b(?:booking|ref|予約|編號|訂單)[\s:#-]*([A-Z0-9-]{5,})/i);
  return {
    id: `text_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    store: storeMatch?.[1]?.trim() || firstLine || '文字匯入',
    total,
    date: ymdFromText(text, state.tripDateRange.start),
    time: timeMatch ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}` : '',
    bookingRef: bookingMatch?.[1] || '',
    category,
    payment: /card|credit|visa|信用|master/i.test(text) ? 'credit' : /suica|ic/i.test(text) ? 'suica' : /paypay/i.test(text) ? 'paypay' : 'cash',
    personId: state.persons?.[0]?.id || '',
    splitMode: 'shared',
    note: text.slice(0, 500),
    source: 'react-text',
    createdAt: Date.now(),
  };
}

export async function fileToBase64(file: File): Promise<{ base64: string; mime: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('讀取圖片失敗'));
    reader.readAsDataURL(file);
  });
  const [, meta = '', body = ''] = dataUrl.match(/^data:([^;]+);base64,(.*)$/) || [];
  return { base64: body, mime: meta || file.type || 'image/jpeg' };
}

async function listGoogleModels(state: AppState): Promise<string[]> {
  if (!hasCredentialBrokerSession(state)) throw new Error('Credential Broker session 未連線');
  await testProviderConnection(state, 'google');
  return [state.googleBackupModel || DEFAULT_GOOGLE_BACKUP_MODEL];
}

async function googleModelForRequest(state: AppState): Promise<string> {
  const requested = String(state.googleBackupModel || DEFAULT_GOOGLE_BACKUP_MODEL).replace(/^models\//, '');
  const models = await listGoogleModels(state);
  return models.includes(requested)
    ? requested
    : models.find((id) => /gemma/i.test(id)) || models.find((id) => /flash|pro|gemini/i.test(id)) || requested;
}

async function callGoogleJson(state: AppState, prompt: string, kind: 'scan' | 'voice' | 'email' | 'trip', image?: { base64: string; mime: string }) {
  await googleModelForRequest(state);
  return brokerAiJson(state, 'google', prompt, kind, image);
}

async function callKimiJson(state: AppState, prompt: string, kind: 'scan' | 'voice' | 'email' | 'trip', image?: { base64: string; mime: string }) {
  void KIMI_API_MODEL;
  void KIMI_NON_THINKING;
  return brokerAiJson(state, 'kimi', prompt, kind, image);
}

async function callPreferredJson(state: AppState, prompt: string, kind: 'scan' | 'voice' | 'email' | 'trip', image?: { base64: string; mime: string }) {
  const model = kind === 'scan' ? state.scanModel : kind === 'voice' ? state.voiceModel : kind === 'email' ? state.emailModel : state.tripUpdateModel;
  const attempts = isKimiModel(model)
    ? [
        () => callKimiJson(state, prompt, kind, image),
        () => callGoogleJson(state, prompt, kind, image),
      ]
    : [
        () => callGoogleJson(state, prompt, kind, image),
        () => callKimiJson(state, prompt, kind, image),
      ];
  let last: unknown;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export async function testKimiConnection(state: AppState): Promise<string> {
  await testProviderConnection(state, 'kimi');
  return 'Kimi / kimi-code 連線正常';
}

export async function testGoogleBackupConnection(state: AppState): Promise<string> {
  const requested = String(state.googleBackupModel || 'gemma-3-27b-it').replace(/^models\//, '');
  const available = await listGoogleModels(state);
  const selected = available.includes(requested)
    ? requested
    : available.find((id) => /gemma/i.test(id)) || available.find((id) => /flash|pro|gemini/i.test(id));
  if (!selected) throw new Error('Google API key 可用，但搵唔到可 generateContent 嘅 model');
  return available.includes(requested)
    ? `Google backup 可用：${selected}`
    : `指定 backup model 未喺 models.list 出現，會暫用：${selected}`;
}

export async function scanReceiptImage(file: File, state: AppState): Promise<Receipt> {
  const image = await fileToBase64(file);
  const prompt = `Read this Japanese travel receipt and return JSON only:
{"store":string,"total":number,"date":"YYYY-MM-DD","time":"HH:MM","address":string,"bookingRef":string,"category":"flight|transport|food|shopping|lodging|ticket|localtour|medicine|other","payment":"cash|credit|paypay|suica","itemsText":string,"note":string}
Use ${state.tripDateRange.start} if the year is missing.`;
  const parsed = await callPreferredJson(state, prompt, 'scan', image) as Partial<Receipt>;
  return {
    id: `scan_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    store: String(parsed.store || file.name.replace(/\.[^.]+$/, '') || '掃描收據'),
    total: Number(parsed.total) || 0,
    date: ymdFromText(String(parsed.date || ''), state.tripDateRange.start),
    time: String(parsed.time || ''),
    address: String(parsed.address || ''),
    bookingRef: String(parsed.bookingRef || ''),
    category: validCategory(parsed.category),
    payment: validPayment(parsed.payment),
    itemsText: String(parsed.itemsText || ''),
    note: String(parsed.note || ''),
    personId: state.persons?.[0]?.id || '',
    splitMode: 'shared',
    source: 'react-ocr',
    createdAt: Date.now(),
  };
}

export async function parseTextWithAi(text: string, state: AppState, source: string): Promise<Receipt[]> {
  const prompt = `Extract travel expense receipts from the text. Return JSON array only.
Each item: {"store":string,"total":number,"date":"YYYY-MM-DD","time":"HH:MM","address":string,"bookingRef":string,"category":"flight|transport|food|shopping|lodging|ticket|localtour|medicine|other","payment":"cash|credit|paypay|suica","itemsText":string,"note":string}
TEXT:
${text.slice(0, 12000)}`;
  let parsed: unknown;
  try {
    parsed = await callPreferredJson(state, prompt, source.includes('voice') ? 'voice' : 'email');
  } catch (error) {
    return [{
      ...heuristicReceiptFromText(text, state),
      source,
      note: `${text.slice(0, 450)}\n\nAI fallback: ${error instanceof Error ? error.message : String(error)}`,
    }];
  }
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows.map((row, i) => {
    const r = row as Partial<Receipt>;
    return {
      id: `${source}_${Date.now()}_${i}_${Math.random().toString(16).slice(2)}`,
      store: String(r.store || '文字匯入'),
      total: Number(r.total) || 0,
      date: ymdFromText(String(r.date || ''), state.tripDateRange.start),
      time: String(r.time || ''),
      address: String(r.address || ''),
      bookingRef: String(r.bookingRef || ''),
      category: validCategory(r.category),
      payment: validPayment(r.payment),
      itemsText: String(r.itemsText || ''),
      note: String(r.note || ''),
      personId: state.persons?.[0]?.id || '',
      splitMode: 'shared',
      source,
      createdAt: Date.now(),
    };
  });
}

function normalizeTripDraft(raw: unknown, state: AppState, paragraph: string): TripDraft {
  const current = activeTrip(state);
  const value = raw && typeof raw === 'object' ? raw as Partial<TripDraft> & { trip?: Partial<TripProfile>; itinerary?: ItineraryDay[] } : {};
  const tripValue: Partial<TripProfile> = value.trip || {};
  const itinerary = Array.isArray(tripValue.itinerary) && tripValue.itinerary.length
    ? tripValue.itinerary
    : Array.isArray(value.itinerary) && value.itinerary.length
      ? value.itinerary
      : current.itinerary;
  const startDate = String(tripValue.startDate || itinerary[0]?.date || current.startDate || state.tripDateRange.start);
  const endDate = String(tripValue.endDate || itinerary[itinerary.length - 1]?.date || current.endDate || state.tripDateRange.end);
  const destinationSummary = String(tripValue.destinationSummary || value.summary || itinerary.map((day: ItineraryDay) => day.region).slice(0, 6).join(' / ') || current.destinationSummary || '未設定目的地');
  const isNewTrip = startDate !== current.startDate || endDate !== current.endDate || !destinationSummary.includes(current.destinationSummary.slice(0, 6));
  const tripId = isNewTrip
    ? `trip_${startDate.replace(/-/g, '')}_${slug(destinationSummary)}`
    : current.id;
  const currencies = Array.from(new Set([
    'HKD',
    ...(Array.isArray(tripValue.currencies) ? tripValue.currencies : []),
    state.tripCurrency || current.currencies?.[1] || 'JPY',
  ].map(String).filter(Boolean)));
  const normalizedItinerary = normalizeItinerary(itinerary, tripId, currencies.find((code) => code !== 'HKD') || state.tripCurrency || 'JPY');
  const trip: TripProfile = {
    ...current,
    ...tripValue,
    id: tripId,
    name: String(tripValue.name || (isNewTrip ? destinationSummary : current.name) || '新旅程').slice(0, 80),
    destinationSummary,
    startDate,
    endDate,
    homeCurrency: String(tripValue.homeCurrency || current.homeCurrency || 'HKD'),
    currencies,
    timezones: Array.from(new Set(normalizedItinerary.map((day) => day.timezone || 'Asia/Hong_Kong'))),
    version: isNewTrip ? 1 : current.version + 1,
    active: true,
    archived: false,
    itinerary: normalizedItinerary,
    sourceId: `trip_${tripId}`,
    createdAt: isNewTrip ? Date.now() : current.createdAt,
    updatedAt: Date.now(),
  };
  return {
    trip,
    summary: String(value.summary || `已分析 ${paragraph.slice(0, 80)}`),
    warnings: Array.isArray(value.warnings) ? value.warnings.map(String) : [],
    changes: Array.isArray(value.changes) ? value.changes.map(String) : [
      isNewTrip ? '偵測到新日期或新目的地，建議建立新旅程。' : '偵測為現有旅程更新，會套用版本更新。',
    ],
  };
}

export async function parseTripParagraph(paragraph: string, state: AppState): Promise<TripDraft> {
  const current = activeTrip(state);
  const prompt = `Analyze this travel itinerary paragraph and return JSON only.
Current trip JSON:
${JSON.stringify({
  id: current.id,
  name: current.name,
  startDate: current.startDate,
  endDate: current.endDate,
  destinationSummary: current.destinationSummary,
  itinerary: current.itinerary,
}).slice(0, 12000)}

Return:
{"trip":{"name":string,"destinationSummary":string,"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","homeCurrency":"HKD","currencies":string[],"itinerary":[{"date":"YYYY-MM-DD","day":number,"region":string,"city":string,"country":string,"timezone":string,"currency":string,"highlight":string,"lodging":{"name":string,"address":string,"mapUrl":string,"checkIn":string,"checkOut":string},"spots":[{"time":"HH:MM","name":string,"type":"flight|transport|food|shopping|lodging|ticket|localtour|medicine|other|sightseeing","address":string,"mapUrl":string,"note":string,"timezone":string,"lat":number,"lon":number}]}]},"summary":string,"warnings":string[],"changes":string[]}
Include lodging, arrival times, places, Google Maps links when inferable from input. Do not invent API keys.

USER PARAGRAPH:
${paragraph.slice(0, 14000)}`;
  try {
    return normalizeTripDraft(await callPreferredJson(state, prompt, 'trip'), state, paragraph);
  } catch (error) {
    const fallback = tripFromLegacyState({
      ...state,
      tripName: current.name,
      tripDateRange: { start: current.startDate, end: current.endDate },
      customItinerary: current.itinerary,
    });
    return {
      trip: { ...fallback, version: current.version + 1, updatedAt: Date.now() },
      summary: 'AI 暫時未能完整分析，已保留現有旅程供手動修改。',
      warnings: [error instanceof Error ? error.message : String(error)],
      changes: ['沒有自動套用新資料。'],
    };
  }
}
