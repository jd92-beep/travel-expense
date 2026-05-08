import type { CSSProperties, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

export function GlassCard({
  as: Component = 'section',
  className = '',
  children,
}: {
  as?: 'section' | 'article' | 'div';
  className?: string;
  children: ReactNode;
}) {
  return <Component className={`glass-card ${className}`.trim()}>{children}</Component>;
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
          className={active === item.id ? 'active' : ''}
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
