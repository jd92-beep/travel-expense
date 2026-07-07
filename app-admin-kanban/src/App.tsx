import { useEffect, useState } from 'react';
import { RefreshCw, LogOut } from 'lucide-react';
import {
  clearSession,
  currentSession,
  fetchSnapshot,
} from './lib/adminApi';
import type {
  AdminKanbanSnapshot,
  AdminSession,
  SurfaceScope,
  LiveState,
} from './lib/types';

import { LoginGate } from './components/LoginGate';
import { Board } from './components/Board';

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
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
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
