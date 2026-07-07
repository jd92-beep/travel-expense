import React, { useState, useEffect } from 'react';
import type { AdminSession, AdminKanbanSnapshot } from '../lib/types';
import { testProvider, fetchAiLatencyTrending } from '../lib/adminApi';

interface AiMonitoringTabProps {
  session: AdminSession;
  snapshot: AdminKanbanSnapshot;
}

interface TestRunRecord {
  id: string;
  provider: string;
  testedAt: number;
  status: string;
  message?: string;
}

export function AiMonitoringTab({ session, snapshot }: AiMonitoringTabProps) {
  const [latencyTrend, setLatencyTrend] = useState<any[]>([]);
  const [providerComparison, setProviderComparison] = useState<any[]>([]);
  const [testHistory, setTestHistory] = useState<TestRunRecord[]>(() => {
    try {
      const raw = sessionStorage.getItem('travel-expense-admin-kanban:ai-test-history');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persistHistory = (nextHistory: TestRunRecord[]) => {
    setTestHistory(nextHistory);
    try {
      sessionStorage.setItem('travel-expense-admin-kanban:ai-test-history', JSON.stringify(nextHistory));
    } catch { /* ignore */ }
  };

  const loadMetrics = async () => {
    setLoadingMetrics(true);
    setError(null);
    try {
      const res = await fetchAiLatencyTrending(session, 30);
      setLatencyTrend(res.latencyTrend);
      setProviderComparison(res.providerComparison);
    } catch (err: any) {
      setError(err?.message || 'Failed to load telemetry metrics');
    } finally {
      setLoadingMetrics(false);
    }
  };

  useEffect(() => {
    void loadMetrics();
  }, []);

  const handleTestProvider = async (provider: string) => {
    setTestingProvider(provider);
    setError(null);
    try {
      const res = await testProvider(session, provider);
      const record: TestRunRecord = {
        id: crypto.randomUUID(),
        provider,
        testedAt: Date.now(),
        status: res.status?.status || (res.ok ? 'connected' : 'error'),
        message: res.status?.message || '',
      };
      persistHistory([record, ...testHistory]);
      alert(`Test completed for ${provider}: status is "${record.status}".`);
    } catch (err: any) {
      const record: TestRunRecord = {
        id: crypto.randomUUID(),
        provider,
        testedAt: Date.now(),
        status: 'error',
        message: err?.message || 'Test connection failed',
      };
      persistHistory([record, ...testHistory]);
      setError(`Failed testing ${provider}: ${record.message}`);
    } finally {
      setTestingProvider(null);
    }
  };

  const handleClearHistory = () => {
    persistHistory([]);
  };

  const providers = snapshot.llm || [];

  return (
    <section className="dashboard-content" style={{ flexDirection: 'column', gap: '20px', display: 'flex' }}>
      <h2>AI Provider & Integration Monitoring</h2>

      {error && <div className="error-box" style={{ background: 'rgba(235,87,87,0.1)', color: '#eb5757', padding: '12px', borderRadius: '4px' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        
        {/* Left column: Live Provider Health & Trigger */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ marginBottom: '12px' }}>Credential Broker Integrations ({providers.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {providers.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
                  <div>
                    <strong>{p.label}</strong> <span style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>({p.model})</span>
                    <div style={{ fontSize: '0.85em', marginTop: '2px' }}>
                      Status: <span style={{ fontWeight: 'bold' }}>{p.storedStatus}</span> · Errors (24h): {p.errors24h || 0}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span 
                      style={{ 
                        display: 'inline-block', 
                        width: '10px', 
                        height: '10px', 
                        borderRadius: '50%', 
                        background: p.status === 'healthy' ? '#27ae60' : p.status === 'warning' ? '#f2c94c' : '#eb5757' 
                      }} 
                    />
                    <button 
                      type="button" 
                      onClick={() => handleTestProvider(p.provider)}
                      disabled={testingProvider !== null}
                      className="primary-command"
                      style={{ padding: '4px 10px', fontSize: '0.85em' }}
                    >
                      {testingProvider === p.provider ? 'Testing...' : 'Test'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Test run history */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3>Local Test Session Logs</h3>
              {testHistory.length > 0 && (
                <button type="button" onClick={handleClearHistory} style={{ color: '#eb5757', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9em' }}>
                  Clear History
                </button>
              )}
            </div>
            <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {testHistory.map(h => (
                <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', borderBottom: '1px solid var(--border)', fontSize: '0.85em' }}>
                  <div>
                    <strong>{h.provider}</strong>
                    <div style={{ color: 'var(--text-muted)' }}>{new Date(h.testedAt).toLocaleTimeString()}</div>
                    {h.message && <div style={{ color: '#f2c94c', marginTop: '2px' }}>{h.message}</div>}
                  </div>
                  <span style={{ color: h.status === 'connected' || h.status === 'healthy' ? '#27ae60' : '#eb5757', fontWeight: 'bold' }}>
                    {h.status}
                  </span>
                </div>
              ))}
              {testHistory.length === 0 && (
                <p className="empty-text" style={{ padding: '12px 0' }}>No tests run in this session.</p>
              )}
            </div>
          </div>

        </div>

        {/* Right column: Analytics/Error & Latency Comparison */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3>Telemetry Performance (Last 30 Days)</h3>
            <button type="button" onClick={loadMetrics} disabled={loadingMetrics} className="ghost-command" style={{ padding: '4px 10px', fontSize: '0.85em' }}>
              {loadingMetrics ? 'Reloading...' : 'Reload Metrics'}
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9em' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '6px' }}>Provider</th>
                <th style={{ padding: '6px' }}>Model</th>
                <th style={{ padding: '6px' }}>Total Requests</th>
                <th style={{ padding: '6px' }}>Avg Latency</th>
                <th style={{ padding: '6px' }}>Error Rate</th>
              </tr>
            </thead>
            <tbody>
              {providerComparison.map((comp, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px', fontWeight: 'bold' }}>{comp.provider}</td>
                  <td style={{ padding: '6px' }}>{comp.model}</td>
                  <td style={{ padding: '6px' }}>{comp.totalRequests}</td>
                  <td style={{ padding: '6px' }}>{comp.avgLatencyMs ? `${comp.avgLatencyMs} ms` : '—'}</td>
                  <td style={{ padding: '6px', color: comp.errorRate > 0 ? '#eb5757' : 'inherit' }}>
                    {(comp.errorRate * 100).toFixed(2)}%
                  </td>
                </tr>
              ))}
              {providerComparison.length === 0 && !loadingMetrics && (
                <tr>
                  <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No performance metrics recorded.</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Sparkline daily latency summary */}
          {latencyTrend.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <h4 style={{ marginBottom: '8px' }}>Average Latency Trend (ms)</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.keys(latencyTrend[0] || {}).filter(k => k !== 'date').map(provider => {
                  const dataPoints = latencyTrend.map(d => d[provider] || 0);
                  const maxLat = Math.max(...dataPoints, 500);
                  // Render a simple SVG Sparkline
                  const w = 400;
                  const h = 40;
                  const pts = dataPoints.map((val, idx) => {
                    const x = (idx / (dataPoints.length - 1)) * w;
                    const y = h - (val / maxLat) * h;
                    return `${x},${y}`;
                  }).join(' ');

                  return (
                    <div key={provider} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ width: '80px', fontSize: '0.85em', fontWeight: 'bold' }}>{provider}</span>
                      <svg width={w} height={h} style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '4px', flex: 1 }}>
                        <polyline fill="none" stroke="#2f80ed" strokeWidth="1.5" points={pts} />
                      </svg>
                      <span style={{ fontSize: '0.8em', color: 'var(--text-muted)', width: '60px', textAlign: 'right' }}>
                        max: {maxLat}ms
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

      </div>
    </section>
  );
}
