import { forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

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

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.96 }}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold transition-colors',
        'disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </motion.button>
  ),
);
Button.displayName = 'Button';
