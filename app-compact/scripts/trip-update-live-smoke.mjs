import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_BROKER_URL = 'https://travel-expense-credential-broker.ftjdfr.workers.dev';
const DEFAULT_ORIGIN = 'https://travel-expense-compact.netlify.app';
const DEFAULT_SESSION_FILE = path.resolve(process.cwd(), '.broker-vault-session.local.json');
const SESSION_HEADER = 'X-Travel-Session';
const SUPABASE_AUTH_HEADER = 'X-Supabase-Auth';

const brokerUrl = (process.env.COMPACT_BROKER_URL || DEFAULT_BROKER_URL).replace(/\/+$/, '');
const origin = process.env.COMPACT_BROKER_ORIGIN || DEFAULT_ORIGIN;
const sessionFile = process.env.COMPACT_BROKER_VAULT_SESSION_FILE || DEFAULT_SESSION_FILE;
const model = process.env.COMPACT_TRIP_UPDATE_LIVE_MODEL || 'gemini-3.1-flash-lite';
const provider = process.env.COMPACT_TRIP_UPDATE_LIVE_PROVIDER || (model.startsWith('mimo') ? 'mimo' : 'google');
const maxDurationMs = Number(process.env.COMPACT_TRIP_UPDATE_LIVE_MAX_MS || 25_000);

const sensitivePatterns = [
  /sk-[A-Za-z0-9_-]{12,}/,
  /ntn_[A-Za-z0-9]{12,}/,
  /secret_[A-Za-z0-9]{12,}/,
  /AIza[0-9A-Za-z_-]{12,}/,
  /Bearer\s+[A-Za-z0-9._-]+/i,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
];

function assertNoSensitiveText(label, text) {
  for (const pattern of sensitivePatterns) {
    if (pattern.test(text)) throw new Error(`${label} contained sensitive-looking text`);
  }
}

function redactedError(error) {
  return String(error?.message || error || 'Unknown error')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[redacted-key]')
    .replace(/ntn_[A-Za-z0-9]{12,}/g, '[redacted-token]')
    .replace(/secret_[A-Za-z0-9]{12,}/g, '[redacted-token]')
    .replace(/AIza[0-9A-Za-z_-]{12,}/g, '[redacted-key]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g, '[redacted-session]');
}

async function readJsonFile(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    assertNoSensitiveText('session file path', filePath);
    return JSON.parse(text);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(`Unable to read local broker vault session file: ${redactedError(error)}`);
  }
}

async function loadAuthInput() {
  const fileInput = await readJsonFile(sessionFile);
  const session = process.env.COMPACT_BROKER_VAULT_SESSION
    || fileInput?.credentialSession
    || fileInput?.session
    || '';
  const supabaseToken = process.env.COMPACT_BROKER_VAULT_SUPABASE_TOKEN
    || fileInput?.supabaseAccessToken
    || fileInput?.supabaseToken
    || '';
  const expiresAt = Number(process.env.COMPACT_BROKER_VAULT_SESSION_EXPIRES_AT
    || fileInput?.credentialSessionExpiresAt
    || fileInput?.expiresAt
    || 0);
  return {
    mode: session ? 'broker-session' : supabaseToken ? 'supabase-token' : 'missing',
    session,
    supabaseToken,
    expiresAt,
    source: fileInput ? path.basename(sessionFile) : 'environment',
  };
}

function sampleItinerary() {
  return [
    'Day 1｜6月13日｜到步＋西線入住｜住 Hotel Fine Jeju',
    '06:30 抵達濟州機場',
    '09:45 道頭洞彩虹海岸道路＋石頭爺爺麥當勞',
    '11:15 午餐：李春玉元祖鯖魚包飯',
    '14:00 Osulloc Tea Museum',
    '19:00 晚餐：Chilsimni-ro 或酒店附近',
    'Day 2｜6月14日｜南部花景＋西歸浦｜住 Hotel Fine Jeju',
    '10:30 Camellia Hill 山茶花之丘',
    '12:30 午餐：風爐 풍로 西歸浦黑豬肉',
    '15:15 休愛里自然公園',
    '18:15 偶來市場晚餐／甜點',
    'Day 3｜6月15日｜牛島＋城山日出峰｜住 Hotel Fine Jeju',
    '09:00 城山浦港買船票 / 排隊',
    '10:00 BLANC ROCHER',
    '13:15 午餐：On-Off / Rodem Garden / 牛島炸醬麵',
    '17:00 城山日出峰',
    'Day 4｜6月16日｜牛沼端＋Aqua Planet｜住 Hotel Fine Jeju',
    '09:40 牛沼端 木舟及木筏',
    '13:00 Aqua Planet Jeju 入場',
    '17:20 cafe layered / 或直接 Audrant',
    'Day 5｜6月17日｜退房＋9.81 Park＋涯月｜住 Stanford',
    '11:30 9.81 Park Jeju',
    '15:00 Haejigae Cafe / Aewol The Sunset / BOMNAL',
    '18:30 晚餐：Flowave',
    'Day 6｜6月18日｜舊濟州市購物＋東門市場｜住 Stanford',
    '10:45 七星路購物街',
    '12:45 東門市場午餐掃街',
    '15:15 Moodjeju 貝殼小店',
    '19:30 晚餐：安頓黑豬 Omakase',
    'Day 7｜6月19日｜新濟州＋蓮洞採購日｜住 Stanford',
    '09:00 早餐：姐妹麵條 자매국수',
    '10:30 E-Mart Sinjeju Branch',
    '12:00 Lotte Mart Jeju Store',
    '15:15 新羅免稅店',
    '19:30 晚餐：Chita 炸雞外賣',
    'Day 8｜6月20日｜涯月慢遊＋機場回程',
    '11:00 Aewol The Sunset / 涯月海邊咖啡街',
    '14:30 Late lunch：Baro Pig’s Feet 豬腳 / 薯仔排骨湯',
    '18:45 抵達濟州機場',
    '21:30 濟州起飛',
  ].join('\n');
}

