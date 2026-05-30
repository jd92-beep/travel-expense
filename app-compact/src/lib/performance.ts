/**
 * Performance optimization utility for checking if the user device
 * should opt out of heavy graphics (e.g., intense blurs, complex canvas, long animations).
 */
export function shouldDisableHeavyEffects(): boolean {
  if (typeof window === 'undefined') return true;

  // 1. Mobile Check - Opt out of heavy graphics & dynamic compositing layers unconditionally on mobile browsers
  // to avoid compositing flicker, battery drain, and GPU repaint storm.
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|CriOS/i.test(
    navigator.userAgent
  );
  const isCompactViewport = window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;
  if (isMobile || isCompactViewport) {
    return true;
  }

  // 2. Only respect true reduced motion preferences
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    return true;
  }

  // 2. Restrict to extremely low-end hardware constraints (e.g., <= 2GB memory)
  const nav = navigator as any;
  if (nav.deviceMemory && nav.deviceMemory <= 2) {
    return true;
  }

  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) {
    return true;
  }

  // 3. Network speed constraints (save battery/CPU on extremely slow networks)
  if (nav.connection) {
    const conn = nav.connection;
    if (conn.saveData || ['slow-2g', '2g'].includes(conn.effectiveType)) {
      return true;
    }
  }

  return false;
}
