const { test, expect } = require('@playwright/test');

const APP_ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://localhost:8903';

const exactThemeTokens = {
  japan_washi: {
    scheme: 'light', canvas: '#F5F0E8', canvasMid: '#F0EBDF', canvasEnd: '#E8E2D4', surface: '#FAF7F0', card: '#FFFDF7', text: '#2A2119', muted: '#7A7068', focus: '#1E4D6B', accent: '#C23B5E', onAccent: '#FFFFFF', info: '#1E4D6B', success: '#2D6E48', warning: '#7A5800', danger: '#A82C4C', chart1: '#1E4D6B', chart2: '#C23B5E', chart3: '#D4A843', chart4: '#2D6E48',
  },
  korea_editorial: {
    scheme: 'light', canvas: '#F7F4F0', canvasMid: '#EEF2F5', canvasEnd: '#E7EBE8', surface: '#FBF9F6', card: '#FFFFFF', text: '#202329', muted: '#66707D', focus: '#526DAE', accent: '#D85B73', onAccent: '#111827', info: '#40578F', success: '#346D5A', warning: '#765900', danger: '#A5334F', chart1: '#526DAE', chart2: '#D85B73', chart3: '#4C8F78', chart4: '#C9A85D',
  },
  taiwan_nightmarket: {
    scheme: 'dark', canvas: '#111827', canvasMid: '#172554', canvasEnd: '#0F172A', surface: '#172033', card: '#202B3F', text: '#F8FAFC', muted: '#B8C3D3', focus: '#FBBF24', accent: '#FB7185', onAccent: '#111827', info: '#7DD3FC', success: '#86EFAC', warning: '#FDE68A', danger: '#FDA4AF', chart1: '#38BDF8', chart2: '#FB7185', chart3: '#FBBF24', chart4: '#4ADE80',
  },
  europe_rail: {
    scheme: 'light', canvas: '#EEF1EC', canvasMid: '#E5EAE8', canvasEnd: '#DCE4E5', surface: '#F7F6EF', card: '#FFFDF8', text: '#25231F', muted: '#606963', focus: '#184956', accent: '#A8323A', onAccent: '#FFFFFF', info: '#184956', success: '#335C49', warning: '#6F5200', danger: '#912A31', chart1: '#184956', chart2: '#A8323A', chart3: '#B89042', chart4: '#426A57',
  },
  global_journal: {
    scheme: 'light', canvas: '#F1F0E9', canvasMid: '#E7EAE4', canvasEnd: '#DCE5DE', surface: '#F9F8F1', card: '#FFFDF8', text: '#28251F', muted: '#656D67', focus: '#345C7C', accent: '#BF5048', onAccent: '#FFFFFF', info: '#345C7C', success: '#3F6A4B', warning: '#725600', danger: '#9F4038', chart1: '#345C7C', chart2: '#C4584E', chart3: '#D1A54D', chart4: '#517A5B',
  },
};

const koreaTripState = {
  schemaVersion: 4,
  lastTab: 'settings',
  budget: 150000,
  rate: 170,
  autoSync: false,
  activeTripId: 'trip_seoul',
  tripName: 'Seoul theme test',
  tripDateRange: { start: '2026-08-10', end: '2026-08-14' },
  tripCurrency: 'KRW',
  customItinerary: [],
  receipts: [],
  trips: [{
    id: 'trip_seoul',
    name: 'Seoul theme test',
    destinationSummary: 'Seoul, South Korea',
    startDate: '2026-08-10',
    endDate: '2026-08-14',
    homeCurrency: 'HKD',
    currencies: ['HKD', 'KRW'],
    timezones: ['Asia/Seoul'],
    version: 1,
    active: true,
    itinerary: [],
    intelligence: {
      countryCode: 'KR',
      countryName: 'South Korea',
      primaryCurrency: 'KRW',
      themeKey: 'korea_editorial',
      timezone: 'Asia/Seoul',
    },
    createdAt: 1,
    updatedAt: 1,
  }],
};

