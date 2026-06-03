const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:8904/',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
