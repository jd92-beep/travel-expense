import { useState } from 'react';
import { Database, Bot, ChevronDown, Clock, CheckCircle, XCircle, Cloud } from 'lucide-react';
import { testProvider } from '../lib/adminApi';
import type { AdminKanbanSnapshot, AdminSession, AdminProviderHealth, HealthState } from '../lib/types';
import { Metric } from './Metric';
import { fmtDate, classForHealth } from '../lib/utils';

const statusText: Record<HealthState, string> = {
  healthy: 'Healthy',
  warning: 'Watch',
  danger: 'Danger',
  unknown: 'Unknown',
};

export function UniversalHealth({ snapshot, session }: { snapshot: AdminKanbanSnapshot; session: AdminSession }) {
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message?: string }>>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [llmExpanded, setLlmExpanded] = useState(true);

  const providerGroups = new Map<string, AdminProviderHealth[]>();
  for (const row of snapshot.llm) {
    const key = row.provider;
    if (!providerGroups.has(key)) providerGroups.set(key, []);
    providerGroups.get(key)!.push(row);
  }

  async function handleProviderTest(providerKey: string) {
    setTestingProvider(providerKey);
    try {
      const result = await testProvider(session, providerKey);
      setTestResults(prev => ({ ...prev, [providerKey]: { ok: result.ok, message: result.status?.message } }));
    } catch (err) {
      setTestResults(prev => ({ ...prev, [providerKey]: { ok: false, message: err instanceof Error ? err.message : 'Test failed' } }));
    } finally {
      setTestingProvider(null);
    }
  }

  return (
    <div className="universal-health">
      <h2>Universal App Health</h2>
      <div className="health-grid">
        <div className="health-card">
          <h3><Database size={16} /> Database & Backend</h3>
          <Metric label="Supabase Status" value={snapshot.supabase.status === 'healthy' ? 'ACTIVE_HEALTHY' : snapshot.supabase.status === 'warning' ? 'DEGRADED' : 'DANGER'} status={snapshot.supabase.status} />
          <Metric label="RLS Force Enabled" value={snapshot.supabase.rls.length === 0 ? 'Unavailable' : snapshot.supabase.rls.every((row) => row.enabled && row.force) ? 'Yes' : 'No'} status={snapshot.supabase.rls.length === 0 ? 'danger' : snapshot.supabase.rls.every((row) => row.enabled && row.force) ? 'healthy' : 'warning'} />
          <Metric label="Total Users" value={snapshot.supabase.countHealth?.authUsers === 'error' ? 'Unknown' : snapshot.supabase.counts.authUsers} status={snapshot.supabase.countHealth?.authUsers === 'error' ? 'warning' : undefined} />
          <Metric label="Events (Range)" value={snapshot.supabase.countHealth?.usageEvents === 'error' ? 'Unknown' : snapshot.usage.events} status={snapshot.supabase.countHealth?.usageEvents === 'error' ? 'warning' : undefined} />
        </div>
        
        <div className="health-card">
          <h3 className="collapsible" onClick={() => setLlmExpanded(!llmExpanded)}>
            <Bot size={16} /> LLM Providers
            <ChevronDown size={14} className={`chevron ${llmExpanded ? '' : 'collapsed'}`} />
          </h3>
          {llmExpanded && (
            <div className="llm-list">
              {[...providerGroups.entries()].map(([providerKey, rows]) => {
                const firstRow = rows[0];
                return (
                  <div key={providerKey} className="llm-item llm-item-expanded">
                    <div className="llm-item-main">
                      <div className="llm-item-header">
                        <span className="llm-provider-label">{firstRow.label}</span>
                        <span className={classForHealth(firstRow.status)}>{statusText[firstRow.status]}</span>
                      </div>
                      <div className="llm-item-details">
                        {rows.map((row, ri) => (
                          <span key={ri} className="llm-model-chip">
                            {row.modelName || row.model}
                            {row.latencyMs != null && <small> {row.latencyMs}ms</small>}
                          </span>
                        ))}
                        {firstRow.lastTestedAt && <small><Clock size={11} /> {fmtDate(firstRow.lastTestedAt)}</small>}
                        {typeof firstRow.errors24h === 'number' && firstRow.errors24h > 0 && (
                          <small className="llm-errors-badge">{firstRow.errors24h} errors/24h</small>
                        )}
                        {firstRow.message && <small className="llm-message">{firstRow.message}</small>}
                      </div>
                      {testResults[providerKey] && (
                        <div className={`llm-test-result ${testResults[providerKey].ok ? 'test-ok' : 'test-fail'}`}>
                          {testResults[providerKey].ok ? <CheckCircle size={13} /> : <XCircle size={13} />}
                          <span>{testResults[providerKey].ok ? 'OK' : testResults[providerKey].message}</span>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="test-provider-btn"
                      disabled={testingProvider === providerKey}
                      onClick={() => void handleProviderTest(providerKey)}
                      title={`Test ${firstRow.label} credential`}
                    >
                      {testingProvider === providerKey ? '...' : 'Test'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="health-card">
          <h3><Cloud size={16} /> Notion Integration</h3>
          {(() => {
            const broker = snapshot.llm.find((row) => row.provider === 'notion');
            const mirrorOk = broker?.storedStatus === 'connected' || broker?.status === 'healthy';
            return <Metric label="Mirror (Broker)" value={mirrorOk ? 'Connected' : broker?.storedStatus || 'Unknown'} status={mirrorOk ? 'healthy' : 'danger'} />;
          })()}
          <Metric label="Personal OAuth Users" value={snapshot.notion.connectedUsers} />
          <Metric label="Synced Receipts" value={snapshot.notion.syncedReceipts} />
          <Metric label="Pending Jobs" value={snapshot.notion.pendingJobs} status={snapshot.notion.pendingJobs ? 'warning' : 'healthy'} />
          <Metric label="Failed Jobs" value={snapshot.notion.failedJobs} status={snapshot.notion.failedJobs ? 'danger' : 'healthy'} />
        </div>
      </div>
    </div>
  );
}
