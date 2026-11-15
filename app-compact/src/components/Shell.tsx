import { BarChart3, CalendarDays, CloudSun, Home, List, ScanLine, Settings, ChevronDown, RefreshCw, Wifi, WifiOff, Smartphone, Archive, MoreHorizontal, Plus, X, ArrowRight } from 'lucide-react';
import { KitTabIcon } from '../theme/kit/KitIcons';
import { KitMascot } from '../theme/kit/KitMascot';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { JourneyMark } from './journey/JourneyCover';
import { useModalAccessibility } from '../lib/useModalAccessibility';
import { useModalOpenClass } from '../lib/useModalOpenClass';
import { APP_VERSION } from '../lib/constants';
import { useReducedMotion } from 'motion/react';
import { MOBILE_PRIMARY_TABS, TAB_MANIFEST } from '../lib/tabs';
import type { SyncEngineState, TabId, AppState, TripProfile } from '../lib/types';
import { FloatingDock } from './ui/floating-dock';
import { NoiseTexture } from './ui/noise-texture';
import { Particles } from './ui/particles';
import { AuroraText } from './ui/aurora-text';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { getEffectsTier } from '../lib/performance';
import { activeTrip, switchTrip } from '../domain/trip/normalize';
import compactJapanMark from '../assets/generated/compact-japan-mark.svg';
import { useTripTheme } from '../theme/tripTheme';

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
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); } };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', closeOutside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div className={`journey-trip-switch ${className}`} ref={ref}>
    <button type="button" className={buttonClassName || 'journey-trip-trigger'} aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      {children || <span>切換旅程</span>}<ChevronDown size={17} />
    </button>
    {open && <div id={id} className={`journey-trip-menu is-${align}`} aria-label="可選旅程">
      <p>我的旅程</p>
      <div>{trips.filter(trip => !trip.archived).map(trip => <button type="button" key={trip.id} aria-pressed={trip.id === activeTripId} onClick={() => { setOpen(false); onSelect(trip.id); }}>
        <strong>{trip.name}</strong><small>{trip.startDate} · {trip.destinationSummary || '未設定目的地'}</small>
      </button>)}</div>
      {onCreateNew && <button type="button" className="journey-new-trip" onClick={() => { setOpen(false); onCreateNew(); }}><Plus size={16} /> 建立新旅程</button>}
    </div>}
  </div>;
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

// Theme tokens, not fixed hues: the old navy-to-ochre ink vanished on the dark themes' header.
const SHELL_TITLE_INK = ['var(--theme-text)', 'var(--theme-accent)', 'var(--theme-chart-3)', 'var(--theme-text)'];

const shellCopy: Record<TabId, { title: string; mobileTitle: string; subtitle: string; status: string }> = {
  dashboard: { title: 'Travel Ledger', mobileTitle: '我的旅程', subtitle: '開始記錄你的旅程', status: '進行中' },
  scan: { title: 'Receipt Studio', mobileTitle: '收據掃描工作室', subtitle: '掃描 · 辨識 · 記帳', status: '就緒 · 可掃描' },
  timeline: { title: 'Trip Route', mobileTitle: '行程時間線', subtitle: '行程時間線總覽', status: '地圖檢視' },
  history: { title: '紀錄中心', mobileTitle: '紀錄中心', subtitle: '管理所有收據與支出', status: '可同步' },
  weather: { title: 'Weather Station', mobileTitle: '旅程氣象站', subtitle: '地點 · 日期 · 來源', status: '天氣' },
  stats: { title: 'Spend Flight Deck', mobileTitle: '預算使用分析', subtitle: 'Spend Cockpit', status: '統計中' },
  settings: { title: 'Secure Controls', mobileTitle: '設定控制中心', subtitle: 'Secure Controls', status: '系統狀態' },
};

