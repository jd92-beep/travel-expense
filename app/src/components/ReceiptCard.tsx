import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { ChevronDown, MapPin, Clock, Hash } from 'lucide-react';
import { CATEGORIES, PAYMENTS } from '@/lib/constants';
import { cn, formatJPY, formatHKD } from '@/lib/utils';
import type { Receipt } from '@/lib/types';

interface ReceiptCardProps {
  receipt: Receipt;
  rate: number;
  onClick?: () => void;
  expandable?: boolean;
}

export function ReceiptCard({
  receipt,
  rate,
  onClick,
  expandable = true,
}: ReceiptCardProps) {
  const cat = CATEGORIES[receipt.category] ?? CATEGORIES.other;
  const pay = PAYMENTS[receipt.payment] ?? PAYMENTS.cash;
  const [open, setOpen] = useState(false);

  const hasDetails =
    !!receipt.itemsText || !!receipt.address || !!receipt.time || !!receipt.bookingRef;

  const handleClick = () => {
    if (expandable && hasDetails) {
      setOpen((v) => !v);
      return;
    }
    onClick?.();
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
      className={cn(
        'w-full text-left glass rounded-2xl relative overflow-hidden group',
        'transition-colors duration-200 hover:border-arsenal-300',
      )}
    >
      <motion.button
        layout
        onClick={handleClick}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.99 }}
        className="block w-full text-left p-4 relative"
      >
        <motion.div
          aria-hidden
          className="absolute left-0 top-0 bottom-0 w-1 rounded-r-full"
          style={{ background: cat.color, opacity: 0.85 }}
          initial={{ width: 4 }}
          whileHover={{ width: 6 }}
        />
        <div className="flex items-start gap-3 pl-2">
          <div
            className="h-11 w-11 rounded-xl grid place-items-center text-lg shrink-0 shadow-inner-glow border border-paper-300/80"
            style={{
              background: `linear-gradient(135deg, ${cat.color}2e 0%, ${cat.color}08 100%)`,
            }}
          >
            <span>{cat.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate text-paper-900">
                  {receipt.store || '未命名'}
                </div>
                <div className="text-[11px] text-paper-600 truncate mt-0.5">
                  {cat.name} · {pay.icon} {pay.name}
                  {receipt.region ? ` · ${receipt.region}` : ''}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="num text-lg font-bold text-white leading-tight">
                  {formatJPY(receipt.total)}
                </div>
                <div className="num text-[10px] text-paper-600 mt-0.5">
                  {formatHKD(receipt.total, rate)}
                </div>
              </div>
            </div>
            {receipt.note && !open && (
              <div className="mt-1.5 text-[11px] text-paper-600 line-clamp-1">
                {receipt.note}
              </div>
            )}
          </div>
          {expandable && hasDetails && (
            <motion.div
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.25 }}
              className="text-paper-500 self-center"
            >
              <ChevronDown size={16} />
            </motion.div>
          )}
        </div>
        {/* shimmer */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-sheen bg-[length:200%_100%] animate-shimmer pointer-events-none"
        />
      </motion.button>

      {/* Expanded details */}
      <AnimatePresence initial={false}>
        {expandable && open && hasDetails && (
          <motion.div
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 pt-1 border-t border-paper-300/80 text-xs text-paper-800 space-y-2">
              {receipt.time && (
                <DetailRow icon={<Clock size={12} />} label="時間" value={receipt.time} />
              )}
              {receipt.address && (
                <DetailRow icon={<MapPin size={12} />} label="地址" value={receipt.address} />
              )}
              {receipt.bookingRef && (
                <DetailRow
                  icon={<Hash size={12} />}
                  label="訂單"
                  value={receipt.bookingRef}
                  mono
                />
              )}
              {receipt.itemsText && (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-paper-500 mb-1">品項</div>
                  <pre className="num text-[11px] text-paper-800 whitespace-pre-wrap leading-relaxed max-h-40 overflow-auto">
                    {receipt.itemsText}
                  </pre>
                </div>
              )}
              {receipt.note && (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.18em] text-paper-500 mb-1">備註</div>
                  <div className="text-[11px] text-paper-800 leading-relaxed">{receipt.note}</div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-paper-500">{icon}</span>
      <span className="text-paper-500 w-10 shrink-0">{label}</span>
      <span className={cn('flex-1 text-paper-900 break-words', mono && 'num')}>{value}</span>
    </div>
  );
}
