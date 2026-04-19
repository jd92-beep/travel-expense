import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

/** Returns gradient config based on local hour. */
function getTimeTheme() {
  const h = new Date().getHours();
  if (h >= 5 && h < 8) {
    return {
      name: 'dawn',
      b1: 'rgba(242,137,150,0.40)',    // sakura pink
      b2: 'rgba(245,165,36,0.35)',     // ember
      b3: 'rgba(167,139,250,0.18)',    // lavender
    };
  }
  if (h >= 8 && h < 17) {
    return {
      name: 'day',
      b1: 'rgba(239,65,53,0.42)',      // arsenal
      b2: 'rgba(245,165,36,0.36)',     // ember
      b3: 'rgba(242,137,150,0.18)',    // sakura
    };
  }
  if (h >= 17 && h < 20) {
    return {
      name: 'golden',
      b1: 'rgba(251,113,60,0.50)',     // sunset orange
      b2: 'rgba(239,65,53,0.40)',      // arsenal deep
      b3: 'rgba(251,191,36,0.25)',     // gold highlight
    };
  }
  return {
    name: 'night',
    b1: 'rgba(124,58,237,0.28)',       // deep violet
    b2: 'rgba(239,65,53,0.28)',        // arsenal ember
    b3: 'rgba(56,189,248,0.14)',       // cool cyan
  };
}

export function AmbientBackground() {
  const [theme, setTheme] = useState(getTimeTheme);

  useEffect(() => {
    const id = setInterval(() => setTheme(getTimeTheme()), 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Base */}
      <div className="absolute inset-0 bg-gradient-to-br from-ink-950 via-ink-900 to-black" />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(100% 60% at 50% 0%, rgba(239, 65, 53, 0.06) 0%, transparent 70%)',
        }}
      />

      {/* Blob 1 */}
      <motion.div
        aria-hidden
        className="absolute rounded-full blur-3xl"
        style={{
          width: 640,
          height: 640,
          background: `radial-gradient(circle, ${theme.b1} 0%, transparent 70%)`,
          top: '-18%',
          left: '-12%',
          willChange: 'transform',
        }}
        animate={{
          x: [0, 60, -40, 0],
          y: [0, 40, -30, 0],
          scale: [1, 1.1, 0.95, 1],
        }}
        transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Blob 2 */}
      <motion.div
        aria-hidden
        className="absolute rounded-full blur-3xl"
        style={{
          width: 540,
          height: 540,
          background: `radial-gradient(circle, ${theme.b2} 0%, transparent 70%)`,
          bottom: '-22%',
          right: '-14%',
          willChange: 'transform',
        }}
        animate={{
          x: [0, -50, 30, 0],
          y: [0, -40, 20, 0],
          scale: [1, 0.92, 1.12, 1],
        }}
        transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Blob 3 */}
      <motion.div
        aria-hidden
        className="absolute rounded-full blur-3xl"
        style={{
          width: 420,
          height: 420,
          background: `radial-gradient(circle, ${theme.b3} 0%, transparent 70%)`,
          top: '42%',
          right: '18%',
          willChange: 'transform',
        }}
        animate={{
          x: [0, 40, -30, 0],
          y: [0, -30, 40, 0],
        }}
        transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Seigaiha wave corner */}
      <svg
        aria-hidden
        className="absolute top-0 left-0 opacity-[0.028]"
        width="360"
        height="360"
        viewBox="0 0 100 100"
      >
        <defs>
          <pattern id="seigaiha" x="0" y="0" width="20" height="10" patternUnits="userSpaceOnUse">
            <path d="M0 10 A 10 10 0 0 1 20 10" fill="none" stroke="#fff" strokeWidth="0.5" />
            <path d="M-10 10 A 10 10 0 0 1 10 10" fill="none" stroke="#fff" strokeWidth="0.5" />
            <path d="M10 10 A 10 10 0 0 1 30 10" fill="none" stroke="#fff" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#seigaiha)" />
      </svg>
      <svg
        aria-hidden
        className="absolute bottom-0 right-0 opacity-[0.02] rotate-180"
        width="300"
        height="300"
        viewBox="0 0 100 100"
      >
        <rect width="100" height="100" fill="url(#seigaiha)" />
      </svg>

      {/* Vignette */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.45) 100%)',
        }}
      />
    </div>
  );
}
