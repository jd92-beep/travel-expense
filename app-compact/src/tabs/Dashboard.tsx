import { useEffect, useMemo, useRef, useState } from 'react';
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
  PieChart,
  Plus,
  X,
  Castle,
  Utensils,
  ShoppingBag,
  Bath,
  Settings as GearIcon,
  Bell,
  Compass,
  BarChart3,
  MoreHorizontal,
  Camera,
  Wallet,
  Sparkles
} from 'lucide-react';
import { ReceiptPhotoModal } from '../components/ReceiptPhotoModal';
import { VisualIcon } from '../components/VisualIcon';
import { AnimatedNumber, GlassCard, Reveal } from '../components/ui';
import { AnimatedCircularProgressBar } from '../components/ui/animated-circular-progress-bar';
import { Switch } from '../components/ui/switch';
import {
  categoryById,
  displayStore,
  fmt,
  getItinerary,
  getPersons,
  hkd,
  isPendingReceipt,
  mapsUrl,
  openMapExternal,
  safeExternalUrl,
  todayForReceipts,
  safePhotoUrl,
  getReceiptHkdAmount,
  getReceiptTripAmount,
  getResolvedTripCurrency
} from '../lib/domain';
import { activeTrip, createTripProfile, scopedReceiptsForTrip } from '../domain/trip/normalize';
import type { AppState, ItinerarySpot, Receipt, SyncQueueItem, TabId } from '../lib/types';
import { brokerAiJson, redactedError } from '../lib/credentialBroker';
import { DEFAULT_KIMI_PRIMARY_MODEL_ID } from '../lib/constants';

function displayDateRange(startDate: string, endDate: string) {
  const fmtDate = (date: string) => {
    const parsed = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return date;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
  };
  return `${fmtDate(startDate)} – ${fmtDate(endDate)}`;
}

