import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { fetchReceiptPhoto } from '../lib/adminApi';
import type { AdminSession, AdminReceiptCard, AdminKanbanSnapshot } from '../lib/types';
import { fmtDate } from '../lib/utils';

export function ReceiptDetailModal({
  receipt,
  snapshot,
  session,
  onClose,
  onAmend,
}: {
  receipt: AdminReceiptCard;
  snapshot: AdminKanbanSnapshot;
  session: AdminSession;
  onClose: () => void;
  onAmend: () => void;
}) {
  const trip = snapshot.trips.find(t => t.id === receipt.tripId);
  const owner = snapshot.users.find(u => u.id === receipt.ownerId);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);

  useEffect(() => {
    if (!receipt.photoPath) return;
    setPhotoLoading(true);
    fetchReceiptPhoto(session, receipt.id)
      .then(({ url }) => setPhotoUrl(url))
      .catch(() => setPhotoUrl(null))
      .finally(() => setPhotoLoading(false));
  }, [receipt.id, receipt.photoPath, session]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="detail-modal" onClick={e => e.stopPropagation()}>
        <h3>Receipt Details</h3>
        {photoLoading && <div className="loading-indicator">Loading photo...</div>}
        <div className="detail-grid">
          <div className="detail-field">
            <label>Store</label>
            <span>{receipt.store}</span>
          </div>
          <div className="detail-field">
            <label>Amount</label>
            <span>{receipt.amount.toLocaleString()} {receipt.currency}</span>
          </div>
          <div className="detail-field">
            <label>Currency</label>
            <span>{receipt.currency}</span>
          </div>
          <div className="detail-field">
            <label>Date</label>
            <span>{receipt.recordDate}</span>
          </div>
          <div className="detail-field">
            <label>Status</label>
            <span>{receipt.status}</span>
          </div>
          <div className="detail-field">
            <label>Category</label>
            <span>{receipt.category || 'N/A'}</span>
          </div>
          <div className="detail-field">
            <label>Trip</label>
            <span>{trip?.name || receipt.tripId}</span>
          </div>
          <div className="detail-field">
            <label>Owner</label>
            <span>{owner?.email || receipt.ownerId}</span>
          </div>
          <div className="detail-field">
            <label>Notion Synced</label>
            <span>{receipt.notionSynced ? 'Yes' : 'No'}</span>
          </div>
          <div className="detail-field">
            <label>Updated At</label>
            <span>{fmtDate(receipt.updatedAt)}</span>
          </div>
          {photoUrl && (
            <div className="detail-field full-width">
              <label>Photo</label>
              <img src={photoUrl} alt="Receipt" className="receipt-photo-preview" />
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="primary-command" type="button" onClick={onAmend}><Pencil size={14} /> Amend</button>
          <button className="ghost-command" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
