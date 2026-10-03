import { FlaskConical, KeyRound, LoaderCircle, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AccordionCard } from '../../components/AccordionCard';
import { AI_MODELS, DEFAULT_TRIP_UPDATE_MODEL_ID } from '../../lib/constants';
import {
  redactedError,
  rotateProviderCredential,
  type CredentialProvider,
} from '../../lib/credentialBroker';
import { type SettingsContext } from './shared';
import { AiModelField, scanModelWithRetries } from './aiModels';

export function AiModelsSection({ ctx, brokerReady }: { ctx: SettingsContext; brokerReady: boolean }) {
  const { state, updateState, setStatus, cloudSyncAvailable, showStressPanel } = ctx;
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [apiKeyProvider, setApiKeyProvider] = useState<CredentialProvider>('kimi');
  const [apiKeySecret, setApiKeySecret] = useState('');
  const [apiKeyAdmin, setApiKeyAdmin] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [apiKeyMessage, setApiKeyMessage] = useState('');
  const [modelScanProgress, setModelScanProgress] = useState<{ done: number; total: number } | null>(null);
  const aiScanSummary = useMemo(() => {
    const scan = state.aiModelScan;
    if (!scan) return null;
    const ids = Object.keys(scan.results);
    if (!ids.length) return null;
    const ok = ids.filter((id) => scan.results[id] === 'ok').length;
    return {
      ok,
      total: ids.length,
      hiddenCount: (state.hiddenAiModels || []).length,
      atLabel: new Date(scan.at).toLocaleString('zh-HK', { hour12: false }),
    };
  }, [state.aiModelScan, state.hiddenAiModels]);
  const aiScanPillLabel = !aiScanSummary
    ? '掃描模型'
    : aiScanSummary.ok === aiScanSummary.total
      ? '全部可用'
      : `${aiScanSummary.total - aiScanSummary.ok} 個未能連接`;

  // Full-catalog model scan: tests every visible model plus every hidden one (so revived
  // models reappear), retrying failures at +5s/+10s/+15s, hiding models that never connect,
  // and leaving quota-limited models in place per the provider contract.
  async function runModelScan() {
    if (modelScanProgress) return;
    if (!brokerReady && !cloudSyncAvailable) {
      setStatus('模型掃描需要先連接 Credential Broker 或者登入 Supabase。');
      return;
    }
    const visibleIds = AI_MODELS.map((model) => model.id);
    const candidates = Array.from(new Set([...visibleIds, ...(state.hiddenAiModels || [])]));
    setModelScanProgress({ done: 0, total: candidates.length });
    const results: Record<string, 'ok' | 'quota' | 'failed'> = {};
    try {
      for (const modelId of candidates) {
        results[modelId] = await scanModelWithRetries(state, modelId);
        setModelScanProgress((progress) => (progress ? { done: progress.done + 1, total: progress.total } : progress));
      }
    } finally {
      setModelScanProgress(null);
    }
    const nextHidden = candidates.filter((id) => results[id] === 'failed');
    const quotaIds = candidates.filter((id) => results[id] === 'quota');
    const restored = (state.hiddenAiModels || []).filter((id) => results[id] === 'ok');
    updateState({
      hiddenAiModels: nextHidden,
      aiModelScan: { at: Date.now(), results },
    });
    setStatus(`模型掃描完成:${candidates.length - nextHidden.length - quotaIds.length}/${candidates.length} 個可用`
      + (quotaIds.length ? `;${quotaIds.length} 個額度用緊(保留喺清單)` : '')
      + (restored.length ? `;恢復咗 ${restored.length} 個` : '')
      + (nextHidden.length ? `;隱藏咗 ${nextHidden.length} 個` : '') + '。');
  }

  return (
    <>
    <AccordionCard
      id="settings-ai-models"
      eyebrow="進階"
      title="AI 模型選擇"
      icon={<Sparkles />}
      defaultOpen={false}
      meta={(
        <span
          role="button"
          tabIndex={0}
          className={`pill ai-scan-pill${modelScanProgress ? ' busy' : ''}`}
          aria-label="掃描所有模型"
          onClick={(event) => { event.stopPropagation(); void runModelScan(); }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.stopPropagation();
              void runModelScan();
            }
          }}
        >
          {modelScanProgress
            ? <><LoaderCircle size={12} className="spin" /> 掃描中 {modelScanProgress.done}/{modelScanProgress.total}</>
            : <><FlaskConical size={12} /> {aiScanPillLabel}</>}
        </span>
      )}
    >
      <p className="muted">平時唔使改。額度用盡時會停止，唔會自動換模型。撳右邊「掃描」會自動測試所有模型:唔到嘅會自動收起,恢復後會自動出返。</p>
      {aiScanSummary && (
        <p className="muted">
          上次掃描:{aiScanSummary.atLabel} · {aiScanSummary.ok}/{aiScanSummary.total} 個連接到
          {aiScanSummary.hiddenCount ? ` · ${aiScanSummary.hiddenCount} 個暫時隱藏(再掃描會自動測試同恢復)` : ''}
        </p>
      )}
      <div className="form-grid ai-model-grid">
        <AiModelField label="掃描 receipt 模型" value={state.scanModel} state={state} hiddenModels={state.hiddenAiModels || []} scanResults={state.aiModelScan?.results} onChange={(scanModel) => updateState({ scanModel })} />
        <AiModelField label="語音模型" value={state.voiceModel} state={state} hiddenModels={state.hiddenAiModels || []} scanResults={state.aiModelScan?.results} onChange={(voiceModel) => updateState({ voiceModel })} />
        <AiModelField label="Email 模型" value={state.emailModel} state={state} hiddenModels={state.hiddenAiModels || []} scanResults={state.aiModelScan?.results} onChange={(emailModel) => updateState({ emailModel })} />
        <AiModelField label="行程更新模型" value={state.tripUpdateModel || DEFAULT_TRIP_UPDATE_MODEL_ID} state={state} hiddenModels={state.hiddenAiModels || []} scanResults={state.aiModelScan?.results} onChange={(tripUpdateModel) => updateState({ tripUpdateModel })} />
      </div>
      {showStressPanel && (
        <>
          <label>Google backup model
            <input value={state.googleBackupModel || ''} onChange={(e) => updateState({ googleBackupModel: e.target.value })} />
          </label>
          <div style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setApiKeyModalOpen(true)}
            >
              <KeyRound size={14} /> Change API Key
            </button>
          </div>
        </>
      )}
    </AccordionCard>

    {apiKeyModalOpen && (
      <div
        className="modal-backdrop"
        role="presentation"
        onClick={() => { setApiKeyModalOpen(false); setApiKeyStatus('idle'); setApiKeyMessage(''); }}
      >
        <section
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="api-key-modal-title"
          onClick={(event) => event.stopPropagation()}
          style={{ maxWidth: '420px' }}
        >
          <div className="modal-head">
            <div>
              <h2 id="api-key-modal-title">Change API Key</h2>
              <p className="muted">更新 LLM provider 嘅 API key。Key 會安全儲存喺 Credential Broker。</p>
            </div>
            <button className="icon-button" type="button" aria-label="Close" onClick={() => { setApiKeyModalOpen(false); setApiKeyStatus('idle'); setApiKeyMessage(''); }}>
              <X size={18} />
            </button>
          </div>

          <div className="form-grid" style={{ gap: '0.75rem' }}>
            <label>Provider
              <select value={apiKeyProvider} onChange={(e) => { setApiKeyProvider(e.target.value as CredentialProvider); setApiKeyStatus('idle'); setApiKeyMessage(''); }}>
                <option value="kimi">Kimi (kimi-code, kimi-8k, kimi-32k, kimi-k2.6, kimi-for-coding)</option>
                <option value="google">Google (Gemini, Gemma — all Google models)</option>
                <option value="mimo">Mimo (Mimo v2.5, Mimo v2.5 Pro)</option>
                <option value="volcano">Volcano Engine (5 app LLM models)</option>
                <option value="weatherapi">WeatherAPI (weather forecasts)</option>
              </select>
            </label>

            <label>New API Key
              <input
                type="password"
                value={apiKeySecret}
                onChange={(e) => setApiKeySecret(e.target.value)}
                placeholder="Enter new API key"
                autoComplete="off"
              />
            </label>

            <label>Admin Passphrase
              <input
                type="password"
                value={apiKeyAdmin}
                onChange={(e) => setApiKeyAdmin(e.target.value)}
                placeholder="Admin maintenance passphrase"
                autoComplete="off"
              />
            </label>
          </div>

          {apiKeyStatus !== 'idle' && (
            <div style={{
              margin: '0.75rem 0',
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              background: apiKeyStatus === 'success' ? 'rgba(34,197,94,0.15)' : apiKeyStatus === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)',
              color: apiKeyStatus === 'success' ? '#22c55e' : apiKeyStatus === 'error' ? '#ef4444' : '#3b82f6',
            }}>
              {apiKeyStatus === 'testing' && '🔄 Testing API key...'}
              {apiKeyStatus === 'success' && `✅ ${apiKeyMessage}`}
              {apiKeyStatus === 'error' && `❌ ${apiKeyMessage}`}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
            <button
              type="button"
              className="secondary"
              onClick={() => { setApiKeyModalOpen(false); setApiKeyStatus('idle'); setApiKeyMessage(''); }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={!apiKeySecret.trim() || !apiKeyAdmin.trim() || apiKeyStatus === 'testing'}
              onClick={async () => {
                setApiKeyStatus('testing');
                setApiKeyMessage('Testing new API key...');
                // rotateProviderCredential is atomic server-side: the broker tests the CANDIDATE
                // key first and only writes it to the vault when the test passes, so a failed
                // test aborts here with the existing key untouched.
                try {
                  const result = await rotateProviderCredential(state, apiKeyProvider, apiKeySecret.trim(), apiKeyAdmin.trim(), {});
                  if (result.status === 'connected') {
                    setApiKeyStatus('success');
                    setApiKeyMessage(`New key tested OK and saved for ${apiKeyProvider}. All related models now use the new key.`);
                    setApiKeySecret('');
                    setApiKeyAdmin('');
                  } else {
                    setApiKeyStatus('error');
                    setApiKeyMessage(`New ${apiKeyProvider} key failed the connection test (${result.status}). Key was not updated — the existing key is unchanged.`);
                  }
                } catch (err) {
                  setApiKeyStatus('error');
                  setApiKeyMessage(`New key failed testing, nothing was saved: ${redactedError(err)}`);
                }
              }}
            >
              {apiKeyStatus === 'testing' ? 'Testing...' : 'Test & Save'}
            </button>
          </div>
        </section>
      </div>
    )}
    </>
  );
}
