import { useId } from 'react';
import type { StyleThemeKey } from '../../lib/types';
import pixelSlime from '../../assets/kit/pixel-slime.gif';
import pixelSlimeStill from '../../assets/kit/pixel-slime-still.png';

/*
 * One small animated mark per style theme, shown where the Japan theme shows its torii logo.
 * Motion lives in style-themes.css (.kit-m-*) so prefers-reduced-motion can stop it in one place.
 */
export function KitMascot({ kit }: { kit: StyleThemeKey }) {
  // The mascot renders in both the rail and the phone header; SVG ids must not collide.
  const uid = useId().replace(/:/g, '');
  switch (kit) {
    case 'sketch_notebook':
      return (
        <svg className="kit-mascot kit-mascot--sketch" viewBox="0 0 48 48" aria-hidden="true">
          <path className="kit-m-trail" d="M8 36C6 18 30 6 40 18s-10 24-22 14" fill="none" stroke="#2457A6" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2.5 3.5" />
          <g className="kit-m-plane">
            <path d="M-7-5 8 0-7 5-3 0z" fill="#FFFEFA" stroke="#262523" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M-3 0 8 0" stroke="#262523" strokeWidth="1" />
          </g>
        </svg>
      );
    case 'marshmallow_cloud':
      return (
        <svg className="kit-mascot kit-mascot--marshmallow" viewBox="0 0 48 48" aria-hidden="true">
          <ellipse className="kit-m-shadow" cx="24" cy="43" rx="13" ry="2.4" fill="rgba(116, 97, 224, .22)" />
          <g className="kit-m-squish">
            <path d="M12 36c-5 0-7-4-6-8 1-3 4-5 7-4 0-6 5-10 11-10s10 4 11 9c3-1 7 1 7 6s-3 7-7 7z" fill="#FFFFFF" stroke="#E4DDFF" strokeWidth="1.4" />
            <circle cx="20" cy="27" r="1.6" fill="#4B3D63" />
            <circle cx="29" cy="27" r="1.6" fill="#4B3D63" />
            <path d="M22.5 30.5q2 1.8 4 0" stroke="#4B3D63" strokeWidth="1.3" fill="none" strokeLinecap="round" />
            <ellipse cx="16.5" cy="31" rx="2.2" ry="1.2" fill="#FFB4D3" />
            <ellipse cx="32.5" cy="31" rx="2.2" ry="1.2" fill="#FFB4D3" />
          </g>
          <path className="kit-m-spark" d="M39 8l1.2 3 3 1.2-3 1.2L39 16.4l-1.2-3-3-1.2 3-1.2z" fill="#F39AC0" />
        </svg>
      );
    case 'kids_blocks':
      return (
        <svg className="kit-mascot kit-mascot--kids" viewBox="0 0 48 48" aria-hidden="true">
          <path d="M24 24v22" stroke="#1B2340" strokeWidth="3" strokeLinecap="round" />
          <g className="kit-m-pinwheel">
            <path d="M24 24 24 6 33 15z" fill="#E5383B" stroke="#1B2340" strokeWidth="2" strokeLinejoin="round" />
            <path d="M24 24 42 24 33 33z" fill="#1F6FEB" stroke="#1B2340" strokeWidth="2" strokeLinejoin="round" />
            <path d="M24 24 24 42 15 33z" fill="#FFC233" stroke="#1B2340" strokeWidth="2" strokeLinejoin="round" />
            <path d="M24 24 6 24 15 15z" fill="#23A050" stroke="#1B2340" strokeWidth="2" strokeLinejoin="round" />
            <circle cx="24" cy="24" r="3" fill="#FFFFFF" stroke="#1B2340" strokeWidth="2" />
          </g>
        </svg>
      );
    case 'kawaii_sticker':
      return (
        <svg className="kit-mascot kit-mascot--kawaii" viewBox="0 0 48 48" aria-hidden="true">
          <g className="kit-m-bob">
            <path d="M24 5l5.6 11.4 12.6 1.8-9.1 8.9 2.1 12.5L24 33.7l-11.2 5.9 2.1-12.5-9.1-8.9 12.6-1.8z" fill="#FFD36E" stroke="#FFFFFF" strokeWidth="4" strokeLinejoin="round" paintOrder="stroke" />
            <path d="M24 5l5.6 11.4 12.6 1.8-9.1 8.9 2.1 12.5L24 33.7l-11.2 5.9 2.1-12.5-9.1-8.9 12.6-1.8z" fill="none" stroke="#C93A76" strokeWidth="1.4" strokeLinejoin="round" />
            <circle cx="20" cy="22.5" r="1.5" fill="#5A2F52" />
            <path className="kit-m-wink" d="M26.6 22.6q1.6-1.6 3.2 0" stroke="#5A2F52" strokeWidth="1.4" fill="none" strokeLinecap="round" />
            <path d="M22.4 26q1.6 1.6 3.2 0" stroke="#5A2F52" strokeWidth="1.3" fill="none" strokeLinecap="round" />
            <ellipse cx="17.5" cy="26" rx="2" ry="1.1" fill="#F48FB8" />
            <ellipse cx="31" cy="26" rx="2" ry="1.1" fill="#F48FB8" />
          </g>
          <path className="kit-m-spark" d="M41 34l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z" fill="#B79CF0" />
          <path className="kit-m-spark kit-m-spark--late" d="M7 7l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" fill="#7FCFE8" />
        </svg>
      );
    case 'cyberpunk_hud':
      return (
        <svg className="kit-mascot kit-mascot--cyber" viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="20" fill="#0A0A12" stroke="#05D9E8" strokeWidth="1.2" />
          <circle cx="24" cy="24" r="13" fill="none" stroke="#05D9E8" strokeWidth=".8" opacity=".5" />
          <circle cx="24" cy="24" r="6" fill="none" stroke="#05D9E8" strokeWidth=".8" opacity=".5" />
          <path d="M24 4v40M4 24h40" stroke="#05D9E8" strokeWidth=".6" opacity=".35" />
          <path className="kit-m-sweep" d="M24 24 24 4A20 20 0 0 1 38.1 9.9z" fill="rgba(252, 238, 10, .45)" />
          <circle className="kit-m-blip" cx="32" cy="15" r="1.8" fill="#FF2A6D" />
          <circle className="kit-m-blip kit-m-blip--late" cx="15" cy="30" r="1.5" fill="#2DF598" />
        </svg>
      );
    case 'pixel_quest':
      return (
        <picture>
          <source srcSet={pixelSlimeStill} media="(prefers-reduced-motion: reduce)" />
          <img className="kit-mascot kit-mascot--pixel" src={pixelSlime} alt="" aria-hidden="true" width="48" height="48" />
        </picture>
      );
    case 'japan_ukiyoe':
      return (
        <svg className="kit-mascot kit-mascot--japan" viewBox="0 0 48 48" aria-hidden="true">
          <defs>
            <clipPath id={`jc${uid}`}><circle cx="24" cy="24" r="21" /></clipPath>
            <pattern id={`jw${uid}`} width="12" height="7" patternUnits="userSpaceOnUse">
              <path d="M0 7a6 6 0 0 1 12 0M2.5 7a3.5 3.5 0 0 1 7 0M4.7 7a1.3 1.3 0 0 1 2.6 0" fill="none" stroke="#FBF6EA" strokeWidth=".9" />
            </pattern>
          </defs>
          <circle cx="24" cy="24" r="22.5" fill="#FBF6EA" stroke="#1C1A17" strokeWidth="1.5" />
          <g clipPath={`url(#jc${uid})`}>
            <rect width="48" height="48" fill="#F3EAD7" />
            <circle className="kit-m-sun" cx="30" cy="20" r="8" fill="#B8361A" />
            <g className="kit-m-waves"><rect x="-12" y="27" width="84" height="24" fill="#1F3A5F" /><rect x="-12" y="27" width="84" height="24" fill={`url(#jw${uid})`} /></g>
          </g>
          <circle cx="24" cy="24" r="19.5" fill="none" stroke="#1C1A17" strokeWidth=".6" />
        </svg>
      );
    case 'korea_dancheong':
      return (
        <svg className="kit-mascot kit-mascot--korea" viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="22.5" fill="#FFFDF8" stroke="#26221E" strokeWidth="1.4" />
          <g className="kit-m-taegeuk">
            <path d="M24 8a16 16 0 0 1 0 32 8 8 0 0 1 0-16 8 8 0 0 0 0-16z" fill="#1E5AA8" />
            <path d="M24 8a16 16 0 0 0 0 32 8 8 0 0 1 0-16 8 8 0 0 0 0-16z" fill="#C8323C" />
          </g>
          <path d="M5 24h3M40 24h3M24 5v3M24 40v3" stroke="#E8B83A" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}
