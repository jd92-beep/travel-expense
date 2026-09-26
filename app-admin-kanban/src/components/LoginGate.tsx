import { lazy, Suspense, useEffect, useState } from 'react';
import { KeyRound, Lock, Shield, TriangleAlert } from 'lucide-react';
import { AdminApiError, ensureWebAuthnFocus, loginAdmin } from '../lib/adminApi';
import type { AdminSession } from '../lib/types';
import { useEffectsTier } from '../lib/performance';
import { BlurFade } from './fx/BlurFade';
import { GradientButton } from './fx/GradientButton';
import Particles from './fx/Particles';

// three.js only ships to browsers that land on the `full` effects tier — lazy + Suspense
// keeps it out of the main chunk entirely (verified in the production build output).
const LoginScene3D = lazy(() => import('./fx/LoginScene3D'));

type IdleCapableWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function LoginGate(
  { onLogin, active = true }: {
    onLogin: (session: AdminSession) => void;
    /** False while a session pre-check is still pending: the heavy three.js chunk must not
     * start downloading until the gate knows this visit will actually present the login
     * form. */
    active?: boolean;
  },
) {
  const tier = useEffectsTier();
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [enrollmentClosed, setEnrollmentClosed] = useState(false);
  // The 3D showpiece mounts only after first paint, in an idle window (setTimeout fallback
  // ~200ms) — and only once `active` says this visit is really staying on the login form.
  // The form itself is never gated on this state.
  const [sceneReady, setSceneReady] = useState(false);

  useEffect(() => {
    if (!active || tier !== 'full' || sceneReady) return;
    const idleWindow = window as IdleCapableWindow;
    let cancelled = false;
    const start = () => {
      if (!cancelled) setSceneReady(true);
    };
    if (typeof idleWindow.requestIdleCallback === 'function') {
      const handle = idleWindow.requestIdleCallback(start, { timeout: 1200 });
      return () => {
        cancelled = true;
        idleWindow.cancelIdleCallback?.(handle);
      };
    }
    const handle = window.setTimeout(start, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [active, tier, sceneReady]);

  function resetToLogin() {
    setEnrollmentClosed(false);
    setError('');
  }

  async function submit() {
    if (!passphrase) return;
    setBusy(true);
    setError('');
    setEnrollmentClosed(false);
    try {
      try {
        ensureWebAuthnFocus();
      } catch (focusError) {
        setError(focusError instanceof Error ? focusError.message : 'Passkey 需要此分頁有焦點');
        return;
      }
      onLogin(await loginAdmin(passphrase));
    } catch (err) {
      if (err instanceof AdminApiError && (
        err.code === 'PROTECTED_TARGET' ||
        (err.code === 'MFA_REQUIRED' && /enrollment/i.test(err.message))
      )) {
        setEnrollmentClosed(true);
        setError('Bootstrap passkey 登記已永久關閉。請使用已登記的 Boss passkey 登入；若全部遺失，請執行 break-glass runbook。');
      } else if (err instanceof AdminApiError && err.code === 'WEBAUTHN_FOCUS_REQUIRED') {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : '管理員登入失敗');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <div className="login-fx" aria-hidden="true">
        {tier === 'full' && sceneReady && (
          <Suspense fallback={null}>
            <LoginScene3D />
          </Suspense>
        )}
        {tier === 'balanced' && <Particles />}
      </div>
      <BlurFade className="login-panel">
        <div className="brand-mark"><Shield size={30} /></div>
        <BlurFade delay={0.05}>
          <h1 className="glitch-title" data-text="Travel Expense Admin Console">
            Travel Expense Admin Console
          </h1>
        </BlurFade>
        <p>管理員驗證</p>
        <label>
          管理員通行片語
          <input
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !enrollmentClosed) void submit();
            }}
            type="password"
            autoComplete="current-password"
            placeholder="輸入目前通行片語"
          />
        </label>
        {enrollmentClosed && (
          <div className="operation-error" role="alert">
            <TriangleAlert size={20} />
            <div>
              <strong>Bootstrap 登記已關閉</strong>
              <p>
                首次 passkey enrollment 已完成並永久關閉。請使用現有 Boss passkey 繼續登入；
                若所有 passkey 均不可用，請依 break-glass runbook 處理，勿再輸入 bootstrap secret。
              </p>
            </div>
          </div>
        )}
        {error && !enrollmentClosed && <p className="error-line">{error}</p>}
        {enrollmentClosed ? (
          <GradientButton variant="cyan" type="button" onClick={resetToLogin}>
            <KeyRound size={16} /> 返回登入
          </GradientButton>
        ) : (
          <GradientButton variant="magenta" type="button" disabled={busy || !passphrase} onClick={() => void submit()}>
            <Lock size={16} /> {busy ? '驗證中' : '使用通行片語與 Passkey 登入'}
          </GradientButton>
        )}
      </BlurFade>
    </main>
  );
}
