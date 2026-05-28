import { motion } from 'framer-motion';
import { useState } from 'react';
import {
  Target,
  Coins,
  Lock,
  Unlock,
  Database,
  KeyRound,
  Download,
  Trash2,
  ExternalLink,
  Cloud,
} from 'lucide-react';
import { Card, CardLabel } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { unlockVault } from '@/lib/vault';
import { downloadCSV, receiptsToCSV } from '@/lib/csv';
import { useToast } from '@/hooks/useToast';
import type { AppState } from '@/lib/types';
import { DEFAULT_PROXY, GEMINI_VISION_MODELS } from '@/lib/constants';

interface SettingsProps {
  state: AppState;
  updateState: (patch: Partial<AppState>) => void;
  onClearReceipts: () => void;
}

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.45, ease: [0.16, 1, 0.3, 1] as number[] },
  }),
};

export function Settings({ state, updateState, onClearReceipts }: SettingsProps) {
  const [vaultPw, setVaultPw] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const { toast } = useToast();

  const doUnlock = async () => {
    if (!vaultPw.trim()) return;
    setUnlocking(true);
    try {
      const v = await unlockVault(vaultPw);
      updateState({
        apiKey: v.apiKey || state.apiKey,
        notionToken: v.notionToken || state.notionToken,
        notionDb: v.notionDb || state.notionDb,
      });
      setVaultPw('');
      toast('🔓 Vault 已解鎖，所有 API key 已載入', 'success');
    } catch (e) {
      toast('❌ 密碼錯誤 (' + (e as Error).message.slice(0, 40) + ')', 'error');
    } finally {
      setUnlocking(false);
    }
  };

  const exportCSV = () => {
    if (!state.receipts.length) {
      toast('⚠️ 冇記錄可匯出', 'warning');
      return;
    }
    const csv = receiptsToCSV(state.receipts);
    const filename = `travel-expense-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCSV(csv, filename);
    toast(`📤 已匯出 ${state.receipts.length} 筆`, 'success');
  };

  const cards = [
    'vault',
    'budget',
    'rate',
    'apikeys',
    'notion',
    'data',
    'legacy',
    'about',
  ] as const;

  return (
    <div className="space-y-5 pb-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <CardLabel>設定</CardLabel>
        <h1 className="font-display text-2xl mt-1">偏好與憑證</h1>
      </motion.div>

      {/* Vault card */}
      <motion.div
        custom={0}
        variants={cardVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        <Card className="bg-gradient-to-br from-arsenal-900/25 to-ember-600/10 border-arsenal-500/25">
          <div className="flex items-center gap-2 mb-3">
            <motion.div
              animate={unlocking ? { rotate: 360 } : { rotate: 0 }}
              transition={unlocking ? { duration: 1, repeat: Infinity, ease: 'linear' } : {}}
            >
              {state.apiKey ? (
                <Unlock size={14} className="text-jade-400" />
              ) : (
                <Lock size={14} className="text-arsenal-400" />
              )}
            </motion.div>
            <CardLabel>解鎖 Vault</CardLabel>
            {state.apiKey && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                className="ml-auto text-[10px] text-jade-400 font-semibold"
              >
                ● 已解鎖
              </motion.span>
            )}
          </div>
          <p className="text-xs text-ink-300 leading-relaxed mb-3">
            輸入 vault 密碼，自動載入 Gemini / Notion keys（AES-256-GCM）。
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={vaultPw}
              onChange={(e) => setVaultPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doUnlock()}
              placeholder="Vault 密碼"
              className="input flex-1"
            />
            <Button onClick={doUnlock} disabled={unlocking || !vaultPw.trim()}>
              {unlocking ? (
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                  className="block"
                >
                  🔄
                </motion.span>
              ) : (
                '解鎖'
              )}
            </Button>
          </div>
        </Card>
      </motion.div>

      {/* Budget card */}
      <motion.div
        custom={1}
        variants={cardVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Target size={14} className="text-arsenal-400" />
            <CardLabel>預算 (JPY)</CardLabel>
          </div>
          <input
            type="number"
            className="input num text-lg font-semibold"
            value={state.budget}
            onChange={(e) => updateState({ budget: Number(e.target.value) || 0 })}
          />
          <div className="text-[11px] text-ink-400 mt-2 num">
            ≈ HK${(state.budget / (state.rate || 1)).toFixed(0)} · rate {state.rate}
          </div>
        </Card>
      </motion.div>

      {/* Rate card */}
      <motion.div
        custom={2}
        variants={cardVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Coins size={14} className="text-ember-400" />
            <CardLabel>匯率 HKD → JPY</CardLabel>
          </div>
          <input
            type="number"
            step="0.01"
            className="input num text-lg font-semibold"
            value={state.rate}
            onChange={(e) => updateState({ rate: Number(e.target.value) || 1 })}
          />
        </Card>
      </motion.div>

      {/* API Keys card */}
      <motion.div
        custom={3}
        variants={cardVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <KeyRound size={14} className="text-ember-400" />
              <CardLabel>API Keys</CardLabel>
            </div>
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => setShowKeys((v) => !v)}
              className="text-[10px] text-ink-400 hover:text-ink-100 underline underline-offset-4"
            >
              {showKeys ? '隱藏' : '顯示'}
            </motion.button>
          </div>
          <div className="space-y-3">
            <InputRow
              label="Gemini API Key"
              value={state.apiKey || ''}
              onChange={(v) => updateState({ apiKey: v })}
              placeholder="AIzaSy…"
              masked={!showKeys}
            />
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-medium block mb-1.5">
                掃描模型
              </span>
              <select
                className="input"
                value={state.scanModel || state.model || 'gemini-3.1-flash-lite-preview'}
                onChange={(e) => updateState({ scanModel: e.target.value })}
              >
                {GEMINI_VISION_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Card>
      </motion.div>

      {/* Notion card */}
      <motion.div
        custom={4}
        variants={cardVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Database size={14} className="text-arsenal-400" />
            <CardLabel>Notion 同步</CardLabel>
          </div>
          <div className="space-y-3">
            <InputRow
              label="Notion Integration Token"
              value={state.notionToken || ''}
              onChange={(v) => updateState({ notionToken: v })}
              placeholder="ntn_…"
              masked={!showKeys}
            />
            <InputRow
              label="Database ID"
              value={state.notionDb || ''}
              onChange={(v) => updateState({ notionDb: v })}
              placeholder="3438d94d5f7c…"
              masked={false}
            />
            <InputRow
              label="CORS Proxy"
              value={state.proxy || DEFAULT_PROXY}
              onChange={(v) => updateState({ proxy: v })}
              placeholder={DEFAULT_PROXY}
              masked={false}
            />
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <AnimatedToggle
                checked={state.autoSync !== false}
                onChange={(v) => updateState({ autoSync: v })}
              />
              <span className="text-sm text-ink-200">新記錄自動 push 到 Notion</span>
            </label>
          </div>
        </Card>
      </motion.div>

      {/* Data card */}
      <motion.div
        custom={5}
        variants={cardVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Cloud size={14} className="text-jade-400" />
            <CardLabel>資料</CardLabel>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={exportCSV}>
              <Download size={13} /> 匯出 CSV ({state.receipts.length} 筆)
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (!confirm(`確定清除全部 ${state.receipts.length} 筆本地記錄？Notion 唔會受影響。`)) return;
                onClearReceipts();
                toast('🗑 本地記錄已清除', 'warning');
              }}
            >
              <Trash2 size={13} /> 清除本地
            </Button>
          </div>
        </Card>
      </motion.div>

      {/* Legacy card */}
      <motion.div
        custom={6}
        variants={cardVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        <Card className="bg-gradient-to-br from-ember-700/10 to-ink-900/0 border-ember-500/20">
          <div className="text-xs text-ink-300 leading-relaxed">
            全功能舊版（語音、Email 貼文、16 幣種匯率）：
          </div>
          <a href="../" className="inline-block mt-2">
            <Button variant="secondary" size="sm">
              <ExternalLink size={13} /> 去舊版
            </Button>
          </a>
        </Card>
      </motion.div>

      {/* About card */}
      <motion.div
        custom={7}
        variants={cardVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        <Card>
          <CardLabel>關於</CardLabel>
          <div className="space-y-1 text-xs mt-2">
            <Row k="版本" v="2.1 · React + 完整後端" />
            <Row k="記錄數" v={`${state.receipts.length} 筆`} />
            <Row k="儲存" v="localStorage + Notion" />
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

/** Animated toggle with spring-animated thumb */
function AnimatedToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      whileTap={{ scale: 0.92 }}
      className={`relative h-5 w-9 rounded-full transition-colors ${
        checked ? 'bg-arsenal-500' : 'bg-ink-700'
      }`}
    >
      <motion.span
        className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-md"
        animate={{ x: checked ? 16 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </motion.button>
  );
}

function InputRow({
  label,
  value,
  onChange,
  placeholder,
  masked,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  masked?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-medium block mb-1.5">
        {label}
      </span>
      <input
        type={masked ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input num text-sm"
        autoComplete="off"
        spellCheck={false}
      />
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-400">{k}</span>
      <span className="num text-ink-200 text-right">{v}</span>
    </div>
  );
}
