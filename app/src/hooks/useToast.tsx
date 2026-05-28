import { AnimatePresence, motion } from 'framer-motion';
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';
export interface Toast {
  id: string;
  msg: string;
  tone: ToastTone;
}

interface Ctx {
  toast: (msg: string, tone?: ToastTone) => void;
}
const ToastContext = createContext<Ctx | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast used outside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const toast = useCallback((msg: string, tone: ToastTone = 'info') => {
    const id = 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    setItems((xs) => [...xs, { id, msg, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((t) => t.id !== id)), 3200);
  }, []);

  const toneStyles: Record<ToastTone, string> = {
    info:    'bg-ink-800/95 border-white/10 text-ink-100',
    success: 'bg-jade-600/90 border-jade-400/40 text-white',
    warning: 'bg-ember-600/90 border-ember-400/40 text-white',
    error:   'bg-rose-600/90 border-rose-400/40 text-white',
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] pointer-events-none flex flex-col items-center gap-2 px-4 max-w-sm w-full">
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -20, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className={`pointer-events-auto rounded-2xl backdrop-blur-xl border shadow-card px-4 py-2.5 text-sm font-medium text-center ${toneStyles[t.tone]}`}
            >
              {t.msg}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
