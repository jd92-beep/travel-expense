const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

test('AI routing keeps required primary models ahead of stale settings', async ({ page }) => {
  test.skip(process.env.SUPABASE_AI_SMOKE === '1', 'Run this broker-session smoke without Supabase env.');
  const calls = [];

  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));

  await page.route('**/google/json', async (route) => {
    const body = route.request().postDataJSON();
    calls.push({ provider: 'google', kind: body.kind, model: body.model });
    const store = body.kind === 'scan' ? 'Gemma Scan Mart' : 'Gemma Voice Cafe';
    const prompt = String(body.prompt || '');
    const data = body.kind === 'trip'
      ? prompt.includes('stage 1 of a two-stage Trip Update workflow')
        ? {
          organizedItinerary: [
            'Canonical itinerary: Google Seoul Trip',
            'Day 1 2026-07-10 | Stay: Hongdae Hotel',
            '- 18:00 Hongdae',
            '- 19:30 Google BBQ',
          ].join('\n'),
          summary: 'Google reorganized Seoul trip',
          warnings: [],
          assumptions: [],
        }
        : {
          organizedItinerary: [
            'Canonical itinerary: Google Seoul Trip',
            'Day 1 2026-07-10 | Stay: Hongdae Hotel',
            '- 18:00 Hongdae',
            '- 19:30 Google BBQ',
          ].join('\n'),
          trip: {
            name: 'Google Seoul Trip',
            destinationSummary: 'Seoul',
            startDate: '2026-07-10',
            endDate: '2026-07-12',
            homeCurrency: 'HKD',
            currencies: ['HKD', 'KRW'],
            itinerary: [{
              date: '2026-07-10',
              day: 1,
              region: 'Seoul',
              city: 'Seoul',
              country: 'South Korea',
              timezone: 'Asia/Seoul',
              currency: 'KRW',
              highlight: 'Arrival',
              lodging: { name: 'Hongdae Hotel' },
              spots: [
                { time: '18:00', name: 'Hongdae', type: 'sightseeing' },
                { time: '19:30', name: 'Google BBQ', type: 'food' },
              ],
            }],
          },
          summary: 'Google parsed trip update',
          warnings: [],
          changes: ['Detected new Seoul trip.'],
        }
      : body.kind === 'scan'
      ? {
          store,
          total: 1234,
          date: '2026-05-08',
          time: '09:30',
          category: 'food',
          payment: 'suica',
        }
      : [{
          store,
          total: 1234,
          date: '2026-05-08',
          time: '09:30',
          category: 'food',
          payment: 'suica',
        }];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data,
      }),
    });
  });

  await page.route('**/kimi/json', async (route) => {
    const body = route.request().postDataJSON();
    calls.push({ provider: 'kimi', kind: body.kind, model: body.model });
    const data = body.kind === 'trip'
      ? {
          trip: {
            name: 'Kimi Seoul Trip',
            destinationSummary: 'Seoul',
            startDate: '2026-07-10',
            endDate: '2026-07-12',
            homeCurrency: 'HKD',
            currencies: ['HKD', 'KRW'],
            itinerary: [{
              date: '2026-07-10',
              day: 1,
              region: 'Seoul',
              city: 'Seoul',
              country: 'South Korea',
              timezone: 'Asia/Seoul',
              currency: 'KRW',
              highlight: 'Arrival',
              spots: [{ time: '18:00', name: 'Hongdae', type: 'sightseeing' }],
            }],
          },
          summary: 'Kimi parsed trip update',
          warnings: [],
          changes: ['Detected new Seoul trip.'],
        }
      : [{
          store: 'Kimi Email Lunch',
          total: 888,
          date: '2026-05-08',
          time: '12:30',
          category: 'food',
          payment: 'credit',
        }];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data }),
    });
  });

  await page.route('**/trip/intelligence', async (route) => {
    const body = route.request().postDataJSON();
    calls.push({ provider: 'kimi', kind: 'trip', model: body.model });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          trip: {
            name: 'Kimi Seoul Trip',
            destinationSummary: 'Seoul',
            startDate: '2026-07-10',
            endDate: '2026-07-12',
            homeCurrency: 'HKD',
            currencies: ['HKD', 'KRW'],
            itinerary: [{
              date: '2026-07-10',
              day: 1,
              region: 'Seoul',
              city: 'Seoul',
              country: 'South Korea',
              timezone: 'Asia/Seoul',
              currency: 'KRW',
              highlight: 'Arrival',
              spots: [{ time: '18:00', name: 'Hongdae', type: 'sightseeing' }],
            }],
          },
          summary: 'Kimi parsed trip update',
          warnings: [],
          changes: ['Detected new Seoul trip.'],
        },
      }),
    });
  });

  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'ai-routing-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'scan',
      receipts: [],
      scanModel: 'kimi/kimi-code',
      voiceModel: 'kimi/kimi-code',
      emailModel: 'google/gemini-3.1-flash',
      tripUpdateModel: 'google/gemini-3.1-flash',
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  const nav = page.getByLabel('主要分頁');
  await nav.getByRole('button', { name: '記帳', exact: true }).click();
  await expect(page.getByText('掃描收據')).toBeVisible();

  await page.locator('#scan-gallery-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByText('編輯紀錄')).toBeVisible();
  await expect(page.getByLabel('店名 / 項目')).toHaveValue('Gemma Scan Mart');
  await page.getByRole('button', { name: '取消' }).click();

  await page.getByRole('button', { name: '語音' }).click();
  await page.getByPlaceholder('例：喺全家買飯糰同飲品 580 yen，用 Suica').fill('2026-05-08 喺 Voice Cafe 1234 yen，用 Suica，09:30');
  await page.getByRole('button', { name: '解析' }).click();
  await expect(page.getByText('編輯紀錄')).toBeVisible();
  await expect(page.getByLabel('店名 / 項目')).toHaveValue('Gemma Voice Cafe');
  await page.getByRole('button', { name: '取消' }).click();

  await page.getByRole('button', { name: 'Email' }).click();
  await page.getByPlaceholder('貼 booking confirmation / email 文字').fill('2026-05-08 at Email Lunch 888 yen booking REF55555');
  await page.getByRole('button', { name: '解析文字' }).click();
  await expect(page.getByRole('heading', { name: 'Batch Confirm' })).toBeVisible();
  await page.getByRole('button', { name: /全部儲存/ }).click();
  await expect(page.getByText('已儲存 1 筆 email 待確認紀錄。')).toBeVisible();

  await nav.getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.getByText('設定控制中心')).toBeVisible();
  const tripUpdate = page.getByRole('button', { name: /AI 行程更新/ });
  if ((await tripUpdate.getAttribute('aria-expanded')) !== 'true') await tripUpdate.click();
  await page.getByPlaceholder(/下次/).fill('下次 2026-07-10 至 2026-07-12 去首爾，第一晚住弘大。');
  await page.getByRole('button', { name: /用已選模型分析/ }).click();
  const tripConfirm = page.getByRole('dialog', { name: '確認 AI 行程更新' });
  await expect(tripConfirm).toBeVisible();
  await expect(tripConfirm.getByRole('heading', { name: 'Google Seoul Trip' })).toBeVisible();
  await expect(tripConfirm).toContainText('Google BBQ');

  expect(calls).toEqual(expect.arrayContaining([
    expect.objectContaining({ provider: 'google', kind: 'scan', model: 'gemma-4-31b-it' }),
    expect.objectContaining({ provider: 'google', kind: 'voice', model: 'gemma-4-31b-it' }),
    expect.objectContaining({ provider: 'kimi', kind: 'email', model: 'kimi-code' }),
    expect.objectContaining({ provider: 'google', kind: 'trip', model: 'gemini-3.1-flash' }),
  ]));
  expect(calls.some((call) => call.kind === 'scan' && call.provider === 'kimi')).toBe(false);
  expect(calls.some((call) => call.kind === 'voice' && call.provider === 'kimi')).toBe(false);
  expect(calls.some((call) => call.kind === 'email' && call.provider === 'google')).toBe(false);
  expect(calls.some((call) => call.kind === 'trip' && call.provider === 'kimi')).toBe(false);
});

