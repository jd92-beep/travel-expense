import { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface RippleItem {
  id: number;
  x: number;
  y: number;
  size: number;
}

interface UseRippleOptions {
  color?: string;
  duration?: number;
}

export function useRipple(options: UseRippleOptions = {}) {
  const { color = 'rgba(255,255,255,0.28)', duration = 550 } = options;
  const [ripples, setRipples] = useState<RippleItem[]>([]);
  const counterRef = useRef(0);

  const triggerRipple = useCallback(
    (e: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>) => {
      const el = e.currentTarget as HTMLElement;
      const rect = el.getBoundingClientRect();

      let clientX: number;
      let clientY: number;

      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        clientX = e.clientX;
        clientY = e.clientY;
      } else {
        clientX = rect.left + rect.width / 2;
        clientY = rect.top + rect.height / 2;
      }

      const x = clientX - rect.left;
      const y = clientY - rect.top;

      // Size should be large enough to cover the button
      const size = Math.max(rect.width, rect.height) * 2.2;

      const id = ++counterRef.current;
      setRipples((prev) => [...prev, { id, x, y, size }]);

      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, duration + 100);
    },
    [duration],
  );

  function RippleLayer() {
    return (
      <span className="ripple-layer" aria-hidden>
        <AnimatePresence>
          {ripples.map((r) => (
            <motion.span
              key={r.id}
              className="particle"
              initial={{ scale: 0, opacity: 0.35 }}
              animate={{ scale: 1, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: duration / 1000, ease: 'easeOut' }}
              style={{
                left: r.x - r.size / 2,
                top: r.y - r.size / 2,
                width: r.size,
                height: r.size,
                background: color,
              }}
            />
          ))}
        </AnimatePresence>
      </span>
    );
  }

  return { triggerRipple, RippleLayer };
}
