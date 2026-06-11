import { activeTrip, normalizeItinerary, normalizeTripIntelligence, tripFromLegacyState } from '../domain/trip/normalize';
import { tripIntelligencePromptContract } from '../domain/trip/context';
import { brokerAiJson, brokerTripIntelligence, hasCredentialBrokerSession, testProviderConnection } from './credentialBroker';
import { DEFAULT_GOOGLE_BACKUP_MODEL, DEFAULT_KIMI_PRIMARY_MODEL_ID } from './constants';
import type { AppState, CategoryId, ItineraryDay, PaymentId, Receipt, TripDraft, TripExtractionReport, TripIntelligence, TripProfile } from './types';
import { compressPhoto, prepareForOCR } from './domain';
import { currentSupabaseAccessToken } from './supabase';

const KIMI_API_MODEL = DEFAULT_KIMI_PRIMARY_MODEL_ID.replace(/^kimi\//, '');
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
  const hasSession = hasCredentialBrokerSession(state);
  const supabaseToken = await currentSupabaseAccessToken();
  if (!hasSession && !supabaseToken) {
    throw new Error('Credential Broker 或 Supabase session 未連線');
  }
  if (hasSession) {
    await testProviderConnection(state, 'google');
  }
  return [state.googleBackupModel || DEFAULT_GOOGLE_BACKUP_MODEL];
}

async function googleModelForRequest(state: AppState): Promise<string> {
  const requested = String(state.googleBackupModel || DEFAULT_GOOGLE_BACKUP_MODEL).replace(/^models\//, '');
  const models = await listGoogleModels(state);
  return models.includes(requested)
    ? requested
    : models.find((id) => /gemma/i.test(id)) || models.find((id) => /flash|pro|gemini/i.test(id)) || requested;
}

interface ModelAttempt {
  provider: 'kimi' | 'google' | 'mimo';
  model?: string;
  label: string;
}

function sameModelAttempt(a: ModelAttempt, b: ModelAttempt): boolean {
  return a.provider === b.provider && (a.model || '') === (b.model || '');
}

function isQuotaOrRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /(?:\b429\b|quota|daily limit|rate limit|too many requests|用量|配額|限額)/i.test(message);
}

function isBrokerRouteUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /(?:\b404\b|not found|route|endpoint|Network error)/i.test(message);
}

function hasUsefulTripItinerary(draft: TripDraft): boolean {
  return Array.isArray(draft.trip.itinerary)
    && draft.trip.itinerary.some((day) => (day.spots || []).some((spot) => String(spot.name || '').trim()));
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function normalizeSourceQuality(value: unknown): TripExtractionReport['sourceQuality'] {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'medium';
}

function buildTripExtractionReport(raw: unknown, trip: TripProfile): TripExtractionReport {
  const report = raw && typeof raw === 'object' ? raw as Partial<TripExtractionReport> & Record<string, unknown> : {};
  const days = trip.itinerary || [];
  const spots = days.flatMap((day) => day.spots || []);
  const hotels = new Set<string>();
  const restaurants = new Set<string>();
  const transports = new Set<string>();
  const important = new Set<string>();
  const missing = new Set<string>(asStringList(report.missingCriticalFields));

  for (const day of days) {
    if (!day.date) missing.add('day.date');
    if (!day.region) missing.add(`day ${day.day || '?'} region`);
    if (!day.city) missing.add(`day ${day.day || '?'} city`);
    if (!day.country) missing.add(`day ${day.day || '?'} country`);
    if (!day.timezone) missing.add(`day ${day.day || '?'} timezone`);
    if (!day.currency) missing.add(`day ${day.day || '?'} currency`);
    if (day.highlight) important.add(day.highlight);
    if (day.lodging?.name) {
      hotels.add(day.lodging.name);
      if (!day.lodging.address && !day.lodging.mapUrl) missing.add(`${day.lodging.name} address/mapUrl`);
    }
    for (const spot of day.spots || []) {
      const name = String(spot.name || '').trim();
      if (!name) continue;
      if (spot.type === 'lodging' || /hotel|酒店|住宿|旅館/i.test(name)) hotels.add(name);
      if (spot.type === 'food' || /restaurant|cafe|餐|飯|食|咖啡|壽司|拉麵|bbq/i.test(name)) restaurants.add(name);
      if (spot.type === 'flight' || spot.type === 'transport') transports.add(name);
      if (spot.note || spot.address || spot.mapUrl || spot.bookingRef || spot.time || spot.sourceText) important.add(name);
      if (!spot.time) missing.add(`${name} time`);
      if (!spot.address && !spot.mapUrl && (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lon))) {
        missing.add(`${name} location detail`);
      }
    }
  }

  if (!days.length) missing.add('itinerary days');
  if (!spots.length) missing.add('itinerary spots');

  return {
    daysExtracted: Number(report.daysExtracted ?? report.dayCount) || days.length,
    spotsExtracted: Number(report.spotsExtracted ?? report.spotCount) || spots.filter((spot) => String(spot.name || '').trim()).length,
    hotelsExtracted: Number(report.hotelsExtracted ?? report.hotelCount) || hotels.size,
    restaurantsExtracted: Number(report.restaurantsExtracted ?? report.restaurantCount) || restaurants.size,
    transportsExtracted: Number(report.transportsExtracted ?? report.transportCount) || transports.size,
    importantDetailsExtracted: Number(report.importantDetailsExtracted ?? report.detailCount) || important.size,
    sourceQuality: normalizeSourceQuality(report.sourceQuality),
    missingCriticalFields: Array.from(missing).slice(0, 20),
    assumptions: asStringList(report.assumptions),
    warnings: asStringList(report.warnings),
  };
}

