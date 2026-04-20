import { motion } from 'framer-motion';
import type { TabId } from '@/lib/types';

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'dashboard', label: '主頁', icon: '🏠' },
  { id: 'scan',      label: '掃描', icon: '📷' },
  { id: 'history',   label: '紀錄', icon: '📋' },
  { id: 'stats',     label: '統計', icon: '📊' },
  { id: 'settings',  label: '設定', icon: '⚙️' },
];

interface TabBarProps {
  active: TabId;
  onChange: (id: TabId) => void;
}

export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 90,
      background: 'rgba(253,245,239,0.92)',
      backdropFilter: 'blur(24px)',
      borderTop: '1px solid rgba(255,220,210,0.60)',
      boxShadow: '0 -4px 20px rgba(204,41,41,0.06)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-around',
        padding: '6px 0 4px',
        maxWidth: 600,
        margin: '0 auto',
      }}>
        {TABS.map(tab => {
          const isActive = tab.id === active;
          return (
            <motion.button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              whileTap={{ scale: 0.88 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 12px',
                borderRadius: 12,
                position: 'relative',
                minWidth: 56,
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="v3-tab-pill"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 12,
                    background: 'rgba(204,41,41,0.10)',
                  }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <motion.span
                animate={isActive ? { scale: [1, 1.25, 1] } : { scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 12 }}
                style={{ fontSize: 22, lineHeight: 1, position: 'relative' }}
              >
                {tab.icon}
              </motion.span>
              <span style={{
                fontSize: 10,
                fontWeight: isActive ? 700 : 400,
                color: isActive ? '#CC2929' : '#6B7285',
                position: 'relative',
                transition: 'color 0.2s',
              }}>
                {tab.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
