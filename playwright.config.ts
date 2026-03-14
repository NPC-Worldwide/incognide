import { defineConfig } from '@playwright/test';

/**
 * Playwright E2E tests for incognide Electron app.
 *
 * These tests launch the actual Electron app and simulate real user interactions.
 * Run with: npm run test:e2e
 * Run headed: npm run test:e2e:headed
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  retries: 1,
  workers: 1, // Electron tests must run serially
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.e2e.ts',
    },
  ],
});