test('selected Volcano Scan model uses the Volcano broker route without fallback', async ({ page }) => {
  test.skip(process.env.SUPABASE_AI_SMOKE === '1', 'Run this broker-session smoke without Supabase env.');
  const calls = [];
  const appOrigin = process.env.COMPACT_TEST_ORIGIN || 'http://localhost:8903';
  await page.route('**/*/json', async (route) => {
    const body = route.request().postDataJSON();
    calls.push({ url: route.request().url(), kind: body.kind, model: body.model });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, data: { store: 'Volcano Scan Mart', total: 88, date: '2026-05-08', category: 'food', payment: 'cash' } }),
    });
  });
  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({ credentialSession: 'volcano-routing-session', credentialSessionExpiresAt: Date.now() + 60_000 }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({ receipts: [], lastTab: 'scan', scanModel: 'volcano/doubao-seed-2.0-pro' }));
  });

  await page.goto(`${appOrigin}/travel-expense/compact/#scan`);
  await page.locator('#scan-gallery-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64'),
  });
  await expect(page.getByLabel('店名 / 項目')).toHaveValue('Volcano Scan Mart');
  expect(calls).toEqual([{
    url: 'https://travel-expense-credential-broker.ftjdfr.workers.dev/volcano/json',
    kind: 'scan',
    model: 'doubao-seed-2.0-pro',
  }]);
});

