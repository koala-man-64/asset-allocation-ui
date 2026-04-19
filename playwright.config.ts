import { defineConfig } from '@playwright/test';

const previewPort = 4173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${previewPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    browserName: 'chromium'
  },
  webServer: {
    command: `node ./scripts/e2e-preview-server.mjs --port ${previewPort}`,
    url: `http://127.0.0.1:${previewPort}`,
    reuseExistingServer: false,
    timeout: 120000
  }
});
