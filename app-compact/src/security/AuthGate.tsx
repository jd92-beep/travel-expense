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
import { clearDeviceTrust, hasDeviceTrust, loadDeviceTrustMeta, setDeviceTrust } from './deviceTrust';
import {
  clearTrustedDevice,
  createTrustedDeviceRegistration,
  loadTrustedDevice,
  saveTrustedDevice,
  signTrustedDeviceChallenge,
} from './trustedDevice';
import { useTripTheme } from '../theme/tripTheme';

const FLAG_ONLY_SESSION = 'travel-expense-react:device-trust:flag-only:v1';

function shouldAutoFocusUnlockInput(): boolean {
  if (typeof window === 'undefined') return false;
  return !window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;
}

export function AuthGate({
  children,
  credentialBrokerUrl,
  onBrokerSession,
  onUnlocked,
  onOfflineMode,
}: {
  children: ReactNode;
  credentialBrokerUrl?: string;
  onBrokerSession?: (session: BrokerSession) => void;
  onUnlocked?: () => void;
  onOfflineMode?: (message: string) => void;
}) {
  const { theme } = useTripTheme();
  const [unlocked, setUnlocked] = useState(() => false);
  const [checking, setChecking] = useState(() => hasDeviceTrust());
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const onBrokerSessionRef = useRef(onBrokerSession);
  const onOfflineModeRef = useRef(onOfflineMode);
  const onUnlockedRef = useRef(onUnlocked);
  const routeStop = theme.id === 'japan_washi' ? 'TYO' : theme.id === 'taiwan_nightmarket' ? 'TPE' : theme.id === 'korea_editorial' ? 'SEL' : 'TRIP';

  useEffect(() => {
    onBrokerSessionRef.current = onBrokerSession;
    onOfflineModeRef.current = onOfflineMode;
    onUnlockedRef.current = onUnlocked;
  }, [onBrokerSession, onOfflineMode, onUnlocked]);

  useEffect(() => {
    let alive = true;
    async function restoreSession() {
      const flagOnlySession = sessionStorage.getItem(FLAG_ONLY_SESSION) === '1';
      if (!hasDeviceTrust() && !flagOnlySession) {
        setChecking(false);
        setUnlocked(false);
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
      const trustMeta = loadDeviceTrustMeta();
      // A trust flag that claims a deviceId the local crypto key cannot prove is a forgery
      // (or a wiped key store) — re-lock instead of silently unlocking offline.
      if (trustMeta?.deviceId && (!device || device.deviceId !== trustMeta.deviceId)) {
        if (!alive) return;
        clearDeviceTrust();
        setChecking(false);
        setUnlocked(false);
        setError('裝置信任無效，請重新輸入密碼解鎖。');
        return;
      }
      // Legacy/smoke trust flag without deviceId or crypto key: open offline for this
      // page session only. Drop the durable flag so the next cold open requires password.
      if (!device) {
        if (!alive) return;
        try { sessionStorage.setItem(FLAG_ONLY_SESSION, '1'); } catch { /* best effort */ }
        if (hasDeviceTrust() && !trustMeta?.deviceId) clearDeviceTrust();
        setChecking(false);
        setUnlocked(true);
        setError('');
        onOfflineModeRef.current?.('未找到裝置金鑰，已以離線模式開啟。重新解鎖可恢復雲端同步。');
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
        onUnlockedRef.current?.();
      } catch (refreshError) {
        if (!alive) return;
        console.info('Credential Broker trusted-device refresh failed:', redactedError(refreshError));
        const message = refreshError instanceof Error ? refreshError.message : String(refreshError);
        // Only wipe durable trust on definitive auth failure — not on transient network/5xx.
        const definitive = /\b401\b|\b403\b|invalid signature|unauthorized|device revoked|revoked/i.test(message);
        if (definitive) {
          clearDeviceTrust();
          await clearTrustedDevice();
        }
        if (!alive) return;
        setUnlocked(true);
        setError('');
        onOfflineModeRef.current?.(definitive
          ? 'Broker session 已失效，已切換離線模式。請重新解鎖以恢復雲端同步。'
          : '暫時未能連接 Broker，已以離線模式開啟。網絡回復後會自動同步。');
        onUnlockedRef.current?.();
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
    if (busy || !password.trim()) return;
    setBusy(true);
    setError('');
    try {
      const trustedDevice = await createTrustedDeviceRegistration();
      const brokerSession = await unlockCredentialBroker(password, { credentialBrokerUrl }, {
        devicePublicKey: trustedDevice.devicePublicKey,
        deviceName: trustedDevice.deviceName,
      });
      if (!brokerSession.device) throw new Error('Credential Broker did not register this device');
      await saveTrustedDevice(brokerSession.device, trustedDevice.privateKey);
      setDeviceTrust(brokerSession.device.deviceId);
      try { sessionStorage.removeItem(FLAG_ONLY_SESSION); } catch { /* best effort */ }
      onBrokerSession?.(brokerSession);
      setUnlocked(true);
      setPassword('');
      onUnlocked?.();
    } catch (submitError) {
      const message = redactedError(submitError);
      setError(message.includes('401') || /invalid|unlock failed/i.test(message)
        ? '密碼唔正確，請再試一次。'
        : `解鎖失敗：${message}`);
      window.requestAnimationFrame(() => passwordInputRef.current?.focus());
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
          <span>{routeStop}</span>
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
            ref={passwordInputRef}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }}
            inputMode="numeric"
            type="password"
            autoComplete="current-password"
            autoFocus={shouldAutoFocusUnlockInput()}
            aria-describedby={error ? 'auth-gate-error' : undefined}
            aria-invalid={error ? true : undefined}
          />
        </label>
        {error && <p className="lock-error" id="auth-gate-error" role="alert">{error}</p>}
        <button className="primary" type="button" disabled={busy || !password.trim()} onClick={submit}>
          <ShieldCheck size={18} /> {busy ? '檢查中' : '解鎖'}
        </button>
      </section>
    </main>
  );
}
