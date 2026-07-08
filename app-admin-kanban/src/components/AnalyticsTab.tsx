import React, { useState, useEffect } from 'react';
import type { AdminSession } from '../lib/types';
import { fetchAnalyticsTimeseries } from '../lib/adminApi';

interface AnalyticsTabProps {
  session: AdminSession;
}

/* ─────── helpers ─────── */
function shortDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/* ─────── SVG Chart ─────── */
const W = 700, H = 260, PL = 48, PR = 20, PT = 24, PB = 40;
const CW = W - PL - PR, CH = H - PT - PB;

function GridLines({ max, unit }: { max: number; unit?: string }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <>
      {ticks.map((r, i) => {
        const y = H - PB - r * CH;
        const v = Math.round(r * max);
        return (
          <g key={i}>
            <line x1={PL} y1={y} x2={W - PR} y2={y} stroke="rgba(255,255,255,0.08)" strokeDasharray="4" />
            <text x={PL - 6} y={y + 4} fill="var(--text-muted)" fontSize="10" textAnchor="end">
              {v}{unit || ''}
            </text>
          </g>
        );
      })}
    </>
  );
}

function XLabels({ data, labelKey }: { data: any[]; labelKey: string }) {
  if (data.length === 0) return null;
  // Show a label every 7 days or fewer if data is small
  const step = Math.max(1, Math.floor(data.length / 6));
  const indices: number[] = [];
  for (let i = 0; i < data.length; i += step) indices.push(i);
  if (indices[indices.length - 1] !== data.length - 1) indices.push(data.length - 1);
  return (
    <>
      {indices.map(i => {
        const x = PL + (i / Math.max(1, data.length - 1)) * CW;
        return (
          <text key={i} x={x} y={H - 8} fill="var(--text-muted)" fontSize="9" textAnchor="middle">
            {shortDate(data[i]?.[labelKey] || '')}
          </text>
        );
      })}
    </>
  );
}

function EmptyChart({ title }: { title: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', minHeight: '200px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <h3 style={{ marginBottom: '8px' }}>{title}</h3>
      <p style={{ color: 'var(--text-muted)' }}>No data available for this period.</p>
    </div>
  );
}

