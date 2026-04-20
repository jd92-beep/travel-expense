import { motion, AnimatePresence } from 'framer-motion';
import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

export function Modal({ open, onClose, children, title }: ModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 100,
              backdropFilter: 'blur(4px)',
            }}
          />
          <motion.div
            key="sheet"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 101,
              maxHeight: '92vh',
              overflowY: 'auto',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              background: '#FDF5EF',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ padding: '12px 16px 0' }}>
              <div style={{
                width: 36, height: 4, borderRadius: 2,
                background: 'rgba(0,0,0,0.15)',
                margin: '0 auto 12px',
              }} />
              {title && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 16,
                }}>
                  <span style={{ fontSize: 17, fontWeight: 700, color: '#1A1A2E' }}>{title}</span>
                  <button
                    onClick={onClose}
                    style={{
                      background: 'rgba(0,0,0,0.06)',
                      border: 'none',
                      borderRadius: 20,
                      width: 30, height: 30,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', fontSize: 16, color: '#6B7285',
                    }}
                  >✕</button>
                </div>
              )}
            </div>
            <div style={{ padding: '0 16px 32px' }}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
