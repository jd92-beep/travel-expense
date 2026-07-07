import { useState } from 'react';
import { GitMerge } from 'lucide-react';
import { fetchIdentityDuplicates, previewAction, commitAction } from '../lib/adminApi';
import type { AdminSession } from '../lib/types';
import { fmtDate } from '../lib/utils';

export function IdentityTab({ session }: { session: AdminSession }) {
  const [duplicates, setDuplicates] = useState<Array<{ prefix: string; users: any[] }>>([]);
  const [loading, setLoading] = useState(false);
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});
  const [mergingPrefix, setMergingPrefix] = useState('');
  const [mergeResult, setMergeResult] = useState('');

  async function loadDuplicates() {
    setLoading(true);
    try {
      setDuplicates(await fetchIdentityDuplicates(session));
    } catch {
      setDuplicates([]);
    } finally {
      setLoading(false);
    }
  }

  async function mergeGroup(dup: { prefix: string; users: any[] }) {
    const targetId = mergeTargets[dup.prefix] || dup.users[0]?.id;
    const target = dup.users.find(u => u.id === targetId);
    const sources = dup.users.filter(u => u.id !== targetId);
    if (!target || sources.length === 0) return;
    if (!window.confirm(`Merge ${sources.map(u => u.email).join(', ')} → ${target.email}?\n所有 trips/receipts/photos/sync jobs 會改 owner 做 ${target.email}。`)) return;
    setMergingPrefix(dup.prefix);
    setMergeResult('');
    try {
      const outcomes: string[] = [];
      for (const source of sources) {
        const preview = await previewAction(session, {
          action: 'reassign_data',
          targetType: 'user',
          targetId: target.id,
          payload: { sourceUserId: source.id, targetUserId: target.id },
          reason: `Identity merge: ${source.email} -> ${target.email}`,
        });
        const committed = await commitAction(session, preview.id);
        outcomes.push(`${source.email}: ${JSON.stringify(committed.result?.reassigned || {})}`);
      }
      setMergeResult(`Merged into ${target.email} — ${outcomes.join(' | ')}`);
      void loadDuplicates();
    } catch (err) {
      setMergeResult(`Merge failed: ${err instanceof Error ? err.message : 'unknown'}`);
    } finally {
      setMergingPrefix('');
    }
  }

  return (
    <div className="ops-tab">
      <h3><GitMerge size={16} /> Identity Resolver</h3>
      <button type="button" onClick={() => void loadDuplicates()} disabled={loading}>{loading ? 'Scanning...' : 'Detect Duplicates'}</button>
      {mergeResult && <p className="status-line">{mergeResult}</p>}
      {duplicates.length > 0 && (
        <div className="ops-table">
          <div className="ops-row ops-header"><span>Email Prefix</span><span>Accounts</span><span>Details</span><span>Merge</span></div>
          {duplicates.map((dup, i) => (
            <div key={i} className="ops-row">
              <span>{dup.prefix}</span>
              <span>{dup.users.length}</span>
              <span>{dup.users.map(u => `${u.email} (${fmtDate(u.createdAt)})`).join(', ')}</span>
              <span className="ops-actions merge-controls">
                <select
                  value={mergeTargets[dup.prefix] || dup.users[0]?.id}
                  onChange={(e) => setMergeTargets(prev => ({ ...prev, [dup.prefix]: e.target.value }))}
                  title="Merge target (keeps this account)"
                >
                  {dup.users.map(u => <option key={u.id} value={u.id}>→ {u.email}</option>)}
                </select>
                <button type="button" disabled={mergingPrefix === dup.prefix} onClick={() => void mergeGroup(dup)}>
                  {mergingPrefix === dup.prefix ? 'Merging...' : 'Merge'}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      {duplicates.length === 0 && !loading && <p className="empty-text">Click "Detect Duplicates" to scan for duplicate accounts.</p>}
    </div>
  );
}
