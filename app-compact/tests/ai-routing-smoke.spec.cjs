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
    const data = body.kind === 'scan'
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
  const tripUpdate = page.getByRole('button', { name: /行程更新卡片/ });
  if ((await tripUpdate.getAttribute('aria-expanded')) !== 'true') await tripUpdate.click();
  await page.getByPlaceholder(/下次/).fill('下次 2026-07-10 至 2026-07-12 去首爾，第一晚住弘大。');
  await page.getByRole('button', { name: /用 Kimi 分析/ }).click();
  await expect(page.getByRole('heading', { name: 'Kimi Seoul Trip' })).toBeVisible();

  expect(calls).toEqual(expect.arrayContaining([
    expect.objectContaining({ provider: 'google', kind: 'scan', model: 'gemma-4-31b' }),
    expect.objectContaining({ provider: 'google', kind: 'voice', model: 'gemma-4-31b' }),
    expect.objectContaining({ provider: 'kimi', kind: 'email', model: 'kimi-code' }),
    expect.objectContaining({ provider: 'kimi', kind: 'trip', model: 'kimi-code' }),
  ]));
  expect(calls.some((call) => call.kind === 'scan' && call.provider === 'kimi')).toBe(false);
  expect(calls.some((call) => call.kind === 'voice' && call.provider === 'kimi')).toBe(false);
  expect(calls.some((call) => call.kind === 'email' && call.provider === 'google')).toBe(false);
  expect(calls.some((call) => call.kind === 'trip' && call.provider === 'google')).toBe(false);
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
    expect.objectContaining({ provider: 'google', kind: 'scan', model: 'gemma-4-31b' }),
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
    const data = body.kind === 'voice'
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
  const tripUpdate = page.getByRole('button', { name: /行程更新卡片/ });
  if ((await tripUpdate.getAttribute('aria-expanded')) !== 'true') await tripUpdate.click();
  await page.getByPlaceholder(/下次/).fill('下次 2026-07-10 至 2026-07-12 去首爾。');
  await page.getByRole('button', { name: /用 Kimi 分析/ }).click();
  await expect(page.getByRole('heading', { name: 'Supabase Kimi Seoul' })).toBeVisible();

  expect(calls).toEqual(expect.arrayContaining([
    expect.objectContaining({
      provider: 'google',
      kind: 'scan',
      model: 'gemma-4-31b',
      supabaseAuth: 'Bearer test-ai-access-token',
      brokerSession: '',
    }),
    expect.objectContaining({
      provider: 'google',
      kind: 'voice',
      model: 'gemma-4-31b',
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
      provider: 'kimi',
      kind: 'trip',
      model: 'kimi-code',
      supabaseAuth: 'Bearer test-ai-access-token',
      brokerSession: '',
    }),
  ]));
  expect(calls.some((call) => call.kind === 'scan' && call.provider === 'kimi')).toBe(false);
  expect(calls.some((call) => call.kind === 'voice' && call.provider === 'kimi')).toBe(false);
  expect(calls.some((call) => call.kind === 'email' && call.provider === 'google')).toBe(false);
  expect(calls.some((call) => call.kind === 'trip' && call.provider === 'google')).toBe(false);
});
