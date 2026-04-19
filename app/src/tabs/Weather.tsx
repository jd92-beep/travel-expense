import { motion } from 'framer-motion';
import { Cloud, Sun, CloudRain, CloudSnow, CloudDrizzle } from 'lucide-react';
import { ITINERARY } from '@/lib/itinerary';
import { Card, CardLabel } from '@/components/ui/Card';

// Placeholder forecast until Open-Meteo/JMA API is wired in
const FAKE_FORECAST = [
  { icon: Sun,         high: 22, low: 13, label: '晴',    color: '#fbbf24' },
  { icon: Cloud,       high: 17, low: 9,  label: '多雲',   color: '#94a3b8' },
  { icon: CloudSnow,   high: 8,  low: -2, label: '雪',    color: '#93c5fd' },
  { icon: CloudDrizzle, high: 14, low: 6, label: '小雨',   color: '#60a5fa' },
  { icon: Sun,         high: 23, low: 14, label: '晴',    color: '#fbbf24' },
  { icon: Cloud,       high: 20, low: 12, label: '多雲',   color: '#94a3b8' },
];

export function Weather() {
  return (
    <div className="space-y-5 pb-6">
      <div>
        <CardLabel>JMA 天氣</CardLabel>
        <h1 className="font-display text-2xl mt-1">旅程天氣</h1>
        <p className="text-xs text-ink-400 mt-1 leading-relaxed">
          5-slot daily forecast · 真實 Open-Meteo (JMA) 資料移植中
        </p>
      </div>

      <Card className="bg-gradient-to-br from-arsenal-900/20 to-ember-600/10 border-arsenal-500/20">
        <div className="flex items-center justify-between">
          <div>
            <CardLabel>今日 · 名古屋</CardLabel>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="num text-4xl font-extrabold text-white">22°</span>
              <span className="text-sm text-ink-400">/ 13°</span>
            </div>
            <div className="text-xs text-ink-400 mt-1">晴 · 東北風 · 濕度 58%</div>
          </div>
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
            className="h-20 w-20 rounded-full grid place-items-center bg-gradient-arsenal shadow-glow"
          >
            <Sun size={40} className="text-white" strokeWidth={2.2} />
          </motion.div>
        </div>
      </Card>

      <div className="grid gap-2.5">
        {ITINERARY.map((d, i) => {
          const w = FAKE_FORECAST[i];
          const Icon = w.icon;
          return (
            <motion.div
              key={d.date}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card className="flex items-center gap-4 py-4">
                <div
                  className="h-14 w-14 rounded-2xl grid place-items-center shrink-0 border border-white/5"
                  style={{
                    background: `linear-gradient(135deg, ${w.color}36 0%, ${w.color}0a 100%)`,
                  }}
                >
                  <Icon size={26} style={{ color: w.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ink-100">
                    Day {d.day} · {d.region}
                  </div>
                  <div className="text-[11px] text-ink-400 num">{d.date}</div>
                </div>
                <div className="text-right">
                  <div className="num text-xl font-bold text-white">
                    {w.high}°<span className="text-sm text-ink-400"> / {w.low}°</span>
                  </div>
                  <div className="text-[11px] text-ink-400">{w.label}</div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
