import { useState, useEffect } from 'react';
import { AlertTriangle, Eye, Trash2 } from 'lucide-react';
import { previewDeleteUser, confirmDeleteUser } from '../lib/adminApi';
import type { AdminSession, AdminUserCard, DeletePreview } from '../lib/types';

export function DeletePanel({
  session,
  user,
  onDone,
}: {
  session: AdminSession;
  user: AdminUserCard;
  onDone: () => void;
}) {
  const [preview, setPreview] = useState<DeletePreview | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [adminPassphrase, setAdminPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setPreview(null);
    setConfirmPhrase('');
    setAdminPassphrase('');
    setStatus('');
  }, [user.id]);

  async function loadPreview() {
    setBusy(true);
    setStatus('');
    try {
      setPreview(await previewDeleteUser(session, user.id));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Delete preview failed');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!preview) return;
    setBusy(true);
    setStatus('');
    try {
      const result = await confirmDeleteUser(session, preview.userId, confirmPhrase, adminPassphrase);
      setStatus(result.deleted ? 'User delete completed and verified.' : 'Delete request returned incomplete result.');
      setPreview(null);
      setConfirmPhrase('');
      setAdminPassphrase('');
      onDone();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="danger-panel" aria-label="Admin delete controls">
      <div className="danger-head">
        <AlertTriangle size={18} />
        <span>Delete requires preview + confirm</span>
      </div>
      <p>Selected user: <strong>{user.email}</strong></p>
      <button className="danger-command" type="button" disabled={busy} onClick={() => void loadPreview()}>
        <Eye size={15} /> Preview delete scope
      </button>
      {preview && (
        <div className="delete-preview">
          <strong>Delete preview</strong>
          <div className="count-grid">
            {Object.entries(preview.counts).map(([key, value]) => (
              <span key={key}><b>{value}</b>{key}</span>
            ))}
          </div>
          <label>
            Confirm phrase
            <input value={confirmPhrase} onChange={(event) => setConfirmPhrase(event.target.value)} placeholder={preview.confirmPhrase} />
          </label>
          <label>
            Admin re-auth
            <input value={adminPassphrase} onChange={(event) => setAdminPassphrase(event.target.value)} type="password" />
          </label>
          <button
            className="danger-command solid"
            type="button"
            disabled={busy || confirmPhrase !== preview.confirmPhrase || !adminPassphrase}
            onClick={() => void confirmDelete()}
          >
            <Trash2 size={15} /> Confirm user delete
          </button>
        </div>
      )}
      {status && <p className="status-line">{status}</p>}
    </section>
  );
}
