import { useState, useEffect, useCallback } from 'react';
import { Shield, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import type { AppState } from '../lib/types';
import { fetchAdminSnapshot } from '../lib/adminApi';
import type { AdminSnapshot } from '../lib/adminTypes';

export function Admin({ state, userEmail }: { state: AppState; userEmail?: string | null }) {
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminSnapshot('7d');
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin snapshot');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={20} className="text-[#C23B5E]" />
          <h2 className="text-lg font-bold">Admin Console</h2>
        </div>
        <button
          type="button"
          onClick={loadSnapshot}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white/60 hover:bg-white/80 border border-[#C23B5E]/30 rounded-full transition-all active:scale-95"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {loading && !snapshot && (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading snapshot...
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {snapshot && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Users" value={snapshot.users.length} />
            <StatCard label="Active (7d)" value={snapshot.usage.activeUsers} />
            <StatCard label="Trips" value={snapshot.trips.length} />
            <StatCard label="Receipts" value={snapshot.receipts.length} />
          </div>

          {snapshot.warnings.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-xs font-semibold text-amber-700 mb-1">Warnings</p>
              {snapshot.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-600">{w}</p>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-bold">Users</h3>
            <div className="space-y-1">
              {snapshot.users.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-2 bg-white/50 rounded-lg text-xs">
                  <span className="truncate max-w-[60%]">{user.email}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${user.health === 'ok' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {user.health}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="p-3 bg-white/60 backdrop-blur-sm rounded-xl border border-stone-200/50">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-bold text-slate-800">{value}</p>
    </div>
  );
}
