import { useEffectsTier } from '../lib/performance';

/**
 * Ambient blue glow backdrop ported from the 21st.dev "Turing landing"
 * snippet. The original hero used a <video> loop over a #0a0a0a base;
 * that asset 404s (dead S3 bucket), so the motion layer is replicated in
 * pure CSS — two static gradient overlays plus a pair of slow-drifting
 * blurred blobs standing in for the video.
 *
 * Mounted behind HyperframeBackground's content (above its opaque paint,
 * below real UI) so it reads mainly at shell edges, scroll overscroll,
 * and through translucent cards. Drift animation only runs on the
 * 'full' effects tier; 'balanced'/'lite' (incl. prefers-reduced-motion,
 * which getEffectsTier() maps straight to 'lite') render the same static
 * overlays with no animation class attached.
 */
export function TuringBackdrop() {
  const tier = useEffectsTier();
  const drifting = tier === 'full';

  return (
    <div
      className={`turing-backdrop${drifting ? ' turing-backdrop--drift' : ''}`}
      aria-hidden="true"
    >
      <div className="turing-backdrop__overlay turing-backdrop__overlay--1" />
      <div className="turing-backdrop__overlay turing-backdrop__overlay--2" />
      <div className="turing-backdrop__shimmer" />
      <div className="turing-backdrop__blob turing-backdrop__blob--a" />
      <div className="turing-backdrop__blob turing-backdrop__blob--b" />
    </div>
  );
}
