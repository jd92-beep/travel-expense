import { useEffect, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  ChevronDown,
  Cloud,
  Database,
  Eye,
  FileText,
  Lock,
  LogOut,
  RefreshCw,
  Search,
  Shield,
  UserRound,
  Plane,
  Receipt,
  Image as ImageIcon,
  Trash2
} from 'lucide-react';
import {
  clearSession,
  confirmDeleteUser,
  currentSession,
  fetchSnapshot,
  fetchReceiptPhoto,
  loginAdmin,
  previewDeleteUser,
  amendReceipt,
  testProvider,
  fetchSyncJobs,
  fetchDataDoctor,
  fetchRuntime,
  fetchIdentityDuplicates,
  fetchReconcile,
  previewAction,
  commitAction,
} from './lib/adminApi';
import type {
  AdminKanbanSnapshot,
  AdminSession,
  AdminUserCard,
  AdminReceiptCard,
  AdminProviderHealth,
  HealthState,
  DeletePreview,
  SurfaceScope,
  LiveState,
  ReconcileTripEntry,
} from './lib/types';
import { Pencil, MapPin, Calendar, Users as UsersIcon, Globe, Wallet, Clock, CheckCircle, XCircle, Zap, Activity as ActivityIcon, Wrench, Bug, Monitor, GitMerge, Scale } from 'lucide-react';

const RANGE_OPTIONS = [1, 7, 30, 90];
const SURFACE_OPTIONS: Array<{ value: SurfaceScope; label: string }> = [
  { value: 'compact', label: 'Compact' },
  { value: 'react', label: 'React' },
  { value: 'legacy', label: 'Legacy' },
  { value: 'admin-kanban', label: 'Admin' },
  { value: 'all', label: 'All' },
];
type ConsoleTab = 'overview' | 'sync' | 'doctor' | 'identity' | 'reconcile' | 'runtime';
const RECEIPT_STATUSES = new Set(['draft', 'pending', 'confirmed']);
const CURRENCY_RE = /^[A-Z]{3}$/;

const statusText: Record<HealthState, string> = {
  healthy: 'Healthy',
  warning: 'Watch',
  danger: 'Danger',
  unknown: 'Unknown',
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString('zh-HK', { dateStyle: 'short', timeStyle: 'short' });
}

function classForHealth(status: HealthState): string {
  return `health health-${status}`;
}

function matchesSearch(user: AdminUserCard, search: string): boolean {
  if (!search.trim()) return true;
  const needle = search.trim().toLowerCase();
  const haystack = [user.email, user.displayName, user.id].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(needle);
}

function LoginGate({ onLogin }: { onLogin: (session: AdminSession) => void }) {
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!passphrase.trim()) return;
    setBusy(true);
    setError('');
    try {
      onLogin(await loginAdmin(passphrase));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div className="brand-mark"><Shield size={30} /></div>
        <h1>Travel Ops KanBan</h1>
        <p>Admin-only operations cockpit for users, trips, expenses, sync, and LLM health.</p>
        <label>
          Admin passphrase
          <input
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }}
            type="password"
            autoComplete="current-password"
            placeholder="Required for cross-user visibility"
          />
        </label>
        {error && <p className="error-line">{error}</p>}
        <button className="primary-command" type="button" disabled={busy || !passphrase.trim()} onClick={() => void submit()}>
          <Lock size={16} /> {busy ? 'Authenticating' : 'Enter board'}
        </button>
      </section>
    </main>
  );
}

function Metric({ label, value, status }: { label: string; value: string | number; status?: HealthState }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={status ? classForHealth(status) : undefined}>{value}</strong>
    </div>
  );
}

