import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AmbientBackground } from '@/components/AmbientBackground';
import { CursorGlow } from '@/components/CursorGlow';
import { TabBar, type TabId } from '@/components/TabBar';
import { useAppState } from '@/hooks/useAppState';
import { nowHKTime } from '@/lib/itinerary';
import { Dashboard } from '@/tabs/Dashboard';
import { Scan } from '@/tabs/Scan';
import { Itinerary } from '@/tabs/Itinerary';
import { History } from '@/tabs/History';
import { Stats } from '@/tabs/Stats';
import { Weather } from '@/tabs/Weather';
import { Settings } from '@/tabs/Settings';

const TAB_ORDER: TabId[] = [
  'home',
  'scan',
  'itinerary',
  'history',
  'stats',
  'weather',
  'settings',
];

export function App() {
  const [tab, setTab] = useState<TabId>('home');
  const directionRef = useRef(0);
  const { state, updateState } = useAppState();

  const handleTabChange = useCallback(
    (next: TabId) => {
      if (next === tab) return;
      const oldIdx = TAB_ORDER.indexOf(tab);
      const newIdx = TAB_ORDER.indexOf(next);
      directionRef.current = newIdx > oldIdx ? 1 : -1;
      setTab(next);
    },
    [tab],
  );

  const handleOpenReceipt = (_id: string) => {
    // Receipt edit modal — next iteration
  };

  const content = (() => {
    switch (tab) {
      case 'home':      return <Dashboard state={state} onOpenReceipt={handleOpenReceipt} onGoScan={() => handleTabChange('scan')} />;
      case 'scan':      return <Scan />;
      case 'itinerary': return <Itinerary />;
      case 'history':   return <History state={state} onOpenReceipt={handleOpenReceipt} />;
      case 'stats':     return <Stats state={state} />;
      case 'weather':   return <Weather />;
      case 'settings':  return <Settings state={state} updateState={updateState} />;
    }
  })();

  const dir = directionRef.current;

  return (
    <>
      <AmbientBackground />
      <CursorGlow />
      <div className="relative z-10 mx-auto max-w-2xl px-5 pt-safe pb-[104px]">
        <AppHeader />
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.main
            key={tab}
            custom={dir}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            {content}
          </motion.main>
        </AnimatePresence>
      </div>
      <TabBar active={tab} onChange={handleTabChange} />
    </>
  );
}

const pageVariants = {
  enter: (d: number) => ({ opacity: 0, x: 28 * d, filter: 'blur(6px)' }),
  center: { opacity: 1, x: 0, filter: 'blur(0px)' },
  exit: (d: number) => ({ opacity: 0, x: -28 * d, filter: 'blur(6px)' }),
};

function AppHeader() {
  const [time, setTime] = useState(() => nowHKTime());

  useEffect(() => {
    const id = setInterval(() => setTime(nowHKTime()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="flex items-center justify-between py-5">
      <div className="flex items-center gap-2.5">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 20 }}
          whileHover={{ scale: 1.08, rotate: 6 }}
          className="relative h-10 w-10 rounded-2xl bg-gradient-arsenal grid place-items-center shadow-glow overflow-hidden cursor-default"
        >
          <span className="text-xl relative z-10">🗾</span>
          <div
            aria-hidden
            className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/40 via-white/0 to-transparent"
          />
          <div
            aria-hidden
            className="absolute inset-0 rounded-2xl bg-gradient-sheen bg-[length:200%_100%] animate-shimmer opacity-70"
          />
        </motion.div>
        <div>
          <div className="font-display text-lg leading-none font-bold">旅費</div>
          <div className="text-[10px] text-ink-400 tracking-[0.22em] num mt-0.5">
            NAGOYA · 2026
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-[0.22em] text-ink-400">HKT</div>
        <div className="num text-xs text-ink-200 mt-0.5 font-semibold">{time}</div>
      </div>
    </header>
  );
}
