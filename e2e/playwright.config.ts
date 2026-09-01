import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config. The specs drive the already-running local stack — backend (:3000),
 * operator dashboard (:5173) and guest app (:3001) — rather than booting it here,
 * because the backend needs a migrated+seeded Postgres that the run instructions
 * (RUN_FULL_APP_COMMANDS.txt) already stand up. Override any base URL with an env
 * var in CI. Chromium only; add more projects if cross-browser matters.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});

export const URLS = {
  dashboard: process.env.DASHBOARD_URL || 'http://localhost:5173',
  guest: process.env.GUEST_URL || 'http://localhost:3001',
};
