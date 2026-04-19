import { forwardRef, type HTMLAttributes } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

type CardProps = HTMLMotionProps<'div'> & { glowing?: boolean; flat?: boolean };

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, glowing, flat, ...props }, ref) => (
    <motion.div
      ref={ref}
      className={cn(
        'glass rounded-2xl p-5 relative overflow-hidden',
        glowing && 'shadow-glow-sm',
        flat && 'shadow-none',
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export function CardLabel({
  className,
  children,
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'text-[10px] uppercase tracking-[0.2em] text-paper-600 font-medium',
        className,
      )}
    >
      {children}
    </span>
  );
}
