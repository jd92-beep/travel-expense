import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode } from 'react';
import { activeTrip, normalizeTripIntelligence } from '../domain/trip/normalize';
import type { AppState, AppThemeKey, StyleThemeKey, ThemePreference, TripThemeKey } from '../lib/types';

export type ThemeDefinition = {
  id: AppThemeKey;
  label: string;
  selectorLabel: string;
  scheme: 'light' | 'dark';
  /** Short region cue shown in the selector so each theme feels place-specific. */
  region: { label: string; motif: string };
  typography: { body: string; display: string };
  colors: {
    canvas: string; canvasMid: string; canvasEnd: string; surface: string; card: string;
    text: string; muted: string; border: string; focus: string; accent: string; onAccent: string;
    red: string; blue: string; gold: string; green: string; brown: string;
  };
  status: { info: string; success: string; warning: string; danger: string };
  chart: readonly string[];
  art: 'washi' | 'hanji' | 'night-market' | 'rail-timetable' | 'field-atlas'
    | 'neon-grid' | 'confetti-radial' | 'union-stripe' | 'aurora-bands' | 'papel-picado'
    | 'pigment-splash' | 'parade-float'
    | 'notebook-ruled' | 'cloud-puff' | 'toy-room' | 'polka-sticker' | 'hud-scan' | 'pixel-field'
    | 'seigaiha-print' | 'hanok-lattice';
  /** Functional accents: Scan CTA, Weather sky, Timeline rail, Stats emphasis. */
  functional: { scan: string; weather: string; timeline: string; stats: string };
  motion: { ambient: boolean; duration: string };
  chrome: { themeColor: string; statusBarStyle: 'light' | 'dark' };
  /** Style themes: `html[data-app-style]` swaps component shapes, layout and type (styles/style-themes.css). */
  kit?: { style: StyleThemeKey; fonts: string };
};

const gf = (families: string) => `https://fonts.googleapis.com/css2?${families}&display=swap`;

const sans = '"Noto Sans JP", "Avenir Next", "SF Pro Rounded", ui-sans-serif, system-ui, sans-serif';

