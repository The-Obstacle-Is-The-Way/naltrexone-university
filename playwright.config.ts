import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import { E2E_CLERK_AUTH_STATE_PATH } from './tests/e2e/helpers/clerk-auth';

// Prefer `.env.local` for developer-specific secrets, with `.env` as a fallback.
// Never override explicitly provided environment variables.
config({ path: '.env.local', override: false, quiet: true });
config({ path: '.env', override: false, quiet: true });

const baseURL = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Local retry is an ergonomics buffer now that reset failures surface causes.
  // It is not a substitute for diagnosable E2E reset errors.
  retries: process.env.CI ? 2 : 1,
  // All authenticated E2E tests share a single test user, so concurrent workers
  // cause session and bookmark state conflicts. Use 1 worker to run sequentially.
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      teardown: 'cleanup',
      testMatch: /global\.setup\.ts/,
    },
    {
      name: 'cleanup',
      testMatch: /global-teardown\.ts/,
      use: { storageState: E2E_CLERK_AUTH_STATE_PATH },
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testMatch: /.*\.spec\.ts/,
      testIgnore: [/global\.setup\.ts/, /stripe-hosted-.*\.spec\.ts/],
    },
    {
      name: 'stripe-hosted',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testMatch: /stripe-hosted-.*\.spec\.ts/,
    },
  ],
  webServer: {
    command: process.env.CI ? 'pnpm start' : 'pnpm build && pnpm start',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
