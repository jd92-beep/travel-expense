import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const defaultBaseUrl = 'http://127.0.0.1:8903/travel-expense/compact/';
const baseUrl = process.env.COMPACT_CONTACT_SHEET_BASE_URL || defaultBaseUrl;
const viewport = { width: 390, height: 844 };
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = process.env.COMPACT_CONTACT_SHEET_OUT || path.join('/tmp', `compact-contact-sheet-${stamp}`);

const tabs = [
  { id: 'dashboard', label: '主頁', expected: '預算總覽', selector: '.washi-today-stats-card' },
  { id: 'scan', label: '記帳', expected: '掃描收據', selector: '.preview-scan-camera' },
  { id: 'timeline', label: '行程', expected: '行程時間線', selector: '.timeline-day' },
  { id: 'history', label: '紀錄', expected: '紀錄中心', selector: '.history-filter-deck' },
  { id: 'weather', label: '天氣', expected: '天氣預報', selector: '.preview-weather-current-card' },
  { id: 'stats', label: '統計', expected: '預算使用分析', selector: '.stats-story-grid' },
  { id: 'settings', label: '設定', expected: '設定控制中心', selector: '.settings-preview-controls' },
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probe(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 900);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureServer() {
  if (await probe(baseUrl)) return null;
  if (baseUrl !== defaultBaseUrl) {
    throw new Error(`COMPACT_CONTACT_SHEET_BASE_URL is not reachable: ${baseUrl}`);
  }

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const server = spawn(npx, ['vite', '--host', '127.0.0.1', '--port', '8903'], {
    cwd: appRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  let output = '';
  server.stdout.on('data', (chunk) => { output += String(chunk); });
  server.stderr.on('data', (chunk) => { output += String(chunk); });

  for (let i = 0; i < 80; i += 1) {
    if (await probe(baseUrl)) return server;
    await delay(250);
  }

  server.kill('SIGTERM');
  throw new Error(`Timed out waiting for compact dev server at ${baseUrl}\n${output.slice(-2000)}`);
}

function weatherPayload() {
  return {
    ok: true,
    provider: 'weatherapi',
    location: { name: 'Nagoya', country: 'Japan', localtime: '2026-05-08 12:30' },
    current: {
      temp_c: 22,
      feelslike_c: 23,
      condition: { text: 'Partly cloudy' },
      humidity: 65,
      wind_kph: 12,
    },
    forecast: {
      forecastday: [{
        date: '2026-05-08',
        day: {
          avgtemp_c: 22,
          maxtemp_c: 25,
          mintemp_c: 18,
          condition: { text: 'Partly cloudy' },
        },
        hour: [],
      }],
    },
  };
}

function seedScript() {
  const now = Date.now();
  const userId = '11111111-1111-4111-8111-111111111111';
  localStorage.clear();
  localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: now + 31_536_000_000 }));
  localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
    credentialSession: 'visual-proof-session',
    credentialSessionExpiresAt: now + 60_000,
  }));
  localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify({
    access_token: 'fake-access-token',
    refresh_token: 'fake-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(now / 1000) + 3600,
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'visual@example.com',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    },
  }));

  const state = {
    lastTab: 'dashboard',
    autoSync: false,
    schemaVersion: 3,
    budget: 50_000,
    tripDateRange: { start: '2026-05-08', end: '2026-05-13' },
    trips: [{
      id: 'visual_trip',
      name: '名古屋手帳 2026',
      destinationSummary: '名古屋 / 京都',
      startDate: '2026-05-08',
      endDate: '2026-05-13',
      budget: 50_000,
      homeCurrency: 'HKD',
      currencies: ['HKD', 'JPY'],
      timezones: ['Asia/Tokyo'],
      active: true,
      createdAt: now,
      updatedAt: now,
    }],
    customItinerary: [{
      date: '2026-05-08',
      day: 1,
      region: '名古屋市區',
      timezone: 'Asia/Tokyo',
      spots: [
        { time: '09:30', name: '名古屋站地下街', type: 'transport', address: 'Nagoya Station', note: '到埗後先買 IC card。' },
        { time: '12:30', name: '手羽先午餐', type: 'food' },
        { time: '18:00', name: '榮町夜景散步', type: 'shopping' },
      ],
    }, {
      date: '2026-05-09',
      day: 2,
      region: '京都',
      timezone: 'Asia/Tokyo',
      spots: [
        { time: '10:00', name: '伏見稻荷大社', type: 'sightseeing' },
        { time: '15:00', name: '祇園咖啡休息', type: 'food' },
      ],
    }],
    persons: [
      { id: 'p_boss', name: 'Boss', emoji: 'B', color: '#cc2929' },
      { id: 'p_may', name: 'May', emoji: 'M', color: '#2d5a8e' },
    ],
    shareRatios: { p_boss: 1, p_may: 1 },
    receipts: [
      { id: 'r1', sourceId: 'visual_r1', store: 'Nagoya Station Bento', total: 2800, date: '2026-05-08', time: '10:45', category: 'food', payment: 'credit', personId: 'p_boss', splitMode: 'shared', createdAt: now - 5000 },
      { id: 'r2', sourceId: 'visual_r2', store: 'JR Ticket Counter', total: 8800, date: '2026-05-08', time: '14:10', category: 'transport', payment: 'cash', personId: 'p_may', splitMode: 'private', createdAt: now - 4000 },
      { id: 'r3', sourceId: 'visual_r3', store: 'Hotel Deposit', total: 22_000, date: '2026-05-09', category: 'lodging', payment: 'credit', personId: 'p_boss', splitMode: 'shared', createdAt: now - 3000 },
      { id: 'r4', sourceId: 'visual_r4', store: 'Gion Coffee', total: 1600, date: '2026-05-09', category: 'food', payment: 'cash', personId: 'p_may', splitMode: 'shared', createdAt: now - 2000 },
    ],
  };

  localStorage.setItem('boss-japan-tracker', JSON.stringify(state));
  localStorage.setItem(`boss-japan-tracker:state:supabase:${userId}`, JSON.stringify(state));
  window.__disable_supabase_configured = true;
}

