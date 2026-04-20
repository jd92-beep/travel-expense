import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AppState, Person } from '@/lib/types';
import { SCAN_MODELS } from '@/lib/constants';
import { unlockVault } from '@/lib/vault';
import { notionPushReceipt } from '@/lib/notion';
import { exportCSV } from '@/lib/csv';
import { Button } from '@/components/ui/Button';

interface SettingsProps {
  state: AppState;
  onUpdate: (updates: Partial<AppState>) => void;
  onClear: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function Settings({ state, onUpdate, onClear, showToast }: SettingsProps) {
  const [vaultPass, setVaultPass] = useState('');
  const [vaultLoading, setVaultLoading] = useState(false);
  const [notionSyncing, setNotionSyncing] = useState(false);
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonEmoji, setNewPersonEmoji] = useState('😊');

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    border: '1px solid rgba(255,220,210,0.8)', background: 'rgba(255,255,255,0.8)',
    fontSize: 15, color: '#1A1A2E', outline: 'none', marginBottom: 10,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: '#6B7285', marginBottom: 4, display: 'block',
  };

  async function handleVaultUnlock() {
    if (!vaultPass) return;
    setVaultLoading(true);
    try {
      const contents = await unlockVault(vaultPass);
      onUpdate({
        apiKey: contents.apiKey ?? state.apiKey,
        notionToken: contents.notionToken ?? state.notionToken,
        notionDb: contents.notionDb ?? state.notionDb,
      });
      setVaultPass('');
      showToast('Vault 解鎖成功！API Keys 已填入 ✓', 'success');
    } catch {
      showToast('密碼錯誤，請重試', 'error');
    } finally {
      setVaultLoading(false);
    }
  }

  async function handleNotionPushAll() {
    if (!state.notionToken || !state.notionDb) {
      showToast('請先設定 Notion Token 和 Database ID', 'error');
      return;
    }
    setNotionSyncing(true);
    let success = 0;
    let fail = 0;
    for (const r of state.receipts) {
      try {
        const pageId = await notionPushReceipt(r, state.notionToken, state.notionDb, state.proxy);
        if (pageId !== r.notionPageId) {
          // update notionPageId locally
        }
        success++;
      } catch {
        fail++;
      }
    }
    setNotionSyncing(false);
    showToast(`同步完成：${success} 成功${fail > 0 ? `，${fail} 失敗` : ''}`, fail > 0 ? 'error' : 'success');
  }

  function addPerson() {
    if (!newPersonName.trim()) return;
    const person: Person = {
      id: `p_${Date.now()}`,
      name: newPersonName.trim(),
      emoji: newPersonEmoji,
      color: ['#CC2929', '#2D5A8E', '#059669', '#d97706', '#7c3aed'][state.persons.length % 5],
    };
    onUpdate({ persons: [...state.persons, person] });
    setNewPersonName('');
  }

  function removePerson(id: string) {
    onUpdate({ persons: state.persons.filter(p => p.id !== id) });
  }

  const hkdBudget = (state.budget / state.rate).toFixed(0);

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#1A1A2E', marginBottom: 20 }}>⚙️ 設定</div>

      {/* Vault card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        whileInView={{ opacity: 1 }}
        className="glass"
        style={{ borderRadius: 16, padding: '16px', marginBottom: 14 }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 10 }}>🔐 Vault 解鎖</div>
        <div style={{ fontSize: 12, color: '#6B7285', marginBottom: 10 }}>輸入主密碼自動填入 API Keys</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="password"
            placeholder="主密碼"
            value={vaultPass}
            onChange={e => setVaultPass(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleVaultUnlock()}
            style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
          />
          <motion.button
            whileTap={{ scale: 0.93 }}
            whileHover={{ scale: 1.02 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            onClick={handleVaultUnlock}
            disabled={vaultLoading}
            style={{
              padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg,#C0281E,#E04040)', color: 'white',
              fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap',
            }}
          >
            <AnimatePresence mode="wait">
              {vaultLoading ? (
                <motion.span
                  key="loading"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  style={{ display: 'inline-block' }}
                >
                  🔄
                </motion.span>
              ) : (
                <motion.span key="lock">🔓 解鎖</motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </motion.div>

      {/* Budget & Rate */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass"
        style={{ borderRadius: 16, padding: '16px', marginBottom: 14 }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 12 }}>💰 預算設定</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>總預算 (JPY)</label>
            <input
              style={inputStyle}
              type="number"
              value={state.budget}
              onChange={e => onUpdate({ budget: Number(e.target.value) })}
            />
          </div>
          <div>
            <label style={labelStyle}>匯率 (JPY/HKD)</label>
            <input
              style={inputStyle}
              type="number"
              step="0.01"
              value={state.rate}
              onChange={e => onUpdate({ rate: Number(e.target.value) })}
            />
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#6B7285', marginTop: -6 }}>
          ≈ HKD ${Number(hkdBudget).toLocaleString()} · 日均 ¥{Math.round(state.budget / 6).toLocaleString()}
        </div>
      </motion.div>

      {/* Persons */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="glass"
        style={{ borderRadius: 16, padding: '16px', marginBottom: 14 }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 12 }}>👥 同行人員</div>
        {state.persons.map(p => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 14 }}>{p.emoji} {p.name}</span>
            <motion.button
              whileTap={{ rotate: -8, scale: 0.85 }}
              onClick={() => removePerson(p.id)}
              style={{ background: 'rgba(204,41,41,0.1)', border: 'none', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', color: '#CC2929', fontSize: 13 }}
            >
              移除
            </motion.button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            value={newPersonEmoji}
            onChange={e => setNewPersonEmoji(e.target.value)}
            style={{ ...inputStyle, marginBottom: 0, width: 50, textAlign: 'center' }}
          />
          <input
            placeholder="姓名"
            value={newPersonName}
            onChange={e => setNewPersonName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addPerson()}
            style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
          />
          <Button variant="primary" onClick={addPerson} size="sm">+ 加</Button>
        </div>
      </motion.div>

      {/* Model picker */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass"
        style={{ borderRadius: 16, padding: '16px', marginBottom: 14 }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 12 }}>🤖 AI 模型</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SCAN_MODELS.map(m => (
            <motion.button
              key={m.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => onUpdate({ scanModel: m.id })}
              style={{
                padding: '10px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: state.scanModel === m.id ? `${m.color}20` : 'rgba(0,0,0,0.04)',
                borderLeft: state.scanModel === m.id ? `3px solid ${m.color}` : '3px solid transparent',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1A2E' }}>{m.label}</span>
              {state.scanModel === m.id && <span style={{ fontSize: 12, color: m.color }}>✓ 使用中</span>}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* API Keys */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="glass"
        style={{ borderRadius: 16, padding: '16px', marginBottom: 14 }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 12 }}>🔑 API Keys</div>
        <label style={labelStyle}>Gemini API Key</label>
        <input
          type="password"
          style={inputStyle}
          value={state.apiKey}
          onChange={e => onUpdate({ apiKey: e.target.value })}
          placeholder="AIzaSy..."
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 11, background: state.apiKey ? '#DCFCE7' : '#FEE2E2', color: state.apiKey ? '#059669' : '#CC2929', padding: '2px 8px', borderRadius: 10 }}>
            {state.apiKey ? '✓ 已設定' : '未設定'}
          </span>
        </div>
      </motion.div>

      {/* Notion */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.14 }}
        className="glass"
        style={{ borderRadius: 16, padding: '16px', marginBottom: 14 }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 12 }}>📓 Notion 同步</div>
        <label style={labelStyle}>Notion Token</label>
        <input
          type="password"
          style={inputStyle}
          value={state.notionToken}
          onChange={e => onUpdate({ notionToken: e.target.value })}
          placeholder="secret_..."
        />
        <label style={labelStyle}>Database ID</label>
        <input
          style={inputStyle}
          value={state.notionDb}
          onChange={e => onUpdate({ notionDb: e.target.value })}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        />
        <label style={labelStyle}>CORS Proxy</label>
        <input
          style={inputStyle}
          value={state.proxy}
          onChange={e => onUpdate({ proxy: e.target.value })}
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button variant="primary" onClick={handleNotionPushAll} disabled={notionSyncing}>
            {notionSyncing ? '同步中…' : '⬆️ 推送全部'}
          </Button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={state.autoSync}
              onChange={e => onUpdate({ autoSync: e.target.checked })}
            />
            自動同步
          </label>
        </div>
      </motion.div>

      {/* Stats toggle */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16 }}
        className="glass"
        style={{ borderRadius: 16, padding: '16px', marginBottom: 14 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E' }}>統計包含交通/住宿</div>
            <div style={{ fontSize: 12, color: '#6B7285', marginTop: 2 }}>關閉則只統計餐飲/購物等</div>
          </div>
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={() => onUpdate({ statsIncludeTransportLodging: !state.statsIncludeTransportLodging })}
            style={{
              width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
              background: state.statsIncludeTransportLodging ? '#CC2929' : 'rgba(0,0,0,0.15)',
              position: 'relative', transition: 'background 0.2s',
            }}
          >
            <motion.div
              animate={{ x: state.statsIncludeTransportLodging ? 18 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 28 }}
              style={{
                position: 'absolute', top: 2, width: 22, height: 22, borderRadius: '50%',
                background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              }}
            />
          </motion.button>
        </div>
      </motion.div>

      {/* Export & Clear */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="glass"
        style={{ borderRadius: 16, padding: '16px', marginBottom: 14 }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 12 }}>📤 數據管理</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button
            variant="secondary"
            onClick={() => { exportCSV(state.receipts, state.rate); showToast('CSV 已下載', 'success'); }}
            className="flex-1"
          >
            📥 導出 CSV
          </Button>
          <Button
            variant="danger"
            onClick={() => { if (confirm('確定清除所有收據？此操作不可撤銷！')) { onClear(); showToast('已清除所有收據', 'info'); } }}
            className="flex-1"
          >
            🗑️ 清除數據
          </Button>
        </div>
        <div style={{ fontSize: 12, color: '#6B7285', marginTop: 8, textAlign: 'center' }}>
          共 {state.receipts.length} 條紀錄
        </div>
      </motion.div>
    </div>
  );
}

