const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const APP_ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://localhost:8903';
const THEME_HINT_KEY = 'boss-japan-tracker:theme:v1';

test.use({ viewport: { width: 390, height: 844 } });

const taiwanTripState = {
  schemaVersion: 4,
  lastTab: 'settings',
  budget: 150000,
  rate: 4.1,
  autoSync: false,
  themePreference: 'auto',
  activeTripId: 'theme_trip',
  tripName: 'Taipei theme test',
  tripDateRange: { start: '2026-08-10', end: '2026-08-11' },
  tripCurrency: 'TWD',
  customItinerary: [],
  receipts: [],
  trips: [{
    id: 'theme_trip', name: 'Taipei theme test', destinationSummary: 'Taiwan', startDate: '2026-08-10', endDate: '2026-08-11',
    homeCurrency: 'HKD', currencies: ['HKD', 'TWD'], timezones: ['Asia/Taipei'], version: 1, active: true,
    itinerary: [], intelligence: { countryCode: 'TW', primaryCurrency: 'TWD', themeKey: 'taiwan_nightmarket' }, createdAt: 1, updatedAt: 1,
  }],
};

const taiwanContrastState = {
  ...taiwanTripState,
  lastTab: 'dashboard',
  themePreference: 'taiwan_nightmarket',
  budget: 50_000,
  activeTripId: 'visual_trip',
  tripName: 'Taiwan contrast test',
  tripDateRange: { start: '2026-08-10', end: '2026-08-12' },
  tripCurrency: 'TWD',
  customItinerary: [{
    date: '2026-08-10',
    day: 1,
    region: '台北市區',
    timezone: 'Asia/Taipei',
    spots: [{ time: '12:30', name: '夜市午餐', type: 'food' }],
  }],
  receipts: [
    { id: 'r1', sourceId: 'theme_r1', store: '台北車站便當', total: 280, currency: 'TWD', date: '2026-08-10', time: '10:45', category: 'food', payment: 'credit', personId: 'p_boss', splitMode: 'shared', createdAt: 1 },
    { id: 'r2', sourceId: 'theme_r2', store: '捷運售票處', total: 880, currency: 'TWD', date: '2026-08-10', time: '14:10', category: 'transport', payment: 'cash', personId: 'p_boss', splitMode: 'private', createdAt: 2 },
  ],
  trips: [{
    id: 'visual_trip', name: 'Taiwan contrast test', destinationSummary: 'Taipei, Taiwan', startDate: '2026-08-10', endDate: '2026-08-12',
    homeCurrency: 'HKD', currencies: ['HKD', 'TWD'], timezones: ['Asia/Taipei'], version: 1, active: true,
    itinerary: [], intelligence: { countryCode: 'TW', primaryCurrency: 'TWD', themeKey: 'taiwan_nightmarket' }, createdAt: 1, updatedAt: 1,
  }],
};

async function seedThemeState(page) {
  await page.addInitScript((state) => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({ credentialSession: 'theme-test', credentialSessionExpiresAt: Date.now() + 60_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify(state));
  }, taiwanTripState);
  await page.route('**/secrets.local.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.DEV_SECRETS = {};' }));
}

async function seedTaiwanContrastState(page) {
  await page.addInitScript((state) => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({ credentialSession: 'theme-test', credentialSessionExpiresAt: Date.now() + 60_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify(state));
  }, taiwanContrastState);
  await page.route('**/secrets.local.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.DEV_SECRETS = {};' }));
}

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

