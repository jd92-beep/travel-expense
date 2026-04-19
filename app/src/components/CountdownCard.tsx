import { motion } from 'framer-motion';
import { Plane } from 'lucide-react';
import { ITINERARY } from '@/lib/itinerary';
import { CardLabel } from '@/components/ui/Card';

interface CountdownCardProps {
  daysUntil: number;
}

export function CountdownCard({ daysUntil }: CountdownCardProps) {
  const first = ITINERARY[0];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-3xl p-6 glass-strong border-arsenal-500/30"
    >
      {/* Background */}
      <motion.div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 80% at 80% -10%, rgba(239,65,53,0.22) 0%, transparent 55%), radial-gradient(100% 60% at 0% 100%, rgba(245,165,36,0.2) 0%, transparent 60%)',
        }}
      />
      <div className="relative">
        <div className="flex items-start justify-between">
          <div>
            <CardLabel>出發倒數</CardLabel>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="num text-6xl font-extrabold text-gradient-arsenal leading-none tracking-tight">
                {daysUntil}
              </span>
              <span className="text-lg text-ink-300 font-medium">日後</span>
            </div>
            <div className="mt-2 text-xs text-ink-300 num">{first.date} · {first.region}</div>
            <div className="text-xs text-ember-300 mt-0.5">✈️ UO690 HKG → NGO</div>
          </div>
          <motion.div
            animate={{ x: [0, 4, 0], y: [0, -2, 0], rotate: [-4, 4, -4] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            className="h-14 w-14 rounded-2xl bg-gradient-arsenal shadow-glow grid place-items-center shrink-0"
          >
            <Plane size={24} className="text-white" strokeWidth={2.2} />
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
