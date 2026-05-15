import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import type { BrokerSession } from '../lib/credentialBroker';
import { redactedError, unlockCredentialBroker } from '../lib/credentialBroker';
import { hasDeviceTrust, setDeviceTrust } from './deviceTrust';

export function AuthGate({
  children,
  credentialBrokerUrl,
  onBrokerSession,
  onUnlocked,
}: {
  children: ReactNode;
  credentialBrokerUrl?: string;
  onBrokerSession?: (session: BrokerSession) => void;
  onUnlocked?: () => void;
}) {
  const [unlocked, setUnlocked] = useState(() => hasDeviceTrust());
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'travel-expense-react:device-trust:v1' && !hasDeviceTrust()) {
        setUnlocked(false);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  async function submit() {
    if (!password.trim()) return;
    setBusy(true);
    setError('');
    try {
      const brokerSession = await unlockCredentialBroker(password, { credentialBrokerUrl });
      onBrokerSession?.(brokerSession);
      setDeviceTrust();
      setUnlocked(true);
      setPassword('');
      onUnlocked?.();
    } catch (error) {
      console.info('Credential Broker unlock failed:', redactedError(error));
      setError('密碼唔正確，請再試一次。');
    } finally {
      setBusy(false);
    }
  }

  if (unlocked) return <>{children}</>;

  return (
    <main className="lock-screen">
      <section className="lock-panel" aria-label="Travel Expense unlock">
        <div className="lock-icon"><LockKeyhole size={28} /></div>
        <div>
          <p className="eyebrow">Travel Expense</p>
          <h1>先解鎖再使用</h1>
        </div>
        <p className="muted">同一部手機成功一次之後，Chrome 會記住呢部裝置；清除 site data 或喺設定清除信任後會重新要求密碼。</p>
        <label>密碼
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }}
            inputMode="numeric"
            type="password"
            autoComplete="current-password"
            autoFocus
          />
        </label>
        {error && <p className="lock-error">{error}</p>}
        <button className="primary" type="button" disabled={busy || !password.trim()} onClick={submit}>
          <ShieldCheck size={18} /> {busy ? '檢查中' : '解鎖'}
        </button>
      </section>
    </main>
  );
}
