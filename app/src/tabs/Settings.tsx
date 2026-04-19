import { useState } from 'react';
import {
  Target, Coins, Lock, Database, KeyRound, Download, Trash2, ExternalLink,
  Cloud, Check, Sparkles, Users, Plus, X,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardLabel } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { unlockVault } from '@/lib/vault';
import { downloadCSV, receiptsToCSV } from '@/lib/csv';
import { useToast } from '@/hooks/useToast';
import type { AppState, Person } from '@/lib/types';
import { DEFAULT_PROXY, SCAN_MODELS } from '@/lib/constants';

interface SettingsProps {
  state: AppState;
  updateState: (patch: Partial<AppState>) => void;
  onClearReceipts: () => void;
}

const EMOJI_CHOICES = ['🧔','👨','👩','🧑','👦','👧','👴','👵','🤴','👸','🧙','🕵️','😎','🌟','🐼','🦊','🐯','🐻'];
const COLOR_CHOICES = ['#CC2929','#F5A623','#FF91A4','#2D5A8E','#22c55e','#8b5cf6','#ec4899','#14b8a6'];

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
      const names = [v.apiKey && 'Gemini', v.notionToken && 'Notion', v.notionDb && 'DB'].filter(Boolean).join(' + ');
      toast(`🔓 Vault 解鎖成功 · ${names} 已載入`, 'success');
    } catch (e) {
      toast('❌ 密碼錯誤 (' + (e as Error).message.slice(0, 40) + ')', 'error');
    } finally { setUnlocking(false); }
  };

  const exportCSV = () => {
    if (!state.receipts.length) return toast('⚠️ 冇記錄可匯出', 'warning');
    const csv = receiptsToCSV(state.receipts);
    downloadCSV(csv, `travel-expense-${new Date().toISOString().slice(0, 10)}.csv`);
    toast(`📤 已匯出 ${state.receipts.length} 筆`, 'success');
  };

  const persons: Person[] = state.persons || [];
  const addPerson = () => {
    const newP: Person = {
      id: 'p_' + Date.now().toString(36),
      name: '旅伴' + (persons.length + 1),
      emoji: EMOJI_CHOICES[Math.floor(Math.random() * EMOJI_CHOICES.length)],
      color: COLOR_CHOICES[persons.length % COLOR_CHOICES.length],
    };
    updateState({ persons: [...persons, newP] });
  };
  const updatePerson = (id: string, patch: Partial<Person>) =>
    updateState({ persons: persons.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  const removePerson = (id: string) => {
    if (!confirm('確定移除呢個旅伴？')) return;
    updateState({ persons: persons.filter((p) => p.id !== id) });
  };

  return (
    <div className="space-y-5 pb-6">
      <div>
        <CardLabel>設定</CardLabel>
        <h1 className="font-display text-2xl mt-1 text-paper-900 font-bold">偏好與憑證</h1>
      </div>

      <Card className="bg-gradient-to-br from-arsenal-600/10 to-ember-500/10 border-arsenal-500/30">
        <div className="flex items-center gap-2 mb-3">
          <Lock size={14} className="text-arsenal-600" />
          <CardLabel>解鎖 Vault</CardLabel>
          {state.apiKey && (
            <span className="ml-auto text-[10px] text-jade-600 font-semibold flex items-center gap-1">
              <Check size={10} /> 已解鎖
            </span>
          )}
        </div>
        <p className="text-xs text-paper-700 leading-relaxed mb-3">
          輸入 vault 密碼，自動載入 Gemini / Notion keys（AES-256-GCM + PBKDF2 100k）。
        </p>
        <div className="flex gap-2">
          <input type="password" value={vaultPw}
            onChange={(e) => setVaultPw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doUnlock()}
            placeholder="Vault 密碼" className="input flex-1" />
          <Button onClick={doUnlock} disabled={unlocking || !vaultPw.trim()}>
            {unlocking ? '解鎖中…' : '解鎖'}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Target size={14} className="text-arsenal-600" />
            <CardLabel>預算</CardLabel>
          </div>
          <input type="number" className="input num text-lg font-semibold"
            value={state.budget}
            onChange={(e) => updateState({ budget: Number(e.target.value) || 0 })} />
          <div className="text-[11px] text-paper-600 mt-1.5 num">
            ≈ HK${(state.budget / (state.rate || 1)).toFixed(0)}
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Coins size={14} className="text-ember-500" />
            <CardLabel>匯率</CardLabel>
          </div>
          <input type="number" step="0.01" className="input num text-lg font-semibold"
            value={state.rate}
            onChange={(e) => updateState({ rate: Number(e.target.value) || 1 })} />
          <div className="text-[11px] text-paper-600 mt-1.5">HKD → JPY</div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} className="text-ember-500" />
          <CardLabel>掃描模型</CardLabel>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {SCAN_MODELS.map((m) => {
            const selected = (state.scanModel || SCAN_MODELS[0].id) === m.id;
            return (
              <motion.button key={m.id} whileTap={{ scale: 0.97 }}
                onClick={() => updateState({ scanModel: m.id })}
                className={`text-left p-3 rounded-xl border-2 transition-all relative overflow-hidden ${
                  selected ? 'border-arsenal-500 bg-white shadow-glow-sm'
                           : 'border-paper-300 bg-white/60 hover:border-arsenal-300'
                }`}
                style={selected ? { boxShadow: `0 4px 20px -4px ${m.color}55` } : undefined}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: m.color }} />
                  <span className="font-semibold text-xs text-paper-900">{m.label}</span>
                  {selected && <Check size={13} className="ml-auto text-arsenal-600" />}
                </div>
                <div className="text-[10px] text-paper-600">{m.desc}</div>
              </motion.button>
            );
          })}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <KeyRound size={14} className="text-ember-500" />
            <CardLabel>API Keys</CardLabel>
          </div>
          <button onClick={() => setShowKeys((v) => !v)}
            className="text-[10px] text-paper-600 hover:text-paper-900 underline underline-offset-4">
            {showKeys ? '隱藏' : '顯示'}
          </button>
        </div>
        <InputRow label="Gemini API Key" value={state.apiKey || ''}
          onChange={(v) => updateState({ apiKey: v })}
          placeholder="AIzaSy…" masked={!showKeys} />
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Database size={14} className="text-arsenal-600" />
          <CardLabel>Notion 同步</CardLabel>
        </div>
        <div className="space-y-3">
          <InputRow label="Notion Integration Token" value={state.notionToken || ''}
            onChange={(v) => updateState({ notionToken: v })} placeholder="ntn_…" masked={!showKeys} />
          <InputRow label="Database ID" value={state.notionDb || ''}
            onChange={(v) => updateState({ notionDb: v })} placeholder="3438d94d5f7c…" masked={false} />
          <InputRow label="CORS Proxy" value={state.proxy || DEFAULT_PROXY}
            onChange={(v) => updateState({ proxy: v })} placeholder={DEFAULT_PROXY} masked={false} />
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={state.autoSync !== false}
              onChange={(e) => updateState({ autoSync: e.target.checked })}
              className="h-4 w-4 accent-arsenal-600" />
            <span className="text-sm text-paper-900">新記錄自動 push 到 Notion</span>
          </label>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} className="text-arsenal-600" />
          <CardLabel>旅伴 ({persons.length})</CardLabel>
          <button onClick={addPerson}
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-arsenal-600 hover:text-arsenal-700">
            <Plus size={12} /> 新增
          </button>
        </div>
        {persons.length === 0 ? (
          <p className="text-xs text-paper-600 py-3 text-center">
            加入旅伴後，可喺記錄中標記邊個出嘅錢，同步計算 share。
          </p>
        ) : (
          <div className="space-y-2">
            {persons.map((p) => (
              <div key={p.id} className="flex items-center gap-2 p-2 rounded-xl bg-white border border-paper-300">
                <button onClick={() => {
                  const next = prompt('揀 emoji：', p.emoji) || p.emoji;
                  updatePerson(p.id, { emoji: next });
                }} className="h-9 w-9 rounded-lg grid place-items-center text-lg shrink-0"
                  style={{ background: p.color + '22', border: `1px solid ${p.color}40` }}>
                  {p.emoji}
                </button>
                <input type="text" value={p.name}
                  onChange={(e) => updatePerson(p.id, { name: e.target.value })}
                  className="input flex-1" />
                <input type="color" value={p.color}
                  onChange={(e) => updatePerson(p.id, { color: e.target.value })}
                  className="h-9 w-9 rounded-lg border border-paper-300 cursor-pointer shrink-0"
                  aria-label="主題色" />
                <button onClick={() => removePerson(p.id)} aria-label="移除"
                  className="h-9 w-9 rounded-lg grid place-items-center text-paper-500 hover:text-arsenal-600 shrink-0">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Cloud size={14} className="text-jade-500" />
          <CardLabel>資料</CardLabel>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={exportCSV}>
            <Download size={13} /> 匯出 CSV ({state.receipts.length} 筆)
          </Button>
          <Button variant="danger" size="sm" onClick={() => {
            if (!confirm(`確定清除全部 ${state.receipts.length} 筆本地記錄？Notion 唔會受影響。`)) return;
            onClearReceipts();
            toast('🗑 本地記錄已清除', 'warning');
          }}>
            <Trash2 size={13} /> 清除本地
          </Button>
        </div>
      </Card>

      <Card className="bg-gradient-to-br from-ember-200/60 to-transparent border-ember-500/30">
        <div className="text-xs text-paper-700 leading-relaxed">
          完整功能（語音、Email 貼文、16 幣種匯率、imgbb）：
        </div>
        <a href="../" className="inline-block mt-2">
          <Button variant="secondary" size="sm">
            <ExternalLink size={13} /> 去舊版
          </Button>
        </a>
      </Card>

      <Card>
        <CardLabel>關於</CardLabel>
        <div className="space-y-1 text-xs mt-2">
          <Row k="版本" v="2.3 · Light Theme · Full Backend" />
          <Row k="記錄數" v={`${state.receipts.length} 筆`} />
          <Row k="儲存" v="localStorage + Notion" />
        </div>
      </Card>
    </div>
  );
}

function InputRow({
  label, value, onChange, placeholder, masked,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; masked?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.18em] text-paper-600 font-medium block mb-1.5">
        {label}
      </span>
      <input type={masked ? 'password' : 'text'} value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} className="input num text-sm"
        autoComplete="off" spellCheck={false} />
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-paper-600">{k}</span>
      <span className="num text-paper-900 text-right">{v}</span>
    </div>
  );
}
