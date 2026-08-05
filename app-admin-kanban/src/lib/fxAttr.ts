import { getEffectsTier } from "./performance";

/**
 * Stamps the current effects tier onto <html data-fx-tier="..."> so CSS-only rules
 * (motion.css) can gate tier-full-only effects without a React re-render. Re-evaluates
 * whenever the reduced-motion preference or pointer coarseness changes.
 */
export function initFxTier() {
  if (typeof document === "undefined") return;
  const apply = () => {
    document.documentElement.dataset.fxTier = getEffectsTier();
  };
  apply();
  if (typeof window === "undefined") return;
  const queries = [
    window.matchMedia("(prefers-reduced-motion: reduce)"),
    window.matchMedia("(pointer: coarse)"),
  ];
  queries.forEach((query) => query.addEventListener?.("change", apply));
}
