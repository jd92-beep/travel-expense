import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/cn';
import { BlurFade } from './ui/blur-fade';
import { BorderBeam } from './ui/border-beam';
import { MagicCard } from './ui/magic-card';
import { RippleButton } from './ui/ripple-button';
import { Button as StatefulButtonBase } from './ui/stateful-button';
import { ShineBorder } from './ui/shine-border';

const glassSurface = cva('glass-card liquid-surface', {
  variants: {
    tone: {
      default: '',
      strong: 'liquid-surface-strong',
      control: 'liquid-surface-control',
    },
  },
  defaultVariants: {
    tone: 'default',
  },
});

export function GlassCard({
  as = 'section',
  className = '',
  tone = 'default',
  children,
}: {
  as?: 'section' | 'article' | 'div';
  className?: string;
  tone?: VariantProps<typeof glassSurface>['tone'];
  children: ReactNode;
}) {
  const Tag = as;
  return (
    <Tag className={cn(glassSurface({ tone }), className)}>
      {children}
    </Tag>
  );
}

export function Reveal({
  children,
  className,
  delay = 0,
  lowCost = false,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Skip blur filter — compositor-cheap for long lists (Timeline days). */
  lowCost?: boolean;
}) {
  return <div className={className}>{children}</div>;
}

export function ActionRippleButton({
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <RippleButton className={cn('magic-ripple-button', className)} rippleColor="rgba(255,255,255,.74)" {...props}>
      {children}
    </RippleButton>
  );
}

export function StatefulActionButton({
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <StatefulButtonBase className={cn('stateful-action-button', className)} {...props}>
      {children}
    </StatefulButtonBase>
  );
}

export function StatusPill({
  tone = 'neutral',
  icon,
  children,
}: {
  tone?: 'neutral' | 'ok' | 'warning' | 'danger' | 'info';
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className={`status-pill ${tone}`}>
      {icon}
      <span>{children}</span>
    </span>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="segmented-control" role="tablist" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={value === option.value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

export function ActionSheet({ children }: { children: ReactNode }) {
  return <div className="action-sheet">{children}</div>;
}

export function TimelineRail({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={cn('timeline-rail', className)} style={style}>
      <div className="timeline-rail-beam" aria-hidden="true">
        <span className="timeline-rail-track" />
        <span className="timeline-rail-fill" />
        <span className="timeline-rail-sweep" />
        <BorderBeam
          className="timeline-rail-border-beam"
          size={58}
          duration={5.8}
          colorFrom="#C23B5E"
          colorTo="#D4A843"
          borderWidth={2}
        />
      </div>
      {children}
    </div>
  );
}

export function LoadingState({ label = '載入中' }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <Loader2 className="spin" size={18} />
      <span>{label}</span>
    </div>
  );
}

// Skeleton placeholder shown while a lazy tab chunk loads — shaped like the
// card column every tab renders, so content appears to "fill in" rather than pop.
export function TabSkeleton({ label = '載入分頁' }: { label?: string }) {
  return (
    <div className="tab-skeleton" role="status" aria-label={label}>
      <i /><i /><i />
    </div>
  );
}

export function TickerMoney({ text, className }: { text: string | number; className?: string }) {
  return <span className={cn('ticker-money tabular-nums text-inherit', className)}>{text}</span>;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

// Stable message identity for the auto-dismiss timer. Parent re-renders create a new
// `children` element every time (e.g. `天氣拉取失敗：{error}`), so keying the effect on
// `children` would reset the 4.5s timer forever and the toast would never close.
function toastText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toastText).join('\u0000');
  if (typeof node === 'object' && 'props' in node) return toastText((node as { props?: { children?: ReactNode } }).props?.children);
  return '';
}

export function Toast({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  children: ReactNode;
}) {
  const [dismissed, setDismissed] = useState(false);
  const messageKey = toastText(children);
  useEffect(() => {
    setDismissed(false);
    const timer = window.setTimeout(() => setDismissed(true), 4500);
    return () => window.clearTimeout(timer);
  }, [messageKey]);
  if (dismissed) return null;
  return <div className={`toast ${tone}`} role="status">{children}</div>;
}

// Re-export Magic UI text components
export { TextAnimate } from './ui/text-animate';
export { AuroraText } from './ui/aurora-text';
export { HyperText } from './ui/hyper-text';
export { SparklesText } from './ui/sparkles-text';
export { AnimatedGradientText } from './ui/animated-gradient-text';
