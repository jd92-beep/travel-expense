import { useState, useEffect } from 'react';
import { Shield, RefreshCw, Search, LogOut, Activity as ActivityIcon, Wrench, Bug, GitMerge, Scale, Monitor, AlertTriangle, UserRound, Activity, Plane, CheckSquare, History, BarChart3, Cpu } from 'lucide-react';
import type { AdminKanbanSnapshot, AdminSession, SurfaceScope, LiveState } from '../lib/types';
import { UniversalHealth } from './UniversalHealth';
import { UserDetailsPanel } from './UserDetailsPanel';
import { SyncOpsTab } from './SyncOpsTab';
import { DataDoctorTab } from './DataDoctorTab';
import { IdentityTab } from './IdentityTab';
import { ReconcileTab } from './ReconcileTab';
import { RuntimeTab } from './RuntimeTab';
import { AiMonitoringTab } from './AiMonitoringTab';
import { AnalyticsTab } from './AnalyticsTab';
import { AuditTrailTab } from './AuditTrailTab';
import { BatchOpsTab } from './BatchOpsTab';
import { TripManagementTab } from './TripManagementTab';
import { fmtDate, classForHealth } from '../lib/utils';

const RANGE_OPTIONS = [1, 7, 30, 90];
const SURFACE_OPTIONS: Array<{ value: SurfaceScope; label: string }> = [
  { value: 'compact', label: 'Compact' },
  { value: 'react', label: 'React' },
  { value: 'legacy', label: 'Legacy' },
  { value: 'admin-kanban', label: 'Admin' },
  { value: 'all', label: 'All' },
];

type ConsoleTab = 'overview' | 'trips' | 'batch' | 'audit' | 'analytics' | 'aimonitor' | 'sync' | 'doctor' | 'identity' | 'reconcile' | 'runtime';

function matchesSearch(user: any, search: string): boolean {
  if (!search.trim()) return true;
  const needle = search.trim().toLowerCase();
  const haystack = [user.email, user.displayName, user.id].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(needle);
}

export function Board({
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
        <button type="button" className={activeTab === 'trips' ? 'tab-active' : ''} onClick={() => setActiveTab('trips')}><Plane size={14} /> Trips</button>
        <button type="button" className={activeTab === 'batch' ? 'tab-active' : ''} onClick={() => setActiveTab('batch')}><CheckSquare size={14} /> Batch Ops</button>
        <button type="button" className={activeTab === 'audit' ? 'tab-active' : ''} onClick={() => setActiveTab('audit')}><History size={14} /> Audit Trail</button>
        <button type="button" className={activeTab === 'analytics' ? 'tab-active' : ''} onClick={() => setActiveTab('analytics')}><BarChart3 size={14} /> Analytics</button>
        <button type="button" className={activeTab === 'aimonitor' ? 'tab-active' : ''} onClick={() => setActiveTab('aimonitor')}><Cpu size={14} /> AI Monitor</button>
        <button type="button" className={activeTab === 'sync' ? 'tab-active' : ''} onClick={() => setActiveTab('sync')}><Wrench size={14} /> Sync</button>
        <button type="button" className={activeTab === 'doctor' ? 'tab-active' : ''} onClick={() => setActiveTab('doctor')}><Bug size={14} /> Doctor</button>
        <button type="button" className={activeTab === 'identity' ? 'tab-active' : ''} onClick={() => setActiveTab('identity')}><GitMerge size={14} /> Identity</button>
        <button type="button" className={activeTab === 'reconcile' ? 'tab-active' : ''} onClick={() => setActiveTab('reconcile')}><Scale size={14} /> 對數</button>
        <button type="button" className={activeTab === 'runtime' ? 'tab-active' : ''} onClick={() => setActiveTab('runtime')}><Monitor size={14} /> Runtime</button>
      </nav>

      {activeTab === 'trips' && <TripManagementTab session={session} snapshot={snapshot} onRefresh={onRefresh} />}
      {activeTab === 'batch' && <BatchOpsTab session={session} snapshot={snapshot} onRefresh={onRefresh} />}
      {activeTab === 'audit' && <AuditTrailTab session={session} />}
      {activeTab === 'analytics' && <AnalyticsTab session={session} />}
      {activeTab === 'aimonitor' && <AiMonitoringTab session={session} snapshot={snapshot} />}
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
