const { test, expect } = require('@playwright/test');

const focusGuidance = 'Passkey 需要此 Chrome 分頁或視窗有焦點。請返回後再試一次。';

function errorEnvelope(code, message) {
  return {
    ok: false,
    data: null,
    error: { code, message, retryable: false },
    meta: { requestId: '97000000-0000-4000-8000-000000000001', generatedAt: new Date().toISOString(), warnings: [] },
  };
}

const LOGIN_CTA = '使用通行片語與 Passkey 登入';

test('closed bootstrap enrollment shows recovery guidance without a secret field', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => true });
    document.cookie = '__Host-admin_csrf=synthetic-csrf; Path=/; Secure; SameSite=Strict';
  });
  await page.route('**/api/admin/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/admin/session') {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify(errorEnvelope('UNAUTHORIZED', 'No admin session')) });
      return;
    }
    if (pathname === '/api/admin/auth/begin') {
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify(errorEnvelope('PROTECTED_TARGET', 'Bootstrap enrollment is permanently closed')) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify(errorEnvelope('NOT_FOUND', 'Synthetic route missing')) });
  });
  await page.goto('/login');
  await page.getByLabel('管理員通行片語').fill('synthetic boss passphrase');
  await page.getByRole('button', { name: LOGIN_CTA }).click();

  await expect(page.getByText('Bootstrap 登記已關閉')).toBeVisible();
  await expect(page.getByText(/break-glass runbook/)).toBeVisible();
  await expect(page.getByLabel('Bootstrap secret')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '返回登入' })).toBeVisible();
});

test('normal passkey login translates Chrome focus errors into actionable Traditional Chinese guidance', async ({ page }) => {
  let loginBegins = 0;
  await page.addInitScript(() => {
    document.cookie = '__Host-admin_csrf=synthetic-csrf; Path=/; Secure; SameSite=Strict';
    Object.defineProperty(navigator.credentials, 'get', {
      configurable: true,
      value: () => {
        document.documentElement.dataset.authenticationCalled = 'true';
        return Promise.reject(new DOMException(
          'The operation is not allowed at this time because the page does not have focus.',
          'NotAllowedError',
        ));
      },
    });
  });
  await page.route('**/api/admin/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/admin/session') {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify(errorEnvelope('UNAUTHORIZED', 'No admin session')) });
      return;
    }
    if (pathname === '/api/admin/auth/begin') {
      loginBegins += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          data: { flowId: '97000000-0000-4000-8000-000000000001', options: { challenge: 'AQ', allowCredentials: [{ id: 'AQ', type: 'public-key' }] } },
          error: null,
          meta: { warnings: [] },
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify(errorEnvelope('NOT_FOUND', 'Synthetic route missing')) });
  });
  await page.goto('/login');
  await page.getByLabel('管理員通行片語').fill('synthetic boss passphrase');
  await page.getByRole('button', { name: LOGIN_CTA }).click();

  await expect(page.getByText(focusGuidance)).toBeVisible();
  expect(loginBegins).toBe(1);
  await expect.poll(() => page.locator('html').getAttribute('data-authentication-called')).toBe('true');
});

test('fresh login without a CSRF cookie still reaches the auth begin endpoint', async ({ page }) => {
  let loginBegins = 0;
  await page.route('**/api/admin/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/admin/session') {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify(errorEnvelope('UNAUTHORIZED', 'No admin session')) });
      return;
    }
    if (pathname === '/api/admin/auth/begin') {
      loginBegins += 1;
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify(errorEnvelope('UNAUTHORIZED', 'Synthetic passphrase rejected')) });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify(errorEnvelope('NOT_FOUND', 'Synthetic route missing')) });
  });
  await page.goto('/login');
  await page.getByLabel('管理員通行片語').fill('synthetic boss passphrase');
  await page.getByRole('button', { name: LOGIN_CTA }).click();

  await expect(page.getByText('Synthetic passphrase rejected')).toBeVisible();
  await expect(page.getByText('管理員 CSRF session 已失效')).toHaveCount(0);
  expect(loginBegins).toBe(1);
});
