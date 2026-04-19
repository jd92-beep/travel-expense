import { Card, CardLabel } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ExternalLink, Database, Coins, Target, Info } from 'lucide-react';
import type { AppState } from '@/lib/types';

export function Settings({
  state,
  updateState,
}: {
  state: AppState;
  updateState: (patch: Partial<AppState>) => void;
}) {
  return (
    <div className="space-y-5 pb-6">
      <div>
        <CardLabel>設定</CardLabel>
        <h1 className="font-display text-2xl mt-1">偏好</h1>
      </div>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Target size={14} className="text-arsenal-400" />
          <CardLabel>預算 (JPY)</CardLabel>
        </div>
        <input
          type="number"
          className="w-full px-4 py-2.5 rounded-xl bg-ink-800 border border-white/5 num text-lg font-semibold focus:outline-none focus:border-arsenal-500/40 focus:shadow-glow-sm transition-all"
          value={state.budget}
          onChange={(e) => updateState({ budget: Number(e.target.value) || 0 })}
        />
        <div className="text-[11px] text-ink-400 mt-2 num">
          ≈ HK${(state.budget / (state.rate || 1)).toFixed(0)} · rate {state.rate}
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Coins size={14} className="text-ember-400" />
          <CardLabel>匯率 HKD → JPY</CardLabel>
        </div>
        <input
          type="number"
          step="0.01"
          className="w-full px-4 py-2.5 rounded-xl bg-ink-800 border border-white/5 num text-lg font-semibold focus:outline-none focus:border-ember-400/40 focus:shadow-glow-gold transition-all"
          value={state.rate}
          onChange={(e) => updateState({ rate: Number(e.target.value) || 1 })}
        />
        <div className="text-[11px] text-ink-400 mt-2">建議參考 Visa 牌價</div>
      </Card>

      <Card className="bg-gradient-to-br from-arsenal-900/30 to-ember-600/15 border-arsenal-500/25">
        <div className="flex items-center gap-2 mb-3">
          <Database size={14} className="text-arsenal-400" />
          <CardLabel>進階功能 · 暫用舊版</CardLabel>
        </div>
        <p className="text-xs text-ink-300 leading-relaxed mb-4">
          API key、Notion sync、vault 密碼、imgbb 等設定仍喺舊版。新 React 版本正在逐步接駁所有後端。
        </p>
        <a href="./legacy.html">
          <Button variant="secondary" size="sm">
            <ExternalLink size={13} /> 打開舊版
          </Button>
        </a>
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Info size={14} className="text-ink-400" />
          <CardLabel>關於</CardLabel>
        </div>
        <div className="space-y-1.5 text-xs">
          <Row k="版本" v="2.0 · React + Vite" />
          <Row k="主題" v="Arsenal 🔴" />
          <Row k="資料儲存" v="localStorage · boss-japan-tracker" />
          <Row k="記錄數" v={`${state.receipts.length} 筆`} />
        </div>
      </Card>
    </div>
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
