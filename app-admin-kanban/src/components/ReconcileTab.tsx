import { useState } from 'react';
import { Scale } from 'lucide-react';
import { fetchReconcile, runNotionRepair } from '../lib/adminApi';
import type { AdminSession, ReconcileTripEntry } from '../lib/types';
import { fmtDate } from '../lib/utils';

export function ReconcileTab({ session }: { session: AdminSession }) {
  const [entries, setEntries] = useState<ReconcileTripEntry[]>([]);
  const [generatedAt, setGeneratedAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [repairing, setRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState('');

  async function run() {
    setLoading(true);
    setError('');
    try {
      const result = await fetchReconcile(session);
      setEntries(result.trips);
      setGeneratedAt(result.generatedAt);
    } catch (err) {
      setEntries([]);
      setError(err instanceof Error ? err.message : 'Reconcile failed');
    } finally {
      setLoading(false);
    }
  }

  async function repair() {
    if (!window.confirm('修復 Mirror 會:①補回 notion_page_id 連結 ②由 Notion 下載相片補入 Supabase storage ③幫未 mirror 嘅記錄開 Notion page。繼續?')) return;
    setRepairing(true);
    setRepairResult('');
    try {
      const r = await runNotionRepair(session);
      setRepairResult(`連結 ${r.linked} 筆 · 補相 ${r.photosRecovered} 張 (失敗 ${r.photosFailed}, 剩 ${r.photosRemaining}) · 開 Notion page ${r.pagesCreated} 頁 (失敗 ${r.createFailed}, 剩 ${r.createRemaining}) · 掃描咗 ${r.notionPagesScanned} 頁`);
      void run();
    } catch (err) {
      setRepairResult(`修復失敗: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setRepairing(false);
    }
  }

  const statusBadge: Record<string, string> = {
    balanced: '✅ 平衡',
    mismatch: '⚠️ 有差異',
    no_notion_db: '— 未連 Notion',
    notion_unreachable: '❌ Notion 不可達',
  };

  return (
    <div className="ops-tab">
      <h3><Scale size={16} /> Notion ↔ Supabase 對數器</h3>
      <div className="ops-filters">
        <button type="button" onClick={() => void run()} disabled={loading}>{loading ? '對數中...' : 'Run 對數'}</button>
        <button type="button" className="repair-btn" onClick={() => void repair()} disabled={repairing}>{repairing ? '修復中...' : '🔧 修復 Mirror'}</button>
      </div>
      {repairResult && <p className="status-line">{repairResult}</p>}
      {generatedAt && <small className="status-line">Generated: {fmtDate(generatedAt)}</small>}
      {error && <p className="error-line">{error}</p>}
      {entries.length > 0 && (
        <div className="ops-table">
          <div className="ops-row ops-header"><span>Trip</span><span>Owner</span><span>Supabase</span><span>Notion</span><span>差異</span><span>Status</span></div>
          {entries.map((entry) => (
            <div key={entry.tripId} className={`ops-row reconcile-${entry.status}`}>
              <span>{entry.tripName}</span>
              <span>{entry.ownerEmail}</span>
              <span>{entry.supabaseReceipts} 筆 ({entry.supabaseSyncedToNotion} synced)</span>
              <span>{entry.notionReceipts != null ? `${entry.notionReceipts} 筆` : '—'}</span>
              <span title={entry.orphanSamples?.join(', ') || ''}>
                {entry.missingInNotion != null ? `缺 Notion ${entry.missingInNotion} / 缺 Supabase ${entry.orphanInNotion}` : entry.error || '—'}
              </span>
              <span>{statusBadge[entry.status] || entry.status}</span>
            </div>
          ))}
        </div>
      )}
      {entries.length === 0 && !loading && <p className="empty-text">撳「Run 對數」逐 trip 對比 Notion mirror 同 Supabase 數目。</p>}
    </div>
  );
}
