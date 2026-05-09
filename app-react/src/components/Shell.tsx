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

const icons: Record<TabId, ReactNode> = {
  dashboard: <Home size={20} />,
  scan: <ScanLine size={20} />,
  timeline: <CalendarDays size={20} />,
  history: <List size={20} />,
  weather: <CloudSun size={20} />,
  stats: <BarChart3 size={20} />,
  settings: <Settings size={20} />,
};

export function Shell({
  active,
  onTab,
  children,
  syncState,
}: {
  active: TabId;
  onTab: (tab: TabId) => void;
  children: ReactNode;
  syncState?: SyncEngineState;
}) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [updateReady, setUpdateReady] = useState(false);
  const raf = useRef<number | null>(null);
  const prefersReducedMotion = useReducedMotion();

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
    const root = document.documentElement;
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
  }, []);

  return (
    <div className="app-shell">
      {/* Cherry blossom video background — soft petal drift loop */}
      {!prefersReducedMotion && (
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="none"
          className="sakura-video-bg"
          src={`${import.meta.env.BASE_URL}images/sakura-bg.mp4`}
          aria-hidden="true"
        />
      )}
      {/* Japanese particle background — sakura petals floating */}
      {!prefersReducedMotion && (
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
      <NoiseTexture
        aria-hidden="true"
        focusable="false"
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.08] mix-blend-soft-light"
      />
      {!online && <div className="top-notice offline">離線模式：資料會繼續保存在本機</div>}
      {updateReady && (
        <div className="top-notice update">
          發現新版本
          <button type="button" onClick={() => location.reload()}>立即更新</button>
        </div>
      )}
      <header className="topbar">
        <div>
          <p className="eyebrow">Secure React · mobile web</p>
          <h1><AuroraText colors={['#18395c', '#d94132', '#d39a29', '#18395c']} speed={1.2}>Trip Command Center</AuroraText></h1>
        </div>
        {syncState ? <SyncStatusIndicator state={syncState} /> : <StatusPill tone="ok">Broker-ready</StatusPill>}
      </header>
      <main className="content">{children}</main>
      <WindmillTransition activeKey={active} />

      {/* Fixed bottom tab bar — never scrolls away */}
      <div className="fixed-tab-bar">
        <FloatingDock
          desktopClassName="app-floating-dock-desktop"
          mobileClassName="app-floating-dock-mobile"
          items={TAB_MANIFEST.map((tab) => ({
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
