import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { TabId } from '@/lib/types';
import { useAppState } from '@/hooks/useAppState';
import { useToast } from '@/hooks/useToast';
import { TabBar } from '@/components/TabBar';
import { Toast } from '@/components/Toast';
import { Dashboard } from '@/tabs/Dashboard';
import { Scan } from '@/tabs/Scan';
import { History } from '@/tabs/History';
import { Stats } from '@/tabs/Stats';
import { Settings } from '@/tabs/Settings';

const TAB_DIRS: Record<TabId, number> = {
  dashboard: 0,
  scan: 1,
  history: 2,
  stats: 3,
  settings: 4,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [prevTab, setPrevTab] = useState<TabId>('dashboard');
  const { state, updateState, addReceipt, updateReceipt, deleteReceipt, clearAll } = useAppState();
  const { toasts, showToast, removeToast } = useToast();

  const direction = TAB_DIRS[activeTab] > TAB_DIRS[prevTab] ? 1 : -1;

  function handleTabChange(tab: TabId) {
    setPrevTab(activeTab);
    setActiveTab(tab);
  }

  const variants = {
    enter: (dir: number) => ({ x: dir * 32, opacity: 0, filter: 'blur(4px)' }),
    center: { x: 0, opacity: 1, filter: 'blur(0px)' },
    exit: (dir: number) => ({ x: dir * -32, opacity: 0, filter: 'blur(4px)' }),
  };

  return (
    <div style={{ position: 'relative', minHeight: '100svh', zIndex: 1 }}>
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={activeTab}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }}
          style={{ position: 'absolute', inset: 0, overflowY: 'auto' }}
        >
          {activeTab === 'dashboard' && <Dashboard state={state} />}
          {activeTab === 'scan' && (
            <Scan state={state} onAdd={addReceipt} showToast={showToast} />
          )}
          {activeTab === 'history' && (
            <History
              state={state}
              onUpdate={updateReceipt}
              onDelete={deleteReceipt}
              showToast={showToast}
            />
          )}
          {activeTab === 'stats' && <Stats state={state} />}
          {activeTab === 'settings' && (
            <Settings
              state={state}
              onUpdate={updateState}
              onClear={clearAll}
              showToast={showToast}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <TabBar active={activeTab} onChange={handleTabChange} />
      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
