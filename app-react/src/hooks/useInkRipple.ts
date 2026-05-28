import { useCallback, useRef } from 'react';

export function useInkRipple() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const triggerRipple = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    btn.style.setProperty('--ripple-x', `${x}%`);
    btn.style.setProperty('--ripple-y', `${y}%`);
    btn.classList.add('rippling');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      btn.classList.remove('rippling');
    }, 500);
  }, []);

  return { triggerRipple };
}