function selectedModelAttempt(chosenModelId: string): ModelAttempt | null {
  if (!chosenModelId) return null;
  const parts = chosenModelId.split('/');
  if (parts.length === 2) {
    const provider = parts[0] as 'kimi' | 'google' | 'mimo';
    return {
      provider,
      model: parts[1],
      label: `${provider === 'kimi' ? 'Kimi' : provider === 'mimo' ? 'Mimo' : 'Google'} (${parts[1]}) [Selected]`,
    };
  }
  if (/kimi/i.test(chosenModelId)) {
    return { provider: 'kimi', model: chosenModelId, label: `Kimi (${chosenModelId}) [Selected]` };
  }
  if (/mimo/i.test(chosenModelId)) {
    return { provider: 'mimo', model: chosenModelId, label: `Mimo (${chosenModelId}) [Selected]` };
  }
  return { provider: 'google', model: chosenModelId, label: `Google (${chosenModelId}) [Selected]` };
}

function modelAttemptsForKind(state: AppState, kind: 'scan' | 'voice' | 'email' | 'trip'): ModelAttempt[] {
  const chosenModelId = kind === 'scan'
    ? state.scanModel || ''
    : kind === 'voice'
      ? state.voiceModel || ''
      : kind === 'email'
        ? state.emailModel || ''
        : state.tripUpdateModel || DEFAULT_KIMI_PRIMARY_MODEL_ID;
  const preferredAttempt = selectedModelAttempt(chosenModelId);
  const requiredPrimary: ModelAttempt = kind === 'email'
    ? { provider: 'kimi', model: KIMI_API_MODEL, label: 'Kimi kimi-code (Required Primary)' }
    : kind === 'trip'
      ? preferredAttempt || { provider: 'kimi', model: KIMI_API_MODEL, label: 'Kimi kimi-code (Trip Update Primary)' }
      : { provider: 'google', model: DEFAULT_GOOGLE_BACKUP_MODEL, label: 'Google Gemma 4 31B (Required Primary)' };
  const baseAttempts: ModelAttempt[] = kind === 'email' || kind === 'trip'
    ? [
        { provider: 'mimo', model: 'mimo-v2.5', label: 'Mimo v2.5 (1st Fallback)' },
        { provider: 'kimi', model: KIMI_API_MODEL, label: 'Kimi kimi-code (2nd Fallback)' },
        { provider: 'google', model: DEFAULT_GOOGLE_BACKUP_MODEL, label: 'Google Gemma 4 31B (3rd Fallback)' },
        { provider: 'google', model: 'gemini-3.1-flash', label: 'Google Gemini 3.1 Flash (4th Fallback)' },
        { provider: 'google', model: 'gemini-3.1-flash-lite', label: 'Google Gemini 3.1 Flash Lite (5th Fallback)' },
      ]
    : [
        { provider: 'mimo', model: 'mimo-v2.5', label: 'Mimo v2.5 (1st Fallback)' },
        { provider: 'google', model: DEFAULT_GOOGLE_BACKUP_MODEL, label: 'Google Gemma 4 31B (2nd Fallback)' },
        { provider: 'kimi', model: KIMI_API_MODEL, label: 'Kimi kimi-code (3rd Fallback)' },
        { provider: 'google', model: 'gemma-4-26b', label: 'Google Gemma 4 26B (4th Fallback)' },
      ];

  const attempts: ModelAttempt[] = [requiredPrimary];
  if (kind !== 'trip' && preferredAttempt && !sameModelAttempt(requiredPrimary, preferredAttempt)) {
    attempts.push(preferredAttempt);
  }
  for (const base of baseAttempts) {
    if (!attempts.some((attempt) => sameModelAttempt(base, attempt))) attempts.push(base);
  }
  return attempts;
}

