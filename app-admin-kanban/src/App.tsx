import { useEffect, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  Cloud,
  Database,
  Lock,
  LogOut,
  RefreshCw,
  Search,
  Shield,
  UserRound,
  Plane,
  Receipt,
  Image as ImageIcon
} from 'lucide-react';
import {
  clearSession,
  currentSession,
  fetchSnapshot,
  loginAdmin,
} from './lib/adminApi';
import type {
  AdminKanbanSnapshot,
  AdminSession,
  AdminUserCard,
  HealthState,
  AdminProviderHealth,
  AdminTripCard,
  AdminReceiptCard
} from './lib/types';

const RANGE_OPTIONS = [1, 7, 30, 90];

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
  return user.emailMasked.toLowerCase().includes(search.toLowerCase());
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
        <h1>Travel Ops Dashboard</h1>
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

function UniversalHealth({ snapshot }: { snapshot: AdminKanbanSnapshot }) {
  return (
    <div className="universal-health">
      <h2>Universal App Health</h2>
      <div className="health-grid">
        <div className="health-card">
          <h3><Database size={16} /> Database & Backend</h3>
          <Metric label="Supabase Status" value={snapshot.supabase.status === 'healthy' ? 'ACTIVE_HEALTHY' : statusText[snapshot.supabase.status]} status={snapshot.supabase.status} />
          <Metric label="RLS Force Enabled" value={snapshot.supabase.rls.every((row) => row.enabled && row.force) ? 'Yes' : 'No'} status={snapshot.supabase.rls.every((row) => row.enabled && row.force) ? 'healthy' : 'warning'} />
          <Metric label="Total Users" value={snapshot.supabase.counts.authUsers} />
          <Metric label="Events (Range)" value={snapshot.usage.events} />
        </div>
        
        <div className="health-card">
          <h3><Bot size={16} /> LLM Providers</h3>
          <div className="llm-list">
            {snapshot.llm.map((provider) => (
              <div key={provider.provider} className="llm-item">
                <span>{provider.label} <small>({provider.model})</small></span>
                <span className={classForHealth(provider.status)}>{statusText[provider.status]}</span>
              </div>
            ))}
          </div>
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

function UserDetailsPanel({ user, snapshot }: { user: AdminUserCard, snapshot: AdminKanbanSnapshot }) {
  const userTrips = snapshot.trips.filter(t => t.ownerId === user.id);
  const userReceipts = snapshot.receipts.filter(r => r.ownerId === user.id);

  return (
    <div className="user-details-panel">
      <div className="panel-header">
        <h2><UserRound size={20} /> {user.emailMasked}</h2>
        <span className="last-seen">Last seen: {fmtDate(user.lastSeenAt)}</span>
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

      <div className="connection-status">
        <h3>Connection Status</h3>
        <Metric label="Supabase Health" value={statusText[user.health]} status={user.health} />
        <Metric label="Notion Integration" value={user.notionConnected ? 'Connected' : 'Not Connected'} status={user.notionConnected ? 'healthy' : 'warning'} />
        <Metric label="AI Requests (Today)" value={user.aiRequestsToday} />
      </div>

      <div className="user-lists">
        <div className="list-section">
          <h3>Trips ({userTrips.length})</h3>
          {userTrips.length > 0 ? (
            <div className="card-list">
              {userTrips.map(trip => (
                <div key={trip.id} className="detail-card">
                  <strong>{trip.name}</strong>
                  <small>{trip.destination} · {trip.dateRange}</small>
                  <span>{trip.receiptCount} receipts · {trip.currency}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-text">No trips found.</p>
          )}
        </div>

        <div className="list-section">
          <h3>Receipts ({userReceipts.length})</h3>
          {userReceipts.length > 0 ? (
            <div className="card-list">
              {userReceipts.map(receipt => (
                <div key={receipt.id} className="detail-card">
                  <strong>{receipt.store}</strong>
                  <small>{receipt.recordDate} · {receipt.status}</small>
                  <span>{receipt.amount.toLocaleString()} {receipt.currency}</span>
                  <span className={`sync-status ${receipt.notionSynced ? 'synced' : 'pending'}`}>
                    {receipt.notionSynced ? 'Notion Synced' : 'Notion Pending'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-text">No receipts found.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Board({
  snapshot,
  session,
  rangeDays,
  setRangeDays,
  onRefresh,
  onLogout,
}: {
  snapshot: AdminKanbanSnapshot;
  session: AdminSession;
  rangeDays: number;
  setRangeDays: (range: number) => void;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUserCard | null>(null);

  const visibleUsers = snapshot.users.filter(u => matchesSearch(u, search));

  return (
    <main className="ops-shell dashboard-layout">
      <header className="top-command">
        <div className="brand">
          <span className="brand-mark small"><Shield size={19} /></span>
          <span><strong>Travel Ops Dashboard</strong><small>{session.adminSubject}</small></span>
        </div>
        <div className="command-row">
          <button type="button" onClick={onRefresh}><RefreshCw size={16} /> Refresh</button>
          <select value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value))}>
            {RANGE_OPTIONS.map((range) => <option key={range} value={range}>{range}d range</option>)}
          </select>
          <span className="fresh-pill"><i /> Data fresh · {fmtDate(snapshot.generatedAt)}</span>
          <label className="search-box">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users..." />
          </label>
          <button type="button" onClick={onLogout}><LogOut size={16} /> Exit</button>
        </div>
      </header>

      <section className="dashboard-content">
        <div className="dashboard-left">
          <UniversalHealth snapshot={snapshot} />
          
          <div className="users-list-container">
            <h2>Live Users ({visibleUsers.length})</h2>
            <div className="users-list">
              {visibleUsers.map(user => (
                <button 
                  key={user.id} 
                  className={`user-list-item ${selectedUser?.id === user.id ? 'active' : ''}`}
                  onClick={() => setSelectedUser(user)}
                  type="button"
                >
                  <UserRound size={16} />
                  <span>{user.emailMasked}</span>
                  <span className={classForHealth(user.health)}>●</span>
                </button>
              ))}
              {visibleUsers.length === 0 && <p className="empty-text">No users found.</p>}
            </div>
          </div>
        </div>

        <div className="dashboard-right">
          {selectedUser ? (
            <UserDetailsPanel user={selectedUser} snapshot={snapshot} />
          ) : (
            <div className="empty-panel">
              <Activity size={48} />
              <p>Select a user to view their detailed operations and records.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export function App() {
  const [session, setSession] = useState<AdminSession | null>(() => currentSession());
  const [snapshot, setSnapshot] = useState<AdminKanbanSnapshot | null>(null);
  const [rangeDays, setRangeDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      setSnapshot(await fetchSnapshot(session, rangeDays));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Snapshot failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [session, rangeDays]);

  if (!session) return <LoginGate onLogin={setSession} />;

  return (
    <>
      {snapshot ? (
        <Board
          snapshot={snapshot}
          session={session}
          rangeDays={rangeDays}
          setRangeDays={setRangeDays}
          onRefresh={() => void refresh()}
          onLogout={() => { clearSession(); setSession(null); setSnapshot(null); }}
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
