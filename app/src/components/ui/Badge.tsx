import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Badge({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-paper-200/80 border border-paper-300 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-paper-800',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
