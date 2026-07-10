import { BarChart3, CalendarDays, CloudSun, Download, Home, List, MoreVertical, ReceiptText, ScanLine, Settings, Users, ChevronDown, RefreshCw, Wifi, WifiOff, Smartphone, Gauge, PackageCheck, Archive } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { TAB_MANIFEST } from '../lib/tabs';
import type { SyncEngineState, TabId, AppState, TripProfile } from '../lib/types';
import { StatusPill } from './ui';
import { WindmillTransition } from './WindmillTransition';
import { FloatingDock } from './ui/floating-dock';
import { NoiseTexture } from './ui/noise-texture';
import { Particles } from './ui/particles';
import { AuroraText } from './ui/aurora-text';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { getEffectsTier } from '../lib/performance';
import { activeTrip, switchTrip } from '../domain/trip/normalize';
import compactJapanMark from '../assets/generated/compact-japan-mark.svg';

function TripDropdown({
  trips,
  activeTripId,
  onSelect,
  onCreateNew,
  label = '切換旅程 (Switch Trip)',
  align = 'left',
  className = '',
  buttonClassName = '',
  itemClassName = '',
  activeItemClassName = '',
  children,
}: {
  trips: TripProfile[];
  activeTripId: string;
  onSelect: (tripId: string) => void;
  onCreateNew?: () => void;
  label?: string;
  align?: 'left' | 'right';
  className?: string;
  buttonClassName?: string;
  itemClassName?: string;
  activeItemClassName?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        className={buttonClassName || 'flex items-center gap-1.5 text-left border-none bg-transparent p-0 focus:outline-none cursor-pointer active:scale-98 transition-all'}
        aria-label={children ? undefined : label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
      >
        {children && <span className="shell-trip-trigger-content">{children}</span>}
        <ChevronDown size={18} className="text-[#C23B5E] dark:text-[#D4A843] shrink-0" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      {open && (
        <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} mt-2 w-64 bg-white/95 backdrop-blur-md rounded-2xl border border-stone-200/50 shadow-2xl p-2 z-50 flex flex-col gap-1 text-[#2A2119]`}>
          <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {label}
          </div>
          <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
            {trips.filter((t) => !t.archived).map((t) => {
              const isActive = t.id === activeTripId;
              return (
                <button
                  key={t.id}
                  className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-left transition-all border-none focus:outline-none cursor-pointer ${
                    isActive
                      ? activeItemClassName || 'bg-blue-50 text-blue-900 font-bold'
                      : itemClassName || 'hover:bg-slate-50 text-slate-700 bg-transparent'
                  }`}
                  onClick={() => { setOpen(false); onSelect(t.id); }}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm truncate">{t.name}</span>
                    <span className="text-[10px] text-slate-400 truncate">
                      {t.destinationSummary || '未設定目的地'} ({t.itinerary?.length || 0}天)
                    </span>
                  </div>
                  {isActive && (
                    <div className="w-2 h-2 rounded-full bg-blue-600 shrink-0 ml-2" />
                  )}
                </button>
              );
            })}
          </div>
          {onCreateNew && (
            <>
              <div className="border-t border-slate-100 my-1" />
              <button
                type="button"
                className="flex items-center justify-center gap-1.5 w-full px-3 py-2 bg-[#C23B5E] hover:bg-[#A83030] text-white rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm border-none cursor-pointer"
                onClick={() => { setOpen(false); onCreateNew(); }}
              >
                <span>➕ ⛩️ 建立新旅程</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}


const icons: Record<TabId, ReactNode> = {
  dashboard: <Home size={20} />,
  scan: <ScanLine size={20} />,
  timeline: <CalendarDays size={20} />,
  history: <List size={20} />,
  weather: <CloudSun size={20} />,
  stats: <BarChart3 size={20} />,
  settings: <Settings size={20} />,
};

const shellCopy: Record<TabId, { title: string; mobileTitle: string; subtitle: string; status: string }> = {
  dashboard: { title: 'Travel Ledger', mobileTitle: '我的旅程', subtitle: '開始記錄你的旅程', status: '進行中' },
  scan: { title: 'Receipt Studio', mobileTitle: '收據掃描工作室', subtitle: '掃描 · 辨識 · 記帳', status: '就緒 · 可掃描' },
  timeline: { title: 'Trip Route', mobileTitle: '行程時間線', subtitle: '行程時間線總覽', status: '地圖檢視' },
  history: { title: '紀錄中心', mobileTitle: '紀錄中心', subtitle: '管理所有收據與支出', status: '可同步' },
  weather: { title: 'Weather Window', mobileTitle: '天氣預報', subtitle: '旅程天氣 · 隨時掌握', status: '已更新' },
  stats: { title: 'Spend Flight Deck', mobileTitle: '預算使用分析', subtitle: 'Spend Cockpit', status: '統計中' },
  settings: { title: 'Secure Controls', mobileTitle: '設定控制中心', subtitle: 'Secure Controls', status: '系統狀態' },
};

const COMPACT_RELEASE_NOTE_ID = 'compact-2026-06-09-record-declutter';
const COMPACT_RELEASE_NOTES = [
  { title: 'Compact Home and Timeline', detail: 'Home and Timeline keep current-day itinerary detail without extra diagnostic control strips.' },
  { title: 'Attachment checks', detail: 'Settings Trip Doctor summarizes photo issues while Record rows keep small photo markers.' },
  { title: 'Offline conflict resolver', detail: 'History can review failed local/cloud receipt conflicts without exposing provider payloads.' },
];
const COMPACT_RELEASE_NOTES_SEEN_KEY = 'travel-expense-compact:release-notes-seen';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function relativeFreshness(value: number) {
  if (!value) return 'local only';
  const seconds = Math.max(1, Math.round((Date.now() - value) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function Shell({
  active,
  onTab,
  children,
  syncState,
  onRetryFailed,
  state,
  setState,
  updateState,
  onPull,
  onOpenNewTripWizard,
}: {
  active: TabId;
  onTab: (tab: TabId) => void;
  children: ReactNode;
  syncState?: SyncEngineState;
  onRetryFailed?: () => void;
  state?: AppState;
  setState?: React.Dispatch<React.SetStateAction<AppState>>;
  updateState?: (patch: Partial<AppState>) => void;
  onPull?: () => Promise<void>;
  onOpenNewTripWizard?: () => void;
}) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [updateReady, setUpdateReady] = useState(false);
  const [installReady, setInstallReady] = useState(false);
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const [fxTier, setFxTier] = useState(getEffectsTier);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  const raf = useRef<number | null>(null);
  const installPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const prefersReducedMotion = useReducedMotion();
  // Desktop-class effects (rAF canvas particles, full-screen mix-blend noise): full tier only.
  const richVisualEffects = !prefersReducedMotion && fxTier === 'full';
  // Compositor-safe motion (aurora text bg-position, scroll-linked vars): full + balanced.
  const motionOk = !prefersReducedMotion && fxTier !== 'lite';

  const [pulling, setPulling] = useState(false);

  const handlePullClick = async () => {
    if (!onPull) return;
    setPulling(true);
    try {
      await onPull();
    } catch (e) {
      console.error(e);
    } finally {
      setPulling(false);
    }
  };

  const trip = state ? activeTrip(state) : null;
  const activeTripName = trip ? trip.name : '我的旅程 🧳';
  const activeTripDates = trip ? `${trip.startDate} - ${trip.endDate}` : '尚未設定日期';

  const handleSwitchTrip = (tripId: string) => {
    if (!state) return;
    const patch = switchTrip(state, tripId);
    if (!patch) return;
    if (updateState) {
      updateState(patch);
    } else if (setState) {
      setState((prev) => ({ ...prev, ...patch }));
    }
  };

  const activeCopy = {
    ...shellCopy[active],
    mobileTitle: active === 'dashboard' && trip ? trip.name : shellCopy[active].mobileTitle,
    title: active === 'dashboard' && trip ? trip.name : shellCopy[active].title,
    subtitle: active === 'dashboard' && trip ? activeTripDates : shellCopy[active].subtitle,
  };

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onControllerChange = () => {
      setUpdateReady(true);
      try {
        setReleaseNotesOpen(localStorage.getItem(COMPACT_RELEASE_NOTES_SEEN_KEY) !== COMPACT_RELEASE_NOTE_ID);
      } catch {
        setReleaseNotesOpen(true);
      }
    };
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      installPromptRef.current = event as BeforeInstallPromptEvent;
      setInstallReady(true);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  const handleInstallClick = async () => {
    const promptEvent = installPromptRef.current;
    if (!promptEvent) return;
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice?.catch(() => undefined);
    } finally {
      installPromptRef.current = null;
      setInstallReady(false);
    }
  };

  const handleReleaseNotesToggle = () => setReleaseNotesOpen(true);
  const handleReleaseNotesDismiss = () => {
    try {
      localStorage.setItem(COMPACT_RELEASE_NOTES_SEEN_KEY, COMPACT_RELEASE_NOTE_ID);
    } catch {
      // Local release notes must stay non-blocking if storage is unavailable.
    }
    setReleaseNotesOpen(false);
  };

  const cacheTime = Math.max(syncState?.lastSyncedAt || 0, Number(state?.settingsPulledAt || 0));
  const cacheLabel = relativeFreshness(cacheTime);
  const motionLabel = prefersReducedMotion || fxTier === 'lite' ? 'reduced' : fxTier === 'balanced' ? 'balanced' : 'rich';
  const failedSyncCount = syncState?.failedCount || 0;
  const pendingSyncCount = syncState?.pendingCount || 0;
  const hasSyncProblem = syncState?.status === 'error' || failedSyncCount > 0;
  const queueLabel = failedSyncCount
    ? `${failedSyncCount} failed${pendingSyncCount ? ` · ${pendingSyncCount} pending` : ''}`
    : pendingSyncCount
      ? `${pendingSyncCount} pending`
      : syncState?.status === 'offline'
        ? 'paused'
        : 'clear';

  useEffect(() => {
    const handlePerformanceAndEffects = () => {
      const tier = getEffectsTier();
      setFxTier(tier);
      setIsMobile(window.innerWidth <= 768);

      // Stamp the tier on <html> so styles.css can scale densities/durations without JS.
      // `stable-effects` (the shadow/animation strip) now applies on lite ONLY — phones on
      // the balanced tier keep the Motion Layer running (compositor-safe animations only).
      const root = document.documentElement;
      root.classList.remove('fx-full', 'fx-balanced', 'fx-lite');
      root.classList.add(`fx-${tier}`);
      root.classList.toggle('stable-effects', tier === 'lite');
    };

    const queries = [
      window.matchMedia('(max-width: 768px)'),
      window.matchMedia('(pointer: coarse)'),
      window.matchMedia('(prefers-reduced-motion: reduce)'),
    ];

    handlePerformanceAndEffects();

    for (const query of queries) {
      query.addEventListener('change', handlePerformanceAndEffects);
    }
    window.addEventListener('resize', handlePerformanceAndEffects);

    return () => {
      for (const query of queries) {
        query.removeEventListener('change', handlePerformanceAndEffects);
      }
      window.removeEventListener('resize', handlePerformanceAndEffects);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (!motionOk) {
      root.style.setProperty('--scroll-y', '0px');
      root.style.setProperty('--scroll-progress', '0');
      root.style.setProperty('--header-shrink', '0');
      return undefined;
    }
    const update = () => {
      raf.current = null;
      const max = Math.max(1, document.body.scrollHeight - window.innerHeight);
      const y = Math.max(0, window.scrollY);
      root.style.setProperty('--scroll-y', `${y.toFixed(0)}px`);
      root.style.setProperty('--scroll-progress', `${Math.min(1, y / max).toFixed(4)}`);
      // Header condensation driver: 0→1 over the first 96px of scroll (unitless, so CSS
      // can scale/fade the sticky mobile header with transform/opacity only).
      root.style.setProperty('--header-shrink', `${Math.min(1, y / 96).toFixed(3)}`);
    };
    const onScroll = () => {
      if (raf.current != null) return;
      raf.current = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf.current != null) window.cancelAnimationFrame(raf.current);
    };
  }, [motionOk]);

  return (
    <div className={`app-shell app-shell--${active}`} data-active-tab={active}>
      {/* Japanese particle background — washi paper warmth with floating motes */}
      {richVisualEffects && (
        <Particles
          className="pointer-events-none fixed inset-0 -z-20"
          quantity={35}
          ease={80}
          color="#d4a574"
          staticity={40}
          size={0.6}
          aria-hidden="true"
        />
      )}
      {richVisualEffects && (
        <NoiseTexture
          aria-hidden="true"
          focusable="false"
          className="pointer-events-none fixed inset-0 -z-10 opacity-[0.08] mix-blend-soft-light"
        />
      )}
      <nav className="compact-desktop-rail" aria-label="主要分頁">
        <img className="compact-rail-mark" src={compactJapanMark} alt="" aria-hidden="true" />
        <div className="compact-rail-items">
          {TAB_MANIFEST.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`compact-rail-button ${active === tab.id ? 'active' : ''}`}
              aria-label={tab.label}
              aria-current={active === tab.id ? 'page' : undefined}
              onClick={() => onTab(tab.id)}
            >
              <span className="compact-rail-icon">{icons[tab.id]}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
      {!online && <div className="top-notice offline">離線模式：資料會繼續保存在本機</div>}
      {updateReady && (
        <div className="top-notice update">
          發現新版本
          <button type="button" onClick={() => location.reload()}>立即更新</button>
        </div>
      )}
      {hasSyncProblem && (
        <div className="top-notice text-red-700 bg-red-50 border border-red-200/60 dark:bg-red-950/20 dark:border-red-900/30 dark:text-red-300 backdrop-blur-md flex items-center justify-between gap-4 w-full" style={{ background: 'rgba(253, 240, 240, 0.95)', border: '1px solid rgba(194, 59, 94, 0.3)', color: '#A83030' }}>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            <span className="truncate max-w-[200px] xs:max-w-xs md:max-w-md font-semibold">有資料同步失敗，請檢查連線或設定。{failedSyncCount ? `${failedSyncCount} 筆待重試。` : ''}{syncState?.error ? `(${syncState.error})` : ''}</span>
          </div>
          {onRetryFailed && (
            <button
              type="button"
              onClick={onRetryFailed}
              className="compact-touch-action px-3 py-1 text-xs font-semibold bg-[#C23B5E] hover:bg-[#A83030] text-white rounded-full transition-all duration-200 active:scale-95 shadow-sm shrink-0"
              style={{ border: 0, padding: '4px 12px', height: 'auto', background: '#C23B5E', color: 'white' }}
            >
              手動重試
            </button>
          )}
        </div>
      )}
      <header className="topbar topbar-canva relative overflow-hidden">
        {active === 'dashboard' && (
          <svg className="absolute right-4 bottom-0 opacity-15 pointer-events-none h-full w-48 text-[#D4A843] dark:text-[#C23B5E] z-0" viewBox="0 0 120 40" fill="none" stroke="currentColor">
            <path d="M10,40 Q40,12 60,5 Q80,12 110,40 Z" strokeWidth="1" />
            <path d="M48,15 L60,5 L72,15 Z" fill="currentColor" opacity="0.3" stroke="none" />
            <path d="M85,40 L85,25 M95,40 L95,25 M81,23 L99,23 M83,27 L97,27 M82,20 L98,20" strokeWidth="1.5" stroke="#C23B5E" />
          </svg>
        )}
        <div className="topbar-title-block relative z-10">
          <img className="compact-topbar-mark" src={compactJapanMark} alt="" aria-hidden="true" />
          {active === 'dashboard' && state ? (
            <div className="flex items-center gap-2">
              <TripDropdown
                trips={state.trips || []}
                activeTripId={trip?.id || ''}
                onSelect={handleSwitchTrip}
                onCreateNew={onOpenNewTripWizard}
                align="right"
                buttonClassName="shell-trip-trigger topbar-trip-trigger"
              >
                <span className="topbar-trip-trigger-title" role="heading" aria-level={1}>
                  {motionOk
                    ? <AuroraText colors={['#18395c', '#d94132', '#d39a29', '#2d6e48']} speed={1.2}>{activeTripName}</AuroraText>
                    : activeTripName}
                </span>
              </TripDropdown>
            </div>
          ) : (
            <h1>
              {motionOk
                ? <AuroraText colors={['#18395c', '#d94132', '#d39a29', '#2d6e48']} speed={1.2}>{activeCopy.title}</AuroraText>
                : activeCopy.title}
            </h1>
          )}
        </div>
        <div className="compact-desktop-actions relative z-10" aria-label="Dashboard controls">
          {active === 'history' && state ? (
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  className="secondary history-trip-button bg-white/60 hover:bg-white/80 border border-[#C23B5E]/30 backdrop-blur-md rounded-full px-3 py-1.5 font-semibold text-blue-900 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer focus:outline-none active:scale-95 text-xs"
                  type="button"
                >
                  <CalendarDays size={14} aria-hidden="true" />
                  <span>{activeTripName}</span>
                </button>
                <TripDropdown
                  trips={state.trips || []}
                  activeTripId={trip?.id || ''}
                  onSelect={handleSwitchTrip}
                  label="選擇旅程 (Select Trip)"
                  align="right"
                  className="inline-block"
                  buttonClassName="secondary history-trip-button bg-white/60 hover:bg-white/80 border border-[#C23B5E]/30 backdrop-blur-md rounded-full px-3 py-1.5 font-semibold text-blue-900 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer focus:outline-none active:scale-95 text-xs"
                />
              </div>

              <button
                className="secondary history-refresh-button bg-white/60 hover:bg-white/80 border border-[#C23B5E]/30 backdrop-blur-md rounded-full p-2 font-semibold text-blue-900 transition-all shadow-sm flex items-center justify-center cursor-pointer active:scale-95"
                type="button"
                disabled={pulling}
                onClick={handlePullClick}
                aria-label="重新同步"
                title="重新同步"
              >
                <RefreshCw size={14} className={pulling ? 'spin' : undefined} />
              </button>
            </div>
          ) : state ? (
            <span className="text-xs text-slate-500 font-medium">{activeCopy.subtitle}</span>
          ) : null}
        </div>
        {syncState && (
          <div className={`compact-sync-slot relative z-10 ${hasSyncProblem ? 'has-error' : 'is-quiet'}`}>
            <SyncStatusIndicator state={syncState} onRetry={onRetryFailed} />
          </div>
        )}
      </header>
      <header className="compact-mobile-header relative overflow-hidden" aria-label={`${activeCopy.mobileTitle} header`}>
        {active === 'dashboard' && (
          <svg className="absolute right-12 bottom-0 opacity-15 pointer-events-none h-14 w-36 text-[#D4A843] dark:text-[#C23B5E] z-0" viewBox="0 0 100 40" fill="none" stroke="currentColor">
            <path d="M5,40 Q30,15 50,5 Q70,15 95,40 Z" strokeWidth="1" />
            <path d="M38,12 L50,5 L62,12 Z" fill="currentColor" opacity="0.3" stroke="none" />
            <path d="M72,40 L72,24 M82,40 L82,24 M68,22 L86,22 M70,26 L84,26 M69,19 L85,19" strokeWidth="1.5" stroke="#C23B5E" />
          </svg>
        )}
        <span className="compact-mobile-mark relative z-10" aria-hidden="true">
          <img src={compactJapanMark} alt="" />
        </span>
        <div className="compact-mobile-heading relative z-10">
          {active === 'dashboard' && state ? (
            <div className="flex items-center gap-1.5">
              <TripDropdown
                trips={state.trips || []}
                activeTripId={trip?.id || ''}
                onSelect={handleSwitchTrip}
                onCreateNew={onOpenNewTripWizard}
                buttonClassName="shell-trip-trigger compact-mobile-trip-trigger"
              >
                <span className="compact-mobile-title-art" data-title={activeTripName}>{activeTripName}</span>
              </TripDropdown>
            </div>
          ) : (
            <h1><span className="compact-mobile-title-art" data-title={activeCopy.mobileTitle}>{isMobile ? activeCopy.mobileTitle : ''}</span></h1>
          )}
          <p>{activeCopy.subtitle}</p>
        </div>
        <span className="compact-mobile-status relative z-10">{activeCopy.status}</span>
        {active === 'history' && state ? (
          <div className="compact-mobile-action-history flex items-center gap-1.5 relative z-20" style={{ marginRight: '4px' }}>
            <TripDropdown
              trips={state.trips || []}
              activeTripId={trip?.id || ''}
              onSelect={handleSwitchTrip}
              label="選擇旅程 (Select Trip)"
              align="right"
              buttonClassName="secondary history-trip-button bg-white/60 hover:bg-white/80 border border-[#C23B5E]/30 backdrop-blur-md rounded-full px-2 py-1 font-semibold text-blue-900 transition-all shadow-sm flex items-center gap-0.5 cursor-pointer focus:outline-none active:scale-95 text-[10px]"
            />

            <button
              className="secondary history-refresh-button bg-white/60 hover:bg-white/80 border border-[#C23B5E]/30 backdrop-blur-md rounded-full p-1.5 font-semibold text-blue-900 transition-all shadow-sm flex items-center justify-center cursor-pointer active:scale-95"
              type="button"
              disabled={pulling}
              onClick={handlePullClick}
              aria-label="重新同步"
              title="重新同步"
            >
              <RefreshCw size={11} className={pulling ? 'spin' : undefined} />
            </button>
          </div>
        ) : active === 'scan' ? (
          <button className="compact-mobile-action compact-touch-action relative z-10" type="button" aria-label="更多操作">
            <Settings size={25} />
          </button>
        ) : null}
      </header>
      {active === 'settings' && (
        <section className="compact-pwa-readiness" aria-label="Compact travel readiness">
          <span className={`pwa-chip ${online ? 'ok' : 'warning'}`}>
            {online ? <Wifi size={13} /> : <WifiOff size={13} />}
            Network · {online ? 'online' : 'offline'}
          </span>
          <span className={`pwa-chip ${failedSyncCount ? 'danger' : pendingSyncCount ? 'warning' : syncState?.status === 'error' ? 'danger' : 'ok'}`}>
            <Archive size={13} />
            Queue · {queueLabel}
          </span>
          {installReady && (
            <button className="pwa-chip install" type="button" onClick={handleInstallClick}>
              <Smartphone size={13} />
              Install
            </button>
          )}
        </section>
      )}
      {active === 'settings' && updateReady && releaseNotesOpen && (
        <section className="compact-release-notes" aria-label="Compact release notes">
          <div className="compact-release-notes-head">
            <div>
              <span>Compact release notes</span>
              <strong>Now vs previous</strong>
            </div>
            <button type="button" onClick={handleReleaseNotesDismiss}>Done</button>
          </div>
          <div className="compact-release-note-list">
            {COMPACT_RELEASE_NOTES.map((note) => (
              <article key={note.title}>
                <b>{note.title}</b>
                <small>{note.detail}</small>
              </article>
            ))}
          </div>
          <p>No external calls · local summary only</p>
        </section>
      )}
      <main className="content">{children}</main>
      {/* Full-screen conic sweep is desktop-only: on phones the real tab slide (App.tsx)
          replaces it, and its 100vmax overlay was leaking onto mobile before tiers. */}
      {fxTier === 'full' && <WindmillTransition activeKey={active} />}

      {/* Fixed bottom tab bar — never scrolls away */}
      <div className="fixed-tab-bar">
        <FloatingDock
          desktopClassName="app-floating-dock-desktop"
          mobileClassName="app-floating-dock-mobile"
          items={TAB_MANIFEST.map((tab) => ({
            id: tab.id,
            title: tab.label,
            icon: icons[tab.id],
            active: active === tab.id,
            onSelect: () => onTab(tab.id),
          }))}
        />
      </div>
    </div>
  );
}
