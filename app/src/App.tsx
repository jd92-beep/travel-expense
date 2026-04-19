import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { AmbientBackground } from '@/components/AmbientBackground';
import { TabBar, type TabId } from '@/components/TabBar';
import { useAppState } from '@/hooks/useAppState';
import { Dashboard } from '@/tabs/Dashboard';
import { Scan } from '@/tabs/Scan';
import { Itinerary } from '@/tabs/Itinerary';
import { History } from '@/tabs/History';
import { Stats } from '@/tabs/Stats';
import { Weather } from '@/tabs/Weather';
import { Settings } from '@/tabs/Settings';

export function App() {
  const [tab, setTab] = useState<TabId>('home');
  const { state, updateState } = useAppState();

  const handleOpenReceipt = (_id: string) => {
    // TODO: receipt edit modal (coming in next iteration)
  };

  const content = (() => {
    switch (tab) {
      case 'home':      return <Dashboard state={state} onOpenReceipt={handleOpenReceipt} />;
      case 'scan':      return <Scan />;
      case 'itinerary': return <Itinerary />;
      case 'history':   return <History state={state} onOpenReceipt={handleOpenReceipt} />;
      case 'stats':     return <Stats state={state} />;
      case 'weather':   return <Weather />;
      case 'settings':  return <Settings state={state} updateState={updateState} />;
    }
  })();

  return (
    <>
      <AmbientBackground />
      <div className="relative z-10 mx-auto max-w-2xl px-5 pt-safe pb-[104px]">
        <AppHeader />
        <AnimatePresence mode="wait">
          <motion.main
            key={tab}
            initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            {content}
          </motion.main>
        </AnimatePresence>
      </div>
      <TabBar active={tab} onChange={setTab} />
    </>
  );
}

function AppHeader() {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString('en-HK', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setTime(
        new Date().toLocaleTimeString('en-HK', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
      );
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="flex items-center justify-between py-5">
      <div className="flex items-center gap-2.5">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 20 }}
          className="relative h-10 w-10 rounded-2xl bg-gradient-arsenal grid place-items-center shadow-glow overflow-hidden"
        >
          <span className="text-xl relative z-10">🗾</span>
          <div
            aria-hidden
            className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/40 via-white/0 to-transparent"
          />
          <div
            aria-hidden
            className="absolute inset-0 rounded-2xl bg-gradient-sheen bg-[length:200%_100%] animate-shimmer opacity-60"
          />
        </motion.div>
        <div>
          <div className="font-display text-lg leading-none font-bold">旅費</div>
          <div className="text-[10px] text-ink-400 tracking-[0.2em] num mt-0.5">
            NAGOYA · 2026
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-[0.2em] text-ink-400">HKT</div>
        <div className="num text-xs text-ink-200 mt-0.5 font-semibold">{time}</div>
      </div>
    </header>
  );
}
