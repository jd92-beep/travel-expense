import { useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, PenTool, Cloud as CloudIcon, AlertTriangle } from 'lucide-react';
import { Card, CardLabel } from '@/components/ui/Card';
import { ScanModal } from '@/components/modals/ScanModal';
import { Modal } from '@/components/ui/Modal';
import { ReceiptForm } from '@/components/modals/ReceiptForm';
import { notionPullAll } from '@/lib/notion';
import { useToast } from '@/hooks/useToast';
import type { AppState, Receipt } from '@/lib/types';
import { getRegionForDate, todayHK } from '@/lib/itinerary';

interface ScanTabProps {
  state: AppState;
  onAddReceipt: (r: Receipt) => void;
  onReplaceReceipts: (rs: Receipt[]) => void;
  onPushReceipt?: (r: Receipt) => Promise<void> | void;
}

export function Scan({ state, onAddReceipt, onReplaceReceipts }: ScanTabProps) {
  const [scanOpen, setScanOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [pulling, setPulling] = useState(false);
  const { toast } = useToast();

  const addAndRegion = (r: Receipt) => {
    onAddReceipt({ ...r, region: r.region || getRegionForDate(r.date) });
  };

  const pullNotion = async () => {
    if (!state.notionToken || !state.notionDb) {
      toast('⚠️ 請先設定 Notion token + DB', 'warning');
      return;
    }
    setPulling(true);
    try {
      const remote = await notionPullAll({
        token: state.notionToken,
        db: state.notionDb,
        proxy: state.proxy,
      });
      const remoteIds = new Set(remote.map((r) => r.id));
      const deletedIds = new Set(state.notionDeletedIds || []);
      const keptLocal = state.receipts.filter((r) => !remoteIds.has(r.id));
      const filteredRemote = remote.filter((r) => !deletedIds.has(r.id));
      onReplaceReceipts([...keptLocal, ...filteredRemote]);
      toast(`☁️ 已從 Notion 同步 ${filteredRemote.length} 筆`, 'success');
    } catch (e) {
      toast('❌ 拉取失敗：' + (e as Error).message.slice(0, 80), 'error');
    } finally {
      setPulling(false);
    }
  };

  const hasKey = !!state.apiKey;
  const hasNotion = !!(state.notionToken && state.notionDb);

  return (
    <div className="space-y-5 pb-6">
      <div>
        <CardLabel>記錄一筆</CardLabel>
        <h1 className="font-display text-2xl mt-1">揀一個方式開始</h1>
        <p className="text-xs text-ink-400 mt-1 leading-relaxed">影張相 AI 自動辨識，或手動輸入。</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ActionTile
          icon={<Camera size={22} />}
          label="AI 掃描"
          desc={hasKey ? '拍照 / 相簿' : '需先設定 API Key'}
          color="#ef4135"
          disabled={!hasKey}
          onClick={() => setScanOpen(true)}
        />
        <ActionTile
          icon={<PenTool size={22} />}
          label="手動輸入"
          desc="自己填表"
          color="#f59e0b"
          onClick={() => setManualOpen(true)}
        />
        <ActionTile
          icon={<CloudIcon size={22} />}
          label={pulling ? '同步中…' : 'Notion 同步'}
          desc={hasNotion ? '拉取最新' : '需設 token + DB'}
          color="#22d3ee"
          disabled={!hasNotion || pulling}
          onClick={pullNotion}
        />
        <ActionTile
          icon={<span className="text-2xl">📧</span>}
          label="Email 同步"
          desc="Apps Script 自動拉"
          color="#f472b6"
          onClick={() =>
            toast(
              'Apps Script 每 5 分鐘自動處理 email。按「Notion 同步」拉最新。',
              'info',
            )
          }
        />
      </div>

      {!hasKey && (
        <Card className="bg-gradient-to-br from-amber-900/20 to-arsenal-900/10 border-ember-500/30">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-ember-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-ink-100">需要先設定 API Key</div>
              <p className="text-xs text-ink-300 mt-1 leading-relaxed">
                去「設定」頁面解鎖 Vault 或手動輸入 Gemini API Key，就可以用 AI 掃描。
              </p>
            </div>
          </div>
        </Card>
      )}

      <ScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onSave={addAndRegion}
        apiKey={state.apiKey}
        preferredModel={state.scanModel || state.model}
        defaultRegion={getRegionForDate(todayHK()) || undefined}
      />

      <Modal open={manualOpen} onClose={() => setManualOpen(false)} title="手動輸入" size="md">
        <ReceiptForm
          onSave={(r) => {
            addAndRegion(r);
            setManualOpen(false);
            toast('✅ 已儲存', 'success');
          }}
          onCancel={() => setManualOpen(false)}
          initial={{ region: getRegionForDate(todayHK()) || undefined }}
        />
      </Modal>
    </div>
  );
}

function ActionTile({
  icon,
  label,
  desc,
  color,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  color: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.97 }}
      whileHover={disabled ? undefined : { y: -2 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`glass rounded-2xl p-4 text-left relative overflow-hidden group ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-white/15'
      }`}
    >
      <div
        aria-hidden
        className="absolute -top-6 -right-6 h-20 w-20 rounded-full blur-2xl opacity-20 group-hover:opacity-50 transition-opacity duration-500"
        style={{ background: color }}
      />
      <div className="relative">
        <div
          className="h-11 w-11 rounded-xl grid place-items-center mb-3 border border-white/5 shadow-inner-glow"
          style={{
            background: `linear-gradient(135deg, ${color}38 0%, ${color}0a 100%)`,
            color,
          }}
        >
          {icon}
        </div>
        <div className="font-semibold text-sm text-ink-100">{label}</div>
        <div className="text-[11px] text-ink-400 mt-0.5">{desc}</div>
      </div>
    </motion.button>
  );
}
