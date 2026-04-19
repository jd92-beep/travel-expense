import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ITINERARY, todayHK, dayProgressHKT } from '@/lib/itinerary';
import { Card, CardLabel } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { ItineraryDay } from '@/lib/types';

const SPOT_ICONS: Record<string, string> = {
  transport: '🚆',
  food: '🍜',
  lodging: '🏨',
  sightseeing: '⛩',
  shopping: '🛍️',
  ticket: '🎟️',
  medicine: '💊',
  other: '📍',
};

function timeToFraction(t?: string): number | null {
  if (!t) return null;
  const [hh, mm] = t.split(':').map(Number);
  if (Number.isNaN(hh)) return null;
  return (hh * 60 + (mm || 0)) / 1440;
}

export function Itinerary() {
  const today = todayHK();
  return (
    <div className="space-y-5 pb-6">
      <div>
        <CardLabel>旅程 · Nagoya 2026</CardLabel>
        <h1 className="font-display text-2xl mt-1 text-gradient-arsenal font-bold">
          名古屋 · 中部阿爾卑斯山
        </h1>
        <p className="text-xs text-ink-400 mt-1 num">
          2026-04-20 → 2026-04-25 · 6 日 5 夜
        </p>
      </div>
      <div className="space-y-4">
        {ITINERARY.map((day, i) => (
          <DayCard key={day.date} day={day} i={i} today={today} />
        ))}
      </div>
    </div>
  );
}

function DayCard({
  day,
  i,
  today,
}: {
  day: ItineraryDay;
  i: number;
  today: string;
}) {
  const isToday = day.date === today;
  const isPast = day.date < today;

  // Live "now" indicator only on today's day
  const [nowFrac, setNowFrac] = useState<number | null>(() =>
    isToday ? dayProgressHKT() : null,
  );
  useEffect(() => {
    if (!isToday) return;
    setNowFrac(dayProgressHKT());
    const id = setInterval(() => setNowFrac(dayProgressHKT()), 60_000);
    return () => clearInterval(id);
  }, [isToday]);

  // Determine which spot is "current" (last spot with time <= now)
  let currentSpotIdx = -1;
  if (isToday && nowFrac !== null) {
    for (let j = 0; j < day.spots.length; j++) {
      const f = timeToFraction(day.spots[j].time);
      if (f !== null && f <= nowFrac) currentSpotIdx = j;
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.04 }}
      className={isPast ? 'opacity-55' : ''}
    >
      <Card glowing={isToday} className={isToday ? 'border-arsenal-500/30' : ''}>
        <div className="flex items-center gap-3 mb-4">
          <div className="grid place-items-center h-9 w-9 rounded-xl bg-gradient-arsenal text-white font-bold num text-sm shadow-glow-sm">
            {day.day}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-ink-100">{day.region}</span>
              {isToday && (
                <Badge className="bg-arsenal-500/20 border-arsenal-500/40 text-arsenal-100 animate-glow-pulse">
                  TODAY
                </Badge>
              )}
              {isPast && <Badge className="bg-white/5 text-ink-400">已過</Badge>}
            </div>
            <div className="text-[11px] text-ink-400 num mt-0.5">{day.date}</div>
          </div>
          <MapPin size={14} className="text-ember-400" />
        </div>
        <div className="text-xs text-ember-300 mb-3 flex items-center gap-1.5 pl-1">
          ✨ {day.highlight}
        </div>
        <ul className="relative space-y-2">
          {/* Vertical timeline rail */}
          <div
            aria-hidden
            className="absolute left-[72px] top-2 bottom-2 w-px bg-gradient-to-b from-arsenal-500/30 via-ember-400/20 to-transparent"
          />
          {day.spots.map((s, j) => {
            const isCurrent = isToday && j === currentSpotIdx;
            return (
              <motion.li
                key={j}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 + j * 0.03 }}
                className="flex items-start gap-3 relative"
              >
                <div
                  className={`shrink-0 num text-[11px] w-12 pt-1.5 text-right ${
                    isCurrent ? 'text-ember-400 font-bold' : 'text-ink-400'
                  }`}
                >
                  {s.time || '—'}
                </div>
                <div
                  className={`grid place-items-center h-8 w-8 rounded-lg text-sm shrink-0 relative z-10 transition-all ${
                    isCurrent
                      ? 'bg-gradient-arsenal border border-arsenal-300/60 shadow-glow-sm scale-110'
                      : 'bg-white/5 border border-white/10'
                  }`}
                >
                  {SPOT_ICONS[s.type] || '📍'}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div
                    className={`text-sm leading-snug ${
                      isCurrent ? 'text-white font-semibold' : 'text-ink-100'
                    }`}
                  >
                    {s.name}
                  </div>
                  {s.note && (
                    <div className="text-[11px] text-ink-400 mt-0.5 line-clamp-2">
                      {s.note}
                    </div>
                  )}
                </div>
                {isCurrent && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute right-0 top-1.5"
                  >
                    <Badge className="bg-ember-400/15 border-ember-400/40 text-ember-300 animate-glow-pulse">
                      現在
                    </Badge>
                  </motion.div>
                )}
              </motion.li>
            );
          })}
        </ul>
      </Card>
    </motion.div>
  );
}
