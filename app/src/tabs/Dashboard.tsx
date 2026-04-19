import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, MapPin, Sparkles, TrendingUp, ScanLine } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BudgetRing } from '@/components/BudgetRing';
import { Card, CardLabel } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { NumberRoll } from '@/components/NumberRoll';
import { ReceiptCard } from '@/components/ReceiptCard';
import { Sparkline } from '@/components/Sparkline';
import { CountdownCard } from '@/components/CountdownCard';
import { EmptyState } from '@/components/EmptyState';
import {
  ITINERARY,
  todayHK,
  currentDay,
  dayNumberFor,
  timeGreeting,
  tripStatus,
} from '@/lib/itinerary';
import type { AppState } from '@/lib/types';

interface DashboardProps {
  state: AppState;
  onOpenReceipt: (id: string) => void;
  onGoScan: () => void;
}

export function Dashboard({ state, onOpenReceipt, onGoScan }: DashboardProps) {
  const today = todayHK();
  const day = currentDay();
  const dayNum = dayNumberFor(today);
  const [greeting, setGreeting] = useState(() => timeGreeting());
  const trip = useMemo(() => tripStatus(), []);

  // Refresh greeting + tick every 5 minutes so the tone text matches reality.
  useEffect(() => {
    const id = setInterval(() => setGreeting(timeGreeting()), 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  const { todaySpend, totalSpend, dailyAvg, todayReceipts, dailyTrend } = useMemo(() => {
    const rs = state.receipts;
    const todayRs = rs.filter((r) => r.date === today);
    const total = rs.reduce((s, r) => s + (r.total || 0), 0);
    const perDay = new Map<string, number>();
    for (const r of rs) perDay.set(r.date, (perDay.get(r.date) || 0) + (r.total || 0));
    const trend = ITINERARY.map((d) => perDay.get(d.date) || 0);
    return {
      todaySpend: todayRs.reduce((s, r) => s + (r.total || 0), 0),
      totalSpend: total,
      dailyAvg: perDay.size > 0 ? total / perDay.size : 0,
      todayReceipts: todayRs,
      dailyTrend: trend,
    };
  }, [state.receipts, today]);

  // Day markers on ring. Evenly spaced, active = today, past = before today.
  const dayMarkers = useMemo(
    () =>
      ITINERARY.map((d, i) => ({
        progress: i / ITINERARY.length,
        active: d.date === today,
        past: d.date < today,
      })),
    [today],
  );

  const trendPositive = dailyTrend.some((v) => v > 0);

  return (
    <div className="space-y-5 pb-6">
      {/* Greeting */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center gap-2 mb-2">
          <CardLabel>{greeting.tone}</CardLabel>
          <span className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
          <span className="num text-[11px] text-paper-600">{today}</span>
        </div>
        <h1 className="font-display text-3xl leading-tight">
          <span className="mr-2">{greeting.emoji}</span>
          <span className="text-gradient-arsenal font-bold">{greeting.text}</span>
        </h1>
        {trip.phase === 'during' && day && (
          <p className="text-sm text-paper-600 mt-1.5 flex items-center gap-1.5">
            <Sparkles size={14} className="text-ember-400" />
            <span>
              Day {dayNum} · <span className="text-paper-900">{day.region}</span> · {day.highlight}
            </span>
          </p>
        )}
        {trip.phase === 'after' && (
          <p className="text-sm text-paper-600 mt-1.5 flex items-center gap-1.5">
            <Sparkles size={14} className="text-sakura-300" />
            旅程結束 · 已返程 {trip.daysSince} 日
          </p>
        )}
      </motion.section>

      {/* Pre-trip countdown hero */}
      {trip.phase === 'before' && <CountdownCard daysUntil={trip.daysUntil} />}

      {/* Budget Ring */}
      <Card className="py-8 flex flex-col items-center">
        <BudgetRing used={totalSpend} total={state.budget} dayMarkers={dayMarkers} />
        <div className="grid grid-cols-3 gap-3 mt-6 w-full text-center">
          <Metric label="今日" value={todaySpend} />
          <Metric label="總開支" value={totalSpend} bordered />
          <Metric label="日均" value={dailyAvg} />
        </div>
        {trendPositive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-5 w-full flex items-center justify-between px-2"
          >
            <div>
              <CardLabel>6 日走勢</CardLabel>
              <div className="text-[11px] text-paper-500 mt-0.5 num">JPY · 每日</div>
            </div>
            <Sparkline data={dailyTrend} color="#f97316" />
          </motion.div>
        )}
      </Card>

      {/* Itinerary carousel */}
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
                  className={`py-4 px-4 h-full ${isPast ? 'opacity-50' : ''} ${
                    isToday ? 'border-arsenal-500/40' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="num text-[10px] text-paper-600">Day {it.day}</span>
                    {isToday && (
                      <Badge className="bg-arsenal-500/20 border-arsenal-500/40 text-arsenal-100 animate-glow-pulse">
                        TODAY
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 font-semibold text-sm text-paper-900 line-clamp-1">
                    {it.region}
                  </div>
                  <div className="text-[11px] text-paper-600 line-clamp-1 mt-0.5">
                    {it.highlight}
                  </div>
                  <div className="num text-[10px] text-paper-600 mt-2 flex items-center gap-1">
                    <MapPin size={10} /> {it.date.slice(5)}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Today's spending */}
      {todayReceipts.length > 0 ? (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-jade-400" />
            <CardLabel>今日記錄</CardLabel>
            <span className="text-paper-600 text-[11px] num">· {todayReceipts.length}</span>
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
      ) : (
        <EmptyState
          title={totalSpend === 0 ? '仲未有任何記錄' : '今日仲未消費'}
          subtitle={
            totalSpend === 0
              ? '由第一張收據開始吧 ✨'
              : '影咗收據之後會自動出現喺度'
          }
          action={
            <Button onClick={onGoScan} size="sm">
              <ScanLine size={14} /> 開始掃描
            </Button>
          }
        />
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  bordered,
}: {
  label: string;
  value: number;
  bordered?: boolean;
}) {
  return (
    <div className={bordered ? 'border-x border-paper-300/80' : ''}>
      <CardLabel>{label}</CardLabel>
      <div className="num text-xl font-bold text-white mt-1">
        <NumberRoll value={value} prefix="¥" />
      </div>
    </div>
  );
}
