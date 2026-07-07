import { useState } from 'react';
import { Shield, Lock } from 'lucide-react';
import { loginAdmin } from '../lib/adminApi';
import type { AdminSession } from '../lib/types';

export function LoginGate({ onLogin }: { onLogin: (session: AdminSession) => void }) {
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