export const TRIP_THEMES: Record<AppThemeKey, ThemeDefinition> = {
  japan_washi: {
    id: 'japan_washi', label: 'Japan Washi', selectorLabel: '日本和紙', scheme: 'light',
    typography: { body: sans, display: '"Noto Serif JP", Georgia, "Times New Roman", serif' },
    colors: { canvas: '#F5F0E8', canvasMid: '#F0EBDF', canvasEnd: '#E8E2D4', surface: '#FAF7F0', card: '#FFFDF7', text: '#2A2119', muted: '#7A7068', border: 'rgba(139, 115, 85, .2)', focus: '#1E4D6B', accent: '#C23B5E', onAccent: '#FFFFFF', red: '#C23B5E', blue: '#1E4D6B', gold: '#D4A843', green: '#2D6E48', brown: '#8B7355' },
    status: { info: '#1E4D6B', success: '#2D6E48', warning: '#7A5800', danger: '#A82C4C' },
    chart: ['#1E4D6B', '#C23B5E', '#D4A843', '#2D6E48'], art: 'washi',
    region: { label: '日本', motif: '和紙 · 櫻 · 靛藍' },
    functional: { scan: '#C23B5E', weather: '#1E4D6B', timeline: '#C23B5E', stats: '#1E4D6B' },
    motion: { ambient: true, duration: '18s' }, chrome: { themeColor: '#f7f2ea', statusBarStyle: 'dark' },
  },
  korea_editorial: {
    id: 'korea_editorial', label: 'Korea Editorial', selectorLabel: '韓國韓紙', scheme: 'light',
    typography: { body: '"Pretendard", "Noto Sans KR", "Avenir Next", ui-sans-serif, system-ui, sans-serif', display: '"Noto Serif KR", Georgia, serif' },
    colors: { canvas: '#F7F4F0', canvasMid: '#EEF2F5', canvasEnd: '#E7EBE8', surface: '#FBF9F6', card: '#FFFFFF', text: '#202329', muted: '#66707D', border: 'rgba(82, 109, 174, .2)', focus: '#526DAE', accent: '#D85B73', onAccent: '#111827', red: '#D85B73', blue: '#526DAE', gold: '#C9A85D', green: '#4C8F78', brown: '#7C695D' },
    status: { info: '#40578F', success: '#346D5A', warning: '#765900', danger: '#A5334F' },
    chart: ['#526DAE', '#D85B73', '#4C8F78', '#C9A85D'], art: 'hanji',
    region: { label: '韓國', motif: '韓紙 · 編輯 · 靛青' },
    functional: { scan: '#D85B73', weather: '#526DAE', timeline: '#526DAE', stats: '#4C8F78' },
    motion: { ambient: true, duration: '24s' }, chrome: { themeColor: '#f7f4f0', statusBarStyle: 'dark' },
  },
  taiwan_nightmarket: {
    id: 'taiwan_nightmarket', label: 'Taiwan Night Market', selectorLabel: '台灣夜市', scheme: 'dark',
    typography: { body: '"Noto Sans TC", "PingFang TC", "Avenir Next", ui-sans-serif, system-ui, sans-serif', display: '"Noto Serif TC", Georgia, serif' },
    colors: { canvas: '#111827', canvasMid: '#172554', canvasEnd: '#0F172A', surface: '#172033', card: '#202B3F', text: '#F8FAFC', muted: '#B8C3D3', border: 'rgba(148, 163, 184, .32)', focus: '#FBBF24', accent: '#FB7185', onAccent: '#111827', red: '#FB7185', blue: '#38BDF8', gold: '#FBBF24', green: '#4ADE80', brown: '#D6A77A' },
    status: { info: '#7DD3FC', success: '#86EFAC', warning: '#FDE68A', danger: '#FDA4AF' },
    chart: ['#38BDF8', '#FB7185', '#FBBF24', '#4ADE80'], art: 'night-market',
    region: { label: '台灣', motif: '夜市 · 霓虹 · 紅燈籠' },
    functional: { scan: '#FB7185', weather: '#38BDF8', timeline: '#FBBF24', stats: '#38BDF8' },
    motion: { ambient: true, duration: '28s' }, chrome: { themeColor: '#111827', statusBarStyle: 'light' },
  },
  europe_rail: {
    id: 'europe_rail', label: 'Europe Rail', selectorLabel: '歐洲鐵路', scheme: 'light',
    typography: { body: '"Avenir Next", "Noto Sans", ui-sans-serif, system-ui, sans-serif', display: 'Georgia, "Times New Roman", serif' },
    colors: { canvas: '#EEF1EC', canvasMid: '#E5EAE8', canvasEnd: '#DCE4E5', surface: '#F7F6EF', card: '#FFFDF8', text: '#25231F', muted: '#606963', border: 'rgba(24, 73, 86, .22)', focus: '#184956', accent: '#A8323A', onAccent: '#FFFFFF', red: '#A8323A', blue: '#184956', gold: '#B89042', green: '#426A57', brown: '#786347' },
    status: { info: '#184956', success: '#335C49', warning: '#6F5200', danger: '#912A31' },
    chart: ['#184956', '#A8323A', '#B89042', '#426A57'], art: 'rail-timetable',
    region: { label: '歐洲', motif: '鐵路 · 時刻表 · 墨綠' },
    functional: { scan: '#A8323A', weather: '#184956', timeline: '#A8323A', stats: '#184956' },
    motion: { ambient: true, duration: '26s' }, chrome: { themeColor: '#eef1ec', statusBarStyle: 'dark' },
  },
  global_journal: {
    id: 'global_journal', label: 'Global Journal', selectorLabel: '全球旅誌', scheme: 'light',
    typography: { body: sans, display: 'Georgia, "Noto Serif JP", serif' },
    colors: { canvas: '#F1F0E9', canvasMid: '#E7EAE4', canvasEnd: '#DCE5DE', surface: '#F9F8F1', card: '#FFFDF8', text: '#28251F', muted: '#656D67', border: 'rgba(52, 92, 124, .2)', focus: '#345C7C', accent: '#BF5048', onAccent: '#FFFFFF', red: '#BF5048', blue: '#345C7C', gold: '#D1A54D', green: '#517A5B', brown: '#806D55' },
    status: { info: '#345C7C', success: '#3F6A4B', warning: '#725600', danger: '#9F4038' },
    chart: ['#345C7C', '#C4584E', '#D1A54D', '#517A5B'], art: 'field-atlas',
    region: { label: '全球', motif: '旅誌 · 地圖 · 陶土' },
    functional: { scan: '#BF5048', weather: '#345C7C', timeline: '#BF5048', stats: '#345C7C' },
    motion: { ambient: true, duration: '32s' }, chrome: { themeColor: '#f1f0e9', statusBarStyle: 'dark' },
  },
  tokyo_neon: {
    id: 'tokyo_neon', label: 'Tokyo Neon', selectorLabel: '東京霓虹', scheme: 'dark',
    typography: { body: '"Noto Sans JP", "SF Pro Display", ui-sans-serif, system-ui, sans-serif', display: '"JetBrains Mono", "SF Mono", ui-monospace, monospace' },
    colors: { canvas: '#0B0416', canvasMid: '#1A0B2E', canvasEnd: '#12061F', surface: '#1E0F33', card: '#2A1450', text: '#F5E9FF', muted: '#C4AEE0', border: 'rgba(0, 240, 255, .28)', focus: '#00F0FF', accent: '#FF2E97', onAccent: '#0B0416', red: '#FF2E97', blue: '#00F0FF', gold: '#FFE66D', green: '#7CFF6B', brown: '#D6A77A' },
    status: { info: '#7DF9FF', success: '#7CFF6B', warning: '#FFE66D', danger: '#FF6B9D' },
    chart: ['#00F0FF', '#FF2E97', '#FFE66D', '#7CFF6B'], art: 'neon-grid',
    region: { label: '東京', motif: '霓虹 · 網格 · 賽博' },
    functional: { scan: '#FF2E97', weather: '#00F0FF', timeline: '#00F0FF', stats: '#FF2E97' },
    motion: { ambient: true, duration: '22s' }, chrome: { themeColor: '#0B0416', statusBarStyle: 'light' },
  },
  tropical_candy: {
    id: 'tropical_candy', label: 'Tropical Candy', selectorLabel: '熱帶糖果', scheme: 'light',
    typography: { body: '"Noto Sans TC", "Avenir Next", ui-sans-serif, system-ui, sans-serif', display: '"Avenir Next", "SF Pro Rounded", Georgia, serif' },
    colors: { canvas: '#FFF0F8', canvasMid: '#E8F7FF', canvasEnd: '#FFF8D6', surface: '#FFFFFF', card: '#FFFFFF', text: '#2B1B4A', muted: '#6B5B8A', border: 'rgba(194, 24, 91, .24)', focus: '#0088B8', accent: '#C2185B', onAccent: '#FFFFFF', red: '#C2185B', blue: '#00A8E8', gold: '#F0C000', green: '#1FA97A', brown: '#A67C52' },
    status: { info: '#005F8A', success: '#0F7A4F', warning: '#8A5A00', danger: '#C2185B' },
    chart: ['#FF3D8A', '#00C2FF', '#FFD93D', '#3DDC97'], art: 'confetti-radial',
    region: { label: '熱帶', motif: '糖果 · 海風 · 活潑' },
    functional: { scan: '#C2185B', weather: '#00A8E8', timeline: '#FF3D8A', stats: '#1FA97A' },
    motion: { ambient: true, duration: '14s' }, chrome: { themeColor: '#fff0f8', statusBarStyle: 'dark' },
  },
  uk_london: {
    id: 'uk_london', label: 'UK London', selectorLabel: '英國倫敦', scheme: 'light',
    typography: { body: '"Avenir Next", "Noto Sans", ui-sans-serif, system-ui, sans-serif', display: 'Georgia, "Times New Roman", serif' },
    colors: { canvas: '#E8EEF7', canvasMid: '#DCE6F2', canvasEnd: '#CFD8E8', surface: '#FFFFFF', card: '#FFFFFF', text: '#0E1B33', muted: '#5A6A8A', border: 'rgba(14, 42, 107, .22)', focus: '#0E2A6B', accent: '#C8102E', onAccent: '#FFFFFF', red: '#C8102E', blue: '#0E2A6B', gold: '#A8861E', green: '#1B7A5A', brown: '#786347' },
    status: { info: '#0E2A6B', success: '#1B7A5A', warning: '#8A5A00', danger: '#A50E26' },
    chart: ['#0E2A6B', '#C8102E', '#C9A227', '#1B7A5A'], art: 'union-stripe',
    region: { label: '英國', motif: '米字 · 倫敦 · 海軍藍' },
    functional: { scan: '#C8102E', weather: '#0E2A6B', timeline: '#C8102E', stats: '#0E2A6B' },
    motion: { ambient: true, duration: '20s' }, chrome: { themeColor: '#e8eef7', statusBarStyle: 'dark' },
  },
  nordic_aurora: {
    id: 'nordic_aurora', label: 'Nordic Aurora', selectorLabel: '北歐極光', scheme: 'dark',
    typography: { body: '"Avenir Next", "Noto Sans", ui-sans-serif, system-ui, sans-serif', display: 'Georgia, "Iowan Old Style", serif' },
    colors: { canvas: '#0A1A2E', canvasMid: '#0D2438', canvasEnd: '#071525', surface: '#132B40', card: '#1A3548', text: '#EAF6FF', muted: '#8FAFC8', border: 'rgba(61, 220, 151, .24)', focus: '#4CC9F0', accent: '#3DDC97', onAccent: '#04101C', red: '#F72585', blue: '#4CC9F0', gold: '#FFE66D', green: '#3DDC97', brown: '#C4A882' },
    status: { info: '#7DD3FC', success: '#86EFAC', warning: '#FDE68A', danger: '#FDA4D0' },
    chart: ['#3DDC97', '#4CC9F0', '#B388FF', '#F72585'], art: 'aurora-bands',
    region: { label: '北歐', motif: '極光 · 夜空 · 冰綠' },
    functional: { scan: '#3DDC97', weather: '#4CC9F0', timeline: '#3DDC97', stats: '#4CC9F0' },
    motion: { ambient: true, duration: '26s' }, chrome: { themeColor: '#0a1a2e', statusBarStyle: 'light' },
  },
  mexico_fiesta: {
    id: 'mexico_fiesta', label: 'Mexico Fiesta', selectorLabel: '墨西哥嘉年華', scheme: 'light',
    typography: { body: '"Avenir Next", "Noto Sans", ui-sans-serif, system-ui, sans-serif', display: 'Georgia, "Palatino", serif' },
    colors: { canvas: '#FFE8D6', canvasMid: '#FFD6C0', canvasEnd: '#F7C59F', surface: '#FFF8F0', card: '#FFFDF7', text: '#4A1520', muted: '#8A5A62', border: 'rgba(196, 30, 58, .24)', focus: '#C41E3A', accent: '#007A4D', onAccent: '#FFFFFF', red: '#C41E3A', blue: '#1A5B9E', gold: '#D4A017', green: '#007A4D', brown: '#8B5A2B' },
    status: { info: '#1A5B9E', success: '#0F7A4F', warning: '#8A5A00', danger: '#A50E26' },
    chart: ['#E4002B', '#00A86B', '#F2A900', '#6B2D8B'], art: 'papel-picado',
    region: { label: '墨西哥', motif: '剪紙 · 節慶 · 陽光' },
    functional: { scan: '#007A4D', weather: '#1A5B9E', timeline: '#C41E3A', stats: '#E4002B' },
    motion: { ambient: true, duration: '18s' }, chrome: { themeColor: '#ffe8d6', statusBarStyle: 'dark' },
  },
  india_holi: {
    id: 'india_holi', label: 'India Holi', selectorLabel: '印度灑紅', scheme: 'light',
    typography: { body: '"Noto Sans", "Avenir Next", ui-sans-serif, system-ui, sans-serif', display: 'Georgia, "Palatino Linotype", serif' },
    colors: { canvas: '#FFF3E6', canvasMid: '#FFE0F0', canvasEnd: '#E8DFFF', surface: '#FFFCF5', card: '#FFFFFF', text: '#2D1B4E', muted: '#6B5A8A', border: 'rgba(124, 77, 255, .24)', focus: '#5B21B6', accent: '#BF360C', onAccent: '#FFFFFF', red: '#C2185B', blue: '#5B21B6', gold: '#EF6C00', green: '#00897B', brown: '#8D6E63' },
    status: { info: '#5B21B6', success: '#00695C', warning: '#92400E', danger: '#AD1457' },
    chart: ['#E91E63', '#7C4DFF', '#FF6F00', '#00BFA5'], art: 'pigment-splash',
    region: { label: '印度', motif: '灑紅 · 香料 · 紫橙' },
    functional: { scan: '#BF360C', weather: '#5B21B6', timeline: '#E91E63', stats: '#7C4DFF' },
    motion: { ambient: true, duration: '16s' }, chrome: { themeColor: '#fff3e6', statusBarStyle: 'dark' },
  },
  brazil_carnival: {
    id: 'brazil_carnival', label: 'Brazil Carnival', selectorLabel: '巴西嘉年華', scheme: 'dark',
    typography: { body: '"Avenir Next", "Noto Sans", ui-sans-serif, system-ui, sans-serif', display: 'Georgia, "Palatino", serif' },
    colors: { canvas: '#06281E', canvasMid: '#0A3D2A', canvasEnd: '#041C16', surface: '#0E3328', card: '#145C42', text: '#F0FFF4', muted: '#8FBFA8', border: 'rgba(255, 209, 0, .28)', focus: '#FFD100', accent: '#FFD100', onAccent: '#06281E', red: '#FD0E56', blue: '#4CC9F0', gold: '#FFD100', green: '#00C853', brown: '#D7A86E' },
    status: { info: '#BAE6FD', success: '#86EFAC', warning: '#FDE68A', danger: '#FFD0D8' },
    chart: ['#00A859', '#FFD100', '#0057B8', '#FD0E56'], art: 'parade-float',
    region: { label: '巴西', motif: '嘉年華 · 森綠 · 金陽' },
    functional: { scan: '#FFD100', weather: '#4CC9F0', timeline: '#FFD100', stats: '#00A859' },
    motion: { ambient: true, duration: '20s' }, chrome: { themeColor: '#06281e', statusBarStyle: 'light' },
  },
  sketch_notebook: {
    id: 'sketch_notebook', label: 'Sketch Notebook', selectorLabel: '手繪筆記', scheme: 'light',
    typography: { body: '"LXGW WenKai TC", "Noto Sans TC", ui-rounded, system-ui, sans-serif', display: '"Caveat", "LXGW WenKai TC", "Noto Sans TC", cursive' },
    colors: { canvas: '#FAF7EE', canvasMid: '#F7F3E8', canvasEnd: '#F3EEE1', surface: '#FFFDF6', card: '#FFFEFA', text: '#262523', muted: '#5E5B55', border: 'rgba(38, 37, 35, .5)', focus: '#2457A6', accent: '#C93C2C', onAccent: '#FFFFFF', red: '#C93C2C', blue: '#2457A6', gold: '#E0A800', green: '#2F7D4F', brown: '#7A5C3E' },
    status: { info: '#2457A6', success: '#2F7D4F', warning: '#835800', danger: '#B3261E' },
    chart: ['#2457A6', '#C93C2C', '#E0A800', '#2F7D4F'], art: 'notebook-ruled',
    region: { label: '風格', motif: '鉛筆 · 橫線紙 · 螢光筆' },
    functional: { scan: '#C93C2C', weather: '#2457A6', timeline: '#C93C2C', stats: '#2457A6' },
    motion: { ambient: false, duration: '18s' }, chrome: { themeColor: '#faf7ee', statusBarStyle: 'dark' },
    kit: { style: 'sketch_notebook', fonts: gf('family=Caveat:wght@600;700&family=LXGW+WenKai+TC:wght@400;700') },
  },
  marshmallow_cloud: {
    id: 'marshmallow_cloud', label: 'Marshmallow Cloud', selectorLabel: '棉花糖雲', scheme: 'light',
    typography: { body: '"Huninn", "Noto Sans TC", ui-rounded, system-ui, sans-serif', display: '"Fredoka", "Huninn", "Noto Sans TC", ui-rounded, sans-serif' },
    colors: { canvas: '#FFF4F8', canvasMid: '#F4F0FF', canvasEnd: '#EAF6FF', surface: '#FBF8FF', card: '#FFFFFF', text: '#4B3D63', muted: '#74679A', border: 'rgba(155, 134, 214, .18)', focus: '#7461E0', accent: '#C2457F', onAccent: '#FFFFFF', red: '#D24F7B', blue: '#5E7FE6', gold: '#E9A84C', green: '#3F9E7C', brown: '#A88A7A' },
    status: { info: '#5A62C8', success: '#2F8466', warning: '#8A5B00', danger: '#C23C68' },
    chart: ['#9B8CF2', '#F39AC0', '#7CC8F0', '#8EDDBA'], art: 'cloud-puff',
    region: { label: '風格', motif: '棉花糖 · 粉彩 · 軟綿綿' },
    functional: { scan: '#C2457F', weather: '#5E7FE6', timeline: '#9B8CF2', stats: '#7461E0' },
    motion: { ambient: false, duration: '24s' }, chrome: { themeColor: '#fff4f8', statusBarStyle: 'dark' },
    kit: { style: 'marshmallow_cloud', fonts: gf('family=Fredoka:wght@500;600&family=Huninn') },
  },
  kids_blocks: {
    id: 'kids_blocks', label: 'Kids Blocks', selectorLabel: '童趣積木', scheme: 'light',
    typography: { body: '"Chiron GoRound TC", "Noto Sans TC", ui-rounded, system-ui, sans-serif', display: '"Baloo 2", "Chiron GoRound TC", "Noto Sans TC", ui-rounded, sans-serif' },
    colors: { canvas: '#FFF6DB', canvasMid: '#FFF1CC', canvasEnd: '#FDEBC0', surface: '#FFFDF5', card: '#FFFFFF', text: '#1B2340', muted: '#4A5372', border: 'rgba(27, 35, 64, .3)', focus: '#1F6FEB', accent: '#D62F35', onAccent: '#FFFFFF', red: '#D62F35', blue: '#1F6FEB', gold: '#FFC233', green: '#23A050', brown: '#9A6B3F' },
    status: { info: '#1F5FCC', success: '#1B7F3E', warning: '#855700', danger: '#C2262C' },
    chart: ['#1F6FEB', '#E5383B', '#FFC233', '#23A050'], art: 'toy-room',
    region: { label: '風格', motif: '積木 · 蠟筆 · 三原色' },
    functional: { scan: '#D62F35', weather: '#1F6FEB', timeline: '#23A050', stats: '#1F6FEB' },
    motion: { ambient: false, duration: '14s' }, chrome: { themeColor: '#fff6db', statusBarStyle: 'dark' },
    kit: { style: 'kids_blocks', fonts: gf('family=Baloo+2:wght@700;800&family=Chiron+GoRound+TC:wght@500;700;900') },
  },
  kawaii_sticker: {
    id: 'kawaii_sticker', label: 'Kawaii Sticker', selectorLabel: '可愛貼紙', scheme: 'light',
    typography: { body: '"Iansui", "Noto Sans TC", ui-rounded, system-ui, sans-serif', display: '"Cherry Bomb One", "Iansui", "Noto Sans TC", ui-rounded, sans-serif' },
    colors: { canvas: '#FFEFF5', canvasMid: '#FFF3F8', canvasEnd: '#FCE8F3', surface: '#FFF8FB', card: '#FFFFFF', text: '#5A2F52', muted: '#86597D', border: 'rgba(232, 140, 182, .45)', focus: '#8A5CD6', accent: '#C93A76', onAccent: '#FFFFFF', red: '#D63F7A', blue: '#5F98DC', gold: '#F5B83D', green: '#3FA684', brown: '#A9786B' },
    status: { info: '#5B6FC9', success: '#2E8566', warning: '#875A00', danger: '#C2335F' },
    chart: ['#F48FB8', '#B79CF0', '#7FCFE8', '#FFD36E'], art: 'polka-sticker',
    region: { label: '風格', motif: '貼紙 · 波點 · 縫線' },
    functional: { scan: '#C93A76', weather: '#5F98DC', timeline: '#D63F7A', stats: '#8A5CD6' },
    motion: { ambient: false, duration: '16s' }, chrome: { themeColor: '#ffeff5', statusBarStyle: 'dark' },
    kit: { style: 'kawaii_sticker', fonts: gf('family=Cherry+Bomb+One&family=Iansui') },
  },
  cyberpunk_hud: {
    id: 'cyberpunk_hud', label: 'Cyberpunk HUD', selectorLabel: '賽博朋克', scheme: 'dark',
    typography: { body: '"Chakra Petch", "Chiron Hei HK", "Noto Sans TC", ui-sans-serif, system-ui, sans-serif', display: '"Chakra Petch", "Chiron Hei HK", "Noto Sans TC", ui-sans-serif, sans-serif' },
    colors: { canvas: '#07070C', canvasMid: '#0D0B16', canvasEnd: '#06060A', surface: '#101019', card: '#13131E', text: '#E9F4F4', muted: '#94A9AD', border: 'rgba(5, 217, 232, .32)', focus: '#05D9E8', accent: '#FCEE0A', onAccent: '#0A0A0F', red: '#FF2A6D', blue: '#05D9E8', gold: '#FCEE0A', green: '#2DF598', brown: '#C9A27A' },
    status: { info: '#05D9E8', success: '#2DF598', warning: '#FCEE0A', danger: '#FF4D85' },
    chart: ['#FCEE0A', '#05D9E8', '#FF2A6D', '#2DF598'], art: 'hud-scan',
    region: { label: '風格', motif: 'HUD · 斜切角 · 故障' },
    functional: { scan: '#FCEE0A', weather: '#05D9E8', timeline: '#FF2A6D', stats: '#05D9E8' },
    motion: { ambient: false, duration: '20s' }, chrome: { themeColor: '#07070c', statusBarStyle: 'light' },
    kit: { style: 'cyberpunk_hud', fonts: gf('family=Chakra+Petch:wght@500;600;700&family=Chiron+Hei+HK:wght@400;600;800&family=Share+Tech+Mono') },
  },
  pixel_quest: {
    id: 'pixel_quest', label: 'Pixel Quest', selectorLabel: '像素冒險', scheme: 'dark',
    typography: { body: '"DotGothic16", "Chiron Hei HK", "Noto Sans TC", ui-sans-serif, system-ui, sans-serif', display: '"DotGothic16", "Chiron Hei HK", "Noto Sans TC", ui-sans-serif, sans-serif' },
    colors: { canvas: '#141432', canvasMid: '#1A1A40', canvasEnd: '#10102A', surface: '#16206B', card: '#1C2A8A', text: '#FFFFFF', muted: '#C9D1FF', border: 'rgba(255, 255, 255, .78)', focus: '#FFD23F', accent: '#FFD23F', onAccent: '#141432', red: '#FF6B6B', blue: '#5AC8FF', gold: '#FFD23F', green: '#5CDB6A', brown: '#D9A066' },
    status: { info: '#8FD8FF', success: '#7CF08A', warning: '#FFE27A', danger: '#FF9A9A' },
    chart: ['#FFD23F', '#5AC8FF', '#FF6B6B', '#5CDB6A'], art: 'pixel-field',
    region: { label: '風格', motif: '8-bit · 對話框 · 快捷欄' },
    functional: { scan: '#FFD23F', weather: '#5AC8FF', timeline: '#5CDB6A', stats: '#FF6B6B' },
    motion: { ambient: false, duration: '20s' }, chrome: { themeColor: '#141432', statusBarStyle: 'light' },
    kit: { style: 'pixel_quest', fonts: gf('family=DotGothic16&family=Chiron+Hei+HK:wght@500;700') },
  },
  japan_ukiyoe: {
    id: 'japan_ukiyoe', label: 'Edo Ukiyo-e', selectorLabel: '江戶浮世繪', scheme: 'light',
    typography: { body: '"Chiron Sung HK", "Noto Serif TC", Georgia, serif', display: '"Chiron Sung HK", "Noto Serif TC", Georgia, serif' },
    colors: { canvas: '#F3EAD7', canvasMid: '#EFE4CC', canvasEnd: '#E8DBBE', surface: '#FAF4E6', card: '#FBF6EA', text: '#1C1A17', muted: '#5F5546', border: 'rgba(28, 26, 23, .32)', focus: '#1F3A5F', accent: '#B8361A', onAccent: '#FFFFFF', red: '#B8361A', blue: '#1F3A5F', gold: '#B8871F', green: '#4F6B2E', brown: '#7A5A3A' },
    status: { info: '#1F3A5F', success: '#4F6B2E', warning: '#855A00', danger: '#A52F16' },
    chart: ['#1F3A5F', '#B8361A', '#C99A2E', '#4F6B2E'], art: 'seigaiha-print',
    region: { label: '風格', motif: '浮世繪 · 青海波 · 朱印' },
    functional: { scan: '#B8361A', weather: '#1F3A5F', timeline: '#B8361A', stats: '#1F3A5F' },
    motion: { ambient: false, duration: '22s' }, chrome: { themeColor: '#1f3a5f', statusBarStyle: 'light' },
    kit: { style: 'japan_ukiyoe', fonts: gf('family=Chiron+Sung+HK:wght@400;600;900') },
  },
  korea_dancheong: {
    id: 'korea_dancheong', label: 'Hanok Dancheong', selectorLabel: '韓屋丹青', scheme: 'light',
    typography: { body: '"Noto Sans TC", "Gowun Dodum", ui-sans-serif, system-ui, sans-serif', display: '"Gowun Batang", "Cactus Classical Serif", "Noto Serif TC", Georgia, serif' },
    colors: { canvas: '#F6F1E6', canvasMid: '#F2ECDE', canvasEnd: '#ECE4D2', surface: '#FCF9F2', card: '#FFFDF8', text: '#26221E', muted: '#625A50', border: 'rgba(38, 34, 30, .2)', focus: '#1E5AA8', accent: '#C8323C', onAccent: '#FFFFFF', red: '#C8323C', blue: '#1E5AA8', gold: '#E8B83A', green: '#1F7A60', brown: '#7B5B3C' },
    status: { info: '#1E5AA8', success: '#1F7A60', warning: '#835A00', danger: '#B32A33' },
    chart: ['#1F7A60', '#C8323C', '#E8B83A', '#1E5AA8'], art: 'hanok-lattice',
    region: { label: '風格', motif: '丹青 · 褓子拼布 · 五方色' },
    functional: { scan: '#C8323C', weather: '#1E5AA8', timeline: '#1F7A60', stats: '#1E5AA8' },
    motion: { ambient: false, duration: '24s' }, chrome: { themeColor: '#f6f1e6', statusBarStyle: 'dark' },
    kit: { style: 'korea_dancheong', fonts: gf('family=Gowun+Batang:wght@400;700&family=Cactus+Classical+Serif&family=Noto+Sans+TC:wght@400;500;700') },
  },
};

