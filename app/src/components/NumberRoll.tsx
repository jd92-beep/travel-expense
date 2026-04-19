import { motion, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';

export function NumberRoll({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  className,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}) {
  const spring = useSpring(0, { stiffness: 110, damping: 22 });
  const display = useTransform(spring, (v) => {
    const n =
      decimals > 0
        ? v.toFixed(decimals)
        : Math.round(v).toLocaleString('en-US');
    return prefix + n + suffix;
  });

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return <motion.span className={className}>{display}</motion.span>;
}
