import { useState, useEffect } from 'react';
import { Wrench } from 'lucide-react';
import { fetchSyncJobs, previewAction, commitAction } from '../lib/adminApi';
import type { AdminSession } from '../lib/types';
import { fmtDate } from '../lib/utils';

export function SyncOpsTab({ session }: { session: AdminSession }) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionResult, setActionResult] = useState('');

  async function loadJobs() {
    setLoading(true);
    try {
      setJobs(await fetchSyncJobs(session, { status: statusFilter || undefined, limit: 100 }));
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(jobId: string, action: string) {
    try {
      const preview = await previewAction(session, {
        action: `${action}_sync_job`,
        targetType: 'sync_job',
        targetId: jobId,
        payload: { jobId },
        reason: `Admin ${action}`,
      });
      const result = await commitAction(session, preview.id);
      setActionResult(`${action} succeeded: ${JSON.stringify(result.result || {})}`);
      void loadJobs();
    } catch (err) {
      setActionResult(`${action} failed: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  useEffect(() => {
    void loadJobs();
  }, [statusFilter]);

  return (
    <div className="ops-tab">
      <h3><Wrench size={16} /> Sync Operations</h3>
      <div className="ops-filters">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
        </select>
        <button type="button" onClick={() => void loadJobs()} disabled={loading}>{loading ? '...' : 'Refresh'}</button>
      </div>
      {actionResult && <p className="status-line">{actionResult}</p>}
      <div className="ops-table">
        <div className="ops-row ops-header"><span>Provider</span><span>Status</span><span>Attempts</span><span>Error</span><span>Updated</span><span>Actions</span></div>
        {jobs.map(job => (
          <div key={job.id} className={`ops-row status-${job.status}`}>
            <span>{job.provider}</span>
            <span className={`badge-${job.status}`}>{job.status}</span>
            <span>{job.attempts ?? 0}</span>
            <span className="ops-error" title={job.last_error}>{job.last_error ? job.last_error.slice(0, 50) : '—'}</span>
            <span>{fmtDate(job.updated_at)}</span>
            <span className="ops-actions">
              {job.status === 'failed' && <button type="button" onClick={() => void handleAction(job.id, 'retry')}>Retry</button>}
              {(job.status === 'pending' || job.status === 'processing') && <button type="button" onClick={() => void handleAction(job.id, 'cancel')}>Cancel</button>}
            </span>
          </div>
        ))}
        {jobs.length === 0 && <p className="empty-text">No sync jobs found.</p>}
      </div>
    </div>
  );
}
