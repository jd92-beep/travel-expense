const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { openTab } = require('./helpers/journey-navigation.cjs');
const ORIGIN = process.env.COMPACT_TEST_ORIGIN || 'http://127.0.0.1:8903';
const APP = `${ORIGIN}/travel-expense/compact/`;
const KEYS = ['japan_washi', 'korea_editorial', 'taiwan_nightmarket', 'europe_rail', 'global_journal', 'tokyo_neon', 'tropical_candy', 'uk_london', 'nordic_aurora', 'mexico_fiesta', 'india_holi', 'brazil_carnival', 'sketch_notebook', 'marshmallow_cloud', 'kids_blocks', 'kawaii_sticker', 'cyberpunk_hud', 'pixel_quest', 'japan_ukiyoe', 'korea_dancheong', 'night_ledger', 'harbor_blueprint', 'sunset_terrace', 'pocket_planner', 'alpine_postcard'];
const DARK = new Set(['taiwan_nightmarket', 'tokyo_neon', 'nordic_aurora', 'brazil_carnival', 'cyberpunk_hud', 'pixel_quest', 'night_ledger']);
const NEW_STYLES = ['night_ledger', 'harbor_blueprint', 'sunset_terrace', 'pocket_planner', 'alpine_postcard'];

function contrast(a, b) {
  const luminance = color => {
    const rgb = (color.startsWith('#') ? color.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255) : color.match(/[\d.]+/g).slice(0, 3).map(value => Number(value) / 255))
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

async function seed(page) {
  await page.route('**/*', route => new URL(route.request().url()).origin === ORIGIN ? route.continue() : route.abort());
  await page.clock.setFixedTime(new Date('2026-10-24T04:00:00Z'));
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    if (sessionStorage.getItem('theme-audit')) return;
    sessionStorage.setItem('theme-audit', '1');
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 86400000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      schemaVersion: 4, autoSync: false, lastTab: 'settings', activeTripId: 'theme-audit',
      tripName: '東京・週末旅程', tripCurrency: 'JPY', rate: 20, rateMode: 'fixed',
      tripDateRange: { start: '2026-10-24', end: '2026-10-26' },
      trips: [{ id: 'theme-audit', name: '東京・週末旅程', active: true, version: 1, startDate: '2026-10-24', endDate: '2026-10-26', currencies: ['JPY'], timezones: ['Asia/Tokyo'], itinerary: [
        { day: 1, date: '2026-10-24', region: '東京', spots: [{ name: '羽田機場', type: 'flight', time: '09:00', timeEnd: '10:30' }] },
        { day: 3, date: '2026-10-26', region: '上野', spots: [{ name: '美術館', type: 'sightseeing', time: '10:00' }] },
      ] }],
      receipts: [{ id: 'theme-lunch', sourceId: 'theme-lunch-source', tripId: 'theme-audit', store: '浅草午餐', date: '2026-10-24', total: 2480, originalAmount: 2480, originalCurrency: 'JPY', currency: 'JPY', exchangeRate: 20, hkdAmount: 124, category: 'food', payment: 'cash', personId: 'p_boss', createdAt: 1 }],
    }));
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(APP + '#settings');
  await expect(page.locator('[aria-controls="settings-theme-panel"]')).toBeVisible();
}

async function openThemes(page) {
  const trigger = page.locator('[aria-controls="settings-theme-panel"]');
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  await expect(page.locator('#settings-theme-panel')).toBeVisible();
}
async function choose(page, key) {
  const radio = page.locator(`input[name="app-theme"][value="${key}"]`);
  await page.locator('label.theme-option').filter({ has: radio }).click();
  await expect(radio).toBeChecked();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.appTheme)).toBe(key);
}
const go = openTab;
async function tokens(page) {
  return page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    const get = name => styles.getPropertyValue('--theme-' + name).trim();
    return {
      theme: document.documentElement.dataset.appTheme, scheme: document.documentElement.dataset.colorScheme,
      canvas: get('canvas'), card: get('card'), surface: get('surface'), text: get('text'), muted: get('muted'),
      accent: get('accent'), onAccent: get('on-accent'), focus: get('focus'),
      status: ['info', 'success', 'warning', 'danger'].map(tone => get('status-' + tone)),
    };
  });
}
async function withinViewport(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  const visibleControls = await page.locator('.receipt-editor-sheet :is(input, select, button)').evaluateAll(nodes => nodes
    .filter(n => n.getBoundingClientRect().height > 0)
    .filter(n => { const r = n.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; })
    .map(n => n.getAttribute('aria-label') || n.textContent));
  expect(visibleControls).toEqual([]);
}

