import type { ReactNode } from 'react';
import { useEffectsTier } from '../../lib/performance';
import { useTripTheme } from '../tripTheme';

/*
 * Fixed background layer for the style themes: the thing each world has drifting behind the ledger.
 * Sits under .app-shell (style-themes.css makes the shell transparent and paints the page on body).
 * The 'lite' tier (low-end devices and prefers-reduced-motion) renders nothing.
 */
const HEART = 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 5 6.4 5c2.2 0 3.6 1.3 4.4 2.6h2.4C14 6.3 15.4 5 17.6 5 21 5 23.1 8.4 21.6 11.8 19.5 16.4 12 21 12 21z';
const SPARK = 'M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z';

function pieces(kit: string): ReactNode {
  switch (kit) {
    case 'sketch_notebook':
      return (
        <>
          <svg className="kit-amb kit-amb-doodle" style={{ top: '18%', right: '5%' }} viewBox="0 0 48 48"><path pathLength="1" d="M24 6l5 12 13 1-10 8 4 13-12-8-12 8 4-13-10-8 13-1z" /></svg>
          <svg className="kit-amb kit-amb-doodle" style={{ top: '52%', left: '1.5%', animationDelay: '1.2s' }} viewBox="0 0 48 48"><path pathLength="1" d="M24 24c0-3 4-3 4 0s-6 6-8 0 6-10 12-4 2 16-8 14-12-14-2-20 22-2 18 12" /></svg>
          <svg className="kit-amb kit-amb-doodle" style={{ bottom: '16%', right: '7%', animationDelay: '2.4s' }} viewBox="0 0 48 48"><path pathLength="1" d="M6 34c10-14 22-18 34-16m-8-6 8 6-7 7" /></svg>
        </>
      );
    case 'marshmallow_cloud':
      return [0, 1, 2, 3].map((i) => <span key={i} className="kit-amb kit-amb-cloud" style={{ top: `${8 + i * 23}%`, animationDelay: `${-i * 13}s`, animationDuration: `${46 + i * 9}s`, scale: `${1 - i * .12}` }} />);
    case 'kids_blocks':
      return ['#E5383B', '#1F6FEB', '#FFC233', '#23A050', '#8E44C9', '#E07A00'].map((c, i) => (
        <span key={c} className="kit-amb kit-amb-bubble" style={{ left: `${6 + i * 16}%`, borderColor: c, animationDelay: `${-i * 2.7}s`, animationDuration: `${13 + (i % 3) * 3}s`, width: 18 + (i % 3) * 10, height: 18 + (i % 3) * 10 }} />
      ));
    case 'kawaii_sticker':
      return Array.from({ length: 9 }, (_, i) => (
        <svg key={i} className={`kit-amb ${i % 3 === 0 ? 'kit-amb-spark' : 'kit-amb-heart'}`} viewBox="0 0 24 24" style={{ left: `${(i * 37) % 94}%`, animationDelay: `${-i * 1.9}s`, animationDuration: `${11 + (i % 4) * 2.5}s`, fill: ['#F48FB8', '#B79CF0', '#7FCFE8', '#FFD36E'][i % 4] }}>
          <path d={i % 3 === 0 ? SPARK : HEART} />
        </svg>
      ));
    case 'cyberpunk_hud':
      return (
        <>
          <span className="kit-amb kit-amb-sweep" />
          <span className="kit-amb kit-amb-ticker">SYS//LEDGER.LINK ▪ FX.FEED ONLINE ▪ RECEIPT.OCR READY ▪ SYNC.QUEUE CLEAR ▪</span>
        </>
      );
    case 'pixel_quest':
      return Array.from({ length: 16 }, (_, i) => (
        <span key={i} className="kit-amb kit-amb-star" style={{ left: `${(i * 53) % 97}%`, top: `${(i * 31) % 92}%`, animationDelay: `${-(i % 5) * .45}s` }} />
      ));
    case 'japan_ukiyoe':
      return (
        <>
          <span className="kit-amb kit-amb-sun" />
          <span className="kit-amb kit-amb-wave kit-amb-wave--back" />
          <span className="kit-amb kit-amb-wave" />
        </>
      );
    case 'korea_dancheong':
      return ['#C8323C', '#E8B83A', '#1F7A60', '#1E5AA8', '#C8323C'].map((c, i) => (
        <svg key={i} className="kit-amb kit-amb-lantern" viewBox="0 0 32 44" style={{ left: `${8 + i * 20}%`, animationDelay: `${-i * 5.5}s`, animationDuration: `${26 + (i % 3) * 6}s` }}>
          <path d="M16 2v4" stroke="#26221E" strokeWidth="1.2" />
          <path d="M16 6C6 6 3 14 3 21s4 13 13 13 13-6 13-13S26 6 16 6z" fill={c} opacity=".9" />
          <path d="M16 6c-5 4-6 10-6 15s1 9 6 13c5-4 6-8 6-13s-1-11-6-15z" fill="#FFFDF8" opacity=".28" />
          <path d="M10 34h12l-2 4h-8z" fill="#E8B83A" />
          <path d="M14 38v5M18 38v5" stroke={c} strokeWidth="1" />
        </svg>
      ));
    default:
      return null;
  }
}

export function KitAmbient() {
  const { theme } = useTripTheme();
  const tier = useEffectsTier();
  if (!theme.kit || tier === 'lite') return null;
  return <div className="kit-ambient" data-kit={theme.kit.style} aria-hidden="true">{pieces(theme.kit.style)}</div>;
}
