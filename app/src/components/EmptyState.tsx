import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  glyph?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, subtitle, glyph, action }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="text-center py-12 px-6"
    >
      <motion.div
        animate={{ y: [0, -6, 0], rotate: [-2, 2, -2] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="inline-flex"
      >
        {glyph ?? <FloatingReceipt />}
      </motion.div>
      <div className="mt-5 font-semibold text-ink-100">{title}</div>
      {subtitle && <div className="mt-1 text-xs text-ink-400 leading-relaxed">{subtitle}</div>}
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
}

function FloatingReceipt() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden>
      <defs>
        <linearGradient id="er" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ef4135" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
        <filter id="erGlow">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <rect x="18" y="12" width="36" height="48" rx="6" fill="url(#er)" opacity="0.12" filter="url(#erGlow)" />
      <rect x="20" y="14" width="32" height="44" rx="5" fill="rgba(20,17,15,0.9)" stroke="url(#er)" strokeWidth="1.2" />
      <path d="M26 24 h20 M26 32 h16 M26 40 h12" stroke="rgba(239,65,53,0.6)" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="46" cy="48" r="4" fill="url(#er)" />
      <path d="M20 58 L24 54 L28 58 L32 54 L36 58 L40 54 L44 58 L48 54 L52 58" stroke="url(#er)" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