async function callModelAttemptJson(
  state: AppState,
  attempt: ModelAttempt,
  prompt: string,
  kind: 'scan' | 'voice' | 'email' | 'trip',
  image?: { base64: string; mime: string },
) {
  if (attempt.provider === 'kimi') return callKimiJson(state, prompt, kind, image, attempt.model);
  if (attempt.provider === 'mimo') return callMimoJson(state, prompt, kind, image, attempt.model);
  return callGoogleJson(state, prompt, kind, image, attempt.model);
}

async function callGoogleJson(
  state: AppState,
  prompt: string,
  kind: 'scan' | 'voice' | 'email' | 'trip',
  image?: { base64: string; mime: string },
  overrideModel?: string
) {
  return brokerAiJson(state, 'google', prompt, kind, image, overrideModel);
}

async function callKimiJson(
  state: AppState,
  prompt: string,
  kind: 'scan' | 'voice' | 'email' | 'trip',
  image?: { base64: string; mime: string },
  overrideModel?: string
) {
  void KIMI_API_MODEL;
  void KIMI_NON_THINKING;
  return brokerAiJson(state, 'kimi', prompt, kind, image, overrideModel);
}

async function callMimoJson(
  state: AppState,
  prompt: string,
  kind: 'scan' | 'voice' | 'email' | 'trip',
  image?: { base64: string; mime: string },
  overrideModel?: string
) {
  return brokerAiJson(state, 'mimo', prompt, kind, image, overrideModel);
}

