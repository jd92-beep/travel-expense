import type { ReactNode } from "react";
import { motion } from "motion/react";
import { useEffectsTier } from "../../lib/performance";

/**
 * Enter-only staggered entrance wrapper: y (+ blur on the `full` tier). Meant for short,
 * bounded lists (<=8 items, 40ms steps) — status strip units, metric cards, search result
 * cards. Never wrap table rows or long lists (per product register: no decorative motion on
 * data tables). On `lite` tier or reduced-motion, children render with no motion.
 *
 * Deliberately does NOT animate opacity. These entrances fire on a page's very first paint
 * (e.g. landing on Overview), and a11y/overflow checks that run immediately after load can
 * sample the DOM mid-animation — an opacity:0→1 tween means a real chance of catching text
 * at partial opacity, which axe reports as a color-contrast failure against the page
 * background (confirmed: without this constraint, `page.goto()` followed immediately by an
 * axe scan intermittently caught status-unit text at opacity 0). Keeping opacity pinned at 1
 * and only animating position/blur keeps contrast correct at every instant of the animation.
 */
export function BlurFade({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const tier = useEffectsTier();

  if (tier === "lite") {
    return <div className={className}>{children}</div>;
  }

  const initial = tier === "full"
    ? { y: 6, filter: "blur(3px)" }
    : { y: 6 };
  const animate = tier === "full"
    ? { y: 0, filter: "blur(0px)" }
    : { y: 0 };

  return (
    <motion.div
      className={className}
      initial={initial}
      animate={animate}
      transition={{ duration: 0.2, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
