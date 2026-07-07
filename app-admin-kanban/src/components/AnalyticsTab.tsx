import React, { useState, useEffect } from 'react';
import type { AdminSession } from '../lib/types';
import { fetchAnalyticsTimeseries } from '../lib/adminApi';

interface AnalyticsTabProps {
  session: AdminSession;
}

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

  if (!data) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No data available.</div>;
  }

  // --- SVG Chart Helpers ---
  const width = 600;
  const height = 220;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 30;
  const paddingBottom = 30;
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Chart 1: Daily Active Users (Line Chart)
  const dauData = data.usageTrend || [];
  const dauMax = Math.max(...dauData.map(d => d.activeUsers), 5);
  const dauPoints = dauData.map((d, i) => {
    const x = paddingLeft + (i / Math.max(1, dauData.length - 1)) * chartWidth;
    const y = height - paddingBottom - (d.activeUsers / dauMax) * chartHeight;
    return { x, y, date: d.date, value: d.activeUsers };
  });
  const dauPath = dauPoints.length > 0 
    ? `M ${dauPoints[0].x} ${dauPoints[0].y} ` + dauPoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
    : '';

  // Chart 2: Receipt Velocity (Bar Chart)
  const recData = data.receiptVelocity || [];
  const recMax = Math.max(...recData.map(d => d.count), 5);
  const barWidth = recData.length > 0 ? chartWidth / recData.length : 0;

  // Chart 3: AI Provider Usage (Stacked / Grouped Bar Chart)
  const aiData = data.aiConsumption || [];
  const providers = ['kimi', 'google', 'mimo', 'weatherapi', 'notion'];
  const aiMax = Math.max(...aiData.map(d => {
    return providers.reduce((sum, p) => sum + (Number(d[p]) || 0), 0);
  }), 10);
  const aiBarWidth = aiData.length > 0 ? chartWidth / aiData.length : 0;

  const providerColors: Record<string, string> = {
    kimi: '#27ae60',
    google: '#2f80ed',
    mimo: '#f2c94c',
    weatherapi: '#9b51e0',
    notion: '#eb5757'
  };

  return (
    <section className="dashboard-content" style={{ flexDirection: 'column', gap: '20px', display: 'flex' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Database Metrics Analytics</h2>
        <div>
          <label style={{ marginRight: '8px' }}>Range:</label>
          <select 
            value={days} 
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
          >
            <option value={7}>Last 7 Days</option>
            <option value={14}>Last 14 Days</option>
            <option value={30}>Last 30 Days</option>
            <option value={90}>Last 90 Days</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(600px, 1fr))', gap: '20px' }}>
        
        {/* Chart 1: Daily Active Users */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ marginBottom: '12px' }}>Daily Active Users (DAU)</h3>
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
            {/* Grid Lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
              const y = height - paddingBottom - ratio * chartHeight;
              const val = Math.round(ratio * dauMax);
              return (
                <g key={index}>
                  <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="rgba(255,255,255,0.07)" strokeDasharray="4" />
                  <text x={paddingLeft - 8} y={y + 4} fill="var(--text-muted)" fontSize="10" textAnchor="end">{val}</text>
                </g>
              );
            })}
            
            {/* Line Path */}
            {dauPath && <path d={dauPath} fill="none" stroke="#2f80ed" strokeWidth="2.5" />}
            
            {/* Data Dots & Tooltips */}
            {dauPoints.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="3.5" fill="#2f80ed" />
                <title>{p.date}: {p.value} active users</title>
              </g>
            ))}

            {/* X-axis ticks (Show start and end dates) */}
            {dauData.length > 0 && (
              <>
                <text x={paddingLeft} y={height - 10} fill="var(--text-muted)" fontSize="9" textAnchor="start">
                  {dauData[0].date}
                </text>
                <text x={width - paddingRight} y={height - 10} fill="var(--text-muted)" fontSize="9" textAnchor="end">
                  {dauData[dauData.length - 1].date}
                </text>
              </>
            )}
          </svg>
        </div>

        {/* Chart 2: Receipt Velocity */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ marginBottom: '12px' }}>Receipt Velocity (Daily Created Count)</h3>
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
            {/* Grid Lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
              const y = height - paddingBottom - ratio * chartHeight;
              const val = Math.round(ratio * recMax);
              return (
                <g key={index}>
                  <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="rgba(255,255,255,0.07)" strokeDasharray="4" />
                  <text x={paddingLeft - 8} y={y + 4} fill="var(--text-muted)" fontSize="10" textAnchor="end">{val}</text>
                </g>
              );
            })}

            {/* Bars */}
            {recData.map((d, i) => {
              const x = paddingLeft + i * barWidth;
              const h = (d.count / recMax) * chartHeight;
              const y = height - paddingBottom - h;
              return (
                <g key={i}>
                  <rect 
                    x={x + 1} 
                    y={y} 
                    width={Math.max(1, barWidth - 2)} 
                    height={Math.max(1, h)} 
                    fill="var(--primary)" 
                    opacity="0.8"
                  />
                  <title>{d.date}: {d.count} receipts</title>
                </g>
              );
            })}

            {/* X-axis ticks */}
            {recData.length > 0 && (
              <>
                <text x={paddingLeft} y={height - 10} fill="var(--text-muted)" fontSize="9" textAnchor="start">
                  {recData[0].date}
                </text>
                <text x={width - paddingRight} y={height - 10} fill="var(--text-muted)" fontSize="9" textAnchor="end">
                  {recData[recData.length - 1].date}
                </text>
              </>
            )}
          </svg>
        </div>

        {/* Chart 3: AI Provider Usage (Stacked Bar Chart) */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3>AI Provider Call Volume (Requests/Tokens)</h3>
            <div style={{ display: 'flex', gap: '8px', fontSize: '0.8em' }}>
              {providers.map(p => (
                <span key={p} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '8px', height: '8px', background: providerColors[p], display: 'inline-block', borderRadius: '50%' }}></span>
                  {p}
                </span>
              ))}
            </div>
          </div>
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
            {/* Grid Lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
              const y = height - paddingBottom - ratio * chartHeight;
              const val = Math.round(ratio * aiMax);
              return (
                <g key={index}>
                  <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="rgba(255,255,255,0.07)" strokeDasharray="4" />
                  <text x={paddingLeft - 8} y={y + 4} fill="var(--text-muted)" fontSize="10" textAnchor="end">{val}</text>
                </g>
              );
            })}

            {/* Stacked Bars */}
            {aiData.map((d, i) => {
              const x = paddingLeft + i * aiBarWidth;
              let accumulatedHeight = 0;

              return (
                <g key={i}>
                  {providers.map(p => {
                    const count = Number(d[p]) || 0;
                    if (count === 0) return null;
                    const h = (count / aiMax) * chartHeight;
                    const y = height - paddingBottom - h - accumulatedHeight;
                    accumulatedHeight += h;
                    return (
                      <rect 
                        key={p}
                        x={x + 1} 
                        y={y} 
                        width={Math.max(1, aiBarWidth - 2)} 
                        height={h} 
                        fill={providerColors[p]} 
                      />
                    );
                  })}
                  <title>
                    {d.date} Total AI Calls:
                    {providers.map(p => `\n- ${p}: ${Number(d[p]) || 0}`)}
                  </title>
                </g>
              );
            })}

            {/* X-axis ticks */}
            {aiData.length > 0 && (
              <>
                <text x={paddingLeft} y={height - 10} fill="var(--text-muted)" fontSize="9" textAnchor="start">
                  {aiData[0].date}
                </text>
                <text x={width - paddingRight} y={height - 10} fill="var(--text-muted)" fontSize="9" textAnchor="end">
                  {aiData[aiData.length - 1].date}
                </text>
              </>
            )}
          </svg>
        </div>

        {/* Chart 4: App Surface Breakdown */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h3 style={{ marginBottom: '12px' }}>Event Breakdown by App Surface</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.surfaceBreakdown?.map(sb => {
              const totalEvents = data.surfaceBreakdown.reduce((sum, item) => sum + item.count, 0) || 1;
              const pct = ((sb.count / totalEvents) * 100).toFixed(1);
              return (
                <div key={sb.surface} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9em' }}>
                    <span>{sb.surface}</span>
                    <span>{sb.count} events ({pct}%)</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--primary)' }}></div>
                  </div>
                </div>
              );
            })}
            {(!data.surfaceBreakdown || data.surfaceBreakdown.length === 0) && (
              <p className="empty-text">No surface telemetry available.</p>
            )}
          </div>
        </div>

      </div>
    </section>
  );
}
