import { useMemo, type CSSProperties } from 'react';
import { shouldDisableHeavyEffects } from '../lib/performance';

const WALLPAPERS = Array.from({ length: 9 }, (_, i) => `wallpapers/bg-${i + 1}.webp`);

const ALL_LAYERS = [
  { index: 0, className: 'hyperframe-layer hyperframe-layer--base' },
  { index: 3, className: 'hyperframe-layer hyperframe-layer--sun' },
  { index: 5, className: 'hyperframe-layer hyperframe-layer--route' },
  { index: 7, className: 'hyperframe-layer hyperframe-layer--paper' },
];

// ponytail: low-RAM devices decode only the base wallpaper (~335KB) instead of 2 layers — the CSS
// washi backdrop already covers the rest; cuts cold-start image decode without a visible change.
const LOW_PERF_LAYERS = ALL_LAYERS.slice(0, 1);

export function HyperframeBackground() {
  const disableHeavy = shouldDisableHeavyEffects();
  const layers = useMemo(() => (disableHeavy ? LOW_PERF_LAYERS : ALL_LAYERS), [disableHeavy]);

  return (
    <div className="hyperframe-background" aria-hidden="true">
      {layers.map((layer) => (
        <span
          key={layer.className}
          className={layer.className}
          style={{ '--hyperframe-image': `url("${import.meta.env.BASE_URL}${WALLPAPERS[layer.index]}")` } as CSSProperties}
        />
      ))}
      <span className="hyperframe-light-field" />
    </div>
  );
}
