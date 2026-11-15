import { useEffect, useRef } from 'react';

export function useModalAccessibility(isOpen: boolean, onClose: () => void) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    if (document.activeElement instanceof HTMLElement && document.activeElement.isConnected
      && !containerRef.current?.contains(document.activeElement)) {
      previousFocusRef.current = document.activeElement;
    }
    const focusableElements = () => Array.from(containerRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    ) || []).filter(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
    const initial = focusableElements().find(element => element.hasAttribute('data-modal-initial-focus')) || focusableElements()[0];
    initial?.focus({ preventScroll: true });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab' && containerRef.current) {
        const focusable = focusableElements();
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus({ preventScroll: true });
    };
  }, [isOpen]);

  return containerRef;
}
