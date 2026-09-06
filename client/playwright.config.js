import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * `webServer` starts the client for the run, and the API is expected on 4000 —
 * with no MONGODB_URI the server boots its own in-memory MongoDB, so CI needs
 * no database service for this to work.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // A test that only passes on the third attempt is a test that is telling you
  // something; retries are for CI's flakier machines, not for local work.
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  expect: { timeout: 7_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
