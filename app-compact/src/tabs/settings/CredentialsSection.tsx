import { AlertTriangle, CheckCircle2, KeyRound, Server, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { AccordionCard } from '../../components/AccordionCard';
import { testGoogleBackupConnection, testKimiConnection } from '../../lib/ai';
import {
  brokerHealth,
  disconnectPersonalNotionIntegration,
  getConnectionStatus,
  redactedError,
  registerPersonalNotionIntegration,
  rotateProviderCredential,
  unlockCredentialBroker,
  type CredentialProvider,
  type ConnectionStatus,
  type PersonalNotionStatus,
  type ProviderStatus,
} from '../../lib/credentialBroker';
import {
  hasDirectNotionToken,
} from '../../lib/notion';
import { extractNotionDatabaseId } from '../../lib/notionAccess';
import { clearCredentialSession } from '../../lib/storage';
import { type SettingsContext } from './shared';

export function CredentialsSection({ ctx, brokerReady, personalNotionStatus, setPersonalNotionStatus, personalNotionDb, setPersonalNotionDb, applyPersonalNotionConnection }: { ctx: SettingsContext; brokerReady: boolean; personalNotionStatus: PersonalNotionStatus | null; setPersonalNotionStatus: (status: PersonalNotionStatus) => void; personalNotionDb: string; setPersonalNotionDb: (value: string) => void; applyPersonalNotionConnection: (databaseId: string, connected: boolean) => void }) {
  const { state, updateState, busy, setStatus, run, cloudSyncAvailable, showStressPanel } = ctx;
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [rotationProvider, setRotationProvider] = useState<CredentialProvider>('notion');
  const [rotationSecret, setRotationSecret] = useState('');
  const [rotationAdmin, setRotationAdmin] = useState('');
  const [rotationDb, setRotationDb] = useState(state.notionDb || '');
  const [brokerPassword, setBrokerPassword] = useState('');
  const [personalNotionToken, setPersonalNotionToken] = useState('');
  const [confirmDisconnectNotion, setConfirmDisconnectNotion] = useState(false);
  const confirmDisconnectNotionTimerRef = useRef(0);

  function statusFor(provider: CredentialProvider): ProviderStatus {
    return connectionStatus?.providers.find((item) => item.provider === provider) || { provider, status: 'unknown' };
  }

  function statusPill(provider: CredentialProvider) {
    const item = statusFor(provider);
    // Kids/simple mode: hide missing/unknown provider noise — only show healthy or broken states.
    if (item.status === 'unknown' || item.status === 'missing') return null;
    const ok = item.status === 'connected';
    return <span className={`pill ${ok ? 'ok' : 'hot'}`}>{ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {provider}: {item.status}</span>;
  }

  async function refreshCredentialStatus() {
    await run('Credential status', async () => {
      const [health, statusResult] = await Promise.all([
        brokerHealth(state),
        getConnectionStatus(state),
      ]);
      setConnectionStatus(statusResult);
      return `${health} · ${statusResult.providers.map((item) => `${item.provider}:${item.status}`).join(' · ')}`;
    });
  }

  async function connectCredentialBroker() {
    const password = brokerPassword.trim();
    if (!password) {
      setStatus('請輸入 Credential Broker password');
      return;
    }
    try {
      await run('Connect broker', async () => {
        const session = await unlockCredentialBroker(
          password,
          { credentialBrokerUrl: state.credentialBrokerUrl },
          undefined,
          { persist: !cloudSyncAvailable },
        );
        updateState({
          credentialSession: session.credentialSession,
          credentialSessionExpiresAt: session.credentialSessionExpiresAt,
        });
        if (cloudSyncAvailable) clearCredentialSession();
        return cloudSyncAvailable
          ? 'Broker session 已連上；今次 Supabase session 可使用 AI，並可同步 mirror 到 Notion。'
          : 'Broker session 已連上。';
      });
    } finally {
      setBrokerPassword('');
    }
  }

  async function rotateCredential() {
    try {
      if (!requireBroker('Rotate credential')) return;
      if (!rotationSecret.trim() || !rotationAdmin.trim()) {
        setStatus('請輸入新 credential 同 admin maintenance passphrase');
        return;
      }
      await run(`Rotate ${rotationProvider}`, async () => {
        const statusResult = await rotateProviderCredential(
          state,
          rotationProvider,
          rotationSecret,
          rotationAdmin,
          rotationProvider === 'notion' ? { databaseId: rotationDb.trim() || state.notionDb } : {},
        );
        setConnectionStatus((prev) => ({
          broker: prev?.broker || 'online',
          providers: [
            ...(prev?.providers || []).filter((item) => item.provider !== rotationProvider),
            statusResult,
          ],
        }));
        return `${rotationProvider} 已安全更新：${statusResult.status}`;
      });
    } finally {
      setRotationSecret('');
      setRotationAdmin('');
    }
  }


  function friendlyNotionConnectError(error: unknown): string {
    const message = redactedError(error);
    if (/credential test failed/i.test(message)) {
      return 'Notion 拒絕咗呢個組合：請檢查 (1) secret 係咪正確嘅 integration token；(2) 個 database 有冇喺 Connections 邀請咗個 integration。';
    }
    if (/token missing/i.test(message)) return '未收到 secret：請重新貼上你嘅 Notion integration secret。';
    if (/database id missing/i.test(message)) return '未收到 database：請貼上 Notion database 網址或 ID。';
    if (/未連線|network|failed to fetch|timeout/i.test(message)) return '暫時連唔到 Credential Broker 或網絡不穩，請檢查網絡後再試。';
    return message;
  }

  async function connectPersonalNotion() {
    if (!cloudSyncAvailable) {
      setStatus('請先登入 Supabase，先可以綁定你自己嘅 Notion notebook。');
      return;
    }
    const secret = personalNotionToken.trim();
    const databaseId = extractNotionDatabaseId(personalNotionDb);
    if (!secret) {
      setStatus('請輸入你自己嘅 Notion integration secret。');
      return;
    }
    if (!databaseId) {
      setStatus('個 database 資料睇落唔正確：可以貼成條 Notion database 網址，系統會自動抽出 ID。');
      return;
    }
    try {
      await run('連接 Personal Notion', async () => {
        let result: PersonalNotionStatus;
        try {
          result = await registerPersonalNotionIntegration(state, secret, databaseId);
        } catch (error) {
          throw new Error(friendlyNotionConnectError(error));
        }
        setPersonalNotionStatus(result);
        applyPersonalNotionConnection(result.databaseId || databaseId, result.status === 'connected');
        return result.status === 'connected'
          ? 'Personal Notion 已安全連接；之後新嘅記帳會自動同步 Supabase 同鏡像到你嘅 Notion。'
          : `Personal Notion 狀態：${result.status}`;
      });
    } finally {
      setPersonalNotionToken('');
    }
  }

  function armDisconnectNotion() {
    if (!confirmDisconnectNotion) {
      setConfirmDisconnectNotion(true);
      window.clearTimeout(confirmDisconnectNotionTimerRef.current);
      confirmDisconnectNotionTimerRef.current = window.setTimeout(() => setConfirmDisconnectNotion(false), 3000);
      return;
    }
    window.clearTimeout(confirmDisconnectNotionTimerRef.current);
    setConfirmDisconnectNotion(false);
    void disconnectPersonalNotion();
  }

  async function disconnectPersonalNotion() {
    if (!cloudSyncAvailable) {
      setStatus('請先登入 Supabase。');
      return;
    }
    await run('Disconnect Personal Notion', async () => {
      const result = await disconnectPersonalNotionIntegration(state);
      setPersonalNotionStatus(result);
      applyPersonalNotionConnection('', false);
      return '已斷開 Personal Notion mirror；Supabase 資料仍會保留。';
    });
  }

  function requireBroker(label: string, allowCloudSync = false) {
    if (brokerReady || hasDirectNotionToken() || (allowCloudSync && cloudSyncAvailable)) return true;
    setStatus(`${label} 已安全暫停：Credential Broker session 未連線；未送出任何 provider key/token。`);
    return false;
  }

  return (
    <>
    <AccordionCard
      id="settings-credentials"
      eyebrow="可選"
      title="連線（進階）"
      icon={<KeyRound />}
      defaultOpen={false}
      meta={(
        <span className={`pill ${personalNotionStatus?.status === 'connected' ? 'ok' : ''}`}>
          Notion {personalNotionStatus?.status === 'connected' ? '已連接' : cloudSyncAvailable ? '未連接' : '登入後可用'}
        </span>
      )}
    >
      <p className="muted">連接你自己嘅 Notion database 之後，新嘅記帳會自動同步 Supabase，同時鏡像一份落你嘅 Notion（可選備份）。連接狀態睇上面嘅 Notion 鏡像指示。</p>
      {cloudSyncAvailable && (
        <div className="rotation-box">
          <div className="section-head">
            <h2>個人 Notion（可選）</h2>
            <span className={`pill ${personalNotionStatus?.status === 'connected' ? 'ok' : ''}`}>
              {personalNotionStatus?.status === 'connected' ? '已連接' : '未連接'}
            </span>
          </div>
          <p className="muted">1）喺 notion.so/my-integrations 建立 integration，複製個 secret；2）喺你嘅 Notion database 右上角「⋯」→ Connections 邀請返個 integration；3）貼資料落嚟按連接。Secret 只會送去 Credential Broker 加密保存，唔會留喺部機。</p>
          <label>Notion database
            <input value={personalNotionDb} onChange={(e) => setPersonalNotionDb(e.target.value)} placeholder="Database 網址或 ID" />
          </label>
          <label>Integration secret
            <input
              type="password"
              value={personalNotionToken}
              onChange={(e) => setPersonalNotionToken(e.target.value)}
              placeholder="貼上 ntn_… secret"
              autoComplete="off"
            />
          </label>
          <div className="action-row wrap">
            <button className="primary" type="button" disabled={!!busy || !personalNotionToken.trim() || !personalNotionDb.trim()} onClick={() => void connectPersonalNotion()}>
              連接
            </button>
            <button className={confirmDisconnectNotion ? 'primary' : 'secondary'} type="button" disabled={!!busy || personalNotionStatus?.status !== 'connected'} onClick={armDisconnectNotion}>
              {confirmDisconnectNotion ? '確認中斷？' : '中斷連接'}
            </button>
          </div>
          <p className="muted">中斷後會停止寫新紀錄入你嘅 Notion；已經寫入嘅內容會保留，Supabase 資料唔受影響。</p>
        </div>
      )}
      {!brokerReady && !cloudSyncAvailable && (
        <div className="form-grid">
          <label>Broker password
            <input
              type="password"
              value={brokerPassword}
              onChange={(e) => setBrokerPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void connectCredentialBroker(); }}
              autoComplete="current-password"
              placeholder="解鎖 AI"
            />
          </label>
          <button className="primary" type="button" disabled={!!busy || !brokerPassword.trim()} onClick={() => void connectCredentialBroker()}>
            連接
          </button>
        </div>
      )}
      {showStressPanel && (
        <div className="credential-status-grid">
          <span className={`pill ${brokerReady || cloudSyncAvailable ? 'ok' : 'hot'}`}>
            <Server size={14} /> Session: {brokerReady ? 'active' : cloudSyncAvailable ? 'active (Supabase)' : 'missing'}
          </span>
          {statusPill('notion')}
          {statusPill('kimi')}
          {statusPill('google')}
          {statusPill('weatherapi')}
        </div>
      )}
      {showStressPanel && (<div className="action-row wrap">
        <button className="secondary" type="button" disabled={!!busy} onClick={refreshCredentialStatus}>
          Test all connections
        </button>
        <button className="secondary" type="button" disabled={!!busy} onClick={() => run('測試 Kimi', async () => testKimiConnection(state))}>
          Test Kimi
        </button>
        <button className="secondary" type="button" disabled={!!busy} onClick={() => run('測試 Google backup', async () => testGoogleBackupConnection(state))}>
          Test Google
        </button>
      </div>)}
      {showStressPanel && (<div className="rotation-box">
        <div className="form-grid">
          <label>Provider
            <select value={rotationProvider} onChange={(e) => setRotationProvider(e.target.value as CredentialProvider)}>
              <option value="notion">Notion token</option>
              <option value="kimi">Kimi key</option>
              <option value="google">Google backup key</option>
              <option value="weatherapi">WeatherAPI.com key</option>
            </select>
          </label>
          <label>Admin maintenance passphrase
            <input type="password" value={rotationAdmin} onChange={(e) => setRotationAdmin(e.target.value)} autoComplete="off" />
          </label>
        </div>
        <label>New credential
          <input type="password" value={rotationSecret} onChange={(e) => setRotationSecret(e.target.value)} autoComplete="off" placeholder="Only sent once to Credential Broker" />
        </label>
        {rotationProvider === 'notion' && (
          <label>Notion database ID（可選）
            <input value={rotationDb} onChange={(e) => setRotationDb(e.target.value)} />
          </label>
        )}
        <button className="primary" type="button" disabled={!!busy} onClick={rotateCredential}>
          <ShieldCheck size={18} /> Rotate safely
        </button>
      </div>)}
    </AccordionCard>
    </>
  );
}
