import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useRipple } from '@/hooks/useRipple';

interface ButtonProps {
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  style?: React.CSSProperties;
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  type = 'button',
  style,
}: ButtonProps) {
  const { triggerRipple, RippleLayer } = useRipple();

  const base = 'relative overflow-hidden font-medium rounded-xl transition-colors cursor-pointer';

  const variants = {
    primary: 'text-white',
    secondary: 'bg-white border text-gray-800',
    danger: 'bg-red-500 text-white',
    ghost: 'bg-transparent text-gray-600',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3.5 text-base',
  };

  const primaryStyle = variant === 'primary' ? {
    background: 'linear-gradient(135deg,#C0281E 0%,#E04040 45%,#FF7A94 100%)',
    ...style,
  } : style;

  return (
    <motion.button
      type={type}
      onClick={(e) => {
        if (disabled) return;
        triggerRipple(e);
        onClick?.(e);
      }}
      whileTap={disabled ? {} : { scale: 0.93, y: 1 }}
      whileHover={disabled ? {} : { scale: 1.02, y: -1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      disabled={disabled}
      style={primaryStyle}
      className={`${base} ${variants[variant]} ${sizes[size]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      <RippleLayer />
      {children}
    </motion.button>
  );
}
