import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';

interface BudgetRingProps {
  used: number;
  total: number;
  label?: string;
}

export function BudgetRing({ used, total, label = '預算進度' }: BudgetRingProps) {
  const pct = total > 0 ? Math.min(used / total, 1.5) : 0;
  const size = 220;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const spring = useSpring(0, { stiffness: 80, damping: 18 });
  const dashOffset = useTransform(spring, (v) => c * (1 - Math.min(v, 1)));

  useEffect(() => {
    spring.set(pct);
  }, [pct, spring]);

  const usedPct = Math.round(pct * 100);
  const remaining = Math.max(total - used, 0);
  const overBudget = used > total;

  return (
    <div className="relative grid place-items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        <defs>
          <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ef4135" />
            <stop offset="50%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
          <linearGradient id="ringOver" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#f43f5e" />
            <stop offset="100%" stopColor="#be123c" />
          </linearGradient>
          <filter id="ringGlow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
          fill="none"
        />
        {/* Progress arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={overBudget ? 'url(#ringOver)' : 'url(#ringGrad)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          filter="url(#ringGlow)"
          strokeDasharray={c}
          style={{ strokeDashoffset: dashOffset }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-ink-400 text-[10px] uppercase tracking-[0.22em]">
          {label}
        </span>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="num text-5xl font-extrabold mt-1 text-gradient-arsenal"
        >
          {usedPct}
          <span className="text-2xl align-top">%</span>
        </motion.div>
        <div className="text-ink-400 text-[11px] mt-1 num">
          {overBudget ? (
            <span className="text-rose-400 font-semibold">
              超支 ¥{Math.round(used - total).toLocaleString()}
            </span>
          ) : (
            <span>剩 ¥{remaining.toLocaleString()}</span>
          )}
        </div>
      </div>
    </div>
  );
}