export const THEME_OPTIONS = [
  { value: 'auto', label: '自動（依旅程）' },
  ...Object.values(TRIP_THEMES).map(({ id, selectorLabel }) => ({ value: id, label: selectorLabel })),
] as const;

type ThemeContextValue = { theme: ThemeDefinition; tripTheme: TripThemeKey; source: 'auto' | 'manual' };

function syncStyleFonts(href: string | undefined) {
  let link = document.querySelector<HTMLLinkElement>('link[data-style-fonts]');
  if (!href) { link?.remove(); return; }
  if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.dataset.styleFonts = '';
    document.head.appendChild(link);
  }
  if (link.getAttribute('href') !== href) link.href = href;
}
const ThemeContext = createContext<ThemeContextValue>({ theme: TRIP_THEMES.japan_washi, tripTheme: 'japan_washi', source: 'auto' });

export function useTripTheme() {
  return useContext(ThemeContext);
}

function isThemeKey(value: unknown): value is AppThemeKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TRIP_THEMES, value);
}

export function TripThemeProvider({ state, ready = true, children }: { state: AppState; ready?: boolean; children: ReactNode }) {
  const trip = activeTrip(state);
  const currency = trip.currencies?.find((code) => code !== 'HKD') || state.tripCurrency || 'JPY';
  const intelligence = normalizeTripIntelligence(trip.intelligence, trip.destinationSummary, currency, trip.timezones?.[0]);
  const preference: ThemePreference = state.themePreference;
  const manualTheme = isThemeKey(preference);
  const source = manualTheme ? 'manual' : 'auto';
  const resolvedTheme = manualTheme ? preference : intelligence.themeKey;
  const theme = TRIP_THEMES[resolvedTheme] || TRIP_THEMES.global_journal;

  useLayoutEffect(() => {
    // Before storage hydration lands, `state` is still the default snapshot: writing the
    // default theme here would clobber the boot hint from index.html and flash the wrong
    // theme. Leave attributes, CSS vars, theme-color, and the localStorage hint untouched.
    if (!ready) return;
    const root = document.documentElement;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousTheme = root.dataset.appTheme;
    root.dataset.tripTheme = intelligence.themeKey;
    root.dataset.tripCountry = intelligence.countryCode;
    root.dataset.appTheme = theme.id;
    root.dataset.themeSource = source;
    root.dataset.colorScheme = theme.scheme;
    root.dataset.themeRegion = theme.region.label;
    root.classList.toggle('dark', theme.scheme === 'dark');
    if (theme.kit) root.dataset.appStyle = theme.kit.style;
    else delete root.dataset.appStyle;
    syncStyleFonts(theme.kit?.fonts);
    // Brief class so CSS can ease color/background/border without animating every keystroke.
    if (previousTheme && previousTheme !== theme.id) {
      root.classList.add('theme-switching');
      window.setTimeout(() => root.classList.remove('theme-switching'), 420);
    }
    meta?.setAttribute('content', theme.chrome.themeColor);
    try { localStorage.setItem('boss-japan-tracker:theme:v1', theme.id); } catch { /* hint is optional */ }
    const { colors, typography, functional } = theme;
    const vars: Record<string, string> = {
      '--theme-canvas': colors.canvas, '--theme-canvas-mid': colors.canvasMid, '--theme-canvas-end': colors.canvasEnd,
      '--theme-surface': colors.surface, '--theme-card': colors.card, '--theme-text': colors.text, '--theme-muted': colors.muted,
      '--theme-border': colors.border, '--theme-focus': colors.focus, '--theme-accent': colors.accent, '--theme-on-accent': colors.onAccent,
      '--theme-status-info': theme.status.info, '--theme-status-success': theme.status.success, '--theme-status-warning': theme.status.warning, '--theme-status-danger': theme.status.danger,
      '--theme-chart-1': theme.chart[0], '--theme-chart-2': theme.chart[1], '--theme-chart-3': theme.chart[2], '--theme-chart-4': theme.chart[3],
      '--theme-fn-scan': functional.scan, '--theme-fn-weather': functional.weather,
      '--theme-fn-timeline': functional.timeline, '--theme-fn-stats': functional.stats,
      '--theme-motion-duration': theme.motion.duration, '--trip-theme-label': `"${theme.label}"`, '--trip-font-body': typography.body, '--trip-font-display': typography.display,
      '--trip-bg-top': colors.canvas, '--trip-bg-mid': colors.canvasMid, '--trip-bg-bottom': colors.canvasEnd,
      '--trip-glow-primary': `${theme.chart[1]}22`, '--trip-glow-secondary': `${theme.chart[0]}1a`, '--trip-glow-tertiary': `${theme.chart[2]}1a`,
      '--surface': colors.surface, '--card': colors.card, '--ink': colors.text, '--muted': colors.muted, '--line': colors.border,
      '--red': colors.red, '--blue': colors.blue, '--navy': colors.blue, '--gold': colors.gold, '--green': colors.green, '--brown': colors.brown,
      '--glass': `color-mix(in srgb, ${colors.card} 72%, transparent)`,
      '--glass-strong': `color-mix(in srgb, ${colors.card} 88%, transparent)`,
      '--cream-shadow': `color-mix(in srgb, ${colors.text} 12%, transparent)`,
      '--shadow-soft': `0 12px 32px color-mix(in srgb, ${colors.text} 8%, transparent)`,
      '--shadow-glass': `0 20px 56px color-mix(in srgb, ${colors.text} 12%, transparent), inset 0 1px 1px ${theme.scheme === 'dark' ? 'rgba(255, 255, 255, .12)' : 'rgba(255, 255, 255, .88)'}`,
    };
    Object.entries(vars).forEach(([name, value]) => root.style.setProperty(name, value));
  }, [intelligence.countryCode, intelligence.themeKey, source, theme, ready]);

  const contextValue = useMemo<ThemeContextValue>(
    () => ({ theme, tripTheme: intelligence.themeKey, source }),
    [theme, intelligence.themeKey, source],
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}
