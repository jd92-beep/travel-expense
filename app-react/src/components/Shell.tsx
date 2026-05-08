import { BarChart3, CalendarDays, CloudSun, Home, List, PlusCircle, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { TAB_MANIFEST } from '../lib/tabs';
import type { TabId } from '../lib/types';
import { BottomDock, StatusPill } from './ui';

const icons: Record<TabId, ReactNode> = {
  dashboard: <Home size={20} />,
  scan: <PlusCircle size={20} />,
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
}: {
  active: TabId;
  onTab: (tab: TabId) => void;
  children: ReactNode;
}) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [updateReady, setUpdateReady] = useState(false);

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

  return (
    <div className="app-shell">
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
          <h1>Trip Command Center</h1>
        </div>
        <StatusPill tone="ok">Broker-ready</StatusPill>
      </header>
      <main className="content">{children}</main>
      <BottomDock
        active={active}
        ariaLabel="主要分頁"
        items={TAB_MANIFEST.map((tab) => ({ ...tab, icon: icons[tab.id] }))}
        onSelect={onTab}
      />
    </div>
  );
}
