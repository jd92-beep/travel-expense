import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  Cloud,
  Database,
  Eye,
  Lock,
  LogOut,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserRound,
} from 'lucide-react';
import {
  clearSession,
  confirmDeleteUser,
  currentSession,
  fetchSnapshot,
  loginAdmin,
  previewDeleteUser,
} from './lib/adminApi';
import type {
  AdminKanbanSnapshot,
  AdminProviderHealth,
  AdminSession,
  AdminUserCard,
  DeletePreview,
  HealthState,
} from './lib/types';

type LaneId = 'users' | 'trips' | 'receipts' | 'notion' | 'llm' | 'backend' | 'actions';

type Lane = {
  id: LaneId;
  title: string;
  count: number;
  tone: 'cyan' | 'green' | 'amber' | 'purple' | 'red';
  body: ReactNode;
};

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

function matchesSearch(snapshot: AdminKanbanSnapshot, search: string): boolean {
  if (!search.trim()) return true;
  const haystack = [
    ...snapshot.users.map((u) => `${u.emailMasked} ${u.id}`),
    ...snapshot.trips.map((t) => `${t.name} ${t.destination} ${t.ownerEmailMasked}`),
    ...snapshot.receipts.map((r) => `${r.store} ${r.status} ${r.currency}`),
    ...snapshot.llm.map((p) => `${p.provider} ${p.label} ${p.storedStatus}`),
  ].join(' ').toLowerCase();
  return haystack.includes(search.toLowerCase());
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

function ProviderCard({ provider, onSelect }: { provider: AdminProviderHealth; onSelect: () => void }) {
  return (
    <button className="op-card provider-card" type="button" onClick={onSelect}>
      <span className="provider-icon"><Bot size={22} /></span>
      <span>
        <strong>{provider.label}</strong>
        <small>{provider.model || provider.provider}</small>
      </span>
      <span className={classForHealth(provider.status)}>{statusText[provider.status]}</span>
      <small>{provider.latencyMs ? `${provider.latencyMs}ms` : 'Latency pending'}</small>
    </button>
  );
}

function UserCard({ user, onSelect }: { user: AdminUserCard; onSelect: () => void }) {
  return (
    <button className="op-card user-card" type="button" onClick={onSelect}>
      <span className="avatar"><UserRound size={16} /></span>
      <span>
        <strong>{user.emailMasked}</strong>
        <small>Last seen {fmtDate(user.lastSeenAt)}</small>
      </span>
      <span className={classForHealth(user.health)}>{statusText[user.health]}</span>
      <small>{user.tripCount} trips · {user.receiptCount} receipts</small>
    </button>
  );
}

function DeletePanel({
  snapshot,
  session,
  selectedUser,
  onDone,
}: {
  snapshot: AdminKanbanSnapshot;
  session: AdminSession;
  selectedUser: AdminUserCard | null;
  onDone: () => void;
}) {
  const [preview, setPreview] = useState<DeletePreview | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [adminPassphrase, setAdminPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  const user = selectedUser;

  async function loadPreview() {
    if (!user) return;
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
    <div className="danger-panel">
      <div className="danger-head">
        <AlertTriangle size={18} />
        <span>Delete requires preview + confirm</span>
      </div>
      <p>Selected user: <strong>{user ? user.emailMasked : 'No user available'}</strong></p>
      <button className="danger-command" type="button" disabled={!user || busy} onClick={() => void loadPreview()}>
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
    </div>
  );
}

function formatInspectorValue(key: string, value: unknown): string {
  if (value == null || value === '') return 'None';
  if (/id$/i.test(key) && typeof value === 'string') return `${value.slice(0, 8)}...`;
  if (/email/i.test(key) && typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString();
  if (Array.isArray(value)) return `${value.length} item(s)`;
  if (typeof value === 'object') return 'Structured metadata';
  return String(value);
}

function Inspector({ selected }: { selected: { type: string; data: Record<string, unknown> } | null }) {
  const entries = selected
    ? Object.entries(selected.data).filter(([key]) => !/token|secret|passphrase|key/i.test(key)).slice(0, 18)
    : [];
  return (
    <aside className="inspector" aria-label="Inspector">
      <div className="section-title">
        <span>Inspector</span>
        <small>{selected?.type || 'No selection'}</small>
      </div>
      {selected ? (
        <div className="inspector-list">
          {entries.map(([key, value]) => (
            <span key={key}>
              <b>{key}</b>
              <small>{formatInspectorValue(key, value)}</small>
            </span>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Activity />} title="Select a card" detail="Card details, audit state, and admin commands appear here." />
      )}
    </aside>
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
  const [activeLane, setActiveLane] = useState<LaneId>('users');
  const [selected, setSelected] = useState<{ type: string; data: Record<string, unknown> } | null>(null);

  const visible = matchesSearch(snapshot, search);

  const lanes: Lane[] = useMemo(() => [
    {
      id: 'users',
      title: 'Live Users',
      count: snapshot.users.length,
      tone: 'cyan',
      body: snapshot.users.length ? (
        <>
          <Metric label="Active users" value={snapshot.usage.activeUsers} status="healthy" />
          {snapshot.users.map((user) => <UserCard key={user.id} user={user} onSelect={() => setSelected({ type: 'User', data: user })} />)}
        </>
      ) : <EmptyState icon={<UserRound />} title="No user events yet" detail="Telemetry will fill this lane after app usage is recorded." />,
    },
    {
      id: 'trips',
      title: 'Trip Ops',
      count: snapshot.trips.length,
      tone: 'green',
      body: snapshot.trips.length ? snapshot.trips.map((trip) => (
        <button className="op-card trip-card" key={trip.id} type="button" onClick={() => setSelected({ type: 'Trip', data: trip })}>
          <strong>{trip.name}</strong>
          <small>{trip.destination} · {trip.dateRange}</small>
          <span>{trip.currency} · {trip.receiptCount} receipts</span>
          <span className={trip.archived ? 'health-warning' : 'health-healthy'}>{trip.archived ? 'Archived' : 'Active'}</span>
        </button>
      )) : <EmptyState icon={<Cloud />} title="No trips" detail="Supabase currently has no active trip cards for this range." />,
    },
    {
      id: 'receipts',
      title: 'Expense Flow',
      count: snapshot.receipts.length,
      tone: 'amber',
      body: snapshot.receipts.length ? snapshot.receipts.map((receipt) => (
        <button className="op-card receipt-card" key={receipt.id} type="button" onClick={() => setSelected({ type: 'Receipt', data: receipt })}>
          <strong>{receipt.store}</strong>
          <small>{receipt.recordDate} · {receipt.status}</small>
          <span>{receipt.currency} {receipt.amount.toLocaleString()}</span>
        </button>
      )) : <EmptyState icon={<Database />} title="0 receipts" detail="Expense cards will appear after users create receipt records." />,
    },
    {
      id: 'notion',
      title: 'Notion Mirror',
      count: snapshot.notion.connectedUsers,
      tone: 'purple',
      body: (
        <>
          <Metric label="Connected users" value={snapshot.notion.connectedUsers} />
          <Metric label="Synced receipts" value={snapshot.notion.syncedReceipts} />
          <Metric label="Pending jobs" value={snapshot.notion.pendingJobs} status={snapshot.notion.pendingJobs ? 'warning' : 'healthy'} />
          <Metric label="Failed jobs" value={snapshot.notion.failedJobs} status={snapshot.notion.failedJobs ? 'danger' : 'healthy'} />
          <EmptyState icon={<Cloud />} title="Personal mirrors only" detail="Notion status comes from app-owned integration and sync metadata." />
        </>
      ),
    },
    {
      id: 'llm',
      title: 'LLM Health',
      count: snapshot.llm.length,
      tone: 'cyan',
      body: (
        <>
          {snapshot.llm.map((provider) => <ProviderCard key={provider.provider} provider={provider} onSelect={() => setSelected({ type: 'Provider', data: provider as unknown as Record<string, unknown> })} />)}
        </>
      ),
    },
    {
      id: 'backend',
      title: 'Backend Health',
      count: snapshot.supabase.rls.length,
      tone: 'green',
      body: (
        <>
          <Metric label="Supabase" value={snapshot.supabase.status === 'healthy' ? 'ACTIVE_HEALTHY' : statusText[snapshot.supabase.status]} status={snapshot.supabase.status} />
          <Metric label="Users" value={snapshot.supabase.counts.authUsers} />
          <Metric label="Trips" value={snapshot.supabase.counts.trips} />
          <Metric label="Receipts" value={snapshot.supabase.counts.receipts} />
          <div className="rls-grid">
            {snapshot.supabase.rls.map((row) => (
              <span key={row.table}>
                <b>{row.table}</b>
                <small className={row.enabled && row.force ? 'health-healthy' : 'health-danger'}>{row.enabled && row.force ? 'FORCE' : 'CHECK'}</small>
              </span>
            ))}
          </div>
        </>
      ),
    },
    {
      id: 'actions',
      title: 'Admin Actions',
      count: snapshot.audit.length,
      tone: 'red',
      body: <DeletePanel snapshot={snapshot} session={session} selectedUser={selected?.type === 'User' ? selected.data as AdminUserCard : null} onDone={onRefresh} />,
    },
  ], [snapshot, session, selected, onRefresh]);

  const active = lanes.find((lane) => lane.id === activeLane) || lanes[0];

  return (
    <main className="ops-shell">
      <header className="top-command">
        <div className="brand">
          <span className="brand-mark small"><Shield size={19} /></span>
          <span><strong>Travel Ops KanBan</strong><small>{session.adminSubject}</small></span>
        </div>
        <div className="command-row">
          <button type="button" onClick={onRefresh}><RefreshCw size={16} /> Refresh</button>
          <select value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value))}>
            {RANGE_OPTIONS.map((range) => <option key={range} value={range}>{range}d range</option>)}
          </select>
          <span className="fresh-pill"><i /> Data fresh · {fmtDate(snapshot.generatedAt)}</span>
          <label className="search-box">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users, trips, providers..." />
          </label>
          <button type="button" onClick={onLogout}><LogOut size={16} /> Exit</button>
        </div>
      </header>

      <div className="mobile-lane-picker" aria-label="Mobile lane picker">
        {lanes.map((lane) => (
          <button className={lane.id === activeLane ? 'active' : ''} key={lane.id} type="button" onClick={() => setActiveLane(lane.id)}>
            {lane.title}<b>{lane.count}</b>
          </button>
        ))}
      </div>

      <section className="ops-grid">
        <aside className="left-rail">
          <div className="section-title"><span>Status Overview</span><small>{snapshot.source}</small></div>
          <Metric label="Users" value={snapshot.supabase.counts.authUsers} status="healthy" />
          <Metric label="Trips" value={snapshot.supabase.counts.trips} status="healthy" />
          <Metric label="Receipts" value={snapshot.supabase.counts.receipts} />
          <Metric label="RLS force" value={snapshot.supabase.rls.every((row) => row.enabled && row.force) ? 'Enabled' : 'Review'} status={snapshot.supabase.rls.every((row) => row.enabled && row.force) ? 'healthy' : 'danger'} />
          <div className="section-title"><span>Usage</span><small>{rangeDays}d</small></div>
          <Metric label="Events" value={snapshot.usage.events} />
          <Metric label="Sessions" value={snapshot.usage.sessions} />
          <Metric label="Active users" value={snapshot.usage.activeUsers} />
          {snapshot.warnings.map((warning) => <p className="warning-line" key={warning}>{warning}</p>)}
        </aside>

        <div className={`lanes ${visible ? '' : 'is-filtered-empty'}`}>
          {lanes.map((lane) => (
            <article className={`lane lane-${lane.tone} ${lane.id === active.id ? 'mobile-active' : ''}`} key={lane.id}>
              <div className="lane-head">
                <span>{lane.title}</span>
                <b>{lane.count}</b>
              </div>
              <div className="lane-body">{lane.body}</div>
            </article>
          ))}
          {!visible && <div className="search-empty">No cards match the current search.</div>}
        </div>

        <Inspector selected={selected} />
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
