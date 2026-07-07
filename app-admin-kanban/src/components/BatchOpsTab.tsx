import React, { useState } from 'react';
import type { AdminSession, AdminKanbanSnapshot } from '../lib/types';
import { batchActionReceipts } from '../lib/adminApi';

interface BatchOpsTabProps {
  session: AdminSession;
  snapshot: AdminKanbanSnapshot;
  onRefresh: () => void;
}

export function BatchOpsTab({ session, snapshot, onRefresh }: BatchOpsTabProps) {
  const [selectedUserFilter, setSelectedUserFilter] = useState('');
  const [selectedTripFilter, setSelectedTripFilter] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const receipts = snapshot.receipts || [];
  const users = snapshot.users || [];
  const trips = snapshot.trips || [];

  // Filter receipts
  const filteredReceipts = receipts.filter(r => {
    if (selectedUserFilter && r.ownerId !== selectedUserFilter) return false;
    if (selectedTripFilter && r.tripId !== selectedTripFilter) return false;
    if (selectedStatusFilter && r.status !== selectedStatusFilter) return false;
    return true;
  });

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredReceipts.map(r => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setSelectedIds(next);
  };

  const handleBatchStatusUpdate = async (status: string) => {
    if (selectedIds.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const { affectedCount } = await batchActionReceipts(session, {
        receiptIds: Array.from(selectedIds),
        action: 'update_status',
        status
      });
      setSelectedIds(new Set());
      onRefresh();
      alert(`Successfully updated status to "${status}" for ${affectedCount} receipts.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to update status');
    } finally {
      setLoading(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    const confirmed = confirm(
      `🚨 WARNING: Are you sure you want to soft-delete ${selectedIds.size} receipts?\nThis will set their deleted_at timestamp and hide them from the app.`
    );
    if (!confirmed) return;
    
    setLoading(true);
    setError(null);
    try {
      const { affectedCount } = await batchActionReceipts(session, {
        receiptIds: Array.from(selectedIds),
        action: 'delete'
      });
      setSelectedIds(new Set());
      onRefresh();
      alert(`Successfully soft-deleted ${affectedCount} receipts.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete receipts');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = () => {
    // Export either selected receipts (if any) or currently filtered receipts
    const targetReceipts = selectedIds.size > 0 
      ? receipts.filter(r => selectedIds.has(r.id))
      : filteredReceipts;

    if (targetReceipts.length === 0) {
      alert('No receipts to export.');
      return;
    }

    const headers = [
      'ID', 'Trip ID', 'Owner ID', 'Store', 'Status', 'Amount', 'Currency', 
      'Record Date', 'Record Time', 'Category', 'Payment Method', 'Note', 
      'Original Amount', 'Original Currency', 'Exchange Rate', 'Home Amount'
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = targetReceipts.map(r => [
      r.id, r.tripId, r.ownerId, r.store, r.status, r.amount, r.currency,
      r.recordDate, r.recordTime || '', r.category || '', r.payment || '', r.note || '',
      r.originalAmount || '', r.originalCurrency || '', r.exchangeRate || '', r.homeAmount || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(escapeCsv).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `receipts_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <section className="dashboard-content" style={{ flexDirection: 'column', gap: '16px', display: 'flex' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '6px', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '160px' }}>
            <label style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>User (Owner)</label>
            <select
              value={selectedUserFilter}
              onChange={e => { setSelectedUserFilter(e.target.value); setSelectedIds(new Set()); }}
              style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
            >
              <option value="">All Users</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.email}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '160px' }}>
            <label style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>Trip</label>
            <select
              value={selectedTripFilter}
              onChange={e => { setSelectedTripFilter(e.target.value); setSelectedIds(new Set()); }}
              style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
            >
              <option value="">All Trips</option>
              {trips.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.destination})</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '120px' }}>
            <label style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>Status</label>
            <select
              value={selectedStatusFilter}
              onChange={e => { setSelectedStatusFilter(e.target.value); setSelectedIds(new Set()); }}
              style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
            </select>
          </div>
        </div>

        {/* Bulk Action Controls */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
          <button 
            type="button" 
            onClick={() => handleBatchStatusUpdate('confirmed')}
            disabled={selectedIds.size === 0 || loading} 
            className="primary-command"
            style={{ padding: '6px 12px', fontSize: '0.9em' }}
          >
            Confirm Selected ({selectedIds.size})
          </button>
          <button 
            type="button" 
            onClick={() => handleBatchStatusUpdate('pending')}
            disabled={selectedIds.size === 0 || loading} 
            className="ghost-command"
            style={{ padding: '6px 12px', fontSize: '0.9em' }}
          >
            Mark Pending
          </button>
          <button 
            type="button" 
            onClick={handleBatchDelete}
            disabled={selectedIds.size === 0 || loading} 
            className="primary-command"
            style={{ padding: '6px 12px', fontSize: '0.9em', background: '#eb5757' }}
          >
            Delete Selected
          </button>
          <button 
            type="button" 
            onClick={handleExportCsv}
            className="ghost-command"
            style={{ padding: '6px 12px', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            Export {selectedIds.size > 0 ? `Selected (${selectedIds.size})` : `Filtered (${filteredReceipts.length})`} CSV
          </button>
        </div>
      </div>

      {error && <div className="error-box" style={{ background: 'rgba(235,87,87,0.1)', color: '#eb5757', padding: '12px', borderRadius: '4px' }}>{error}</div>}

      <div className="ops-table-container" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '8px', width: '40px' }}>
                <input 
                  type="checkbox" 
                  checked={filteredReceipts.length > 0 && selectedIds.size === filteredReceipts.length}
                  onChange={handleSelectAll} 
                />
              </th>
              <th style={{ padding: '8px' }}>Store</th>
              <th style={{ padding: '8px' }}>Amount</th>
              <th style={{ padding: '8px' }}>Currency</th>
              <th style={{ padding: '8px' }}>Status</th>
              <th style={{ padding: '8px' }}>Category</th>
              <th style={{ padding: '8px' }}>Payment</th>
              <th style={{ padding: '8px' }}>Date</th>
              <th style={{ padding: '8px' }}>Owner</th>
              <th style={{ padding: '8px' }}>Trip</th>
            </tr>
          </thead>
          <tbody>
            {filteredReceipts.map(r => {
              const ownerUser = users.find(u => u.id === r.ownerId);
              const tripObj = trips.find(t => t.id === r.tripId);
              return (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border)', fontSize: '0.9em' }}>
                  <td style={{ padding: '8px' }}>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.has(r.id)} 
                      onChange={e => handleSelectRow(r.id, e.target.checked)} 
                    />
                  </td>
                  <td style={{ padding: '8px', fontWeight: 'bold' }}>{r.store}</td>
                  <td style={{ padding: '8px' }}>{r.amount}</td>
                  <td style={{ padding: '8px' }}>{r.currency}</td>
                  <td style={{ padding: '8px' }}>
                    <span className={`status-badge status-${r.status}`} style={{ fontSize: '0.85em', padding: '2px 6px', borderRadius: '4px' }}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ padding: '8px' }}>{r.category || '—'}</td>
                  <td style={{ padding: '8px' }}>{r.payment || '—'}</td>
                  <td style={{ padding: '8px' }}>{r.recordDate} {r.recordTime ? ` ${r.recordTime.slice(0, 5)}` : ''}</td>
                  <td style={{ padding: '8px', fontSize: '0.85em' }} title={r.ownerId}>{ownerUser ? ownerUser.email : '—'}</td>
                  <td style={{ padding: '8px', fontSize: '0.85em' }} title={r.tripId}>{tripObj ? tripObj.name : '—'}</td>
                </tr>
              );
            })}
            {filteredReceipts.length === 0 && (
              <tr>
                <td colSpan={10} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>No receipts matching current filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