test('Trip update does not treat the current itinerary as a successful extraction', async ({ page }) => {
  test.skip(process.env.SUPABASE_AI_SMOKE === '1', 'Run this broker-session smoke without Supabase env.');
  const calls = [];

  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));

  await page.route('**/google/json', async (route) => {
    const body = route.request().postDataJSON();
    calls.push({ provider: 'google', kind: body.kind, model: body.model });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          trip: {
            name: 'Empty Google Trip',
            destinationSummary: 'Jeju Korea',
            startDate: '2026-08-01',
            endDate: '2026-08-03',
            homeCurrency: 'HKD',
            currencies: ['HKD', 'KRW'],
            itinerary: [],
          },
          extractionReport: {
            daysExtracted: 0,
            spotsExtracted: 0,
            hotelsExtracted: 0,
            restaurantsExtracted: 0,
            transportsExtracted: 0,
            importantDetailsExtracted: 0,
            sourceQuality: 'low',
            missingCriticalFields: ['itinerary days', 'itinerary spots'],
            assumptions: [],
            warnings: ['No itinerary extracted from primary model.'],
          },
          summary: 'Primary returned no usable itinerary.',
          warnings: ['No itinerary extracted.'],
          changes: [],
        },
      }),
    });
  });

  await page.route('**/mimo/json', async (route) => {
    const body = route.request().postDataJSON();
    calls.push({ provider: 'mimo', kind: body.kind, model: body.model });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          trip: {
            name: 'Mimo Jeju Trip',
            destinationSummary: 'Jeju, South Korea',
            startDate: '2026-08-01',
            endDate: '2026-08-03',
            homeCurrency: 'HKD',
            currencies: ['HKD', 'KRW'],
            itinerary: [{
              date: '2026-08-01',
              day: 1,
              region: 'Jeju City',
              city: 'Jeju',
              country: 'South Korea',
              timezone: 'Asia/Seoul',
              currency: 'KRW',
              highlight: 'Arrival and market dinner',
              lodging: { name: 'Jeju Harbor Hotel', address: 'Jeju-si', confidence: 'medium' },
              spots: [
                { time: '15:00', name: 'Jeju International Airport', type: 'transport', timezone: 'Asia/Seoul', sourceText: 'arrive Jeju 15:00', confidence: 'high' },
                { time: '19:00', name: 'Dongmun Market', type: 'food', timezone: 'Asia/Seoul', sourceText: 'market dinner', confidence: 'high' },
              ],
            }],
          },
          extractionReport: {
            daysExtracted: 1,
            spotsExtracted: 2,
            hotelsExtracted: 1,
            restaurantsExtracted: 1,
            transportsExtracted: 1,
            importantDetailsExtracted: 3,
            sourceQuality: 'high',
            missingCriticalFields: ['Dongmun Market lat/lon'],
            assumptions: ['Jeju market dinner means Dongmun Market.'],
            warnings: [],
          },
          summary: 'Fallback extracted Jeju itinerary.',
          warnings: [],
          changes: ['Used fallback model after empty primary result.'],
        },
      }),
    });
  });

  await page.route('**/kimi/json', async (route) => {
    const body = route.request().postDataJSON();
    calls.push({ provider: 'kimi', kind: body.kind, model: body.model });
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'unexpected kimi call' }) });
  });

  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'ai-routing-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'settings',
      tripUpdateModel: 'google/gemini-3.1-flash',
      activeTripId: 'trip_old',
      tripName: 'Old Current Trip',
      tripDateRange: { start: '2026-04-20', end: '2026-04-21' },
      customItinerary: [{ date: '2026-04-20', day: 1, region: 'Old Region', spots: [{ time: '10:00', name: 'Old Current Spot', type: 'sightseeing' }] }],
      trips: [{
        id: 'trip_old',
        name: 'Old Current Trip',
        destinationSummary: 'Old Region',
        startDate: '2026-04-20',
        endDate: '2026-04-21',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'JPY'],
        timezones: ['Asia/Tokyo'],
        version: 1,
        active: true,
        itinerary: [{ date: '2026-04-20', day: 1, region: 'Old Region', spots: [{ time: '10:00', name: 'Old Current Spot', type: 'sightseeing' }] }],
        createdAt: 1,
        updatedAt: 1,
      }],
      receipts: [],
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.getByText('設定控制中心')).toBeVisible();
  const tripUpdate = page.getByRole('button', { name: /AI 行程更新/ });
  if ((await tripUpdate.getAttribute('aria-expanded')) !== 'true') await tripUpdate.click();
  await page.getByPlaceholder(/下次/).fill('2026-08-01 to 2026-08-03 Jeju, arrive 15:00, dinner at market, stay near harbor.');
  await page.getByRole('button', { name: /用已選模型分析/ }).click();
  const tripConfirm = page.getByRole('dialog', { name: '確認 AI 行程更新' });
  await expect(tripConfirm).toBeVisible();
  await expect(tripConfirm.getByRole('heading', { name: 'Mimo Jeju Trip' })).toBeVisible();
  await expect(tripConfirm).toContainText('Dongmun Market');
  await expect(tripConfirm).toContainText('未確認：Dongmun Market lat/lon');
  await expect(page.getByText('Old Current Spot')).toHaveCount(0);
  expect(calls).toEqual(expect.arrayContaining([
    expect.objectContaining({ provider: 'google', kind: 'trip', model: 'gemini-3.1-flash' }),
    expect.objectContaining({ provider: 'mimo', kind: 'trip', model: 'mimo-v2.5' }),
  ]));
});

