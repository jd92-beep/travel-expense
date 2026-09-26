import type { CSSProperties, ReactNode } from "react";

/**
 * Enter-only staggered entrance wrapper: y (+ blur on the `full` tier). Meant for short,
 * bounded lists (<=8 items, 40ms steps) — status strip units, metric cards, search result
 * cards. Never wrap table rows or long lists (per product register: no decorative motion on
 * data tables).
 *
 * CSS-driven (see .blur-fade in styles/motion.css): the animation, its tier gating
 * (html[data-fx-tier] from lib/fxAttr.ts), and the reduced-motion kill switch all live in
 * stylesheets — no JS runtime, no re-renders on tier changes. Callers pass `delay` for
 * stagger; the keyframes deliberately do NOT animate opacity (see motion.css for why: axe
 * a11y scans sample the DOM right after load, and partial opacity reads as a color-contrast
 * failure).
 */
export function BlurFade({
  children,
  delay = 0,
  className,
  augmentedUi,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  /** Optional `data-augmented-ui` attribute value — threads the augmented-ui chamfered
   * panel treatment onto this element without needing a separate wrapper (BlurFade is
   * the card's root DOM node in every current call site). */
  augmentedUi?: string;
}) {
  return (
    <div
      className={className ? `${className} blur-fade` : "blur-fade"}
      data-augmented-ui={augmentedUi}
      style={{ "--blur-fade-delay": `${delay}s` } as CSSProperties}
    >
      {children}
    </div>
  );
}
