import { FlaskConical, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { AI_MODELS, DEFAULT_TRIP_UPDATE_MODEL_ID } from '../../lib/constants';
import {
  redactedError,
  testAiModel,
} from '../../lib/credentialBroker';
import type { AppState } from '../../lib/types';

export function aiModelLabel(modelId: string | undefined): string {
  const id = modelId || DEFAULT_TRIP_UPDATE_MODEL_ID;
  return AI_MODELS.find((model) => model.id === id)?.name || id;
}

// Model-scan schedule: initial attempt, then automatic retries 5s / 10s / 15s after each
// failure (4 attempts total). Models that still fail are hidden from the pickers; models that
// later pass a scan are restored automatically.
export const MODEL_SCAN_RETRY_DELAYS_MS = [5000, 10000, 15000];

export function classifyModelScanError(error: unknown): 'quota' | 'unsupported' | 'retryable' {
  const message = redactedError(error);
  // Provider contract: 429/quota/daily-limit are hard stops — the model still exists,
  // so it stays in the list (flagged 限額) instead of being removed.
  if (/\b429\b|quota|rate.?limit|daily.?limit|額度/i.test(message)) return 'quota';
  if (/not allowlisted|invalid model|model.*not.*(exist|found)|no longer|deprecated|unsupported/i.test(message)) return 'unsupported';
  return 'retryable';
}

export async function scanModelWithRetries(state: AppState, modelId: string): Promise<'ok' | 'quota' | 'failed'> {
  for (let attempt = 0; attempt <= MODEL_SCAN_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, MODEL_SCAN_RETRY_DELAYS_MS[attempt - 1]));
    }
    try {
      await testAiModel(state, modelId);
      return 'ok';
    } catch (error) {
      const kind = classifyModelScanError(error);
      if (kind === 'quota') return 'quota';
      if (kind === 'unsupported') return 'failed';
      // retryable → fall through to the next scheduled retry
    }
  }
  return 'failed';
}

export function AiModelField({
  label,
  value,
  state,
  hiddenModels,
  scanResults,
  onChange,
}: {
  label: string;
  value: string;
  state: AppState;
  hiddenModels: string[];
  scanResults?: Record<string, 'ok' | 'quota' | 'failed'>;
  onChange: (value: string) => void;
}) {
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const runTest = async () => {
    setStatus('testing');
    setMessage('測試中');
    try {
      const modelName = await testAiModel(state, value);
      setStatus('success');
      setMessage(`${modelName} 可用`);
    } catch (error) {
      setStatus('error');
      setMessage(`未能使用：${redactedError(error)}`);
    }
  };
  const visibleModels = AI_MODELS.filter((model) => !hiddenModels.includes(model.id));
  const valueMissing = !visibleModels.some((model) => model.id === value);
  return (
    <div className="ai-model-field">
      <label>{label}
        <select
          value={value}
          onChange={(event) => {
            setStatus('idle');
            setMessage('');
            onChange(event.target.value);
          }}
        >
          {valueMissing && (
            <option value={value}>
              {AI_MODELS.find((model) => model.id === value)?.name || value}（暫停或舊型號）
            </option>
          )}
          {visibleModels.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}{scanResults?.[model.id] === 'quota' ? '（限額）' : ''}
            </option>
          ))}
        </select>
      </label>
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