test('Trip update skips a slow selected model and opens confirmation with a fast fallback', async ({ page }) => {
  test.skip(process.env.SUPABASE_AI_SMOKE === '1', 'Run this broker-session smoke without Supabase env.');
  const calls = [];

  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));

  await page.route('**/mimo/json', async (route) => {
    const body = route.request().postDataJSON();
    calls.push({ provider: 'mimo', kind: body.kind, model: body.model });
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          trip: {
            name: 'Slow Mimo Jeju Trip',
            destinationSummary: 'Jeju',
            startDate: '2026-06-13',
            endDate: '2026-06-14',
            homeCurrency: 'HKD',
            currencies: ['HKD', 'KRW'],
            itinerary: [{
              date: '2026-06-13',
              day: 1,
              region: 'Jeju',
              spots: [{ time: '10:00', name: 'Slow Mimo Spot', type: 'sightseeing' }],
            }],
          },
        },
      }),
    });
  });

  await page.route('**/google/json', async (route) => {
    const body = route.request().postDataJSON();
    calls.push({ provider: 'google', kind: body.kind, model: body.model });
    const prompt = String(body.prompt || '');
    expect(prompt).toContain('organizedItinerary');
    // Google models now use single-stage extraction (no organize stage)
    expect(prompt).toContain('You must use only CANONICAL ORGANIZED ITINERARY');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          organizedItinerary: [
            'Canonical itinerary: Fast Google Jeju Trip',
            'Day 1 2026-06-13 | Stay: Hotel Fine Jeju',
            '- 06:30 濟州機場',
            '- 14:00 Fast Google Osulloc',
          ].join('\n'),
          trip: {
            name: 'Fast Google Jeju Trip',
            destinationSummary: 'Jeju, South Korea',
            startDate: '2026-06-13',
            endDate: '2026-06-14',
            homeCurrency: 'HKD',
            currencies: ['HKD', 'KRW'],
            intelligence: {
              countryCode: 'KR',
              countryName: 'South Korea',
              primaryCurrency: 'KRW',
              timezone: 'Asia/Seoul',
              weatherRegion: 'Jeju',
              confidence: 'high',
            },
            itinerary: [{
              date: '2026-06-13',
              day: 1,
              region: 'Jeju West',
              city: 'Jeju',
              country: 'South Korea',
              timezone: 'Asia/Seoul',
              currency: 'KRW',
              spots: [
                { time: '06:30', name: '濟州機場', type: 'transport' },
                { time: '14:00', name: 'Fast Google Osulloc', type: 'sightseeing' },
              ],
            }],
          },
          extractionReport: {
            daysExtracted: 1,
            spotsExtracted: 2,
            hotelsExtracted: 0,
            restaurantsExtracted: 0,
            transportsExtracted: 1,
            importantDetailsExtracted: 2,
            sourceQuality: 'high',
            missingCriticalFields: ['Fast Google Osulloc lat/lon'],
            assumptions: ['Used fast fallback after selected model timeout.'],
            warnings: [],
          },
          summary: 'Fast fallback extracted Jeju itinerary.',
          warnings: [],
          changes: ['Skipped slow selected model after timeout.'],
        },
      }),
    });
  });

  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    window.__TRAVEL_TRIP_ATTEMPT_TIMEOUT_MS = 150;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'slow-selected-trip-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'settings',
      tripUpdateModel: 'mimo/mimo-v2.5-pro',
      activeTripId: 'trip_current',
      tripName: 'Current Trip',
      tripDateRange: { start: '2026-06-13', end: '2026-06-14' },
      tripCurrency: 'KRW',
      trips: [{
        id: 'trip_current',
        name: 'Current Trip',
        destinationSummary: 'Jeju',
        startDate: '2026-06-13',
        endDate: '2026-06-14',
        homeCurrency: 'HKD',
        currencies: ['HKD', 'KRW'],
        timezones: ['Asia/Seoul'],
        version: 1,
        active: true,
        itinerary: [],
        createdAt: 1,
        updatedAt: 1,
      }],
      customItinerary: [],
      receipts: [],
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/');
  await expect(page.getByText('設定控制中心')).toBeVisible();
  const tripUpdate = page.getByRole('button', { name: /AI 行程更新/ });
  if ((await tripUpdate.getAttribute('aria-expanded')) !== 'true') await tripUpdate.click();
  await page.getByPlaceholder(/下次/).fill('Day 1｜6月13日｜到步＋西線入住｜住 Hotel Fine Jeju\n06:30 抵達濟州機場\n14:00 Osulloc Tea Museum');
  await page.getByRole('button', { name: /用已選模型分析/ }).click();

  const tripConfirm = page.getByRole('dialog', { name: '確認 AI 行程更新' });
  await expect(tripConfirm).toBeVisible();
  await expect(tripConfirm.getByRole('heading', { name: 'Fast Google Jeju Trip' })).toBeVisible();
  await expect(tripConfirm).toContainText('AI 重整行程');
  await expect(tripConfirm).toContainText('Fast Google Osulloc');
  await expect(tripConfirm).not.toContainText('Slow Mimo Spot');

  expect(calls.slice(0, 2)).toEqual([
    expect.objectContaining({ provider: 'mimo', kind: 'trip', model: 'mimo-v2.5-pro' }),
    expect.objectContaining({ provider: 'google', kind: 'trip', model: 'gemini-3.1-flash-lite' }),
  ]);
});

