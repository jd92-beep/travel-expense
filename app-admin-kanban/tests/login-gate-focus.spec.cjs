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

async function openEnrollment(page, focused) {
  let enrollmentBegins = 0;
  await page.addInitScript(focused => {
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => focused });
  }, focused);
  await page.route('**/api/admin/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/admin/session') {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify(errorEnvelope('UNAUTHORIZED', 'No admin session')) });
      return;
    }
    if (pathname === '/api/admin/auth/begin') {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify(errorEnvelope('MFA_REQUIRED', 'Passkey enrollment required')) });
      return;
    }
    if (pathname === '/api/admin/passkeys/enroll/begin') {
      enrollmentBegins += 1;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify(errorEnvelope('UPSTREAM_UNAVAILABLE', 'Enrollment should not begin without focus')),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify(errorEnvelope('NOT_FOUND', 'Synthetic route missing')) });
  });
  await page.goto('/login');
  await page.getByLabel('管理員通行片語').fill('synthetic boss passphrase');
  await page.getByRole('button', { name: '使用 Passkey 登入' }).click();
  await page.getByLabel('Bootstrap secret').fill('synthetic bootstrap secret');
  return () => enrollmentBegins;
}

test('passkey enrollment stops before the API when the login document lacks focus', async ({ page }) => {
  const enrollmentBegins = await openEnrollment(page, false);

  await page.getByRole('button', { name: '登記 Boss Passkey' }).click();

  await expect(page.getByText(focusGuidance)).toBeVisible();
  expect(enrollmentBegins()).toBe(0);
});

test('normal passkey login translates Chrome focus errors into actionable Traditional Chinese guidance', async ({ page }) => {
  let loginBegins = 0;
  await page.addInitScript(() => {
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
  await page.getByRole('button', { name: '使用 Passkey 登入' }).click();

  await expect(page.getByText(focusGuidance)).toBeVisible();
  expect(loginBegins).toBe(1);
  await expect.poll(() => page.locator('html').getAttribute('data-authentication-called')).toBe('true');
});