/* ─────── Component ─────── */
export function AnalyticsTab({ session }: AnalyticsTabProps) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{
    usageTrend: any[];
    aiConsumption: any[];
    receiptVelocity: any[];
    surfaceBreakdown: any[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAnalyticsTimeseries(session, days);
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [days]);

  const isDataMissing = !data;

  // ─── Summary cards ───
  const providers = React.useMemo(() => ['kimi', 'google', 'mimo', 'weatherapi', 'notion', 'volcano'], []);
  const providerColors: Record<string, string> = {
    kimi: '#27ae60', google: '#2f80ed', mimo: '#f2c94c', weatherapi: '#9b51e0', notion: '#eb5757', volcano: '#ff6b35',
  };

  const { totalEvents, peakDau, totalReceipts, totalAiCalls, dauData, recData, aiData } = React.useMemo(() => {
    const dauDataRaw = data?.usageTrend || [];
    const recDataRaw = data?.receiptVelocity || [];
    const aiDataRaw = data?.aiConsumption || [];
    
    // Downsample if needed (e.g., max 150 points for SVG) to prevent DOM freezing
    const downsample = <T,>(arr: T[], max: number): T[] => {
      if (arr.length <= max) return arr;
      const step = Math.ceil(arr.length / max);
      return arr.filter((_, i) => i % step === 0);
    };

    const dauData = downsample(dauDataRaw, 150);
    const recData = downsample(recDataRaw, 150);
    const aiData = downsample(aiDataRaw, 150);

    const totalEvents = dauDataRaw.reduce((sum, d) => sum + (d.events || 0), 0);
    const totalReceipts = recDataRaw.reduce((sum, d) => sum + (d.count || 0), 0);
    const peakDau = dauDataRaw.length > 0 ? Math.max(...dauDataRaw.map(d => d.activeUsers || 0)) : 0;
    
    const totalAiCalls = aiDataRaw.reduce((sum, d) => providers.reduce((s, p) => s + (Number(d[p]) || 0), sum), 0);
    
    return { totalEvents, peakDau, totalReceipts, totalAiCalls, dauData, recData, aiData };
  }, [data, providers]);

  // ─── DAU chart data ───
  const { dauMax, dauPoints, dauPath, dauArea } = React.useMemo(() => {
    const dauMax = Math.max(...dauData.map(d => d.activeUsers || 0), 1);
    const dauPoints = dauData.map((d, i) => ({
      x: PL + (i / Math.max(1, dauData.length - 1)) * CW,
      y: H - PB - ((d.activeUsers || 0) / dauMax) * CH,
      v: d.activeUsers || 0,
      date: d.date,
    }));
    const dauPath = dauPoints.length > 1
      ? `M ${dauPoints[0].x} ${dauPoints[0].y} ` + dauPoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
      : '';
    const dauArea = dauPath
      ? dauPath + ` L ${dauPoints[dauPoints.length - 1].x} ${H - PB} L ${dauPoints[0].x} ${H - PB} Z`
      : '';
    return { dauMax, dauPoints, dauPath, dauArea };
  }, [dauData]);

  // ─── Receipt velocity ───
  const { recMax, barW } = React.useMemo(() => {
    const recMax = Math.max(...recData.map(d => d.count || 0), 1);
    const barW = recData.length > 0 ? CW / recData.length : 0;
    return { recMax, barW };
  }, [recData]);

  // ─── AI consumption ───
  const { aiMax, aiBarW } = React.useMemo(() => {
    const aiMax = Math.max(...aiData.map(d => providers.reduce((sum, p) => sum + (Number(d[p]) || 0), 0)), 1);
    const aiBarW = aiData.length > 0 ? CW / aiData.length : 0;
    return { aiMax, aiBarW };
  }, [aiData, providers]);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading analytics...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: '1rem' }}>
        <div className="error-box" style={{ background: 'rgba(235,87,87,0.1)', color: '#eb5757', padding: '12px', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>
        <button type="button" onClick={loadData} className="primary-command">Retry</button>
      </div>
    );
  }

  if (isDataMissing) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No data available.</div>;
  }

  return (
    <section className="dashboard-content" style={{ flexDirection: 'column', gap: '20px', display: 'flex' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Analytics Dashboard</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label>Range:</label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
          >
            <option value={7}>Last 7 Days</option>
            <option value={14}>Last 14 Days</option>
            <option value={30}>Last 30 Days</option>
            <option value={90}>Last 90 Days</option>
          </select>
          <button type="button" onClick={loadData} className="ghost-command" style={{ padding: '4px 10px', fontSize: '0.85em' }}>
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
        <div style={{ background: 'rgba(47,128,237,0.12)', border: '1px solid rgba(47,128,237,0.3)', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#2f80ed' }}>{totalEvents.toLocaleString()}</div>
          <div style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>Total Events</div>
        </div>
        <div style={{ background: 'rgba(39,174,96,0.12)', border: '1px solid rgba(39,174,96,0.3)', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#27ae60' }}>{peakDau}</div>
          <div style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>Peak DAU</div>
        </div>
        <div style={{ background: 'rgba(155,81,224,0.12)', border: '1px solid rgba(155,81,224,0.3)', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#9b51e0' }}>{totalReceipts}</div>
          <div style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>Receipts Created</div>
        </div>
        <div style={{ background: 'rgba(242,201,76,0.12)', border: '1px solid rgba(242,201,76,0.3)', borderRadius: '8px', padding: '16px', textAlign: 'center' }}>
          <div style={{ fontSize: '2em', fontWeight: 'bold', color: '#f2c94c' }}>{totalAiCalls}</div>
          <div style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>AI Provider Calls</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

        {/* Chart 1: DAU */}
        {dauData.length > 0 ? (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ marginBottom: '12px' }}>📈 Daily Active Users</h3>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', background: 'rgba(0,0,0,0.15)', borderRadius: '4px' }}>
              <GridLines max={dauMax} />
              {dauArea && <path d={dauArea} fill="rgba(47,128,237,0.15)" />}
              {dauPath && <path d={dauPath} fill="none" stroke="#2f80ed" strokeWidth="2.5" />}
              {dauPoints.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r="4" fill="#2f80ed" stroke="#1a1a2e" strokeWidth="1.5" />
                  {(dauData.length <= 14 || i % Math.ceil(dauData.length / 10) === 0) && p.v > 0 && (
                    <text x={p.x} y={p.y - 10} fill="#2f80ed" fontSize="10" textAnchor="middle" fontWeight="bold">{p.v}</text>
                  )}
                  <title>{p.date}: {p.v} active users</title>
                </g>
              ))}
              <XLabels data={dauData} labelKey="date" />
            </svg>
          </div>
        ) : (
          <EmptyChart title="📈 Daily Active Users" />
        )}

        {/* Chart 2: Receipt Velocity */}
        {recData.length > 0 ? (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ marginBottom: '12px' }}>🧾 Daily Receipts Created</h3>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', background: 'rgba(0,0,0,0.15)', borderRadius: '4px' }}>
              <GridLines max={recMax} />
              {recData.map((d, i) => {
                const x = PL + i * barW;
                const h = ((d.count || 0) / recMax) * CH;
                const y = H - PB - h;
                return (
                  <g key={i}>
                    <rect x={x + 1} y={y} width={Math.max(1, barW - 2)} height={Math.max(0.5, h)} fill="#9b51e0" opacity="0.8" rx="1" />
                    {d.count > 0 && barW > 15 && (
                      <text x={x + barW / 2} y={y - 4} fill="#9b51e0" fontSize="9" textAnchor="middle">{d.count}</text>
                    )}
                    <title>{shortDate(d.date)}: {d.count} receipts</title>
                  </g>
                );
              })}
              <XLabels data={recData} labelKey="date" />
            </svg>
          </div>
        ) : (
          <EmptyChart title="🧾 Daily Receipts Created" />
        )}

        {/* Chart 3: AI Provider Stacked Bars */}
        {aiData.length > 0 ? (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3>🤖 AI Provider Usage</h3>
              <div style={{ display: 'flex', gap: '10px', fontSize: '0.8em', flexWrap: 'wrap' }}>
                {providers.map(p => (
                  <span key={p} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '10px', height: '10px', background: providerColors[p], display: 'inline-block', borderRadius: '2px' }} />
                    {p}
                  </span>
                ))}
              </div>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', background: 'rgba(0,0,0,0.15)', borderRadius: '4px' }}>
              <GridLines max={aiMax} />
              {aiData.map((d, i) => {
                const x = PL + i * aiBarW;
                let accH = 0;
                return (
                  <g key={i}>
                    {providers.map(p => {
                      const count = Number(d[p]) || 0;
                      if (count === 0) return null;
                      const h = (count / aiMax) * CH;
                      const y = H - PB - h - accH;
                      accH += h;
                      return <rect key={p} x={x + 1} y={y} width={Math.max(1, aiBarW - 2)} height={h} fill={providerColors[p]} rx="1" />;
                    })}
                    <title>{shortDate(d.date)}: {providers.map(p => `${p}: ${Number(d[p]) || 0}`).join(', ')}</title>
                  </g>
                );
              })}
              <XLabels data={aiData} labelKey="date" />
            </svg>
          </div>
        ) : (
          <EmptyChart title="🤖 AI Provider Usage" />
        )}

        {/* Chart 4: Surface Breakdown (horizontal bars) */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ marginBottom: '16px' }}>📱 Events by App Surface</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {data.surfaceBreakdown?.length ? (
              data.surfaceBreakdown.map(sb => {
                const totalEv = data.surfaceBreakdown!.reduce((sum, item) => sum + item.count, 0) || 1;
                const pct = ((sb.count / totalEv) * 100);
                const surfaceColors: Record<string, string> = {
                  compact: '#27ae60', react: '#2f80ed', legacy: '#f2c94c', 'admin-kanban': '#9b51e0',
                };
                const color = surfaceColors[sb.surface] || 'var(--primary)';
                return (
                  <div key={sb.surface}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9em', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 'bold' }}>{sb.surface}</span>
                      <span>{sb.count.toLocaleString()} events ({pct.toFixed(1)}%)</span>
                    </div>
                    <div style={{ width: '100%', height: '12px', background: 'rgba(255,255,255,0.08)', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '6px', transition: 'width 0.3s ease' }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="empty-text">No surface telemetry available.</p>
            )}
          </div>
        </div>

      </div>
    </section>
  );
}
