import React, { useState } from 'react';
import type { AdminSession, AdminKanbanSnapshot, AdminTripCard } from '../lib/types';
import { amendTrip, manageTripMembers } from '../lib/adminApi';

interface TripManagementTabProps {
  session: AdminSession;
  snapshot: AdminKanbanSnapshot;
  onRefresh: () => void;
}

export function TripManagementTab({ session, snapshot, onRefresh }: TripManagementTabProps) {
  const [search, setSearch] = useState('');
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [editingTrip, setEditingTrip] = useState<AdminTripCard | null>(null);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trips = snapshot.trips || [];
  const users = snapshot.users || [];

  const filteredTrips = trips.filter(trip => 
    trip.name.toLowerCase().includes(search.toLowerCase()) ||
    trip.destination.toLowerCase().includes(search.toLowerCase()) ||
    trip.ownerEmail.toLowerCase().includes(search.toLowerCase())
  );

  const selectedTrip = trips.find(t => t.id === selectedTripId) || null;

  const handleAmendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrip) return;
    setLoading(true);
    setError(null);
    try {
      const budgetAmount = editingTrip.budgetAmount !== null ? Number(editingTrip.budgetAmount) : null;
      const [start_date, end_date] = editingTrip.dateRange ? editingTrip.dateRange.split(' - ') : ['', ''];
      
      await amendTrip(session, {
        tripId: editingTrip.id,
        name: editingTrip.name,
        destination_summary: editingTrip.destination,
        start_date: start_date || undefined,
        end_date: end_date || undefined,
        trip_currency: editingTrip.currency,
        budget_amount: budgetAmount,
        budget_currency: editingTrip.budgetCurrency,
        active: editingTrip.active,
        archived: editingTrip.archived
      });
      setEditingTrip(null);
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to update trip');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrip || !newMemberEmail) return;
    const targetUser = users.find(u => u.email.toLowerCase() === newMemberEmail.toLowerCase().trim());
    if (!targetUser) {
      setError('User not found in system');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await manageTripMembers(session, {
        tripId: selectedTrip.id,
        userId: targetUser.id,
        action: 'add'
      });
      setNewMemberEmail('');
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to add member');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedTrip) return;
    if (!confirm('Are you sure you want to remove this member from the trip?')) return;
    setLoading(true);
    setError(null);
    try {
      await manageTripMembers(session, {
        tripId: selectedTrip.id,
        userId,
        action: 'remove'
      });
      onRefresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to remove member');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="dashboard-content">
      <div className="dashboard-left">
        <div className="search-row" style={{ marginBottom: '1rem' }}>
          <input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="Search trips..." 
            className="search-input"
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
          />
        </div>
        <div className="users-list-container">
          <h2>All Trips ({filteredTrips.length})</h2>
          <div className="users-list">
            {filteredTrips.map(trip => (
              <button 
                key={trip.id} 
                className={`user-list-item ${selectedTripId === trip.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedTripId(trip.id);
                  setEditingTrip(null);
                  setError(null);
                }}
                type="button"
                style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', padding: '10px' }}
              >
                <span><strong>{trip.name}</strong></span>
                <span style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>{trip.destination} ({trip.ownerEmail})</span>
                <span style={{ fontSize: '0.85em', color: trip.active ? '#27ae60' : '#eb5757' }}>
                  {trip.active ? '● Active' : '○ Archived'}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="dashboard-right">
        {error && <div className="error-box" style={{ background: 'rgba(235,87,87,0.1)', color: '#eb5757', padding: '12px', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>}
        
        {editingTrip ? (
          <form onSubmit={handleAmendSubmit} className="editor-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h2>Edit Trip: {editingTrip.name}</h2>
            <div className="field-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label>Trip Name</label>
              <input 
                type="text" 
                value={editingTrip.name} 
                onChange={e => setEditingTrip({ ...editingTrip, name: e.target.value })} 
                required 
                style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
              />
            </div>
            <div className="field-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label>Destination</label>
              <input 
                type="text" 
                value={editingTrip.destination} 
                onChange={e => setEditingTrip({ ...editingTrip, destination: e.target.value })} 
                required 
                style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
              />
            </div>
            <div className="field-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label>Dates (Start - End)</label>
              <input 
                type="text" 
                value={editingTrip.dateRange} 
                onChange={e => setEditingTrip({ ...editingTrip, dateRange: e.target.value })} 
                placeholder="YYYY-MM-DD - YYYY-MM-DD"
                style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
              />
            </div>
            <div className="field-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label>Budget Amount</label>
              <input 
                type="number" 
                value={editingTrip.budgetAmount ?? ''} 
                onChange={e => setEditingTrip({ ...editingTrip, budgetAmount: e.target.value ? Number(e.target.value) : null })} 
                style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
              />
            </div>
            <div className="field-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label>Budget Currency</label>
              <input 
                type="text" 
                value={editingTrip.budgetCurrency ?? ''} 
                onChange={e => setEditingTrip({ ...editingTrip, budgetCurrency: e.target.value.toUpperCase() })} 
                placeholder="e.g. HKD, JPY"
                style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
              />
            </div>
            <div className="field-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label>Currency</label>
              <input 
                type="text" 
                value={editingTrip.currency} 
                onChange={e => setEditingTrip({ ...editingTrip, currency: e.target.value.toUpperCase() })} 
                required
                style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
              />
            </div>
            <div className="checkbox-group" style={{ margin: '8px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  type="checkbox" 
                  checked={editingTrip.active} 
                  onChange={e => setEditingTrip({ ...editingTrip, active: e.target.checked })} 
                />
                Active
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  type="checkbox" 
                  checked={editingTrip.archived} 
                  onChange={e => setEditingTrip({ ...editingTrip, archived: e.target.checked })} 
                />
                Archived
              </label>
            </div>
            <div className="command-row" style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button type="submit" disabled={loading} className="primary-command">Save Changes</button>
              <button type="button" onClick={() => setEditingTrip(null)} className="ghost-command">Cancel</button>
            </div>
          </form>
        ) : selectedTrip ? (
          <div className="details-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>{selectedTrip.name}</h2>
              <button type="button" onClick={() => setEditingTrip({ ...selectedTrip })} className="primary-command">Edit Trip</button>
            </div>
            <div className="detail-meta" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '6px' }}>
              <p><strong>Destination:</strong> {selectedTrip.destination}</p>
              <p><strong>Owner:</strong> {selectedTrip.ownerEmail}</p>
              <p><strong>Date Range:</strong> {selectedTrip.dateRange || 'None'}</p>
              <p><strong>Budget:</strong> {selectedTrip.budgetAmount != null ? `${selectedTrip.budgetAmount} ${selectedTrip.budgetCurrency || selectedTrip.currency}` : 'No Budget'}</p>
              <p><strong>Currency:</strong> {selectedTrip.currency}</p>
              <p><strong>Status:</strong> {selectedTrip.active ? 'Active' : 'Inactive'} / {selectedTrip.archived ? 'Archived' : 'Unarchived'}</p>
              <p><strong>Receipts:</strong> {selectedTrip.receiptCount} records</p>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <h3>Trip Members ({selectedTrip.members?.length || 0})</h3>
              
              <form onSubmit={handleAddMember} style={{ display: 'flex', gap: '8px', margin: '12px 0' }}>
                <select
                  value={newMemberEmail}
                  onChange={e => setNewMemberEmail(e.target.value)}
                  required
                  style={{ flex: 1, padding: '6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text)' }}
                >
                  <option value="">Select a user to add...</option>
                  {users
                    .filter(u => u.id !== selectedTrip.ownerId && !(selectedTrip.members || []).includes(u.id))
                    .map(u => (
                      <option key={u.id} value={u.email}>{u.email}</option>
                    ))}
                </select>
                <button type="submit" disabled={loading} className="primary-command">Add Member</button>
              </form>

              <div className="members-list" style={{ border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                {(selectedTrip.members || []).map(memberId => {
                  const memberUser = users.find(u => u.id === memberId);
                  return (
                    <div key={memberId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                      <span>{memberUser ? memberUser.email : memberId}</span>
                      <button 
                        type="button" 
                        onClick={() => handleRemoveMember(memberId)} 
                        disabled={loading}
                        style={{ color: '#eb5757', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
                {(!selectedTrip.members || selectedTrip.members.length === 0) && (
                  <p className="empty-text" style={{ padding: '12px', margin: 0 }}>No extra members added.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: 'var(--text-muted)' }}>
            <p>Select a trip from the left panel to inspect and manage details.</p>
          </div>
        )}
      </div>
    </section>
  );
}
