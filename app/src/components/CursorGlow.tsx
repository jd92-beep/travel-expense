import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useEffect, useState } from 'react';

/**
 * Subtle radial glow that trails the cursor on desktop.
 * Disabled automatically on the first touch event (mobile/tablet).
 */
export function CursorGlow() {
  const x = useMotionValue(-1000);
  const y = useMotionValue(-1000);
  const sx = useSpring(x, { stiffness: 120, damping: 20, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 120, damping: 20, mass: 0.4 });
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // coarse pointer heuristic
    const mq = window.matchMedia('(pointer: coarse)');
    if (mq.matches) {
      setIsTouch(true);
      return;
    }
    const onMove = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    const onTouch = () => setIsTouch(true);
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('touchstart', onTouch, { passive: true, once: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchstart', onTouch);
    };
  }, [x, y]);

  if (isTouch) return null;
  return (
    <motion.div
      aria-hidden
      className="fixed top-0 left-0 pointer-events-none z-0 h-[520px] w-[520px] rounded-full blur-3xl opacity-50 mix-blend-screen"
      style={{
        x: sx,
        y: sy,
        translateX: '-50%',
        translateY: '-50%',
        background:
          'radial-gradient(circle, rgba(239,65,53,0.18) 0%, rgba(245,165,36,0.1) 45%, transparent 70%)',
      }}
    />
  );
}
