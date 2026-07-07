import { useState } from 'react';
import { Bug } from 'lucide-react';
import { fetchDataDoctor } from '../lib/adminApi';
import type { AdminSession } from '../lib/types';

export function DataDoctorTab({ session }: { session: AdminSession }) {
  const [issues, setIssues] = useState<any[]>([]);
  const [summary, setSummary] = useState<{ high: number; medium: number; low: number }>({ high: 0, medium: 0, low: 0 });
  const [loading, setLoading] = useState(false);

  async function runDoctor() {
    setLoading(true);
    try {
      const result = await fetchDataDoctor(session);
      setIssues(result.issues);
      setSummary(result.summary);
    } catch {
      setIssues([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ops-tab">
      <h3><Bug size={16} /> Data Doctor</h3>
      <button type="button" onClick={() => void runDoctor()} disabled={loading}>{loading ? 'Scanning...' : 'Run Data Doctor'}</button>
      {issues.length > 0 && (
        <>
          <div className="doctor-summary">
            <span className="badge-high">{summary.high} High</span>
            <span className="badge-medium">{summary.medium} Medium</span>
            <span className="badge-low">{summary.low} Low</span>
            <span>Total: {issues.length}</span>
          </div>
          <div className="ops-table">
            <div className="ops-row ops-header"><span>Severity</span><span>Category</span><span>Issue</span><span>Entity</span></div>
            {issues.slice(0, 100).map((issue, i) => (
              <div key={i} className={`ops-row severity-${issue.severity}`}>
                <span className={`badge-${issue.severity}`}>{issue.severity}</span>
                <span>{issue.category}</span>
                <span>{issue.message}</span>
                <span className="ops-entity">{issue.entityId ? issue.entityId.slice(0, 8) : '—'}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {issues.length === 0 && !loading && <p className="empty-text">Click "Run Data Doctor" to scan for issues.</p>}
    </div>
  );
}
