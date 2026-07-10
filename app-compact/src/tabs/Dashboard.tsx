import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CloudSun,
  Info,
  Lightbulb,
  MapPin,
  NotebookPen,
  Pencil,
  Plus,
  X,
  Castle,
  Utensils,
  ShoppingBag,
  Bath,
  Compass,
  BarChart3,
  MoreHorizontal,
  Camera,
  Wallet
} from 'lucide-react';
import { ReceiptPhotoModal } from '../components/ReceiptPhotoModal';
import { VisualIcon } from '../components/VisualIcon';
import { GlassCard, Reveal, TickerMoney } from '../components/ui';
import { BorderBeam } from '../components/ui/border-beam';
import { AnimatedCircularProgressBar } from '../components/ui/animated-circular-progress-bar';
import { amountToHkd, currencyPrefix, formatCurrencyAmount } from '../lib/currency';
import {
  categoryById,
  displayStore,
  fmt,
  getItinerary,
  getPersons,
  isPendingReceipt,
  mapsUrl,
  openMapExternal,
  safeExternalUrl,
  todayForReceipts,
  todayYmd,
  safePhotoUrl,
  getReceiptHkdAmount,
  getReceiptTripAmount,
  getResolvedTripCurrency,
  isSettlementReceipt
} from '../lib/domain';
import { activeTrip, createTripProfile, normalizeItinerary, scopedReceiptsForTrip, switchTrip } from '../domain/trip/normalize';
import type { AppState, ItineraryDay, ItinerarySpot, Receipt, SyncQueueItem, TabId, TripProfile } from '../lib/types';
import { parseTripParagraph } from '../lib/ai';
import { brokerAiJson, redactedError } from '../lib/credentialBroker';
import { AI_MODELS, DEFAULT_KIMI_PRIMARY_MODEL_ID } from '../lib/constants';

type DestinationIdea = {
  id: string;
  label: string;
  detail: string;
  source: 'online' | 'fallback';
};

function displayDateRange(startDate: string, endDate: string) {
  const fmtDate = (date: string) => {
    const parsed = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return date;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
  };
  return `${fmtDate(startDate)} – ${fmtDate(endDate)}`;
}

function chineseDateLabel(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][parsed.getDay()];
  return `${parsed.getFullYear()}年${parsed.getMonth() + 1}月${parsed.getDate()}日（${weekday}）`;
}

