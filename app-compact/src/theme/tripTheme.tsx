import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react';
import { TRIP_THEME_KEYS } from '../domain/trip/context';
import { activeTrip, normalizeTripIntelligence } from '../domain/trip/normalize';
import { normalizeThemePreference } from '../lib/themePreference';
import type { AppState, ThemePreference, TripThemeKey } from '../lib/types';

export const THEME_HINT_KEY = 'boss-japan-tracker:theme:v1';

export type ThemeDefinition = {
  id: TripThemeKey;
  label: string;
  legacyLabel: string;
  scheme: 'light' | 'dark';
  typography: { body: string; display: string };
  colors: {
    canvas: string;
    canvasMid: string;
    canvasEnd: string;
    surface: string;
    card: string;
    text: string;
    muted: string;
    border: string;
    focus: string;
    accent: string;
    onAccent: string;
    red: string;
    blue: string;
    gold: string;
    green: string;
    brown: string;
  };
  status: { info: string; success: string; warning: string; danger: string };
  chart: readonly [string, string, string, string];
  art: 'washi' | 'hanji' | 'night-market' | 'rail-timetable' | 'field-atlas';
  motion: { ambient: boolean; duration: string };
  chrome: { themeColor: string; statusBarStyle: 'light' | 'dark' };
};

const sans = '"Noto Sans JP", "Avenir Next", "SF Pro Rounded", ui-sans-serif, system-ui, sans-serif';

