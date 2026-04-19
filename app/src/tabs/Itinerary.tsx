import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { ITINERARY, todayHK, dayProgressHKT } from '@/lib/itinerary';
import { CardLabel } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { ItineraryDay } from '@/lib/types';

const SPOT_ICONS: Record<string, string> = {
  transport:'🚆', food:'🍜', lodging:'🏨', sightseeing:'⛩',
  shopping:'🛍️', ticket:'🎟️', localtour:'🗺️', medicine:'💊', other:'📍',
};

function timeToFrac(t?: string): number | null {
  if (!t) return null;
  const [hh, mm] = t.split(':').map(Number);
  if (Number.isNaN(hh)) return null;
  return (hh * 60 + (mm || 0)) / 1440;
}

export function Itinerary() {
  const today = todayHK();
  return (
    <div className="space-y-6 pb-6">
      <div>
        <CardLabel>旅程 · Nagoya 2026</CardLabel>
        <h1 className="font-display text-2xl mt-1 text-gradient-arsenal font-bold">
          名古屋 · 中部阿爾卑斯山
        </h1>
        <p className="text-xs text-paper-600 mt-1 num">2026-04-20 → 2026-04-25 · 6 日 5 夜</p>
      </div>

      <div className="relative">
        <div aria-hidden className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-1 rounded-full"
          style={{ background:'linear-gradient(180deg, #CC2929 0%, #F5A623 45%, #FF91A4 100%)',
                   boxShadow:'0 0 20px rgba(204,41,41,0.25)' }} />
        <motion.div aria-hidden className="absolute left-1/2 -translate-x-1/2 top-0 w-1.5 rounded-full"
          style={{ background:'linear-gradient(180deg, rgba(255,255,255,0.85), transparent)' }}
          initial={{ height: 0 }} animate={{ height: '100%' }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }} />

        <div className="space-y-10">
          {ITINERARY.map((day, i) => (
            <DayRow key={day.date} day={day} idx={i} today={today} side={i % 2 === 0 ? 'left' : 'right'} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayRow({
  day, idx, today, side,
}: {
  day: ItineraryDay; idx: number; today: string; side: 'left' | 'right';
}) {
  const isToday = day.date === today;
  const isPast  = day.date < today;

  const [nowFrac, setNowFrac] = useState<number | null>(() => (isToday ? dayProgressHKT() : null));
  useEffect(() => {
    if (!isToday) return;
    setNowFrac(dayProgressHKT());
    const id = setInterval(() => setNowFrac(dayProgressHKT()), 60_000);
    return () => clearInterval(id);
  }, [isToday]);

  let currentSpotIdx = -1;
  if (isToday && nowFrac !== null) {
    for (let j = 0; j < day.spots.length; j++) {
      const f = timeToFrac(day.spots[j].time);
      if (f !== null && f <= nowFrac) currentSpotIdx = j;
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ delay: idx * 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`relative grid grid-cols-[1fr_56px_1fr] gap-2 items-start ${isPast ? 'opacity-60' : ''}`}
    >
      <div className="col-start-2 col-end-3 flex flex-col items-center relative z-10">
        <motion.div whileHover={{ scale: 1.1 }}
          className={`grid place-items-center h-14 w-14 rounded-full font-bold num text-lg shadow-glow border-4 ${
            isToday ? 'bg-gradient-arsenal text-white border-white animate-glow-pulse'
            : isPast ? 'bg-paper-300 text-paper-600 border-paper-100'
            : 'bg-white text-arsenal-600 border-arsenal-200'
          }`}>
          {day.day}
        </motion.div>
        <div className="mt-2 text-center">
          <div className="text-[10px] font-semibold text-paper-900 num">{day.date.slice(5)}</div>
          {isToday && <Badge className="mt-1 bg-arsenal-500/20 border-arsenal-500/50 text-arsenal-700">TODAY</Badge>}
        </div>
      </div>

      <div className={`row-start-1 ${side === 'left' ? 'col-start-1 col-end-2 text-right' : 'col-start-3 col-end-4 text-left'}`}>
        <motion.div whileHover={{ y: -2 }}
          className={`glass rounded-2xl p-4 relative overflow-hidden ${isToday ? 'border-arsenal-500/40 shadow-glow-sm' : ''}`}>
          <div className={`text-xs font-semibold mb-0.5 ${side === 'left' ? 'text-right' : 'text-left'} text-paper-900`}>
            {day.region}
          </div>
          <div className={`text-[11px] text-paper-600 ${side === 'left' ? 'text-right' : 'text-left'} mb-3`}>
            ✨ {day.highlight}
          </div>
          <ul className={`space-y-1.5 flex flex-col ${side === 'left' ? 'items-end' : 'items-start'}`}>
            {day.spots.map((s, j) => {
              const isCurrent = isToday && j === currentSpotIdx;
              return (
                <motion.li key={j}
                  initial={{ opacity: 0, x: side === 'left' ? 8 : -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.05 + j * 0.04 }}
                  className={`flex items-start gap-2 w-full ${side === 'left' ? 'flex-row-reverse text-right' : 'text-left'}`}>
                  <div className={`shrink-0 grid place-items-center h-6 w-6 rounded-md text-sm transition-all ${
                    isCurrent ? 'bg-gradient-arsenal text-white shadow-glow-sm scale-110'
                              : 'bg-paper-200 border border-paper-300'
                  }`}>{SPOT_ICONS[s.type] || '📍'}</div>
                  <div className="min-w-0 flex-1">
                    <div className={`text-[12px] leading-snug ${isCurrent ? 'font-semibold text-arsenal-600' : 'text-paper-900'}`}>
                      {s.name}
                    </div>
                    <div className="text-[10px] text-paper-500 num">
                      {s.time || '—'}{isCurrent && ' · 現在'}
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </motion.div>
      </div>
    </motion.div>
  );
}
