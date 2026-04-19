import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, MapPin, Sparkles, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { BudgetRing } from '@/components/BudgetRing';
import { Card, CardLabel } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { NumberRoll } from '@/components/NumberRoll';
import { ReceiptCard } from '@/components/ReceiptCard';
import { ITINERARY, todayHK, currentDay, dayNumberFor } from '@/lib/itinerary';
import type { AppState } from '@/lib/types';

interface DashboardProps {
  state: AppState;
  onOpenReceipt: (id: string) => void;
}

export function Dashboard({ state, onOpenReceipt }: DashboardProps) {
  const today = todayHK();
  const day = currentDay();
  const dayNum = dayNumberFor(today);

  const { todaySpend, totalSpend, dailyAvg, todayReceipts } = useMemo(() => {
    const rs = state.receipts;
    const todayRs = rs.filter((r) => r.date === today);
    const total = rs.reduce((s, r) => s + (r.total || 0), 0);
    const daysSeen = new Set(rs.map((r) => r.date));
    return {
      todaySpend: todayRs.reduce((s, r) => s + (r.total || 0), 0),
      totalSpend: total,
      dailyAvg: daysSeen.size > 0 ? total / daysSeen.size : 0,
      todayReceipts: todayRs,
    };
  }, [state.receipts, today]);

  return (
    <div className="space-y-5 pb-6">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center gap-2 mb-2">
          <CardLabel>今日</CardLabel>
          <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
          <span className="num text-[11px] text-ink-400">{today}</span>
        </div>
        <h1 className="font-display text-3xl leading-tight">
          {day ? (
            <span>
              <span className="text-ink-400 text-base">Day {dayNum} · </span>
              <span className="text-gradient-arsenal font-bold">{day.region}</span>
            </span>
          ) : (
            <span className="text-ink-300">準備出發 · 名古屋 2026</span>
          )}
        </h1>
        {day && (
          <p className="text-sm text-ink-400 mt-1 flex items-center gap-1.5">
            <Sparkles size={14} className="text-ember-400" />
            {day.highlight}
          </p>
        )}
      </motion.section>

      {/* Budget Ring */}
      <Card className="py-7 flex flex-col items-center">
        <BudgetRing used={totalSpend} total={state.budget} />
        <div className="grid grid-cols-3 gap-3 mt-6 w-full text-center">
          <div>
            <CardLabel>今日</CardLabel>
            <div className="num text-xl font-bold text-white mt-1">
              <NumberRoll value={todaySpend} prefix="¥" />
            </div>
          </div>
          <div className="border-x border-white/5">
            <CardLabel>總開支</CardLabel>
            <div className="num text-xl font-bold text-white mt-1">
              <NumberRoll value={totalSpend} prefix="¥" />
            </div>
          </div>
          <div>
            <CardLabel>日均</CardLabel>
            <div className="num text-xl font-bold text-white mt-1">
              <NumberRoll value={dailyAvg} prefix="¥" />
            </div>
          </div>
        </div>
      </Card>

      {/* Itinerary mini timeline */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays size={14} className="text-ember-400" />
          <CardLabel>6 日行程</CardLabel>
        </div>
        <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-5 px-5 snap-x snap-mandatory scroll-smooth">
          {ITINERARY.map((it, i) => {
            const isToday = it.date === today;
            const isPast = it.date < today;
            return (
              <motion.div
                key={it.date}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="snap-start shrink-0 w-[180px]"
              >
                <Card
                  glowing={isToday}
                  className={`py-4 px-4 h-full ${isPast ? 'opacity-45' : ''} ${
                    isToday ? 'border-arsenal-500/40' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="num text-[10px] text-ink-400">Day {it.day}</span>
                    {isToday && (
                      <Badge className="bg-arsenal-500/20 border-arsenal-500/40 text-arsenal-100 animate-glow-pulse">
                        TODAY
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 font-semibold text-sm text-ink-100 line-clamp-1">
                    {it.region}
                  </div>
                  <div className="text-[11px] text-ink-400 line-clamp-1 mt-0.5">
                    {it.highlight}
                  </div>
                  <div className="num text-[10px] text-ink-400 mt-2 flex items-center gap-1">
                    <MapPin size={10} /> {it.date.slice(5)}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Today's spending */}
      {todayReceipts.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-jade-400" />
            <CardLabel>今日記錄</CardLabel>
            <span className="text-ink-400 text-[11px] num">· {todayReceipts.length}</span>
          </div>
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {todayReceipts.map((r) => (
                <ReceiptCard
                  key={r.id}
                  receipt={r}
                  rate={state.rate}
                  onClick={() => onOpenReceipt(r.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      {todayReceipts.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-10 text-ink-400 text-sm"
        >
          <div className="inline-block px-5 py-3 rounded-2xl glass">
            <span className="opacity-80">仲未有消費記錄 · 去 </span>
            <span className="text-gradient-arsenal font-semibold">掃描</span>
            <span className="opacity-80"> 開始 ✨</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
