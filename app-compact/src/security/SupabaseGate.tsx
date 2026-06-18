import type { ReactNode } from 'react';
import { useState } from 'react';
import { CloudSun, KeyRound, Link2, ShieldCheck, Sparkles } from 'lucide-react';
import type { useSupabaseAuth } from '../lib/supabase';
import travelAiAtlasImage from '../assets/atmosphere/travel-ai-atlas.webp';

type SupabaseAuth = ReturnType<typeof useSupabaseAuth>;

type SupabaseGateProps = {
  auth: SupabaseAuth;
  children: ReactNode;
};

export function SupabaseGate({ auth, children }: SupabaseGateProps) {
  const [activeTab, setActiveTab] = useState<'signin' | 'signup' | 'magiclink'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim()) return;
    setBusy(true);
    setStatus('');
    try {
      if (activeTab === 'magiclink') {
        await auth.sendMagicLink(email);
        setStatus('登入連結已寄出，請到 email 確認。');
      } else if (activeTab === 'signin') {
        if (!password) throw new Error('請輸入密碼');
        await auth.signInWithPassword(email, password);
        setStatus('登入成功！');
      } else if (activeTab === 'signup') {
        if (password.length < 6) throw new Error('密碼長度最少需要 6 個字元');
        await auth.signUpWithPassword(email, password);
        setStatus('註冊成功！如果你嘅 Supabase 專案有啟用 Email 驗證，請先去 email 點擊確認連結激活帳號；若無啟用，即可直接登入。');
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '認證操作失敗');
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleLogin() {
    setBusy(true);
    setStatus('');
    const nativeAndroid = typeof window !== 'undefined'
      && !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
      && /Android/i.test(navigator.userAgent || '');
    try {
      await auth.signInWithGoogle();
      // On native the call resolves once the system browser opens; auth completes after the
      // deep-link returns. Tell the user so the screen doesn't look frozen.
      if (nativeAndroid) setStatus('已開啟瀏覽器，完成 Google 登入後會自動返回 App…');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Google 登入失敗');
    } finally {
      // Always clear busy — if the OAuth redirect is delayed or blocked the button
      // would otherwise stay stuck in the loading state forever.
      setBusy(false);
    }
  }

  if (!auth.configured) return <>{children}</>;

  if (auth.loading) {
    return (
      <main className="lock-screen compact-login-screen">
        <section className="lock-panel canva-lock-panel compact-login-panel compact-login-panel--loading" aria-label="Supabase reconnect">
          <div className="lock-icon"><ShieldCheck size={28} /></div>
          <p className="eyebrow">Travel Expense Cloud</p>
          <h1>連接 Supabase</h1>
          <p className="muted">正在確認你嘅登入 session。</p>
        </section>
      </main>
    );
  }

  if (auth.session) return <>{children}</>;

  return (
    <main className="lock-screen compact-login-screen">
      <section className="lock-panel compact-login-panel" aria-label="Travel Expense Supabase login">
        <div className="compact-login-visual" aria-hidden="true">
          <img src={travelAiAtlasImage} alt="" />
          <div className="compact-login-visual-shade" />
          <div className="compact-login-badge">
            <Sparkles size={14} />
            <span>Travel Ledger</span>
          </div>
          <div className="compact-login-weather">
            <CloudSun size={16} />
            <span>Cloud Sync</span>
          </div>
        </div>

        <div className="compact-login-head">
          <p className="eyebrow">Travel Expense Cloud</p>
          <h1>
            {activeTab === 'signin' && '旅程雲端登入'}
            {activeTab === 'signup' && '建立旅程帳號'}
            {activeTab === 'magiclink' && 'Email 連結登入'}
          </h1>
          <p>Trips, receipts, weather and AI notes stay with your own account.</p>
        </div>

        <div className="compact-login-tabs" role="tablist" aria-label="Login options">
          <button
            className={activeTab === 'signin' ? 'is-active' : ''}
            onClick={() => { setActiveTab('signin'); setStatus(''); }}
            type="button"
          >
            <KeyRound size={13} />
            <span>密碼</span>
          </button>
          <button
            className={activeTab === 'signup' ? 'is-active' : ''}
            onClick={() => { setActiveTab('signup'); setStatus(''); }}
            type="button"
          >
            <Sparkles size={13} />
            <span>註冊</span>
          </button>
          <button
            className={activeTab === 'magiclink' ? 'is-active' : ''}
            onClick={() => { setActiveTab('magiclink'); setStatus(''); }}
            type="button"
          >
            <Link2 size={13} />
            <span>Email</span>
          </button>
        </div>

        <div className="compact-login-form">
          <label>
            <span>Email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>

          {activeTab !== 'magiclink' && (
            <label>
              <span>密碼</span>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }}
                type="password"
                autoComplete={activeTab === 'signin' ? 'current-password' : 'new-password'}
                placeholder="請輸入密碼"
              />
            </label>
          )}

          {auth.error && <p className="lock-error compact-login-message">{auth.error}</p>}
          {status && <p className="muted compact-login-message compact-login-message--ok">{status}</p>}

          <button
            onClick={submit}
            disabled={busy || !email.trim() || (activeTab !== 'magiclink' && !password)}
            type="button"
            className="compact-login-primary"
          >
            {activeTab === 'signin' && (busy ? '登入中...' : '帳號密碼登入')}
            {activeTab === 'signup' && (busy ? '註冊中...' : '註冊新帳號')}
            {activeTab === 'magiclink' && (busy ? '寄送中...' : '寄出登入連結')}
          </button>

          <div className="compact-login-divider">
            <span>or</span>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={busy}
            type="button"
            className="compact-login-google"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.51 14.98 1 12 1 7.35 1 3.37 3.67 1.39 7.56l3.85 2.99c.9-2.7 3.42-4.51 6.76-4.51z" />
              <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.34H12v4.44h6.45c-.28 1.47-1.11 2.71-2.36 3.55l3.66 2.84c2.14-1.97 3.38-4.87 3.38-8.49z" />
              <path fill="#FBBC05" d="M5.24 14.28A7.17 7.17 0 0 1 4.75 12c0-.8.14-1.57.38-2.28L1.28 6.73A11.94 11.94 0 0 0 0 12c0 1.92.45 3.74 1.25 5.37l3.99-3.09z" />
              <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.92l-3.66-2.84c-1.01.68-2.31 1.08-4.3 1.08-3.34 0-5.86-1.81-6.76-4.51L1.39 16.9C3.37 20.33 7.35 23 12 23z" />
            </svg>
            <span>{busy ? '正在跳轉...' : '使用 Google 帳號登入'}</span>
          </button>
        </div>
      </section>
    </main>
  );
}