for (const width of [320, 390, 1280]) {
  test(`all themes keep expense entry readable and contained at ${width}px`, async ({ page }, info) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 844 });
    await seed(page);
    await expect(page.locator('link[data-style-preview-fonts]')).toHaveCount(0);
    await openThemes(page);
    await expect(page.locator('link[data-style-preview-fonts]')).toHaveCount(1);
    await expect(page.locator('input[name="app-theme"]')).toHaveCount(KEYS.length + 1);
    const metrics = [];
    for (const key of KEYS) {
      await choose(page, key);
      const t = await tokens(page);
      expect(t.scheme).toBe(DARK.has(key) ? 'dark' : 'light');
      for (const surface of [t.card, t.surface]) {
        for (const color of [t.text, t.muted, ...t.status]) expect(contrast(color, surface), `${key}: ${color} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.focus, surface), `${key}: focus`).toBeGreaterThanOrEqual(3);
      }
      expect(contrast(t.onAccent, t.accent), `${key}: primary action`).toBeGreaterThanOrEqual(4.5);
      await go(page, '主頁');
      await expect(page.locator('.journey-hero-heading')).toBeInViewport();
      await withinViewport(page);
      if (width !== 320) await page.screenshot({ path: info.outputPath(`${key}-home-${width}.png`) });
      await go(page, '記帳');
      await page.getByRole('button', { name: '手動', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '手動記一筆' });
      await expect(dialog).toBeVisible();
      await withinViewport(page);
      const title = await dialog.locator('#receipt-editor-title').evaluate(node => ({ ink: getComputedStyle(node).color, surface: getComputedStyle(node.closest('.modal-head')).backgroundColor }));
      expect(contrast(title.ink, title.surface), `${key}: editor title`).toBeGreaterThanOrEqual(4.5);
      await expect(dialog.getByRole('button', { name: '儲存', exact: true })).toBeInViewport();
      if (width !== 320) await page.screenshot({ path: info.outputPath(`${key}-editor-${width}.png`) });
      metrics.push({ ...t, mutedContrast: contrast(t.muted, t.card) });
      await page.keyboard.press('Escape');
      await go(page, '設定');
      await openThemes(page);
    }
    fs.writeFileSync(info.outputPath('contrast.json'), JSON.stringify(metrics, null, 2));
  });
}

test('every style paints its saved palette before hydration and keeps new selections after reload', async ({ page }) => {
  test.setTimeout(90000);
  await seed(page);
  await openThemes(page);
  const hydrated = {};
  for (const key of KEYS) {
    await choose(page, key);
    hydrated[key] = await tokens(page);
    if (NEW_STYLES.includes(key)) {
      await page.reload();
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.appTheme)).toBe(key);
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('boss-japan-tracker')).receipts[0].sourceId)).toBe('theme-lunch-source');
      await openThemes(page);
      await expect(page.locator('.kit-ico:visible').first()).toBeVisible();
    }
  }
  // Delay React: boot must still match the palette that was visible before reload.
  await page.route('**/src/main.tsx*', route => route.abort());
  for (const key of KEYS) {
    await page.evaluate(k => localStorage.setItem('boss-japan-tracker:theme:v1', k), key);
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await tokens(page), `${key}: first paint must not borrow another theme`).toEqual(hydrated[key]);
  }
});

for (const key of NEW_STYLES) {
  test(`${key} supports validation, correction, save and persisted receipt identity`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seed(page);
    await openThemes(page);
    await choose(page, key);
    await go(page, '記帳');
    await page.getByRole('button', { name: '手動', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '手動記一筆' });
    await dialog.getByLabel('店名 / 項目').fill('淺草咖啡');
    const amount = dialog.getByLabel('金額', { exact: true });
    const save = dialog.getByRole('button', { name: '儲存', exact: true });
    await save.focus();
    const saveStyle = await save.evaluate(node => ({ color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor, image: getComputedStyle(node).backgroundImage, borderEffect: getComputedStyle(node, '::before').display }));
    expect(saveStyle.image).toBe('none');
    expect(saveStyle.borderEffect).toBe('none');
    expect(contrast(saveStyle.color, saveStyle.background)).toBeGreaterThanOrEqual(4.5);
    await expect(save).toHaveCSS('outline-width', '3px');
    await expect(save).toBeEnabled();
    await amount.fill('12abc');
    await dialog.getByRole('button', { name: '儲存', exact: true }).click();
    await expect(amount).toBeFocused();
    await expect(amount).toHaveAttribute('aria-invalid', 'true');
    await expect(dialog.getByRole('alert')).toBeVisible();
    await withinViewport(page);
    await page.screenshot({ path: info.outputPath(`${key}-validation.png`) });
    await amount.fill('680');
    await expect(dialog.locator('.receipt-rate-current')).toContainText('HK$ 34');
    await dialog.getByRole('button', { name: '儲存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('region', { name: '今日入帳' }).getByRole('button', { name: /淺草咖啡/ })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`${key}-success.png`) });
    await page.reload();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.appTheme)).toBe(key);
    const receipts = await page.evaluate(() => JSON.parse(localStorage.getItem('boss-japan-tracker')).receipts);
    expect(receipts.find(r => r.id === 'theme-lunch')).toMatchObject({ sourceId: 'theme-lunch-source', total: 2480, exchangeRate: 20, hkdAmount: 124 });
    expect(receipts.find(r => r.store === '淺草咖啡')).toMatchObject({ total: 680, currency: 'JPY', exchangeRate: 20, hkdAmount: 34, tripId: 'theme-audit' });
  });
}

test('theme styles keep real primary-action text readable including gradient stops', async ({ page }) => {
  test.setTimeout(60000);
  await seed(page);
  await openThemes(page);
  await page.getByRole('button', { name: /旅伴 \/ 分帳比例/ }).click();
  const failures = [];
  for (const key of KEYS) {
    await choose(page, key);
    const style = await page.locator('.person-add .primary').evaluate(node => {
      const css = getComputedStyle(node);
      return { color: css.color, background: css.backgroundColor, gradient: css.backgroundImage, transitionDuration: css.transitionDuration };
    });
    if (KEYS.indexOf(key) >= 12) expect(style.transitionDuration.split(',').every(value => Number.parseFloat(value) === 0), `${key}: reduced-motion transitions`).toBe(true);
    const backgrounds = style.gradient === 'none' ? [style.background] : style.gradient.match(/rgba?\([^)]+\)/g);
    for (const background of backgrounds) {
      const ratio = contrast(style.color, background);
      if (ratio < 4.5) failures.push({ theme: key, ...style, background, ratio });
    }
  }
  expect(failures).toEqual([]);
});

// Measure rendered text against the painted ancestor surfaces, including color-mix and translucent fills.
function inspectJourney(selectors) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  function paint(color) { ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); }
  function luminance() {
    const [r,g,b] = Array.from(ctx.getImageData(0, 0, 1, 1).data).map(n => {
      const v = n / 255;
      return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
    });
    return r * .2126 + g * .7152 + b * .0722;
  }
  const issues = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('horizontal page overflow');
  for (const selector of selectors) {
    const node = [...document.querySelectorAll(selector)].find(el => el.getClientRects().length);
    if (!node) { issues.push('missing ' + selector); continue; }
    const layers = [];
    for (let el = node; el; el = el.parentElement) layers.unshift(getComputedStyle(el).backgroundColor);
    paint('white');
    layers.forEach(paint);
    const surface = ctx.getImageData(0, 0, 1, 1);
    const style = getComputedStyle(node);
    // The sticker theme paints its map action with an opaque two-stop gradient.
    const stops = style.backgroundSize === 'auto' && style.backgroundImage.startsWith('linear-gradient(')
      ? style.backgroundImage.match(/rgb\([^)]+\)/g) : null;
    const ratio = Math.min(...(stops || ['transparent']).map(stop => {
      ctx.putImageData(surface, 0, 0);
      paint(stop);
      const bg = luminance();
      paint(style.color);
      const ink = luminance();
      return (Math.max(bg, ink) + .05) / (Math.min(bg, ink) + .05);
    }));
    const large = parseFloat(style.fontSize) >= (Number(style.fontWeight) >= 700 ? 18.67 : 24);
    if (ratio < (large ? 3 : 4.5)) {
      const paints = [];
      for (let el = node; el; el = el.parentElement) {
        const cs = getComputedStyle(el);
        if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none') paints.push(el.className + ':' + cs.backgroundColor + ':' + cs.backgroundImage.slice(0,100));
      }
      issues.push(selector + ' contrast ' + ratio.toFixed(2) + ' ' + style.color + ' ' + paints.slice(0, 4).join(' / '));
    }
    const box = node.getBoundingClientRect();
    if (box.left < -1 || box.right > innerWidth + 1) issues.push(selector + ' outside screen');
  }
  return issues;
}

for (const width of [344, 1280]) {
  test(`all picker themes fit journey screens at ${width}px`, async ({page}, info) => {
    test.setTimeout(420000);
    await page.setViewportSize({width, height: 844});
    await seed(page);
    await openThemes(page);
    const choices = await page.locator('input[name="app-theme"]').evaluateAll(inputs => inputs.map(i => i.value));
    expect(choices.sort()).toEqual(['auto', ...KEYS].sort());
    const issues = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let states = 0;
    for (const key of choices) {
      if (key === 'auto') {
        await page.locator('label.theme-option').filter({has: page.locator('input[value="auto"]')}).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme-source', 'auto');
      } else await choose(page, key);
      async function check(name, targets) {
        if (name === 'settings') await expect(page.locator('html')).not.toHaveClass(/theme-switching/);
        await page.locator(targets[0]).first().waitFor({state:'visible'});
        const findings = await page.evaluate(inspectJourney, targets);
        issues.push(...findings.map(f => key + ' / ' + name + ' / ' + f));
        states++;
        if (name === 'calendar') await page.screenshot({path: info.outputPath(key + '-calendar.png')});
      }
      async function route(tab) { await page.evaluate(tab => { location.hash = tab; },tab); }
      await check('settings', ['.settings-screen h2', '.theme-option-copy > span']);
      await route('dashboard');
      await check('home', ['.journey-hero-heading h2','.journey-hero-heading p','.journey-quick-links button span','.journey-departure']);
      await route('timeline');
      if (key === 'pocket_planner') await page.getByRole('button', {name:'行程規劃', exact:true}).click();
      const views = page.getByLabel('行程工具', {exact:true});
      await views.getByRole('button', {name:'日程',exact:true}).click();
      await expect(page.locator('.timeline-event').first()).toBeVisible();
      const axisIssues = await page.locator('.timeline-event').evaluateAll(events => events.flatMap(event => {
        const time = event.querySelector('.timeline-time time').getBoundingClientRect();
        const marker = event.querySelector('.schedule-stop-node').getBoundingClientRect();
        const card = event.querySelector('.schedule-stop-card').getBoundingClientRect();
        const aligned = Math.abs(time.y + time.height / 2 - marker.y - marker.height / 2) < 4;
        return time.width && marker.width && time.right <= marker.left && marker.right <= card.left && aligned
          ? [] : [event.querySelector('.timeline-title').textContent];
      }));
      issues.push(...axisIssues.map(name => key + ' / time axis / ' + name));
      await check('day', ['.timeline-day-date-primary','.timeline-day-title h2','.timeline-now','.timeline-time > span','.planner-tools-handle']);
      await views.getByRole('button', {name:'多日',exact:true}).click();
      await check('calendar', ['.planner-calendar-pager > span','.planner-grid-heading strong','.planner-time-block time','.planner-time-block strong','.journey-calendar-day small']);
      await page.getByLabel('選擇行程日子').getByRole('button',{name:/Day 3 /}).click();
      await expect(page.locator('.journey-calendar-day.is-selected header')).toBeInViewport();
      if (key === 'pocket_planner') {
        await page.getByRole('button',{name:'旅程工具',exact:true}).click();
        await page.getByRole('dialog',{name:'旅程工具面板'}).getByRole('button',{name:/Google Maps/}).click();
      } else await views.getByRole('button', {name:'地圖',exact:true}).click();
      await check('map', ['.planner-place h3','.planner-place p','.planner-map-actions a.primary','.planner-panel-heading h3']);
      await page.getByRole('button',{name:'旅程工具',exact:true}).click();
      await check('tools', ['.planner-tools-sheet h2','.planner-sync-status small','.planner-tools-grid small','.planner-tools-shortcuts button']);
      await page.getByRole('dialog',{name:'旅程工具面板'}).getByRole('button',{name:'清單',exact:true}).click();
      await check('checklist', ['.journey-check-progress strong','.journey-check-group h3','.journey-check-row strong']);
      await route('scan');
      await check('scan', ['.scan-stamp-face strong','.scan-route','.planner-panel-heading h3','.scan-calc-launch strong']);
      await route('history');
      await check('history', ['.history-filter-deck input','.history-date-title h2','.history-ledger-main strong']);
      await route('stats');
      await check('stats', ['.preview-budget-heading > span','.preview-budget-total strong']);
      await route('weather');
      await check('weather', ['.wx-masthead h1','.wx-trip-label span','.wx-date[aria-pressed="true"] strong']);
      await route('settings');
      await openThemes(page);
    }
    fs.writeFileSync(info.outputPath('journey-results.json'), JSON.stringify({width,states,issues,errors},null,2));
    expect(errors).toEqual([]);
    expect(issues).toEqual([]);
  });
}

test('video themes expose the reference interactions and retain current routes', async ({page}, info) => {
  await page.setViewportSize({width:390, height:844});
  await seed(page);
  await openThemes(page);
  await choose(page, 'pocket_planner');
  await go(page, '行程');
  await expect(page.locator('.pocket-calendar-header')).toBeVisible();
  await page.screenshot({path:info.outputPath('pocket-day.png')});
  const day3 = page.getByLabel('選擇行程日子').getByRole('button',{name:/Day 3 /});
  await day3.click();
  await expect(page.locator('.planner-place h3')).toHaveText('美術館');
  await page.getByRole('button',{name:'多日',exact:true}).click();
  await page.getByRole('button',{name:/2026-10-26 10:00 美術館/}).dblclick();
  const editor = page.getByRole('dialog',{name:'編輯行程點'});
  await expect(editor).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await page.getByRole('button',{name:'攜帶用品',exact:true}).click();
  await expect(page.locator('.journey-check-group').first()).toBeVisible();
  const handle = page.getByRole('button',{name:'旅程工具',exact:true});
  const box = await handle.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width/2,box.y-64,{steps:5});
  await page.mouse.up();
  await expect(page.getByRole('dialog',{name:'旅程工具面板'})).toBeInViewport();
  await page.screenshot({path:info.outputPath('pocket-tools.png')});
  await page.getByRole('button',{name:'收起旅程工具'}).click();
  await page.getByRole('button',{name:'費用總覽',exact:true}).click();
  await expect(page.locator('.journey-shell')).toHaveAttribute('data-active-tab','stats');
  await go(page, '設定');
  await openThemes(page);
  await choose(page, 'alpine_postcard');
  await go(page,'主頁');
  await expect(page.locator('.journey-cover img').first()).toHaveAttribute('src',/southern-alps/);
  await page.screenshot({path:info.outputPath('alpine-home.png')});
  await go(page,'行程');
  await page.getByRole('button',{name:'日程',exact:true}).click();
  await expect(page.locator('.journey-planner-cover img')).toHaveAttribute('src',/lakeside-town/);
  await expect(page.locator('.journey-planner-cover img')).toBeInViewport();
  await expect(page.locator('.pocket-sections')).toHaveCount(0);
  await page.screenshot({path:info.outputPath('alpine-day.png')});
});

test('Pocket Planner touch preserves the second tap target and rejects short drawer drags', async ({page,browserName}) => {
  test.skip(browserName !== 'chromium', 'This touch regression drives the Chromium input protocol.');
  await page.setViewportSize({ width: 390, height: 700 });
  await seed(page);
  await openThemes(page);
  await choose(page, 'pocket_planner');
  await go(page, '行程');
  await page.getByRole('button', { name: '多日', exact: true }).click();
  await expect(page.locator('.planner-day-marker img')).toBeVisible();
  const touch = await page.context().newCDPSession(page);
  async function press(type, x, y) {
    await touch.send('Input.dispatchTouchEvent', {type, touchPoints: x === undefined ? [] : [{id: 1, x, y}]});
  }
  const thirdDay = page.locator('.journey-calendar-day').nth(2);
  const block = thirdDay.locator('.planner-time-block').first();
  await block.scrollIntoViewIfNeeded();
  const box = await block.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  for (let i = 0; i < 2; i++) {
    await press('touchStart', x, y);
    await press('touchEnd');
    // Let selection and the scroll effect commit between the two physical taps.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  await expect(page.getByRole('dialog', {name: '編輯行程點'})).toBeVisible();
  await page.keyboard.press('Escape');

  const handle = page.getByRole('button', {name:'旅程工具', exact:true});
  const h = await handle.boundingBox();
  const hx = h.x + h.width / 2, hy = h.y + h.height / 2;
  for (const [dx,dy,end] of [[0,-13,'touchEnd'],[40,0,'touchEnd'],[0,-60,'touchCancel']]) {
    await press('touchStart',hx,hy);
    await press('touchMove',hx+dx,hy+dy);
    await press(end);
    await expect(handle).toHaveAttribute('aria-expanded','false');
  }
  await handle.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog',{name:'旅程工具面板'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(handle).toBeFocused();
  await touch.detach();
});
