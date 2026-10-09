import { FlaskConical, LoaderCircle } from 'lucide-react';
import { useId, useState } from 'react';
import { AI_MODELS, DEFAULT_TRIP_UPDATE_MODEL_ID, DEFAULT_SCAN_VOICE_MODEL_ID } from '../../lib/constants';
import {
  redactedError,
  testAiModel,
} from '../../lib/credentialBroker';
import type { AppState } from '../../lib/types';

export function aiModelLabel(modelId: string | undefined): string {
  const id = modelId && modelId !== 'auto' ? modelId : DEFAULT_TRIP_UPDATE_MODEL_ID;
  return AI_MODELS.find((model) => model.id === id)?.name || id;
}

export function classifyModelScanError(error: unknown): 'quota' | 'unsupported' | 'retryable' {
  const message = redactedError(error);
  // Provider contract: 429/quota/daily-limit are hard stops — the model still exists,
  // so it stays in the list (flagged 限額) instead of being removed.
  if (/\b429\b|quota|rate.?limit|daily.?limit|額度/i.test(message)) return 'quota';
  if (/not allowlisted|invalid model|model.*not.*(exist|found)|no longer|deprecated|unsupported/i.test(message)) return 'unsupported';
  return 'retryable';
}

export async function scanModel(state: AppState, modelId: string): Promise<'ok' | 'quota' | 'failed'> {
  try {
    await testAiModel(state, modelId);
    return 'ok';
  } catch (error) {
    return classifyModelScanError(error) === 'quota' ? 'quota' : 'failed';
  }
}

export function AiModelField({
  label,
  task,
  value,
  state,
  hiddenModels,
  scanResults,
  onChange,
}: {
  label: string;
  task: 'scan' | 'voice' | 'email' | 'trip-update';
  value: string;
  state: AppState;
  hiddenModels: string[];
  scanResults?: Record<string, 'ok' | 'quota' | 'failed'>;
  onChange: (value: string) => void;
}) {
  const groupId = useId();
  const [expanded, setExpanded] = useState<string[]>([]);
  const defaultId = task === 'scan' ? DEFAULT_SCAN_VOICE_MODEL_ID : DEFAULT_TRIP_UPDATE_MODEL_ID;
  const selectedId = value && value !== 'auto' ? value : defaultId;
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const runTest = async () => {
    setStatus('testing');
    setMessage('測試中');
    try {
      const modelName = await testAiModel(state, selectedId);
      setStatus('success');
      setMessage(`${modelName} 可用`);
    } catch (error) {
      setStatus('error');
      setMessage(`未能使用：${redactedError(error)}`);
    }
  };
  const visibleModels = AI_MODELS.filter(model => model.tasks.includes(task) && (!hiddenModels.includes(model.id) || model.id === selectedId));
  const providers = [...new Set(visibleModels.map(model => model.providerId))];
  const choose = (id: string) => { setStatus('idle'); setMessage(''); onChange(id); };
  return (
    <div className="ai-model-field">
      <fieldset className="ai-model-picker">
        <legend>{label}</legend>
        <p className="muted">使用：{aiModelLabel(selectedId)}</p>
        <label className="ai-model-option"><input type="radio" name={groupId} value="auto" checked={!value || value === 'auto'} onChange={() => choose('auto')} />自動（預設及後備）</label>
        {providers.map(provider => {
          const models = visibleModels.filter(model => model.providerId === provider);
          const open = expanded.includes(provider);
          return <div key={provider}>
            <button type="button" className="secondary ai-provider-toggle" aria-expanded={open} aria-controls={`${groupId}-${provider}`} onClick={() => setExpanded(prev => open ? prev.filter(id => id !== provider) : [...prev, provider])}>
              <span aria-hidden="true">{open ? '−' : '+'}</span> {models[0].providerName}
            </button>
            <div id={`${groupId}-${provider}`} hidden={!open}>
              {models.map(model => <label key={model.id} className="ai-model-option">
                <input type="radio" name={groupId} value={model.id} checked={value === model.id} onChange={() => choose(model.id)} />
                {model.name}{scanResults?.[model.id] === 'quota' ? '（限額）' : ''}
              </label>)}
            </div>
          </div>;
        })}
      </fieldset>
      <button
        type="button"
        className="secondary compact ai-model-test-button"
        aria-label={`測試 ${label}`}
        disabled={status === 'testing'}
        onClick={() => void runTest()}
      >
        {status === 'testing' ? <LoaderCircle size={16} className="spin" /> : <FlaskConical size={16} />}
        測試
      </button>
      <small className={`ai-model-test-status ${status}`} aria-live="polite">{message}</small>
    </div>
  );
}