const taiwanContrastState = {
  ...koreaTripState,
  lastTab: 'dashboard',
  themePreference: 'taiwan_nightmarket',
  budget: 50_000,
  activeTripId: 'visual_trip',
  tripName: '名古屋手帳 2026',
  tripDateRange: { start: '2026-05-08', end: '2026-05-13' },
  tripCurrency: 'JPY',
  customItinerary: [{
    date: '2026-05-08',
    day: 1,
    region: '名古屋市區',
    timezone: 'Asia/Tokyo',
    spots: [{ time: '12:30', name: '手羽先午餐', type: 'food' }],
  }],
  receipts: [
    { id: 'r1', sourceId: 'theme_r1', store: 'Nagoya Station Bento', total: 2800, currency: 'JPY', date: '2026-05-08', time: '10:45', category: 'food', payment: 'credit', personId: 'p_boss', splitMode: 'shared', createdAt: 1 },
    { id: 'r2', sourceId: 'theme_r2', store: 'JR Ticket Counter', total: 8800, currency: 'JPY', date: '2026-05-08', time: '14:10', category: 'transport', payment: 'cash', personId: 'p_boss', splitMode: 'private', createdAt: 2 },
  ],
  trips: [{
    id: 'visual_trip',
    name: '名古屋手帳 2026',
    destinationSummary: '名古屋 / 京都',
    startDate: '2026-05-08',
    endDate: '2026-05-13',
    homeCurrency: 'HKD',
    currencies: ['HKD', 'JPY'],
    timezones: ['Asia/Tokyo'],
    version: 1,
    active: true,
    itinerary: [],
    intelligence: {
      countryCode: 'JP',
      countryName: 'Japan',
      primaryCurrency: 'JPY',
      themeKey: 'japan_washi',
      timezone: 'Asia/Tokyo',
    },
    createdAt: 1,
    updatedAt: 1,
  }],
};

async function seedThemeState(page) {
  await page.addInitScript((state) => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify(state));
  }, koreaTripState);
  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));
}

async function seedTaiwanContrastState(page) {
  await page.addInitScript((state) => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify(state));
  }, taiwanContrastState);
  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));
}

