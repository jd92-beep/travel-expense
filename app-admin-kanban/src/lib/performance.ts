import { useEffect, useState } from "react";

/**
 * Effects tier system, ported from app-compact's Motion Layer v2.
 *
 *  - 'full'     — desktop / mouse pointers, motion-ok: full route-transition blur,
 *                 layout-animated nav pills, number tickers, staggered entrances.
 *  - 'balanced' — normal phones/tablets: transform/opacity-only motion (no blur-filter
 *                 animation), still ticks numbers and staggers entrances.
 *  - 'lite'     — reduced-motion preference or genuinely constrained devices (<=2GB RAM,
 *                 <=2 cores, save-data / 2g): motion is skipped, final states render
 *                 immediately.
 */
export type FxTier = "full" | "balanced" | "lite";

export function getEffectsTier(): FxTier {
  if (typeof window === "undefined") return "lite";

  // Hard constraints → lite (accessibility preference or hardware that cannot keep 60fps
  // even for compositor-only work).
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "lite";
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  if (nav.deviceMemory && nav.deviceMemory <= 2) return "lite";
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) return "lite";
  if (
    nav.connection &&
    (nav.connection.saveData || ["slow-2g", "2g"].includes(nav.connection.effectiveType || ""))
  ) {
    return "lite";
  }

  // Phones/tablets → balanced (compositor-only motion).
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|CriOS/i.test(
    navigator.userAgent,
  );
  const isCompactViewport = window.matchMedia("(max-width: 700px), (pointer: coarse)").matches;
  if (isMobile || isCompactViewport) return "balanced";

  return "full";
}

/** React subscription to the tier — re-evaluates on viewport/pointer/motion-pref changes. */
export function useEffectsTier(): FxTier {
  const [tier, setTier] = useState<FxTier>(getEffectsTier);
  useEffect(() => {
    const update = () => setTier(getEffectsTier());
    const queries = [
      window.matchMedia("(max-width: 700px), (pointer: coarse)"),
      window.matchMedia("(prefers-reduced-motion: reduce)"),
    ];
    queries.forEach((q) => q.addEventListener?.("change", update));
    window.addEventListener("resize", update);
    return () => {
      queries.forEach((q) => q.removeEventListener?.("change", update));
      window.removeEventListener("resize", update);
    };
  }, []);
  return tier;
}
