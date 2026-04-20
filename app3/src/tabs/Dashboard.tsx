import { useState, useEffect, useRef } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import type { AppState, Receipt } from '@/lib/types';
import { ITINERARY, CATEGORY_MAP } from '@/lib/constants';
import { todayHKT } from '@/lib/itinerary';
import { fetchWeather, type WeatherData } from '@/lib/weather';

interface DashboardProps {
  state: AppState;
}

function AnimatedNumber({ value }: { value: number }) {
  const spring = useSpring(0, { stiffness: 80, damping: 18 });
  const display = useTransform(spring, (v: number) => Math.round(v).toLocaleString());
  const prevRef = useRef(0);

  useEffect(() => {
    if (prevRef.current !== value) {
      spring.set(value);
      prevRef.current = value;
    }
  }, [value, spring]);

  return <motion.span>{display}</motion.span>;
}

export function Dashboard({ state }: DashboardProps) {
  const today = todayHKT();
  const todayDay = ITINERARY.find(d => d.date === today);
  const [weather, setWeather] = useState<WeatherData | null>(null);

  const todayReceipts = state.receipts.filter(r => r.date === today);
  const todayTotal = todayReceipts.reduce((s, r) => s + r.total, 0);
  const totalSpend = state.receipts.filter(r => r.date >= '2026-04-20' && r.date <= '2026-04-25')
    .reduce((s, r) => s + r.total, 0);
  const tripDays = state.receipts.filter(r => r.date >= '2026-04-20' && r.date <= '2026-04-25');
  const uniqueDays = new Set(tripDays.map(r => r.date)).size;
  const dailyAvg = uniqueDays > 0 ? Math.round(totalSpend / uniqueDays) : 0;
  const dailyBudget = Math.round(state.budget / 6);
  const budgetPct = Math.min((totalSpend / state.budget) * 100, 100);
  const remaining = state.budget - totalSpend;
  const overDaily = todayTotal > dailyBudget;

  useEffect(() => {
    if (todayDay) {
      fetchWeather(today).then(setWeather);
    }
  }, [today, todayDay]);

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 600, margin: '0 auto' }}>
      {/* Hero card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        style={{
          background: 'linear-gradient(135deg,#C0281E 0%,#E04040 45%,#FF7A94 100%)',
          borderRadius: 24,
          padding: '24px 20px',
          marginBottom: 16,
          color: 'white',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(204,41,41,0.35)',
        }}
      >
        <div style={{ position: 'absolute', top: -20, right: -20, fontSize: 100, opacity: 0.08 }}>🗾</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4 }}>今日花費</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 14, opacity: 0.9 }}>¥</span>
              <span className="num" style={{ fontSize: 44, fontWeight: 800, lineHeight: 1 }}>
                <AnimatedNumber value={todayTotal} />
              </span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
              ≈ HKD {(todayTotal / state.rate).toFixed(0)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            {todayDay ? (
              <div style={{
                background: 'rgba(255,255,255,0.2)',
                borderRadius: 20,
                padding: '4px 12px',
                fontSize: 12,
                backdropFilter: 'blur(8px)',
              }}>
                📍 {todayDay.region}
              </div>
            ) : (
              <div style={{
                background: 'rgba(255,255,255,0.2)',
                borderRadius: 20,
                padding: '4px 12px',
                fontSize: 12,
              }}>
                🏠 非旅程日
              </div>
            )}
            {weather && (
              <div style={{ fontSize: 13, marginTop: 8, opacity: 0.9 }}>
                {weather.icon} {weather.tempMin}°–{weather.tempMax}°C
              </div>
            )}
          </div>
        </div>

        {/* Budget bar */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.8, marginBottom: 6 }}>
            <span>預算進度</span>
            <span>剩 ¥{remaining.toLocaleString()} ({(100 - budgetPct).toFixed(0)}%)</span>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 8, height: 8, overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${budgetPct}%` }}
              transition={{ delay: 0.4, duration: 0.8, ease: 'easeOut' }}
              style={{
                height: '100%',
                background: budgetPct > 80 ? '#FFD700' : 'white',
                borderRadius: 8,
              }}
            />
          </div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
            ¥{totalSpend.toLocaleString()} / ¥{state.budget.toLocaleString()} (日均 ¥{dailyBudget.toLocaleString()})
          </div>
        </div>
      </motion.div>

      {/* Daily budget alert */}
      {overDaily && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{
            background: '#FFF3CD',
            border: '1px solid #FFD700',
            borderRadius: 12,
            padding: '10px 14px',
            marginBottom: 12,
            fontSize: 13,
            color: '#856404',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          ⚠️ 今日已超過日均預算！(¥{todayTotal.toLocaleString()} / ¥{dailyBudget.toLocaleString()})
        </motion.div>
      )}

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          style={{
            background: 'linear-gradient(135deg,#1B2D55,#3060A0)',
            borderRadius: 16,
            padding: '16px 14px',
            color: 'white',
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 6 }}>總消費</div>
          <div className="num" style={{ fontSize: 24, fontWeight: 800 }}>¥<AnimatedNumber value={totalSpend} /></div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>≈ HKD {(totalSpend / state.rate).toFixed(0)}</div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          style={{
            background: 'linear-gradient(135deg,#D4760F,#F5A623)',
            borderRadius: 16,
            padding: '16px 14px',
            color: 'white',
          }}
        >
          <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 6 }}>日均花費</div>
          <div className="num" style={{ fontSize: 24, fontWeight: 800 }}>¥<AnimatedNumber value={dailyAvg} /></div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{uniqueDays} 日有消費</div>
        </motion.div>
      </div>

      {/* Person breakdown */}
      {state.persons.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass"
          style={{ borderRadius: 16, padding: '14px 16px', marginBottom: 14 }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#1A1A2E' }}>👥 人員花費</div>
          {state.persons.map(p => {
            const amt = state.receipts.filter(r => r.personId === p.id).reduce((s, r) => s + r.total, 0);
            return (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
                <span>{p.emoji} {p.name}</span>
                <span className="num" style={{ color: '#CC2929', fontWeight: 600 }}>¥{amt.toLocaleString()}</span>
              </div>
            );
          })}
        </motion.div>
      )}

      {/* Itinerary */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 10 }}>📅 6日行程</div>
        {ITINERARY.map((day, i) => {
          const isToday = day.date === today;
          const dayReceipts = state.receipts.filter(r => r.date === day.date);
          const dayTotal = dayReceipts.reduce((s, r) => s + r.total, 0);
          return (
            <motion.div
              key={day.day}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              className="glass"
              style={{
                borderRadius: 16,
                padding: '14px 16px',
                marginBottom: 10,
                border: isToday ? '2px solid rgba(204,41,41,0.4)' : undefined,
                background: isToday ? 'rgba(255,255,255,0.9)' : undefined,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 26, height: 26,
                    borderRadius: '50%',
                    background: isToday ? 'linear-gradient(135deg,#C0281E,#E04040)' : 'rgba(204,41,41,0.1)',
                    color: isToday ? 'white' : '#CC2929',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700,
                  }}>
                    {day.day}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E' }}>{day.region}</div>
                    <div style={{ fontSize: 11, color: '#6B7285' }}>{day.date} · {day.highlight}</div>
                  </div>
                </div>
                {dayTotal > 0 && (
                  <div className="num" style={{ fontSize: 13, fontWeight: 600, color: '#CC2929' }}>
                    ¥{dayTotal.toLocaleString()}
                  </div>
                )}
                {isToday && dayTotal === 0 && (
                  <span style={{ fontSize: 11, background: 'rgba(204,41,41,0.1)', color: '#CC2929', padding: '2px 8px', borderRadius: 10 }}>
                    今日
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {day.spots.map((spot, j) => (
                  <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6B7285' }}>
                    <span className="num" style={{ fontSize: 11, minWidth: 36 }}>{spot.time}</span>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: spot.type === 'food' ? '#CC2929' : spot.type === 'transport' ? '#2D5A8E' : spot.type === 'lodging' ? '#059669' : '#F5A623',
                      flexShrink: 0,
                    }} />
                    <span style={{ color: '#1A1A2E' }}>{spot.name}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Today receipts */}
      {todayReceipts.length > 0 && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 10 }}>
            今日紀錄 ({todayReceipts.length})
          </div>
          {todayReceipts.map((r, i) => (
            <ReceiptRow key={r.id} receipt={r} rate={state.rate} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReceiptRow({ receipt, rate, index }: { receipt: Receipt; rate: number; index: number }) {
  const cat = CATEGORY_MAP[receipt.category];
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="glass"
      style={{ borderRadius: 14, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: `${cat?.color ?? '#6b7280'}20`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, flexShrink: 0,
      }}>
        {cat?.icon ?? '📦'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {receipt.store}
        </div>
        <div style={{ fontSize: 12, color: '#6B7285' }}>
          {cat?.label ?? receipt.category} · {receipt.time ?? receipt.date}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="num" style={{ fontSize: 16, fontWeight: 700, color: '#CC2929' }}>¥{receipt.total.toLocaleString()}</div>
        <div style={{ fontSize: 11, color: '#6B7285' }}>≈{(receipt.total / rate).toFixed(0)} HKD</div>
      </div>
    </motion.div>
  );
}
