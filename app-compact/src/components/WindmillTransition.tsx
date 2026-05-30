import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

function isLowEndDevice() {
  if (typeof navigator === 'undefined') return false;
  const hints = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  return Boolean(
    (hints.deviceMemory && hints.deviceMemory <= 4)
      || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
      || hints.connection?.saveData,
  );
}

function shouldUseStableTransition() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches || isLowEndDevice();
}

export function WindmillTransition({ activeKey }: { activeKey: string }) {
  const reducedMotion = useReducedMotion();
  const [stableTransition, setStableTransition] = useState(shouldUseStableTransition);

  useEffect(() => {
    const queries = [
      window.matchMedia('(prefers-reduced-motion: reduce)'),
    ];
    const updateTransitionMode = () => setStableTransition(shouldUseStableTransition());
    for (const query of queries) query.addEventListener('change', updateTransitionMode);
    updateTransitionMode();
    return () => {
      for (const query of queries) query.removeEventListener('change', updateTransitionMode);
    };
  }, []);

  if (reducedMotion || stableTransition) return null;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        className="windmill-transition"
        key={activeKey}
        initial={{ opacity: 0, rotate: -90, scale: 0.85 }}
        animate={{ opacity: [0, 0.12, 0], rotate: [-90, 45, 45], scale: [0.85, 1.02, 1] }}
        transition={{
          duration: 0.45,
          ease: [0.25, 0.1, 0.25, 1.0],
          times: [0, 0.4, 1],
        }}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          width: '100vmax',
          height: '100vmax',
          marginLeft: '-50vmax',
          marginTop: '-50vmax',
          pointerEvents: 'none',
          zIndex: 40,
          contain: 'paint',
          willChange: 'transform, opacity',
          background: `
            conic-gradient(
              from 0deg,
              transparent 0deg,
              rgba(194, 59, 94, 0.06) 30deg,
              transparent 60deg,
              rgba(30, 77, 107, 0.06) 90deg,
              transparent 120deg,
              rgba(212, 168, 67, 0.06) 150deg,
              transparent 180deg,
              rgba(194, 59, 94, 0.06) 210deg,
              transparent 240deg,
              rgba(30, 77, 107, 0.06) 270deg,
              transparent 300deg,
              rgba(212, 168, 67, 0.06) 330deg,
              transparent 360deg
            )
          `,
        }}
      />
    </AnimatePresence>
  );
}
