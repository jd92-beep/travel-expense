import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Search, Filter } from 'lucide-react';
import { ReceiptCard } from '@/components/ReceiptCard';
import { EmptyState } from '@/components/EmptyState';
import { CATEGORIES } from '@/lib/constants';
import { byDateDesc, formatJPY } from '@/lib/utils';
import type { AppState, Category, Receipt } from '@/lib/types';

export function History({
  state,
  onOpenReceipt,
}: {
  state: AppState;
  onOpenReceipt: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<Category | 'all'>('all');

  const filtered = useMemo<Receipt[]>(() => {
    return [...state.receipts]
      .filter((r) => cat === 'all' || r.category === cat)
      .filter((r) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
          (r.store || '').toLowerCase().includes(q) ||
          (r.note || '').toLowerCase().includes(q) ||
          (r.region || '').toLowerCase().includes(q) ||
          (r.itemsText || '').toLowerCase().includes(q)
        );
      })
      .sort(byDateDesc);
  }, [state.receipts, query, cat]);

  const grouped = useMemo(() => {
    const m = new Map<string, Receipt[]>();
    for (const r of filtered) {
      const list = m.get(r.date) ?? [];
      list.push(r);
      m.set(r.date, list);
    }
    return [...m.entries()];
  }, [filtered]);

  const totalFiltered = filtered.reduce((s, r) => s + (r.total || 0), 0);

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-ink-400">記錄</div>
          <div className="num text-3xl font-bold leading-tight mt-0.5">
            {filtered.length}
            <span className="text-xs text-ink-400 font-normal ml-2">
              筆 · {formatJPY(totalFiltered)}
            </span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
          size={16}
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋店名 / 備註 / 品項…"
          className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-ink-900/70 border border-white/5 text-sm placeholder:text-ink-500 focus:outline-none focus:border-arsenal-500/40 focus:shadow-glow-sm transition-all"
        />
      </div>

      {/* Filter pills */}
      <div className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-1">
        <FilterPill active={cat === 'all'} onClick={() => setCat('all')} label="全部" />
        {(Object.keys(CATEGORIES) as Category[]).map((id) => (
          <FilterPill
            key={id}
            active={cat === id}
            onClick={() => setCat(id)}
            label={CATEGORIES[id].name}
            icon={CATEGORIES[id].icon}
            color={CATEGORIES[id].color}
          />
        ))}
      </div>

      {/* Grouped list */}
      <div className="space-y-5">
        <AnimatePresence initial={false}>
          {grouped.map(([date, list], gi) => {
            const total = list.reduce((s, r) => s + (r.total || 0), 0);
            return (
              <motion.section
                key={date}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: gi * 0.02 }}
              >
                <div className="sticky top-0 z-10 mb-2 flex items-center justify-between bg-ink-950/85 backdrop-blur-md py-2 -mx-5 px-5">
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-6 rounded-full bg-gradient-arsenal" />
                    <span className="num text-sm font-semibold text-ink-100">{date}</span>
                    <span className="text-[11px] text-ink-400">· {list.length} 筆</span>
                  </div>
                  <span className="num text-sm font-semibold text-ember-400">
                    {formatJPY(total)}
                  </span>
                </div>
                <div className="space-y-2">
                  {list.map((r) => (
                    <ReceiptCard
                      key={r.id}
                      receipt={r}
                      rate={state.rate}
                      onClick={() => onOpenReceipt(r.id)}
                    />
                  ))}
                </div>
              </motion.section>
            );
          })}
        </AnimatePresence>
        {filtered.length === 0 && (
          <EmptyState
            title={query || cat !== 'all' ? '冇符合嘅記錄' : '仲未有任何記錄'}
            subtitle={
              query || cat !== 'all'
                ? '試下清除篩選，或者搜尋其他關鍵字'
                : '掃描第一張收據就會出現喺度 ✨'
            }
            glyph={
              <div className="h-16 w-16 rounded-2xl bg-gradient-arsenal/20 border border-arsenal-500/30 grid place-items-center shadow-glow-sm">
                <Filter size={28} className="text-arsenal-400" />
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  icon,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: string;
  color?: string;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
        active
          ? 'bg-gradient-arsenal text-white shadow-glow-sm'
          : 'bg-ink-900/60 text-ink-300 border border-white/5 hover:border-white/15'
      }`}
      style={active && color ? { boxShadow: `0 0 20px -4px ${color}77` } : undefined}
    >
      {icon && <span>{icon}</span>}
      {label}
    </motion.button>
  );
}
