import type { CSSProperties } from 'react';
import { useReducedMotion } from 'motion/react';
import { getEffectsTier } from '../lib/performance';

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

// Battery guard: pause every FX animation while the page is hidden. One global listener,
// CSS does the rest (`html.wfx-page-hidden .wfx * { animation-play-state: paused }`).
let visibilityHookInstalled = false;
function installVisibilityPause() {
  if (visibilityHookInstalled || typeof document === 'undefined') return;
  visibilityHookInstalled = true;
  document.addEventListener('visibilitychange', () => {
    document.documentElement.classList.toggle('wfx-page-hidden', document.hidden);
  });
}

// Precipitation intensity drives particle count/speed/opacity via the wfx-i1/i2/i3 class.
function intensityFor(precipMm?: number | null, rain?: number | null): 1 | 2 | 3 {
  if (precipMm != null) return precipMm > 4 ? 3 : precipMm >= 1 ? 2 : 1;
  if (rain != null) return rain > 70 ? 3 : rain >= 40 ? 2 : 1;
  return 2;
}

// Six-arm snow crystal — replaces the old ❄ text glyph, which rendered as a flat emoji
// on Android and read as cheap. Pure stroke SVG so it scales crisply at any flake size.
function Flake({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="1.6" strokeLinecap="round">
      <path d="M12 2v20M4.3 7.5l15.4 9M4.3 16.5l15.4-9M12 2l-2 3m2-3 2 3M12 22l-2-3m2 3 2-3M4.3 7.5l3.4.6M4.3 16.5l3.4-.6M19.7 7.5l-3.4.6M19.7 16.5l-3.4-.6" />
    </svg>
  );
}

/**
 * GPU-friendly (transform/opacity only) animated weather overlay reflecting the real
 * weather code, with precipitation-scaled intensity. Sits behind card content
 * (pointer-events: none). Tier-aware: lite / reduced-motion collapse to a static tint;
 * balanced (phones) runs a moderate particle budget; full runs the dense version.
 */
export function WeatherFX({ code, rain, precipMm, compact = false, tintOnly = false, className = '' }: {
  code?: number;
  rain?: number | null;
  precipMm?: number | null;
  compact?: boolean;
  tintOnly?: boolean;
  className?: string;
}) {
  installVisibilityPause();
  const reduce = useReducedMotion();
  const tier = getEffectsTier();
  const kind = fxKindForCode(code);
  const intensity = intensityFor(precipMm, rain);
  const still = !!reduce || tier === 'lite';

  // Particle budget: tier × card size × precipitation intensity.
  const base = tier === 'full' ? 30 : 18;
  const count = Math.round((compact ? base / 2 : base) * (kind === 'rain' || kind === 'storm' ? (0.7 + intensity * 0.3) : 1));

  return (
    <div className={`wfx wfx-${kind} wfx-i${intensity} ${still ? 'wfx-static' : ''} ${className}`} aria-hidden="true">
      <span className="wfx-tint" />
      {tintOnly || still ? null : kind === 'sun' ? (
        <>
          <span className="wfx-sun-glow" />
          <span className="wfx-sun-corona" />
          <span className="wfx-sun-rays" />
          <span className="wfx-shaft wfx-shaft-a" />
          <span className="wfx-shaft wfx-shaft-b" />
        </>
      ) : kind === 'clouds' ? (
        <>
          {/* 3-layer parallax: far = small/slow/faint, near = large/fast/bright */}
          {Array.from({ length: 3 }, (_, i) => (
            <span
              key={i}
              className={`wfx-cloud wfx-cloud-${i}`}
              style={{ top: `${8 + i * 24}%`, animationDuration: `${34 - i * 9}s`, animationDelay: `${-i * 7 - at(i, 5)}s` } as CSSProperties}
            />
          ))}
          <span className="wfx-cloud-highlight" />
        </>
      ) : kind === 'fog' ? (
        Array.from({ length: 4 }, (_, i) => (
          <span
            key={i}
            className="wfx-fog-band"
            style={{ top: `${10 + i * 24}%`, height: `${20 + (i % 3) * 8}%`, animationDuration: `${14 + i * 5}s`, animationDelay: `${-at(i, 9)}s`, opacity: 0.5 - i * 0.07 } as CSSProperties}
          />
        ))
      ) : kind === 'snow' ? (
        Array.from({ length: count }, (_, i) => {
          const size = 7 + (i % 4) * 4; // varied flake scale = depth
          return (
            <span
              key={i}
              className="wfx-flake"
              style={{
                left: `${at(i, 100)}%`,
                animationDuration: `${6 + (i % 5) * 1.4}s, ${2.6 + (i % 3) * 0.9}s`,
                animationDelay: `${-at(i, 7)}s, ${-at(i, 3)}s`,
                opacity: 0.45 + (i % 3) * 0.22,
                '--wfx-sway': `${5 + (i % 4) * 6}px`,
              } as CSSProperties}
            >
              <Flake size={size} />
            </span>
          );
        })
      ) : (
        // rain + storm: two depth layers on a slanted plane + ground splashes
        <>
          {kind === 'storm' && (
            <>
              <span className="wfx-storm-cloud wfx-storm-cloud-a" />
              <span className="wfx-storm-cloud wfx-storm-cloud-b" />
            </>
          )}
          <span className="wfx-rain-plane">
            {/* back layer: short, slow, faint — reads as distance */}
            {Array.from({ length: Math.round(count * 0.5) }, (_, i) => (
              <span
                key={`b${i}`}
                className="wfx-drop wfx-drop-back"
                style={{ left: `${at(i + 31, 100)}%`, animationDuration: `${1.15 + (i % 4) * 0.18}s`, animationDelay: `${-at(i, 2.2)}s`, opacity: 0.16 + (i % 3) * 0.07 } as CSSProperties}
              />
            ))}
            {/* front layer: long, fast, bright */}
            {Array.from({ length: count }, (_, i) => (
              <span
                key={`f${i}`}
                className="wfx-drop"
                style={{ left: `${at(i, 100)}%`, animationDuration: `${0.55 + (i % 5) * 0.11}s`, animationDelay: `${-at(i, 1.4)}s`, opacity: 0.4 + (i % 4) * 0.13 } as CSSProperties}
              />
            ))}
          </span>
          {/* splash micro-drops along the bottom edge */}
          {Array.from({ length: compact ? 5 : 9 }, (_, i) => (
            <span
              key={`s${i}`}
              className="wfx-splash"
              style={{ left: `${at(i * 3 + 7, 92, 4)}%`, animationDuration: `${0.9 + (i % 3) * 0.25}s`, animationDelay: `${-at(i, 1.8)}s` } as CSSProperties}
            />
          ))}
          {kind === 'storm' && (
            <>
              <span className="wfx-flash" />
              <span className="wfx-flash wfx-flash-b" />
            </>
          )}
        </>
      )}
    </div>
  );
}