function buildOrganizePrompt() {
  return `Read and understand this travel itinerary text, then return JSON only.
This is stage 1 of a two-stage Trip Update workflow. Do not extract app fields yet.
Rewrite the trip into your own organizedItinerary: a clean canonical itinerary grouped day-by-day with dates, lodging, transport, meals, attractions, shopping, optional notes, timing, and important constraints.
The organizedItinerary must be your own rewritten version, not a copy-paste of the raw input.
Return {"organizedItinerary":string,"summary":string,"warnings":string[],"assumptions":string[]}
USER PARAGRAPH:
${sampleItinerary()}`;
}

function buildExtractionPrompt(organizedItinerary) {
  return `Extract app-ready trip data from this canonical itinerary and return JSON only.
This is stage 2 of a two-stage Trip Update workflow.
Use only CANONICAL ORGANIZED ITINERARY below as the source of truth for trip.itinerary.
Return {"organizedItinerary":string,"trip":{"name":string,"destinationSummary":string,"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","homeCurrency":"HKD","currencies":string[],"intelligence":{"countryCode":"KR","countryName":"South Korea","primaryCurrency":"KRW","timezone":"Asia/Seoul"},"itinerary":[{"date":"YYYY-MM-DD","day":number,"region":string,"city":"Jeju","country":"South Korea","timezone":"Asia/Seoul","currency":"KRW","spots":[{"time":"HH:MM","name":string,"type":string}]}]},"extractionReport":{"daysExtracted":number,"spotsExtracted":number,"sourceQuality":"high|medium|low","warnings":string[]},"summary":string,"warnings":[],"changes":[]}
CANONICAL ORGANIZED ITINERARY:
${organizedItinerary}`;
}

async function main() {
  const auth = await loadAuthInput();
  if (auth.mode === 'missing') {
    throw new Error('missing local broker vault session; run npm run broker-vault:prepare first');
  }
  if (auth.mode === 'broker-session' && auth.expiresAt && auth.expiresAt <= Date.now()) {
    throw new Error('Local broker vault session is expired; refresh it before running trip update live smoke.');
  }

  const headers = {
    'Content-Type': 'application/json',
    Origin: origin,
  };
  if (auth.session) headers[SESSION_HEADER] = auth.session;
  if (auth.supabaseToken) headers[SUPABASE_AUTH_HEADER] = `Bearer ${auth.supabaseToken}`;

  const startedAt = Date.now();
  const endpoint = provider === 'mimo' ? '/mimo/json' : provider === 'kimi' ? '/kimi/json' : '/google/json';
  const organizeResponse = await fetch(`${brokerUrl}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt: buildOrganizePrompt(), kind: 'trip', model }),
  });
  const organizeText = await organizeResponse.text();
  assertNoSensitiveText(`${endpoint} organize`, organizeText);
  const organizeData = organizeText ? JSON.parse(organizeText) : {};
  const organizedItinerary = String(organizeData?.data?.organizedItinerary || '').trim();
  if (!organizeResponse.ok || organizeData?.ok !== true || organizedItinerary.length < 80) {
    throw new Error(`Organize stage failed with ${organizeResponse.status}: ${redactedError(organizeData?.error || organizeText.slice(0, 240))}`);
  }

  const extractResponse = await fetch(`${brokerUrl}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt: buildExtractionPrompt(organizedItinerary), kind: 'trip', model }),
  });
  const extractText = await extractResponse.text();
  assertNoSensitiveText(`${endpoint} extract`, extractText);
  const data = extractText ? JSON.parse(extractText) : {};
  const durationMs = Date.now() - startedAt;
  const payload = data?.data;
  const itinerary = payload?.trip?.itinerary;
  const days = Array.isArray(itinerary) ? itinerary.length : 0;
  const spots = Array.isArray(itinerary)
    ? itinerary.reduce((sum, day) => sum + (Array.isArray(day?.spots) ? day.spots.length : 0), 0)
    : 0;
  const result = {
    brokerUrl,
    origin,
    mode: auth.mode,
    source: auth.source,
    provider,
    model,
    status: extractResponse.ok && data?.ok === true && days >= 8 && spots >= 20 && durationMs <= maxDurationMs ? 'passed' : 'failed',
    noSecretsPrinted: true,
    organizeStatus: organizeResponse.status,
    extractStatus: extractResponse.status,
    durationMs,
    maxDurationMs,
    organizedLength: organizedItinerary.length,
    tripName: typeof payload?.trip?.name === 'string' ? payload.trip.name.slice(0, 80) : undefined,
    days,
    spots,
    sourceQuality: payload?.extractionReport?.sourceQuality,
    keys: payload && typeof payload === 'object' ? Object.keys(payload).slice(0, 8) : [],
    error: data?.error ? redactedError(data.error) : undefined,
  };
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== 'passed') process.exit(2);
}

main().catch((error) => {
  console.error(JSON.stringify({
    brokerUrl,
    origin,
    status: 'failed',
    noSecretsPrinted: true,
    error: redactedError(error),
  }, null, 2));
  process.exit(1);
});
