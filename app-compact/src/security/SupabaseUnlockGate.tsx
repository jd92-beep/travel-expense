import { useState } from 'react';
import { LockKeyhole, ShieldCheck, LogOut } from 'lucide-react';
import { unlockWithPassword } from './cryptoUnlock';
import { setDeviceTrust } from './deviceTrust';
import { createTrustedDeviceRegistration, saveTrustedDevice } from './trustedDevice';
import { unlockCredentialBroker, redactedError } from '../lib/credentialBroker';
import type { BrokerSession } from '../lib/credentialBroker';

type SupabaseUnlockGateProps = {
  userEmail: string;
  credentialBrokerUrl?: string;
  onUnlocked: () => void;
  onBrokerSession?: (session: BrokerSession) => void;
  onSignOut: () => Promise<void> | void;
};

export function SupabaseUnlockGate({
  userEmail,
  credentialBrokerUrl,
  onUnlocked,
  onBrokerSession,
  onSignOut,
}: SupabaseUnlockGateProps) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!password.trim()) return;
    setBusy(true);
    setError('');
    try {
      // 1. Locally verify password via PBKDF2/AES-GCM decryption
      const ok = await unlockWithPassword(password);
      if (!ok) {
        throw new Error('密碼唔正確，請再試一次。');
      }

      // 2. Set device trust immediately to mark this device as verified
      setDeviceTrust();

      // 3. Asynchronously unlock Credential Broker for Notion & AI tasks
      try {
        const trustedDevice = await createTrustedDeviceRegistration();
        const brokerSession = await unlockCredentialBroker(password, { credentialBrokerUrl }, {
          devicePublicKey: trustedDevice.devicePublicKey,
          deviceName: trustedDevice.deviceName,
        });
        if (brokerSession.device) {
          await saveTrustedDevice(brokerSession.device, trustedDevice.privateKey);
        }
        onBrokerSession?.(brokerSession);
      } catch (brokerError) {
        console.warn('[SupabaseUnlockGate] Broker connection failed during unlock:', brokerError);
        // Soft fallback for offline/broker missing - still allow app entrance because local password is valid!
      }

      // 4. Unlock completed
      onUnlocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : '解鎖失敗');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="lock-screen welcome-guide-backdrop" style={{ display: 'grid', placeItems: 'center', background: 'rgba(23, 18, 12, 0.6)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', zIndex: 1200, width: '100vw', height: '100vh', position: 'fixed', inset: 0 }}>
      <section className="lock-panel canva-lock-panel" style={{ width: 'min(420px, 90vw)', background: 'rgba(255, 255, 255, 0.88)', border: '1px solid rgba(255, 255, 255, 0.6)', borderRadius: '24px', padding: '28px', boxShadow: '0 30px 70px rgba(42, 30, 18, 0.22)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>

        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'inline-grid', placeItems: 'center', width: '52px', height: '52px', borderRadius: '16px', background: 'linear-gradient(135deg, #CC2929, #E07B39)', color: 'white', marginBottom: '12px', boxShadow: '0 8px 20px rgba(204, 41, 41, 0.2)' }}>
            <LockKeyhole size={24} />
          </div>
          <p className="eyebrow" style={{ margin: '0 0 4px 0', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', color: '#CC2929' }}>
            Travel Expense Double Lock
          </p>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#2A1E12' }}>
            本機安全防護鎖 🛡️
          </h1>
        </div>

        <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#6B7280', textAlign: 'center', lineHeight: 1.6 }}>
          為保障 <strong>{userEmail}</strong> 嘅雲端與 Notion 記帳安全，請輸入本機密碼進行雙重解鎖。
        </p>

        <div style={{ display: 'grid', gap: '14px' }}>
          <label style={{ display: 'grid', gap: '6px', fontSize: '12px', fontWeight: 800, color: '#374151' }}>
            密碼
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              autoFocus
              placeholder="請輸入解鎖密碼"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid rgba(139, 115, 85, 0.25)',
                borderRadius: '10px',
                fontSize: '14px',
                outline: 'none',
                background: 'white',
                textAlign: 'center',
                letterSpacing: password ? '4px' : 'normal'
              }}
            />
          </label>

          {error && (
            <p style={{ margin: 0, fontSize: '12px', color: '#DC2626', fontWeight: 700, textAlign: 'center' }}>
              {error}
            </p>
          )}

          <button
            onClick={submit}
            disabled={busy || !password.trim()}
            type="button"
            className="primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              width: '100%',
              padding: '11px',
              borderRadius: '12px',
              border: 0,
              background: busy || !password.trim() ? '#9CA3AF' : 'linear-gradient(135deg, #CC2929, #E07B39)',
              color: 'white',
              fontSize: '13px',
              fontWeight: 900,
              cursor: busy || !password.trim() ? 'default' : 'pointer',
              boxShadow: '0 4px 12px rgba(204, 41, 41, 0.15)'
            }}
          >
            {busy ? (
              <>
                <Loader2Icon />
                <span>正在解鎖...</span>
              </>
            ) : (
              <>
                <ShieldCheck size={16} />
                <span>驗證解鎖</span>
              </>
            )}
          </button>

          <button
            onClick={onSignOut}
            type="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              width: '100%',
              padding: '10px',
              borderRadius: '12px',
              border: '1px solid rgba(139, 115, 85, 0.18)',
              background: 'white',
              color: '#6B7280',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.02)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; }}
          >
            <LogOut size={13} />
            <span>登出 {userEmail}</span>
          </button>
        </div>

      </section>
    </main>
  );
}

function Loader2Icon() {
  return (
    <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin .8s linear infinite' }}>
      <line x1="12" y1="2" x2="12" y2="6"></line>
      <line x1="12" y1="18" x2="12" y2="22"></line>
      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
      <line x1="2" y1="12" x2="6" y2="12"></line>
      <line x1="18" y1="12" x2="22" y2="12"></line>
      <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
      <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
    </svg>
  );
}
