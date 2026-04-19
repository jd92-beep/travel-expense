import { motion } from 'framer-motion';
import { Loader2, RefreshCcw, MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ITINERARY, currentDay, tripStatus } from '@/lib/itinerary';
import { Card, CardLabel } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { fetchTripWeather } from '@/lib/weather';
import type { WeatherDay } from '@/lib/types';

export function Weather() {
  const [data, setData] = useState<WeatherDay[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try { setData(await fetchTripWeather()); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const today = currentDay();
  const trip = tripStatus();
  const todayW = data?.find((w) => w.date === today?.date);
  const heroW = todayW || data?.[0];
  const heroLabel = trip.phase === 'before' ? '出發當日' : trip.phase === 'after' ? '返港後' : '今日';

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-start justify-between">
        <div>
          <CardLabel>JMA · Open-Meteo</CardLabel>
          <h1 className="font-display text-2xl mt-1 text-paper-900 font-bold">旅程天氣</h1>
          <p className="text-xs text-paper-600 mt-1 leading-relaxed">
            每日 5 個時段 (9 / 12 / 15 / 18 / 21h) · 跟住行程嘅位置
          </p>
        </div>
        <button onClick={load} disabled={loading} aria-label="重新載入"
          className="h-9 w-9 rounded-xl glass grid place-items-center hover:border-arsenal-300 disabled:opacity-40">
          <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && !data && (
        <Card className="py-12 text-center">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }} className="inline-block">
            <Loader2 size={24} className="text-arsenal-500" />
          </motion.div>
          <div className="text-xs text-paper-600 mt-3">載入天氣中…</div>
        </Card>
      )}

      {error && (
        <Card className="bg-rose-50 border-rose-300 text-center py-8">
          <div className="text-sm text-rose-600">❌ 載入失敗</div>
          <div className="text-[11px] text-paper-600 mt-1">{error}</div>
          <Button variant="secondary" size="sm" className="mt-3" onClick={load}>重試</Button>
        </Card>
      )}

      {heroW && (
        <Card className="bg-gradient-to-br from-arsenal-50 to-ember-200/60 border-arsenal-300">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <CardLabel>{heroLabel} · {heroW.locationName}</CardLabel>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="num text-4xl font-extrabold text-paper-900">{heroW.tmax}°</span>
                <span className="text-sm text-paper-600">/ {heroW.tmin}°</span>
              </div>
              <div className="text-xs text-paper-700 mt-1">{heroW.label} · JMA Seamless</div>
            </div>
            <div className="text-6xl animate-float">{heroW.icon}</div>
          </div>
          {heroW.slots.length > 0 && (
            <div className="mt-4 pt-3 border-t border-paper-300 grid grid-cols-5 gap-1">
              {heroW.slots.map((s) => (
                <div key={s.hour} className="text-center">
                  <div className="num text-[10px] text-paper-600">{String(s.hour).padStart(2, '0')}</div>
                  <div className="text-xl mt-0.5">{s.icon}</div>
                  <div className="num text-xs font-semibold text-paper-900 mt-0.5">{s.temp}°</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-2.5">
        {ITINERARY.map((d, i) => {
          const w = data?.find((x) => x.date === d.date);
          return (
            <motion.div key={d.date} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className="space-y-3 py-4">
                <div className="flex items-center gap-3">
                  <div className="text-3xl shrink-0 h-12 w-12 grid place-items-center">{w?.icon ?? '⏳'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-paper-900 flex items-center gap-1.5">
                      Day {d.day}
                      <MapPin size={10} className="text-ember-500" />
                      <span>{w?.locationName ?? d.region}</span>
                    </div>
                    <div className="text-[11px] text-paper-600 num">{d.date} · {w?.label ?? '資料未到'}</div>
                  </div>
                  <div className="text-right">
                    {w ? (
                      <>
                        <div className="num text-lg font-bold text-paper-900">
                          {w.tmax}°<span className="text-xs text-paper-600"> / {w.tmin}°</span>
                        </div>
                        <div className="text-[10px] text-paper-500 num">max / min</div>
                      </>
                    ) : <div className="text-[11px] text-paper-500">—</div>}
                  </div>
                </div>
                {w && w.slots.length > 0 && (
                  <div className="grid grid-cols-5 gap-1 pt-2 border-t border-paper-200">
                    {w.slots.map((s) => (
                      <motion.div key={s.hour}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.15 + s.hour * 0.01 }}
                        className="text-center py-1">
                        <div className="num text-[10px] text-paper-600">{String(s.hour).padStart(2, '0')}</div>
                        <div className="text-lg">{s.icon}</div>
                        <div className="num text-[11px] font-semibold text-paper-900">{s.temp}°</div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