const COMPACT_RELEASE_NOTE_ID = 'compact-0.33.0-journey';
const COMPACT_RELEASE_NOTES = [
  { title: '沿途新面貌', detail: '風景插畫、清晰日程與更易按的導航，套用到所有主要畫面。' },
  { title: '行程工具', detail: '加入多日日曆、路線預覽、航班及住宿整理，可匯出日曆。' },
  { title: '出發準備', detail: '每趟旅程有獨立裝置清單，可勾選、編輯及匯入匯出。' },
  { title: '旅途翻翻卡', detail: '候機等車時，可以離線玩旅行用品配對。' },
];
const COMPACT_RELEASE_NOTES_SEEN_KEY = 'travel-expense-compact:release-notes-seen';
const DEPLOYMENT_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const DEPLOYMENT_CHECK_QUERY = '__compact_deploy_check';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};


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
  const { theme } = useTripTheme();
  const tabIcon = (id: TabId) => (theme.kit ? <KitTabIcon kit={theme.kit.style} tab={id} /> : icons[id]);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useModalAccessibility(moreOpen, () => setMoreOpen(false));
  useModalOpenClass(moreOpen);
  useEffect(() => { setMoreOpen(false); }, [active]);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [updateReady, setUpdateReady] = useState(false);
  const [installReady, setInstallReady] = useState(false);
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const [fxTier, setFxTier] = useState(getEffectsTier);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const raf = useRef<number | null>(null);
  const installPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const deploymentCheckRef = useRef({ inFlight: false, lastCheckedAt: null as number | null });
  const prefersReducedMotion = useReducedMotion();
  // Desktop-class effects (rAF canvas particles, full-screen mix-blend noise): full tier only.
  const richVisualEffects = theme.id === 'japan_washi' && !prefersReducedMotion && fxTier === 'full';
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
  const activeTripName = trip ? trip.name : '我的旅程';
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
    const checkForDeploymentUpdate = async () => {
      const check = deploymentCheckRef.current;
      if (check.inFlight || document.hidden || !navigator.onLine) return;
      const now = Date.now();
      if (check.lastCheckedAt !== null && now - check.lastCheckedAt < DEPLOYMENT_CHECK_INTERVAL_MS) return;
      const loadedScript = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src;
      if (!loadedScript) return;
      // Focus/visibility events and StrictMode remounts share the same advisory check budget.
      check.inFlight = true;
      check.lastCheckedAt = now;
      try {
        const indexUrl = new URL(import.meta.env.BASE_URL || '/', window.location.origin);
        indexUrl.searchParams.set(DEPLOYMENT_CHECK_QUERY, String(Date.now()));
        const response = await fetch(indexUrl, {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'text/html' },
        });
        if (!response.ok) return;
        const html = await response.text();
        const latestDocument = new DOMParser().parseFromString(html, 'text/html');
        const latestSource = latestDocument.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src');
        if (!latestSource) return;
        const latestScript = new URL(latestSource, response.url).href;
        if (latestScript !== loadedScript) onControllerChange();
      } catch {
        // Version discovery is advisory and must never affect offline or sync state.
      } finally {
        check.inFlight = false;
      }
    };
    const onFocus = () => void checkForDeploymentUpdate();
    const onVisibilityChange = () => {
      if (!document.hidden) void checkForDeploymentUpdate();
    };
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      installPromptRef.current = event as BeforeInstallPromptEvent;
      setInstallReady(true);
    };
    void checkForDeploymentUpdate();
    const deploymentTimer = window.setInterval(() => void checkForDeploymentUpdate(), DEPLOYMENT_CHECK_INTERVAL_MS);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', onFocus);
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    document.addEventListener('visibilitychange', onVisibilityChange);
    navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange);
    return () => {
      window.clearInterval(deploymentTimer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      document.removeEventListener('visibilitychange', onVisibilityChange);
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

  const handleReleaseNotesDismiss = () => {
    try {
      localStorage.setItem(COMPACT_RELEASE_NOTES_SEEN_KEY, COMPACT_RELEASE_NOTE_ID);
    } catch {
      // Local release notes must stay non-blocking if storage is unavailable.
    }
    setReleaseNotesOpen(false);
  };

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
    // iOS Safari keyboard covers the fixed dock. visualViewport shrinks while the
    // layout viewport stays the same — hide the dock so forms stay reachable.
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const update = () => {
      const shrink = window.innerHeight - vv.height;
      setKeyboardOpen(shrink > 120);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
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

  const primaryTabs = MOBILE_PRIMARY_TABS.map(id => TAB_MANIFEST.find(tab => tab.id === id)!);
  const secondaryTabs = TAB_MANIFEST.filter(tab => ['weather', 'stats', 'settings'].includes(tab.id));
  const moreActive = secondaryTabs.some(tab => tab.id === active);
  return (
    <div className={`app-shell journey-shell app-shell--${active}`} data-active-tab={active}>
      <a className="journey-skip-link" href="#journey-main" onClick={event => { event.preventDefault(); document.getElementById('journey-main')?.focus(); }}>跳至內容</a>
      <nav className="compact-desktop-rail journey-desktop-rail" aria-label="主要分頁">
        <div className="journey-brand"><JourneyMark /><div><strong>Travel Ledger</strong><span>每一程，都記得</span></div></div>
        {state && <TripDropdown trips={state.trips || []} activeTripId={trip?.id || ''} onSelect={handleSwitchTrip} onCreateNew={onOpenNewTripWizard} buttonClassName="journey-rail-trip"><span><small>目前旅程</small><strong>{activeTripName}</strong><em>{activeTripDates}</em></span></TripDropdown>}
        <div className="journey-rail-items">{TAB_MANIFEST.map(tab => <button key={tab.id} type="button" className={active === tab.id ? 'active' : ''} aria-label={tab.label} aria-current={active === tab.id ? 'page' : undefined} onClick={() => onTab(tab.id)}>{tabIcon(tab.id)}<span>{tab.label}</span>{active === tab.id && <ArrowRight size={15} />}</button>)}</div>
        <div className="journey-rail-bottom">{onOpenNewTripWizard && <button type="button" className="secondary" onClick={onOpenNewTripWizard}><Plus size={17} /> 建立新旅程</button>}<p>Travel Ledger <span>v{APP_VERSION}</span></p>{syncState && !isMobile && <SyncStatusIndicator state={syncState} onRetry={onRetryFailed} />}<span className="journey-online">{online ? <Wifi size={14} /> : <WifiOff size={14} />}{online ? '已連線' : '離線儲存中'}</span></div>
      </nav>
      {!online && <div className="top-notice offline">離線模式：資料會繼續保存在本機</div>}
      {updateReady && <div className="top-notice update">發現新版本<button type="button" onClick={() => location.reload()}>立即更新</button></div>}
      {hasSyncProblem && !updateReady && <div className="top-notice sync-problem-notice"><span>{/存取權|permission denied|row-level security|\bRLS\b|42501/i.test(syncState?.error || '') ? `有記帳因為權限問題未能同步。${failedSyncCount ? `${failedSyncCount} 筆受影響。` : ''}${syncState?.error ? `(${syncState.error})` : ''}` : `有資料同步失敗，請檢查連線或設定。${failedSyncCount ? `${failedSyncCount} 筆待重試。` : ''}`}</span>{onRetryFailed && <button type="button" onClick={onRetryFailed}>手動重試</button>}</div>}
      <header className="journey-topbar" aria-labelledby="journey-page-heading">
        <div className="journey-topbar-brand"><JourneyMark /><span>Travel Ledger</span></div>
        <div className="journey-page-title"><h1 id="journey-page-heading">{active === 'dashboard' ? '我的旅程' : shellCopy[active].mobileTitle}</h1></div>
        <div className="journey-topbar-actions">
          {state && <TripDropdown trips={state.trips || []} activeTripId={trip?.id || ''} onSelect={handleSwitchTrip} onCreateNew={onOpenNewTripWizard} align="right"><span>{activeTripName}</span></TripDropdown>}
          {active === 'history' && onPull && <button className="journey-icon-button" type="button" disabled={pulling} onClick={handlePullClick} aria-label="重新同步"><RefreshCw size={18} className={pulling ? 'spin' : undefined} /></button>}
          {syncState && isMobile && <div className="journey-sync-slot"><SyncStatusIndicator state={syncState} onRetry={onRetryFailed} /></div>}
        </div>
      </header>
      {active === 'settings' && <section className="compact-pwa-readiness" aria-label="Compact travel readiness"><span className={`pwa-chip ${online ? 'ok' : 'warning'}`}>{online ? <Wifi size={13} /> : <WifiOff size={13} />}{online ? '已連線' : '離線'}</span><span className="pwa-chip"><Archive size={13} />同步佇列 · {queueLabel}</span>{installReady && <button className="pwa-chip install" type="button" onClick={handleInstallClick}><Smartphone size={13} /> 安裝到主畫面</button>}</section>}
      {active === 'settings' && updateReady && releaseNotesOpen && <section className="compact-release-notes" aria-label="Compact release notes"><div className="compact-release-notes-head"><strong>這次更新</strong><button type="button" onClick={handleReleaseNotesDismiss}>知道了</button></div><div className="compact-release-note-list">{COMPACT_RELEASE_NOTES.map(note => <article key={note.title}><b>{note.title}</b><small>{note.detail}</small></article>)}</div></section>}
      <main id="journey-main" className="content" tabIndex={-1}>{children}</main>
      <div className={`fixed-tab-bar journey-dock${keyboardOpen ? ' is-keyboard-open' : ''}`}>
        <nav className="app-floating-dock-mobile journey-mobile-nav" aria-label="主要分頁">
          {primaryTabs.map(tab => <button key={tab.id} type="button" aria-label={tab.label} aria-current={active === tab.id ? 'page' : undefined} className={active === tab.id ? 'active' : ''} onClick={() => onTab(tab.id)}>{tabIcon(tab.id)}<span>{tab.label}</span></button>)}
          <button type="button" aria-label="更多" aria-expanded={moreOpen} aria-current={moreActive ? 'page' : undefined} className={moreActive ? 'active' : ''} onClick={() => setMoreOpen(true)}><MoreHorizontal size={22} /><span>{moreActive ? TAB_MANIFEST.find(tab => tab.id === active)?.label : '更多'}</span></button>
        </nav>
      </div>
      {moreOpen && createPortal(<div className="modal-backdrop journey-more-backdrop" onClick={() => setMoreOpen(false)}><section ref={moreRef} className="journey-more-sheet" role="dialog" aria-modal="true" aria-label="更多旅程工具" onClick={event => event.stopPropagation()}><div className="journey-sheet-handle" /><header><h2>旅程工具</h2><button className="journey-icon-button" type="button" aria-label="關閉更多工具" onClick={() => setMoreOpen(false)}><X size={20} /></button></header><nav aria-label="其他分頁">{secondaryTabs.map(tab => <button key={tab.id} type="button" onClick={() => { setMoreOpen(false); onTab(tab.id); }}>{tabIcon(tab.id)}<span>{tab.label}<small>{tab.id === 'weather' ? '看看沿途天氣' : tab.id === 'stats' ? '預算、分帳與花費分析' : '旅程、主題與帳號管理'}</small></span><ChevronDown size={18} className="journey-chevron-right" /></button>)}</nav>{onOpenNewTripWizard && <button className="secondary" type="button" onClick={() => { setMoreOpen(false); onOpenNewTripWizard(); }}><Plus size={17} /> 建立新旅程</button>}</section></div>, document.body)}
    </div>
  );
}
