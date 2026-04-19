import { motion } from 'framer-motion';
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
              <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                aria-label={tab.label}
                className={cn(
                  'relative z-10 flex flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-medium transition-colors flex-1 min-w-0',
                  isActive ? 'text-white' : 'text-ink-400 hover:text-ink-200',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-2xl bg-gradient-arsenal shadow-glow"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex flex-col items-center gap-0.5">
                  <Icon size={18} strokeWidth={isActive ? 2.4 : 1.8} />
                  <span className="tracking-wide">{tab.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