test('bootstrap uses the device hint without inventing a trip recommendation before React loads', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('boss-japan-tracker:theme:v1')) {
      localStorage.setItem('boss-japan-tracker:theme:v1', 'taiwan_nightmarket');
    }
  });
  await page.route('**/src/main.tsx*', (route) => route.abort());
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/`, { waitUntil: 'domcontentloaded' });

  const bootstrap = await page.evaluate(() => ({
    appTheme: document.documentElement.dataset.appTheme,
    tripTheme: document.documentElement.dataset.tripTheme,
    source: document.documentElement.dataset.themeSource,
    scheme: document.documentElement.dataset.colorScheme,
    dark: document.documentElement.classList.contains('dark'),
    tokens: (() => {
      const style = getComputedStyle(document.documentElement);
      const read = (name) => style.getPropertyValue(name).trim();
      return {
        scheme: document.documentElement.dataset.colorScheme,
        canvas: read('--theme-canvas'), canvasMid: read('--theme-canvas-mid'), canvasEnd: read('--theme-canvas-end'),
        surface: read('--theme-surface'), card: read('--theme-card'), text: read('--theme-text'), muted: read('--theme-muted'),
        focus: read('--theme-focus'), accent: read('--theme-accent'), onAccent: read('--theme-on-accent'),
        info: read('--theme-status-info'), success: read('--theme-status-success'), warning: read('--theme-status-warning'), danger: read('--theme-status-danger'),
        chart1: read('--theme-chart-1'), chart2: read('--theme-chart-2'), chart3: read('--theme-chart-3'), chart4: read('--theme-chart-4'),
      };
    })(),
  }));
  expect({ ...bootstrap, tokens: undefined }).toEqual({
    appTheme: 'taiwan_nightmarket',
    tripTheme: undefined,
    source: 'auto',
    scheme: 'dark',
    dark: true,
    tokens: undefined,
  });
  expect(bootstrap.tokens).toEqual(exactThemeTokens.taiwan_nightmarket);

  for (const [theme, tokens] of Object.entries(exactThemeTokens)) {
    await page.evaluate((nextTheme) => localStorage.setItem('boss-japan-tracker:theme:v1', nextTheme), theme);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const firstPaint = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const read = (name) => style.getPropertyValue(name).trim();
      const card = document.createElement('div');
      card.className = 'glass-card';
      const surface = document.createElement('header');
      surface.className = 'topbar';
      document.body.append(card, surface);
      return {
        appTheme: document.documentElement.dataset.appTheme,
        bodyColor: getComputedStyle(document.body).color,
        bodyBackground: getComputedStyle(document.body).backgroundImage,
        cardBackground: getComputedStyle(card).backgroundColor,
        surfaceBackground: getComputedStyle(surface).backgroundColor,
        tokens: {
          scheme: document.documentElement.dataset.colorScheme,
          canvas: read('--theme-canvas'), canvasMid: read('--theme-canvas-mid'), canvasEnd: read('--theme-canvas-end'),
          surface: read('--theme-surface'), card: read('--theme-card'), text: read('--theme-text'), muted: read('--theme-muted'),
          focus: read('--theme-focus'), accent: read('--theme-accent'), onAccent: read('--theme-on-accent'),
          info: read('--theme-status-info'), success: read('--theme-status-success'), warning: read('--theme-status-warning'), danger: read('--theme-status-danger'),
          chart1: read('--theme-chart-1'), chart2: read('--theme-chart-2'), chart3: read('--theme-chart-3'), chart4: read('--theme-chart-4'),
        },
      };
    });
    expect(firstPaint.appTheme).toBe(theme);
    expect(firstPaint.tokens).toEqual(tokens);
    expect(contrast(firstPaint.bodyColor, tokens.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(firstPaint.bodyBackground).toContain('gradient');
    expect(firstPaint.cardBackground.toLowerCase()).toBe(cssRgb(tokens.card));
    expect(firstPaint.surfaceBackground.toLowerCase()).toBe(cssRgb(tokens.surface));
  }
});

test('theme selector previews a manual Taiwan world while auto follows the active trip', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedThemeState(page);
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#settings`);

  await expect(page.getByRole('radiogroup', { name: 'App theme' })).toBeVisible({ timeout: 15_000 });
  const rootAuto = await page.evaluate(() => ({
    tripTheme: document.documentElement.dataset.tripTheme,
    appTheme: document.documentElement.dataset.appTheme,
    source: document.documentElement.dataset.themeSource,
    scheme: document.documentElement.dataset.colorScheme,
  }));
  expect(rootAuto).toEqual({
    tripTheme: 'korea_editorial',
    appTheme: 'korea_editorial',
    source: 'auto',
    scheme: 'light',
  });

  await page.getByRole('radio', { name: /台灣夜市/ }).check();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.appTheme)).toBe('taiwan_nightmarket');
  const rootTaiwan = await page.evaluate(() => ({
    tripTheme: document.documentElement.dataset.tripTheme,
    appTheme: document.documentElement.dataset.appTheme,
    source: document.documentElement.dataset.themeSource,
    scheme: document.documentElement.dataset.colorScheme,
    dark: document.documentElement.classList.contains('dark'),
    themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    hint: localStorage.getItem('boss-japan-tracker:theme:v1'),
  }));
  expect(rootTaiwan).toEqual({
    tripTheme: 'korea_editorial',
    appTheme: 'taiwan_nightmarket',
    source: 'manual',
    scheme: 'dark',
    dark: true,
    themeColor: '#111827',
    hint: 'taiwan_nightmarket',
  });
  await expect(page.locator('.japanese-sakura-decor')).toBeHidden();
  await expect(page.locator('img[src*="compact-japan-mark"]')).toHaveCount(0);
  await expect(page.getByText('旅程管理器 🏯🌸', { exact: true })).toHaveCount(0);
  await expect(page.getByText('旅程管理器', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /旅伴 \/ 分帳比例/ }).click();
  await page.evaluate(() => {
    const modal = document.createElement('section');
    modal.className = 'modal-sheet theme-audit-modal';
    modal.setAttribute('role', 'dialog');
    modal.textContent = 'Theme audit modal';
    document.body.append(modal);
    const toast = document.createElement('div');
    toast.className = 'toast info theme-audit-toast';
    toast.textContent = 'Theme audit toast';
    document.body.append(toast);
  });
  const darkSurfaces = await page.evaluate(() => {
    const read = (selector) => {
      const node = selector === 'body' ? document.body : document.querySelector(selector);
      if (!node) throw new Error(`Missing theme audit surface: ${selector}`);
      const style = getComputedStyle(node);
      return { backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage, color: style.color };
    };
    const washi = document.querySelector('.japanese-washi-bg');
    const washiBefore = washi ? getComputedStyle(washi, '::before') : null;
    return {
      body: read('body'),
      shell: read('.app-shell'),
      card: read('.settings-theme-card'),
      header: read('.compact-mobile-header'),
      dock: read('.app-floating-dock-mobile'),
      quickAction: read('.settings-preview-controls button'),
      mobileStatus: read('.compact-mobile-status'),
      pwaChip: read('.pwa-chip'),
      mobileTitle: read('.compact-mobile-title-art'),
      form: read('.person-add input'),
      modal: read('.theme-audit-modal'),
      toast: read('.theme-audit-toast'),
      washiBefore: washiBefore ? { content: washiBefore.content, display: washiBefore.display } : null,
    };
  });
  expect(darkSurfaces.shell.backgroundImage).not.toBe('none');
  for (const surface of ['body', 'shell', 'card', 'header', 'dock', 'quickAction', 'mobileStatus', 'pwaChip', 'form', 'modal', 'toast']) {
    expect(contrast(darkSurfaces[surface].backgroundColor, '#FFFFFF'), `${surface} should be visibly dark`).toBeGreaterThanOrEqual(4.5);
  }
  for (const surface of ['card', 'header', 'dock', 'quickAction', 'mobileStatus', 'pwaChip', 'form', 'modal', 'toast']) {
    expect(darkSurfaces[surface].backgroundImage, `${surface} should not retain a light material image`).toBe('none');
  }
  expect(contrast(darkSurfaces.mobileTitle.color, darkSurfaces.header.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  expect(darkSurfaces.washiBefore && (darkSurfaces.washiBefore.display === 'none' || darkSurfaces.washiBefore.content === 'none')).toBe(true);
  const reflow = await page.evaluate(() => ({
    noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ambientAnimation: getComputedStyle(document.body, '::after').animationName,
  }));
  expect(reflow.noHorizontalOverflow).toBe(true);
  expect(reflow.ambientAnimation).toBe('none');

  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.appTheme)).toBe('taiwan_nightmarket');
});