test('AI routing stops provider fallback when broker quota is exceeded', async ({ page }) => {
  test.skip(process.env.SUPABASE_AI_SMOKE === '1', 'Run this broker-session smoke without Supabase env.');
  const calls = [];

  await page.route('**/secrets.local.js', async (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    body: 'window.DEV_SECRETS = {};',
  }));

  await page.route('**/google/json', async (route) => {
    const body = route.request().postDataJSON();
    calls.push({ provider: 'google', kind: body.kind, model: body.model });
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: false,
        error: 'Supabase AI daily quota exceeded',
      }),
    });
  });

  await page.route('**/kimi/json', async (route) => {
    const body = route.request().postDataJSON();
    calls.push({ provider: 'kimi', kind: body.kind, model: body.model });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: {
          store: 'Unexpected Kimi Fallback',
          total: 999,
          date: '2026-05-08',
          category: 'food',
          payment: 'cash',
        },
      }),
    });
  });

  await page.addInitScript(() => {
    window.__disable_supabase_configured = true;
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('boss-japan-tracker:credential-session:v1', JSON.stringify({
      credentialSession: 'quota-smoke-session',
      credentialSessionExpiresAt: Date.now() + 60_000,
    }));
    localStorage.setItem('boss-japan-tracker', JSON.stringify({
      lastTab: 'scan',
      receipts: [],
      scanModel: 'kimi/kimi-code',
    }));
  });

  await page.goto('http://localhost:8903/travel-expense/compact/#scan');
  await expect(page.getByText('掃描收據')).toBeVisible();

  await page.locator('#scan-gallery-input').setInputFiles({
    name: 'quota-receipt.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByText('編輯紀錄')).toBeVisible();
  await expect(page.getByLabel('店名 / 項目')).toHaveValue('quota-receipt');
  await expect(page.getByLabel('備註')).toHaveValue(/Supabase AI daily quota exceeded/);

  expect(calls).toEqual([
    expect.objectContaining({ provider: 'google', kind: 'scan', model: 'gemma-4-31b-it' }),
  ]);
});

