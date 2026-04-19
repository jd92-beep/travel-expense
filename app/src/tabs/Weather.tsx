import { motion } from 'framer-motion';
import { Loader2, RefreshCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ITINERARY, currentDay, tripStatus } from '@/lib/itinerary';
import { Card, CardLabel } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { fetchWeather } from '@/lib/weather';
import type { WeatherDay } from '@/lib/types';

export function Weather() {
  const [data, setData] = useState<WeatherDay[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const start = ITINERARY[0].date;
      const end = ITINERARY[ITINERARY.length - 1].date;
      const result = await fetchWeather(start, end);
      setData(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const today = currentDay();
  const trip = tripStatus();
  const todayW = data?.find((w) => w.date === today?.date);
  const heroRegion =
    today?.region ?? (trip.phase === 'before' ? ITINERARY[0].region : '名古屋');
  const heroLabel =
    trip.phase === 'before' ? '出發當日' : trip.phase === 'after' ? '返港後' : '今日';
  const heroW = todayW || data?.[0];

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-start justify-between">
        <div>
          <CardLabel>JMA · Open-Meteo</CardLabel>
          <h1 className="font-display text-2xl mt-1">旅程天氣</h1>
          <p className="text-xs text-ink-400 mt-1 leading-relaxed">
            Japan Meteorological Agency 官方數據 · 即時拉取
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          aria-label="重新載入"
          className="h-9 w-9 rounded-xl glass grid place-items-center hover:border-white/15 disabled:opacity-40"
        >
          <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && !data && (
        <Card className="py-12 text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
            className="inline-block"
          >
            <Loader2 size={24} className="text-arsenal-400" />
          </motion.div>
          <div className="text-xs text-ink-400 mt-3">載入天氣中…</div>
        </Card>
      )}

      {error && (
        <Card className="bg-rose-500/5 border-rose-500/30 text-center py-8">
          <div className="text-sm text-rose-300">❌ 載入失敗</div>
          <div className="text-[11px] text-ink-400 mt-1">{error}</div>
          <Button variant="secondary" size="sm" className="mt-3" onClick={load}>
            重試
          </Button>
        </Card>
      )}

      {heroW && (
        <Card className="bg-gradient-to-br from-arsenal-900/20 to-ember-600/10 border-arsenal-500/20">
          <div className="flex items-center justify-between">
            <div>
              <CardLabel>
                {heroLabel} · {heroRegion}
              </CardLabel>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="num text-4xl font-extrabold text-white">
                  {heroW.tmax}°
                </span>
                <span className="text-sm text-ink-400">/ {heroW.tmin}°</span>
              </div>
              <div className="text-xs text-ink-400 mt-1">{heroW.label} · JMA Seamless</div>
            </div>
            <div className="text-6xl animate-float">{heroW.icon}</div>
          </div>
        </Card>
      )}

      <div className="grid gap-2.5">
        {ITINERARY.map((d, i) => {
          const w = data?.find((x) => x.date === d.date);
          return (
            <motion.div
              key={d.date}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card className="flex items-center gap-4 py-4">
                <div className="text-4xl shrink-0 h-14 w-14 grid place-items-center">
                  {w?.icon ?? '⏳'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ink-100">
                    Day {d.day} · {d.region}
                  </div>
                  <div className="text-[11px] text-ink-400 num">
                    {d.date} · {w?.label ?? '資料未到'}
                  </div>
                </div>
                <div className="text-right">
                  {w ? (
                    <>
                      <div className="num text-xl font-bold text-white">
                        {w.tmax}°
                        <span className="text-sm text-ink-400"> / {w.tmin}°</span>
                      </div>
                      <div className="text-[10px] text-ink-400 num">max / min</div>
                    </>
                  ) : (
                    <div className="text-[11px] text-ink-500">—</div>
                  )}
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
