import { motion } from 'framer-motion';

export function AmbientBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Base radial wash */}
      <div className="absolute inset-0 bg-gradient-to-br from-ink-950 via-ink-900 to-black" />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(100% 60% at 50% 0%, rgba(239, 65, 53, 0.08) 0%, transparent 70%)',
        }}
      />

      {/* Blob 1 — Arsenal red */}
      <motion.div
        aria-hidden
        className="absolute rounded-full blur-3xl"
        style={{
          width: 620,
          height: 620,
          background: 'radial-gradient(circle, rgba(239,65,53,0.55) 0%, transparent 70%)',
          top: '-18%',
          left: '-12%',
        }}
        animate={{
          x: [0, 60, -40, 0],
          y: [0, 40, -30, 0],
          scale: [1, 1.1, 0.95, 1],
        }}
        transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Blob 2 — Ember gold */}
      <motion.div
        aria-hidden
        className="absolute rounded-full blur-3xl"
        style={{
          width: 520,
          height: 520,
          background: 'radial-gradient(circle, rgba(245,165,36,0.45) 0%, transparent 70%)',
          bottom: '-20%',
          right: '-12%',
        }}
        animate={{
          x: [0, -50, 30, 0],
          y: [0, -40, 20, 0],
          scale: [1, 0.92, 1.12, 1],
        }}
        transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Blob 3 — Sakura pink (subtle) */}
      <motion.div
        aria-hidden
        className="absolute rounded-full blur-3xl"
        style={{
          width: 420,
          height: 420,
          background: 'radial-gradient(circle, rgba(242,137,150,0.22) 0%, transparent 70%)',
          top: '42%',
          right: '18%',
        }}
        animate={{
          x: [0, 40, -30, 0],
          y: [0, -30, 40, 0],
        }}
        transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Seigaiha wave pattern — very subtle Japanese accent */}
      <svg
        aria-hidden
        className="absolute top-0 left-0 opacity-[0.025]"
        width="320"
        height="320"
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

      {/* Vignette */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.4) 100%)',
        }}
      />
    </div>
  );
}
