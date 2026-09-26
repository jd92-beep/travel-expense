// Enter-only route transition: exactly one DOM tree at all times. There is no exit
// animation — the outlet for the previous pathname unmounts synchronously on navigation,
// and the new one mounts immediately with its own enter animation (CSS class
// .route-transition in styles/motion.css). This keeps AdminShell's rAF h1-focus effect
// correct (the new page's h1 is present in the DOM as soon as the pathname changes) and
// keeps exactly one query-firing tree mounted per route (no StrictMode/query-count
// regressions from a lingering old tree).
import { useRef } from "react";
import { useLocation, useOutlet } from "react-router";

export function RouteTransition() {
  const location = useLocation();
  const outlet = useOutlet();
  // The pathname present at the very first render of this shell instance never animates —
  // that would be page-load choreography (explicitly out of scope), and it also means an
  // a11y/overflow audit that samples the DOM right after `page.goto()` could catch it
  // mid-fade, when the whole page's opacity/blur hasn't settled. This has to be a value
  // computed once and compared on every render (not a ref flipped inside an effect): if the
  // "have we mounted" flag flips on some LATER re-render of the SAME pathname (e.g. once an
  // unrelated query settles), the wrapper element type changes from a bare fragment to a
  // keyed div, which forces React to mount it fresh — triggering the fade at an
  // unpredictable moment instead of never. Comparing against a value fixed at first render
  // keeps the branch (and therefore the element type) stable across every re-render of that
  // pathname; only a genuine navigation to a *different* pathname takes the animated branch.
  // The `lite` tier is handled in CSS (animation: none), keeping this component free of
  // tier subscriptions.
  const initialPathnameRef = useRef(location.pathname);
  const isInitialPathname = location.pathname === initialPathnameRef.current;

  if (isInitialPathname) return <>{outlet}</>;

  return (
    <div key={location.pathname} className="route-transition">
      {/* One-shot cyan scan wipe per navigation — CSS-driven, full tier only
          (display:none elsewhere), remounts with the keyed wrapper. */}
      <span className="route-scan" aria-hidden="true" />
      {outlet}
    </div>
  );
}
