import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/cn';
import { BlurFade } from './ui/blur-fade';
import { BorderBeam } from './ui/border-beam';
import { MagicCard } from './ui/magic-card';
import { NumberTicker } from './ui/number-ticker';
import { RippleButton } from './ui/ripple-button';
import { Button as StatefulButtonBase } from './ui/stateful-button';

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
  as: Component = 'section',
  className = '',
  tone = 'default',
  children,
}: {
  as?: 'section' | 'article' | 'div';
  className?: string;
  tone?: VariantProps<typeof glassSurface>['tone'];
  children: ReactNode;
}) {
  const strong = tone === 'strong' || /budget|command|hero|stats|weather|scan/i.test(className);
  return (
    <Component className={cn(glassSurface({ tone }), className)}>
      <MagicCard
        className="glass-magic-layer"
        gradientFrom="#d8503d"
        gradientTo="#315e8e"
        gradientColor="rgba(255, 247, 230, 0.5)"
        gradientOpacity={0.14}
      >
        {strong && (
          <BorderBeam
            size={80}
            duration={10}
            borderWidth={1}
            colorFrom="#d8503d"
            colorTo="#d9a441"
          />
        )}
        <div className="glass-magic-content">{children}</div>
      </MagicCard>
    </Component>
  );
}

export function LiquidGlassSurface({
  as = 'div',
  tone = 'default',
  className,
  children,
}: {
  as?: 'section' | 'article' | 'div';
  tone?: VariantProps<typeof glassSurface>['tone'];
  className?: string;
  children: ReactNode;
}) {
  return <GlassCard as={as} tone={tone} className={className}>{children}</GlassCard>;
}

export function AnimatedNumber({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  return (
    <span className="animated-number">
      {prefix}<NumberTicker value={Math.round(value)} className="animated-number-value" />{suffix}
    </span>
  );
}

export function MagicGlassFrame({
  className,
  children,
  beam = false,
}: {
  className?: string;
  children: ReactNode;
  beam?: boolean;
}) {
  return (
    <MagicCard
      className={cn('magic-glass-frame', className)}
      gradientFrom="#d8503d"
      gradientTo="#315e8e"
      gradientColor="rgba(255, 247, 230, 0.58)"
      gradientOpacity={0.18}
    >
      {beam && (
        <BorderBeam
          size={96}
          duration={9}
          borderWidth={1}
          colorFrom="#d8503d"
          colorTo="#d9a441"
        />
      )}
      {children}
    </MagicCard>
  );
}

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return <BlurFade className={className} delay={delay} inView>{children}</BlurFade>;
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

export function BottomDock<T extends string>({
  items,
  active,
  onSelect,
  ariaLabel,
}: {
  items: Array<{ id: T; label: string; icon: ReactNode }>;
  active: T;
  onSelect: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <nav className="tabbar bottom-dock" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.id}
          className={`${active === item.id ? 'active' : ''} dock-item-${item.id}`.trim()}
          type="button"
          onClick={() => onSelect(item.id)}
        >
          {active === item.id && <motion.i className="dock-indicator" layoutId="dock-indicator" />}
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function WindmillTransitionCSS({ activeKey }: { activeKey: string }) {
  const [spinning, setSpinning] = useState(false);
  const previous = useRef(activeKey);

  useEffect(() => {
    if (previous.current === activeKey) return;
    previous.current = activeKey;
    setSpinning(true);
    const timer = window.setTimeout(() => setSpinning(false), 520);
    return () => window.clearTimeout(timer);
  }, [activeKey]);

  return (
    <div className={`windmill-transition ${spinning ? 'spinning' : ''}`} aria-hidden="true" data-legacy-css="true">
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: 'neutral' | 'accent' | 'danger' | 'success';
}) {
  return (
    <article className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}

export function ProgressRing({
  value,
  label,
  size = 88,
}: {
  value: number;
  label: string;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className="progress-ring"
      style={{ '--progress': `${clamped}%`, '--ring-size': `${size}px` } as CSSProperties}
      aria-label={`${label} ${clamped.toFixed(0)}%`}
      role="img"
    >
      <strong>{clamped.toFixed(0)}%</strong>
      <span>{label}</span>
    </div>
  );
}

export function ActionSheet({ children }: { children: ReactNode }) {
  return <div className="action-sheet">{children}</div>;
}

export function ModalSheet({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="modal-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <header>
        <h2>{title}</h2>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function ReceiptRow({
  icon,
  title,
  meta,
  amount,
  onClick,
}: {
  icon: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  amount: ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="cat">{icon}</span>
      <span className="receipt-main">
        <strong>{title}</strong>
        {meta && <small>{meta}</small>}
      </span>
      <span className="amount">{amount}</span>
    </>
  );
  return onClick ? (
    <button className="receipt-row" type="button" onClick={onClick}>{content}</button>
  ) : (
    <div className="receipt-row static">{content}</div>
  );
}

export function TimelineRail({ children }: { children: ReactNode }) {
  return <div className="timeline-rail">{children}</div>;
}

export function LoadingState({ label = '載入中' }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <Loader2 className="spin" size={18} />
      <span>{label}</span>
    </div>
  );
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

export function Toast({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  children: ReactNode;
}) {
  return <div className={`toast ${tone}`} role="status">{children}</div>;
}

// Re-export Magic UI text components
export { TextAnimate } from './ui/text-animate';
export { AuroraText } from './ui/aurora-text';
export { HyperText } from './ui/hyper-text';
export { SparklesText } from './ui/sparkles-text';
export { AnimatedGradientText } from './ui/animated-gradient-text';
