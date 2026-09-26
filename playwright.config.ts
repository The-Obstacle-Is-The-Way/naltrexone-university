import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

// Prefer `.env.local` for developer-specific secrets, with `.env` as a fallback.
// Never override explicitly provided environment variables.
config({ path: '.env.local', override: false, quiet: true });
config({ path: '.env', override: false, quiet: true });

const baseURL = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Product and cleanup failures must fail the run on their first attempt.
  retries: 0,
  // All authenticated E2E tests share a single test user, so concurrent workers
  // cause session and bookmark state conflicts. Use 1 worker to run sequentially.
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL,
    trace: process.env.CI ? 'off' : 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      // Bounded bootstrap recovery only; this retries preflight, seed/reset,
      // and auth together, not just provider-availability failures.
      retries: process.env.CI ? 2 : 1,
      teardown: 'cleanup',
      testMatch: /global\.setup\.ts/,
    },
    {
      name: 'cleanup',
      testMatch: /global-teardown\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testMatch: /.*\.spec\.ts/,
      testIgnore: [
        /global\.setup\.ts/,
        /stripe-hosted-.*\.spec\.ts/,
        /mobile-layout\.spec\.ts/,
      ],
    },
    {
      // DEBT-468: re-runs the @mobile-smoke journeys, plus the layout probe,
      // at the 375×667 width QA-002 checks by hand.
      name: 'mobile-smoke',
      use: { ...devices['Pixel 5'], viewport: { width: 375, height: 667 } },
      dependencies: ['setup'],
      grep: /@mobile-smoke/,
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
    // Trial add-card signs its Checkout consent state. Production and preview
    // carry their own CONSENT_STATE_SECRET; the isolated E2E server gets a
    // test-only one unless the environment supplies it.
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      ),
      CONSENT_STATE_SECRET:
        process.env.CONSENT_STATE_SECRET ??
        'e2e-only-consent-state-secret-not-for-production',
    },
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
