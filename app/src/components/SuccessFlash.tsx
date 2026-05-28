import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

interface SuccessFlashProps {
  show: boolean;
  onDone?: () => void;
}

export function SuccessFlash({ show, onDone }: SuccessFlashProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      const t = setTimeout(() => {
        setVisible(false);
        onDone?.();
      }, 1200);
      return () => clearTimeout(t);
    }
  }, [show, onDone]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[200] pointer-events-none flex items-center justify-center"
        >
          {/* Radiating rings */}
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute rounded-full border-2 border-jade-400/60"
              initial={{ scale: 0.5, opacity: 0.7 }}
              animate={{ scale: 2.5 + i * 0.8, opacity: 0 }}
              transition={{ duration: 0.8, delay: i * 0.1, ease: 'easeOut' }}
              style={{ width: 80, height: 80 }}
            />
          ))}

          {/* Checkmark burst */}
          <motion.div
            className="relative flex items-center justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: [0, 1.35, 1] }}
            transition={{ type: 'spring', stiffness: 420, damping: 18, duration: 0.5 }}
          >
            <div className="h-20 w-20 rounded-full bg-jade-400/20 border-2 border-jade-400/60 backdrop-blur-sm flex items-center justify-center shadow-[0_0_40px_-8px_rgba(52,211,153,0.6)]">
              <motion.span
                className="text-4xl"
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.1 }}
              >
                ✅
              </motion.span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
