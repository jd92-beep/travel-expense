import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface RippleItem {
  id: string;
  x: number;
  y: number;
}

export function useRipple() {
  const [ripples, setRipples] = useState<RippleItem[]>([]);

  const triggerRipple = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = Math.random().toString(36).slice(2);
    setRipples(prev => [...prev, { id, x, y }]);
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id));
    }, 600);
  }, []);

  const RippleLayer = () => (
    <AnimatePresence>
      {ripples.map(r => (
        <motion.span
          key={r.id}
          initial={{ scale: 0, opacity: 0.4 }}
          animate={{ scale: 4, opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            left: r.x,
            top: r.y,
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.5)',
            transform: 'translate(-50%,-50%)',
            pointerEvents: 'none',
          }}
        />
      ))}
    </AnimatePresence>
  );

  return { triggerRipple, RippleLayer };
}
