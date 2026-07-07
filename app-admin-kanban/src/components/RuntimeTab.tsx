import { useState, useEffect } from 'react';
import { Monitor } from 'lucide-react';
import { fetchRuntime } from '../lib/adminApi';
import type { AdminSession } from '../lib/types';
import { Metric } from './Metric';

export function RuntimeTab({ session }: { session: AdminSession }) {
  const [runtime, setRuntime] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function loadRuntime() {
    setLoading(true);
    try {
      setRuntime(await fetchRuntime(session));
    } catch {
      setRuntime(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRuntime();
  }, []);

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
