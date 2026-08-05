// Enter-only route transition: exactly one DOM tree at all times. There is no exit
// animation and no AnimatePresence — the outlet for the previous pathname unmounts
// synchronously on navigation, and the new one mounts immediately with its own enter
// animation. This keeps AdminShell's rAF h1-focus effect correct (the new page's h1 is
// present in the DOM as soon as the pathname changes) and keeps exactly one query-firing
// tree mounted per route (no StrictMode/query-count regressions from a lingering old tree).
import { useRef } from "react";
import { motion } from "motion/react";
import { useLocation, useOutlet } from "react-router";
import { useEffectsTier } from "../../lib/performance";

export function RouteTransition() {
  const location = useLocation();
  const outlet = useOutlet();
  const tier = useEffectsTier();
  // The pathname present at the very first render of this shell instance never animates —
  // that would be page-load choreography (explicitly out of scope), and it also means an
  // a11y/overflow audit that samples the DOM right after `page.goto()` could catch it
  // mid-fade, when the whole page's opacity/blur hasn't settled. This has to be a value
  // computed once and compared on every render (not a ref flipped inside an effect): if the
  // "have we mounted" flag flips on some LATER re-render of the SAME pathname (e.g. once an
  // unrelated query settles), the wrapper element type changes from a bare fragment to
  // motion.div, which forces React to mount it fresh — triggering the fade at an
  // unpredictable moment instead of never. Comparing against a value fixed at first render
  // keeps the branch (and therefore the element type) stable across every re-render of that
  // pathname; only a genuine navigation to a *different* pathname takes the animated branch.
  const initialPathnameRef = useRef(location.pathname);
  const isInitialPathname = location.pathname === initialPathnameRef.current;

  if (tier === "lite" || isInitialPathname) return <>{outlet}</>;

  const initial = tier === "full"
    ? { opacity: 0, y: 10, filter: "blur(4px)" }
    : { opacity: 0, y: 8 };
  const animate = tier === "full"
    ? { opacity: 1, y: 0, filter: "blur(0px)" }
    : { opacity: 1, y: 0 };

  return (
    <motion.div
      key={location.pathname}
      className="route-transition"
      initial={initial}
      animate={animate}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* One-shot cyan scan wipe per navigation — CSS-driven, full tier only
          (display:none elsewhere), remounts with the keyed wrapper. */}
      <span className="route-scan" aria-hidden="true" />
      {outlet}
    </motion.div>
  );
}
