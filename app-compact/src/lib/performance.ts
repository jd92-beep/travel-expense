import { useEffect, useState } from 'react';

/**
 * Effects tier system ("Motion Layer v2").
 *
 * The old model was binary: shouldDisableHeavyEffects() returned true for ANY mobile UA,
 * which stripped every transition/animation on phones — the app's primary platform — and
 * left the rich path running only on desktop. The tier model splits that middle ground:
 *
 *  - 'full'     — desktop / mouse pointers, motion-ok: everything on (particles, noise,
 *                 blur filters, 4-layer background, windmill sweep).
 *  - 'balanced' — normal phones/tablets (the DEFAULT mobile experience): transform/opacity-
 *                 only motion everywhere — tab transitions, weather FX, entrance staggers,
 *                 press feedback — but NO blur-filter animation, NO rAF canvas particles,
 *                 NO full-screen mix-blend layers. Smooth on mid/low-tier hardware because
 *                 every animation stays on the compositor.
 *  - 'lite'     — reduced-motion preference or genuinely constrained devices (<=2GB RAM,
 *                 <=2 cores, save-data / 2g): the old fully-stripped behavior.
 */
export type FxTier = 'full' | 'balanced' | 'lite';

export function getEffectsTier(): FxTier {
  if (typeof window === 'undefined') return 'lite';

  // Hard constraints → lite (accessibility preference or hardware that cannot keep 60fps
  // even for compositor-only work).
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'lite';
  const nav = navigator as any;
  if (nav.deviceMemory && nav.deviceMemory <= 2) return 'lite';
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) return 'lite';
  if (nav.connection && (nav.connection.saveData || ['slow-2g', '2g'].includes(nav.connection.effectiveType))) {
    return 'lite';
  }

  // Phones/tablets → balanced (compositor-only motion).
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|CriOS/i.test(
    navigator.userAgent
  );
  const isCompactViewport = window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;
  if (isMobile || isCompactViewport) return 'balanced';

  return 'full';
}

/**
 * Back-compat API: "heavy" effects (rAF canvas particles, full-screen mix-blend layers,
 * animated blur filters, extra background layers) are now disabled on lite only for the
 * consumers that migrated to tiers, but this function keeps its ORIGINAL meaning — true on
 * any mobile — for consumers that still key expensive desktop-class effects off it
 * (Particles/NoiseTexture/magic-card spotlight/4-layer background). Tier-aware consumers
 * should use getEffectsTier()/useEffectsTier() instead.
 */
export function shouldDisableHeavyEffects(): boolean {
  return getEffectsTier() !== 'full';
}

/** React subscription to the tier — re-evaluates on viewport/pointer/motion-pref changes. */
export function useEffectsTier(): FxTier {
  const [tier, setTier] = useState<FxTier>(getEffectsTier);
  useEffect(() => {
    const update = () => setTier(getEffectsTier());
    const queries = [
      window.matchMedia('(max-width: 700px), (pointer: coarse)'),
      window.matchMedia('(prefers-reduced-motion: reduce)'),
    ];
    queries.forEach((q) => q.addEventListener?.('change', update));
    window.addEventListener('resize', update);
    return () => {
      queries.forEach((q) => q.removeEventListener?.('change', update));
      window.removeEventListener('resize', update);
    };
  }, []);
  return tier;
}
