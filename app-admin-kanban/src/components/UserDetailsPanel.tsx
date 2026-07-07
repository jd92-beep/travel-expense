import { useState } from 'react';
import { UserRound, Globe, Wallet, Clock, Plane, Receipt, Image as ImageIcon, Calendar, MapPin, Pencil } from 'lucide-react';
import { fetchReceiptPhoto } from '../lib/adminApi';
import type { AdminSession, AdminUserCard, AdminKanbanSnapshot, AdminReceiptCard } from '../lib/types';
import { Metric } from './Metric';
import { DeletePanel } from './DeletePanel';
import { QuickAmendModal } from './QuickAmendModal';
import { ImageViewerModal } from './ImageViewerModal';
import { ReceiptDetailModal } from './ReceiptDetailModal';
import { fmtDate, classForHealth } from '../lib/utils';

export function UserDetailsPanel({
  user,
  snapshot,
  session,
  onRefresh,
}: {
  user: AdminUserCard;
  snapshot: AdminKanbanSnapshot;
  session: AdminSession;
  onRefresh: () => void;
}) {
  const userTrips = snapshot.trips.filter(t => t.ownerId === user.id);
  const userReceipts = snapshot.receipts.filter(r => r.ownerId === user.id);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [amendReceiptItem, setAmendReceiptItem] = useState<AdminReceiptCard | null>(null);
  const [viewImageUrl, setViewImageUrl] = useState<string | null>(null);
  const [expandedItinerary, setExpandedItinerary] = useState<string | null>(null);
  const [detailReceipt, setDetailReceipt] = useState<AdminReceiptCard | null>(null);
  const [photoError, setPhotoError] = useState('');

  const filteredReceipts = selectedTripId ? userReceipts.filter(r => r.tripId === selectedTripId) : userReceipts;

  const receiptsByDate = new Map<string, AdminReceiptCard[]>();
  for (const receipt of filteredReceipts) {
    const key = receipt.recordDate || 'Unknown date';
    if (!receiptsByDate.has(key)) receiptsByDate.set(key, []);
    receiptsByDate.get(key)!.push(receipt);
  }
  const dateGroups = [...receiptsByDate.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  for (const [, group] of dateGroups) {
    group.sort((a, b) => String(b.recordTime || '').localeCompare(String(a.recordTime || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }

  function dayLabel(date: string): string {
    const parsed = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return date;
    const weekday = parsed.toLocaleDateString('zh-HK', { weekday: 'short' });
    return `${date} (${weekday})`;
  }

  function dayTotals(group: AdminReceiptCard[]): string {
    const byCurrency = new Map<string, number>();
    for (const receipt of group) {
      byCurrency.set(receipt.currency, (byCurrency.get(receipt.currency) || 0) + receipt.amount);
    }
    return [...byCurrency.entries()].map(([currency, total]) => `${total.toLocaleString()} ${currency}`).join(' + ');
  }

  async function viewPhoto(receipt: AdminReceiptCard) {
    setPhotoError('');
    try {
      const { url } = await fetchReceiptPhoto(session, receipt.id);
      setViewImageUrl(url);
    } catch (err) {
      setViewImageUrl(null);
      setPhotoError(`相片載入失敗 (${receipt.store}): ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  const statusText: Record<string, string> = {
    healthy: 'Healthy',
    warning: 'Watch',
    danger: 'Danger',
    unknown: 'Unknown',
  };

  return (
    <div className="user-details-panel">
      <div className="panel-header">
        <h2>
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="user-avatar" /> : <UserRound size={20} />}
          {user.displayName ? <span>{user.displayName} <small>({user.email})</small></span> : user.email}
        </h2>
        <span className="last-seen">Last seen: {fmtDate(user.lastSeenAt)}</span>
      </div>

      <div className="user-profile-fields">
        {user.locale && <span><Globe size={13} /> {user.locale}</span>}
        {user.homeCurrency && <span><Wallet size={13} /> {user.homeCurrency}</span>}
        {user.createdAt && <span><Clock size={13} /> Joined {fmtDate(user.createdAt)}</span>}
      </div>

      <div className="user-stats-grid">
        <div className="stat-box">
          <Plane size={24} />
          <strong>{user.tripCount}</strong>
          <span>Trips</span>
        </div>
        <div className="stat-box">
          <Receipt size={24} />
          <strong>{user.receiptCount}</strong>
          <span>Receipts</span>
        </div>
        <div className="stat-box">
          <ImageIcon size={24} />
          <strong>{user.imageCount || 0}</strong>
          <span>Images</span>
        </div>
      </div>

      <div className="user-lists">
        <div className="list-section">
          <h3>Trips ({userTrips.length})</h3>
          {userTrips.length > 0 ? (
            <div className="card-list">
              {userTrips.map(trip => (
                <div
                  key={trip.id}
                  className={`detail-card trip-card ${selectedTripId === trip.id ? 'trip-selected' : ''}`}
                  onClick={() => setSelectedTripId(selectedTripId === trip.id ? null : trip.id)}
                >
                  <strong>{trip.name}</strong>
                  <small>{trip.destination} · {trip.dateRange}</small>
                  <span>{trip.receiptCount} receipts · {trip.currency}</span>
                  {trip.budgetAmount != null && (
                    <small className="trip-budget"><Wallet size={11} /> Budget: {trip.budgetAmount.toLocaleString()} {trip.budgetCurrency || trip.currency}</small>
                  )}
                  {trip.memberCount > 0 && <small> · {trip.memberCount} member{trip.memberCount !== 1 ? 's' : ''}</small>}
                  {trip.timezones && trip.timezones.length > 0 && <small> · {trip.timezones.join(', ')}</small>}
                  {trip.itinerary && trip.itinerary.length > 0 && (
                    <div className="itinerary-summary">
                      <button
                        type="button"
                        className="itinerary-toggle"
                        onClick={(e) => { e.stopPropagation(); setExpandedItinerary(expandedItinerary === trip.id ? null : trip.id); }}
                      >
                        <Calendar size={11} /> {trip.itinerary.length} day{trip.itinerary.length !== 1 ? 's' : ''} · {trip.itinerary.reduce((sum: number, d: any) => sum + (d?.spots?.length || 0), 0)} spots
                      </button>
                      {expandedItinerary === trip.id && (
                        <div className="itinerary-viewer">
                          {trip.itinerary.map((day: any, idx: number) => (
                            <div key={idx} className="itinerary-day">
                              <strong>Day {day.day || idx + 1}</strong>
                              {day.spots && day.spots.length > 0 ? (
                                <ul>
                                  {day.spots.map((spot: any, si: number) => (
                                    <li key={si}>
                                      <MapPin size={10} />
                                      <span>{spot.name || spot.title || `Spot ${si + 1}`}</span>
                                      {spot.time && <small>{spot.time}</small>}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <small>No spots</small>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-text">No trips found.</p>
          )}
        </div>

        <div className="list-section">
          <h3>
            Receipts ({filteredReceipts.length})
            {selectedTripId && (
              <button type="button" className="show-all-btn" onClick={() => setSelectedTripId(null)}>Show All</button>
            )}
          </h3>
          {photoError && <p className="error-line" role="alert">{photoError}</p>}
          {filteredReceipts.length > 0 ? (
            <div className="card-list receipts-by-date">
              {dateGroups.map(([date, group]) => (
                <div key={date} className="receipt-date-group">
                  <div className="receipt-date-header">
                    <Calendar size={12} />
                    <strong>{dayLabel(date)}</strong>
                    <span>{group.length} 筆 · {dayTotals(group)}</span>
                  </div>
                  {group.map(receipt => (
                    <div key={receipt.id} className="detail-card" style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setDetailReceipt(receipt)}>
                      <strong>{receipt.store}</strong>
                      <small>
                        {receipt.recordTime ? `${String(receipt.recordTime).slice(0, 5)} · ` : ''}
                        {receipt.status}
                        {receipt.payment ? ` · ${receipt.payment}` : ''}
                      </small>
                      <span>{receipt.amount.toLocaleString()} {receipt.currency}</span>
                      {receipt.category && <small className="receipt-category">#{receipt.category}</small>}
                      {receipt.note && <small className="receipt-note">{receipt.note.slice(0, 60)}</small>}
                      {receipt.notionSynced ? (
                        <span className="sync-status synced">Notion Synced</span>
                      ) : user.notionConnected ? (
                        <span className="sync-status pending">Notion Pending</span>
                      ) : null}
                      <div className="detail-actions">
                        {receipt.photoPath ? (
                          <button type="button" onClick={(e) => { e.stopPropagation(); void viewPhoto(receipt); }} title="View Photo" className="icon-btn has-photo"><ImageIcon size={14} /></button>
                        ) : (
                          <button type="button" disabled onClick={(e) => e.stopPropagation()} title="無相片" className="icon-btn no-photo"><ImageIcon size={14} /></button>
                        )}
                        <button type="button" onClick={(e) => { e.stopPropagation(); setAmendReceiptItem(receipt); }} title="Amend" className="icon-btn"><Pencil size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-text">No receipts found.</p>
          )}
        </div>
      </div>

      <div className="connection-status">
        <h3>Connection Status</h3>
        <Metric label="Supabase Health" value={statusText[user.health] || user.health} status={user.health} />
        <Metric label="Supabase Connected" value={user.supabaseConnected ? 'Yes' : 'No'} status={user.supabaseConnected ? 'healthy' : 'warning'} />
        <Metric label="Notion Integration" value={user.notionConnected ? 'Connected' : 'Not Connected'} status={user.notionConnected ? 'healthy' : 'warning'} />
        <Metric label="Notion Status" value={user.notionStatusLabel || user.notionStatus || 'N/A'} />
        {user.notionLastSyncedAt && <Metric label="Notion Last Sync" value={fmtDate(user.notionLastSyncedAt)} />}
        <Metric label="Last Sync" value={fmtDate(user.lastSyncAt)} />
        <Metric label="Sync Jobs" value={user.syncJobCount} />
        <Metric label="Failed Sync Jobs" value={user.failedSyncJobs} status={user.failedSyncJobs > 0 ? 'danger' : 'healthy'} />
        <Metric label="AI Requests (Today)" value={user.aiRequestsToday} />
      </div>

      <DeletePanel session={session} user={user} onDone={onRefresh} />

      {amendReceiptItem && (
        <QuickAmendModal session={session} receipt={amendReceiptItem} onClose={() => setAmendReceiptItem(null)} onRefresh={onRefresh} />
      )}
      {viewImageUrl && (
        <ImageViewerModal url={viewImageUrl} onClose={() => setViewImageUrl(null)} />
      )}
      {detailReceipt && (
        <ReceiptDetailModal
          receipt={detailReceipt}
          snapshot={snapshot}
          session={session}
          onClose={() => setDetailReceipt(null)}
          onAmend={() => { setAmendReceiptItem(detailReceipt); setDetailReceipt(null); }}
        />
      )}
    </div>
  );
}
