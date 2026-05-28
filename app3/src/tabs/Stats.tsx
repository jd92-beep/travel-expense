import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { AppState } from '@/lib/types';
import { CATEGORIES, CATEGORY_MAP } from '@/lib/constants';

interface StatsProps {
  state: AppState;
}

export function Stats({ state }: StatsProps) {
  const receipts = useMemo(() => {
    if (state.statsIncludeTransportLodging) return state.receipts;
    return state.receipts.filter(r => r.category !== 'transport' && r.category !== 'lodging');
  }, [state.receipts, state.statsIncludeTransportLodging]);

  const total = receipts.reduce((s, r) => s + r.total, 0);

  // Category breakdown
  const catBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    receipts.forEach(r => { map[r.category] = (map[r.category] ?? 0) + r.total; });
    return CATEGORIES
      .map(c => ({ ...c, amount: map[c.id] ?? 0 }))
      .filter(c => c.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [receipts]);

  // Daily breakdown
  const dailyBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    receipts.forEach(r => { map[r.date] = (map[r.date] ?? 0) + r.total; });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }));
  }, [receipts]);

  const maxDaily = Math.max(...dailyBreakdown.map(d => d.amount), 1);

  // Top 10
  const top10 = [...receipts].sort((a, b) => b.total - a.total).slice(0, 10);

  // SVG Donut
  const radius = 70;
  const cx = 90;
  const cy = 90;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const segments = catBreakdown.map(c => {
    const pct = total > 0 ? c.amount / total : 0;
    const seg = { ...c, pct, offset, dash: pct * circumference };
    offset += pct * circumference;
    return seg;
  });

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#1A1A2E', marginBottom: 16 }}>📊 消費統計</div>

      {receipts.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#6B7285', marginTop: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div>暫無數據</div>
        </div>
      ) : (
        <>
          {/* Donut chart */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="glass"
            style={{ borderRadius: 20, padding: '20px 16px', marginBottom: 14 }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 14 }}>類別分佈</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <svg width={180} height={180} viewBox="0 0 180 180">
                  {segments.map((seg, i) => (
                    <motion.circle
                      key={seg.id}
                      cx={cx} cy={cy} r={radius}
                      fill="none"
                      stroke={seg.color}
                      strokeWidth={20}
                      strokeDasharray={`${seg.dash} ${circumference}`}
                      strokeDashoffset={-seg.offset}
                      transform={`rotate(-90 ${cx} ${cy})`}
                      initial={{ strokeDasharray: `0 ${circumference}` }}
                      animate={{ strokeDasharray: `${seg.dash} ${circumference}` }}
                      transition={{ delay: 0.2 + i * 0.1, duration: 0.6, ease: 'easeOut' }}
                    />
                  ))}
                  <text x={cx} y={cy - 6} textAnchor="middle" fontSize={13} fill="#6B7285">總計</text>
                  <text x={cx} y={cy + 12} textAnchor="middle" fontSize={16} fontWeight="700" fill="#1A1A2E">
                    ¥{total.toLocaleString()}
                  </text>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                {catBreakdown.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#1A1A2E', flex: 1 }}>{c.icon} {c.label}</span>
                    <span className="num" style={{ fontSize: 12, color: '#CC2929', fontWeight: 600 }}>
                      {total > 0 ? ((c.amount / total) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Daily bar chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass"
            style={{ borderRadius: 20, padding: '20px 16px', marginBottom: 14 }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 14 }}>每日花費</div>
            {dailyBreakdown.length === 0 ? (
              <div style={{ color: '#6B7285', fontSize: 13 }}>暫無數據</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dailyBreakdown.map((d, i) => (
                  <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, color: '#6B7285', minWidth: 68 }}>{d.date.slice(5)}</span>
                    <div style={{ flex: 1, background: 'rgba(0,0,0,0.06)', borderRadius: 8, height: 16, overflow: 'hidden' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(d.amount / maxDaily) * 100}%` }}
                        transition={{ delay: 0.3 + i * 0.08, duration: 0.6, ease: 'easeOut' }}
                        style={{
                          height: '100%',
                          background: 'linear-gradient(90deg,#C0281E,#E04040)',
                          borderRadius: 8,
                        }}
                      />
                    </div>
                    <span className="num" style={{ fontSize: 12, color: '#CC2929', fontWeight: 600, minWidth: 60, textAlign: 'right' }}>
                      ¥{d.amount.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Top 10 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass"
            style={{ borderRadius: 20, padding: '20px 16px' }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 14 }}>
              🏆 Top {top10.length} 消費
            </div>
            {top10.map((r, i) => {
              const cat = CATEGORY_MAP[r.category];
              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.04 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
                    paddingBottom: 10,
                    borderBottom: i < top10.length - 1 ? '1px solid rgba(255,220,210,0.4)' : 'none',
                  }}
                >
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: i < 3 ? ['#FFD700','#C0C0C0','#CD7F32'][i] : 'rgba(0,0,0,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: i < 3 ? 'white' : '#6B7285',
                  }}>
                    {i + 1}
                  </div>
                  <span style={{ fontSize: 18 }}>{cat?.icon ?? '📦'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.store}
                    </div>
                    <div style={{ fontSize: 11, color: '#6B7285' }}>{r.date} · {cat?.label}</div>
                  </div>
                  <span className="num" style={{ fontSize: 15, fontWeight: 700, color: '#CC2929', flexShrink: 0 }}>
                    ¥{r.total.toLocaleString()}
                  </span>
                </motion.div>
              );
            })}
          </motion.div>
        </>
      )}
    </div>
  );
}