export const TRIP_THEMES: Record<TripThemeKey, ThemeDefinition> = {
  japan_washi: {
    id: 'japan_washi', label: '日本和紙', legacyLabel: 'Japan Washi', scheme: 'light',
    typography: { body: sans, display: '"Noto Serif JP", Georgia, "Times New Roman", serif' },
    colors: { canvas: '#F5F0E8', canvasMid: '#F0EBDF', canvasEnd: '#E8E2D4', surface: '#FAF7F0', card: '#FFFDF7', text: '#2A2119', muted: '#7A7068', border: 'rgba(139, 115, 85, .2)', focus: '#1E4D6B', accent: '#C23B5E', onAccent: '#FFFFFF', red: '#C23B5E', blue: '#1E4D6B', gold: '#D4A843', green: '#2D6E48', brown: '#8B7355' },
    status: { info: '#1E4D6B', success: '#2D6E48', warning: '#7A5800', danger: '#A82C4C' },
    chart: ['#1E4D6B', '#C23B5E', '#D4A843', '#2D6E48'], art: 'washi', motion: { ambient: true, duration: '18s' }, chrome: { themeColor: '#f7f2ea', statusBarStyle: 'dark' },
  },
  korea_editorial: {
    id: 'korea_editorial', label: '韓國韓紙', legacyLabel: 'Korea Editorial', scheme: 'light',
    typography: { body: '"Pretendard", "Noto Sans KR", "Avenir Next", ui-sans-serif, system-ui, sans-serif', display: '"Noto Serif KR", Georgia, serif' },
    colors: { canvas: '#F7F4F0', canvasMid: '#EEF2F5', canvasEnd: '#E7EBE8', surface: '#FBF9F6', card: '#FFFFFF', text: '#202329', muted: '#66707D', border: 'rgba(82, 109, 174, .2)', focus: '#526DAE', accent: '#D85B73', onAccent: '#111827', red: '#D85B73', blue: '#526DAE', gold: '#C9A85D', green: '#4C8F78', brown: '#7C695D' },
    status: { info: '#40578F', success: '#346D5A', warning: '#765900', danger: '#A5334F' },
    chart: ['#526DAE', '#D85B73', '#4C8F78', '#C9A85D'], art: 'hanji', motion: { ambient: true, duration: '24s' }, chrome: { themeColor: '#f7f4f0', statusBarStyle: 'dark' },
  },
  taiwan_nightmarket: {
    id: 'taiwan_nightmarket', label: '台灣夜市', legacyLabel: 'Taiwan Night Market', scheme: 'dark',
    typography: { body: '"Noto Sans TC", "PingFang TC", "Avenir Next", ui-sans-serif, system-ui, sans-serif', display: '"Noto Serif TC", Georgia, serif' },
    colors: { canvas: '#111827', canvasMid: '#172554', canvasEnd: '#0F172A', surface: '#172033', card: '#202B3F', text: '#F8FAFC', muted: '#B8C3D3', border: 'rgba(148, 163, 184, .32)', focus: '#FBBF24', accent: '#FB7185', onAccent: '#111827', red: '#FB7185', blue: '#38BDF8', gold: '#FBBF24', green: '#4ADE80', brown: '#D6A77A' },
    status: { info: '#7DD3FC', success: '#86EFAC', warning: '#FDE68A', danger: '#FDA4AF' },
    chart: ['#38BDF8', '#FB7185', '#FBBF24', '#4ADE80'], art: 'night-market', motion: { ambient: true, duration: '28s' }, chrome: { themeColor: '#111827', statusBarStyle: 'light' },
  },
  europe_rail: {
    id: 'europe_rail', label: '歐洲鐵路', legacyLabel: 'Europe Rail', scheme: 'light',
    typography: { body: '"Avenir Next", "Noto Sans", ui-sans-serif, system-ui, sans-serif', display: 'Georgia, "Times New Roman", serif' },
    colors: { canvas: '#EEF1EC', canvasMid: '#E5EAE8', canvasEnd: '#DCE4E5', surface: '#F7F6EF', card: '#FFFDF8', text: '#25231F', muted: '#606963', border: 'rgba(24, 73, 86, .22)', focus: '#184956', accent: '#A8323A', onAccent: '#FFFFFF', red: '#A8323A', blue: '#184956', gold: '#B89042', green: '#426A57', brown: '#786347' },
    status: { info: '#184956', success: '#335C49', warning: '#6F5200', danger: '#912A31' },
    chart: ['#184956', '#A8323A', '#B89042', '#426A57'], art: 'rail-timetable', motion: { ambient: false, duration: '0s' }, chrome: { themeColor: '#eef1ec', statusBarStyle: 'dark' },
  },
  global_journal: {
    id: 'global_journal', label: '全球旅誌', legacyLabel: 'Global Journal', scheme: 'light',
    typography: { body: sans, display: 'Georgia, "Noto Serif JP", serif' },
    colors: { canvas: '#F1F0E9', canvasMid: '#E7EAE4', canvasEnd: '#DCE5DE', surface: '#F9F8F1', card: '#FFFDF8', text: '#28251F', muted: '#656D67', border: 'rgba(52, 92, 124, .2)', focus: '#345C7C', accent: '#BF5048', onAccent: '#FFFFFF', red: '#BF5048', blue: '#345C7C', gold: '#D1A54D', green: '#517A5B', brown: '#806D55' },
    status: { info: '#345C7C', success: '#3F6A4B', warning: '#725600', danger: '#9F4038' },
    chart: ['#345C7C', '#C4584E', '#D1A54D', '#517A5B'], art: 'field-atlas', motion: { ambient: true, duration: '32s' }, chrome: { themeColor: '#f1f0e9', statusBarStyle: 'dark' },
  },
};

export const THEME_OPTIONS: Array<{ id: ThemePreference; label: string; detail: string }> = [
  { id: 'auto', label: '自動（依旅程）', detail: '跟隨目前旅程目的地' },
  ...TRIP_THEME_KEYS.map((id) => ({ id, label: TRIP_THEMES[id].label, detail: TRIP_THEMES[id].art })),
];

type ThemeContextValue = { theme: ThemeDefinition; tripTheme: TripThemeKey; source: 'auto' | 'manual' };
const ThemeContext = createContext<ThemeContextValue>({ theme: TRIP_THEMES.global_journal, tripTheme: 'global_journal', source: 'auto' });

export function useTripTheme() {
  return useContext(ThemeContext);
}

export function resolveThemeKey(preference: ThemePreference, tripTheme: unknown): TripThemeKey {
  return preference === 'auto'
    ? (TRIP_THEMES[tripTheme as TripThemeKey] ? tripTheme as TripThemeKey : 'global_journal')
    : preference;
}