function contrast(colorA, colorB) {
  const channelsOf = (color) => {
    if (color.startsWith('#')) return color.match(/[a-f\d]{2}/gi).map((value) => parseInt(value, 16) / 255);
    const rgb = color.match(/^rgba?\(([^)]+)\)$/i);
    if (rgb) return rgb[1].split(/[ ,/]+/).slice(0, 3).map((value) => Number(value) / 255);
    const srgb = color.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/i);
    if (srgb) return srgb.slice(1, 4).map(Number);
    throw new Error(`Unsupported CSS color: ${color}`);
  };
  const luminance = (color) => {
    const channels = channelsOf(color).map((value) => (
      value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    ));
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const [a, b] = [luminance(colorA), luminance(colorB)].sort((left, right) => right - left);
  return (a + 0.05) / (b + 0.05);
}

function cssRgb(hex) {
  return `rgb(${hex.match(/[a-f\d]{2}/gi).map((value) => parseInt(value, 16)).join(', ')})`.toLowerCase();
}

async function readContrastSamples(page, definitions) {
  const colors = await page.evaluate((pairs) => pairs.map(({ name, text, surface, pseudo }) => {
    const textNode = document.querySelector(text);
    const surfaceNode = document.querySelector(surface);
    if (!textNode || !surfaceNode) throw new Error(`Missing contrast target: ${name}`);
    return {
      name,
      foreground: getComputedStyle(textNode, pseudo || null).color,
      background: getComputedStyle(surfaceNode).backgroundColor,
    };
  }), definitions);
  return colors.map((sample) => ({
    ...sample,
    ratio: Number(contrast(sample.foreground, sample.background).toFixed(2)),
  }));
}

