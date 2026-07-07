import React, { useState, useEffect } from 'react';
import type { AdminSession } from '../lib/types';
import { fetchAuditEvents } from '../lib/adminApi';

interface AuditTrailTabProps {
  session: AdminSession;
}

export function AuditTrailTab({ session }: AuditTrailTabProps) {
  const [events, setEvents] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  
  // Filters
  const [actionType, setActionType] = useState('');
  const [targetType, setTargetType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAuditEvents(session, {
        page,
        limit,
        actionType: actionType || undefined,
        targetType: targetType || undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate + 'T23:59:59').toISOString() : undefined,
      });
      setEvents(res.events);
      setTotal(res.total);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch audit events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEvents();
  }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    void loadEvents();
  };

  const handleReset = () => {
    setActionType('');
    setTargetType('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit) || 1;

  const fmtDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  return (
    <section className="dashboard-content" style={{ flexDirection: 'column', gap: '16px', display: 'flex' }}>
      <form onSubmit={handleSearch} style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '6px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '150px' }}>
          <label style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>Action Type</label>
          <input 
            type="text" 
            value={actionType} 
            onChange={e => setActionType(e.target.value)} 
            placeholder="e.g. amend_receipt" 
            style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '150px' }}>
          <label style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>Target Type</label>
          <input 
            type="text" 
            value={targetType} 
            onChange={e => setTargetType(e.target.value)} 
            placeholder="e.g. receipt" 
            style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '150px' }}>
          <label style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>Start Date</label>
          <input 
            type="date" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)} 
            style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '150px' }}>
          <label style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>End Date</label>
          <input 
            type="date" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)} 
            style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
          <button type="submit" className="primary-command">Filter</button>
          <button type="button" onClick={handleReset} className="ghost-command">Reset</button>
        </div>
      </form>

      {error && <div className="error-box" style={{ background: 'rgba(235,87,87,0.1)', color: '#eb5757', padding: '12px', borderRadius: '4px' }}>{error}</div>}

      <div className="ops-table-container" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3>Audit Log Records (Total: {total})</h3>
          {loading && <span style={{ color: 'var(--text-muted)', fontSize: '0.9em' }}>Loading...</span>}
        </div>
        
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '8px' }}>Timestamp</th>
              <th style={{ padding: '8px' }}>Admin Subject Hash</th>
              <th style={{ padding: '8px' }}>Action</th>
              <th style={{ padding: '8px' }}>Target Type</th>
              <th style={{ padding: '8px' }}>Target ID Hash</th>
              <th style={{ padding: '8px' }}>Result / Metadata</th>
            </tr>
          </thead>
          <tbody>
            {events.map((evt) => (
              <tr key={evt.id} style={{ borderBottom: '1px solid var(--border)', fontSize: '0.9em' }}>
                <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{fmtDate(evt.created_at)}</td>
                <td style={{ padding: '8px', fontFamily: 'monospace' }} title={evt.admin_subject_hash}>{evt.admin_subject_hash?.slice(0, 8)}...</td>
                <td style={{ padding: '8px' }}>
                  <span style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.95em' }}>
                    {evt.action}
                  </span>
                </td>
                <td style={{ padding: '8px' }}>{evt.target_type}</td>
                <td style={{ padding: '8px', fontFamily: 'monospace' }} title={evt.target_id_hash}>{evt.target_id_hash ? `${evt.target_id_hash.slice(0, 8)}...` : '—'}</td>
                <td style={{ padding: '8px', fontSize: '0.85em', color: 'var(--text-muted)' }}>
                  {evt.result ? JSON.stringify(evt.result) : '—'}
                </td>
              </tr>
            ))}
            {events.length === 0 && !loading && (
              <tr>
                <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No audit events found.</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
          <button 
            type="button" 
            disabled={page === 1 || loading} 
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="ghost-command"
          >
            &larr; Previous
          </button>
          <span>Page {page} of {totalPages}</span>
          <button 
            type="button" 
            disabled={page === totalPages || loading} 
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            className="ghost-command"
          >
            Next &rarr;
          </button>
        </div>
      </div>
    </section>
  );
}
