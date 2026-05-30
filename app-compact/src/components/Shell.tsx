import { BarChart3, CalendarDays, CloudSun, Home, List, ScanLine, Settings } from 'lucide-react';
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


const icons: Record<TabId, ReactNode> = {
  dashboard: <Home size={20} />,
  scan: <ScanLine size={20} />,
  timeline: <CalendarDays size={20} />,
  history: <List size={20} />,
  weather: <CloudSun size={20} />,
  stats: <BarChart3 size={20} />,
  settings: <Settings size={20} />,
};

const shellCopy: Record<TabId, { title: string }> = {
  dashboard: { title: 'Travel Ledger' },
  scan: { title: 'Receipt Studio' },
  timeline: { title: 'Trip Route' },
  history: { title: 'Expense Record' },
  weather: { title: 'Weather Window' },
  stats: { title: 'Spend Cockpit' },
  settings: { title: 'Secure Controls' },
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
      <header className="topbar topbar-canva">
        <div className="topbar-title-block">
          <h1>
            {richVisualEffects
              ? <AuroraText colors={['#18395c', '#d94132', '#d39a29', '#2d6e48']} speed={1.2}>{activeCopy.title}</AuroraText>
              : activeCopy.title}
          </h1>
        </div>
        {syncState ? <SyncStatusIndicator state={syncState} onRetry={onRetryFailed} /> : <StatusPill tone="ok">Broker-ready</StatusPill>}
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