export function applyThemeDocument(key: TripThemeKey, source: 'auto' | 'manual', tripTheme = key, tripCountry = '') {
  const theme = TRIP_THEMES[key];
  const root = document.documentElement;
  root.dataset.tripTheme = tripTheme;
  if (tripCountry) root.dataset.tripCountry = tripCountry;
  else delete root.dataset.tripCountry;
  root.dataset.appTheme = key;
  root.dataset.themeSource = source;
  root.dataset.colorScheme = theme.scheme;
  root.classList.toggle('dark', theme.scheme === 'dark');
  root.style.colorScheme = theme.scheme;

  const { colors, typography } = theme;
  const vars: Record<string, string> = {
    '--theme-canvas': colors.canvas,
    '--theme-canvas-mid': colors.canvasMid,
    '--theme-canvas-end': colors.canvasEnd,
    '--theme-surface': colors.surface,
    '--theme-card': colors.card,
    '--theme-text': colors.text,
    '--theme-ink': colors.text,
    '--theme-muted': colors.muted,
    '--theme-border': colors.border,
    '--theme-focus': colors.focus,
    '--theme-accent': colors.accent,
    '--theme-on-accent': colors.onAccent,
    '--theme-status-info': theme.status.info,
    '--theme-status-success': theme.status.success,
    '--theme-status-warning': theme.status.warning,
    '--theme-status-danger': theme.status.danger,
    '--theme-success': theme.status.success,
    '--theme-warning': theme.status.warning,
    '--theme-danger': theme.status.danger,
    '--theme-info': theme.status.info,
    '--theme-chart-1': theme.chart[0],
    '--theme-chart-2': theme.chart[1],
    '--theme-chart-3': theme.chart[2],
    '--theme-chart-4': theme.chart[3],
    '--theme-motion-duration': theme.motion.duration,
    '--trip-theme-label': `"${theme.legacyLabel}"`,
    '--trip-font-body': typography.body,
    '--trip-font-display': typography.display,
    '--trip-bg-top': colors.canvas,
    '--trip-bg-mid': colors.canvasMid,
    '--trip-bg-bottom': colors.canvasEnd,
    '--trip-glow-primary': `${theme.chart[1]}22`,
    '--trip-glow-secondary': `${theme.chart[0]}1a`,
    '--trip-glow-tertiary': `${theme.chart[2]}1a`,
    '--surface': colors.surface,
    '--card': colors.card,
    '--ink': colors.text,
    '--muted': colors.muted,
    '--line': colors.border,
    '--red': colors.red,
    '--blue': colors.blue,
    '--navy': colors.blue,
    '--gold': colors.gold,
    '--green': colors.green,
    '--brown': colors.brown,
  };
  Object.entries(vars).forEach(([name, value]) => root.style.setProperty(name, value));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.chrome.themeColor);
}

export function clearThemeHint() {
  try { localStorage.removeItem(THEME_HINT_KEY); } catch { /* device hint is best-effort */ }
}

export function TripThemeProvider({ state, children }: { state: AppState; children: ReactNode }) {
  const trip = activeTrip(state);
  const currency = trip.currencies?.find((code) => code !== 'HKD') || state.tripCurrency || 'JPY';
  const intelligence = normalizeTripIntelligence(trip.intelligence, trip.destinationSummary, currency, trip.timezones?.[0]);
  const preference = normalizeThemePreference(state.themePreference);
  const key = resolveThemeKey(preference, intelligence.themeKey);
  const source = preference === 'auto' ? 'auto' : 'manual';
  const theme = TRIP_THEMES[key];

  useLayoutEffect(() => {
    applyThemeDocument(key, source, intelligence.themeKey, intelligence.countryCode);
    try {
      localStorage.setItem(THEME_HINT_KEY, key);
    } catch {
      // Private mode may deny storage; native chrome still needs the resolved theme.
    }
    const capacitor = (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    if (capacitor?.getPlatform?.() === 'android') {
      void SystemBars.setStyle({ style: theme.scheme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
    }
  }, [intelligence.countryCode, intelligence.themeKey, key, source, theme]);

  return <ThemeContext.Provider value={{ theme, tripTheme: intelligence.themeKey, source }}>{children}</ThemeContext.Provider>;
}
