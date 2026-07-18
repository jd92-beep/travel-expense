import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'magenta' | 'cyan' };

export const GradientButton = forwardRef<HTMLButtonElement, Props>(function GradientButton(
  { variant = 'magenta', className, ...props },
  ref,
) {
  const cls = ['gradient-button', variant === 'cyan' ? 'gradient-button--cyan' : '', className]
    .filter(Boolean)
    .join(' ');
  return <button ref={ref} className={cls} {...props} />;
});
