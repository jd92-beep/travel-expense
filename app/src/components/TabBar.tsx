import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import {
  Home,
  ScanLine,
  Map,
  History as HistoryIcon,
  BarChart3,
  Cloud,
  Settings as SettingsIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type TabId = 'home' | 'scan' | 'itinerary' | 'history' | 'stats' | 'weather' | 'settings';

const TABS: { id: TabId; label: string; Icon: typeof Home }[] = [
  { id: 'home',      label: '主頁', Icon: Home },
  { id: 'scan',      label: '掃描', Icon: ScanLine },
  { id: 'itinerary', label: '行程', Icon: Map },
  { id: 'history',   label: '紀錄', Icon: HistoryIcon },
  { id: 'stats',     label: '統計', Icon: BarChart3 },
  { id: 'weather',   label: '天氣', Icon: Cloud },
  { id: 'settings',  label: '設定', Icon: SettingsIcon },
];

interface Particle {
  id: number;
  angle: number;
  dist: number;
}

function TabParticles({ active }: { active: boolean }) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const prevActive = useRef(false);

  useEffect(() => {
    if (active && !prevActive.current) {
      const ps: Particle[] = Array.from({ length: 4 }, (_, i) => ({
        id: Date.now() + i,
        angle: (i / 4) * 360 + Math.random() * 30,
        dist: 14 + Math.random() * 8,
      }));
      setParticles(ps);
      const t = setTimeout(() => setParticles([]), 700);
      prevActive.current = true;
      return () => clearTimeout(t);
    }
    if (!active) {
      prevActive.current = false;
    }
  }, [active]);

  return (
    <AnimatePresence>
      {particles.map((p) => {
        const rad = (p.angle * Math.PI) / 180;
        const tx = Math.cos(rad) * p.dist;
        const ty = Math.sin(rad) * p.dist;
        return (
          <motion.span
            key={p.id}
            className="absolute inset-0 m-auto rounded-full bg-arsenal-400 pointer-events-none"
            style={{ width: 4, height: 4 }}
            initial={{ x: 0, y: 0, opacity: 0.9, scale: 1 }}
            animate={{ x: tx, y: ty, opacity: 0, scale: 0.3 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          />
        );
      })}
    </AnimatePresence>
  );
}

export function TabBar({
  active,
  onChange,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
}) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 pb-safe">
      <div className="mx-auto max-w-2xl px-3">
        <div className="relative glass-strong rounded-3xl px-1.5 py-1.5 flex items-center justify-between overflow-hidden shadow-[0_-8px_40px_-12px_rgba(0,0,0,0.8)]">
          {/* Top sheen */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-arsenal-500/60 to-transparent"
          />
          {TABS.map((tab) => {
            const { Icon } = tab;
            const isActive = tab.id === active;
            return (
              <motion.button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                aria-label={tab.label}
                whileTap={{ scale: 0.88 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                className={cn(
                  'relative z-10 flex flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-medium flex-1 min-w-0',
                  isActive ? 'text-white' : 'text-ink-400 hover:text-ink-200',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-2xl bg-gradient-arsenal shadow-glow animate-glow-pulse"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}

                {/* Particle burst on tab activate */}
                <span className="relative" style={{ isolation: 'isolate' }}>
                  <TabParticles active={isActive} />

                  {/* Icon with wiggle when tapped */}
                  <motion.span
                    className="relative z-10 block"
                    animate={isActive ? { scale: [1, 1.2, 1] } : { scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15, duration: 0.4 }}
                  >
                    <motion.span
                      className="block"
                      whileTap={{
                        rotate: [0, -15, 15, -8, 0],
                        scale: [1, 1.3, 1.15, 1.05, 1],
                        transition: {
                          type: 'keyframes',
                          duration: 0.4,
                          ease: 'easeInOut',
                        },
                      }}
                    >
                      <Icon size={18} strokeWidth={isActive ? 2.4 : 1.8} />
                    </motion.span>
                  </motion.span>
                </span>

                <motion.span
                  className="relative z-10 tracking-wide"
                  animate={isActive ? { y: 0, opacity: 1 } : { y: 2, opacity: 0.6 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 25 }}
                >
                  {tab.label}
                </motion.span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