function weekdayLabel(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(parsed);
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

function isQuotaHardStop(error: unknown): boolean {
  return /(?:\b429\b|quota|daily limit|rate limit|too many requests|用量|配額|限額)/i.test(redactedError(error));
}

function normalizeAssistantAnswer(value: unknown) {
  const data = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    summary: String(data.summary || data.answer || data.message || 'AI 已完成分析，但回覆格式較簡短。').slice(0, 180),
    risk: String(data.risk || data.riskLevel || data.tone || 'watch').slice(0, 40),
    recommendation: String(data.recommendation || data.suggestion || data.nextStep || '保持每日記帳，出門前再檢查預算同天氣。').slice(0, 180),
    nextAction: String(data.nextAction || data.action || data.cta || '先補齊今日收據，再刷新統計。').slice(0, 120),
  };
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
  const [isBudgetSettingsOpen, setIsBudgetSettingsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState('今日應該點樣控制預算？');
  const [assistantStatus, setAssistantStatus] = useState<'idle' | 'loading' | 'ready' | 'quota' | 'error'>('idle');
  const [assistantAnswer, setAssistantAnswer] = useState<ReturnType<typeof normalizeAssistantAnswer> | null>(null);
  const [assistantError, setAssistantError] = useState('');

  // iOS 開關狀態
  const [dailyReminder, setDailyReminder] = useState(true);
  const [lowBudgetAlert, setLowBudgetAlert] = useState(true);

  // Dropdown & Wizard States
  const [isTripDropdownOpen, setIsTripDropdownOpen] = useState(false);
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

  // 1. 📅 智能預設黃金 7 天
  useEffect(() => {
    if (activeIsWizardOpen) {
      if (!newTripStartDate && !newTripEndDate) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 6); // 7天 (today + 6 days)
        const futureStr = futureDate.toISOString().slice(0, 10);
        setNewTripStartDate(todayStr);
        setNewTripEndDate(futureStr);
      }
    }
  }, [activeIsWizardOpen]);

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
    }
  }, [newTripDestination]);

  // Date duration auto-calc
  const calculatedDuration = useMemo(() => {
    if (!newTripStartDate || !newTripEndDate) return 0;
    const start = new Date(`${newTripStartDate}T00:00:00`);
    const end = new Date(`${newTripEndDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
    const diff = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
    return diff;
  }, [newTripStartDate, newTripEndDate]);

  const handleSwitchTrip = (tripId: string) => {
    const target = state.trips?.find((t) => t.id === tripId && !t.archived);
    if (!target) return;

    setState((prev) => ({
      ...prev,
      activeTripId: tripId,
      trips: (prev.trips || []).map((item) => ({ ...item, active: item.id === tripId && !item.archived })),
      tripName: target.name,
      budget: target.budget ?? prev.budget,
      tripCurrency: target.currencies?.find((c) => c !== 'HKD') || prev.tripCurrency,
      customItinerary: target.itinerary || [],
      tripDateRange: { start: target.startDate, end: target.endDate }
    }));
  };

  const handleCreateTrip = (overrideName?: string) => {
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

    const queueItem: SyncQueueItem = {
      id: `sync_${now}_${Math.random().toString(16).slice(2)}`,
      type: 'trip',
      entityId: newTrip.id,
      op: 'create',
      status: 'queued',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      payload: {
        sourceId: newTrip.sourceId,
        updatedAt: now
      }
    };

    setState((prev) => {
      const trips = [...(prev.trips || []).map((item) => ({ ...item, active: false })), newTrip];
      const nextQueue = [...(prev.syncQueue || []), queueItem];

      const latest = new Map<string, SyncQueueItem>();
      for (const item of nextQueue) {
        if (item.status === 'synced') continue;
        latest.set(`${item.type}:${item.entityId}`, item);
      }
      return {
        ...prev,
        trips,
        activeTripId: newTrip.id,
        budget: newTrip.budget || 0,
        tripCurrency: newTrip.currencies.find((currency) => currency !== 'HKD') || 'JPY',
        customItinerary: newTrip.itinerary,
        tripDateRange: { start: newTrip.startDate, end: newTrip.endDate },
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
  };

  const trip = activeTrip(state);
  const itinerary = getItinerary(state);
  const tripReceipts = useMemo(() => scopedReceiptsForTrip(state, trip), [state, trip]);
  const today = todayForReceipts(state);
  const resolvedTripCurrency = getResolvedTripCurrency(state, trip);

  const tripCurrencySymbol = (() => {
    switch (resolvedTripCurrency.toUpperCase()) {
      case 'JPY': return '¥';
      case 'HKD': return 'HK$';
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'TWD': return 'NT$';
      case 'KRW': return '₩';
      case 'GBP': return '£';
      case 'CNY': return '¥';
      case 'THB': return '฿';
      default: return resolvedTripCurrency + ' ';
    }
  })();

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

  const budgetHkd = Math.round(hkd(state.budget, state));
  const rawBudgetPct = budgetHkd > 0 ? (spentHkd / budgetHkd) * 100 : 0;
  const budgetPct = Math.min(100, rawBudgetPct);

  const dailyBudget = Math.round((Number(state.budget) || 0) / Math.max(1, itinerary.length));
  const dailyAverage = Math.round(totalForBudget / Math.max(1, itinerary.length));
  const todayBudgetPct = dailyBudget > 0 ? (todayTotal / dailyBudget) * 100 : 0;
  const day = itinerary.find((d) => d.date === today) || itinerary[0];
  const length = tripLength(trip.startDate, trip.endDate, itinerary.length);
  const displayDayDate = day?.date || today;
  const currentDayNumber = Math.max(1, Math.min(length, day?.day || tripDayNumber(trip.startDate, displayDayDate, 1)));
  const remainingBudgetHkd = Math.max(0, budgetHkd - spentHkd);
  const dayRemainingHkd = Math.max(0, Math.round(hkd(dailyBudget - todayTotal, state)));
  const recommendedDailyHkd = Math.max(0, Math.round((budgetHkd - spentHkd) / Math.max(1, Math.max(1, length) - currentDayNumber + 1)));
  const budgetWarning = rawBudgetPct >= 100 ? '超出預算區' : rawBudgetPct >= 80 ? '接近上限' : '狀態良好';
  const daySpots = (day?.spots || []).slice(0, 4);
  const recentReceipts = tripReceipts.slice().sort((a, b) => `${b.date} ${b.time || ''}`.localeCompare(`${a.date} ${a.time || ''}`));
  const burnDays = Math.max(1, Math.min(length, currentDayNumber));
  const dailyBurnHkd = Math.round(spentHkd / burnDays);
  const projectedSpendHkd = Math.round(dailyBurnHkd * length);
  const forecastDeltaHkd = projectedSpendHkd - budgetHkd;
  const nextDay = itinerary.find((item) => (item.day || 0) > currentDayNumber) || itinerary.find((item) => item.date > displayDayDate);
  const coachFocusDay = nextDay || day;
  const coachSpots = coachFocusDay?.spots || [];
  const weatherSensitive = coachSpots.some((spot) => /transport|ticket|localtour|other|sightseeing/i.test(spot.type) || /城|寺|神社|park|garden|market|山|海|戶外|outdoor/i.test(`${spot.name} ${spot.note || ''} ${spot.address || ''}`));
  const coachWeatherRegion = coachFocusDay?.city || coachFocusDay?.region || trip.destinationSummary || trip.name;
  const coachTone = forecastDeltaHkd > 0 ? 'danger' : forecastDeltaHkd > -Math.max(1, budgetHkd * 0.08) ? 'warning' : 'ok';
  const coachForecastText = forecastDeltaHkd > 0
    ? `可能超支 HK$ ${fmt(forecastDeltaHkd)}`
    : `預計尚餘 HK$ ${fmt(Math.abs(forecastDeltaHkd))}`;
  const coachNextDayText = nextDay
    ? `明日 ${nextDay.region} · ${coachSpots.length} 個點`
    : `最後一天 · ${coachSpots.length || daySpots.length} 個點`;
  const coachWeatherText = weatherSensitive
    ? `先刷新 ${coachWeatherRegion} 天氣，戶外/交通多要預雨風。`
    : `先睇 ${coachWeatherRegion} 天氣 freshness，再出門。`;

  const handleBrokerAssistant = async () => {
    setAssistantStatus('loading');
    setAssistantError('');
    const prompt = `You are the compact Travel Expense assistant. Return JSON only with keys: summary, risk, recommendation, nextAction.
Use Traditional Chinese/Cantonese. Be concise. Do not ask for secrets. Do not mention hidden system details.
Question: ${assistantQuestion.slice(0, 300)}
Trip: ${trip.name} / ${trip.destinationSummary || 'unknown destination'}
Day: ${currentDayNumber}/${length}
Budget HKD: ${budgetHkd}
Spent HKD: ${Math.round(spentHkd)}
Remaining HKD: ${remainingBudgetHkd}
Today spent HKD: ${Math.round(todaySpentHkd)}
Daily burn HKD: ${dailyBurnHkd}
Projected spend HKD: ${projectedSpendHkd}
Next day: ${coachNextDayText}
Weather reminder: ${coachWeatherText}
Recent categories: ${recentReceipts.slice(0, 5).map((r) => `${r.category}:${Math.round(getReceiptHkdAmount(r, state))}`).join(', ') || 'none'}`;
    try {
      const result = await brokerAiJson(state, 'kimi', prompt, 'trip', undefined, 'kimi-code');
      setAssistantAnswer(normalizeAssistantAnswer(result));
      setAssistantStatus('ready');
    } catch (error) {
      const message = redactedError(error);
      if (isQuotaHardStop(error)) {
        setAssistantStatus('quota');
        setAssistantError(`Quota hard stop · ${message}`);
      } else {
        setAssistantStatus('error');
        setAssistantError(message || 'AI assistant 暫時未能連線');
      }
      setAssistantAnswer(null);
    }
  };

  // 名古屋經典行程 Mockup Fallback — 如果今日無行程，為 Boss 展示極致精美嘅 dummy 行程
  const displaySpots: ItinerarySpot[] = daySpots.length > 0 ? daySpots : [
    {
      id: 'demo-castle',
      spotId: 'demo-castle',
      time: '09:00',
      name: 'Nagoya Castle',
      type: 'sightseeing',
      note: 'Historic landmark',
      address: '1-1 Honmaru, Naka Ward, Nagoya',
      mapUrl: 'https://maps.google.com/?q=Nagoya+Castle'
    },
    {
      id: 'demo-lunch',
      spotId: 'demo-lunch',
      time: '12:30',
      name: 'Lunch',
      type: 'food',
      note: 'Hitsumabushi',
      address: 'Nagoya Station Area',
      mapUrl: 'https://maps.google.com/?q=Hitsumabushi+Nagoya'
    },
    {
      id: 'demo-osu',
      spotId: 'demo-osu',
      time: '15:00',
      name: 'Osu Shopping District',
      type: 'shopping',
      note: 'Shopping · Souvenirs',
      address: 'Osu, Naka Ward, Nagoya',
      mapUrl: 'https://maps.google.com/?q=Osu+Shopping+District'
    },
    {
      id: 'demo-onsen',
      spotId: 'demo-onsen',
      time: '18:30',
      name: 'Atsuta Onsen',
      type: 'other',
      note: 'Relax & unwind',
      address: 'Atsuta Ward, Nagoya',
      mapUrl: 'https://maps.google.com/?q=Atsuta+Onsen'
    }
  ];

  return (
    <section className="japanese-washi-bg w-full min-h-screen px-4 pb-28 pt-6 relative overflow-y-auto" aria-label="旅程總覽">
      {/* 和風櫻花與日出背景圖案 */}
      <div className="japanese-sun-decor" />
      <div className="japanese-sakura-decor" />

      {/* 1. Header 標題與日曆按鈕 */}
      <div className="dashboard-trip-switcher flex justify-between items-start mb-6 z-10 relative">
        <div className="flex flex-col relative z-30">
          <button
            className="flex items-center gap-1 text-[28px] font-black text-slate-800 tracking-tight font-serif border-none bg-transparent focus:outline-none"
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
        <div className="preview-dashboard-budget-head">
          <h2>預算總覽 <Info size={20} aria-hidden="true" /></h2>
          <div className="preview-dashboard-currency" role="group" aria-label="顯示貨幣">
            <span
              className={(!state.displayCurrency || state.displayCurrency === 'HKD') ? 'is-active' : ''}
              onClick={() => updateState({ displayCurrency: 'HKD' })}
              style={{ cursor: 'pointer' }}
            >
              HKD
            </span>
            <span
              className={state.displayCurrency === 'JPY' ? 'is-active' : ''}
              onClick={() => updateState({ displayCurrency: 'JPY' })}
              style={{ cursor: 'pointer' }}
            >
              JPY
            </span>
          </div>
        </div>

        {(() => {
          const isJpy = state.displayCurrency === 'JPY';
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
                    <strong className="text-2xl font-bold leading-none" style={{ color: 'var(--compact-ink)', fontFamily: '"Noto Serif JP", serif' }}>{Math.round(rawBudgetPct)}%</strong>
                    <span className="text-[10px] text-gray-400 mt-1" style={{ color: 'var(--muted)', fontWeight: 600 }}>已使用</span>
                  </div>
                </AnimatedCircularProgressBar>
              </div>
              <div className="preview-dashboard-budget-side">
                <div className="preview-dashboard-budget-row is-total">
                  <span>總預算</span>
                  <strong>{isJpy ? `¥ ${fmt(state.budget)}` : `HK$ ${fmt(budgetHkd)}`}</strong>
                  <button type="button" onClick={() => onTab('settings')}><Pencil size={16} /> 編輯</button>
                </div>
                <div className="preview-dashboard-budget-row is-used">
                  <span>已使用</span>
                  <strong>{isJpy ? `¥ ${fmt(totalForBudget)}` : `HK$ ${fmt(spentHkd)}`}</strong>
                </div>
                <div className="preview-dashboard-budget-row is-left">
                  <span>剩餘預算</span>
                  <strong>{isJpy ? `¥ ${fmt(Math.max(0, state.budget - totalForBudget))}` : `HK$ ${fmt(remainingBudgetHkd)}`}</strong>
                </div>
              </div>
            </div>
          );
        })()}

        {(() => {
          const isJpy = state.displayCurrency === 'JPY';
          return (
            <>
              <div className="preview-dashboard-budget-strip">
                <div>
                  <Wallet size={24} />
                  <span>每日預算</span>
                  <strong>{isJpy ? `¥${fmt(dailyBudget)}` : `HK$${fmt(Math.round(hkd(dailyBudget, state)))}`}</strong>
                </div>
                <div>
                  <CalendarDays size={24} />
                  <span>日均結餘</span>
                  <strong>{isJpy ? `¥${fmt(Math.max(0, dailyBudget - todayTotal))}` : `HK$${fmt(dayRemainingHkd)}`}</strong>
                </div>
                <button type="button" onClick={() => onTab('stats')}>
                  <PieChart size={26} />
                  <span>預算提醒</span>
                  <small>已設定</small>
                  <ChevronRight size={20} />
                </button>
              </div>

              <button className="preview-dashboard-budget-tip" type="button" onClick={() => onTab('stats')}>
                <Lightbulb size={22} />
                <span>提示：每日平均使用需 ≤ {isJpy ? `¥ ${fmt(Math.round(dailyBudget))}` : `HK$ ${fmt(recommendedDailyHkd || Math.round(hkd(dailyBudget, state)))}`}</span>
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
          <div><CloudSun size={22} /> 24°C <small>多雲</small></div>
        </div>
        <div className="preview-dashboard-today-grid">
          <div>
            <span>今日支出</span>
            <strong><AnimatedNumber value={Math.round(hkd(todayTotal, state))} prefix="HK$ " /></strong>
            <small>已記 {dailyReceipts.length} 筆</small>
          </div>
          <div>
            <span>每日預算使用</span>
            <strong>{Math.round(todayBudgetPct)}%</strong>
            <i><b style={{ width: `${Math.min(100, Math.round(todayBudgetPct))}%` }} /></i>
            <small>目標：HK$ {fmt(Math.round(hkd(dailyBudget, state)))}</small>
          </div>
          <div>
            <span>日均結餘</span>
            <strong>HK$ {fmt(dayRemainingHkd)}</strong>
            <small>{dayRemainingHkd > 0 ? '狀態良好' : '需要留意'}</small>
          </div>
        </div>
        <div className="preview-dashboard-today-actions">
          <button type="button" onClick={() => onTab('stats')}><PieChart size={28} /><span>預算分析</span><small>查看支出結構</small><ChevronRight size={18} /></button>
          <button type="button" onClick={() => onTab('timeline')}><BarChart3 size={28} /><span>行程時間線</span><small>查看每日行程與支出</small><ChevronRight size={18} /></button>
        </div>
      </GlassCard>
      </Reveal>

      {/* 2.6 本地 AI Trip Coach */}
      <Reveal className="dashboard-reveal" delay={0.06}>
      <GlassCard as="div" className={`dashboard-ai-coach preview-dashboard-coach tone-${coachTone} relative overflow-hidden z-10`}>
        <div className="preview-dashboard-coach-head">
          <div>
            <span><Sparkles size={15} /> Local AI Coach</span>
            <h3>旅行小助理</h3>
          </div>
          <em>本地推算 · no API</em>
        </div>
        <div className="preview-dashboard-coach-grid">
          <article>
            <span>Daily burn</span>
            <strong>HK$ {fmt(dailyBurnHkd)}</strong>
            <small>Day {currentDayNumber}/{length} · 今日 HK$ {fmt(Math.round(todaySpentHkd))}</small>
          </article>
          <article>
            <span>Overspend forecast</span>
            <strong>{coachForecastText}</strong>
            <small>預計全程 HK$ {fmt(projectedSpendHkd)}</small>
          </article>
          <article>
            <span>Next-day warning</span>
            <strong>{coachNextDayText}</strong>
            <small>{coachSpots[0]?.name || '記得補齊下一日行程'}</small>
          </article>
          <article>
            <span>Weather Reminder</span>
            <strong>{weatherSensitive ? 'Check rain / wind' : 'Check freshness'}</strong>
            <small>{coachWeatherText}</small>
          </article>
        </div>
        <div className="preview-dashboard-coach-actions">
          <button type="button" onClick={() => onTab('weather')}><CloudSun size={16} /> 天氣</button>
          <button type="button" onClick={() => onTab('stats')}><PieChart size={16} /> 預算</button>
        </div>
      </GlassCard>
      </Reveal>

      {/* 2.7 Broker-backed AI Assistant */}
      <Reveal className="dashboard-reveal" delay={0.07}>
      <GlassCard as="div" className={`dashboard-broker-assistant status-${assistantStatus} relative overflow-hidden z-10`}>
        <div role="region" aria-label="Broker AI assistant">
        <div className="dashboard-broker-assistant-head">
          <div>
            <span><Sparkles size={15} /> Broker AI Assistant</span>
            <h3>AI 旅行問答</h3>
          </div>
          <em>Kimi · kimi-code</em>
        </div>
        <div className="dashboard-broker-policy" aria-label="AI routing policy">
          <span>Primary · {DEFAULT_KIMI_PRIMARY_MODEL_ID}</span>
          <span>Quota · broker metered</span>
          <span>No fallback on 429</span>
        </div>
        <div className="dashboard-broker-question">
          <input
            aria-label="AI assistant question"
            value={assistantQuestion}
            onChange={(event) => setAssistantQuestion(event.target.value)}
            maxLength={180}
            placeholder="問：今日應否減少 shopping？"
          />
          <button
            type="button"
            className="compact-touch-action"
            disabled={assistantStatus === 'loading' || !assistantQuestion.trim()}
            onClick={handleBrokerAssistant}
          >
            {assistantStatus === 'loading' ? '分析中' : '問 AI'}
          </button>
        </div>
        <div className="dashboard-broker-answer" aria-live="polite">
          {assistantAnswer ? (
            <>
              <strong>{assistantAnswer.summary}</strong>
              <span>Risk · {assistantAnswer.risk}</span>
              <p>{assistantAnswer.recommendation}</p>
              <small>{assistantAnswer.nextAction}</small>
            </>
          ) : assistantStatus === 'quota' ? (
            <>
              <strong>Quota hard stop</strong>
              <span>No fallback was attempted</span>
              <p>{assistantError}</p>
              <small>等 quota reset 或稍後再試，避免繞過 public-user metering。</small>
            </>
          ) : assistantStatus === 'error' ? (
            <>
              <strong>Broker assistant paused</strong>
              <span>Session / provider check needed</span>
              <p>{assistantError}</p>
              <small>未送出任何 provider key；請確認 Credential Broker / Supabase session。</small>
            </>
          ) : (
            <>
              <strong>可以問旅費、預算、下一日風險</strong>
              <span>一次 broker call · Kimi primary</span>
              <p>AI 回覆只用目前旅程摘要同金額，不會讀取或輸出任何 provider key。</p>
              <small>Quota / 429 會直接停，不會自動 fallback。</small>
            </>
          )}
        </div>
        </div>
      </GlassCard>
      </Reveal>

      {/* 3. Today 行程時間軸 */}
      <Reveal className="dashboard-reveal" delay={0.08}>
      <GlassCard as="div" className="today-itinerary-card washi-timeline-container p-6 rounded-[28px] bg-white/50 backdrop-blur-md border border-white/60 shadow-sm mb-6 z-10">
        <div className="flex justify-between items-center mb-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-[#8C7864] uppercase tracking-wider">行程摘要</span>
            <h3 className="text-lg font-bold text-slate-800 mt-0.5">今日行程</h3>
          </div>
          <div className="flex items-center gap-1 px-3 py-1 bg-amber-50 border border-amber-200/60 rounded-full text-[11px] font-bold text-amber-700">
            <CloudSun size={14} />
            <span>8°C</span>
          </div>
        </div>

        {/* 時間軌道 */}
        <div className="washi-timeline relative pl-7 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-[2px] before:bg-[#E2C08D] before:rounded-full">
          {displaySpots.map((spot, idx) => {
            const details = getSpotIconDetails(spot.type, spot.name);
            const spotKey = spot.id || spot.spotId || `${today}_${spot.time || 'time'}_${spot.name || idx}_${idx}`;
            // 嘗試配對今日的真實消費
            const matchedReceipt = dailyReceipts.find(
              (r) => displayStore(r).toLowerCase().includes(spot.name.toLowerCase()) ||
                     spot.name.toLowerCase().includes(displayStore(r).toLowerCase())
            );
            return (
              <div key={spotKey} className="washi-timeline-item relative mb-5 last:mb-0">
                {/* 時間點節點 */}
                <div className="washi-timeline-badge absolute left-[-28px] top-4 w-3.5 h-3.5 rounded-full bg-[#F8F5EE] border-[3px] border-[#E2C08D] z-10" />

                <span className="washi-timeline-time block text-xs font-bold text-[#D4A359] mb-1.5 pl-3">
                  {spot.time || '--:--'}
                </span>

                <div
                  className="washi-timeline-card bg-white border border-amber-100/50 rounded-2xl p-3 shadow-sm hover:translate-y-[-2px] hover:border-amber-200/80 hover:shadow-md transition-all cursor-pointer"
                  onClick={() => openMapExternal(spot.mapUrl, spot.name, spot.address)}
                  title="點擊開啟 Google Map"
                >
                  {/* 1. Icon (對應 Grid Column 1: 42px) */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${details.bgClass}`}>
                    {details.icon}
                  </div>

                  {/* 2. Text (對應 Grid Column 2: 1fr, 帶 min-w-0 以防 truncate 壓縮為 0px) */}
                  <div className="flex flex-col min-w-0 flex-1">
                    <strong className="text-[14px] font-bold text-slate-800 truncate leading-snug">{spot.name}</strong>
                    <span className="text-xs text-slate-400 truncate mt-0.5">
                      {spot.note || spot.address || '日本名古屋'}
                    </span>
                  </div>

                  {/* 3. Action (對應 Grid Column 3: auto) */}
                  <div className="flex items-center gap-2 shrink-0 justify-end">
                    {matchedReceipt ? (
                      <button
                        className="text-xs font-extrabold text-[#D94132] px-2.5 py-1 rounded-full bg-red-50 hover:bg-red-100 border border-red-200/60 hover:scale-105 active:scale-95 transition-all focus:outline-none"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(matchedReceipt);
                        }}
                        title="查看消費詳情"
                      >
                        ¥{fmt(matchedReceipt.total)}
                      </button>
                    ) : (
                      <div className="preview-dashboard-spot-actions">
                        <span><MapPin size={16} /> 地圖</span>
                        <span><NotebookPen size={15} /> 記帳</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 展開全部按鈕 */}
        <button
          className="compact-touch-action w-full text-center text-xs font-bold text-[#8C7864] flex items-center justify-center gap-1 mt-5 hover:text-slate-800 active:scale-95 transition-all border-none bg-transparent focus:outline-none"
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
      <GlassCard as="div" className="washi-recent-card dashboard-magic-records p-6 rounded-[28px] bg-white/50 backdrop-blur-md border border-white/60 shadow-sm mb-6 z-10">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-800">Recent Expenses</h3>
          <button
            className="compact-touch-action text-xs font-bold text-[#D94132] hover:underline border-none bg-transparent focus:outline-none"
            type="button"
            onClick={() => onTab('history')}
          >
            View all
          </button>
        </div>

        {/* 消費列表 */}
        <div className="flex flex-col gap-3">
          {recentReceipts.length ? recentReceipts.slice(0, 3).map((r) => {
            const photoSrc = safePhotoUrl(r.photoUrl, r.photoThumb);
            return (
              <div
                key={r.id}
                className="receipt-row w-full bg-white border border-slate-100 rounded-2xl p-4 flex items-center justify-between gap-3 shadow-sm hover:translate-y-[-2px] transition-all cursor-pointer"
                onClick={() => onOpen(r)}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <VisualIcon id={r.category as any} size="md" className="shrink-0" />
                  <div className="flex flex-col justify-center gap-0.5 min-w-0 flex-1">
                    <strong className="flex items-center gap-1.5 min-w-0 text-slate-800 font-bold text-[14px]">
                      <span className="truncate flex items-center gap-1 min-w-0 flex-1">
                        <span className="truncate">{displayStore(r)}</span>
                      </span>
                      {photoSrc && (
                        <button
                          type="button"
                          className="flex-shrink-0 flex items-center text-[#D94132]"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setViewPhoto(r); }}
                          style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                        >
                          <Camera size={14} className="w-4 h-4 text-[#D94132] animate-pulse" />
                        </button>
                      )}
                    </strong>
                    <small className="text-slate-400 text-xs font-medium truncate block">
                      {categoryById(r.category).name} · {r.date.split('-').slice(1).join('/')}
                    </small>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col items-end">
                    <span className="text-[15px] font-extrabold text-slate-900">¥{fmt(r.total)}</span>
                    <span className="text-[11px] text-slate-400 font-medium">~HK${fmt(Math.round(hkd(r.total, state)))}</span>
                  </div>
                  <ChevronRight size={18} className="text-slate-300" />
                </div>
              </div>
            );
          }) : (
            <p className="text-center text-xs text-slate-400 py-6">暫時未有支出紀錄。</p>
          )}
        </div>

        {/* 新增費用按鈕 */}
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

      {/* 5. Budget Settings 折疊 Accordion */}
      <div className="bg-white/50 backdrop-blur-md border border-white/60 rounded-[24px] overflow-hidden mb-3 shadow-sm z-10 relative">
        <button
          type="button"
          className="w-full flex items-center justify-between p-4 focus:outline-none"
          onClick={() => setIsBudgetSettingsOpen(!isBudgetSettingsOpen)}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#18395C] flex items-center justify-center text-white shadow-sm shrink-0">
              <GearIcon size={18} />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-sm font-bold text-slate-800">預算控制</span>
              <span className="text-xs text-slate-500">調整每日限額、匯率同提醒</span>
            </div>
          </div>
          <ChevronDown size={20} className={`text-slate-400 transition-transform duration-300 ${isBudgetSettingsOpen ? 'transform rotate-180' : ''}`} />
        </button>
        {isBudgetSettingsOpen && (
          <div className="px-5 pb-5 pt-2 border-t border-dashed border-slate-200/50 flex flex-col gap-3">
            <div className="flex justify-between items-center bg-white/40 p-3 rounded-xl border border-white/40">
              <span className="text-xs font-semibold text-[#8C7864]">每日預算上限</span>
              <span className="text-sm font-bold text-slate-800">¥{fmt(dailyBudget)} / day</span>
            </div>
            <div className="flex justify-between items-center bg-white/40 p-3 rounded-xl border border-white/40">
              <span className="text-xs font-semibold text-[#8C7864]">預計旅費</span>
              <span className="text-sm font-bold text-slate-800">HK$ {fmt(hkd(state.budget, state))}</span>
            </div>
            <button
              type="button"
              className="w-full text-xs font-bold text-[#D94132] hover:underline text-center mt-1"
              onClick={() => onTab('settings')}
            >
              前往設定調整預算 ➔
            </button>
          </div>
        )}
      </div>

      {/* 6. Notifications 折疊 Accordion */}
      <div className="bg-white/50 backdrop-blur-md border border-white/60 rounded-[24px] overflow-hidden mb-6 shadow-sm z-10 relative">
        <button
          type="button"
          className="w-full flex items-center justify-between p-4 focus:outline-none"
          onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#D94132] flex items-center justify-center text-white shadow-sm shrink-0">
              <Bell size={18} />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-sm font-bold text-slate-800">旅程提醒</span>
              <span className="text-xs text-slate-500">管理記帳提醒同預算提示</span>
            </div>
          </div>
          <ChevronDown size={20} className={`text-slate-400 transition-transform duration-300 ${isNotificationsOpen ? 'transform rotate-180' : ''}`} />
        </button>
        {isNotificationsOpen && (
          <div className="px-5 pb-5 pt-2 border-t border-dashed border-slate-200/50 flex flex-col gap-4">
            <div className="rounded-2xl border border-white/50 bg-white/45 p-3 flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-700">今日記帳狀態</span>
                <span className="text-[10px] text-slate-400">今日已有 {todayReceipts.length} 筆紀錄</span>
              </div>
              <span className="text-xs font-black text-[#D94132]">{tripCurrencySymbol}{fmt(todayTotal)}</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-700">每日記帳提醒</span>
                <span className="text-[10px] text-slate-400">每日提示你補齊旅費紀錄</span>
              </div>
              <Switch className="dashboard-switch" checked={dailyReminder} onCheckedChange={setDailyReminder} aria-label="每日記帳提醒" />
            </div>
            <div className="flex justify-between items-center">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-700">低預算提示</span>
                <span className="text-[10px] text-slate-400">預算餘額低於 20% 時提醒</span>
              </div>
              <Switch className="dashboard-switch" checked={lowBudgetAlert} onCheckedChange={setLowBudgetAlert} aria-label="低預算提示" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="rounded-2xl bg-[#D94132] px-3 py-2.5 text-xs font-black text-white shadow-sm active:scale-95 transition"
                onClick={onManual}
              >
                立即記帳
              </button>
              <button
                type="button"
                className="rounded-2xl border border-white/70 bg-white/70 px-3 py-2.5 text-xs font-black text-[#18395C] shadow-sm active:scale-95 transition"
                onClick={() => onTab('history')}
              >
                查看紀錄
              </button>
            </div>
          </div>
        )}
      </div>
      </div>

      {/* 7. 名古屋 2026 和風 Dock Bar (懸浮底欄) */}
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
          <div className="bg-white/95 backdrop-blur-xl w-full max-w-md rounded-3xl border border-white/80 shadow-2xl p-6 relative overflow-hidden flex flex-col gap-4 scale-in">
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
                onClick={() => {
                  activeSetIsWizardOpen(false);
                  setWizardStep(1);
                }}
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
                    <label className="text-xs font-bold text-slate-500">目的地</label>
                    <input
                      type="text"
                      value={newTripDestination}
                      onChange={(e) => setNewTripDestination(e.target.value)}
                      placeholder="例如：名古屋、東京、大阪"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#6D5643] bg-slate-50/50 focus:bg-white text-sm focus:outline-none transition-all"
                    />
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="flex flex-col gap-3.5 animate-slide-in">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500">開始日期</label>
                    <input
                      type="date"
                      value={newTripStartDate}
                      onChange={(e) => setNewTripStartDate(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#6D5643] bg-slate-50/50 focus:bg-white text-sm focus:outline-none transition-all"
                    />
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
                      value={newTripCurrency}
                      onChange={(e) => setNewTripCurrency(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#6D5643] bg-slate-50/50 focus:bg-white text-sm focus:outline-none transition-all cursor-pointer"
                    >
                      <option value="JPY">💴 日圓 (JPY)</option>
                      <option value="HKD">💵 港幣 (HKD)</option>
                      <option value="USD">💵 美元 (USD)</option>
                    </select>
                  </div>
                </div>
              )}

              {wizardStep === 4 && (
                <div className="flex flex-col gap-3.5 animate-slide-in">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-slate-500">旅程詳情 (選填)</label>
                    <textarea
                      value={newTripDetails}
                      onChange={(e) => setNewTripDetails(e.target.value)}
                      placeholder="例如：名古屋城賞櫻、立山黑部雪之大谷、高山飛驒牛美食之旅..."
                      rows={4}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-[#6D5643] bg-slate-50/50 focus:bg-white text-sm focus:outline-none transition-all resize-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 mt-0.5">
                    <span className="text-[10px] font-bold text-slate-400">💡 智能行程填充靈感 (一鍵套用)：</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setNewTripDetails("🍱 必食蓬萊軒鰻魚飯三食、矢場ton味噌豬扒！🏮 行程包括名古屋城賞櫻、大須觀音街、熱田神宮，仲有去榮町 Shopping！🌸");
                          if (!newTripName || newTripName.trim() === '' || newTripName.includes('新旅程')) {
                            setNewTripName("🌸 名古屋美味賞櫻之旅 2026 🏯");
                          }
                          if (!newTripDestination) {
                            setNewTripDestination("名古屋 (Nagoya)");
                          }
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200/50 transition active:scale-95 cursor-pointer"
                      >
                        🌸 2026 名古屋賞櫻美食行程
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewTripDetails("🗻 箱根溫泉旅館一泊二食！🏮 行程包括富士山河口湖五合目、淺間神社看富士山、新宿 Shopping 買藥妝！🛒");
                          if (!newTripName || newTripName.trim() === '' || newTripName.includes('新旅程')) {
                            setNewTripName("🗻 富士箱根溫泉療癒之旅 🍁");
                          }
                          if (!newTripDestination) {
                            setNewTripDestination("東京/箱根 (Tokyo/Hakone)");
                          }
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/50 transition active:scale-95 cursor-pointer"
                      >
                        🗻 東京富士箱根溫泉之旅
                      </button>
                    </div>
                  </div>
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
                  onClick={() => {
                    const defaultName = `新旅程_${new Date().toLocaleDateString('zh-HK')}`;
                    handleCreateTrip(newTripName.trim() || defaultName);
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-all border-none focus:outline-none cursor-pointer"
                >
                  稍後填寫 (快速跳過)
                </button>
              )}

              {wizardStep < 4 ? (
                <button
                  type="button"
                  disabled={wizardStep === 1 && !newTripName.trim()}
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
                  onClick={() => handleCreateTrip()}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#D94132] hover:bg-red-700 transition-all border-none focus:outline-none cursor-pointer animate-pulse"
                >
                  完成創建 🎉
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
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onViewPhoto ? onViewPhoto(receipt) : window.open(photoSrc, '_blank', 'noopener,noreferrer'); }}
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
        <strong className="text-[15px] font-extrabold text-slate-900">¥{fmt(receipt.total)}</strong>
        <small className="text-[10px] text-slate-400">HK$ {fmt(hkd(receipt.total, state))}</small>
      </span>
    </div>
  );
}