function EmptyState({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="empty-state">
      <div>{icon}</div>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function UniversalHealth({ snapshot, session }: { snapshot: AdminKanbanSnapshot; session: AdminSession }) {
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
          <Metric label="Connected Users" value={snapshot.notion.connectedUsers} />
          <Metric label="Synced Receipts" value={snapshot.notion.syncedReceipts} />
          <Metric label="Pending Jobs" value={snapshot.notion.pendingJobs} status={snapshot.notion.pendingJobs ? 'warning' : 'healthy'} />
          <Metric label="Failed Jobs" value={snapshot.notion.failedJobs} status={snapshot.notion.failedJobs ? 'danger' : 'healthy'} />
        </div>
      </div>
    </div>
  );
}

function DeletePanel({
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

function ImageViewerModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content image-modal">
        <button onClick={onClose} className="modal-close">&times;</button>
        <img src={url} alt="Receipt" className="receipt-image-preview" />
      </div>
    </div>
  );
}

const RECEIPT_CATEGORIES = ['transport', 'food', 'shopping', 'lodging', 'ticket', 'medicine', 'other'];
const RECEIPT_PAYMENTS = ['cash', 'credit', 'paypay', 'suica'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function QuickAmendModal({ session, receipt, onClose, onRefresh }: { session: AdminSession, receipt: AdminReceiptCard, onClose: () => void, onRefresh: () => void }) {
  const [store, setStore] = useState(receipt.store);
  const [amount, setAmount] = useState(receipt.amount.toString());
  const [currency, setCurrency] = useState(receipt.currency);
  const [status, setStatus] = useState(receipt.status);
  const [recordDate, setRecordDate] = useState(receipt.recordDate || '');
  const [recordTime, setRecordTime] = useState((receipt.recordTime || '').slice(0, 5));
  const [category, setCategory] = useState(receipt.category || 'other');
  const [payment, setPayment] = useState(receipt.payment || 'cash');
  const [originalAmount, setOriginalAmount] = useState(receipt.originalAmount != null ? String(receipt.originalAmount) : '');
  const [originalCurrency, setOriginalCurrency] = useState(receipt.originalCurrency || '');
  const [exchangeRate, setExchangeRate] = useState(receipt.exchangeRate != null ? String(receipt.exchangeRate) : '');
  const [itemsText, setItemsText] = useState(receipt.itemsText || '');
  const [note, setNote] = useState(receipt.note || '');
  const [address, setAddress] = useState(receipt.address || '');
  const [bookingRef, setBookingRef] = useState(receipt.bookingRef || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    try {
      const trimmedStore = store.trim();
      if (!trimmedStore) throw new Error('Store name cannot be empty');
      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount < 0) throw new Error('Amount must be a finite non-negative number');
      const upperCurrency = currency.toUpperCase().trim();
      if (!CURRENCY_RE.test(upperCurrency)) throw new Error('Currency must be a 3-letter uppercase code');
      if (!RECEIPT_STATUSES.has(status)) throw new Error(`Status must be one of: ${[...RECEIPT_STATUSES].join(', ')}`);
      if (!DATE_RE.test(recordDate)) throw new Error('Date must be YYYY-MM-DD');
      if (originalAmount.trim() && (!Number.isFinite(Number(originalAmount)) || Number(originalAmount) < 0)) throw new Error('Original amount must be a non-negative number');
      if (originalCurrency.trim() && !CURRENCY_RE.test(originalCurrency.toUpperCase().trim())) throw new Error('Original currency must be a 3-letter code');
      if (exchangeRate.trim() && (!Number.isFinite(Number(exchangeRate)) || Number(exchangeRate) <= 0)) throw new Error('Exchange rate must be a positive number');
      await amendReceipt(session, receipt.id, {
        store: trimmedStore,
        amount: parsedAmount,
        currency: upperCurrency,
        status,
        recordDate,
        recordTime: recordTime.trim(),
        category,
        payment,
        originalAmount: originalAmount.trim() ? Number(originalAmount) : null,
        originalCurrency: originalCurrency.toUpperCase().trim() || null,
        exchangeRate: exchangeRate.trim() ? Number(exchangeRate) : null,
        itemsText,
        note,
        address,
        bookingRef,
      });
      onRefresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to amend receipt');
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content amend-modal">
        <h3 style={{marginTop: 0}}>Amend Receipt</h3>
        <div className="amend-grid">
          <label>Store Name <input value={store} onChange={e => setStore(e.target.value)} /></label>
          <label>Amount <input type="number" value={amount} onChange={e => setAmount(e.target.value)} /></label>
          <label>Currency <input value={currency} onChange={e => setCurrency(e.target.value)} /></label>
          <label>Status <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="draft">draft</option>
            <option value="pending">pending</option>
            <option value="confirmed">confirmed</option>
          </select></label>
          <label>Date <input type="date" value={recordDate} onChange={e => setRecordDate(e.target.value)} /></label>
          <label>Time <input type="time" value={recordTime} onChange={e => setRecordTime(e.target.value)} /></label>
          <label>Category <select value={category} onChange={e => setCategory(e.target.value)}>
            {RECEIPT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select></label>
          <label>Payment <select value={payment} onChange={e => setPayment(e.target.value)}>
            {RECEIPT_PAYMENTS.map(p => <option key={p} value={p}>{p}</option>)}
          </select></label>
          <label>Original Amount <input type="number" value={originalAmount} onChange={e => setOriginalAmount(e.target.value)} placeholder="optional" /></label>
          <label>Original Currency <input value={originalCurrency} onChange={e => setOriginalCurrency(e.target.value)} placeholder="e.g. JPY" /></label>
          <label>Exchange Rate <input type="number" step="any" value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} placeholder="optional" /></label>
          <label>Booking Ref <input value={bookingRef} onChange={e => setBookingRef(e.target.value)} placeholder="optional" /></label>
          <label className="amend-full">Items <textarea value={itemsText} onChange={e => setItemsText(e.target.value)} rows={2} /></label>
          <label className="amend-full">Note <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} /></label>
          <label className="amend-full">Address <input value={address} onChange={e => setAddress(e.target.value)} /></label>
        </div>
        {error && <p className="error-line">{error}</p>}
        <div className="modal-actions">
          <button className="primary-command" disabled={busy} onClick={() => void save()}>Save</button>
          <button className="ghost-command" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function ReceiptDetailModal({ receipt, snapshot, session, onClose, onAmend }: { receipt: AdminReceiptCard; snapshot: AdminKanbanSnapshot; session: AdminSession; onClose: () => void; onAmend: () => void }) {
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

function UserDetailsPanel({
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

  // Compact-style grouping: newest date first, receipts within a day by time desc
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
                  {trip.memberCount > 0 && <small><UsersIcon size={11} /> {trip.memberCount} member{trip.memberCount !== 1 ? 's' : ''}</small>}
                  {trip.timezones && trip.timezones.length > 0 && <small><Globe size={11} /> {trip.timezones.join(', ')}</small>}
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
                    <div key={receipt.id} className="detail-card" style={{position: 'relative', cursor: 'pointer'}} onClick={() => setDetailReceipt(receipt)}>
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
                          // Placeholder must not bubble to the card click — that opened the
                          // details modal and read as "image button shows details" bug
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
        <Metric label="Supabase Health" value={statusText[user.health]} status={user.health} />
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

function SyncOpsTab({ session }: { session: AdminSession }) {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionResult, setActionResult] = useState('');

  async function loadJobs() {
    setLoading(true);
    try {
      setJobs(await fetchSyncJobs(session, { status: statusFilter || undefined, limit: 100 }));
    } catch { setJobs([]); }
    finally { setLoading(false); }
  }

  async function handleAction(jobId: string, action: string) {
    try {
      const preview = await previewAction(session, { action: `${action}_sync_job`, targetType: 'sync_job', targetId: jobId, payload: { jobId }, reason: `Admin ${action}` });
      const result = await commitAction(session, preview.id);
      setActionResult(`${action} succeeded: ${JSON.stringify(result.result || {})}`);
      void loadJobs();
    } catch (err) { setActionResult(`${action} failed: ${err instanceof Error ? err.message : 'unknown'}`); }
  }

  useEffect(() => { void loadJobs(); }, [statusFilter]);

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

function DataDoctorTab({ session }: { session: AdminSession }) {
  const [issues, setIssues] = useState<any[]>([]);
  const [summary, setSummary] = useState<{ high: number; medium: number; low: number }>({ high: 0, medium: 0, low: 0 });
  const [loading, setLoading] = useState(false);

  async function runDoctor() {
    setLoading(true);
    try {
      const result = await fetchDataDoctor(session);
      setIssues(result.issues);
      setSummary(result.summary);
    } catch { setIssues([]); }
    finally { setLoading(false); }
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

function RuntimeTab({ session }: { session: AdminSession }) {
  const [runtime, setRuntime] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function loadRuntime() {
    setLoading(true);
    try { setRuntime(await fetchRuntime(session)); }
    catch { setRuntime(null); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadRuntime(); }, []);

  return (
    <div className="ops-tab">
      <h3><Monitor size={16} /> Runtime Status</h3>
      {runtime ? (
        <div className="runtime-grid">
          <Metric label="Admin Console" value={`v${runtime.adminConsoleVersion}`} />
          <Metric label="Edge Deploy" value={runtime.edgeDeployId} />
          <Metric label="Edge Route" value={runtime.edgeRouteVersion} />
          <Metric label="Broker" value={runtime.brokerVersion} status={runtime.brokerVersion === 'unreachable' ? 'danger' : 'healthy'} />
          <Metric label="Vercel Frontend" value={runtime.vercelFrontend || 'unknown'} status={runtime.vercelFrontend === 'healthy' ? 'healthy' : runtime.vercelFrontend ? 'danger' : 'unknown'} />
          <Metric label="DB Schema" value={runtime.dbSchemaVersion} />
          <Metric label="Supabase" value={runtime.supabaseUrl} />
        </div>
      ) : (
        <button type="button" onClick={() => void loadRuntime()} disabled={loading}>{loading ? 'Loading...' : 'Load Runtime Status'}</button>
      )}
    </div>
  );
}

function IdentityTab({ session }: { session: AdminSession }) {
  const [duplicates, setDuplicates] = useState<Array<{ prefix: string; users: any[] }>>([]);
  const [loading, setLoading] = useState(false);
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});
  const [mergingPrefix, setMergingPrefix] = useState('');
  const [mergeResult, setMergeResult] = useState('');

  async function loadDuplicates() {
    setLoading(true);
    try { setDuplicates(await fetchIdentityDuplicates(session)); }
    catch { setDuplicates([]); }
    finally { setLoading(false); }
  }

  async function mergeGroup(dup: { prefix: string; users: any[] }) {
    const targetId = mergeTargets[dup.prefix] || dup.users[0]?.id;
    const target = dup.users.find(u => u.id === targetId);
    const sources = dup.users.filter(u => u.id !== targetId);
    if (!target || sources.length === 0) return;
    if (!window.confirm(`Merge ${sources.map(u => u.email).join(', ')} → ${target.email}?\n所有 trips/receipts/photos/sync jobs 會改 owner 做 ${target.email}。`)) return;
    setMergingPrefix(dup.prefix);
    setMergeResult('');
    try {
      const outcomes: string[] = [];
      for (const source of sources) {
        const preview = await previewAction(session, {
          action: 'reassign_data',
          targetType: 'user',
          targetId: target.id,
          payload: { sourceUserId: source.id, targetUserId: target.id },
          reason: `Identity merge: ${source.email} -> ${target.email}`,
        });
        const committed = await commitAction(session, preview.id);
        outcomes.push(`${source.email}: ${JSON.stringify(committed.result?.reassigned || {})}`);
      }
      setMergeResult(`Merged into ${target.email} — ${outcomes.join(' | ')}`);
      void loadDuplicates();
    } catch (err) {
      setMergeResult(`Merge failed: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setMergingPrefix('');
    }
  }

  return (
    <div className="ops-tab">
      <h3><GitMerge size={16} /> Identity Resolver</h3>
      <button type="button" onClick={() => void loadDuplicates()} disabled={loading}>{loading ? 'Scanning...' : 'Detect Duplicates'}</button>
      {mergeResult && <p className="status-line">{mergeResult}</p>}
      {duplicates.length > 0 && (
        <div className="ops-table">
          <div className="ops-row ops-header"><span>Email Prefix</span><span>Accounts</span><span>Details</span><span>Merge</span></div>
          {duplicates.map((dup, i) => (
            <div key={i} className="ops-row">
              <span>{dup.prefix}</span>
              <span>{dup.users.length}</span>
              <span>{dup.users.map(u => `${u.email} (${fmtDate(u.createdAt)})`).join(', ')}</span>
              <span className="ops-actions merge-controls">
                <select
                  value={mergeTargets[dup.prefix] || dup.users[0]?.id}
                  onChange={(e) => setMergeTargets(prev => ({ ...prev, [dup.prefix]: e.target.value }))}
                  title="Merge target (keeps this account)"
                >
                  {dup.users.map(u => <option key={u.id} value={u.id}>→ {u.email}</option>)}
                </select>
                <button type="button" disabled={mergingPrefix === dup.prefix} onClick={() => void mergeGroup(dup)}>
                  {mergingPrefix === dup.prefix ? 'Merging...' : 'Merge'}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      {duplicates.length === 0 && !loading && <p className="empty-text">Click "Detect Duplicates" to scan for duplicate accounts.</p>}
    </div>
  );
}

function ReconcileTab({ session }: { session: AdminSession }) {
  const [entries, setEntries] = useState<ReconcileTripEntry[]>([]);
  const [generatedAt, setGeneratedAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setLoading(true);
    setError('');
    try {
      const result = await fetchReconcile(session);
      setEntries(result.trips);
      setGeneratedAt(result.generatedAt);
    } catch (err) {
      setEntries([]);
      setError(err instanceof Error ? err.message : 'Reconcile failed');
    } finally { setLoading(false); }
  }

  const statusBadge: Record<string, string> = {
    balanced: '✅ 平衡',
    mismatch: '⚠️ 有差異',
    no_notion_db: '— 未連 Notion',
    notion_unreachable: '❌ Notion 不可達',
  };

  return (
    <div className="ops-tab">
      <h3><Scale size={16} /> Notion ↔ Supabase 對數器</h3>
      <button type="button" onClick={() => void run()} disabled={loading}>{loading ? '對數中...' : 'Run 對數'}</button>
      {generatedAt && <small className="status-line">Generated: {fmtDate(generatedAt)}</small>}
      {error && <p className="error-line">{error}</p>}
      {entries.length > 0 && (
        <div className="ops-table">
          <div className="ops-row ops-header"><span>Trip</span><span>Owner</span><span>Supabase</span><span>Notion</span><span>差異</span><span>Status</span></div>
          {entries.map((entry) => (
            <div key={entry.tripId} className={`ops-row reconcile-${entry.status}`}>
              <span>{entry.tripName}</span>
              <span>{entry.ownerEmail}</span>
              <span>{entry.supabaseReceipts} 筆 ({entry.supabaseSyncedToNotion} synced)</span>
              <span>{entry.notionReceipts != null ? `${entry.notionReceipts} 筆` : '—'}</span>
              <span title={entry.orphanSamples?.join(', ') || ''}>
                {entry.missingInNotion != null ? `缺 Notion ${entry.missingInNotion} / 缺 Supabase ${entry.orphanInNotion}` : entry.error || '—'}
              </span>
              <span>{statusBadge[entry.status] || entry.status}</span>
            </div>
          ))}
        </div>
      )}
      {entries.length === 0 && !loading && <p className="empty-text">撳「Run 對數」逐 trip 對比 Notion mirror 同 Supabase 數目。</p>}
    </div>
  );
}

function Board({
  snapshot,
  session,
  rangeDays,
  setRangeDays,
  surface,
  setSurface,
  onRefresh,
  onLogout,
  autoRefresh,
  setAutoRefresh,
  liveState,
}: {
  snapshot: AdminKanbanSnapshot;
  session: AdminSession;
  rangeDays: number;
  setRangeDays: (range: number) => void;
  surface: SurfaceScope;
  setSurface: (s: SurfaceScope) => void;
  onRefresh: () => void;
  onLogout: () => void;
  autoRefresh: boolean;
  setAutoRefresh: (v: boolean) => void;
  liveState: LiveState;
}) {
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const selectedUser = snapshot.users.find((user) => user.id === selectedUserId) || null;
  const [isStale, setIsStale] = useState(false);
  const [activeTab, setActiveTab] = useState<ConsoleTab>('overview');

  useEffect(() => {
    const generatedMs = new Date(snapshot.generatedAt).getTime();
    const staleMs = (snapshot.staleAfterSeconds || 60) * 1000;
    const check = () => setIsStale(Date.now() - generatedMs > staleMs);
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, [snapshot.generatedAt, snapshot.staleAfterSeconds]);

  useEffect(() => {
    if (selectedUserId && !snapshot.users.find((user) => user.id === selectedUserId)) {
      setSelectedUserId('');
    }
  }, [snapshot.users, selectedUserId]);

  const visibleUsers = snapshot.users.filter(u => matchesSearch(u, search));

  return (
    <main className="ops-shell dashboard-layout">
      <header className="top-command">
        <div className="brand">
          <span className="brand-mark small"><Shield size={19} /></span>
          <span><strong>Compact Ops Console</strong><small>{session.adminSubject}</small></span>
        </div>
        <div className="command-row">
          <button type="button" onClick={onRefresh}><RefreshCw size={16} /> Refresh</button>
          <button type="button" className={autoRefresh ? 'auto-refresh-on' : 'auto-refresh-off'} onClick={() => setAutoRefresh(!autoRefresh)} title={autoRefresh ? 'Auto-refresh ON (30s)' : 'Auto-refresh OFF'}>
            <RefreshCw size={14} className={autoRefresh ? 'spin-slow' : ''} /> {autoRefresh ? 'Auto' : 'Manual'}
          </button>
          <select value={surface} onChange={(event) => setSurface(event.target.value as SurfaceScope)} title="Data scope">
            {SURFACE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <select value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value))}>
            {RANGE_OPTIONS.map((range) => <option key={range} value={range}>{range}d range</option>)}
          </select>
          {surface === 'all' && <span className="surface-warning-badge">All surfaces</span>}
          <span className={`fresh-pill ${isStale ? 'stale' : ''} ${liveState.status === 'error' ? 'error' : ''}`}>
            <i /> {liveState.status === 'error' ? 'Refresh failed' : isStale ? 'Stale' : 'Data fresh'} · {fmtDate(snapshot.generatedAt)}
          </span>
          {liveState.error && <span className="live-error-hint" title={liveState.error}>⚠ {liveState.error.slice(0, 40)}</span>}
          <label className="search-box">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users..." />
          </label>
          <button type="button" onClick={onLogout}><LogOut size={16} /> Exit</button>
        </div>
      </header>

      <nav className="console-tabs">
        <button type="button" className={activeTab === 'overview' ? 'tab-active' : ''} onClick={() => setActiveTab('overview')}><ActivityIcon size={14} /> Overview</button>
        <button type="button" className={activeTab === 'sync' ? 'tab-active' : ''} onClick={() => setActiveTab('sync')}><Wrench size={14} /> Sync</button>
        <button type="button" className={activeTab === 'doctor' ? 'tab-active' : ''} onClick={() => setActiveTab('doctor')}><Bug size={14} /> Doctor</button>
        <button type="button" className={activeTab === 'identity' ? 'tab-active' : ''} onClick={() => setActiveTab('identity')}><GitMerge size={14} /> Identity</button>
        <button type="button" className={activeTab === 'reconcile' ? 'tab-active' : ''} onClick={() => setActiveTab('reconcile')}><Scale size={14} /> 對數</button>
        <button type="button" className={activeTab === 'runtime' ? 'tab-active' : ''} onClick={() => setActiveTab('runtime')}><Monitor size={14} /> Runtime</button>
      </nav>

      {activeTab === 'sync' && <SyncOpsTab session={session} />}
      {activeTab === 'doctor' && <DataDoctorTab session={session} />}
      {activeTab === 'identity' && <IdentityTab session={session} />}
      {activeTab === 'reconcile' && <ReconcileTab session={session} />}
      {activeTab === 'runtime' && <RuntimeTab session={session} />}
      {activeTab === 'overview' && (
      <section className="dashboard-content">
        {snapshot.warnings && snapshot.warnings.length > 0 && (
          <div className="snapshot-warnings" role="alert">
            <AlertTriangle size={14} />
            <ul>
              {snapshot.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}
        <div className="dashboard-left">
          <UniversalHealth snapshot={snapshot} session={session} />
          
          <div className="users-list-container">
            <h2>Live Users ({visibleUsers.length})</h2>
            <div className="users-list">
              {visibleUsers.map(user => (
                <button 
                  key={user.id} 
                  className={`user-list-item ${selectedUserId === user.id ? 'active' : ''}`}
                  onClick={() => setSelectedUserId(user.id)}
                  type="button"
                >
                  <UserRound size={16} />
                  <span>{user.email}</span>
                  <span className={classForHealth(user.health)}>●</span>
                </button>
              ))}
              {visibleUsers.length === 0 && <p className="empty-text">No users found.</p>}
            </div>
          </div>
        </div>

        <div className="dashboard-right">
          {selectedUser ? (
            <UserDetailsPanel
              user={selectedUser}
              snapshot={snapshot}
              session={session}
              onRefresh={onRefresh}
            />
          ) : (
            <div className="empty-panel">
              <Activity size={48} />
              <p>Select a user to view their detailed operations and records.</p>
            </div>
          )}
        </div>
      </section>
      )}
    </main>
  );
}

export function App() {
  const [session, setSession] = useState<AdminSession | null>(() => currentSession());
  const [snapshot, setSnapshot] = useState<AdminKanbanSnapshot | null>(null);
  const [rangeDays, setRangeDays] = useState(7);
  const [surface, setSurface] = useState<SurfaceScope>('compact');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [liveState, setLiveState] = useState<LiveState>({ status: 'loading' });

  async function refresh() {
    if (!session) return;
    setLoading(true);
    setLiveState(prev => ({ ...prev, status: 'loading', lastAttemptAt: Date.now() }));
    try {
      const fresh = await fetchSnapshot(session, rangeDays, surface);
      setSnapshot(fresh);
      setError('');
      setLiveState({ status: 'live', lastSuccessAt: Date.now() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Snapshot failed';
      setError(msg);
      setLiveState(prev => ({ ...prev, status: snapshot ? 'stale' : 'error', error: msg }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [session, rangeDays, surface]);

  useEffect(() => {
    if (!session || !autoRefresh) return;
    const interval = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(interval);
  }, [session, autoRefresh, rangeDays, surface]);

  useEffect(() => {
    const handleOnline = () => setLiveState(prev => ({ ...prev, status: 'loading' }));
    const handleOffline = () => setLiveState(prev => ({ ...prev, status: 'offline' }));
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (!navigator.onLine) setLiveState(prev => ({ ...prev, status: 'offline' }));
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  if (!session) return <LoginGate onLogin={setSession} />;

  return (
    <>
      {snapshot ? (
        <Board
          snapshot={snapshot}
          session={session}
          rangeDays={rangeDays}
          setRangeDays={setRangeDays}
          surface={surface}
          setSurface={setSurface}
          onRefresh={() => void refresh()}
          onLogout={() => { clearSession(); setSession(null); setSnapshot(null); }}
          autoRefresh={autoRefresh}
          setAutoRefresh={setAutoRefresh}
          liveState={liveState}
        />
      ) : (
        <main className="login-screen">
          <section className="login-panel">
            <div className="brand-mark"><RefreshCw className={loading ? 'spin' : ''} /></div>
            <h1>{loading ? 'Loading snapshot' : 'Snapshot unavailable'}</h1>
            <p>{error || 'Waiting for admin API data.'}</p>
            <button className="primary-command" type="button" onClick={() => void refresh()}>
              <RefreshCw size={16} /> Retry
            </button>
            <button className="ghost-command" type="button" onClick={() => { clearSession(); setSession(null); }}>
              <LogOut size={16} /> Exit
            </button>
          </section>
        </main>
      )}
      {loading && <div className="loading-ribbon">Refreshing live snapshot...</div>}
    </>
  );
}
