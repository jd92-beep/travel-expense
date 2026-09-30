// First-paint theme bootstrap. External on purpose: production CSP is
// script-src 'self' (no 'unsafe-inline'), so an inline copy in index.html is blocked.
(() => {
  const key = 'boss-japan-tracker:theme:v1';
  const themes = [
    'japan_washi', 'korea_editorial', 'taiwan_nightmarket', 'europe_rail', 'global_journal',
    'tokyo_neon', 'tropical_candy', 'uk_london', 'nordic_aurora', 'mexico_fiesta',
    'india_holi', 'brazil_carnival',
  ];
  const darkThemes = new Set(['taiwan_nightmarket', 'tokyo_neon', 'nordic_aurora', 'brazil_carnival']);
  const colors = {
    japan_washi: '#f7f2ea',
    korea_editorial: '#f7f4f0',
    taiwan_nightmarket: '#111827',
    europe_rail: '#eef1ec',
    global_journal: '#f1f0e9',
    tokyo_neon: '#0b0416',
    tropical_candy: '#fff0f8',
    uk_london: '#e8eef7',
    nordic_aurora: '#0a1a2e',
    mexico_fiesta: '#ffe8d6',
    india_holi: '#fff3e6',
    brazil_carnival: '#06281e',
  };
  let theme = 'japan_washi';
  try {
    const hint = localStorage.getItem(key);
    if (themes.includes(hint)) theme = hint;
  } catch { /* storage can be unavailable during private browsing */ }
  const root = document.documentElement;
  const isDark = darkThemes.has(theme);
  root.dataset.appTheme = theme;
  root.dataset.themeSource = 'auto';
  root.dataset.colorScheme = isDark ? 'dark' : 'light';
  root.classList.toggle('dark', isDark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors[theme]);
  // Non-blocking webfont stylesheet starts as media="print" (CSP blocks inline onload).
  for (const link of document.querySelectorAll('link[data-fonts]')) {
    link.media = 'all';
  }
})();
