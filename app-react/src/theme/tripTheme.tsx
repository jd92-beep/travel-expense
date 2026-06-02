import { useEffect, type ReactNode } from 'react';
import { activeTrip, normalizeTripIntelligence } from '../domain/trip/normalize';
import type { AppState, TripThemeKey } from '../lib/types';

type ThemeVars = {
  label: string;
  bodyFont: string;
  displayFont: string;
  bgTop: string;
  bgMid: string;
  bgBottom: string;
  glowPrimary: string;
  glowSecondary: string;
  glowTertiary: string;
  surface: string;
  card: string;
  ink: string;
  muted: string;
  red: string;
  blue: string;
  gold: string;
  green: string;
  brown: string;
};

const bodyFont = '"Noto Sans JP", "Avenir Next", "SF Pro Rounded", ui-sans-serif, system-ui, sans-serif';

const TRIP_THEMES: Record<TripThemeKey, ThemeVars> = {
  japan_washi: {
    label: 'Japan Washi',
    bodyFont,
    displayFont: '"Noto Serif JP", Georgia, "Times New Roman", serif',
    bgTop: '#F5F0E8',
    bgMid: '#F0EBDF',
    bgBottom: '#E8E2D4',
    glowPrimary: 'rgba(253, 239, 242, 0.55)',
    glowSecondary: 'rgba(30, 77, 107, 0.05)',
    glowTertiary: 'rgba(212, 168, 67, 0.07)',
    surface: '#FAF7F0',
    card: '#FFFDF7',
    ink: '#2A2119',
    muted: '#7A7068',
    red: '#C23B5E',
    blue: '#1E4D6B',
    gold: '#D4A843',
    green: '#2D6E48',
    brown: '#8B7355',
  },
  korea_editorial: {
    label: 'Korea Editorial',
    bodyFont: '"Pretendard", "Noto Sans KR", "Avenir Next", ui-sans-serif, system-ui, sans-serif',
    displayFont: '"Noto Serif KR", "Noto Serif JP", Georgia, serif',
    bgTop: '#F8F4F1',
    bgMid: '#EEF4F8',
    bgBottom: '#E8ECE7',
    glowPrimary: 'rgba(255, 138, 150, 0.24)',
    glowSecondary: 'rgba(82, 109, 174, 0.12)',
    glowTertiary: 'rgba(125, 183, 164, 0.13)',
    surface: '#FBF8F5',
    card: '#FFFFFF',
    ink: '#202329',
    muted: '#6D7480',
    red: '#D85B73',
    blue: '#526DAE',
    gold: '#C9A85D',
    green: '#4C8F78',
    brown: '#7C695D',
  },
  taiwan_nightmarket: {
    label: 'Taiwan Night Market',
    bodyFont: '"Noto Sans TC", "Avenir Next", ui-sans-serif, system-ui, sans-serif',
    displayFont: '"Noto Serif TC", "Noto Serif JP", Georgia, serif',
    bgTop: '#F7F6ED',
    bgMid: '#EEF5F2',
    bgBottom: '#E7ECE5',
    glowPrimary: 'rgba(227, 75, 81, 0.18)',
    glowSecondary: 'rgba(27, 107, 114, 0.14)',
    glowTertiary: 'rgba(238, 184, 77, 0.16)',
    surface: '#FCFAF0',
    card: '#FFFDF5',
    ink: '#24312E',
    muted: '#66736F',
    red: '#D94B4B',
    blue: '#1B6B72',
    gold: '#DDAA35',
    green: '#3A8A63',
    brown: '#7A6850',
  },
  europe_rail: {
    label: 'Europe Rail',
    bodyFont: '"Avenir Next", "Noto Sans", ui-sans-serif, system-ui, sans-serif',
    displayFont: 'Georgia, "Times New Roman", "Noto Serif JP", serif',
    bgTop: '#F0F2ED',
    bgMid: '#E8ECE9',
    bgBottom: '#DEE4E4',
    glowPrimary: 'rgba(138, 40, 47, 0.15)',
    glowSecondary: 'rgba(24, 73, 86, 0.16)',
    glowTertiary: 'rgba(189, 151, 79, 0.13)',
    surface: '#F8F6EF',
    card: '#FFFDF8',
    ink: '#25231F',
    muted: '#6B6C65',
    red: '#A8323A',
    blue: '#184956',
    gold: '#B89042',
    green: '#426A57',
    brown: '#786347',
  },
  global_journal: {
    label: 'Global Journal',
    bodyFont,
    displayFont: '"Noto Serif JP", Georgia, serif',
    bgTop: '#F4F1EA',
    bgMid: '#ECEBE3',
    bgBottom: '#E3E4DA',
    glowPrimary: 'rgba(196, 88, 78, 0.16)',
    glowSecondary: 'rgba(52, 92, 124, 0.12)',
    glowTertiary: 'rgba(209, 165, 77, 0.12)',
    surface: '#FAF8F0',
    card: '#FFFDF8',
    ink: '#28251F',
    muted: '#706D65',
    red: '#C4584E',
    blue: '#345C7C',
    gold: '#D1A54D',
    green: '#517A5B',
    brown: '#806D55',
  },
};

export function TripThemeProvider({ state, children }: { state: AppState; children: ReactNode }) {
  const trip = activeTrip(state);
  const currency = trip.currencies?.find((code) => code !== 'HKD') || state.tripCurrency || 'JPY';
  const intelligence = normalizeTripIntelligence(trip.intelligence, trip.destinationSummary, currency, trip.timezones?.[0]);
  const theme = TRIP_THEMES[intelligence.themeKey] || TRIP_THEMES.global_journal;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.tripTheme = intelligence.themeKey;
    root.dataset.tripCountry = intelligence.countryCode;
    root.style.setProperty('--trip-theme-label', `"${theme.label}"`);
    root.style.setProperty('--trip-font-body', theme.bodyFont);
    root.style.setProperty('--trip-font-display', theme.displayFont);
    root.style.setProperty('--trip-bg-top', theme.bgTop);
    root.style.setProperty('--trip-bg-mid', theme.bgMid);
    root.style.setProperty('--trip-bg-bottom', theme.bgBottom);
    root.style.setProperty('--trip-glow-primary', theme.glowPrimary);
    root.style.setProperty('--trip-glow-secondary', theme.glowSecondary);
    root.style.setProperty('--trip-glow-tertiary', theme.glowTertiary);
    root.style.setProperty('--surface', theme.surface);
    root.style.setProperty('--card', theme.card);
    root.style.setProperty('--ink', theme.ink);
    root.style.setProperty('--muted', theme.muted);
    root.style.setProperty('--red', theme.red);
    root.style.setProperty('--blue', theme.blue);
    root.style.setProperty('--navy', theme.blue);
    root.style.setProperty('--gold', theme.gold);
    root.style.setProperty('--green', theme.green);
    root.style.setProperty('--brown', theme.brown);
  }, [intelligence.countryCode, intelligence.themeKey, theme]);

  return <>{children}</>;
}