async function readVisibleTextContrast(page, tab, rootSelector) {
  const samples = await page.evaluate(({ tabName, root }) => {
    const scope = document.querySelector(root);
    if (!scope) throw new Error(`Missing contrast root: ${tabName} ${root}`);
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const parse = (value) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
      return [red, green, blue, alpha / 255];
    };
    const over = (front, back) => {
      const alpha = front[3] + back[3] * (1 - front[3]);
      if (!alpha) return [0, 0, 0, 0];
      return [
        (front[0] * front[3] + back[0] * back[3] * (1 - front[3])) / alpha,
        (front[1] * front[3] + back[1] * back[3] * (1 - front[3])) / alpha,
        (front[2] * front[3] + back[2] * back[3] * (1 - front[3])) / alpha,
        alpha,
      ];
    };
    const backgroundFor = (element) => {
      const layers = [];
      for (let node = element; node; node = node.parentElement) {
        const layer = parse(getComputedStyle(node).backgroundColor);
        if (layer[3]) layers.push(layer);
        if (layer[3] === 1) break;
      }
      return layers.reverse().reduce((background, layer) => over(layer, background), [255, 255, 255, 1]);
    };
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return !element.closest('[hidden], [aria-hidden="true"]')
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) > 0
        && rect.width > 0
        && rect.height > 0;
    };
    const describe = (element) => {
      const classes = typeof element.className === 'string' ? element.className.trim().split(/\s+/).filter(Boolean).join('.') : '';
      return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${classes ? `.${classes}` : ''}`;
    };
    const rendered = [];
    for (const element of [scope, ...scope.querySelectorAll('*')]) {
      if (!visible(element) || ['SCRIPT', 'STYLE', 'OPTION'].includes(element.tagName)) continue;
      const directText = [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (directText) {
        const background = backgroundFor(element);
        const foreground = over(parse(getComputedStyle(element).color), background);
        rendered.push({
          tab: tabName,
          target: describe(element),
          text: directText.slice(0, 60),
          foreground: `rgb(${foreground.slice(0, 3).map(Math.round).join(', ')})`,
          background: `rgb(${background.slice(0, 3).map(Math.round).join(', ')})`,
        });
      }
      if (['INPUT', 'TEXTAREA'].includes(element.tagName) && element.placeholder) {
        const background = backgroundFor(element);
        const foreground = over(parse(getComputedStyle(element, '::placeholder').color), background);
        rendered.push({
          tab: tabName,
          target: `${describe(element)}::placeholder`,
          text: element.placeholder.slice(0, 60),
          foreground: `rgb(${foreground.slice(0, 3).map(Math.round).join(', ')})`,
          background: `rgb(${background.slice(0, 3).map(Math.round).join(', ')})`,
        });
      }
    }
    return rendered;
  }, { tabName: tab, root: rootSelector });
  return samples.map((sample) => ({ ...sample, ratio: Number(contrast(sample.foreground, sample.background).toFixed(2)) }));
}

test('Taiwan dark keeps every rendered tab readable against its actual surface', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedTaiwanContrastState(page);
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#dashboard`);
  const nav = page.locator('.app-floating-dock-mobile[aria-label="主要分頁"]');
  await expect(nav).toBeVisible({ timeout: 15_000 });

  const tabs = [
    ['主頁', 'dashboard', '[aria-label="旅程總覽"]'],
    ['紀錄', 'history', '.history-screen'],
    ['行程', 'timeline', '.timeline-screen'],
    ['記帳', 'scan', '.scan-screen'],
    ['天氣', 'weather', '.weather-screen'],
    ['統計', 'stats', '.preview-stats-screen'],
    ['設定', 'settings', '.settings-screen'],
  ];
  const samples = [];
  for (const [label, tab, root] of tabs) {
    await nav.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator(root)).toBeVisible();
    const tabSamples = await readVisibleTextContrast(page, tab, root);
    expect(tabSamples.length, `${tab} must render real text samples`).toBeGreaterThan(0);
    samples.push(...tabSamples);
  }

  const failures = samples.filter(({ ratio }) => ratio < 4.5);
  const uniqueFailures = [...new Map(failures.map((sample) => [`${sample.tab}:${sample.target}`, sample])).values()];
  console.log(`[theme-contrast] checked=${samples.length}; failures=${failures.length}; classes=${uniqueFailures.map(({ tab, target, ratio }) => `${tab}:${target}=${ratio}:1`).join(' | ')}`);
  expect(uniqueFailures, `Taiwan rendered-text contrast failures:\n${JSON.stringify(uniqueFailures, null, 2)}`).toEqual([]);
});

