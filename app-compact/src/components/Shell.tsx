import { BarChart3, Bell, CalendarDays, CloudSun, Download, Home, List, MoreVertical, ReceiptText, ScanLine, Settings, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { TAB_MANIFEST } from '../lib/tabs';
import type { SyncEngineState, TabId } from '../lib/types';
import { StatusPill } from './ui';
import { WindmillTransition } from './WindmillTransition';
import { FloatingDock } from './ui/floating-dock';
import { NoiseTexture } from './ui/noise-texture';
import { Particles } from './ui/particles';
import { AuroraText } from './ui/aurora-text';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { shouldDisableHeavyEffects } from '../lib/performance';
import compactJapanMark from '../assets/generated/compact-japan-mark.svg';


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
  dashboard: { title: 'Travel Ledger', mobileTitle: '日本東京之旅', subtitle: '2025年5月10日 - 5月17日', status: '進行中' },
  scan: { title: 'Receipt Studio', mobileTitle: '收據掃描工作室', subtitle: '掃描 · 辨識 · 記帳', status: '就緒 · 可掃描' },
  timeline: { title: 'Trip Route', mobileTitle: '行程時間線', subtitle: '東京之旅 · 8天7夜', status: '地圖檢視' },
  history: { title: 'Expense Record', mobileTitle: '紀錄中心', subtitle: '管理所有收據與支出', status: '可同步' },
  weather: { title: 'Weather Window', mobileTitle: '天氣預報', subtitle: '旅程天氣 · 隨時掌握', status: '已更新' },
  stats: { title: 'Spend Flight Deck', mobileTitle: '預算使用分析', subtitle: 'Spend Cockpit', status: '統計中' },
  settings: { title: 'Secure Controls', mobileTitle: '設定控制中心', subtitle: 'Secure Controls', status: '系統狀態' },
};

// Legacy helper kept for backwards compatibility but we rely on shouldDisableHeavyEffects now.
function prefersStableMobileEffects() {
  return shouldDisableHeavyEffects();
}

export function Shell({
  active,
  onTab,
  children,
  syncState,
  onRetryFailed,
}: {
  active: TabId;
  onTab: (tab: TabId) => void;
  children: ReactNode;
  syncState?: SyncEngineState;
  onRetryFailed?: () => void;
}) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [updateReady, setUpdateReady] = useState(false);
  const [stableMobileEffects, setStableMobileEffects] = useState(shouldDisableHeavyEffects);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  const raf = useRef<number | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const richVisualEffects = !prefersReducedMotion && !stableMobileEffects;
  const activeCopy = shellCopy[active];

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onControllerChange = () => setUpdateReady(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  useEffect(() => {
    const handlePerformanceAndEffects = () => {
      const disableHeavy = shouldDisableHeavyEffects();
      setStableMobileEffects(disableHeavy);
      setIsMobile(window.innerWidth <= 768);

      // Dynamically toggle class on HTML element to apply lightweight styles/animations
      if (disableHeavy) {
        document.documentElement.classList.add('stable-effects');
      } else {
        document.documentElement.classList.remove('stable-effects');
      }
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
    if (prefersReducedMotion || stableMobileEffects) {
      root.style.setProperty('--scroll-y', '0px');
      root.style.setProperty('--scroll-progress', '0');
      return undefined;
    }
    const update = () => {
      raf.current = null;
      const max = Math.max(1, document.body.scrollHeight - window.innerHeight);
      const y = Math.max(0, window.scrollY);
      root.style.setProperty('--scroll-y', `${y.toFixed(0)}px`);
      root.style.setProperty('--scroll-progress', `${Math.min(1, y / max).toFixed(4)}`);
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
  }, [prefersReducedMotion, stableMobileEffects]);

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
      {syncState?.status === 'error' && (
        <div className="top-notice text-red-700 bg-red-50 border border-red-200/60 dark:bg-red-950/20 dark:border-red-900/30 dark:text-red-300 backdrop-blur-md flex items-center justify-between gap-4 w-full" style={{ background: 'rgba(253, 240, 240, 0.95)', border: '1px solid rgba(194, 59, 94, 0.3)', color: '#A83030' }}>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            <span className="truncate max-w-[200px] xs:max-w-xs md:max-w-md font-semibold">有資料同步失敗，請檢查連線或設定。{syncState.error ? `(${syncState.error})` : ''}</span>
          </div>
          {onRetryFailed && (
            <button
              type="button"
              onClick={onRetryFailed}
              className="px-3 py-1 text-xs font-semibold bg-[#C23B5E] hover:bg-[#A83030] text-white rounded-full transition-all duration-200 active:scale-95 shadow-sm shrink-0"
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
          <h1>
            {richVisualEffects
              ? <AuroraText colors={['#18395c', '#d94132', '#d39a29', '#2d6e48']} speed={1.2}>{activeCopy.title}</AuroraText>
              : activeCopy.title}
          </h1>
        </div>
        <div className="compact-desktop-actions relative z-10" aria-label="Dashboard controls">
          <span><ReceiptText size={16} /> 142 receipts</span>
          <button type="button"><CalendarDays size={16} /> Apr 20 - Apr 30, 2025</button>
          <button type="button"><Users size={16} /> All travelers</button>
          <button type="button">JPY</button>
          <button type="button"><Download size={16} /> Export</button>
          <button type="button" aria-label="More controls"><MoreVertical size={18} /></button>
        </div>
        {syncState && (
          <div className={`compact-sync-slot relative z-10 ${syncState.status === 'error' ? 'has-error' : 'is-quiet'}`}>
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
          <h1><span className="compact-mobile-title-art" data-title={activeCopy.mobileTitle}>{isMobile ? activeCopy.mobileTitle : ''}</span></h1>
          <p>{activeCopy.subtitle}</p>
        </div>
        <span className="compact-mobile-status relative z-10">{activeCopy.status}</span>
        <button className={`compact-mobile-action relative z-10 ${active === 'dashboard' ? 'has-alert' : ''}`} type="button" aria-label="更多操作">
          {active === 'dashboard' ? <Bell size={25} /> : active === 'scan' ? <Settings size={25} /> : <MoreVertical size={25} />}
        </button>
      </header>
      <main className="content">{children}</main>
      <WindmillTransition activeKey={active} />

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
