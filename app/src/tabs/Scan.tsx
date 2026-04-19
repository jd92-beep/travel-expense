import { motion } from 'framer-motion';
import {
  Camera,
  Image as ImageIcon,
  Mail,
  Mic,
  Calculator,
  PenTool,
  ExternalLink,
} from 'lucide-react';
import { Card, CardLabel } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const ACTIONS = [
  { icon: Camera,     label: '拍照掃描', desc: 'AI 辨識日本收據',     color: '#ef4135' },
  { icon: ImageIcon,  label: '相簿選取', desc: '匯入相片辨識',        color: '#f97316' },
  { icon: Mail,       label: 'Email 同步', desc: 'Gmail 拉取訂單',       color: '#fbbf24' },
  { icon: Mic,        label: '語音輸入', desc: '一句自動記帳',        color: '#a78bfa' },
  { icon: Calculator, label: '匯率計算', desc: 'JPY ↔ HKD',             color: '#34d399' },
  { icon: PenTool,    label: '手動輸入', desc: '自己填表',            color: '#94a3b8' },
];

export function Scan() {
  return (
    <div className="space-y-5 pb-6">
      <div>
        <CardLabel>記錄一筆</CardLabel>
        <h1 className="font-display text-2xl mt-1">揀一個方式開始</h1>
        <p className="text-xs text-ink-400 mt-1 leading-relaxed">
          AI 辨識、Email、語音記帳嘅後端接駁緊。暫時請用舊版處理掃描。
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {ACTIONS.map((a, i) => {
          const Icon = a.icon;
          return (
            <motion.button
              key={a.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.97 }}
              className="glass rounded-2xl p-4 text-left hover:border-white/15 relative overflow-hidden group"
            >
              <div
                aria-hidden
                className="absolute -top-6 -right-6 h-20 w-20 rounded-full blur-2xl opacity-20 group-hover:opacity-50 transition-opacity duration-500"
                style={{ background: a.color }}
              />
              <div className="relative">
                <div
                  className="h-11 w-11 rounded-xl grid place-items-center mb-3 border border-white/5 shadow-inner-glow"
                  style={{
                    background: `linear-gradient(135deg, ${a.color}38 0%, ${a.color}0a 100%)`,
                  }}
                >
                  <Icon size={18} style={{ color: a.color }} />
                </div>
                <div className="font-semibold text-sm text-ink-100">{a.label}</div>
                <div className="text-[11px] text-ink-400 mt-0.5">{a.desc}</div>
              </div>
            </motion.button>
          );
        })}
      </div>
      <Card className="bg-gradient-to-br from-arsenal-900/30 to-ember-600/15 border-arsenal-500/25">
        <div className="flex items-start gap-3">
          <div className="text-2xl">✨</div>
          <div className="flex-1">
            <div className="font-semibold text-ink-100">🧪 React Beta · UI 預覽</div>
            <p className="text-xs text-ink-300 mt-1 leading-relaxed">
              呢個係 UI 預覽版。所有記帳功能（掃描、Email、Notion sync、vault）仍喺正式版運行中。資料共享 localStorage，兩邊都可以睇到。
            </p>
            <a href="../" className="inline-block mt-3">
              <Button variant="secondary" size="sm">
                <ExternalLink size={13} /> 去正式版記帳
              </Button>
            </a>
          </div>
        </div>
      </Card>
    </div>
  );
}