async function stubExternalRequests(page) {
  await page.route('**/secrets.local.js', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));
  await page.route('https://travel-expense-credential-broker.ftjdfr.workers.dev/weather/forecast', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(weatherPayload()),
  }));
  await page.route('https://open.er-api.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ result: 'success', provider: 'qa-rate', rates: { HKD: 1, JPY: 20.5, USD: 0.13, KRW: 170 } }),
  }));
  await page.route('https://api.weatherapi.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(weatherPayload()),
  }));
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      current: { temperature_2m: 22, apparent_temperature: 23, weather_code: 2 },
      daily: {
        time: ['2026-05-08'],
        temperature_2m_max: [25],
        temperature_2m_min: [18],
        apparent_temperature_max: [26],
        apparent_temperature_min: [19],
        weather_code: [2],
      },
    }),
  }));
  await page.route('**/notion/request', async (route) => {
    let payload = {};
    try {
      payload = route.request().postDataJSON();
    } catch {}
    const pathText = String(payload?.path || '');
    const data = pathText.endsWith('/query') ? { results: [], has_more: false } : { properties: {} };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
  });
  await page.route('https://*.supabase.co/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }));
}

async function captureTabs() {
  const startedServer = await ensureServer();
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/125 Mobile Safari/537.36',
  });
  const page = await context.newPage();
  const consoleProblems = [];
  const badResponses = [];

  page.on('console', (msg) => {
    const text = msg.text();
    if (
      ['error', 'warning'].includes(msg.type())
      && !text.includes('NO_COLOR')
      && !text.includes('Reduced Motion enabled')
    ) {
      consoleProblems.push(`${msg.type()}: ${text}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().includes('/favicon')) {
      badResponses.push(`${response.status()}: ${response.url()}`);
    }
  });
  page.on('pageerror', (error) => consoleProblems.push(`pageerror: ${error.message}`));

  try {
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });
    await stubExternalRequests(page);
    await page.addInitScript(seedScript);
    await page.goto(baseUrl, { waitUntil: 'networkidle' });

    const captures = [];
    const nav = page.getByLabel('主要分頁');
    for (const tab of tabs) {
      await nav.getByRole('button', { name: tab.label, exact: true }).click();
      if (tab.expected === '紀錄中心' || tab.expected === '設定控制中心') {
        await page.locator('.compact-mobile-title-art').waitFor({ state: 'visible', timeout: 7000 });
      } else {
        await page.getByText(tab.expected).first().waitFor({ state: 'visible', timeout: 7000 });
      }
      await page.locator(tab.selector).first().waitFor({ state: 'visible', timeout: 9000 });
      await page.waitForTimeout(tab.id === 'stats' ? 900 : 300);

      const file = path.join(outDir, `${tab.id}.png`);
      await page.screenshot({ path: file, fullPage: false });
      const metrics = await page.evaluate(() => {
        const dockNode = Array.from(document.querySelectorAll('.app-floating-dock-mobile, .tabbar, [aria-label="主要分頁"]'))
          .find((node) => {
            const rect = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
          });
        const dock = dockNode?.getBoundingClientRect();
        const rail = document.querySelector('.timeline-rail-beam')?.getBoundingClientRect();
        const timelineMain = document.querySelector('.timeline-main')?.getBoundingClientRect();
        return {
          tab: location.hash.replace('#', '') || 'dashboard',
          viewport: window.innerWidth,
          docScrollWidth: document.documentElement.scrollWidth,
          bodyScrollWidth: document.body.scrollWidth,
          dockVisible: Boolean(dock && dock.top < window.innerHeight && dock.bottom > 0),
          dockTop: dock ? Math.round(dock.top) : null,
          timelineRailClear: !rail || !timelineMain || rail.right <= timelineMain.left + 1,
          timelineRailRight: rail ? Math.round(rail.right) : null,
          timelineMainLeft: timelineMain ? Math.round(timelineMain.left) : null,
        };
      });
      captures.push({ id: tab.id, label: tab.label, file, ...metrics });
    }

    const contactHtml = path.join(outDir, 'contact.html');
    const contactSheet = path.join(outDir, 'mobile-contact-sheet.png');
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#f4ecdf;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#2a2119}.wrap{padding:18px;display:grid;grid-template-columns:repeat(4,390px);gap:18px;align-items:start}.shot{background:#fffaf0;border:1px solid rgba(128,99,63,.18);border-radius:18px;padding:10px;box-shadow:0 14px 34px rgba(67,46,24,.08)}.title{font-size:15px;font-weight:900;margin:0 0 8px}.shot img{width:390px;height:844px;object-fit:cover;border-radius:14px;display:block}
</style></head><body><div class="wrap">${captures.map((capture) => `<figure class="shot"><figcaption class="title">${capture.label} · ${capture.id}</figcaption><img src="file://${capture.file}" /></figure>`).join('')}</div></body></html>`;
    await fs.writeFile(contactHtml, html, 'utf8');

    const contactPage = await context.newPage();
    await contactPage.goto(`file://${contactHtml}`);
    await contactPage.setViewportSize({ width: 1650, height: 1840 });
    await contactPage.screenshot({ path: contactSheet, fullPage: true });

    const failures = [];
    for (const capture of captures) {
      if (capture.docScrollWidth > viewport.width + 1 || capture.bodyScrollWidth > viewport.width + 1) {
        failures.push(`${capture.id}: horizontal overflow doc=${capture.docScrollWidth} body=${capture.bodyScrollWidth}`);
      }
      if (!capture.dockVisible) failures.push(`${capture.id}: bottom dock is not visible`);
      if (capture.id === 'timeline' && !capture.timelineRailClear) {
        failures.push(`timeline: rail overlaps content railRight=${capture.timelineRailRight} mainLeft=${capture.timelineMainLeft}`);
      }
    }
    if (consoleProblems.length) failures.push(`console problems: ${consoleProblems.join(' | ')}`);
    if (badResponses.length) failures.push(`bad responses: ${badResponses.join(' | ')}`);

    const summary = {
      baseUrl,
      outDir,
      contactSheet,
      captures: captures.map(({ id, docScrollWidth, bodyScrollWidth, dockVisible, dockTop, timelineRailClear, timelineRailRight, timelineMainLeft }) => ({
        id,
        docScrollWidth,
        bodyScrollWidth,
        dockVisible,
        dockTop,
        timelineRailClear,
        timelineRailRight,
        timelineMainLeft,
      })),
      consoleProblems,
      badResponses,
      failures,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    await browser.close();
    if (startedServer) startedServer.kill('SIGTERM');
  }
}

await captureTabs();
