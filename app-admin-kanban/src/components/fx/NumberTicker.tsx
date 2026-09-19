import { useEffect, useRef } from "react";
import { useEffectsTier } from "../../lib/performance";

/**
 * Ticks 0 → value over <=600ms. A single rAF loop writes textContent directly with an
 * ease-out-quint tween (the cubic-bezier(0.16, 1, 0.3, 1) curve framer-motion documented as
 * ease-out-quint), so there is no compositing layer and no animation library in the bundle.
 * On `lite` tier or reduced-motion the final value renders synchronously in the DOM on
 * first paint — never an animated pass.
 *
 * The JSX child is frozen at its first-render value (via a ref) so React's reconciliation
 * never fights the effect's direct textContent writes on unrelated parent re-renders.
 */
export function NumberTicker({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prevValueRef = useRef(0);
  const tier = useEffectsTier();
  const reducedMotion = typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const skipAnimation = tier === "lite" || reducedMotion;
  const safeValue = Number.isFinite(value) ? value : 0;
  const formatted = Math.round(safeValue).toLocaleString("en-US");
  const initialTextRef = useRef(skipAnimation ? formatted : "0");

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (skipAnimation) {
      node.textContent = formatted;
      prevValueRef.current = safeValue;
      return;
    }
    const from = prevValueRef.current;
    const durationMs = 600;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - progress) ** 5; // ease-out-quint ≈ cubic-bezier(0.16, 1, 0.3, 1)
      node.textContent = Math.round(from + (safeValue - from) * eased).toLocaleString("en-US");
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prevValueRef.current = safeValue;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeValue, skipAnimation, formatted]);

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {initialTextRef.current}
    </span>
  );
}
