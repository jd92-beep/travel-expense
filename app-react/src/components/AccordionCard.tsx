import type { ReactNode } from 'react';
import { useEffect, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export function AccordionCard({
  id,
  title,
  eyebrow,
  meta,
  icon,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: string;
  eyebrow?: string;
  meta?: ReactNode;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const generatedId = useId();
  const panelId = `${id || generatedId}-panel`;
  const storageKey = `travel-expense-react:accordion:${id}`;
  const [open, setOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored == null ? defaultOpen : stored === 'open';
    } catch {
      return defaultOpen;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, open ? 'open' : 'closed');
    } catch {
      // UI preference only.
    }
  }, [open, storageKey]);

  return (
    <section className={`card accordion-card ${open ? 'open' : ''}`}>
      <button
        className="accordion-summary"
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="accordion-title">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <strong>{title}</strong>
        </span>
        <span className="accordion-meta">
          {meta}
          {icon}
          <ChevronDown className="accordion-chevron" size={18} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            className="accordion-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <div className="accordion-inner">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
