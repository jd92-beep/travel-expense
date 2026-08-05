const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.cjs',
  use: {
    baseURL: 'http://127.0.0.1:8904',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8904/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
