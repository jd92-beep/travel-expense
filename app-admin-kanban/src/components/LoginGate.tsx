import { lazy, Suspense, useState } from 'react';
import { KeyRound, Lock, Shield } from 'lucide-react';
import { AdminApiError, enrollBossPasskey, ensureWebAuthnFocus, loginAdmin } from '../lib/adminApi';
import type { AdminSession } from '../lib/types';
import { useEffectsTier } from '../lib/performance';
import { BlurFade } from './fx/BlurFade';
import Particles from './fx/Particles';

// three.js only ships to browsers that land on the `full` effects tier — lazy + Suspense
// keeps it out of the main chunk entirely (verified in the production build output).
const LoginScene3D = lazy(() => import('./fx/LoginScene3D'));

export function LoginGate({ onLogin }: { onLogin: (session: AdminSession) => void }) {
  const tier = useEffectsTier();
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [enrollmentRequired, setEnrollmentRequired] = useState(false);
  const [bootstrapSecret, setBootstrapSecret] = useState('');
  const [passkeyLabel, setPasskeyLabel] = useState('Boss device');

  async function submit() {
    if (!passphrase) return;
    setBusy(true);
    setError('');
    try {
      onLogin(await loginAdmin(passphrase));
    } catch (err) {
      if (err instanceof AdminApiError && err.code === 'MFA_REQUIRED' && /enrollment/i.test(err.message)) {
        setEnrollmentRequired(true);
      }
      setError(err instanceof Error ? err.message : '管理員登入失敗');
    } finally {
      setBusy(false);
    }
  }

  async function enroll() {
    if (!passphrase || !bootstrapSecret) return;
    try {
      ensureWebAuthnFocus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey 登記失敗');
      return;
    }
    setBusy(true);
    setError('');
    try {
      onLogin(await enrollBossPasskey(passphrase, bootstrapSecret, passkeyLabel));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Passkey 登記失敗');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <div className="login-fx" aria-hidden="true">
        {tier === 'full' && (
          <Suspense fallback={null}>
            <LoginScene3D />
          </Suspense>
        )}
        {tier === 'balanced' && <Particles />}
      </div>
      <BlurFade className="login-panel">
        <div className="brand-mark"><Shield size={30} /></div>
        <BlurFade delay={0.05}>
          <h1>Travel Expense Admin Console</h1>
        </BlurFade>
        <p>管理員驗證</p>
        <label>
          管理員通行片語
          <input
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void (enrollmentRequired ? enroll() : submit());
            }}
            type="password"
            autoComplete="current-password"
            placeholder="輸入目前通行片語"
          />
        </label>
        {enrollmentRequired && (
          <>
            <label>
              Bootstrap secret
              <input
                value={bootstrapSecret}
                onChange={(event) => setBootstrapSecret(event.target.value)}
                type="password"
                autoComplete="one-time-code"
              />
            </label>
            <label>
              Passkey 名稱
              <input
                value={passkeyLabel}
                onChange={(event) => setPasskeyLabel(event.target.value)}
                type="text"
                autoComplete="off"
              />
            </label>
          </>
        )}
        {error && <p className="error-line">{error}</p>}
        {enrollmentRequired ? (
          <button className="primary-command" type="button" disabled={busy || !passphrase || !bootstrapSecret} onClick={() => void enroll()}>
            <KeyRound size={16} /> {busy ? '登記中' : '登記 Boss Passkey'}
          </button>
        ) : (
          <button className="primary-command" type="button" disabled={busy || !passphrase} onClick={() => void submit()}>
            <Lock size={16} /> {busy ? '驗證中' : '使用 Passkey 登入'}
          </button>
        )}
      </BlurFade>
    </main>
  );
}
