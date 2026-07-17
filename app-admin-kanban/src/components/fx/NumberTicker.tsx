import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";
import { useEffectsTier } from "../../lib/performance";

/**
 * Ticks 0 → value over <=600ms. Plain rewrite of app-compact's number-ticker.tsx: no
 * Tailwind/clsx, no spring — a single `animate()` call driving textContent directly (no
 * compositing layer, cheap enough to run on mobile). On `lite` tier or reduced-motion the
 * final value renders synchronously in the DOM on first paint — never an animated pass.
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
  const reducedMotion = useReducedMotion() ?? false;
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
    const controls = animate(from, safeValue, {
      duration: 0.6,
      ease: [0.16, 1, 0.3, 1], // ease-out-quint
      onUpdate: (latest) => {
        node.textContent = Math.round(latest).toLocaleString("en-US");
      },
      onComplete: () => {
        prevValueRef.current = safeValue;
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeValue, skipAnimation, formatted]);

  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {initialTextRef.current}
    </span>
  );
}