test('Taiwan dark keeps operating data readable across dashboard, history, weather, and stats', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedTaiwanContrastState(page);
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/`);
  const nav = page.locator('.app-floating-dock-mobile[aria-label="主要分頁"]');
  await expect(nav).toBeVisible({ timeout: 15_000 });

  const samples = [];
  await nav.getByRole('button', { name: '主頁', exact: true }).click();
  await expect(page.locator('.preview-dashboard-budget')).toBeVisible();
  samples.push(...await readContrastSamples(page, [
    { name: 'dashboard ring value', text: '.preview-dashboard-ring-copy strong', surface: '.preview-dashboard-budget' },
    { name: 'dashboard ring label', text: '.preview-dashboard-ring-copy span', surface: '.preview-dashboard-budget' },
    { name: 'dashboard total label', text: '.preview-dashboard-budget-row.is-total span', surface: '.preview-dashboard-budget' },
    { name: 'dashboard total value', text: '.preview-dashboard-budget-row.is-total strong', surface: '.preview-dashboard-budget' },
    { name: 'dashboard used value', text: '.preview-dashboard-budget-row.is-used strong', surface: '.preview-dashboard-budget' },
    { name: 'dashboard remaining value', text: '.preview-dashboard-budget-row.is-left strong', surface: '.preview-dashboard-budget' },
    { name: 'dashboard today heading', text: '.preview-dashboard-today-head h3', surface: '.preview-dashboard-today' },
    { name: 'dashboard today label', text: '.preview-dashboard-today-grid span', surface: '.preview-dashboard-today' },
    { name: 'dashboard today value', text: '.preview-dashboard-today-grid strong', surface: '.preview-dashboard-today' },
  ]));

  await nav.getByRole('button', { name: '紀錄', exact: true }).click();
  await expect(page.locator('.history-filter-deck')).toBeVisible();
  samples.push(...await readContrastSamples(page, [
    { name: 'history search text', text: '.history-filter-deck input', surface: '.history-filter-deck input' },
    { name: 'history search placeholder', text: '.history-filter-deck input', surface: '.history-filter-deck input', pseudo: '::placeholder' },
    { name: 'history search icon', text: '.history-filter-deck .search-field svg', surface: '.history-filter-deck .search-field' },
    { name: 'history filter control', text: '.history-filter-button span', surface: '.history-filter-button' },
    { name: 'history date heading', text: '.history-date-title h2', surface: '.history-expandable-group' },
    { name: 'history date total', text: '.history-date-total', surface: '.history-expandable-group' },
    { name: 'history store', text: '.history-ledger-main strong', surface: '.history-expandable-group' },
    { name: 'history store meta', text: '.history-ledger-main small', surface: '.history-expandable-group' },
    { name: 'history amount', text: '.history-ledger-amount strong', surface: '.history-expandable-group' },
    { name: 'history amount meta', text: '.history-ledger-amount small', surface: '.history-expandable-group' },
    { name: 'history day subtotal', text: '.history-day-subtotal strong', surface: '.history-expandable-group' },
  ]));

  await nav.getByRole('button', { name: '天氣', exact: true }).click();
  await expect(page.locator('.preview-weather-current-card')).toBeVisible();
  samples.push(...await readContrastSamples(page, [
    { name: 'weather temperature', text: '.preview-weather-temp strong', surface: '.preview-weather-current-card' },
    { name: 'weather condition', text: '.preview-weather-temp span', surface: '.preview-weather-current-card' },
    { name: 'weather place', text: '.preview-weather-place', surface: '.preview-weather-current-card' },
    { name: 'weather detail', text: '.preview-weather-temp small', surface: '.preview-weather-current-card' },
    { name: 'weather fact label', text: '.preview-weather-facts span', surface: '.preview-weather-facts span' },
    { name: 'weather high status', text: '.preview-weather-facts .hot', surface: '.preview-weather-facts span' },
    { name: 'weather fact value', text: '.preview-weather-facts b:not(.hot)', surface: '.preview-weather-facts span' },
    { name: 'weather source chip', text: '.preview-weather-source-strip span', surface: '.preview-weather-source-strip span' },
    { name: 'weather hourly chip', text: '.preview-weather-hourly-chip b', surface: '.preview-weather-hourly-chip' },
    { name: 'weather mobile source cue', text: '.weather-command-row', surface: '.weather-command-fancy', pseudo: '::before' },
  ]));

  await nav.getByRole('button', { name: '統計', exact: true }).click();
  await expect(page.locator('.preview-stats-budget')).toBeVisible();
  samples.push(...await readContrastSamples(page, [
    { name: 'stats compass heading', text: '.preview-budget-heading > span', surface: '.preview-stats-budget' },
    { name: 'stats compass legend', text: '.spending-compass-legend span', surface: '.preview-stats-budget' },
    { name: 'stats budget label', text: '.preview-budget-total span', surface: '.preview-stats-budget' },
    { name: 'stats budget value', text: '.preview-budget-total strong', surface: '.preview-stats-budget' },
    { name: 'stats used status', text: '.preview-budget-row.is-used strong', surface: '.preview-stats-budget' },
    { name: 'stats remaining label', text: '.preview-budget-row:not(.is-used) span', surface: '.preview-stats-budget' },
    { name: 'stats remaining value', text: '.preview-budget-row:not(.is-used) strong', surface: '.preview-stats-budget' },
    { name: 'stats top category amount', text: '.preview-budget-stack small', surface: '.preview-stats-budget' },
    { name: 'stats ranked store', text: '.top-expenses-panel .rank-row span', surface: '.top-expenses-panel' },
    { name: 'stats ranked amount', text: '.top-expenses-panel .rank-row strong', surface: '.top-expenses-panel' },
    { name: 'stats category label', text: '.category-panel .bar-row span', surface: '.category-panel' },
    { name: 'stats category amount', text: '.category-panel .bar-row b', surface: '.category-panel' },
    { name: 'stats payment label', text: '.payment-panel .bar-row span', surface: '.payment-panel' },
    { name: 'stats payment amount', text: '.payment-panel .bar-row b', surface: '.payment-panel' },
    { name: 'stats scope explanation', text: '.stats-controls p', surface: '.stats-controls' },
  ]));

  const failures = samples.filter(({ ratio }) => ratio < 4.5);
  console.log(`[theme-contrast] ${samples.map(({ name, ratio }) => `${name}=${ratio}:1`).join(' | ')}`);
  expect(failures, `Taiwan contrast samples:\n${JSON.stringify(samples, null, 2)}`).toEqual([]);
});

test('mobile dock reflows at 200% text without overlapping navigation labels', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedTaiwanContrastState(page);
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#dashboard`);
  const nav = page.locator('.app-floating-dock-mobile[aria-label="主要分頁"]');
  await expect(nav).toBeVisible({ timeout: 15_000 });
  await page.addStyleTag({ content: `
    .app-floating-dock-mobile,
    .app-floating-dock-mobile button,
    .app-floating-dock-mobile .dock-mobile-label { font-size: 30px !important; }
  ` });

  const layout = await nav.evaluate((element) => {
    const labels = [...element.querySelectorAll('.dock-mobile-label')].map((label) => {
      const rect = label.getBoundingClientRect();
      return { text: label.textContent, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
    const overlaps = [];
    for (let left = 0; left < labels.length; left += 1) {
      for (let right = left + 1; right < labels.length; right += 1) {
        const a = labels[left];
        const b = labels[right];
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
          overlaps.push(`${a.text}/${b.text}`);
        }
      }
    }
    const buttons = [...element.querySelectorAll('button')].map((button) => Math.round(button.getBoundingClientRect().top));
    const rect = element.getBoundingClientRect();
    return { overlaps, rowCount: new Set(buttons).size, left: rect.left, right: rect.right, viewport: innerWidth };
  });

  expect(layout.overlaps).toEqual([]);
  expect(layout.rowCount).toBeGreaterThan(1);
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(layout.viewport);
});

