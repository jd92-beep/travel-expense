import { forwardRef, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useRipple } from '@/hooks/useRipple';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type ButtonProps = HTMLMotionProps<'button'> & {
  variant?: Variant;
  size?: Size;
};

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-arsenal text-white shadow-glow-sm hover:shadow-glow border border-white/10',
  secondary:
    'bg-ink-800/80 text-ink-200 border border-white/10 hover:bg-ink-700/80',
  ghost: 'text-ink-300 hover:text-white hover:bg-white/5',
  danger: 'bg-rose-500/90 text-white hover:bg-rose-500',
};

const rippleColors: Record<Variant, string> = {
  primary: 'rgba(255,255,255,0.30)',
  secondary: 'rgba(255,255,255,0.18)',
  ghost: 'rgba(255,255,255,0.15)',
  danger: 'rgba(255,200,200,0.28)',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      children,
      onClick,
      onMouseDown,
      onTouchStart,
      ...props
    },
    ref,
  ) => {
    const { triggerRipple, RippleLayer } = useRipple({
      color: rippleColors[variant],
    });

    const isPrimary = variant === 'primary';

    return (
      <motion.button
        ref={ref}
        whileHover={
          isPrimary
            ? { y: -2, boxShadow: '0 0 28px -4px rgba(239,65,53,0.65)' }
            : { y: -1, boxShadow: '0 4px 20px -4px rgba(0,0,0,0.4)' }
        }
        whileTap={{ scale: 0.93, y: 2 }}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        className={cn(
          'relative inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors overflow-hidden',
          'disabled:opacity-50 disabled:pointer-events-none',
          variants[variant],
          sizes[size],
          className,
        )}
        onClick={(e) => {
          triggerRipple(e);
          onClick?.(e);
        }}
        onMouseDown={onMouseDown}
        onTouchStart={(e) => {
          triggerRipple(e);
          onTouchStart?.(e);
        }}
        {...props}
      >
        {/* Shimmer sweep for primary */}
        {isPrimary && (
          <span
            aria-hidden
            className="absolute inset-0 bg-gradient-sheen bg-[length:200%_100%] animate-shimmer opacity-50 pointer-events-none rounded-xl"
          />
        )}

        <span className="relative z-10 inline-flex items-center gap-1.5">{children as ReactNode}</span>

        <RippleLayer />
      </motion.button>
    );
  },
);
Button.displayName = 'Button';
