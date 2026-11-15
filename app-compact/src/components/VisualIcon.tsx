import {
  Hotel,
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
import { useTripTheme } from '../theme/tripTheme';
import lodgeArt from '../assets/journey/postcard-lodge.webp';
import { KitCategoryIcon } from '../theme/kit/KitIcons';

const icons: Record<VisualIconId, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  flight: Plane,
  transport: TrainFront,
  food: Soup,
  shopping: ShoppingBag,
  lodging: Hotel,
  ticket: Ticket,
  localtour: MapPinned,
  medicine: Pill,
  other: Package,
  '': CircleHelp,
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

export function CategoryGlyph({ category, size }: { category?: string; size: number }) {
  const Icon = category && Object.prototype.hasOwnProperty.call(icons, category)
    ? icons[category as VisualIconId]
    : MapPinned;
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}

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
  const { theme } = useTripTheme();
  const glyphSize = size === 'lg' ? 25 : size === 'sm' ? 16 : 21;
  return (
    <span
      className={cn('visual-icon', `visual-icon-${size}`, className)}
      style={{ '--icon-color': meta.color, '--icon-accent': meta.accent } as CSSProperties}
      aria-label={label || meta.label}
      title={label || meta.label}
    >
      {id === 'lodging' && theme.id === 'alpine_postcard'
        ? <img className="postcard-lodging-icon" src={lodgeArt} alt="" width={glyphSize} height={glyphSize} />
        : theme.kit
        ? <KitCategoryIcon kit={theme.kit.style} id={id} size={glyphSize} />
        : <Icon size={glyphSize} strokeWidth={2.4} />}
    </span>
  );
}