test('theme catalog exposes six choices, semantic roles, and accessible color schemes', async ({ page }) => {
  await seedThemeState(page);
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#settings`);
  const group = page.getByRole('radiogroup', { name: 'App theme' });
  await expect(group.getByRole('radio')).toHaveCount(6, { timeout: 15_000 });
  await page.getByRole('button', { name: /旅伴 \/ 分帳比例/ }).click();
  const primaryAction = page.getByRole('button', { name: '新增', exact: true });
  await expect(primaryAction).toBeVisible();
  const themes = [
    ['日本和紙', 'japan_washi', false],
    ['韓國韓紙', 'korea_editorial', false],
    ['台灣夜市', 'taiwan_nightmarket', true],
    ['歐洲鐵路', 'europe_rail', false],
    ['全球旅誌', 'global_journal', false],
  ];
  for (const [label, key, dark] of themes) {
    await group.getByRole('radio', { name: label }).check();
    const catalog = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return {
        appTheme: document.documentElement.dataset.appTheme,
        scheme: document.documentElement.dataset.colorScheme,
        dark: document.documentElement.classList.contains('dark'),
        canvas: styles.getPropertyValue('--theme-canvas').trim(),
        canvasMid: styles.getPropertyValue('--theme-canvas-mid').trim(),
        canvasEnd: styles.getPropertyValue('--theme-canvas-end').trim(),
        surface: styles.getPropertyValue('--theme-surface').trim(),
        card: styles.getPropertyValue('--theme-card').trim(),
        text: styles.getPropertyValue('--theme-text').trim(),
        muted: styles.getPropertyValue('--theme-muted').trim(),
        focus: styles.getPropertyValue('--theme-focus').trim(),
        onAccent: styles.getPropertyValue('--theme-on-accent').trim(),
        accent: styles.getPropertyValue('--theme-accent').trim(),
        status: ['info', 'success', 'warning', 'danger'].map((tone) => styles.getPropertyValue(`--theme-status-${tone}`).trim()),
        chart: [1, 2, 3, 4].map((index) => styles.getPropertyValue(`--theme-chart-${index}`).trim()),
        cta: (() => {
          const style = getComputedStyle(document.querySelector('.person-add .primary'));
          return { background: style.backgroundColor, color: style.color, image: style.backgroundImage };
        })(),
        statusPills: Array.from(document.querySelectorAll('.settings-command .status-pill')).slice(0, 2).map((node) => {
          const style = getComputedStyle(node);
          return { background: style.backgroundColor, color: style.color };
        }),
      };
    });
    expect(catalog.appTheme).toBe(key);
    expect({
      scheme: catalog.scheme,
      canvas: catalog.canvas,
      canvasMid: catalog.canvasMid,
      canvasEnd: catalog.canvasEnd,
      surface: catalog.surface,
      card: catalog.card,
      text: catalog.text,
      muted: catalog.muted,
      focus: catalog.focus,
      onAccent: catalog.onAccent,
      accent: catalog.accent,
      info: catalog.status[0], success: catalog.status[1], warning: catalog.status[2], danger: catalog.status[3],
      chart1: catalog.chart[0], chart2: catalog.chart[1], chart3: catalog.chart[2], chart4: catalog.chart[3],
    }).toEqual(expect.objectContaining({
      scheme: exactThemeTokens[key].scheme,
      canvas: exactThemeTokens[key].canvas,
      canvasMid: exactThemeTokens[key].canvasMid,
      canvasEnd: exactThemeTokens[key].canvasEnd,
      surface: exactThemeTokens[key].surface,
      card: exactThemeTokens[key].card,
      text: exactThemeTokens[key].text,
      muted: exactThemeTokens[key].muted,
      focus: exactThemeTokens[key].focus,
      onAccent: exactThemeTokens[key].onAccent,
      accent: exactThemeTokens[key].accent,
      info: exactThemeTokens[key].info,
      success: exactThemeTokens[key].success,
      warning: exactThemeTokens[key].warning,
      danger: exactThemeTokens[key].danger,
      chart1: exactThemeTokens[key].chart1,
      chart2: exactThemeTokens[key].chart2,
      chart3: exactThemeTokens[key].chart3,
      chart4: exactThemeTokens[key].chart4,
    }));
    expect(catalog.scheme).toBe(dark ? 'dark' : 'light');
    expect(catalog.dark).toBe(dark);
    expect(catalog.chart).toHaveLength(4);
    expect(catalog.chart.every((value) => /^#[0-9A-F]{6}$/i.test(value))).toBe(true);
    expect(contrast(catalog.text, catalog.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(catalog.text, catalog.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(catalog.text, catalog.card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(catalog.focus, catalog.canvas)).toBeGreaterThanOrEqual(3);
    expect(contrast(catalog.focus, catalog.card)).toBeGreaterThanOrEqual(3);
    expect(contrast(catalog.onAccent, catalog.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(catalog.cta.color, catalog.cta.background)).toBeGreaterThanOrEqual(4.5);
    expect(catalog.cta.image).toBe('none');
    for (const statusTone of catalog.status) {
      expect(contrast(statusTone, catalog.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(statusTone, catalog.card)).toBeGreaterThanOrEqual(4.5);
    }
    for (const pill of catalog.statusPills) expect(contrast(pill.color, pill.background)).toBeGreaterThanOrEqual(4.5);
  }
  await group.getByRole('radio', { name: '自動（依旅程）' }).check();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.appTheme)).toBe('korea_editorial');
});

test('AuthGate announces unlock errors, restores password focus, and localizes the route marker', async ({ page }) => {
  await page.addInitScript((state) => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('boss-japan-tracker', JSON.stringify({ ...state, themePreference: 'taiwan_nightmarket' }));
  }, koreaTripState);
  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/`);

  const password = page.getByLabel('密碼');
  await expect(password).toBeVisible();
  await expect(page.locator('.lock-ledger-map')).toContainText('TPE');
  await expect(page.locator('.lock-screen')).not.toContainText(/TYO|🏯|🌸/);
  await expect(page.locator('.lock-proof-strip')).toHaveAttribute('aria-hidden', 'true');
  await password.fill('not-the-password');
  await page.getByRole('button', { name: '解鎖' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('密碼唔正確');
  await expect(password).toHaveAttribute('aria-describedby', await alert.getAttribute('id'));
  await expect(password).toBeFocused();
  await expect(page.locator('.lock-screen')).toHaveCSS('background-image', /gradient/);
});
