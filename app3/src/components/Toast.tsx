import { motion, AnimatePresence } from 'framer-motion';
import type { ToastItem } from '@/hooks/useToast';

interface ToastProps {
  toasts: ToastItem[];
  removeToast: (id: string) => void;
}

const typeStyles = {
  success: { bg: '#059669', icon: '✓' },
  error: { bg: '#CC2929', icon: '✕' },
  info: { bg: '#2D5A8E', icon: 'ℹ' },
};

export function Toast({ toasts, removeToast }: ToastProps) {
  return (
    <div style={{
      position: 'fixed',
      top: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      width: 'min(calc(100vw - 32px), 360px)',
      pointerEvents: 'none',
    }}>
      <AnimatePresence>
        {toasts.map(t => {
          const style = typeStyles[t.type];
          return (
            <motion.div
              key={t.id}
              initial={{ y: -24, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -12, opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              onClick={() => removeToast(t.id)}
              style={{
                background: style.bg,
                color: 'white',
                borderRadius: 14,
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 14,
                fontWeight: 500,
                boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                pointerEvents: 'auto',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 16 }}>{style.icon}</span>
              {t.message}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
