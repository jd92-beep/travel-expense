import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

export function WindmillTransition({ activeKey }: { activeKey: string }) {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return null;
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeKey}
        initial={{ opacity: 0, rotate: -120, scale: 0.8 }}
        animate={{ opacity: [0, 0.15, 0], rotate: [-120, 0, 0], scale: [0.8, 1.05, 1] }}
        transition={{
          duration: 0.55,
          ease: 'easeInOut',
          times: [0, 0.5, 1],
        }}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          width: '200vmax',
          height: '200vmax',
          marginLeft: '-100vmax',
          marginTop: '-100vmax',
          pointerEvents: 'none',
          zIndex: 40,
          background: `
            conic-gradient(
              from 0deg,
              transparent 0deg,
              rgba(216, 64, 48, 0.05) 22.5deg,
              transparent 45deg,
              rgba(24, 57, 92, 0.05) 67.5deg,
              transparent 90deg,
              rgba(211, 154, 41, 0.05) 112.5deg,
              transparent 135deg,
              rgba(240, 184, 200, 0.05) 157.5deg,
              transparent 180deg,
              rgba(216, 64, 48, 0.05) 202.5deg,
              transparent 225deg,
              rgba(24, 57, 92, 0.05) 247.5deg,
              transparent 270deg,
              rgba(211, 154, 41, 0.05) 292.5deg,
              transparent 315deg,
              rgba(240, 184, 200, 0.05) 337.5deg,
              transparent 360deg
            )
          `,
        }}
      />
    </AnimatePresence>
  );
}
