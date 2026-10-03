import { Sparkles } from 'lucide-react';
import { AccordionCard } from '../../components/AccordionCard';
import { migrateAppState } from '../../domain/trip/normalize';
import { type SettingsContext } from './shared';
import type { StressTools } from './useStressTools';

export function StressTestSection({ ctx, stress, changeTab }: { ctx: SettingsContext; stress: StressTools; changeTab?: (tabId: any) => void }) {
  const { state, setState, busy, setStatus, run } = ctx;
  const { stressToolsUnlocked, stressLatency, stressFault, toggleStressLatency, toggleStressFault, loadStressTest } = stress;
  const handleMassInject = () => {
    if (!stressToolsUnlocked) return;
    void run('瞬間導入 1000 筆名古屋消費', async () => {
      const { generateMockReceipts } = await loadStressTest();
      const mockReceipts = generateMockReceipts(1000);
      setState((prev) => migrateAppState({
        ...prev,
        receipts: [...prev.receipts, ...mockReceipts],
      }));
      return '🎉 成功瞬間導入 1,000 筆 Nagoya 消費數據！請去 History 或 Dashboard 滾動驗收！';
    });
  };

  const handleTabSwitchTest = () => {
    if (!stressToolsUnlocked) {
      setStatus('⚠️ 壓力測試面板僅限 Boss 帳號使用');
      return Promise.resolve('stress panel locked');
    }
    if (!changeTab) {
      setStatus('⚠️ changeTab prop 缺失，無法啟動切換壓力測試');
      return new Promise<string>((resolve) => resolve('changeTab is missing'));
    }
    return run('自動高頻 Tab 切換壓力測試', async () => {
      const { simulateTabSwitching } = await loadStressTest();
      return new Promise((resolve) => {
        simulateTabSwitching(changeTab, () => {
          resolve('🎉 自動 Tab 極速切換壓力測試完成！WebGL 內存已強制回收，React 狀態穩定！');
        });
      });
    });
  };

  return (
    <>
    <AccordionCard id="settings-stress-test" eyebrow="Stress Test Portal" title="極限壓力與故障測試面板 🚀" icon={<Sparkles />} defaultOpen={false}>
      <p className="muted">呢度係專為 Boss 設計嘅 Premium 測試中心！你可以一鍵模擬高達 1,000 筆數據、網絡延遲、API 斷網故障以及 Tab 內存洩漏測試！</p>

      <div className="action-row wrap" style={{ marginBottom: '1rem' }}>
        <button className="primary" type="button" disabled={!!busy} onClick={handleMassInject}>
          瞬間導入 1,000 筆名古屋消費 📊
        </button>
        <button className="secondary" type="button" disabled={!!busy} onClick={handleTabSwitchTest}>
          高頻 Tab 切換洩漏監測 🔄
        </button>
        <button className="danger" type="button" onClick={() => {
          if (window.confirm('確定清除所有壓力測試導入的模擬數據？')) {
            setState(prev => ({
              ...prev,
              receipts: prev.receipts.filter(r => r.source !== 'mock_stress_test')
            }));
            setStatus('🧹 已成功清空所有壓力測試數據！');
          }
        }}>
          清空壓力測試數據 🧹
        </button>
      </div>

      <div className="stack" style={{ gap: '0.8rem', padding: '10px 0' }}>
        <label className="check-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={stressLatency} onChange={(e) => toggleStressLatency(e.target.checked)} />
          <span>模擬 Notion 同步 5 秒網絡延遲 ⏳</span>
        </label>
        <label className="check-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={stressFault} onChange={(e) => toggleStressFault(e.target.checked)} />
          <span style={{ color: stressFault ? '#CC2929' : 'inherit' }}>
            模擬 Notion 同步 500 伺服器故障 (Sync 容災測試) ⚠️
          </span>
        </label>
      </div>

      <div className="mini-list" style={{ marginTop: '0.5rem' }}>
        <span>數據規模：當前 receipts 共 {state.receipts.length} 筆 (其中 mock 數據 {state.receipts.filter(r => r.source === 'mock_stress_test').length} 筆)。</span>
        <span>網絡狀態代理：{stressLatency ? '延遲 (5s) ⏳' : '正常 ⚡'} · {stressFault ? '伺服器故障模擬中 (500) ⚠️' : '連線正常 ✅'}</span>
      </div>
    </AccordionCard>
    </>
  );
}
