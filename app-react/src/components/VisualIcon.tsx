import {
  BedDouble,
  Camera,
  CircleHelp,
  CloudSun,
  CreditCard,
  Gift,
  MapPinned,
  Package,
  Plane,
  ReceiptText,
  ScanLine,
  ShoppingBag,
  Soup,
  Sparkles,
  Ticket,
  TrainFront,
  Wallet,
  Waves,
  Pill,
  LockKeyhole,
  Clock3,
} from 'lucide-react';
import type { ComponentType, CSSProperties } from 'react';
import { VISUAL_ICON_META, type VisualIconId } from '../lib/iconManifest';
import { cn } from '../lib/cn';

const icons: Record<VisualIconId, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  flight: Plane,
  transport: TrainFront,
  food: Soup,
  shopping: ShoppingBag,
  lodging: BedDouble,
  ticket: Ticket,
  localtour: MapPinned,
  medicine: Pill,
  other: Package,
  cash: Wallet,
  credit: CreditCard,
  paypay: Wallet,
  suica: Waves,
  pending: Clock3,
  private: LockKeyhole,
  gift: Gift,
  photo: Camera,
  prep: Sparkles,
  post: Package,
  weather: CloudSun,
  map: MapPinned,
  scan: ScanLine,
  receipt: ReceiptText,
};

export function VisualIcon({
  id,
  label,
  className,
  size = 'md',
}: {
  id: VisualIconId;
  label?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const meta = VISUAL_ICON_META[id] || VISUAL_ICON_META.other;
  const Icon = icons[id] || CircleHelp;
  return (
    <span
      className={cn('visual-icon', `visual-icon-${size}`, className)}
      style={{ '--icon-color': meta.color, '--icon-accent': meta.accent } as CSSProperties}
      aria-label={label || meta.label}
      title={label || meta.label}
    >
      <Icon size={size === 'lg' ? 25 : size === 'sm' ? 16 : 21} strokeWidth={2.4} />
    </span>
  );
}
