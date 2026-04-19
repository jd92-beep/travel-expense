import { motion } from 'framer-motion';
import { CATEGORIES, PAYMENTS } from '@/lib/constants';
import { cn, formatJPY, formatHKD } from '@/lib/utils';
import type { Receipt } from '@/lib/types';

interface ReceiptCardProps {
  receipt: Receipt;
  rate: number;
  onClick?: () => void;
}

export function ReceiptCard({ receipt, rate, onClick }: ReceiptCardProps) {
  const cat = CATEGORIES[receipt.category] ?? CATEGORIES.other;
  const pay = PAYMENTS[receipt.payment] ?? PAYMENTS.cash;

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'w-full text-left glass rounded-2xl p-4',
        'hover:border-white/15 transition-all duration-200 relative overflow-hidden group',
      )}
    >
      {/* Category tint bar */}
      <motion.div
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-1 rounded-r-full"
        style={{ background: cat.color, opacity: 0.85 }}
        initial={{ width: 4 }}
        whileHover={{ width: 6 }}
      />
      <div className="flex items-start gap-3 pl-2">
        <div
          className="h-11 w-11 rounded-xl grid place-items-center text-lg shrink-0 shadow-inner-glow border border-white/5"
          style={{
            background: `linear-gradient(135deg, ${cat.color}2e 0%, ${cat.color}08 100%)`,
          }}
        >
          <span>{cat.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate text-ink-200">
                {receipt.store || '未命名'}
              </div>
              <div className="text-[11px] text-ink-400 truncate mt-0.5">
                {cat.name} · {pay.icon} {pay.name}
                {receipt.region ? ` · ${receipt.region}` : ''}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="num text-lg font-bold text-white leading-tight">
                {formatJPY(receipt.total)}
              </div>
              <div className="num text-[10px] text-ink-400 mt-0.5">
                {formatHKD(receipt.total, rate)}
              </div>
            </div>
          </div>
          {receipt.note && (
            <div className="mt-1.5 text-[11px] text-ink-400 line-clamp-1">
              {receipt.note}
            </div>
          )}
        </div>
      </div>
      {/* sheen on hover */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-sheen bg-[length:200%_100%] animate-shimmer pointer-events-none"
      />
    </motion.button>
  );
}
