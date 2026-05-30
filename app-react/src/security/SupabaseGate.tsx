import type { ReactNode } from 'react';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { useSupabaseAuth } from '../lib/supabase';
import nanoBananaImage from '../assets/nano_banana.png';

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

  if (!auth.configured) return <>{children}</>;

  if (auth.loading) {
    return (
      <main className="lock-screen">
        <section className="lock-panel canva-lock-panel" aria-label="Supabase reconnect">
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
    <main className="lock-screen welcome-guide-backdrop" style={{ display: 'grid', placeItems: 'center', background: 'rgba(23, 18, 12, 0.4)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', width: '100vw', height: '100vh', position: 'fixed', inset: 0 }}>
      <section className="lock-panel canva-lock-panel" style={{ width: 'min(380px, 90vw)', background: 'rgba(255, 255, 255, 0.85)', border: '1px solid rgba(255, 255, 255, 0.6)', borderRadius: '28px', padding: '24px 28px', boxShadow: '0 30px 70px rgba(42, 30, 18, 0.22)', backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)' }} aria-label="Travel Expense Supabase login">
        
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <img 
            src={nanoBananaImage} 
            alt="Explore Japan - A Banana Adventure" 
            style={{ 
              width: '140px', 
              height: '140px', 
              borderRadius: '24px', 
              objectFit: 'cover', 
              boxShadow: '0 12px 28px rgba(0, 0, 0, 0.15)', 
              marginBottom: '14px',
              border: '2px solid rgba(255, 255, 255, 0.8)'
            }} 
          />
          <p className="eyebrow" style={{ margin: '0 0 4px 0', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#6D5643' }}>
            Travel Expense Cloud
          </p>
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#2A1E12' }}>
            {activeTab === 'signin' && '密碼登入 🔑'}
            {activeTab === 'signup' && '註冊新帳號 ✨'}
            {activeTab === 'magiclink' && '無密碼連結登入 ✉️'}
          </h1>
        </div>

        <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#6B7280', textAlign: 'center', lineHeight: 1.5 }}>
          每個帳號皆有獨立隔離嘅 trips 同 receipts；個人 Notion mirror 亦可在進入後自行設定。
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', background: 'rgba(30, 77, 107, 0.05)', padding: '3px', borderRadius: '10px', marginBottom: '16px' }}>
          <button
            onClick={() => { setActiveTab('signin'); setStatus(''); }}
            type="button"
            style={{ border: 0, padding: '7px 4px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', background: activeTab === 'signin' ? 'white' : 'transparent', color: activeTab === 'signin' ? '#CC2929' : '#6B7280', boxShadow: activeTab === 'signin' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s' }}
          >
            密碼登入
          </button>
          <button
            onClick={() => { setActiveTab('signup'); setStatus(''); }}
            type="button"
            style={{ border: 0, padding: '7px 4px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', background: activeTab === 'signup' ? 'white' : 'transparent', color: activeTab === 'signup' ? '#CC2929' : '#6B7280', boxShadow: activeTab === 'signup' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s' }}
          >
            新戶註冊
          </button>
          <button
            onClick={() => { setActiveTab('magiclink'); setStatus(''); }}
            type="button"
            style={{ border: 0, padding: '7px 4px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, cursor: 'pointer', background: activeTab === 'magiclink' ? 'white' : 'transparent', color: activeTab === 'magiclink' ? '#CC2929' : '#6B7280', boxShadow: activeTab === 'magiclink' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none', transition: 'all 0.2s' }}
          >
            Email連結
          </button>
        </div>

        <div style={{ display: 'grid', gap: '12px' }}>
          <label style={{ display: 'grid', gap: '4px', fontSize: '12px', fontWeight: 800, color: '#374151' }}>
            Email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              style={{ width: '100%', padding: '9px 12px', border: '1px solid rgba(139, 115, 85, 0.22)', borderRadius: '8px', fontSize: '13px', outline: 'none', background: 'white' }}
            />
          </label>

          {activeTab !== 'magiclink' && (
            <label style={{ display: 'grid', gap: '4px', fontSize: '12px', fontWeight: 800, color: '#374151' }}>
              密碼 (最少 6 位)
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }}
                type="password"
                autoComplete={activeTab === 'signin' ? 'current-password' : 'new-password'}
                placeholder="請輸入密碼"
                style={{ width: '100%', padding: '9px 12px', border: '1px solid rgba(139, 115, 85, 0.22)', borderRadius: '8px', fontSize: '13px', outline: 'none', background: 'white' }}
              />
            </label>
          )}

          {auth.error && <p className="lock-error" style={{ margin: 0, fontSize: '11px', color: '#DC2626', fontWeight: 700, textAlign: 'center' }}>{auth.error}</p>}
          {status && <p className="muted" style={{ margin: 0, fontSize: '11px', color: '#059669', fontWeight: 700, textAlign: 'center', lineHeight: 1.4 }}>{status}</p>}

          <button
            onClick={submit}
            disabled={busy || !email.trim() || (activeTab !== 'magiclink' && !password)}
            type="button"
            className="primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              width: '100%',
              padding: '11px',
              borderRadius: '10px',
              border: 0,
              background: busy || !email.trim() || (activeTab !== 'magiclink' && !password) ? '#9CA3AF' : 'linear-gradient(135deg, #CC2929, #E07B39)',
              color: 'white',
              fontSize: '13px',
              fontWeight: 900,
              cursor: busy || !email.trim() || (activeTab !== 'magiclink' && !password) ? 'default' : 'pointer',
              boxShadow: '0 4px 12px rgba(204, 41, 41, 0.15)',
              marginTop: '4px'
            }}
          >
            {activeTab === 'signin' && (busy ? '登入中...' : '🔑 帳號密碼登入')}
            {activeTab === 'signup' && (busy ? '註冊中...' : '✨ 註冊新帳號')}
            {activeTab === 'magiclink' && (busy ? '寄送中...' : '✉️ 寄出登入連結')}
          </button>
        </div>
      </section>
    </main>
  );
}
