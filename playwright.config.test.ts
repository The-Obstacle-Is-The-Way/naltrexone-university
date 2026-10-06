import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import config from './playwright.config';
import {
  CLERK_SESSION_DEADLINES,
  SETUP_PREPARATION_BUDGET_MS,
} from './tests/e2e/helpers/clerk-session-deadlines';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('playwright config', () => {
  it('runs a cleanup project after every project that depends on global setup', () => {
    const projects = config.projects ?? [];
    const setupProject = projects.find((project) => project.name === 'setup');
    const cleanupProject = projects.find(
      (project) => project.name === 'cleanup',
    );

    expect(setupProject?.teardown).toBe('cleanup');
    expect(cleanupProject?.testMatch).toEqual(/global-teardown\.ts/);
    expect(cleanupProject?.use?.storageState).toBeUndefined();
  });

  // BUG-328: a failed setup attempt signs out its session within its own
  // deadlines, so the setup test must outlast preparation plus both deadlines.
  it('gives global setup time to sign out after a failed sign-in', () => {
    const setup = config.projects?.find((project) => project.name === 'setup');

    expect(setup?.timeout).toBeGreaterThanOrEqual(
      SETUP_PREPARATION_BUDGET_MS +
        CLERK_SESSION_DEADLINES.signInMs +
        CLERK_SESSION_DEADLINES.signOutMs,
    );
  });

  // BUG-328: Playwright page waits have no timeout by default. Bounded waits
  // make a hung Clerk wait fail with its own error, well inside the deadlines.
  it('bounds page waits in global setup and teardown', () => {
    const testTimeout = config.timeout ?? 30_000;

    for (const name of ['setup', 'cleanup']) {
      const use = config.projects?.find(
        (project) => project.name === name,
      )?.use;

      for (const timeout of [use?.actionTimeout, use?.navigationTimeout]) {
        expect(timeout).toBeGreaterThan(0);
        expect(timeout).toBeLessThanOrEqual(testTimeout / 2);
      }
    }
  });

  it('defers cleanup auth-state loading until global teardown executes', () => {
    const source = readFileSync('playwright.config.ts', 'utf8');

    expect(source).not.toContain('E2E_CLERK_AUTH_STATE_PATH');
    expect(source).not.toContain("from './tests/e2e/helpers/clerk-auth';");
    expect(source).not.toContain(
      "storageState: 'test-results/.auth/e2e-user.json'",
    );
  });

  it('uses production server mode for e2e webServer', () => {
    const webServer = config.webServer;
    expect(webServer).toBeDefined();
    expect(Array.isArray(webServer)).toBe(false);

    if (!webServer || Array.isArray(webServer)) {
      throw new Error('Expected a single Playwright webServer config object.');
    }

    const expectedCommand = process.env.CI
      ? 'pnpm start'
      : 'pnpm build && pnpm start';
    expect(webServer.command).toBe(expectedCommand);
    expect(webServer.reuseExistingServer).toBe(false);
    expect(webServer.url).toContain('/api/health');
  });

  it('keeps one local bootstrap retry on setup instead of the global default', async () => {
    vi.stubEnv('CI', '');
    vi.resetModules();

    const localConfig = (await import('./playwright.config')).default;

    const setupProject = localConfig.projects?.find(
      (project) => project.name === 'setup',
    );
    expect(setupProject?.retries).toBe(1);
  });
});
