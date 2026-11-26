import { useEffect, useRef } from 'react';
import { useTripTheme } from '../../theme/tripTheme';
import southernAlps from '../../assets/journey/southern-alps.webp';
import alpineRoad from '../../assets/journey/alpine-road.webp';
import lakesideTown from '../../assets/journey/lakeside-town.webp';
import japanLake from '../../assets/journey/japan-lake.webp';
import alpineLake from '../../assets/journey/alpine-lake.webp';
import type { TripProfile } from '../../lib/types';

export function JourneyCover({ trip, className = '', day = 1 }: { trip?: TripProfile; className?: string; day?: number }) {
  const postcard = useTripTheme().theme.id === 'alpine_postcard';
  const dayCover = day % 2 === 0 ? alpineRoad : lakesideTown;
  const japan = trip?.intelligence?.countryCode === 'JP'
    || /日本|名古屋|京都|大阪|東京|北海道|japan|nagoya|kyoto|tokyo/i.test(`${trip?.name} ${trip?.destinationSummary}`);
  const figure = useRef<HTMLElement>(null);
  const reveal = (img: HTMLImageElement | null) => img?.classList.add('is-loaded');
  // A cached image can finish before React attaches onLoad; reveal it after paint.
  useEffect(() => { const img = figure.current?.querySelector('img'); if (img?.complete) reveal(img); });
  return <figure ref={figure} className={`journey-cover ${className}`}>
    {postcard ? <img src={className === 'journey-planner-cover' ? dayCover : southernAlps} alt="南島風景主題插畫" width={690} height={235} decoding="async" onLoad={event => reveal(event.currentTarget)} /> :
    <img src={japan ? japanLake : alpineLake} alt={japan ? '湖畔列車與群山，旅行主題插畫' : '高山湖泊與沿岸公路，旅行主題插畫'} width={2172} height={724} decoding="async" fetchPriority="high" onLoad={event => reveal(event.currentTarget)} />}
  </figure>;
}

export function JourneyMark({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 40 40" aria-hidden="true" fill="none">
    <rect width="40" height="40" rx="12" fill="currentColor" />
    <path d="m7 28 10-16 7 10 4-6 6 12H7Z" fill="var(--journey-on-accent, white)" />
    <path d="m17 12 4 6-4-2-3 2 3-6Z" fill="currentColor" />
    <path d="M19 28c-5 4-2 5 3 5" stroke="var(--journey-on-accent, white)" strokeWidth="2" strokeLinecap="round" />
    <circle cx="29" cy="10" r="3" fill="var(--journey-on-accent, white)" />
  </svg>;
}
