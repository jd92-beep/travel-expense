import type { CSSProperties } from 'react';
import { useReducedMotion } from 'motion/react';

export type WeatherFxKind = 'sun' | 'clouds' | 'fog' | 'rain' | 'snow' | 'storm';

// Map an open-meteo / WMO weather code to an animated effect kind.
export function fxKindForCode(code?: number): WeatherFxKind {
  if (code == null) return 'clouds';
  if (code === 0) return 'sun';
  if (code <= 3) return 'clouds';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  return 'clouds';
}

// Deterministic pseudo-random so particles are stable across renders (no Math.random per frame).
const at = (i: number, mod: number, base = 0, step = 1) => base + ((i * 9301 + 49297) % 233280) / 233280 * mod * step;

/**
 * Lightweight, GPU-friendly (transform/opacity only) animated weather overlay that reflects the
 * real weather code. Sits behind card content (pointer-events: none). Honors prefers-reduced-motion
 * by rendering a static tint only. Safe on mobile — it is NOT gated by shouldDisableHeavyEffects
 * (which is true on all phones, the primary target).
 */
export function WeatherFX({ code, compact = false, tintOnly = false, className = '' }: { code?: number; compact?: boolean; tintOnly?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  const kind = fxKindForCode(code);
  const count = compact ? 10 : 18;

  return (
    <div className={`wfx wfx-${kind} ${reduce ? 'wfx-static' : ''} ${className}`} aria-hidden="true">
      <span className="wfx-tint" />
      {tintOnly || reduce ? null : kind === 'sun' ? (
        <>
          <span className="wfx-sun-glow" />
          <span className="wfx-sun-rays" />
        </>
      ) : kind === 'clouds' ? (
        Array.from({ length: 3 }, (_, i) => (
          <span
            key={i}
            className="wfx-cloud"
            style={{ top: `${10 + i * 26}%`, animationDuration: `${22 + i * 9}s`, animationDelay: `${-i * 6}s`, opacity: 0.5 - i * 0.1 } as CSSProperties}
          />
        ))
      ) : kind === 'fog' ? (
        Array.from({ length: 3 }, (_, i) => (
          <span key={i} className="wfx-fog-band" style={{ top: `${18 + i * 30}%`, animationDuration: `${16 + i * 6}s`, animationDelay: `${-i * 4}s` } as CSSProperties} />
        ))
      ) : kind === 'snow' ? (
        Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className="wfx-flake"
            style={{ left: `${at(i, 100)}%`, animationDuration: `${5 + (i % 5) * 1.1}s`, animationDelay: `${-at(i, 6)}s`, fontSize: `${8 + (i % 3) * 4}px`, '--wfx-sway': `${6 + (i % 4) * 5}px` } as CSSProperties}
          >❄</span>
        ))
      ) : (
        // rain + storm
        <>
          {Array.from({ length: count }, (_, i) => (
            <span
              key={i}
              className="wfx-drop"
              style={{ left: `${at(i, 100)}%`, animationDuration: `${0.65 + (i % 5) * 0.14}s`, animationDelay: `${-at(i, 1.4)}s`, opacity: 0.35 + (i % 4) * 0.12 } as CSSProperties}
            />
          ))}
          {kind === 'storm' && <span className="wfx-flash" />}
        </>
      )}
    </div>
  );
}
