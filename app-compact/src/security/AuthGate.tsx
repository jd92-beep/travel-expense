import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { LockKeyhole, MapPin, ReceiptText, ShieldCheck } from 'lucide-react';
import type { BrokerSession } from '../lib/credentialBroker';
import {
  currentBrokerSession,
  redactedError,
  refreshCredentialBrokerSession,
  requestBrokerSessionChallenge,
  unlockCredentialBroker,
} from '../lib/credentialBroker';
import { unlockWithPassword } from './cryptoUnlock';
import { hasDeviceTrust, setDeviceTrust } from './deviceTrust';
import {
  clearTrustedDevice,
  createTrustedDeviceRegistration,
  loadTrustedDevice,
  saveTrustedDevice,
  signTrustedDeviceChallenge,
} from './trustedDevice';

function shouldAutoFocusUnlockInput(): boolean {
  if (typeof window === 'undefined') return false;
  return !window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;
}

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
  const [checking, setChecking] = useState(() => false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const onBrokerSessionRef = useRef(onBrokerSession);

  useEffect(() => {
    onBrokerSessionRef.current = onBrokerSession;
  }, [onBrokerSession]);

  useEffect(() => {
    let alive = true;
    async function restoreSession() {
      if (!hasDeviceTrust()) {
        setChecking(false);
        return;
      }
      const existing = currentBrokerSession();
      if (existing) {
        onBrokerSessionRef.current?.(existing);
        setUnlocked(true);
        setChecking(false);
        return;
      }
      const device = loadTrustedDevice();
      if (!device) {
        setChecking(false);
        setUnlocked(true);
        setError('');
        return;
      }
      try {
        const { challenge } = await requestBrokerSessionChallenge({ credentialBrokerUrl }, device.deviceId);
        const signature = await signTrustedDeviceChallenge(device.deviceId, challenge);
        const brokerSession = await refreshCredentialBrokerSession({ credentialBrokerUrl }, device.deviceId, challenge, signature);
        if (!alive) return;
        onBrokerSessionRef.current?.(brokerSession);
        setUnlocked(true);
        setError('');
      } catch (refreshError) {
        if (!alive) return;
        console.info('Credential Broker trusted-device refresh failed:', redactedError(refreshError));
        await clearTrustedDevice();
        setUnlocked(true);
        setError('');
      } finally {
        if (alive) setChecking(false);
      }
    }
    void restoreSession();
    return () => {
      alive = false;
    };
  }, [credentialBrokerUrl]);

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
      if (!await unlockWithPassword(password)) throw new Error('Unlock failed');

      // Fix Bug 1.2: Persist device trust immediately after successful local unlock
      setDeviceTrust();

      try {
        const trustedDevice = await createTrustedDeviceRegistration();
        const brokerSession = await unlockCredentialBroker(password, { credentialBrokerUrl }, {
          devicePublicKey: trustedDevice.devicePublicKey,
          deviceName: trustedDevice.deviceName,
        });
        if (!brokerSession.device) throw new Error('Credential Broker did not register this device');
        await saveTrustedDevice(brokerSession.device, trustedDevice.privateKey);
        onBrokerSession?.(brokerSession);
      } catch (brokerError) {
        console.warn('Credential Broker connection failed during unlock, entering offline mode:', brokerError);
        // Fix Bug 1.4: Surface a soft warning about broker/sync being limited
        alert('本地解鎖成功！但無法連接 Credential Broker（正處於離線模式），Notion 同步及 AI 功能將暫時受限。');
      }

      setUnlocked(true);
      setPassword('');
      onUnlocked?.();
    } catch (submitError) {
      setError(redactedError(submitError).includes('Unlock failed')
        ? '密碼唔正確，請再試一次。'
        : `解鎖失敗：${redactedError(submitError)}`);
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <main className="lock-screen">
        <section className="lock-panel canva-lock-panel" aria-label="Travel Expense reconnect">
          <div className="lock-icon"><ShieldCheck size={28} /></div>
          <div>
            <p className="eyebrow">Travel Expense</p>
            <h1>連接 Credential Broker</h1>
          </div>
          <p className="muted">正在用呢部已信任裝置換取短期安全 session。</p>
        </section>
      </main>
    );
  }

  if (unlocked) return <>{children}</>;

  return (
    <main className="lock-screen">
      <section className="lock-panel canva-lock-panel" aria-label="Travel Expense unlock">
        <div className="lock-ledger-map" aria-hidden="true">
          <span>HKG</span>
          <i />
          <span>TYO</span>
          <i />
          <span>Notion</span>
        </div>
        <div className="lock-icon"><LockKeyhole size={28} /></div>
        <div>
          <p className="eyebrow">Travel Expense</p>
          <h1>先解鎖再使用</h1>
        </div>
        <div className="lock-proof-strip" aria-hidden="true">
          <span><ReceiptText size={15} /> receipts</span>
          <span><MapPin size={15} /> itinerary</span>
          <span><ShieldCheck size={15} /> broker vault</span>
        </div>
        <p className="muted">同一部手機成功一次之後，會用本機加密裝置信任換取短期 broker session；Notion token 唔會進入 browser。</p>
        <label>密碼
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }}
            inputMode="numeric"
            type="password"
            autoComplete="current-password"
            autoFocus={shouldAutoFocusUnlockInput()}
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
