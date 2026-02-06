import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

// Prefer `.env.local` for developer-specific secrets, with `.env` as a fallback.
// Never override explicitly provided environment variables.
config({ path: '.env.local' });
config({ path: '.env' });

const baseURL = process.env.NEXT_PUBLIC_APP_URL || 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testMatch: /.*\.spec\.ts/,
      testIgnore: /global\.setup\.ts/,
    },
  ],
  webServer: {
    command: process.env.CI ? 'pnpm start' : 'pnpm dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
