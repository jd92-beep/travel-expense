import type { CSSProperties } from 'react';

const WALLPAPERS = Array.from({ length: 9 }, (_, i) => `wallpapers/bg-${i + 1}.png`);

const HYPERFRAME_LAYERS = [
  { index: 0, className: 'hyperframe-layer hyperframe-layer--base' },
  { index: 3, className: 'hyperframe-layer hyperframe-layer--sun' },
  { index: 5, className: 'hyperframe-layer hyperframe-layer--route' },
  { index: 7, className: 'hyperframe-layer hyperframe-layer--paper' },
];

export function HyperframeBackground() {
  return (
    <div className="hyperframe-background" aria-hidden="true">
      {HYPERFRAME_LAYERS.map((layer) => (
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