async function callPreferredJson(
  state: AppState,
  prompt: string,
  kind: 'scan' | 'voice' | 'email' | 'trip',
  image?: { base64: string; mime: string }
) {
  const attempts = modelAttemptsForKind(state, kind);
  let last: unknown;
  for (const attempt of attempts) {
    try {
      console.log(`[AI Routing] 正在嘗試調用: ${attempt.label}...`);
      return await callModelAttemptJson(state, attempt, prompt, kind, image);
    } catch (error) {
      console.warn(`[AI Routing] ${attempt.label} 嘗試失敗:`, error);
      last = error;
      if (isQuotaOrRateLimitError(error)) {
        throw error instanceof Error ? error : new Error(String(error));
      }
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}


export async function testKimiConnection(state: AppState): Promise<string> {
  await testProviderConnection(state, 'kimi');
  return 'Kimi / kimi-code 連線正常';
}

export async function testGoogleBackupConnection(state: AppState): Promise<string> {
  const requested = String(state.googleBackupModel || DEFAULT_GOOGLE_BACKUP_MODEL).replace(/^models\//, '');
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
  // Prepare for OCR (resize large image to avoid timeout and save token)
  const imageForOCR = await prepareForOCR(image.base64, image.mime);

  // Compress for local thumbnail storage (480px JPEG, ~30KB)
  const photoThumb = await compressPhoto(image.base64, image.mime, 480);

  const prompt = `Read this Japanese travel receipt and return JSON only:
{"store":string,"total":number,"date":"YYYY-MM-DD","time":"HH:MM","address":string,"bookingRef":string,"category":"flight|transport|food|shopping|lodging|ticket|localtour|medicine|other","payment":"cash|credit|paypay|suica","itemsText":string,"note":string}
Use ${state.tripDateRange.start} if the year is missing.`;
  const parsed = await callPreferredJson(state, prompt, 'scan', imageForOCR) as Partial<Receipt>;
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
    photoThumb: photoThumb || undefined,
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
  const value = raw && typeof raw === 'object' ? raw as Partial<TripDraft> & { trip?: Partial<TripProfile>; itinerary?: ItineraryDay[]; intelligence?: Partial<TripIntelligence>; extractionReport?: unknown } : {};
  const tripValue: Partial<TripProfile> = value.trip || {};
  const itineraryProvided = Array.isArray(tripValue.itinerary)
    ? tripValue.itinerary
    : Array.isArray(value.itinerary)
      ? value.itinerary
      : null;
  const itinerary = itineraryProvided || [];
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
  const primaryCurrency = currencies.find((code) => code !== 'HKD') || state.tripCurrency || 'JPY';
  const intelligence = normalizeTripIntelligence(
    tripValue.intelligence || value.intelligence,
    destinationSummary,
    primaryCurrency,
    normalizedItinerary[0]?.timezone || current.timezones?.[0] || 'Asia/Hong_Kong',
  );
  const trip: TripProfile = {
    ...current,
    ...tripValue,
    id: tripId,
    name: String(tripValue.name || (isNewTrip ? destinationSummary : current.name) || '新旅程').slice(0, 80),
    destinationSummary,
    startDate,
    endDate,
    // Explicitly coerce budget — LLM may return string/undefined/null; preserve current budget if AI doesn't provide one
    budget: Math.max(0, Number(tripValue.budget ?? current.budget) || 0),
    homeCurrency: String(tripValue.homeCurrency || current.homeCurrency || 'HKD'),
    currencies,
    timezones: Array.from(new Set(normalizedItinerary.map((day) => day.timezone || 'Asia/Hong_Kong'))),
    intelligence: { ...intelligence, source: tripValue.intelligence || value.intelligence ? 'ai' : intelligence.source },
    version: isNewTrip ? 1 : current.version + 1,
    active: true,
    archived: false,
    itinerary: normalizedItinerary,
    sourceId: `trip_${tripId}`,
    createdAt: isNewTrip ? Date.now() : current.createdAt,
    updatedAt: Date.now(),
  };
  const extractionReport = buildTripExtractionReport(value.extractionReport, trip);
  return {
    trip,
    summary: String(value.summary || `已分析 ${paragraph.slice(0, 80)}`),
    warnings: [
      ...(Array.isArray(value.warnings) ? value.warnings.map(String) : []),
      ...extractionReport.warnings,
    ].filter(Boolean),
    changes: Array.isArray(value.changes) ? value.changes.map(String) : [
      isNewTrip ? '偵測到新日期或新目的地，建議建立新旅程。' : '偵測為現有旅程更新，會套用版本更新。',
    ],
    extractionReport,
  };
}

export async function parseTripParagraph(paragraph: string, state: AppState): Promise<TripDraft> {
  const current = activeTrip(state);
  const currentTrip = {
    id: current.id,
    name: current.name,
    startDate: current.startDate,
    endDate: current.endDate,
    destinationSummary: current.destinationSummary,
    itinerary: current.itinerary,
  };
  const prompt = `Analyze this travel itinerary paragraph and return JSON only.
${tripIntelligencePromptContract()}
Current trip JSON:
${JSON.stringify(currentTrip).slice(0, 12000)}

Return:
{"trip":{"name":string,"destinationSummary":string,"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","homeCurrency":"HKD","currencies":string[],"intelligence":{"countryCode":"JP|KR|TW|GB|EU|HK|CN|SG|TH|MY|VN|PH|AU|NZ|US|GLOBAL","countryName":string,"primaryCurrency":string,"themeKey":"japan_washi|korea_editorial|taiwan_nightmarket|europe_rail|global_journal","locale":string,"timezone":string,"weatherRegion":string,"confidence":"low|medium|high"},"itinerary":[{"date":"YYYY-MM-DD","day":number,"region":string,"city":string,"country":string,"timezone":string,"currency":string,"highlight":string,"lodging":{"name":string,"address":string,"mapUrl":string,"checkIn":string,"checkOut":string,"bookingRef":string,"lat":number,"lon":number,"sourceText":string,"confidence":"low|medium|high"},"spots":[{"time":"HH:MM","timeEnd":"HH:MM","name":string,"type":"flight|transport|food|shopping|lodging|ticket|localtour|medicine|other|sightseeing","address":string,"mapUrl":string,"note":string,"timezone":string,"lat":number,"lon":number,"bookingRef":string,"sourceText":string,"confidence":"low|medium|high"}]}]},"extractionReport":{"daysExtracted":number,"spotsExtracted":number,"hotelsExtracted":number,"restaurantsExtracted":number,"transportsExtracted":number,"importantDetailsExtracted":number,"sourceQuality":"low|medium|high","missingCriticalFields":string[],"assumptions":string[],"warnings":string[]},"summary":string,"warnings":string[],"changes":string[]}
Include lodging, arrival times, places, restaurants, transport/flight/train references, booking references, Google Maps links, addresses, and coordinates when inferable from input. Do not invent API keys.
If exact coordinates are uncertain, omit lat/lon and add the place to extractionReport.missingCriticalFields or assumptions instead of guessing.
If the user text does not contain a new itinerary, return an empty itinerary and explain missingCriticalFields; do not copy Current trip JSON as a successful extraction.
Choose themeKey from destination context: Japan=japan_washi, Korea=korea_editorial, Taiwan=taiwan_nightmarket, Europe/UK=europe_rail, unknown=global_journal.

USER PARAGRAPH:
${paragraph.slice(0, 14000)}`;
  try {
    const warnings: string[] = [];
    const attempts = modelAttemptsForKind(state, 'trip');
    let last: unknown;
    for (const [index, attempt] of attempts.entries()) {
      try {
        console.log(`[AI Routing] 正在嘗試行程更新: ${attempt.label}...`);
        const selectedKimiTripPrimary = index === 0 && attempt.provider === 'kimi' && isKimiModel(`${attempt.provider}/${attempt.model || ''}`);
        let parsed: unknown;
        if (selectedKimiTripPrimary) {
          try {
            parsed = await brokerTripIntelligence(state, {
              paragraph: paragraph.slice(0, 14000),
              currentTrip,
              model: attempt.model || KIMI_API_MODEL,
            });
          } catch (brokerError) {
            if (isQuotaOrRateLimitError(brokerError)) throw brokerError;
            warnings.push(brokerError instanceof Error ? brokerError.message : String(brokerError));
            const routeLabel = isBrokerRouteUnavailable(brokerError) ? 'backend unavailable' : 'structured route failed';
            console.warn(`[AI Routing] Trip intelligence ${attempt.label} ${routeLabel}, trying same model JSON route:`, brokerError);
          }
          if (!parsed) {
            parsed = await callModelAttemptJson(state, attempt, prompt, 'trip');
          }
        } else {
          parsed = await callModelAttemptJson(state, attempt, prompt, 'trip');
        }
        const draft = normalizeTripDraft(parsed, state, paragraph);
        if (hasUsefulTripItinerary(draft)) {
          return {
            ...draft,
            warnings: [...warnings, ...draft.warnings].filter(Boolean),
          };
        }
        warnings.push(`${attempt.label} returned no usable itinerary spots.`);
        console.warn(`[AI Routing] ${attempt.label} returned no usable itinerary spots; trying next trip model.`);
      } catch (error) {
        if (isQuotaOrRateLimitError(error)) throw error;
        last = error;
        warnings.push(error instanceof Error ? error.message : String(error));
        const routeLabel = isBrokerRouteUnavailable(error) ? 'backend unavailable' : 'attempt failed';
        console.warn(`[AI Routing] Trip update ${attempt.label} ${routeLabel}, trying next model:`, error);
      }
    }
    throw new Error([...warnings, last instanceof Error ? last.message : '', 'All trip LLM attempts returned no usable itinerary spots.'].filter(Boolean).join(' | '));
  } catch (error) {
    if (isQuotaOrRateLimitError(error)) throw error instanceof Error ? error : new Error(String(error));
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