test('Supabase users can call required AI primaries without a broker password session', async ({ page }) => {
  test.skip(process.env.SUPABASE_AI_SMOKE !== '1', 'Set SUPABASE_AI_SMOKE=1 and start Vite with fake Supabase env.');
  const userId = '99999999-9999-4999-8999-999999999999';
  const session = {
    access_token: 'test-ai-access-token',
    refresh_token: 'test-ai-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'ai-public@example.com',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { email: 'ai-public@example.com' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
  const calls = [];

  await page.route('https://test-travel-expense.supabase.co/auth/v1/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: session.user }) });
  });

  await page.route('https://test-travel-expense.supabase.co/rest/v1/**', async (route) => {
    const table = new URL(route.request().url()).pathname.split('/').pop();
    const method = route.request().method();
    if (table === 'profiles' && method === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ id: userId }]) });
      return;
    }
    if (table === 'profiles' && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ app_settings: {} }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.route('**/google/json', async (route) => {
    const body = route.request().postDataJSON();
    calls.push({
      provider: 'google',
      kind: body.kind,
      model: body.model,
      supabaseAuth: route.request().headers()['x-supabase-auth'] || '',
      brokerSession: route.request().headers()['x-travel-session'] || '',
    });
    const data = body.kind === 'trip'
      ? {
          trip: {
            name: 'Supabase Google Seoul',
            destinationSummary: 'Seoul public trip',
            startDate: '2026-07-10',
            endDate: '2026-07-12',
            homeCurrency: 'HKD',
            currencies: ['HKD', 'KRW'],
            itinerary: [{
              date: '2026-07-10',
              day: 1,
              region: 'Seoul',
              city: 'Seoul',
              country: 'South Korea',
              timezone: 'Asia/Seoul',
              currency: 'KRW',
              highlight: 'Arrival',
              lodging: { name: 'Supabase Google Hotel' },
              spots: [
                { time: '18:00', name: 'Hongdae', type: 'sightseeing' },
                { time: '19:30', name: 'Supabase Google BBQ', type: 'food' },
              ],
            }],
          },
          summary: 'Google parsed public Supabase trip update',
          warnings: [],
          changes: ['Detected new Seoul public trip.'],
        }
      : body.kind === 'voice'
      ? [{
          store: 'Supabase Gemma Voice',
          total: 4321,
          date: '2026-05-08',
          category: 'food',
          payment: 'suica',
        }]
      : {
          store: 'Supabase Gemma Scan',
          total: 1234,
          date: '2026-05-08',
          category: 'food',
          payment: 'suica',
        };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data,
      }),
    });
  });

  await page.route('**/kimi/json', async (route) => {
    const body = route.request().postDataJSON();
    calls.push({
      provider: 'kimi',
      kind: body.kind,
      model: body.model,
      supabaseAuth: route.request().headers()['x-supabase-auth'] || '',
      brokerSession: route.request().headers()['x-travel-session'] || '',
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        data: body.kind === 'trip'
          ? {
              trip: {
                name: 'Supabase Kimi Seoul',
                destinationSummary: 'Seoul public trip',
                startDate: '2026-07-10',
                endDate: '2026-07-12',
                homeCurrency: 'HKD',
                currencies: ['HKD', 'KRW'],
                itinerary: [{
                  date: '2026-07-10',
                  day: 1,
                  region: 'Seoul',
                  city: 'Seoul',
                  country: 'South Korea',
                  timezone: 'Asia/Seoul',
                  currency: 'KRW',
                  highlight: 'Arrival',
                  spots: [{ time: '18:00', name: 'Hongdae', type: 'sightseeing' }],
                }],
              },
              summary: 'Kimi parsed public Supabase trip update',
              warnings: [],
              changes: ['Detected new Seoul public trip.'],
            }
          : [{
              store: 'Supabase Kimi Email',
              total: 888,
              date: '2026-05-08',
              category: 'food',
              payment: 'credit',
            }],
      }),
    });
  });

  await page.addInitScript(({ userId, session }) => {
    localStorage.clear();
    localStorage.setItem('travel-expense-react:device-trust:v1', JSON.stringify({ ok: true, exp: Date.now() + 31_536_000_000 }));
    localStorage.setItem('travel-expense:supabase-auth:v1', JSON.stringify(session));
    localStorage.setItem(`boss-japan-tracker:state:supabase:${userId}`, JSON.stringify({
      lastTab: 'scan',
      receipts: [],
      syncQueue: [],
      scanModel: 'kimi/kimi-code',
      voiceModel: 'kimi/kimi-code',
      emailModel: 'google/gemini-3.1-flash',
      tripUpdateModel: 'google/gemini-3.1-flash',
    }));
  }, { userId, session });

  await page.goto('http://localhost:8903/travel-expense/compact/#scan');
  const nav = page.getByLabel('主要分頁');
  await expect(page.getByText('掃描收據')).toBeVisible();

  await page.locator('#scan-gallery-input').setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(page.getByText('編輯紀錄')).toBeVisible();
  await expect(page.getByLabel('店名 / 項目')).toHaveValue('Supabase Gemma Scan');
  await page.getByRole('button', { name: '取消' }).click();

  await page.getByRole('button', { name: '語音' }).click();
  await page.getByPlaceholder('例：喺全家買飯糰同飲品 580 yen，用 Suica').fill('2026-05-08 喺 Supabase Voice 4321 yen，用 Suica');
  await page.getByRole('button', { name: '解析' }).click();
  await expect(page.getByText('編輯紀錄')).toBeVisible();
  await expect(page.getByLabel('店名 / 項目')).toHaveValue('Supabase Gemma Voice');
  await page.getByRole('button', { name: '取消' }).click();

  await page.getByRole('button', { name: 'Email' }).click();
  await page.getByPlaceholder('貼 booking confirmation / email 文字').fill('2026-05-08 at Supabase Email 888 yen');
  await page.getByRole('button', { name: '解析文字' }).click();
  await expect(page.getByRole('heading', { name: 'Batch Confirm' })).toBeVisible();
  await page.getByRole('button', { name: /全部儲存/ }).click();
  await expect(page.getByText('已儲存 1 筆 email 待確認紀錄。')).toBeVisible();

  await nav.getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.getByText('設定控制中心')).toBeVisible();
  const tripUpdate = page.getByRole('button', { name: /AI 行程更新/ });
  if ((await tripUpdate.getAttribute('aria-expanded')) !== 'true') await tripUpdate.click();
  await page.getByPlaceholder(/下次/).fill('下次 2026-07-10 至 2026-07-12 去首爾。');
  await page.getByRole('button', { name: /用已選模型分析/ }).click();
  const tripConfirm = page.getByRole('dialog', { name: '確認 AI 行程更新' });
  await expect(tripConfirm).toBeVisible();
  await expect(tripConfirm.getByRole('heading', { name: 'Supabase Google Seoul' })).toBeVisible();
  await expect(tripConfirm).toContainText('Supabase Google BBQ');

  expect(calls).toEqual(expect.arrayContaining([
    expect.objectContaining({
      provider: 'google',
      kind: 'scan',
      model: 'gemma-4-31b-it',
      supabaseAuth: 'Bearer test-ai-access-token',
      brokerSession: '',
    }),
    expect.objectContaining({
      provider: 'google',
      kind: 'voice',
      model: 'gemma-4-31b-it',
      supabaseAuth: 'Bearer test-ai-access-token',
      brokerSession: '',
    }),
    expect.objectContaining({
      provider: 'kimi',
      kind: 'email',
      model: 'kimi-code',
      supabaseAuth: 'Bearer test-ai-access-token',
      brokerSession: '',
    }),
    expect.objectContaining({
      provider: 'google',
      kind: 'trip',
      model: 'gemini-3.1-flash',
      supabaseAuth: 'Bearer test-ai-access-token',
      brokerSession: '',
    }),
  ]));
  expect(calls.some((call) => call.kind === 'scan' && call.provider === 'kimi')).toBe(false);
  expect(calls.some((call) => call.kind === 'voice' && call.provider === 'kimi')).toBe(false);
  expect(calls.some((call) => call.kind === 'email' && call.provider === 'google')).toBe(false);
  expect(calls.some((call) => call.kind === 'trip' && call.provider === 'kimi')).toBe(false);
});
