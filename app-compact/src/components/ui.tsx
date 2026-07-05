import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/cn';
import { BlurFade } from './ui/blur-fade';
import { BorderBeam } from './ui/border-beam';
import { MagicCard } from './ui/magic-card';
import { NumberTicker } from './ui/number-ticker';
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

// Numeric input that keeps the RAW typed string while editing and commits the parsed value on each
// change. A plain value={Number(...)} controlled input strips a trailing "." on re-render, making
// decimals (e.g. 33.34) and clearing impossible — this fixes that for amounts/splits/percentages.
export function NumberTextInput({
  value,
  onValue,
  max,
  blankZero,
  ...rest
}: {
  value: number | undefined;
  onValue: (n: number) => void;
  max?: number;
  blankZero?: boolean; // show '' instead of '0' for an empty amount field (split/payer rows keep '0')
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const [raw, setRaw] = useState<string | null>(null);
  const display = raw ?? (value == null || (blankZero && value === 0) ? '' : String(value));
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={display}
      onChange={(e) => {
        const next = e.target.value;
        if (next !== '' && !/^\d*\.?\d*$/.test(next)) return; // digits + a single optional dot only
        setRaw(next);
        const parsed = next === '' || next === '.' ? 0 : Number(next);
        const safe = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
        onValue(max != null ? Math.min(safe, max) : safe);
      }}
      onBlur={() => setRaw(null)}
    />
  );
}

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
  const strong = tone === 'strong' || /budget|command|hero|stats|weather|scan/i.test(className);
  return (
    <MagicCard
      as={as}
      className={cn(glassSurface({ tone }), className, "relative overflow-hidden")}
      gradientFrom="#d8503d"
      gradientTo="#315e8e"
      gradientColor="rgba(255, 247, 230, 0.5)"
      gradientOpacity={0.14}
    >
      <ShineBorder
        className="opacity-70 -z-10"
        shineColor={strong ? ['#d8503d', '#d9a441'] : ['rgba(216, 80, 61, 0.4)', 'rgba(211, 154, 41, 0.3)']}
        borderWidth={strong ? 2 : 1}
      />
      {children}
    </MagicCard>
  );
}

export function AnimatedNumber({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  return (
    <span className="animated-number">
      {prefix}<NumberTicker value={Math.round(value)} className="animated-number-value" />{suffix}
    </span>
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

// Renders an already-formatted money/percent string (e.g. "HK$ 1,234", "¥5,600", "87%")
// as an animated NumberTicker, keeping the prefix/suffix static. Falls back to plain
// text when the string has no leading number to tick.
export function TickerMoney({ text, className }: { text: string | number; className?: string }) {
  const raw = String(text);
  const match = raw.match(/^([^\d-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/);
  if (!match) return <>{raw}</>;
  const value = Number(match[2].replace(/,/g, ''));
  if (!Number.isFinite(value)) return <>{raw}</>;
  const decimalPlaces = match[2].includes('.') ? match[2].split('.')[1].length : 0;
  return <NumberTicker value={value} decimalPlaces={decimalPlaces} prefix={match[1]} suffix={match[3]} className={cn('ticker-money text-inherit', className)} />;
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
