import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Card, CardLabel } from '@/components/ui/Card';
import { CATEGORIES, PAYMENTS } from '@/lib/constants';
import { NumberRoll } from '@/components/NumberRoll';
import type { AppState, Category, Payment } from '@/lib/types';
import { formatJPY } from '@/lib/utils';
import { Trophy, PieChart as PieIcon, BarChart2 } from 'lucide-react';

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const tooltipStyle = {
  backgroundColor: 'rgba(20, 17, 15, 0.95)',
  titleColor: '#fff',
  bodyColor: '#d6d3d1',
  borderColor: 'rgba(255,255,255,0.1)',
  borderWidth: 1,
  padding: 10,
  cornerRadius: 10,
  titleFont: { size: 12, weight: 'bold' as const },
  bodyFont: { size: 11 },
};

export function Stats({ state }: { state: AppState }) {
  const byCat = useMemo(() => {
    const m = new Map<Category, number>();
    for (const r of state.receipts)
      m.set(r.category, (m.get(r.category) || 0) + (r.total || 0));
    return m;
  }, [state.receipts]);

  const byPay = useMemo(() => {
    const m = new Map<Payment, number>();
    for (const r of state.receipts)
      m.set(r.payment, (m.get(r.payment) || 0) + (r.total || 0));
    return m;
  }, [state.receipts]);

  const byDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of state.receipts) m.set(r.date, (m.get(r.date) || 0) + (r.total || 0));
    return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }, [state.receipts]);

  const byStore = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of state.receipts)
      m.set(r.store || '未命名', (m.get(r.store || '未命名') || 0) + (r.total || 0));
    return [...m.entries()].sort(([, a], [, b]) => b - a).slice(0, 10);
  }, [state.receipts]);

  const total = state.receipts.reduce((s, r) => s + (r.total || 0), 0);

  const catEntries = [...byCat.entries()];
  const doughnutData = {
    labels: catEntries.map(([k]) => CATEGORIES[k].name),
    datasets: [
      {
        data: catEntries.map(([, v]) => v),
        backgroundColor: catEntries.map(([k]) => CATEGORIES[k].color),
        borderColor: 'rgba(10, 9, 8, 1)',
        borderWidth: 3,
        hoverOffset: 6,
      },
    ],
  };
  const doughnutOpts = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipStyle,
        callbacks: {
          label: (ctx: { label?: string; parsed: number }) =>
            ` ${ctx.label}: ¥${Math.round(ctx.parsed).toLocaleString()}`,
        },
      },
    },
  };

  const barData = {
    labels: byDay.map(([d]) => d.slice(5)),
    datasets: [
      {
        data: byDay.map(([, v]) => v),
        backgroundColor: (ctx: {
          chart: { ctx: CanvasRenderingContext2D; chartArea?: { bottom: number; top: number } };
        }) => {
          const { ctx: c, chartArea } = ctx.chart;
          if (!chartArea) return '#ef4135';
          const g = c.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
          g.addColorStop(0, 'rgba(239, 65, 53, 0.35)');
          g.addColorStop(1, 'rgba(251, 191, 36, 1)');
          return g;
        },
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 36,
      },
    ],
  };
  const barOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipStyle,
        callbacks: {
          label: (ctx: { parsed: { y: number } }) =>
            ` ¥${Math.round(ctx.parsed.y).toLocaleString()}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: '#a8a29e',
          font: { family: 'JetBrains Mono', size: 10 },
        },
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: {
          color: '#a8a29e',
          font: { family: 'JetBrains Mono', size: 10 },
          callback: (v: number | string) => `¥${(Number(v) / 1000).toFixed(0)}k`,
        },
      },
    },
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Total */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <CardLabel>總消費</CardLabel>
        <div className="num text-4xl font-extrabold text-white mt-1 tracking-tight">
          <NumberRoll value={total} prefix="¥" />
        </div>
        <div className="text-xs text-paper-600 mt-1 num">
          {state.receipts.length} 筆 · 日均 ¥
          {Math.round(byDay.length ? total / byDay.length : 0).toLocaleString()}
        </div>
      </motion.div>

      {/* Category doughnut */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <PieIcon size={14} className="text-arsenal-400" />
          <CardLabel>類別分佈</CardLabel>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
          <div className="relative h-48">
            {catEntries.length > 0 ? (
              <>
                <Doughnut data={doughnutData} options={doughnutOpts as never} />
                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                  <div className="text-center">
                    <div className="num text-[10px] text-paper-600 uppercase tracking-[0.2em]">
                      total
                    </div>
                    <div className="num text-lg font-bold text-white">{formatJPY(total)}</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full grid place-items-center text-paper-600 text-sm">冇數據</div>
            )}
          </div>
          <div className="space-y-1.5">
            {catEntries
              .slice()
              .sort(([, a], [, b]) => b - a)
              .map(([k, v]) => (
                <div key={k} className="flex items-center gap-2 text-sm">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: CATEGORIES[k].color }}
                  />
                  <span className="text-paper-900 flex-1 truncate">{CATEGORIES[k].name}</span>
                  <span className="num text-paper-800">{formatJPY(v)}</span>
                  <span className="num text-[10px] text-paper-500 w-10 text-right">
                    {total > 0 ? Math.round((v / total) * 100) : 0}%
                  </span>
                </div>
              ))}
          </div>
        </div>
      </Card>

      {/* Daily bar */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <BarChart2 size={14} className="text-ember-400" />
          <CardLabel>每日趨勢</CardLabel>
        </div>
        <div className="h-48">
          {byDay.length > 0 ? (
            <Bar data={barData} options={barOpts as never} />
          ) : (
            <div className="h-full grid place-items-center text-paper-600 text-sm">冇數據</div>
          )}
        </div>
      </Card>

      {/* Payment split */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <CardLabel>支付方式</CardLabel>
        </div>
        <div className="space-y-2.5">
          {[...byPay.entries()]
            .sort(([, a], [, b]) => b - a)
            .map(([k, v]) => {
              const pay = PAYMENTS[k];
              const pct = total > 0 ? (v / total) * 100 : 0;
              return (
                <div key={k}>
                  <div className="flex items-center justify-between text-xs text-paper-800 mb-1">
                    <span>
                      {pay?.icon} {pay?.name || k}
                    </span>
                    <span className="num">
                      {formatJPY(v)} <span className="text-paper-500">{pct.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                      className="h-full bg-gradient-arsenal rounded-full shadow-glow-sm"
                    />
                  </div>
                </div>
              );
            })}
          {byPay.size === 0 && (
            <div className="text-sm text-paper-600 text-center py-4">冇數據</div>
          )}
        </div>
      </Card>

      {/* Top 10 */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Trophy size={14} className="text-ember-400" />
          <CardLabel>TOP 10 店舖</CardLabel>
        </div>
        <div className="space-y-1.5">
          {byStore.map(([name, v], i) => (
            <motion.div
              key={name}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center gap-3 text-sm py-1.5"
            >
              <span
                className={`num text-[10px] font-bold grid place-items-center h-6 w-6 rounded-lg ${
                  i < 3
                    ? 'bg-gradient-arsenal text-white shadow-glow-sm'
                    : 'bg-white/5 text-paper-600'
                }`}
              >
                {i + 1}
              </span>
              <span className="text-paper-900 flex-1 truncate">{name}</span>
              <span className="num text-paper-800 font-semibold">{formatJPY(v)}</span>
            </motion.div>
          ))}
          {byStore.length === 0 && (
            <div className="text-sm text-paper-600 text-center py-4">冇數據</div>
          )}
        </div>
      </Card>
    </div>
  );
}