function tripLength(startDate: string, endDate: string, fallback: number) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return Math.max(1, fallback);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function tripDayNumber(startDate: string, targetDate: string, fallback = 1) {
  const start = new Date(`${startDate}T00:00:00`);
  const target = new Date(`${targetDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(target.getTime())) return Math.max(1, fallback);
  return Math.max(1, Math.round((target.getTime() - start.getTime()) / 86_400_000) + 1);
}

function addDaysToIsoDate(date: string, daysToAdd: number) {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + daysToAdd);
  return [
    parsed.getUTCFullYear(),
    String(parsed.getUTCMonth() + 1).padStart(2, '0'),
    String(parsed.getUTCDate()).padStart(2, '0')
  ].join('-');
}

function normalizeTripDurationDays(value: number) {
  return Math.max(1, Math.min(60, Math.round(value) || 1));
}

function normalizeDestinationText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/济/g, '濟')
    .replace(/韩国/g, '韓國');
}

function destinationLooksLikeKorea(value: string) {
  const dest = normalizeDestinationText(value);
  return ['韓國', 'south korea', 'korea', 'kr', '濟州', 'jeju', 'seoul', '首爾', 'busan', '釜山'].some((keyword) => dest.includes(keyword));
}

function stripSearchMarkup(value: unknown) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function fallbackDestinationIdeas(destination: string): DestinationIdea[] {
  const dest = normalizeDestinationText(destination);
  if (dest.includes('濟州') || dest.includes('jeju')) {
    return [
      {
        id: 'jeju-seongsan',
        label: '城山日出峰',
        detail: '濟州景點建議：城山日出峰睇日出，牛島踩單車/海岸線，漢拏山健行，萬丈窟熔岩洞，涉地可支海岸散步，東門市場食海鮮小食。',
        source: 'fallback',
      },
      {
        id: 'jeju-hallasan',
        label: '漢拏山 + 牛島',
        detail: '濟州自然路線：早上漢拏山或城山日出峰，中午牛島，下午涉地可支/海岸咖啡，晚上東門市場或黑豬肉晚餐。',
        source: 'fallback',
      },
      {
        id: 'jeju-waterfalls',
        label: '西歸浦瀑布線',
        detail: '濟州西歸浦路線：天地淵瀑布、正房瀑布、柱狀節理帶、Olle 小路，再加海邊 cafe 或橘子甜品。',
        source: 'fallback',
      },
    ];
  }

  if (dest.includes('名古屋') || dest.includes('nagoya')) {
    return [
      {
        id: 'nagoya-food',
        label: '名古屋城 + 大須',
        detail: '名古屋景點建議：名古屋城、大須觀音商店街、熱田神宮、榮町 Shopping，餐飲安排蓬萊軒鰻魚飯三食同矢場ton味噌豬扒。',
        source: 'fallback',
      },
    ];
  }

  return [];
}

function uniqueDestinationIdeas(ideas: DestinationIdea[]) {
  const seen = new Set<string>();
  return ideas.filter((idea) => {
    const key = normalizeDestinationText(idea.label);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const JEJU_FALLBACK_SPOTS: Array<ItinerarySpot & { region: string; city: string; country: string }> = [
  { time: '09:00', name: '城山日出峰', type: 'sightseeing', region: '濟州東部', city: 'Jeju', country: 'South Korea', timezone: 'Asia/Seoul', lat: 33.4580, lon: 126.9425, note: '日出火山口與海岸步道' },
  { time: '12:00', name: '牛島', type: 'localtour', region: '濟州東部', city: 'Jeju', country: 'South Korea', timezone: 'Asia/Seoul', lat: 33.5066, lon: 126.9534, note: '海岸線、單車與花生雪糕' },
  { time: '16:00', name: '涉地可支', type: 'sightseeing', region: '濟州東部', city: 'Seogwipo', country: 'South Korea', timezone: 'Asia/Seoul', lat: 33.4242, lon: 126.9306, note: '海崖散步與咖啡' },
  { time: '09:30', name: '漢拏山', type: 'sightseeing', region: '濟州中部', city: 'Jeju', country: 'South Korea', timezone: 'Asia/Seoul', lat: 33.3617, lon: 126.5292, note: '自然健行，留意風雨與裝備' },
  { time: '14:30', name: '萬丈窟', type: 'ticket', region: '濟州東北', city: 'Jeju', country: 'South Korea', timezone: 'Asia/Seoul', lat: 33.5283, lon: 126.7715, note: '熔岩洞景點' },
  { time: '18:30', name: '東門市場', type: 'food', region: '濟州市區', city: 'Jeju', country: 'South Korea', timezone: 'Asia/Seoul', lat: 33.5124, lon: 126.5260, note: '晚餐、小食與手信' },
  { time: '10:00', name: '天地淵瀑布', type: 'sightseeing', region: '西歸浦', city: 'Seogwipo', country: 'South Korea', timezone: 'Asia/Seoul', lat: 33.2461, lon: 126.5544, note: '瀑布與森林步道' },
  { time: '13:30', name: '正房瀑布', type: 'sightseeing', region: '西歸浦', city: 'Seogwipo', country: 'South Korea', timezone: 'Asia/Seoul', lat: 33.2448, lon: 126.5716, note: '海邊瀑布' },
  { time: '16:30', name: '柱狀節理帶', type: 'sightseeing', region: '西歸浦', city: 'Seogwipo', country: 'South Korea', timezone: 'Asia/Seoul', lat: 33.2379, lon: 126.4260, note: '玄武岩海岸景觀' },
];

function hasMeaningfulItinerary(itinerary?: ItineraryDay[] | null) {
  return Array.isArray(itinerary) && itinerary.some((day) => (day.spots || []).some((spot) => spot.name?.trim()));
}

function fallbackTripIntelligence(destination: string, currency: string, now: number): TripProfile['intelligence'] {
  if (destinationLooksLikeKorea(destination)) {
    return {
      countryCode: 'KR',
      countryName: 'South Korea',
      primaryCurrency: 'KRW',
      themeKey: 'korea_editorial',
      locale: 'ko-KR',
      timezone: 'Asia/Seoul',
      weatherRegion: destination || 'Jeju',
      confidence: 'medium',
      source: 'heuristic',
      updatedAt: now,
    };
  }
  return {
    countryCode: 'GLOBAL',
    countryName: destination || 'Unknown',
    primaryCurrency: currency,
    themeKey: 'global_journal',
    locale: 'en',
    timezone: 'Asia/Hong_Kong',
    weatherRegion: destination || 'Trip',
    confidence: 'low',
    source: 'heuristic',
    updatedAt: now,
  };
}

function buildFallbackItinerary(base: TripProfile, destinationIdeas: DestinationIdea[], details: string): ItineraryDay[] {
  const destinationText = `${base.destinationSummary} ${base.name} ${details}`;
  const isJeju = /濟州|jeju/i.test(normalizeDestinationText(destinationText));
  const ideaSpots = destinationIdeas.map((idea, index): ItinerarySpot => ({
    time: ['09:30', '13:00', '16:30'][index % 3],
    name: idea.label,
    type: 'sightseeing',
    note: idea.detail,
    timezone: destinationLooksLikeKorea(destinationText) ? 'Asia/Seoul' : base.timezones[0] || 'Asia/Hong_Kong',
  }));

  return base.itinerary.map((day, index) => {
    const sourcePool = isJeju ? JEJU_FALLBACK_SPOTS : ideaSpots;
    const daySpots = sourcePool.length
      ? sourcePool.slice(index * 2, index * 2 + 3)
      : [];
    const wrappedSpots = daySpots.length ? daySpots : sourcePool.slice(0, 3);
    const firstSpot = wrappedSpots[0] as (ItinerarySpot & { region?: string; city?: string; country?: string }) | undefined;
    return {
      ...day,
      day: index + 1,
      region: firstSpot?.region || day.region || base.destinationSummary,
      city: firstSpot?.city || day.city || (destinationLooksLikeKorea(destinationText) ? 'Jeju' : undefined),
      country: firstSpot?.country || day.country || (destinationLooksLikeKorea(destinationText) ? 'South Korea' : undefined),
      timezone: firstSpot?.timezone || day.timezone || (destinationLooksLikeKorea(destinationText) ? 'Asia/Seoul' : base.timezones[0]),
      currency: day.currency || base.currencies.find((code) => code !== 'HKD') || 'JPY',
      highlight: day.highlight || wrappedSpots.map((spot) => spot.name).slice(0, 2).join(' / '),
      spots: wrappedSpots.map((spot) => ({
        ...spot,
        timezone: spot.timezone || firstSpot?.timezone || day.timezone,
      })),
    };
  });
}

function mergeAnalyzedTrip(base: TripProfile, analyzed: TripProfile | null, fallbackItinerary: ItineraryDay[], now: number, selectedCurrency: string): TripProfile {
  const currency = String(
    analyzed?.currencies?.find((code) => code !== 'HKD')
    || selectedCurrency
    || base.currencies.find((code) => code !== 'HKD')
    || 'JPY'
  ).toUpperCase();
  const analyzedDays = Array.isArray(analyzed?.itinerary) ? analyzed.itinerary : [];
  const alignedItinerary = base.itinerary.map((baseDay, index) => {
    const aiDay = analyzedDays[index];
    const fallbackDay = fallbackItinerary[index] || baseDay;
    const spots = aiDay?.spots?.length ? aiDay.spots : fallbackDay.spots;
    return {
      ...fallbackDay,
      ...aiDay,
      date: baseDay.date,
      day: index + 1,
      region: aiDay?.region || fallbackDay.region || baseDay.region,
      city: aiDay?.city || fallbackDay.city || baseDay.city,
      country: aiDay?.country || fallbackDay.country || baseDay.country,
      timezone: aiDay?.timezone || fallbackDay.timezone || baseDay.timezone,
      currency: aiDay?.currency || fallbackDay.currency || currency,
      spots,
    };
  });
  const itinerary = normalizeItinerary(alignedItinerary, base.id, currency);
  const intelligence = analyzed?.intelligence?.countryCode
    ? { ...fallbackTripIntelligence(base.destinationSummary, currency, now), ...analyzed.intelligence, source: 'ai' as const, updatedAt: now }
    : fallbackTripIntelligence(base.destinationSummary, currency, now);
  return {
    ...base,
    ...(analyzed || {}),
    id: base.id,
    sourceId: base.sourceId || `trip_${base.id}`,
    notionPageId: base.notionPageId,
    supabaseId: base.supabaseId,
    createdAt: base.createdAt,
    updatedAt: now,
    name: analyzed?.name || base.name,
    destinationSummary: analyzed?.destinationSummary || base.destinationSummary,
    startDate: base.startDate,
    endDate: base.endDate,
    homeCurrency: 'HKD',
    currencies: Array.from(new Set(['HKD', ...(analyzed?.currencies || []), currency])),
    timezones: Array.from(new Set(itinerary.map((day) => day.timezone || intelligence?.timezone || 'Asia/Hong_Kong'))),
    budget: base.budget,
    version: Math.max((base.version || 1) + 1, analyzed?.version || 1),
    active: true,
    archived: false,
    intelligence,
    itinerary,
  };
}

function buildTripCreateParagraph(input: {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  budget: string;
  currency: string;
  details: string;
  ideas: DestinationIdea[];
}) {
  const ideaText = input.ideas.map((idea) => `- ${idea.label}: ${idea.detail}`).join('\n');
  return [
    `Trip name: ${input.name}`,
    `Destination: ${input.destination || '未設定目的地'}`,
    `Dates: ${input.startDate} to ${input.endDate}`,
    `Budget: ${input.budget || 'not set'} ${input.currency}`,
    `Preferred currency: ${input.currency}`,
    input.details ? `User trip details:\n${input.details}` : '',
    ideaText ? `Destination ideas already suggested to user:\n${ideaText}` : '',
    'Please create a practical day-by-day itinerary. For EVERY spot include: name, time (HH:MM), timeEnd (HH:MM), type (flight|transport|food|shopping|lodging|ticket|localtour|sightseeing|other), city, country, timezone, currency.',
    'For lodging include: name, address, checkIn time, checkOut time, lat/lon if known.',
    'For each spot include lat/lon coordinates when inferable from the place name; otherwise omit and note in missingCriticalFields.',
    'Include highlight (one-line summary) for each day.',
  ].filter(Boolean).join('\n\n');
}

function isRelevantDestinationResult(destination: string, title: string, snippet: string) {
  const haystack = normalizeDestinationText(`${title} ${snippet}`);
  const dest = normalizeDestinationText(destination);
  if (!dest) return false;
  if (destinationLooksLikeKorea(destination)) {
    return /(濟州|jeju|seogwipo|西歸浦|城山|牛島|udo|hallasan|漢拏)/i.test(haystack);
  }
  const compactDest = dest.replace(/\s+/g, '');
  return compactDest.length >= 2 && haystack.replace(/\s+/g, '').includes(compactDest.slice(0, Math.min(4, compactDest.length)));
}

async function fetchDestinationIdeas(destination: string, signal: AbortSignal): Promise<DestinationIdea[]> {
  const query = destination.trim();
  if (query.length < 2) return [];
  const endpoints = ['https://zh.wikivoyage.org/w/api.php', 'https://en.wikivoyage.org/w/api.php'];
  const searches = [`${query} 景點`, `${query} attractions`];
  const ideas: DestinationIdea[] = [];

  for (const endpoint of endpoints) {
    for (const search of searches) {
      const url = `${endpoint}?action=query&list=search&srsearch=${encodeURIComponent(search)}&format=json&origin=*`;
      const response = await fetch(url, { signal });
      if (!response.ok) continue;
      const data = await response.json() as { query?: { search?: Array<{ title?: string; snippet?: string }> } };
      for (const item of data.query?.search || []) {
        const title = stripSearchMarkup(item.title);
        const snippet = stripSearchMarkup(item.snippet);
        if (!title || !isRelevantDestinationResult(query, title, snippet)) continue;
        ideas.push({
          id: `online-${title}`,
          label: title.slice(0, 32),
          detail: `${query} 景點建議：${title}${snippet ? `。${snippet.slice(0, 96)}` : ''}`,
          source: 'online',
        });
      }
      if (ideas.length >= 3) return uniqueDestinationIdeas(ideas).slice(0, 3);
    }
  }

  return uniqueDestinationIdeas(ideas).slice(0, 3);
}

function isQuotaHardStop(error: unknown): boolean {
  return /(?:\b429\b|quota|daily limit|rate limit|too many requests|用量|配額|限額)/i.test(redactedError(error));
}

function aiModelLabel(modelId: string | undefined): string {
  const id = modelId || DEFAULT_KIMI_PRIMARY_MODEL_ID;
  return AI_MODELS.find((model) => model.id === id)?.name || id;
}

function aiProviderForModel(modelId: string | undefined): { provider: 'kimi' | 'google' | 'mimo'; model: string; id: string } {
  const id = modelId || DEFAULT_KIMI_PRIMARY_MODEL_ID;
  const [providerRaw, modelRaw] = id.includes('/') ? id.split('/') : ['', id];
  const provider = providerRaw === 'google' || providerRaw === 'mimo' || providerRaw === 'kimi'
    ? providerRaw
    : /mimo/i.test(id)
      ? 'mimo'
      : /kimi/i.test(id)
        ? 'kimi'
        : 'google';
  return { provider, model: modelRaw || id, id };
}

// 根據景點屬性或名字，智能配對和風 icon 及顏色
function getSpotIconDetails(type: string, name: string) {
  const t = type.toLowerCase();
  const n = name.toLowerCase();
  if (t === 'food' || n.includes('lunch') || n.includes('dinner') || n.includes('eat') || n.includes('hitsumabushi') || n.includes('restaurant')) {
    return {
      bgClass: 'washi-icon-red',
      icon: <Utensils size={18} className="text-white" />
    };
  }
  if (t === 'shopping' || n.includes('shop') || n.includes('market') || n.includes('osu') || n.includes('souvenir')) {
    return {
      bgClass: 'washi-icon-blue',
      icon: <ShoppingBag size={18} className="text-white" />
    };
  }
  if (t === 'onsen' || n.includes('onsen') || n.includes('spa') || n.includes('bath') || n.includes('hot spring') || n.includes('relax')) {
    return {
      bgClass: 'washi-icon-blue',
      icon: <Bath size={18} className="text-white" />
    };
  }
  if (n.includes('castle') || n.includes('temple') || n.includes('shrine') || t === 'sightseeing' || n.includes('landmark')) {
    return {
      bgClass: 'washi-icon-blue',
      icon: <Castle size={18} className="text-white" />
    };
  }
  return {
    bgClass: 'washi-icon-blue',
    icon: <MapPin size={18} className="text-white" />
  };
}

export function Dashboard({
  state,
  setState,
  updateState,
  onOpen,
  onTab,
  onManual,
  isWizardOpen,
  setIsWizardOpen
}: {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  updateState: (patch: Partial<AppState>) => void;
  onOpen: (receipt: Receipt) => void;
  onTab: (tab: TabId) => void;
  onManual: () => void;
  isWizardOpen?: boolean;
  setIsWizardOpen?: (open: boolean) => void;
}) {
  const [sheet, setSheet] = useState<{ kind: 'day-receipts' } | { kind: 'spot'; spot: ItinerarySpot } | null>(null);
  const [viewPhoto, setViewPhoto] = useState<Receipt | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => !!localStorage.getItem('onboarding-dismissed'));
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [editBudgetVal, setEditBudgetVal] = useState('');

  // Dropdown & Wizard States
  const [isTripDropdownOpen, setIsTripDropdownOpen] = useState(false);
  const tripDropdownRef = useRef<HTMLDivElement>(null);
  const [localIsWizardOpen, setLocalIsWizardOpen] = useState(false);
  const activeIsWizardOpen = isWizardOpen !== undefined ? isWizardOpen : localIsWizardOpen;
  const activeSetIsWizardOpen = setIsWizardOpen !== undefined ? setIsWizardOpen : setLocalIsWizardOpen;
  const [wizardStep, setWizardStep] = useState(1);

  // Wizard Fields
  const [newTripName, setNewTripName] = useState('');
  const [newTripDestination, setNewTripDestination] = useState('');
  const [newTripStartDate, setNewTripStartDate] = useState('');
  const [newTripEndDate, setNewTripEndDate] = useState('');
  const [newTripBudget, setNewTripBudget] = useState('');
  const [newTripCurrency, setNewTripCurrency] = useState('JPY');
  const [newTripDetails, setNewTripDetails] = useState('');
  const [destinationIdeas, setDestinationIdeas] = useState<DestinationIdea[]>([]);
  const [destinationIdeaStatus, setDestinationIdeaStatus] = useState<'idle' | 'loading' | 'online' | 'fallback' | 'error'>('idle');
  const [tripCreateStatus, setTripCreateStatus] = useState<'idle' | 'analyzing' | 'fallback'>('idle');
  const [tripCreateError, setTripCreateError] = useState('');

  // 1. 📅 智能預設黃金 7 天
  useEffect(() => {
    if (activeIsWizardOpen) {
      if (!newTripStartDate && !newTripEndDate) {
        const todayStr = todayYmd();
        const futureStr = addDaysToIsoDate(todayStr, 6); // 7天 (today + 6 days)
        setNewTripStartDate(todayStr);
        setNewTripEndDate(futureStr);
      }
    }
  }, [activeIsWizardOpen]);

  useEffect(() => {
    if (!isTripDropdownOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (tripDropdownRef.current && !tripDropdownRef.current.contains(e.target as Node)) {
        setIsTripDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isTripDropdownOpen]);

  // Android hardware back closes a transient overlay (trip dropdown / inline budget edit) before the
  // app-level handler navigates home. preventDefault signals "I handled it". Native-only (the event is
  // only dispatched by App's native backButton handler), so web/browser behaviour is untouched.
  useEffect(() => {
    if (!isTripDropdownOpen && !isEditingBudget) return undefined;
    const onBack = (e: Event) => {
      if (isTripDropdownOpen) { setIsTripDropdownOpen(false); e.preventDefault(); return; }
      if (isEditingBudget) { setIsEditingBudget(false); e.preventDefault(); }
    };
    window.addEventListener('app:hardware-back', onBack);
    return () => window.removeEventListener('app:hardware-back', onBack);
  }, [isTripDropdownOpen, isEditingBudget]);

  // 2. 🗺️ 目的地與結算幣種「智能自動聯動」
  useEffect(() => {
    const dest = newTripDestination.trim().toLowerCase();
    if (!dest) return;
    const jpyKeywords = ['名古屋', '東京', '大阪', '京都', '北海道', '沖繩', '日本', 'japan', 'jp', 'nagoya', 'tokyo', 'osaka', 'kyoto', 'hokkaido', 'okinawa'];
    const hkdKeywords = ['香港', 'hong kong', 'hongkong', 'hk'];
    const usdKeywords = ['美國', 'usa', 'us', 'united states'];

    if (jpyKeywords.some(kw => dest.includes(kw))) {
      setNewTripCurrency('JPY');
    } else if (hkdKeywords.some(kw => dest.includes(kw))) {
      setNewTripCurrency('HKD');
    } else if (usdKeywords.some(kw => dest.includes(kw))) {
      setNewTripCurrency('USD');
    } else if (destinationLooksLikeKorea(dest)) {
      setNewTripCurrency('KRW');
    }
  }, [newTripDestination]);

  useEffect(() => {
    if (!activeIsWizardOpen) return;
    const destination = newTripDestination.trim();
    if (destination.length < 2) {
      setDestinationIdeas([]);
      setDestinationIdeaStatus('idle');
      return;
    }

    const controller = new AbortController();
    const fallback = fallbackDestinationIdeas(destination);
    setDestinationIdeaStatus('loading');
    setDestinationIdeas(fallback);

    const timer = window.setTimeout(() => {
      fetchDestinationIdeas(destination, controller.signal)
        .then((onlineIdeas) => {
          const merged = uniqueDestinationIdeas([...fallback, ...onlineIdeas]).slice(0, 4);
          setDestinationIdeas(merged);
          setDestinationIdeaStatus(onlineIdeas.length ? 'online' : fallback.length ? 'fallback' : 'error');
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          console.warn('Destination suggestion lookup failed', redactedError(error));
          setDestinationIdeas(fallback);
          setDestinationIdeaStatus(fallback.length ? 'fallback' : 'error');
        });
    }, 350);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [activeIsWizardOpen, newTripDestination]);

  const closeWizard = useCallback(() => {
    activeSetIsWizardOpen(false);
    setWizardStep(1);
    setNewTripName('');
    setNewTripDestination('');
    setNewTripStartDate('');
    setNewTripEndDate('');
    setNewTripBudget('');
    setNewTripCurrency('JPY');
    setNewTripDetails('');
    setDestinationIdeas([]);
    setDestinationIdeaStatus('idle');
    setTripCreateStatus('idle');
    setTripCreateError('');
  }, [activeSetIsWizardOpen]);

  const wizardContainerRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!activeIsWizardOpen) return;
    prevFocusRef.current = document.activeElement as HTMLElement;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeWizard(); }
      if (e.key === 'Tab' && wizardContainerRef.current) {
        const focusable = wizardContainerRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('keydown', handleKeyDown); prevFocusRef.current?.focus?.(); };
  }, [activeIsWizardOpen, closeWizard]);

  // Date duration auto-calc
  const calculatedDuration = useMemo(() => {
    if (!newTripStartDate || !newTripEndDate) return 0;
    const start = new Date(`${newTripStartDate}T00:00:00`);
    const end = new Date(`${newTripEndDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    const diff = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
    return diff;
  }, [newTripStartDate, newTripEndDate]);
  const selectedTripDuration = calculatedDuration || 7;
  const durationOptions = useMemo(() => {
    const base = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 21, 30];
    return base.includes(selectedTripDuration)
      ? base
      : [...base, selectedTripDuration].sort((a, b) => a - b);
  }, [selectedTripDuration]);

  const applyTripDuration = (days: number, baseDate = newTripStartDate) => {
    const duration = normalizeTripDurationDays(days);
    const start = baseDate || todayYmd();
    setNewTripStartDate(start);
    setNewTripEndDate(addDaysToIsoDate(start, duration - 1));
  };

  const handleStartDateChange = (value: string) => {
    setNewTripStartDate(value);
    if (value) {
      setNewTripEndDate(addDaysToIsoDate(value, normalizeTripDurationDays(selectedTripDuration) - 1));
    }
  };

  const applyDestinationIdea = (idea: DestinationIdea) => {
    setNewTripDetails(idea.detail);
    if (!newTripDestination.trim()) {
      setNewTripDestination(idea.label);
    }
    if (!newTripName.trim() || newTripName.includes('新旅程')) {
      setNewTripName(`${newTripDestination || idea.label} Trip`);
    }
  };

  const handleSwitchTrip = (tripId: string) => {
    const patch = switchTrip(state, tripId);
    if (patch) updateState(patch);
  };

  const handleCreateTrip = async (overrideName?: string) => {
    const finalName = (overrideName || newTripName).trim();
    if (!finalName) return;

    const now = Date.now();
    const newTrip = createTripProfile({
      name: finalName,
      destinationSummary: newTripDestination || 'Japan',
      startDate: newTripStartDate,
      endDate: newTripEndDate,
      budget: newTripBudget.trim() ? Number(newTripBudget) : 150000,
      currency: newTripCurrency || 'JPY',
      now,
    });
    const fallbackItinerary = buildFallbackItinerary(newTrip, destinationIdeas, newTripDetails);
    let finalTrip = mergeAnalyzedTrip(newTrip, null, fallbackItinerary, now, newTripCurrency || 'JPY');
    const paragraph = buildTripCreateParagraph({
      name: finalName,
      destination: newTripDestination,
      startDate: newTripStartDate,
      endDate: newTripEndDate,
      budget: newTripBudget,
      currency: newTripCurrency || 'JPY',
      details: newTripDetails,
      ideas: destinationIdeas,
    });

    setTripCreateError('');
    setTripCreateStatus('analyzing');
    try {
      const draft = await parseTripParagraph(paragraph, {
        ...state,
        trips: [...(state.trips || []).map((trip) => ({ ...trip, active: false })), newTrip],
        activeTripId: newTrip.id,
        tripName: newTrip.name,
        tripDateRange: { start: newTrip.startDate, end: newTrip.endDate },
        tripCurrency: newTripCurrency || 'JPY',
        budget: newTrip.budget || 0,
        customItinerary: newTrip.itinerary,
      });
      if (hasMeaningfulItinerary(draft.trip.itinerary)) {
        finalTrip = mergeAnalyzedTrip(newTrip, draft.trip, fallbackItinerary, Date.now(), newTripCurrency || 'JPY');
      } else {
        setTripCreateStatus('fallback');
      }
    } catch (error) {
      if (isQuotaHardStop(error)) {
        setTripCreateStatus('idle');
        setTripCreateError(`AI quota / rate limit：${redactedError(error)}`);
        return;
      }
      console.warn('[Dashboard] New trip AI analysis failed, using destination fallback:', error);
      setTripCreateStatus('fallback');
    }

    const updatedAt = Date.now();
    finalTrip = {
      ...finalTrip,
      updatedAt,
      itinerary: normalizeItinerary(finalTrip.itinerary, finalTrip.id, finalTrip.currencies.find((currency) => currency !== 'HKD') || newTripCurrency || 'JPY'),
    };

    const queueItem: SyncQueueItem = {
      id: `sync_${updatedAt}_${Math.random().toString(16).slice(2)}`,
      type: 'trip',
      entityId: finalTrip.id,
      op: 'create',
      status: 'queued',
      attempts: 0,
      createdAt: updatedAt,
      updatedAt,
      payload: {
        tripId: finalTrip.id,
        sourceId: finalTrip.sourceId || `trip_${finalTrip.id}`,
        updatedAt,
      }
    };

    setState((prev) => {
      const trips = [...(prev.trips || []).map((item) => ({ ...item, active: false })), finalTrip];
      const nextQueue = [...(prev.syncQueue || []), queueItem];

      const latest = new Map<string, SyncQueueItem>();
      for (const item of nextQueue) {
        if (item.status === 'synced') continue;
        latest.set(`${item.type}:${item.entityId}`, item);
      }
      return {
        ...prev,
        trips,
        activeTripId: finalTrip.id,
        tripName: finalTrip.name,
        budget: finalTrip.budget || 0,
        tripCurrency: finalTrip.currencies.find((currency) => currency !== 'HKD') || 'JPY',
        customItinerary: finalTrip.itinerary,
        tripDateRange: { start: finalTrip.startDate, end: finalTrip.endDate },
        syncQueue: [...latest.values()].slice(-500)
      };
    });

    activeSetIsWizardOpen(false);
    setWizardStep(1);
    setNewTripName('');
    setNewTripDestination('');
    setNewTripStartDate('');
    setNewTripEndDate('');
    setNewTripBudget('');
    setNewTripCurrency('JPY');
    setNewTripDetails('');
    setDestinationIdeas([]);
    setDestinationIdeaStatus('idle');
    setTripCreateStatus('idle');
    setTripCreateError('');
  };

  const trip = activeTrip(state);
  const itinerary = getItinerary(state);
  const tripReceipts = useMemo(() => scopedReceiptsForTrip(state, trip).filter((r) => !isSettlementReceipt(r)), [state, trip]);
  const today = todayForReceipts(state);
  const resolvedTripCurrency = getResolvedTripCurrency(state, trip);
  const activeDisplayCurrency = !state.displayCurrency || state.displayCurrency === 'HKD'
    ? 'HKD'
    : state.displayCurrency;
  const showTripCurrency = activeDisplayCurrency !== 'HKD';
  const displayMoney = (amount: number, currency = activeDisplayCurrency || 'HKD') => formatCurrencyAmount(amount, currency);

  const handleUpdateBudget = (newBudgetVal: string) => {
    const newBudget = Number(newBudgetVal) || 0;
    if (setState) {
      const now = Date.now();
      const nextTrip = {
        ...trip,
        budget: newBudget,
        version: (trip.version || 0) + 1,
        updatedAt: now,
      };

      const queueItem: SyncQueueItem = {
        id: `sync_${now}_${Math.random().toString(16).slice(2)}`,
        type: 'trip' as const,
        entityId: trip.id,
        op: 'update' as const,
        status: 'queued' as const,
        attempts: 0,
        createdAt: now,
        updatedAt: now,
        payload: {
          tripId: trip.id,
          sourceId: nextTrip.sourceId || `trip_${nextTrip.id}`,
          updatedAt: nextTrip.updatedAt,
        },
      };

      setState((prev: AppState) => ({
        ...prev,
        budget: newBudget,
        trips: (prev.trips || []).map((t) => t.id === trip.id ? nextTrip : t),
        syncQueue: [
          ...(prev.syncQueue || []),
          queueItem,
        ].slice(-500),
      }));
    } else {
      updateState({ budget: newBudget });
    }
    setIsEditingBudget(false);
  };

  // 統一口徑與過濾邏輯：
  // 總消費額永遠包含所有項目，確保預算使用比例不會因圖表篩選而被低估。
  // statsIncludeTransportLodging 只影響今日/日均與統計圖表的大額項目篩選。
  const statsIncludeTransportLodging = !!state.statsIncludeTransportLodging;
  const totalIncludeFL = true;
  const dailyIncludeFL = statsIncludeTransportLodging;

  const isBigTripItem = (r: Receipt) =>
    r.category === 'flight' || r.category === 'lodging' || r.category === 'transport';

  const todayReceipts = tripReceipts.filter((r) => r.date === today);

  // 今日花費與總花費收據過濾
  const dailyReceipts = todayReceipts.filter((r) => dailyIncludeFL || !isBigTripItem(r));
  const totalReceipts = tripReceipts.filter((r) => totalIncludeFL || !isBigTripItem(r));

  // 基於港幣做精準累加
  const spentHkd = totalReceipts.reduce((s, r) => s + getReceiptHkdAmount(r, state), 0);
  const todaySpentHkd = dailyReceipts.reduce((s, r) => s + getReceiptHkdAmount(r, state), 0);

  // 目的貨幣等值花費 (用於輔助顯示)
  const totalForBudget = totalReceipts.reduce((s, r) => s + getReceiptTripAmount(r, state, resolvedTripCurrency), 0);
  const todayTotal = dailyReceipts.reduce((s, r) => s + getReceiptTripAmount(r, state, resolvedTripCurrency), 0);

  const budgetHkd = Math.round(amountToHkd(Number(state.budget) || 0, resolvedTripCurrency, state));
  const currentBudget = showTripCurrency ? (Number(state.budget) || 0) : budgetHkd;
  const currentSpent = showTripCurrency ? totalForBudget : spentHkd;
  const rawBudgetPct = currentBudget > 0 ? (currentSpent / currentBudget) * 100 : 0;
  const budgetPct = Math.min(100, rawBudgetPct);

  const dailyBudget = Math.round((Number(state.budget) || 0) / Math.max(1, itinerary.length));
  const todayBudgetPct = dailyBudget > 0 ? (todayTotal / dailyBudget) * 100 : 0;
  const todayBudgetPctCapped = Math.min(100, Math.max(0, Math.round(todayBudgetPct)));
  const dailyBudgetHkd = Math.round(amountToHkd(dailyBudget, resolvedTripCurrency, state));
  const dayRemainingTrip = Math.max(0, Math.round(dailyBudget - todayTotal));
  const day = itinerary.find((d) => d.date === today) || itinerary[0];
  const length = tripLength(trip.startDate, trip.endDate, itinerary.length);
  const displayDayDate = day?.date || today;
  const currentDayNumber = Math.max(1, Math.min(length, day?.day || tripDayNumber(trip.startDate, displayDayDate, 1)));
  const remainingBudgetHkd = Math.max(0, budgetHkd - spentHkd);
  const dayRemainingHkd = Math.max(0, Math.round(amountToHkd(dailyBudget - todayTotal, resolvedTripCurrency, state)));
  const recommendedDailyHkd = Math.max(0, Math.round((budgetHkd - spentHkd) / Math.max(1, Math.max(1, length) - currentDayNumber + 1)));
  const budgetWarning = rawBudgetPct >= 100 ? '超出預算區' : rawBudgetPct >= 80 ? '接近上限' : '狀態良好';
  const daySpots = (day?.spots || []).slice(0, 4);
  const recentReceipts = tripReceipts.slice().sort((a, b) => `${b.date} ${b.time || ''}`.localeCompare(`${a.date} ${a.time || ''}`));
  const burnDays = Math.max(1, Math.min(length, currentDayNumber));
  const dailyBurnHkd = Math.round(spentHkd / burnDays);
  const todaySpendPrimary = showTripCurrency ? displayMoney(todayTotal, resolvedTripCurrency) : displayMoney(todaySpentHkd, 'HKD');
  const todaySpendSecondary = showTripCurrency ? displayMoney(todaySpentHkd, 'HKD') : displayMoney(todayTotal, resolvedTripCurrency);
  const dailyBudgetPrimary = showTripCurrency ? displayMoney(dailyBudget, resolvedTripCurrency) : displayMoney(dailyBudgetHkd, 'HKD');
  const dailyBudgetSecondary = showTripCurrency ? displayMoney(dailyBudgetHkd, 'HKD') : displayMoney(dailyBudget, resolvedTripCurrency);
  const dayRemainingPrimary = showTripCurrency ? displayMoney(dayRemainingTrip, resolvedTripCurrency) : displayMoney(dayRemainingHkd, 'HKD');
  const dayRemainingSecondary = showTripCurrency ? displayMoney(dayRemainingHkd, 'HKD') : displayMoney(dayRemainingTrip, resolvedTripCurrency);

  const displaySpots: ItinerarySpot[] = daySpots.length > 0 ? daySpots : [];

  return (
    <section className="japanese-washi-bg w-full min-h-screen px-4 pb-28 pt-6 relative overflow-y-auto" aria-label="旅程總覽">
      {/* 和風櫻花與日出背景圖案 */}
      <div className="japanese-sun-decor" />
      <div className="japanese-sakura-decor" />

      {/* Onboarding tip */}
      {state.receipts.length === 0 && !onboardingDismissed && (
        <div className="card onboarding-tip" style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
            <div>
              <strong style={{ fontSize: '14px' }}>3 步記帳：掃描 → 分帳 → 結清</strong>
              <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '4px 0 0' }}>
                📷 拍收據自動辨識 → 👥 揀邊個人分幾多 → 💰 結清付款
              </p>
            </div>
            <button type="button" className="icon-btn" onClick={() => { localStorage.setItem('onboarding-dismissed', '1'); setOnboardingDismissed(true); }} aria-label="關閉">×</button>
          </div>
        </div>
      )}

      {/* 1. Header 標題與日曆按鈕 */}
      <div className="dashboard-trip-switcher flex justify-between items-start mb-6 z-10 relative">
        <div className="flex flex-col relative z-30" ref={tripDropdownRef}>
          <button
            className="flex items-center gap-1 text-[28px] font-black text-slate-800 tracking-tight font-serif border-none bg-transparent focus:outline-none cursor-pointer min-h-[44px] py-1"
            type="button"
            onClick={() => setIsTripDropdownOpen(!isTripDropdownOpen)}
          >
            <span>{trip.name}</span>
            <ChevronDown size={22} className="text-slate-500 mt-1" />
          </button>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            {displayDateRange(trip.startDate, trip.endDate)} ({length} days)
          </p>

          {isTripDropdownOpen && (
            <div className="absolute top-12 left-0 w-64 bg-white/95 backdrop-blur-md rounded-2xl border border-white/80 shadow-2xl p-2 z-50 flex flex-col gap-1">
              <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                選擇旅程 (Select Trip)
              </div>
              <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
                {(state.trips || []).filter((t) => !t.archived).map((t) => {
                  const isActive = t.id === trip.id;
                  return (
                    <button
                      key={t.id}
                      className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-left transition-all border-none focus:outline-none ${
                        isActive
                          ? 'bg-[#6D5643]/15 text-[#6D5643] font-bold'
                          : 'hover:bg-slate-50 text-slate-700 bg-transparent'
                      }`}
                      onClick={() => {
                        setIsTripDropdownOpen(false);
                        handleSwitchTrip(t.id);
                      }}
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm truncate">{t.name}</span>
                        <span className="text-[10px] text-slate-400 truncate">
                          {t.destinationSummary || '未設定目的地'} ({t.itinerary?.length || 0}天)
                        </span>
                      </div>
                      {isActive && (
                        <div className="w-2 h-2 rounded-full bg-[#D94132] shrink-0 ml-2" />
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-slate-100 my-1" />
              <button
                className="flex items-center justify-center gap-1.5 w-full px-3 py-2 bg-[#6D5643] hover:bg-[#5C4837] text-white rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm border-none cursor-pointer"
                onClick={() => {
                  setIsTripDropdownOpen(false);
                  activeSetIsWizardOpen(true);
                  setWizardStep(1);
                }}
              >
                <span>➕ 建立新旅程</span>
              </button>
            </div>
          )}
        </div>
        <button
          className="w-11 h-11 bg-white/70 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/80 shadow-sm active:scale-95 transition-all"
          type="button"
          aria-label="開啟行程"
          onClick={() => onTab('timeline')}
        >
          <CalendarDays size={20} className="text-[#6D5643]" />
        </button>
      </div>



      {/* 2. 預算毛玻璃卡片 (含圓形進度條與 Today Spent / Daily Avg Spending Pct) */}
      <div className="stack w-full relative z-10 preview-dashboard-grid">
      <Reveal className="dashboard-reveal">
      <GlassCard as="div" className="washi-budget-card dashboard-magic-budget preview-dashboard-budget relative overflow-hidden z-10">
        {/* Hero card gets the travelling border light — the one place it reads as premium, not noise */}
        <BorderBeam size={64} duration={9} borderWidth={1.5} colorFrom="#C23B5E" colorTo="#D4A843" />
        <div className="preview-dashboard-budget-head">
          <h2>預算總覽 <Info size={20} aria-hidden="true" /></h2>
          <div className="preview-dashboard-currency" role="group" aria-label="顯示貨幣">
            <button
              type="button"
              className={activeDisplayCurrency === 'HKD' ? 'is-active' : ''}
              onClick={() => updateState({ displayCurrency: 'HKD' })}
              style={{ cursor: 'pointer' }}
            >
              HKD
            </button>
            <button
              type="button"
              className={activeDisplayCurrency === resolvedTripCurrency ? 'is-active' : ''}
              onClick={() => updateState({ displayCurrency: resolvedTripCurrency })}
              style={{ cursor: 'pointer' }}
            >
              {resolvedTripCurrency}
            </button>
          </div>
        </div>

        {(() => {
          return (
            <div className="preview-dashboard-budget-grid">
              <div className="preview-dashboard-ring">
                <AnimatedCircularProgressBar
                  value={budgetPct}
                  gaugePrimaryColor="#D4A843"
                  gaugeSecondaryColor="rgba(122, 99, 67, 0.18)"
                  className="size-full"
                >
                  <div className="preview-dashboard-ring-copy flex flex-col items-center justify-center">
                    <strong className="text-2xl font-bold leading-none" style={{ color: 'var(--compact-ink)', fontFamily: '"Noto Serif JP", serif' }}><TickerMoney text={`${Math.round(rawBudgetPct)}%`} /></strong>
                    <span className="text-[10px] text-gray-400 mt-1" style={{ color: 'var(--muted)', fontWeight: 600 }}>已使用</span>
                  </div>
                </AnimatedCircularProgressBar>
              </div>
              <div className="preview-dashboard-budget-side">
                <div className="preview-dashboard-budget-row is-total">
                  <span>總預算</span>
                  {isEditingBudget ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        className="w-20 text-sm px-1 py-0.5 rounded border border-gray-300 text-slate-800"
                        value={editBudgetVal}
                        onChange={(e) => setEditBudgetVal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleUpdateBudget(editBudgetVal);
                          }
                        }}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="text-xs bg-slate-800 text-white px-2 py-0.5 rounded"
                        onClick={() => {
                          handleUpdateBudget(editBudgetVal);
                        }}
                      >
                        儲存
                      </button>
                    </div>
                  ) : (
                    <>
                      <strong>{showTripCurrency ? displayMoney(state.budget, resolvedTripCurrency) : displayMoney(budgetHkd, 'HKD')}</strong>
                      <button type="button" onClick={() => {
                        setEditBudgetVal(String(state.budget || ''));
                        setIsEditingBudget(true);
                      }}><Pencil size={16} /> 編輯</button>
                    </>
                  )}
                </div>
                <div className="preview-dashboard-budget-row is-used">
                  <span>已使用</span>
                  <strong><TickerMoney text={showTripCurrency ? displayMoney(totalForBudget, resolvedTripCurrency) : displayMoney(spentHkd, 'HKD')} /></strong>
                </div>
                <div className="preview-dashboard-budget-row is-left">
                  <span>剩餘預算</span>
                  <strong><TickerMoney text={showTripCurrency ? displayMoney(Math.max(0, state.budget - totalForBudget), resolvedTripCurrency) : displayMoney(remainingBudgetHkd, 'HKD')} /></strong>
                </div>
              </div>
            </div>
          );
        })()}

        {(() => {
          return (
            <>
              <div className="preview-dashboard-budget-strip">
                <div>
                  <Wallet size={24} />
                  <span>每日預算</span>
                  <strong>{dailyBudgetPrimary}</strong>
                  <small>{dailyBudgetSecondary}</small>
                </div>
                <div>
                  <CalendarDays size={24} />
                  <span>日均結餘</span>
                  <strong>{dayRemainingPrimary}</strong>
                  <small>{dayRemainingSecondary}</small>
                </div>
              </div>

              <button className="preview-dashboard-budget-tip" type="button" onClick={() => onTab('stats')}>
                <Lightbulb size={22} />
                <span>提示：每日平均使用需 ≤ {showTripCurrency ? displayMoney(Math.round(dailyBudget), resolvedTripCurrency) : displayMoney(recommendedDailyHkd || Math.round(amountToHkd(dailyBudget, resolvedTripCurrency, state)), 'HKD')}</span>
                <ChevronRight size={18} />
              </button>
            </>
          );
        })()}
      </GlassCard>
      </Reveal>

      {/* 2.5 今日開支獨立 Washi 卡片 */}
      <Reveal className="dashboard-reveal" delay={0.04}>
      <GlassCard as="div" className="washi-today-stats-card dashboard-magic-today preview-dashboard-today relative overflow-hidden z-10">
        <div className="preview-dashboard-today-head">
          <h3>今日狀態</h3>
          <span><CalendarDays size={18} /> {chineseDateLabel(displayDayDate)}</span>
          <div className="preview-dashboard-currency preview-dashboard-today-currency" role="group" aria-label="今日狀態顯示貨幣">
            <button
              type="button"
              className={activeDisplayCurrency === 'HKD' ? 'is-active' : ''}
              onClick={() => updateState({ displayCurrency: 'HKD' })}
            >
              HKD
            </button>
            <button
              type="button"
              className={activeDisplayCurrency === resolvedTripCurrency ? 'is-active' : ''}
              onClick={() => updateState({ displayCurrency: resolvedTripCurrency })}
            >
              {resolvedTripCurrency}
            </button>
          </div>
          <div className="preview-dashboard-weather-mini" aria-label="今日天氣摘要"><CloudSun size={22} /> -- <small>--</small></div>
        </div>
        <div className="preview-dashboard-today-chart" aria-label="每日預算使用率">
          <AnimatedCircularProgressBar
            value={todayBudgetPctCapped}
            gaugePrimaryColor={todayBudgetPct > 100 ? '#D94132' : '#3F6F49'}
            gaugeSecondaryColor="rgba(122, 99, 67, 0.16)"
            className="size-full"
          >
            <div className="preview-dashboard-today-chart-copy">
              <strong><TickerMoney text={`${Math.round(todayBudgetPct)}%`} /></strong>
              <span>每日預算使用</span>
            </div>
          </AnimatedCircularProgressBar>
          <div className="preview-dashboard-today-chart-text">
            <span>今日 vs 平均每日預算</span>
            <strong>{todaySpendPrimary} / {dailyBudgetPrimary}</strong>
            <small>{todayBudgetPct > 100 ? '今日已高於平均每日預算' : '仍在今日平均預算線內'} · {todaySpendSecondary}</small>
          </div>
        </div>
        <div className="preview-dashboard-today-grid">
          <div>
            <span>今日支出</span>
            <strong><TickerMoney text={todaySpendPrimary} /></strong>
            <small>{todaySpendSecondary} · 已記 {dailyReceipts.length} 筆</small>
          </div>
          <div>
            <span>每日預算使用</span>
            <strong>{Math.round(todayBudgetPct)}%</strong>
            <i><b style={{ width: `${Math.min(100, Math.round(todayBudgetPct))}%` }} /></i>
            <small>目標：{dailyBudgetPrimary} · {dailyBudgetSecondary}</small>
          </div>
          <div>
            <span>日均結餘</span>
            <strong>{dayRemainingPrimary}</strong>
            <small>{dayRemainingSecondary}</small>
            <small>{dayRemainingHkd > 0 ? '狀態良好' : '需要留意'}</small>
          </div>
        </div>
      </GlassCard>
      </Reveal>

      {/* 3. Today 行程時間軸 */}
      <Reveal className="dashboard-reveal" delay={0.08}>
      <GlassCard as="div" className="today-itinerary-card dashboard-compact-itinerary washi-timeline-container p-6 rounded-[28px] bg-white/50 backdrop-blur-md border border-white/60 shadow-sm mb-6 z-10">
        <div className="flex justify-between items-center mb-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-[#8C7864] uppercase tracking-wider">行程摘要</span>
            <h3 className="text-lg font-bold text-slate-800 mt-0.5">今日行程</h3>
          </div>
          <div className="flex items-center gap-1 px-3 py-1 bg-amber-50 border border-amber-200/60 rounded-full text-[11px] font-bold text-amber-700">
            <CloudSun size={14} />
            <span>--</span>
          </div>
        </div>

        <div className="dashboard-compact-itinerary-list">
          {displaySpots.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <MapPin size={24} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm font-medium">今日未有行程安排</p>
              <p className="text-xs mt-1">可喺 Timeline 或 Settings 新增行程</p>
            </div>
          )}
          {displaySpots.map((spot, idx) => {
            const details = getSpotIconDetails(spot.type, spot.name);
            const spotKey = spot.id || spot.spotId || `${today}_${spot.time || 'time'}_${spot.name || idx}_${idx}`;
            // Empty names must not match: ''.includes(x)/x.includes('') would attach one receipt to every spot.
            const spotName = spot.name.trim().toLowerCase();
            const matchedReceipt = spotName ? dailyReceipts.find((r) => {
              const store = displayStore(r).trim().toLowerCase();
              return store ? (store.includes(spotName) || spotName.includes(store)) : false;
            }) : undefined;
            const spotMeta = [spot.note, spot.address].filter(Boolean).join(' · ');
            return (
              <article
                key={spotKey}
                className="dashboard-compact-itinerary-row"
                onClick={() => openMapExternal(spot.mapUrl, spot.name, spot.address)}
                title="點擊開啟 Google Map"
              >
                <time>{spot.time || '--:--'}</time>
                <div className={`dashboard-compact-itinerary-icon ${details.bgClass}`}>
                  {details.icon}
                </div>
                <div className="dashboard-compact-itinerary-main">
                  <strong>{spot.name}</strong>
                  <span>{spotMeta || spot.type || 'Trip stop'}</span>
                  <small>{spot.type || 'itinerary'}{day?.city || day?.region ? ` · ${day?.city || day?.region}` : ''}</small>
                </div>
                <div className="dashboard-compact-itinerary-actions">
                  {matchedReceipt ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(matchedReceipt);
                      }}
                    >
                      {currencyPrefix(matchedReceipt.currency || 'JPY')}{fmt(matchedReceipt.total)}
                    </button>
                  ) : (
                    <span><MapPin size={14} /> 地圖</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {/* 展開全部按鈕 */}
        <button
          className="compact-touch-action w-full text-center text-xs font-bold text-[#8C7864] flex items-center justify-center gap-1 mt-4 hover:text-slate-800 active:scale-95 transition-all border-none bg-transparent focus:outline-none"
          type="button"
          onClick={() => onTab('timeline')}
        >
          <span>查看完整行程</span>
          <ChevronDown size={14} />
        </button>
      </GlassCard>
      </Reveal>

      {/* 4. 最近花費 */}
      <Reveal className="dashboard-reveal" delay={0.12}>
      <GlassCard as="div" className="washi-recent-card dashboard-magic-records dashboard-compact-recent p-6 rounded-[28px] bg-white/50 backdrop-blur-md border border-white/60 shadow-sm mb-6 z-10">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-bold text-slate-800">Recent Expenses</h3>
          <button
            className="compact-touch-action text-xs font-bold text-[#D94132] hover:underline border-none bg-transparent focus:outline-none"
            type="button"
            onClick={() => onTab('history')}
          >
            View all
          </button>
        </div>

        <div className="dashboard-compact-recent-list">
          {recentReceipts.length ? recentReceipts.slice(0, 6).map((r) => {
            const photoSrc = safePhotoUrl(r.photoUrl, r.photoThumb);
            return (
              <button
                key={r.id}
                type="button"
                className="dashboard-compact-recent-row"
                onClick={() => onOpen(r)}
              >
                <VisualIcon id={r.category as any} size="sm" className="dashboard-compact-recent-icon" />
                <div className="dashboard-compact-recent-main">
                  <strong>{displayStore(r)}</strong>
                  <span>{categoryById(r.category).name} · {(r.date || '').split('-').slice(1).join('/')}</span>
                </div>
                {photoSrc && (
                  <span
                    className="dashboard-compact-recent-photo"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setViewPhoto(r); }}
                    role="button"
                    tabIndex={0}
                    aria-label={`查看 ${displayStore(r)} 收據相片`}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        setViewPhoto(r);
                      }
                    }}
                  >
                    <Camera size={13} />
                  </span>
                )}
                <div className="dashboard-compact-recent-amount">
                  <strong>{formatCurrencyAmount(Number(r.total) || 0, r.currency || r.originalCurrency || resolvedTripCurrency)}</strong>
                  <span>{formatCurrencyAmount(getReceiptHkdAmount(r, state), 'HKD')}</span>
                </div>
              </button>
            );
          }) : (
            <p className="text-center text-xs text-slate-400 py-6">暫時未有支出紀錄。</p>
          )}
        </div>

        <button
          className="washi-add-expense-btn washi-btn flex items-center justify-center gap-1.5 w-full bg-white border border-[#D94132] text-[#D94132] font-bold py-3.5 rounded-2xl mt-4 active:scale-98 transition-all hover:bg-red-50/20 focus:outline-none"
          type="button"
          onClick={onManual}
        >
          <Plus size={18} />
          <span>Add Expense</span>
        </button>
      </GlassCard>
      </Reveal>

      </div>

      {/* 5. 名古屋 2026 和風 Dock Bar (懸浮底欄) */}
      <div className="washi-floating-tabbar pointer-events-auto">
        <button
          className="washi-dock-item active"
          onClick={() => onTab('dashboard')}
        >
          <Compass size={20} />
          <span>Trip</span>
        </button>

        <button
          className="washi-dock-item"
          onClick={() => onTab('history')}
        >
          <BarChart3 size={20} />
          <span>Expenses</span>
        </button>

        <div className="relative w-[60px] h-full flex items-center justify-center">
          <button
            className="washi-floating-add-btn"
            onClick={onManual}
            aria-label="Add Expense"
          >
            <Plus size={24} />
          </button>
        </div>

        <button
          className="washi-dock-item"
          onClick={() => onTab('timeline')}
        >
          <CalendarDays size={20} />
          <span>Itinerary</span>
        </button>

        <button
          className="washi-dock-item"
          onClick={() => onTab('settings')}
        >
          <MoreHorizontal size={20} />
          <span>More</span>
        </button>
      </div>

      {/* 行程彈窗 Sheet */}
      {sheet && (
        <div className="modal-backdrop" role="presentation" onClick={() => setSheet(null)} style={{ zIndex: 99999 }}>
          <section
            className="modal dashboard-sheet bg-white rounded-3xl p-6 shadow-2xl max-w-[340px] w-full animate-fade-in"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-800">
                {sheet.kind === 'spot' ? '行程詳情' : '今日紀錄'}
              </h2>
              <button
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500"
                type="button"
                aria-label="關閉"
                onClick={() => setSheet(null)}
              >
                <X size={16} />
              </button>
            </div>
            {sheet.kind === 'spot' ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-[#D4A359]">
                    <MapPin size={24} />
                  </div>
                  <div className="flex flex-col">
                    <p className="text-xs font-semibold text-slate-400">{sheet.spot.time || '未設定時間'}</p>
                    <h3 className="text-base font-bold text-slate-800">{sheet.spot.name}</h3>
                  </div>
                </div>
                {sheet.spot.note && (
                  <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    {sheet.spot.note}
                  </p>
                )}
                {sheet.spot.address && (
                  <p className="text-xs text-slate-400">
                    地址：{sheet.spot.address}
                  </p>
                )}
                <div className="flex gap-2 mt-2">
                  <button
                    className="flex-1 bg-slate-100 text-slate-700 font-bold py-2.5 rounded-xl text-xs text-center border border-slate-200/50 hover:bg-slate-200/50 transition-all"
                    type="button"
                    onClick={() => openMapExternal(sheet.spot.mapUrl, sheet.spot.name, sheet.spot.address)}
                  >
                    開地圖
                  </button>
                  <button
                    className="flex-1 bg-[#D94132] text-white font-bold py-2.5 rounded-xl text-xs hover:bg-red-700 transition-all"
                    type="button"
                    onClick={() => { setSheet(null); onTab('timeline'); }}
                  >
                    去 Timeline 編輯
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      )}
      {/* 建立新旅程 Wizard 彈窗 */}
      {activeIsWizardOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
          <div ref={wizardContainerRef} className="bg-white/95 backdrop-blur-xl w-full max-w-md rounded-3xl border border-white/80 shadow-2xl p-6 relative overflow-hidden flex flex-col gap-4 scale-in">
            <div className="absolute -top-12 -right-12 w-28 h-28 bg-[#D94132]/5 rounded-full blur-xl pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 w-28 h-28 bg-[#6D5643]/5 rounded-full blur-xl pointer-events-none" />

            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex flex-col">
                <h3 className="text-lg font-bold text-slate-800 tracking-tight font-serif flex items-center gap-1.5">
                  <span>⛩️</span>
                  <span>建立新旅程</span>
                </h3>
                <p className="text-[10px] font-bold text-[#6D5643] tracking-widest uppercase mt-0.5">
                  Step {wizardStep} of 4 • {wizardStep === 1 ? '基本資訊' : wizardStep === 2 ? '日期天數' : wizardStep === 3 ? '預算幣種' : '旅程詳情'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeWizard}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 flex items-center justify-center transition-all border-none focus:outline-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex gap-1.5 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#D94132] transition-all duration-300" style={{ width: `${(wizardStep / 4) * 100}%` }} />
            </div>

            <div className="flex-1 py-2 flex flex-col gap-4">
              {wizardStep === 1 && (
                <div className="flex flex-col gap-3.5 animate-slide-in">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500">旅程名稱 <span className="text-[#D94132]">*</span></label>
                    <input
                      type="text"
                      value={newTripName}
                      onChange={(e) => setNewTripName(e.target.value)}
                      placeholder="例如：名古屋櫻花祭 2026"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#6D5643] bg-slate-50/50 focus:bg-white text-sm focus:outline-none transition-all"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500">目的地 <span className="text-[10px] text-slate-400 font-semibold">(城市或國家名稱，影響天氣與幣種)</span></label>
                    <input
                      type="text"
                      value={newTripDestination}
                      onChange={(e) => setNewTripDestination(e.target.value)}
                      placeholder="例如：濟州、首爾、名古屋、東京"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#6D5643] bg-slate-50/50 focus:bg-white text-sm focus:outline-none transition-all"
                    />
                  </div>
                  {newTripDestination.trim().length >= 2 && (
                    <div className="rounded-xl border border-[#6D5643]/10 bg-[#6D5643]/5 px-3 py-2 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-[#6D5643]">
                        <span>
                          {destinationIdeaStatus === 'loading'
                            ? '正在網上搜尋景點...'
                            : destinationIdeaStatus === 'online'
                              ? '網上景點建議'
                              : destinationIdeaStatus === 'fallback'
                                ? '離線景點建議'
                                : '景點建議'}
                        </span>
                        {destinationIdeas.length > 0 && <span>{destinationIdeas[0]?.source === 'online' ? 'Wikivoyage' : 'Local'}</span>}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {destinationIdeas.length ? destinationIdeas.map((idea) => (
                          <button
                            type="button"
                            key={idea.id}
                            onClick={() => applyDestinationIdea(idea)}
                            className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-white hover:bg-[#D94132]/10 text-[#6D5643] border border-[#6D5643]/15 transition active:scale-95 cursor-pointer"
                          >
                            {idea.label}
                          </button>
                        )) : (
                          <span className="text-[11px] font-bold text-slate-400">輸入更完整地方名會有更準建議</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {wizardStep === 2 && (
                <div className="flex flex-col gap-3.5 animate-slide-in">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500">開始日期</label>
                    <input
                      type="date"
                      value={newTripStartDate}
                      onChange={(e) => handleStartDateChange(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#6D5643] bg-slate-50/50 focus:bg-white text-sm focus:outline-none transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500">旅程日數</label>
                    <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] gap-2">
                      <button
                        type="button"
                        aria-label="減少旅程日數"
                        onClick={() => applyTripDuration(selectedTripDuration - 1)}
                        className="h-11 rounded-xl border border-slate-200 bg-white text-lg font-black text-[#6D5643] shadow-sm transition active:scale-95 disabled:opacity-40"
                        disabled={selectedTripDuration <= 1}
                      >
                        −
                      </button>
                      <select
                        aria-label="選擇旅程日數"
                        value={selectedTripDuration}
                        onChange={(e) => applyTripDuration(Number(e.target.value))}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#6D5643] bg-slate-50/50 focus:bg-white text-sm font-bold text-slate-700 focus:outline-none transition-all cursor-pointer"
                      >
                        {durationOptions.map((days) => (
                          <option value={days} key={days}>{days} 天</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        aria-label="增加旅程日數"
                        onClick={() => applyTripDuration(selectedTripDuration + 1)}
                        className="h-11 rounded-xl border border-slate-200 bg-white text-lg font-black text-[#6D5643] shadow-sm transition active:scale-95 disabled:opacity-40"
                        disabled={selectedTripDuration >= 60}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500">結束日期</label>
                    <input
                      type="date"
                      value={newTripEndDate}
                      onChange={(e) => setNewTripEndDate(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#6D5643] bg-slate-50/50 focus:bg-white text-sm focus:outline-none transition-all"
                    />
                  </div>
                  {newTripStartDate && newTripEndDate && (
                    <div className="bg-[#6D5643]/5 border border-[#6D5643]/10 px-4 py-2.5 rounded-xl flex items-center justify-between text-xs text-[#6D5643] font-bold">
                      <span>📅 計算天數 (Duration)</span>
                      <span>{calculatedDuration} 天</span>
                    </div>
                  )}
                </div>
              )}

              {wizardStep === 3 && (
                <div className="flex flex-col gap-3.5 animate-slide-in">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500">旅程總預算 (Budget)</label>
                    <input
                      type="number"
                      min="0"
                      value={newTripBudget}
                      onChange={(e) => setNewTripBudget(e.target.value)}
                      placeholder="例如：150000"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#6D5643] bg-slate-50/50 focus:bg-white text-sm focus:outline-none transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500">主結算幣種</label>
                    <select
                      aria-label="主結算幣種"
                      value={newTripCurrency}
                      onChange={(e) => setNewTripCurrency(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#6D5643] bg-slate-50/50 focus:bg-white text-sm focus:outline-none transition-all cursor-pointer"
                    >
                      <option value="JPY">💴 日圓 (JPY)</option>
                      <option value="KRW">🇰🇷 韓元 (KRW)</option>
                      <option value="TWD">🇹🇼 台幣 (TWD)</option>
                      <option value="HKD">💵 港幣 (HKD)</option>
                      <option value="USD">💵 美元 (USD)</option>
                      <option value="EUR">🇪🇺 歐元 (EUR)</option>
                      <option value="GBP">🇬🇧 英鎊 (GBP)</option>
                      <option value="CNY">🇨🇳 人民幣 (CNY)</option>
                      <option value="SGD">🇸🇬 新加坡元 (SGD)</option>
                      <option value="THB">🇹🇭 泰銖 (THB)</option>
                      <option value="MYR">🇲🇾 馬幣 (MYR)</option>
                      <option value="VND">🇻🇳 越南盾 (VND)</option>
                      <option value="PHP">🇵🇭 菲律賓披索 (PHP)</option>
                      <option value="AUD">🇦🇺 澳元 (AUD)</option>
                      <option value="NZD">🇳🇿 紐元 (NZD)</option>
                    </select>
                  </div>
                </div>
              )}

              {wizardStep === 4 && (
                <div className="flex flex-col gap-3.5 animate-slide-in">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-[#6D5643]">📋 貼上你的行程計劃 (強烈建議)</label>
                    <p className="text-[10px] text-slate-400 font-semibold -mt-0.5 mb-0.5">可以貼上長篇行程、酒店確認郵件或網上 copy 嘅筆記，AI 會幫你自動整理做 Timeline 同查天氣！</p>
                    <textarea
                      value={newTripDetails}
                      onChange={(e) => setNewTripDetails(e.target.value)}
                      placeholder={`例如：\n5月20號飛名古屋玩6日\n住 Daiwa Royal Hotel，check-in 15:00\nDay 1: 中部國際機場 → 名古屋城 → 大須商店街\nDay 2: 白川鄉合掌村 → 高山老街 → 飛驒牛午餐\n預算10萬日元...`}
                      rows={8}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#6D5643] bg-slate-50/50 focus:bg-white text-sm focus:outline-none transition-all resize-vertical"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 mt-0.5">
                    <span className="text-[10px] font-bold text-slate-400">💡 {newTripDestination || '目的地'} 景點靈感 (一鍵套用)：</span>
                    <div className="flex flex-wrap gap-1.5">
                      {destinationIdeas.length ? destinationIdeas.map((idea) => (
                        <button
                          type="button"
                          key={idea.id}
                          onClick={() => applyDestinationIdea(idea)}
                          className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/50 transition active:scale-95 cursor-pointer"
                        >
                          {idea.label}
                        </button>
                      )) : (
                        <span className="text-[11px] font-bold text-slate-400">第一步填目的地後會自動建議景點</span>
                      )}
                    </div>
                  </div>
                  {tripCreateStatus !== 'idle' && (
                    <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-800">
                      {tripCreateStatus === 'analyzing'
                        ? '正在依序嘗試 Trip AI 模型，完成後會自動建立 Timeline、Weather target 同後端同步項目...'
                        : 'Trip AI 模型梯隊暫時未能產生完整行程，會用目的地建議先建立可用時間線。'}
                    </div>
                  )}
                  {tripCreateError && (
                    <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-[11px] font-bold text-red-700">
                      {tripCreateError}。請稍後再試或到 Settings 換可用模型；為避免繞過用量限制，未有自動使用景點 fallback。
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center border-t border-slate-100 pt-4 gap-2">
              {wizardStep > 1 ? (
                <button
                  type="button"
                  onClick={() => setWizardStep(wizardStep - 1)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all border-none focus:outline-none cursor-pointer"
                >
                  上一步
                </button>
              ) : (
                <button
                  type="button"
                  disabled={tripCreateStatus === 'analyzing'}
                  onClick={() => {
                    const defaultName = `新旅程_${new Date().toLocaleDateString('zh-HK')}`;
                    handleCreateTrip(newTripName.trim() || defaultName);
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-all border-none focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  稍後填寫 (快速跳過)
                </button>
              )}

              {wizardStep < 4 ? (
                <button
                  type="button"
                  disabled={(wizardStep === 1 && !newTripName.trim()) || tripCreateStatus === 'analyzing'}
                  onClick={() => setWizardStep(wizardStep + 1)}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all border-none focus:outline-none cursor-pointer ${
                    wizardStep === 1 && !newTripName.trim()
                      ? 'bg-slate-300 cursor-not-allowed'
                      : 'bg-[#6D5643] hover:bg-[#5C4837]'
                  }`}
                >
                  下一步
                </button>
              ) : (
                <button
                  type="button"
                  disabled={tripCreateStatus === 'analyzing'}
                  onClick={() => handleCreateTrip()}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#D94132] hover:bg-red-700 transition-all border-none focus:outline-none cursor-pointer animate-pulse disabled:opacity-60 disabled:cursor-wait"
                >
                  {tripCreateStatus === 'analyzing' ? '分析中...' : '完成創建 🎉'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 收據圖片大圖 Lightbox 彈窗 */}
      {viewPhoto && <ReceiptPhotoModal receipt={viewPhoto} onClose={() => setViewPhoto(null)} />}
    </section>
  );
}

// 供 History.tsx 同 Timeline.tsx 共用導入的 ReceiptRow 元件 (在 Phase 27 已經 100% 修復收據圖片點擊預覽與排版擠壓)
export function ReceiptRow({
  state,
  receipt,
  onOpen,
  onViewPhoto
}: {
  state: AppState;
  receipt: Receipt;
  onOpen: (receipt: Receipt) => void;
  onViewPhoto?: (receipt: Receipt) => void
}) {
  const cat = categoryById(receipt.category);
  const persons = getPersons(state);
  const person = persons.find((p) => p.id === (receipt.personId || persons[0].id)) || persons[0];
  const beneficiary = receipt.splitMode === 'private' && receipt.beneficiaryId && receipt.beneficiaryId !== receipt.personId
    ? persons.find((p) => p.id === receipt.beneficiaryId)
    : null;
  const photoSrc = safePhotoUrl(receipt.photoUrl, receipt.photoThumb);
  const mapLabel = receipt.address || receipt.regionSnapshot || receipt.region || displayStore(receipt);
  const mapHref = (receipt.mapUrl || receipt.address)
    ? safeExternalUrl(receipt.mapUrl, mapsUrl(displayStore(receipt), receipt.address || receipt.regionSnapshot || receipt.region))
    : '';

  return (
    <div
      className="receipt-row flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl mb-3 shadow-sm hover:translate-y-[-1px] transition-all cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(receipt)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(receipt); }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <VisualIcon id={receipt.category as any} size="md" className="shrink-0" />
        <span className="receipt-main min-w-0 flex-1 flex flex-col justify-center gap-0.5">
          <strong className="flex items-center gap-1.5 min-w-0 text-slate-800 font-bold text-[14px] leading-snug">
            <span className="flex items-center gap-1 min-w-0 flex-1 flex-wrap">
              {isPendingReceipt(receipt) && <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded-md shrink-0">⏳ pending</span>}
              {beneficiary && <span className="text-[10px] bg-pink-100 text-pink-800 font-bold px-1.5 py-0.5 rounded-md shrink-0">代付</span>}
              <span className="line-clamp-2 break-all whitespace-normal">{displayStore(receipt)}</span>
            </span>
            {photoSrc && (
              <button
                type="button"
                className="flex-shrink-0 flex items-center text-[#D94132]"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onViewPhoto?.(receipt); }}
                style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
              >
                <Camera size={14} className="w-4 h-4 text-[#D94132]" />
              </button>
            )}
          </strong>
          <small className="text-slate-400 text-xs font-medium line-clamp-2 block mt-0.5 leading-tight whitespace-normal">
            {[receipt.time, cat.name, person.name, receipt.bookingRef ? `編號 ${receipt.bookingRef}` : ''].filter(Boolean).join(' · ')}
          </small>
          {mapHref && (
            <a
              className="inline-flex w-fit items-center gap-1 text-[11px] font-bold text-[#18395C] hover:underline"
              href={mapHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`地圖：${mapLabel}`}
              onClick={(e) => e.stopPropagation()}
            >
              <MapPin size={12} /> 地圖：{mapLabel}
            </a>
          )}
        </span>
      </div>
      <span className="amount flex flex-col items-end shrink-0">
        <strong className="text-[15px] font-extrabold text-slate-900">{formatCurrencyAmount(receipt.total, receipt.currency || receipt.originalCurrency || state.tripCurrency)}</strong>
        <small className="text-[10px] text-slate-400">{formatCurrencyAmount(getReceiptHkdAmount(receipt, state), 'HKD')}</small>
      </span>
    </div>
  );
}