test('mobile dock reflows at 200% text without overlapping navigation labels', async ({ page }) => {
  await seedTaiwanContrastState(page);
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#dashboard`);
  const nav = page.locator('.app-floating-dock-mobile[aria-label="主要分頁"]');
  await expect(nav).toBeVisible({ timeout: 15_000 });
  const readLayout = () => nav.evaluate((element) => {
    const labels = [...element.querySelectorAll('.dock-mobile-label')].map((label) => {
      const rect = label.getBoundingClientRect();
      return { text: label.textContent, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
    const overlaps = [];
    const horizontalGaps = [];
    for (let left = 0; left < labels.length; left += 1) {
      for (let right = left + 1; right < labels.length; right += 1) {
        const a = labels[left];
        const b = labels[right];
        if (a.top < b.bottom && a.bottom > b.top) {
          const [leading, trailing] = a.left <= b.left ? [a, b] : [b, a];
          const gap = trailing.left - leading.right;
          if (gap < 0) overlaps.push(`${a.text}/${b.text}`);
          else horizontalGaps.push(gap);
        }
      }
    }
    const buttons = [...element.querySelectorAll('button')].map((button) => {
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return {
        left: rect.left,
        right: rect.right,
        top: Math.round(rect.top),
        bottom: rect.bottom,
        width: Math.round(rect.width),
        minWidth: style.minWidth,
        flexBasis: style.flexBasis,
        scan: button.classList.contains('dock-item-scan'),
      };
    });
    const rect = element.getBoundingClientRect();
    const hiddenControls = buttons.filter((button) => (
      button.left < 0 || button.right > innerWidth || button.top < 0 || button.bottom > innerHeight
    ));
    return {
      overlaps,
      minHorizontalLabelGap: horizontalGaps.length ? Math.min(...horizontalGaps) : null,
      buttons,
      hiddenControls,
      rowCount: new Set(buttons.filter(({ scan }) => !scan).map(({ top }) => top)).size,
      left: rect.left,
      right: rect.right,
      viewport: innerWidth,
    };
  });

  const standardLayout = await readLayout();
  expect(standardLayout.overlaps).toEqual([]);
  expect(standardLayout.rowCount, JSON.stringify(standardLayout.buttons)).toBe(1);
  expect(standardLayout.buttons.find(({ scan }) => scan)?.width).toBe(58);

  await page.addStyleTag({ content: `
    .app-floating-dock-mobile .dock-mobile-label { font-size: 30px !important; }
  ` });
  const layout = await readLayout();
  expect(layout.overlaps).toEqual([]);
  expect(layout.minHorizontalLabelGap).toBeGreaterThanOrEqual(4);
  expect(layout.hiddenControls).toEqual([]);
  expect(layout.rowCount).toBeGreaterThan(1);
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(layout.viewport);
});

test('global CSS fallbacks are exact and accessible before provider hydration', () => {
  const css = readFileSync(join(__dirname, '..', 'src', 'styles', 'themes.css'), 'utf8');
  const rootBlock = css.match(/:root\s*\{([\s\S]*?)\}/)?.[1];
  expect(rootBlock, 'themes.css must expose a :root fallback catalog').toBeTruthy();
  const tokens = Object.fromEntries(
    Array.from(rootBlock.matchAll(/--([\w-]+):\s*([^;]+);/g), ([, name, value]) => [name, value.trim()]),
  );
  expect(tokens).toMatchObject({
    'theme-canvas': '#F1F0E9',
    'theme-surface': '#F9F8F1',
    'theme-card': '#FFFDF8',
    'theme-accent': '#BF5048',
    'theme-on-accent': '#FFFFFF',
    'theme-status-info': '#345C7C',
    'theme-status-success': '#3F6A4B',
    'theme-status-warning': '#725600',
    'theme-status-danger': '#9F4038',
  });
  expect(contrast(tokens['theme-on-accent'], tokens['theme-accent'])).toBeGreaterThanOrEqual(4.5);
  for (const tone of ['info', 'success', 'warning', 'danger']) {
    expect(contrast(tokens[`theme-status-${tone}`], tokens['theme-surface'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens[`theme-status-${tone}`], tokens['theme-card'])).toBeGreaterThanOrEqual(4.5);
  }
});

test('every device-hint CSS palette exactly matches the canonical first-paint catalog', () => {
  const css = readFileSync(join(__dirname, '..', 'src', 'styles', 'themes.css'), 'utf8');
  const expected = {
    japan_washi: {
      canvas: '#F5F0E8', canvasMid: '#F0EBDF', canvasEnd: '#E8E2D4', surface: '#FAF7F0', card: '#FFFDF7',
      text: '#2A2119', muted: '#7A7068', border: 'rgba(139, 115, 85, .2)', focus: '#1E4D6B', accent: '#C23B5E', onAccent: '#FFFFFF',
      info: '#1E4D6B', success: '#2D6E48', warning: '#7A5800', danger: '#A82C4C',
      chart: ['#1E4D6B', '#C23B5E', '#D4A843', '#2D6E48'], motion: '18s',
    },
    korea_editorial: {
      canvas: '#F7F4F0', canvasMid: '#EEF2F5', canvasEnd: '#E7EBE8', surface: '#FBF9F6', card: '#FFFFFF',
      text: '#202329', muted: '#66707D', border: 'rgba(82, 109, 174, .2)', focus: '#526DAE', accent: '#D85B73', onAccent: '#111827',
      info: '#40578F', success: '#346D5A', warning: '#765900', danger: '#A5334F',
      chart: ['#526DAE', '#D85B73', '#4C8F78', '#C9A85D'], motion: '24s',
    },
    taiwan_nightmarket: {
      canvas: '#111827', canvasMid: '#172554', canvasEnd: '#0F172A', surface: '#172033', card: '#202B3F',
      text: '#F8FAFC', muted: '#B8C3D3', border: 'rgba(148, 163, 184, .32)', focus: '#FBBF24', accent: '#FB7185', onAccent: '#111827',
      info: '#7DD3FC', success: '#86EFAC', warning: '#FDE68A', danger: '#FDA4AF',
      chart: ['#38BDF8', '#FB7185', '#FBBF24', '#4ADE80'], motion: '28s',
    },
    europe_rail: {
      canvas: '#EEF1EC', canvasMid: '#E5EAE8', canvasEnd: '#DCE4E5', surface: '#F7F6EF', card: '#FFFDF8',
      text: '#25231F', muted: '#606963', border: 'rgba(24, 73, 86, .22)', focus: '#184956', accent: '#A8323A', onAccent: '#FFFFFF',
      info: '#184956', success: '#335C49', warning: '#6F5200', danger: '#912A31',
      chart: ['#184956', '#A8323A', '#B89042', '#426A57'], motion: '0s',
    },
    global_journal: {
      canvas: '#F1F0E9', canvasMid: '#E7EAE4', canvasEnd: '#DCE5DE', surface: '#F9F8F1', card: '#FFFDF8',
      text: '#28251F', muted: '#656D67', border: 'rgba(52, 92, 124, .2)', focus: '#345C7C', accent: '#BF5048', onAccent: '#FFFFFF',
      info: '#345C7C', success: '#3F6A4B', warning: '#725600', danger: '#9F4038',
      chart: ['#345C7C', '#C4584E', '#D1A54D', '#517A5B'], motion: '32s',
    },
  };

  for (const [key, palette] of Object.entries(expected)) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const block = css.match(new RegExp(`:root\\[data-app-theme='${escapedKey}'\\]\\s*\\{([\\s\\S]*?)\\}`))?.[1];
    expect(block, `${key} must have a pre-React CSS token block`).toBeTruthy();
    const tokens = Object.fromEntries(
      Array.from(block.matchAll(/--([\w-]+):\s*([^;]+);/g), ([, name, value]) => [name, value.trim()]),
    );
    expect(tokens, `${key} first-paint CSS must match the canonical catalog`).toMatchObject({
      'theme-canvas': palette.canvas,
      'theme-canvas-mid': palette.canvasMid,
      'theme-canvas-end': palette.canvasEnd,
      'theme-surface': palette.surface,
      'theme-card': palette.card,
      'theme-text': palette.text,
      'theme-ink': palette.text,
      'theme-muted': palette.muted,
      'theme-border': palette.border,
      'theme-focus': palette.focus,
      'theme-accent': palette.accent,
      'theme-on-accent': palette.onAccent,
      'theme-status-info': palette.info,
      'theme-status-success': palette.success,
      'theme-status-warning': palette.warning,
      'theme-status-danger': palette.danger,
      'theme-chart-1': palette.chart[0],
      'theme-chart-2': palette.chart[1],
      'theme-chart-3': palette.chart[2],
      'theme-chart-4': palette.chart[3],
      'theme-motion-duration': palette.motion,
    });
  }
});

test('stored Taiwan hint applies only provisional app chrome before the module renders', async ({ page }) => {
  await page.route('**/src/main.tsx', (route) => route.abort());
  await page.addInitScript((key) => localStorage.setItem(key, 'taiwan_nightmarket'), THEME_HINT_KEY);
  await page.goto(`${APP_ORIGIN}/`);

  await expect.poll(() => page.evaluate(() => {
    const shell = document.createElement('main');
    shell.className = 'app-shell';
    document.body.append(shell);
    const snapshot = {
      app: document.documentElement.dataset.appTheme,
      source: document.documentElement.dataset.themeSource,
      scheme: document.documentElement.dataset.colorScheme,
      trip: document.documentElement.getAttribute('data-trip-theme'),
      country: document.documentElement.getAttribute('data-trip-country'),
      dark: document.documentElement.classList.contains('dark'),
      colorScheme: document.documentElement.style.colorScheme,
      themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
      canvas: getComputedStyle(document.documentElement).getPropertyValue('--theme-canvas').trim(),
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      shellBackground: getComputedStyle(shell).backgroundColor,
    };
    shell.remove();
    return snapshot;
  })).toEqual({
    app: 'taiwan_nightmarket', source: 'auto', scheme: 'dark', trip: null, country: null,
    dark: true, colorScheme: 'dark', themeColor: '#111827', canvas: '#111827',
    bodyBackground: 'rgb(17, 24, 39)', shellBackground: 'rgb(17, 24, 39)',
  });
});

test('stored Europe hint applies its light canvas before the module renders', async ({ page }) => {
  await page.route('**/src/main.tsx', (route) => route.abort());
  await page.addInitScript((key) => localStorage.setItem(key, 'europe_rail'), THEME_HINT_KEY);
  await page.goto(`${APP_ORIGIN}/`);

  expect(await page.evaluate(() => {
    const shell = document.createElement('main');
    shell.className = 'app-shell';
    document.body.append(shell);
    const snapshot = {
      app: document.documentElement.dataset.appTheme,
      source: document.documentElement.dataset.themeSource,
      scheme: document.documentElement.dataset.colorScheme,
      trip: document.documentElement.getAttribute('data-trip-theme'),
      country: document.documentElement.getAttribute('data-trip-country'),
      dark: document.documentElement.classList.contains('dark'),
      colorScheme: document.documentElement.style.colorScheme,
      themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
      canvas: getComputedStyle(document.documentElement).getPropertyValue('--theme-canvas').trim(),
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      shellBackground: getComputedStyle(shell).backgroundColor,
    };
    shell.remove();
    return snapshot;
  })).toEqual({
    app: 'europe_rail', source: 'auto', scheme: 'light', trip: null, country: null,
    dark: false, colorScheme: 'light', themeColor: '#eef1ec', canvas: '#EEF1EC',
    bodyBackground: 'rgb(238, 241, 236)', shellBackground: 'rgb(238, 241, 236)',
  });
});

test('missing and invalid hints use neutral validated first-paint attributes', async ({ browser }) => {
  for (const hint of [null, 'not-a-theme']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route('**/src/main.tsx', (route) => route.abort());
    await page.addInitScript(({ key, value }) => {
      localStorage.clear();
      if (value) localStorage.setItem(key, value);
    }, { key: THEME_HINT_KEY, value: hint });
    await page.goto(`${APP_ORIGIN}/`);
    expect(await page.evaluate(() => ({
      app: document.documentElement.dataset.appTheme,
      source: document.documentElement.dataset.themeSource,
      scheme: document.documentElement.dataset.colorScheme,
      trip: document.documentElement.getAttribute('data-trip-theme'),
      country: document.documentElement.getAttribute('data-trip-country'),
      dark: document.documentElement.classList.contains('dark'),
      themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    }))).toEqual({
      app: 'global_journal', source: 'auto', scheme: 'light', trip: null, country: null,
      dark: false, themeColor: '#f1f0e9',
    });
    await context.close();
  }
});

test('six preferences resolve five worlds while Taiwan alone is dark and Japan assets stay isolated', async ({ page }) => {
  await seedThemeState(page);
  await page.goto(`${APP_ORIGIN}/travel-expense/compact/#settings`);

  const group = page.getByRole('radiogroup', { name: 'App theme' });
  await expect(group.getByRole('radio')).toHaveCount(6);
  await page.getByRole('button', { name: /旅伴 \/ 分帳比例/ }).click();
  await expect(page.locator('.person-add .primary')).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    trip: document.documentElement.dataset.tripTheme,
    country: document.documentElement.dataset.tripCountry,
    app: document.documentElement.dataset.appTheme,
    source: document.documentElement.dataset.themeSource,
  }))).toEqual({ trip: 'taiwan_nightmarket', country: 'TW', app: 'taiwan_nightmarket', source: 'auto' });

  const worlds = [
    ['日本和紙', 'japan_washi', false],
    ['韓國韓紙', 'korea_editorial', false],
    ['台灣夜市', 'taiwan_nightmarket', true],
    ['歐洲鐵路', 'europe_rail', false],
    ['全球旅誌', 'global_journal', false],
  ];

  for (const [label, key, dark] of worlds) {
    await group.getByRole('radio', { name: new RegExp(label) }).check();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.appTheme)).toBe(key);
    const world = await page.evaluate(() => {
      const root = document.documentElement;
      const rootStyle = getComputedStyle(root);
      const art = document.querySelector('.hyperframe-background');
      return {
        scheme: root.dataset.colorScheme,
        dark: root.classList.contains('dark'),
        trip: root.dataset.tripTheme,
        country: root.dataset.tripCountry,
        source: root.dataset.themeSource,
        semantic: ['--theme-canvas', '--theme-surface', '--theme-card', '--theme-text', '--theme-focus', '--theme-status-success', '--theme-chart-1']
          .map((name) => rootStyle.getPropertyValue(name).trim()),
        canvas: rootStyle.getPropertyValue('--theme-canvas').trim(),
        surface: rootStyle.getPropertyValue('--theme-surface').trim(),
        card: rootStyle.getPropertyValue('--theme-card').trim(),
        accent: rootStyle.getPropertyValue('--theme-accent').trim(),
        onAccent: rootStyle.getPropertyValue('--theme-on-accent').trim(),
        status: ['info', 'success', 'warning', 'danger'].map((tone) => rootStyle.getPropertyValue(`--theme-status-${tone}`).trim()),
        cta: (() => {
          const style = getComputedStyle(document.querySelector('.person-add .primary'));
          return { background: style.backgroundColor, color: style.color, image: style.backgroundImage };
        })(),
        statusPills: Array.from(document.querySelectorAll('.settings-command .status-pill')).slice(0, 2).map((node) => {
          const style = getComputedStyle(node);
          return { background: style.backgroundColor, color: style.color };
        }),
        wallpaperLayers: document.querySelectorAll('.hyperframe-layer').length,
        motif: art?.getAttribute('data-art-motif') || '',
        motifBackground: art ? getComputedStyle(art, '::before').backgroundImage : 'none',
        japanMarks: document.querySelectorAll('.compact-rail-mark, .compact-topbar-mark, .compact-mobile-mark').length,
      };
    });
    expect(world.scheme).toBe(dark ? 'dark' : 'light');
    expect(world.dark).toBe(dark);
    expect(world.trip).toBe('taiwan_nightmarket');
    expect(world.country).toBe('TW');
    expect(world.source).toBe('manual');
    expect(world.semantic.every(Boolean)).toBe(true);
    expect(contrast(world.onAccent, world.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(world.cta.color, world.cta.background), `${key} CTA ${JSON.stringify(world.cta)}`).toBeGreaterThanOrEqual(4.5);
    expect(world.cta.image).toBe('none');
    for (const statusTone of world.status) {
      expect(contrast(statusTone, world.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(statusTone, world.card)).toBeGreaterThanOrEqual(4.5);
    }
    for (const pill of world.statusPills) expect(contrast(pill.color, pill.background)).toBeGreaterThanOrEqual(4.5);
    if (key === 'japan_washi') {
      expect(world.wallpaperLayers).toBeGreaterThan(0);
      expect(world.japanMarks).toBeGreaterThan(0);
    } else {
      expect(world.wallpaperLayers).toBe(0);
      expect(world.japanMarks).toBe(0);
      expect(world.motif).not.toBe('');
      expect(world.motifBackground).not.toBe('none');
    }
  }

  await group.getByRole('radio', { name: /台灣夜市/ }).check();
  await page.evaluate(() => document.body.classList.add('compact-native-android'));
  const surfaces = await page.evaluate(() => {
    const background = (selector) => getComputedStyle(document.querySelector(selector)).backgroundColor;
    return {
      shell: background('.app-shell'),
      header: background('.compact-mobile-header'),
      card: background('.accordion-card'),
      form: background('input[name="theme-preference"]'),
    };
  });
  expect(surfaces).toEqual({
    shell: 'rgb(17, 24, 39)',
    header: 'rgb(23, 32, 51)',
    card: 'rgb(32, 43, 63)',
    form: 'rgb(23, 32, 51)',
  });

  await group.getByRole('radio', { name: /韓國韓紙/ }).check();
  await expect.poll(() => page.evaluate(() => ({
    trip: document.documentElement.dataset.tripTheme,
    country: document.documentElement.dataset.tripCountry,
    app: document.documentElement.dataset.appTheme,
    source: document.documentElement.dataset.themeSource,
    preference: JSON.parse(localStorage.getItem('boss-japan-tracker') || '{}').themePreference,
  }))).toEqual({ trip: 'taiwan_nightmarket', country: 'TW', app: 'korea_editorial', source: 'manual', preference: 'korea_editorial' });
});
